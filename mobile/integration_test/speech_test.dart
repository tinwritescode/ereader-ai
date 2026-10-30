import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/listen/data/kokoro_speech.dart';
import 'package:ereader_mobile/features/listen/data/vbee_voices.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Runs the real voice on a simulator; the first run downloads the 326 MB model.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('downloads the voice, speaks Vietnamese, and plays it', (
    tester,
  ) async {
    // Device voices only: no backend is needed.
    final speech = KokoroSpeech(vbee: VbeeVoices(Dio()));
    if (!await speech.modelReady()) {
      var last = 0.0;
      await speech.downloadModel(onProgress: (progress) => last = progress);
      expect(last, 1);
    }
    expect(await speech.modelReady(), isTrue);

    final samples = await speech.synthesize(
      'Năm 2024, ông ấy mua 1.500 cổ phiếu của OpenAI.',
      DeviceVoice.diemTrinh,
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
}
