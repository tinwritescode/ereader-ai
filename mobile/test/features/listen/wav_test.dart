import 'dart:typed_data';

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
}
