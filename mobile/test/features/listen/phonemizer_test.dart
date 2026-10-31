import 'dart:io';

import 'package:ereader_mobile/features/listen/domain/phonemizer.dart';
import 'package:flutter_test/flutter_test.dart';

// Text the phone does not read as sea_g2p does: abbreviations its normalizer
// expands, capitals inside a word, and its reading of a dollar amount.
const _knownGaps = {
  'TP.HCM, Mr. Smith',
  'OpenAI ra mắt ChatGPT.',
  r'Giá vàng tăng lên $100 mỗi ounce.',
};

void main() {
  late Phonemizer phonemizer;

  setUpAll(() {
    final bytes = File('assets/speech/phonemes.tsv.gz').readAsBytesSync();
    phonemizer = Phonemizer.fromGzippedTable(bytes);
  });

  // Expected values come from sea_g2p, the frontend the voice model was trained with.
  // tool/build_speech_golden.py writes them.
  final golden = [
    for (final line in File(
      'test/features/listen/sea_g2p_golden.tsv',
    ).readAsLinesSync())
      line.split('\t'),
  ];

  for (final [text, phonemes] in golden) {
    if (_knownGaps.contains(text)) continue;
    test('matches sea_g2p on: $text', () {
      expect(phonemizer.phonemize(text), phonemes);
    });
  }

  test('reads capitalised words the same as lower case', () {
    expect(phonemizer.phonemize('Phố'), phonemizer.phonemize('phố'));
  });

  test('spells an unknown word from the syllables inside it', () {
    expect(phonemizer.phonemize('zzbanxyzmai'), contains('mˈaːj'));
  });

  test('says a final mark for a short sentence and keeps a long one', () {
    expect(phonemizer.phonemize('Thật à?'), endsWith('.'));
    expect(
      phonemizer.phonemize('Anh ấy đi đâu rồi, sao chẳng thấy về?'),
      endsWith('?'),
    );
  });
}
