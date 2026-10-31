import 'package:ereader_mobile/features/books/presentation/translate_offer.dart';
import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';
import 'package:flutter_test/flutter_test.dart';

import '../tasks/fake_tasks.dart';

void main() {
  BookTranslation standing({
    Set<String> translated = const {},
    BookTranslationTask? task,
  }) => BookTranslation(translated: translated, task: task);

  test('says nothing for a book already in Vietnamese', () {
    expect(
      translateOfferFor(
        foreign: false,
        chapterCount: 10,
        monthly: 3,
        standing: standing(),
      ),
      isA<TranslateHidden>(),
    );
  });

  test('shows the plan it needs to a reader without it', () {
    expect(
      translateOfferFor(
        foreign: true,
        chapterCount: 10,
        monthly: 0,
        standing: standing(),
      ),
      isA<TranslateLocked>(),
    );
  });

  test('offers the book to a Max reader, before the standing is known', () {
    for (final known in [null, standing()]) {
      expect(
        translateOfferFor(
          foreign: true,
          chapterCount: 10,
          monthly: 3,
          standing: known,
        ),
        isA<TranslateOffered>(),
      );
    }
  });

  test('follows a translation under way, and one that stopped', () {
    final running = translateOfferFor(
      foreign: true,
      chapterCount: 22,
      monthly: 3,
      standing: standing(task: translation()),
    );
    expect(running, isA<TranslateUnderWay>());

    final stopped = translateOfferFor(
      foreign: true,
      chapterCount: 22,
      monthly: 0,
      standing: standing(
        task: translation(state: TaskState.stopped, current: null),
      ),
    );
    expect(stopped, isA<TranslateStopped>());
  });

  test('is done once every chapter is translated', () {
    expect(
      translateOfferFor(
        foreign: true,
        chapterCount: 2,
        monthly: 3,
        standing: standing(
          translated: {'c1', 'c2'},
          task: translation(state: TaskState.done, current: null),
        ),
      ),
      isA<TranslateDone>(),
    );
  });
}
