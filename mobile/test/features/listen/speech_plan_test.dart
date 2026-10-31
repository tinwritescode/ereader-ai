import 'dart:convert';
import 'dart:io';

import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/listen/domain/speech_plan.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const paragraph = TextBlockKind.paragraph;

  test('cuts text exactly as the server does', () {
    final golden = switch (jsonDecode(
      File(
        '../backend/src/modules/speech/domain/speech-plan.golden.json',
      ).readAsStringSync(),
    )) {
      {
        'blocks': final List<Object?> blocks,
        'sentences': final List<Object?> sentences,
      } =>
        (blocks: blocks.whereType<String>(), sentences: sentences),
      _ => throw StateError('bad golden file'),
    };
    final plan = planSpeech([
      for (final text in golden.blocks) TextBlock(paragraph, text),
    ]);
    expect([
      for (final sentence in plan)
        {
          'block': sentence.block,
          'start': sentence.start,
          'end': sentence.end,
          'text': sentence.text,
        },
    ], golden.sentences);
  });

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
    final long = List.generate(200, (i) => 'chữ$i').join(' ');
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

  group('sentenceAt', () {
    final plan = planSpeech(const [
      TextBlock(TextBlockKind.paragraph, 'Một. Hai.'),
      TextBlock(TextBlockKind.paragraph, 'Ba.'),
    ]);

    test('finds the sentence under a character', () {
      expect(sentenceAt(plan, 0, 0), 0);
      expect(sentenceAt(plan, 0, 6), 1);
      expect(sentenceAt(plan, 1, 1), 2);
    });

    test('a gap before the first sentence belongs to that sentence', () {
      expect(sentenceAt(plan, 1, 0), 2);
    });

    test('a block with nothing to read falls back to the start', () {
      expect(sentenceAt(plan, 9, 0), 0);
    });
  });
}
