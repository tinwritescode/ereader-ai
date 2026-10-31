import 'package:ereader_mobile/features/books/presentation/whole_book_offer.dart';
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
      isA<OfferHidden>(),
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
      isA<OfferLocked>(),
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
        isA<OfferOpen>(),
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
    expect(running, isA<OfferUnderWay>());

    final stopped = translateOfferFor(
      foreign: true,
      chapterCount: 22,
      monthly: 0,
      standing: standing(
        task: translation(state: TaskState.stopped, current: null),
      ),
    );
    expect(stopped, isA<OfferStopped>());
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
      isA<OfferDone>(),
    );
  });

  group('voice for the whole book', () {
    BookVoice voice({
      int chapters = 10,
      int skipped = 0,
      BookVoiceTask? task,
    }) => BookVoice(
      chapters: chapters,
      skipped: skipped,
      minutes: 100,
      task: task,
    );

    test('needs the plan', () {
      expect(
        voiceOfferFor(allowed: false, standing: voice()),
        isA<OfferLocked>(),
      );
      expect(voiceOfferFor(allowed: true, standing: null), isA<OfferOpen>());
    });

    test('follows a task under way, or one that stopped, on any plan', () {
      expect(
        voiceOfferFor(allowed: true, standing: voice(task: bookVoice())),
        isA<OfferUnderWay>(),
      );
      expect(
        voiceOfferFor(
          allowed: false,
          standing: voice(
            task: bookVoice(state: TaskState.stopped, current: null),
          ),
        ),
        isA<OfferStopped>(),
      );
    });

    test('is done when the task finished the whole book', () {
      final done = bookVoice(state: TaskState.done, current: null);
      expect(
        voiceOfferFor(allowed: true, standing: voice(task: done)),
        isA<OfferDone>(),
      );
    });

    test('stays open while chapters are left for later translations', () {
      final done = bookVoice(state: TaskState.done, current: null);
      expect(
        voiceOfferFor(allowed: true, standing: voice(skipped: 2, task: done)),
        isA<OfferOpen>(),
      );
    });
  });

  group('chaptersWithin', () {
    test('says every chapter when the minutes are enough', () {
      expect(chaptersWithin(chapters: 27, minutes: 580, left: 1500), 27);
    });

    test('shares the minutes left out over the chapters', () {
      expect(chaptersWithin(chapters: 27, minutes: 580, left: 210), 9);
      expect(chaptersWithin(chapters: 27, minutes: 580, left: 0), 0);
    });
  });
}
