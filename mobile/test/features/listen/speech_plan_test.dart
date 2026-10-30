import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/listen/domain/speech_plan.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const paragraph = TextBlockKind.paragraph;

  test('splits blocks into sentences that remember where they came from', () {
    final plan = planSpeech([
      const TextBlock(paragraph, 'Câu một. Câu hai? Câu ba'),
      const TextBlock(paragraph, 'Đoạn sau!'),
    ]);

    expect(plan.map((s) => (s.block, s.text)), [
      (0, 'Câu một.'),
      (0, 'Câu hai?'),
      (0, 'Câu ba'),
      (1, 'Đoạn sau!'),
    ]);
    expect(
      'Câu một. Câu hai? Câu ba'.substring(plan[1].start, plan[1].end),
      'Câu hai?',
    );
  });

  test('cuts a sentence too long for one model call at commas or spaces', () {
    final long = List.generate(200, (i) => 'chữ$i').join(i2);
    final plan = planSpeech([TextBlock(paragraph, long)]);

    expect(plan.length, greaterThan(1));
    expect(plan.every((s) => s.text.length <= maxSentenceCharacters), isTrue);
    expect(plan.map((s) => s.text).join(' '), long);
  });

  test('does not stop at decimal points or abbreviations with digits', () {
    expect(
      planSpeech([const TextBlock(paragraph, 'Giá 1.000 đồng.')]),
      hasLength(1),
    );
  });

  test('skips blocks with nothing to say', () {
    expect(planSpeech([const TextBlock(paragraph, '  ')]), isEmpty);
  });
}

const i2 = ' ';
