import 'dart:typed_data';

const _styleSize = 256;
const _boundaryToken = 0;

/// Token ids for the model: each known phoneme between two boundary tokens.
Int64List encodePhonemes(String phonemes, Map<String, int> vocab) {
  final ids = [
    for (final rune in phonemes.runes) ?vocab[String.fromCharCode(rune)],
  ];
  return Int64List.fromList([_boundaryToken, ...ids, _boundaryToken]);
}

/// A voice stores one style vector per phoneme count; longer text uses the last row.
Float32List styleFor(Float32List voicePack, int phonemeCount) {
  final rows = voicePack.length ~/ _styleSize;
  final row = phonemeCount.clamp(1, rows) - 1;
  return Float32List.sublistView(
    voicePack,
    row * _styleSize,
    (row + 1) * _styleSize,
  );
}
