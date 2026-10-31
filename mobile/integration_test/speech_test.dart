import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/listen/data/cloud_voices.dart';
import 'package:ereader_mobile/features/listen/data/nano_model.dart';
import 'package:ereader_mobile/features/listen/data/nano_speech.dart';
import 'package:ereader_mobile/features/listen/data/onnx_nano_graphs.dart';
import 'package:ereader_mobile/features/listen/domain/nano_sampler.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/features/listen/domain/wav.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';

import 'nano_reference.dart';

const _sentences = [
  'Năm 2024, ông ấy mua 1.500 cổ phiếu của OpenAI.',
  'Mùa thu năm ấy, gió lạnh tràn về thành phố nhỏ ven sông, những chiếc lá vàng '
      'rơi xuống mặt hồ phẳng lặng như gương.',
  'Nhà đầu tư thông minh luôn tìm kiếm biên an toàn trước khi mua cổ phiếu.',
];

Float32List _floats(String encoded) {
  final bytes = base64.decode(encoded);
  return Float32List.fromList(
    bytes.buffer.asFloat32List(bytes.offsetInBytes, bytes.length ~/ 4),
  );
}

/// Runs the real voice on a device; the first run downloads the 282 MB model.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<NanoSpeech> ready([NanoQuality? quality]) async {
    // Device voices only: no backend is needed.
    final speech = quality == null
        ? NanoSpeech(cloud: CloudVoices(Dio()))
        : NanoSpeech(cloud: CloudVoices(Dio()), quality: quality);
    if (!await speech.modelReady()) {
      var last = 0.0;
      await speech.downloadModel(onProgress: (progress) => last = progress);
      expect(last, 1);
    }
    expect(await speech.modelReady(), isTrue);
    return speech;
  }

  testWidgets('downloads the voice, speaks Vietnamese, and plays it', (
    tester,
  ) async {
    final speech = await ready();
    final samples = await speech.synthesize(
      _sentences.first,
      defaultDeviceVoice,
    );
    // ignore: avoid_print
    print('SAMPLES:${samples.length}');

    expect(samples.length, greaterThan(24000));
    expect(
      samples.reduce((a, b) => a.abs() > b.abs() ? a : b).abs(),
      greaterThan(0.01),
    );

    await speech.play(samples.sublist(0, 12000));
    await speech.play(samples.sublist(0, 12000));
    await speech.stop();
  });

  testWidgets('matches the Python reference from the same noise', (
    tester,
  ) async {
    await ready();
    final model = NanoModel(directory: getApplicationSupportDirectory);
    final graphs = await OnnxNanoGraphs.load(model);
    Future<NanoVoice> voice(String id) async => NanoVoice.fromBytes(
      await rootBundle.load('assets/speech/voices/$id.bin'),
    );
    final vocab =
        (jsonDecode(await rootBundle.loadString('assets/speech/vocab.json'))
                as Map<String, dynamic>)
            .cast<String, int>();

    final wave = await sampleSpeech(
      graphs: graphs,
      conditioning: await graphs.condition(
        encodePhonemes(referencePhonemes, vocab),
        await voice('minh_quan'),
      ),
      unconditional: await graphs.condition(
        unconditionalIds,
        await voice('null'),
      ),
      quality: const NanoQuality(steps: referenceSteps, sway: referenceSway),
      noise: (length) => _floats(referenceNoise),
    );

    final expected = _floats(referenceWave);
    expect(wave.length, referenceSamples);
    var squared = 0.0;
    for (var i = 0; i < expected.length; i++) {
      final difference = wave[i * referenceDecimation] - expected[i];
      squared += difference * difference;
    }
    final error = sqrt(squared / expected.length);
    // ignore: avoid_print
    print('REFERENCE_RMS_ERROR:$error');
    expect(error, lessThan(1e-3));
  });

  for (final quality in const [
    NanoQuality(steps: 16, sway: 0),
    NanoQuality(steps: 8, sway: -1),
  ]) {
    testWidgets('real-time factor at ${quality.steps} steps', (tester) async {
      final speech = await ready(quality);
      final loading = Stopwatch()..start();
      await speech.synthesize('Xin chào.', defaultDeviceVoice);
      // ignore: avoid_print
      print(
        'LOAD_AND_FIRST_MS:${quality.steps}:${loading.elapsedMilliseconds}',
      );
      for (final sentence in _sentences) {
        final clock = Stopwatch()..start();
        final samples = await speech.synthesize(sentence, defaultDeviceVoice);
        final audio = samples.length / speechSampleRate;
        final taken = clock.elapsedMilliseconds / 1000;
        // ignore: avoid_print
        print(
          'RTF:${quality.steps}:audio=${audio.toStringAsFixed(2)}s:'
          'took=${taken.toStringAsFixed(2)}s:'
          'rtf=${(taken / audio).toStringAsFixed(3)}',
        );
      }
      // ignore: avoid_print
      print(
        'MEMORY_MB:${quality.steps}:rss=${ProcessInfo.currentRss >> 20}:peak=${ProcessInfo.maxRss >> 20}',
      );
    });
  }
}
