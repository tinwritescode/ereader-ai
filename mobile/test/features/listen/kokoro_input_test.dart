import 'dart:typed_data';

import 'package:ereader_mobile/features/listen/domain/kokoro_input.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('wraps known phonemes in boundary tokens and drops the rest', () {
    final ids = encodePhonemes('ab?', {'a': 5, 'b': 7});

    expect(ids, [0, 5, 7, 0]);
  });

  test(
    'picks the style row for the phoneme count, capped at the pack size',
    () {
      final pack = Float32List(510 * 256);
      pack[256 * 2] = 3;
      pack[256 * 509] = 9;

      expect(styleFor(pack, 3).first, 3);
      expect(styleFor(pack, 900).first, 9);
      expect(styleFor(pack, 3), hasLength(256));
    },
  );
}
