import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:ereader_mobile/features/listen/domain/nano_sampler.dart';
import 'package:flutter_test/flutter_test.dart';

/// What tool/build_nano_fixture.py recorded from the Python reference.
class _Fixture {
  _Fixture(ByteData data) {
    frames = data.getInt32(0, Endian.little);
    steps = data.getInt32(4, Endian.little);
    final rawLength = data.getInt32(8, Endian.little);
    final waveLength = data.getInt32(12, Endian.little);
    logSeconds = data.getFloat64(16, Endian.little);
    var at = 24;
    Float32List take(int length) {
      final out = Float32List(length);
      for (var i = 0; i < length; i++) {
        out[i] = data.getFloat32(at + i * 4, Endian.little);
      }
      at += length * 4;
      return out;
    }

    final latent = 144 * frames;
    noise = take(latent);
    velocities = [for (var i = 0; i < steps * 2; i++) take(latent)];
    finalLatent = take(latent);
    raw = take(rawLength);
    wave = take(waveLength);
  }

  late final int frames;
  late final int steps;
  late final double logSeconds;
  late final Float32List noise;
  late final List<Float32List> velocities;
  late final Float32List finalLatent;
  late final Float32List raw;
  late final Float32List wave;
}

class _Replay implements NanoConditioning, NanoGraphs {
  _Replay(this.fixture, this.times);

  final _Fixture fixture;
  final List<double> times;
  var answered = 0;
  Float32List? decoded;

  @override
  Future<double> logSeconds() async => fixture.logSeconds;

  @override
  Future<Float32List> velocity(Float32List latent, int frames, double t) async {
    expect(frames, fixture.frames);
    expect(t, closeTo(times[answered ~/ 2], 1e-9));
    return fixture.velocities[answered++];
  }

  @override
  Future<void> dispose() async {}

  @override
  Future<NanoConditioning> condition(Int64List ids, NanoVoice voice) async =>
      this;

  @override
  Future<Float32List> decode(Float32List latent, int frames) async {
    decoded = Float32List.fromList(latent);
    return Float32List.fromList(fixture.raw);
  }
}

void main() {
  final bytes = File('test/features/listen/nano_fixture.bin').readAsBytesSync();
  final fixture = _Fixture(ByteData.sublistView(bytes));
  const quality = NanoQuality(steps: 4, sway: -1);

  test(
    'takes the steps of the Python sampler, to the same latent and wave',
    () async {
      final graphs = _Replay(fixture, flowTimes(quality));
      final wave = await sampleSpeech(
        graphs: graphs,
        conditioning: graphs,
        unconditional: graphs,
        quality: quality,
        noise: (length) {
          expect(length, fixture.noise.length);
          return Float32List.fromList(fixture.noise);
        },
      );

      expect(graphs.answered, fixture.steps * 2);
      for (var i = 0; i < fixture.finalLatent.length; i++) {
        expect(graphs.decoded![i], closeTo(fixture.finalLatent[i], 1e-3));
      }
      expect(wave.length, fixture.wave.length);
      for (var i = 0; i < wave.length; i++) {
        expect(wave[i], closeTo(fixture.wave[i], 1e-6));
      }
    },
  );

  test('flow times start at 0, end at 1, and bunch up early with sway', () {
    final times = flowTimes(quality);
    expect(times.first, 0);
    expect(times.last, closeTo(1, 1e-12));
    expect(times[1], lessThan(0.25));
    expect(flowTimes(const NanoQuality(steps: 4, sway: 0)), [
      0,
      0.25,
      0.5,
      0.75,
      1,
    ]);
  });

  test('a voice is the speaker then the style tokens, little-endian', () {
    final bytes = ByteData((192 + 50 * 256) * 4)
      ..setFloat32(0, 1.5, Endian.little)
      ..setFloat32(192 * 4, 2.5, Endian.little);
    final voice = NanoVoice.fromBytes(bytes);
    expect(voice.speaker.length, 192);
    expect(voice.style.length, 12800);
    expect(voice.speaker.first, 1.5);
    expect(voice.style.first, 2.5);
    expect(
      () => NanoVoice.fromBytes(ByteData(4)),
      throwsA(isA<FormatException>()),
    );
  });

  test('phonemes become ids between the boundaries, unknown ones dropped', () {
    expect(encodePhonemes('ab?', const {'a': 5, 'b': 6}), [1, 5, 6, 2]);
  });

  test('noise looks like a standard normal', () {
    final values = gaussianNoise(50000, Random(1));
    final mean = values.reduce((a, b) => a + b) / values.length;
    final variance =
        values.map((v) => (v - mean) * (v - mean)).reduce((a, b) => a + b) /
        values.length;
    expect(mean, closeTo(0, 0.02));
    expect(variance, closeTo(1, 0.03));
  });

  group('speakableChunks', () {
    test('leaves a short sentence whole', () {
      expect(speakableChunks(' Một câu ngắn. ', 140), ['Một câu ngắn.']);
    });

    test('breaks a long sentence at a comma, then a space', () {
      expect(speakableChunks('aaaa bbbb, cccc dddd eeee', 12), [
        'aaaa bbbb,',
        'cccc dddd',
        'eeee',
      ]);
    });

    test('cuts a word longer than the limit', () {
      expect(speakableChunks('aaaaaaaa', 3), ['aaa', 'aaa', 'aa']);
    });

    test('every piece of a long text fits and no word is lost', () {
      final text = List.generate(120, (i) => 'từ$i').join(' ');
      final chunks = speakableChunks(text, 140);
      expect(chunks.every((chunk) => chunk.length <= 140), isTrue);
      expect(chunks.join(' '), text);
    });
  });

  test('silence alone is kept rather than dropped by trimming', () {
    expect(trimAndFade(Float32List(24000), 24000), hasLength(lessThan(24000)));
  });
}
