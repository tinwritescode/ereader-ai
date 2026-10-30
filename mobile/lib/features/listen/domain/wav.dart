import 'dart:typed_data';

import 'speech.dart';

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

/// The samples of a mono 16-bit WAV at [speechSampleRate]. Anything else would
/// play at the wrong pitch, so it is refused.
Float32List wavSamples(Uint8List bytes) {
  const failed = SpeechException('VOICE_FAILED');
  final data = ByteData.sublistView(bytes);
  String text(int at) => String.fromCharCodes(bytes, at, at + 4);
  if (bytes.length < 12 || text(0) != 'RIFF' || text(8) != 'WAVE') throw failed;
  var formatChecked = false;
  // Chunks follow the header, each an id, a little-endian size, and padding to even.
  for (var at = 12; at + 8 <= bytes.length;) {
    final id = text(at);
    final size = data.getUint32(at + 4, Endian.little);
    final body = at + 8;
    if (id == 'fmt ') {
      if (size < 16 ||
          data.getUint16(body, Endian.little) != 1 ||
          data.getUint16(body + 2, Endian.little) != 1 ||
          data.getUint32(body + 4, Endian.little) != speechSampleRate ||
          data.getUint16(body + 14, Endian.little) != 16) {
        throw failed;
      }
      formatChecked = true;
    } else if (id == 'data') {
      if (!formatChecked) throw failed;
      final end = (body + size).clamp(body, bytes.length);
      final count = (end - body) ~/ 2;
      return Float32List.fromList([
        for (var i = 0; i < count; i++)
          data.getInt16(body + i * 2, Endian.little) / 32768,
      ]);
    }
    at = body + size + size % 2;
  }
  throw failed;
}
