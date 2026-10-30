import 'dart:typed_data';

import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/features/listen/domain/wav.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('wraps samples in a 24 kHz mono 16-bit WAV, clipping loud peaks', () {
    final bytes = pcm16Wav(Float32List.fromList([0, 1, -1, 2]));
    final data = ByteData.sublistView(bytes);

    expect(String.fromCharCodes(bytes, 0, 4), 'RIFF');
    expect(String.fromCharCodes(bytes, 8, 12), 'WAVE');
    expect(data.getUint32(24, Endian.little), 24000);
    expect(data.getUint32(40, Endian.little), 8);
    expect(bytes.length, 44 + 8);
    expect(data.getInt16(46, Endian.little), 32767);
    expect(data.getInt16(48, Endian.little), -32767);
    expect(data.getInt16(50, Endian.little), 32767);
  });

  test('reads samples back from a WAV, past chunks it does not use', () {
    final wav = pcm16Wav(Float32List.fromList([0, 0.5, -0.5]));
    // A LIST chunk between `fmt ` and `data`, as some encoders write.
    final list = [...'LIST'.codeUnits, 4, 0, 0, 0, ...'INFO'.codeUnits];
    final withList = Uint8List.fromList([
      ...wav.sublist(0, 36),
      ...list,
      ...wav.sublist(36),
    ]);

    for (final bytes in [wav, withList]) {
      final samples = wavSamples(bytes);
      expect(samples, hasLength(3));
      expect(samples[1], closeTo(0.5, 0.001));
      expect(samples[2], closeTo(-0.5, 0.001));
    }
  });

  test('refuses audio the player would play at the wrong pitch', () {
    final wav = pcm16Wav(Float32List.fromList([0]));
    ByteData.sublistView(wav).setUint32(24, 48000, Endian.little);

    expect(() => wavSamples(wav), throwsA(isA<SpeechException>()));
    expect(
      () => wavSamples(Uint8List.fromList('<html>'.codeUnits)),
      throwsA(isA<SpeechException>()),
    );
  });
}
