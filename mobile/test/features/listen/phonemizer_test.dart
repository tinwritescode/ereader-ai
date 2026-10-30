import 'dart:io';

import 'package:ereader_mobile/features/listen/domain/phonemizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Phonemizer phonemizer;

  setUpAll(() {
    final bytes = File('assets/speech/phonemes.tsv.gz').readAsBytesSync();
    phonemizer = Phonemizer.fromGzippedTable(bytes);
  });

  // Expected values come from vig2p, the frontend the voice model was trained with.
  test('matches vig2p on Vietnamese text and punctuation', () {
    expect(
      phonemizer.phonemize('Tôi tin không gì khó hơn kiếm lợi nhuận.'),
      'tˈoj tˈin xˌoŋ ʝˈi↘ xˈɔ↗ hˈəːn kˈiɛ↗m lˈəːʔ↓j ɲwˈəʔ↓n.',
    );
  });

  test('reads capitalised words the same as lower case', () {
    expect(phonemizer.phonemize('Phố'), phonemizer.phonemize('phố'));
  });

  test('keeps known foreign words from the table', () {
    expect(phonemizer.phonemize('Wall'), 'wˈɔːl');
  });

  test('spells an unknown word from the syllables inside it', () {
    expect(
      phonemizer.phonemize('zzbanxyzmai'),
      contains(phonemizer.phonemize('mai')),
    );
  });
}
