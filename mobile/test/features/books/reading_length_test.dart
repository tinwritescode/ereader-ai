import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'offers original, about half, and about a quarter for a long chapter',
    () {
      expect(lengthOptionsFor(15), const [
        LengthOption(ReadingLength.original, 15),
        LengthOption(ReadingLength.shortened, 8),
        LengthOption(ReadingLength.keyPoints, 4),
      ]);
    },
  );

  test('never offers a version under 2 minutes', () {
    expect(
      lengthOptionsFor(5).last,
      const LengthOption(ReadingLength.keyPoints, 2),
    );
  });

  test('offers only the original for a chapter under 5 minutes', () {
    expect(lengthOptionsFor(4), const [
      LengthOption(ReadingLength.original, 4),
    ]);
  });

  test('puts the Vietnamese translation right after the original', () {
    expect(lengthOptionsFor(15, vietnamese: true).take(2), const [
      LengthOption(ReadingLength.original, 15),
      LengthOption(ReadingLength.vietnamese, 15),
    ]);
    expect(lengthOptionsFor(4, vietnamese: true), const [
      LengthOption(ReadingLength.original, 4),
      LengthOption(ReadingLength.vietnamese, 4),
    ]);
  });
}
