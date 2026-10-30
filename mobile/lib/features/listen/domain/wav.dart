import 'dart:typed_data';

const speechSampleRate = 24000;
const _headerBytes = 44;

/// Mono 16-bit PCM WAV, the format every iOS audio stack plays without decoding work.
Uint8List pcm16Wav(Float32List samples) {
  final dataBytes = samples.length * 2;
  final bytes = Uint8List(_headerBytes + dataBytes);
  final out = ByteData.sublistView(bytes);
  void text(int at, String value) =>
      bytes.setRange(at, at + 4, value.codeUnits);

  text(0, 'RIFF');
  out.setUint32(4, 36 + dataBytes, Endian.little);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, Endian.little);
  out.setUint16(20, 1, Endian.little);
  out.setUint16(22, 1, Endian.little);
  out.setUint32(24, speechSampleRate, Endian.little);
  out.setUint32(28, speechSampleRate * 2, Endian.little);
  out.setUint16(32, 2, Endian.little);
  out.setUint16(34, 16, Endian.little);
  text(36, 'data');
  out.setUint32(40, dataBytes, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    out.setInt16(
      _headerBytes + i * 2,
      (samples[i].clamp(-1.0, 1.0) * 32767).round(),
      Endian.little,
    );
  }
  return bytes;
}
