import 'dart:math';
import 'dart:typed_data';

const _speakerSize = 192;
const _styleTokens = 50;
const _styleSize = 256;
const _latentChannels = 144;
const _framesPerSecond = 15.625;
const _minFrames = 2;
const _maxSecondsPerChunk = 15.0;
const _guidance = 3.0;
const _bos = 1;
const _eos = 2;

const _silenceThreshold = 0.0056234; // -45 dB
const _windowSeconds = 0.01;
const _keptSilenceSeconds = 0.04;
const _fadeSeconds = 0.015;

/// How one sentence is drawn: more steps read cleaner, fewer read faster.
/// [sway] bends the steps toward the start, which is what makes few steps work.
class NanoQuality {
  const NanoQuality({required this.steps, required this.sway});

  final int steps;
  final double sway;
}

/// What a voice brings to the model: its speaker embedding and style tokens.
class NanoVoice {
  NanoVoice._(this.speaker, this.style);

  /// A voice asset: little-endian float32, the speaker then the style tokens.
  factory NanoVoice.fromBytes(ByteData bytes) {
    const floats = _speakerSize + _styleTokens * _styleSize;
    if (bytes.lengthInBytes != floats * Float32List.bytesPerElement) {
      throw const FormatException('voice asset size');
    }
    // Asset bytes may be unaligned for float32, so copy before viewing.
    final values = Float32List(floats);
    for (var i = 0; i < floats; i++) {
      values[i] = bytes.getFloat32(i * 4, Endian.little);
    }
    return NanoVoice._(
      Float32List.sublistView(values, 0, _speakerSize),
      Float32List.sublistView(values, _speakerSize),
    );
  }

  final Float32List speaker;
  final Float32List style;
}

/// A text and voice bound to the model, kept for every step of a sentence.
abstract interface class NanoConditioning {
  Future<double> logSeconds();

  /// The flow at time [t] for a latent of [frames] frames.
  Future<Float32List> velocity(Float32List latent, int frames, double t);
  Future<void> dispose();
}

/// The model's graphs. Tests replay recorded answers here.
abstract interface class NanoGraphs {
  Future<NanoConditioning> condition(Int64List ids, NanoVoice voice);
  Future<Float32List> decode(Float32List latent, int frames);
}

/// The token ids guidance compares a sentence against: no text at all.
Int64List get unconditionalIds => Int64List.fromList([_bos, _eos]);

/// Token ids for the model: each known phoneme between the two boundary tokens.
Int64List encodePhonemes(String phonemes, Map<String, int> vocab) {
  final ids = [
    for (final rune in phonemes.runes) ?vocab[String.fromCharCode(rune)],
  ];
  return Int64List.fromList([_bos, ...ids, _eos]);
}

/// Times of the Euler steps, from 0 to 1, bent by the quality's sway.
List<double> flowTimes(NanoQuality quality) => [
  for (var i = 0; i <= quality.steps; i++)
    () {
      final u = i / quality.steps;
      return u + quality.sway * (cos(pi / 2 * u) - 1 + u);
    }(),
];

/// Draws one chunk of speech, guided away from the [unconditional] pass.
/// [noise] fills the starting latent; tests pass recorded noise.
Future<Float32List> sampleSpeech({
  required NanoGraphs graphs,
  required NanoConditioning conditioning,
  required NanoConditioning unconditional,
  required NanoQuality quality,
  required Float32List Function(int length) noise,
}) async {
  final logSeconds = await conditioning.logSeconds();
  final seconds = min(exp(logSeconds), _maxSecondsPerChunk);
  final frames = max(_minFrames, (seconds * _framesPerSecond).round());
  final latent = noise(_latentChannels * frames);
  final times = flowTimes(quality);
  for (var step = 0; step < quality.steps; step++) {
    final t = times[step];
    final guided = await conditioning.velocity(latent, frames, t);
    final free = await unconditional.velocity(latent, frames, t);
    final width = times[step + 1] - t;
    for (var i = 0; i < latent.length; i++) {
      final flow = free[i] + _guidance * (guided[i] - free[i]);
      latent[i] += width * flow;
    }
  }
  final samples = await graphs.decode(latent, frames);
  for (var i = 0; i < samples.length; i++) {
    samples[i] = samples[i].clamp(-1.0, 1.0);
  }
  return trimAndFade(samples, 24000);
}

/// Cuts the silence the model leaves at both ends and fades the edges, so
/// joined chunks do not click.
Float32List trimAndFade(Float32List samples, int sampleRate) {
  if (samples.isEmpty) return samples;
  final window = max(1, (_windowSeconds * sampleRate).toInt());
  final windows = samples.length ~/ window;
  bool loud(int index) {
    var sum = 0.0;
    for (var i = index * window; i < (index + 1) * window; i++) {
      sum += samples[i].abs();
    }
    return sum / window > _silenceThreshold;
  }

  var first = 0;
  while (first < windows && !loud(first)) {
    first++;
  }
  var lead = samples.length;
  var tail = 0;
  if (first < windows) {
    var last = windows - 1;
    while (!loud(last)) {
      last--;
    }
    lead = first * window;
    tail = samples.length - (last + 1) * window;
  }
  final keep = (_keptSilenceSeconds * sampleRate).toInt();
  final from = max(0, lead - keep);
  final to = samples.length - max<int>(0, tail - keep);
  final out = Float32List.fromList(samples.sublist(from, to));
  final fade = min((_fadeSeconds * sampleRate).toInt(), out.length ~/ 2);
  for (var i = 0; i < fade; i++) {
    final gain = fade == 1 ? 0.0 : 0.5 - 0.5 * cos(pi * i / (fade - 1));
    out[i] *= gain;
    out[out.length - 1 - i] *= gain;
  }
  return out;
}

/// Gaussian noise for the starting latent.
Float32List gaussianNoise(int length, Random random) {
  final values = Float32List(length);
  for (var i = 0; i < length; i++) {
    final radius = sqrt(-2 * log(1 - random.nextDouble()));
    values[i] = radius * cos(2 * pi * random.nextDouble());
  }
  return values;
}

final _softBreak = RegExp(r'[,;:]\s');

/// [text] in pieces of at most [limit] characters: the model was trained on
/// short clips and drifts on long ones. Prefers a comma, then a space.
List<String> speakableChunks(String text, int limit) {
  final chunks = <String>[];
  var rest = text.trim();
  while (rest.length > limit) {
    final head = rest.substring(0, limit);
    final comma = _softBreak.allMatches(head).lastOrNull?.start;
    final space = head.lastIndexOf(' ');
    final cut = comma != null && comma > limit ~/ 3
        ? comma + 1
        : (space > 0 ? space : limit);
    chunks.add(rest.substring(0, cut).trim());
    rest = rest.substring(cut).trim();
  }
  if (rest.isNotEmpty) chunks.add(rest);
  return chunks;
}
