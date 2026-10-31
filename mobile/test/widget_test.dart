import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'dart:async';

import 'package:ereader_mobile/features/books/domain/entities/book.dart';
import 'package:ereader_mobile/features/books/domain/repositories/books_repository.dart';
import 'package:ereader_mobile/features/books/presentation/time_ruler.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ereader_mobile/app/theme.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_look.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_spot.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/features/listen/presentation/mini_player.dart';

import 'features/auth/fake_auth_repository.dart';
import 'features/books/fake_books_repository.dart';
import 'features/books/fake_reading_look_store.dart';
import 'features/books/fake_reading_spot_store.dart';
import 'features/listen/fake_listen_choice_store.dart';
import 'features/listen/fake_speech.dart';

void main() {
  Future<FakeBooksRepository> pumpApp(
    WidgetTester tester, {
    List<Book>? shelf,
    BooksException? shortenedError,
    FakeSpeech? speech,
    FakeReadingLookStore? looks,
    FakeReadingSpotStore? spots,
    FakeAuthRepository? auth,
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final repository = FakeBooksRepository(
      shelf: shelf,
      shortenedError: shortenedError,
    );
    await tester.pumpWidget(
      EReaderApp(
        auth: auth ?? FakeAuthRepository(),
        repository: repository,
        speech: speech ?? FakeSpeech(),
        looks: looks ?? FakeReadingLookStore(),
        listenChoices: FakeListenChoiceStore(),
        spots: spots ?? FakeReadingSpotStore(),
        pickEpub: () async =>
            const EpubSource(path: '/tmp/loeb.epub', fileName: 'loeb.epub'),
      ),
    );
    await tester.pumpAndSettle();
    return repository;
  }

  /// Tools stay hidden while reading; one tap on the page shows them.
  Future<void> showTools(WidgetTester tester) async {
    await tester.tapAt(const Offset(200, 600));
    await tester.pumpAndSettle();
  }

  testWidgets('an empty library invites the first import', (tester) async {
    await pumpApp(tester);

    expect(
      find.text('Chưa có sách nào. Thêm một file EPUB để bắt đầu đọc.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Thêm sách EPUB'));
    await tester.pumpAndSettle();

    expect(find.text('Gerald M. Loeb'), findsWidgets);
  });

  testWidgets('opens a book, chooses a shorter length, and reads it', (
    tester,
  ) async {
    final repository = await pumpApp(tester, shelf: [loeb]);

    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    expect(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
      findsOneWidget,
    );
    expect(find.text("8'"), findsOneWidget);

    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Chương Một dài 8 phút'), findsOneWidget);

    await tester.tap(find.text('Ý chính'));
    await tester.pumpAndSettle();
    expect(find.text('Ý chính còn 2 phút'), findsOneWidget);
    final gate = repository.shortenedGate = Completer<void>();
    await tester.tap(find.text('Đọc bản 2 phút'));
    // Sheet closes, then the reader opens; the AI answer is still pending.
    for (var frame = 0; frame < 10; frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(
      find.text('AI đang rút gọn chương, thường mất 15–30 giây.'),
      findsOneWidget,
    );

    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Bản 2 phút của book-1-c0.'), findsOneWidget);
    await showTools(tester);
    expect(find.text('AI viết lại từ bản gốc'), findsOneWidget);
    expect(repository.shortenedRequests.single.minutes, 2);

    await tester.tap(find.text('gốc'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
  });

  testWidgets('a chapter under 5 minutes opens the original without asking', (
    tester,
  ) async {
    await pumpApp(tester, shelf: [loeb]);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Chương Sáu'));
    await tester.pumpAndSettle();

    expect(find.text('Kéo thước tới thời gian bạn có.'), findsNothing);
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
  });

  testWidgets(
    'says so when the AI cannot shorten a chapter, and offers a retry',
    (tester) async {
      await pumpApp(
        tester,
        shelf: [loeb],
        shortenedError: const BooksException('DIGEST_FAILED'),
      );
      await tester.tap(find.text('Gerald M. Loeb').last);
      await tester.pumpAndSettle();
      await tester.tap(
        find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ý chính'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Đọc bản 2 phút'));
      await tester.pumpAndSettle();

      expect(
        find.text('AI chưa rút gọn được chương này. Thử lại'),
        findsOneWidget,
      );
    },
  );

  testWidgets('dragging the ruler picks the nearest length', (tester) async {
    await pumpApp(tester, shelf: [loeb]);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();

    await tester.drag(find.byType(TimeRuler), const Offset(400, 0));
    await tester.pumpAndSettle();

    expect(find.text('Đọc bản gốc'), findsOneWidget);
  });

  Future<void> openOriginalChapter(WidgetTester tester) async {
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chương Sáu'));
    await tester.pumpAndSettle();
  }

  testWidgets('listening shows the player and can be turned off', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);

    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();

    expect(speech.played, [1]);
    expect(find.text('Lùi một câu'), findsOneWidget);
    // The player sits under the page, never over its top bar.
    expect(
      tester.getTopLeft(find.text('Lùi một câu')).dy,
      greaterThan(tester.getBottomLeft(find.textContaining('Tôi thực sự')).dy),
    );
    expect(find.text('Diễm Trinh'), findsOneWidget);
    expect(find.text('Đổi giọng'), findsOneWidget);

    await tester.tap(find.text('Tắt'));
    await tester.pumpAndSettle();
    expect(find.text('Nghe'), findsOneWidget);
    expect(speech.stops, greaterThan(0));
  });

  testWidgets('the first listen asks before downloading the voice', (
    tester,
  ) async {
    final speech = FakeSpeech(ready: false);
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);

    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();
    expect(find.text('Tải giọng đọc (326 MB), một lần'), findsOneWidget);
    expect(speech.played, isEmpty);

    await tester.tap(find.text('Tải giọng đọc'));
    await tester.pumpAndSettle();
    expect(speech.played, [1]);
  });

  testWidgets('another voice can be chosen from the player', (tester) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);
    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Đổi giọng'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đức An'));
    await tester.pumpAndSettle();

    expect(find.text('Đức An'), findsOneWidget);
  });

  testWidgets('a Vbee voice can be chosen from the player', (tester) async {
    const vbee = CloudVoice(
      'hn_female_ngochuyen_full_48k-fhg',
      'HN - Ngọc Huyền',
    );
    const vieNeu = CloudVoice('vieneu-clone', 'VieNeu');
    final speech = FakeSpeech(cloud: [vieNeu, vbee]);
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);
    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();

    expect(find.text('VieNeu'), findsOneWidget);
    await tester.tap(find.text('Đổi giọng'));
    await tester.pumpAndSettle();
    expect(find.text('đang dùng'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Giọng qua mạng, tính vào phút của gói')).dy,
      lessThan(
        tester.getTopLeft(find.text('Trên máy, nghe không cần mạng')).dy,
      ),
    );
    await tester.ensureVisible(find.text('HN - Ngọc Huyền'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('HN - Ngọc Huyền'));
    await tester.pumpAndSettle();

    expect(find.text('HN - Ngọc Huyền'), findsOneWidget);
    expect(speech.synthesized.last.$2, vbee);
  });

  testWidgets('a cloud voice counts its sentences before it speaks', (
    tester,
  ) async {
    const vieNeu = CloudVoice('vieneu-clone', 'VieNeu');
    final held = Completer<void>();
    final speech = FakeSpeech(cloud: [vieNeu])..synthesisGate = held;
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);
    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(find.textContaining('Đã có 0 trên'), findsOneWidget);
    expect(find.textContaining('là VieNeu đọc'), findsOneWidget);

    held.complete();
    await tester.pump();
    await tester.pumpAndSettle();
    expect(speech.played, isNotEmpty);
    expect(find.text('Lùi một câu'), findsOneWidget);
  });

  testWidgets('out of minutes, the voice list is one tap away', (tester) async {
    const vieNeu = CloudVoice('vieneu-clone', 'VieNeu');
    final speech = FakeSpeech(
      cloud: [vieNeu],
      synthesisError: const SpeechException('VBEE_LIMIT'),
    );
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);
    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();

    expect(find.text('Hết phút giọng qua mạng'), findsOneWidget);
    expect(find.text('Thử lại'), findsNothing);
    await tester.tap(find.text('Chọn giọng'));
    await tester.pumpAndSettle();
    expect(find.text('Chọn giọng đọc'), findsOneWidget);
  });

  testWidgets('listening from the length sheet starts by itself', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Nghe bản này'));
    await tester.pumpAndSettle();

    expect(speech.played, [1]);
    expect(find.text('Lùi một câu'), findsOneWidget);

    await tester.tap(find.text('gốc'));
    await tester.pumpAndSettle();
    expect(find.text('Nghe'), findsOneWidget);
    expect(speech.stops, greaterThan(0));
  });

  testWidgets('the page shows only the text until tapped', (tester) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);

    expect(find.text('Aa'), findsNothing);
    expect(find.text('Nghe'), findsNothing);

    await tester.tap(find.textContaining('Tôi thực sự tin rằng'));
    await tester.pumpAndSettle();

    expect(find.text('Aa'), findsOneWidget);
    expect(find.text('Nghe'), findsOneWidget);
    expect(speech.played, isEmpty);
  });

  testWidgets('long pressing a sentence offers to read from there', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await openOriginalChapter(tester);

    await tester.longPress(find.textContaining('Tôi thực sự tin rằng'));
    await tester.pumpAndSettle();
    expect(speech.played, isEmpty);

    await tester.tap(find.text('Nghe từ câu này'));
    await tester.pumpAndSettle();

    expect(speech.played, [1]);
    expect(find.text('Nghe từ câu này'), findsNothing);
  });

  testWidgets('night paper and loose spacing are kept for next time', (
    tester,
  ) async {
    final looks = FakeReadingLookStore();
    await pumpApp(tester, shelf: [loeb], looks: looks);
    await openOriginalChapter(tester);
    await showTools(tester);

    await tester.tap(find.text('Aa'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đêm'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thoáng'));
    await tester.pumpAndSettle();

    expect(
      looks.saved,
      const ReadingLook(paper: Paper.night, spacing: LineSpacing.loose),
    );
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold).last).backgroundColor,
      Palette.night,
    );
  });

  testWidgets('a saved look applies when a chapter opens', (tester) async {
    await pumpApp(
      tester,
      shelf: [loeb],
      looks: FakeReadingLookStore(const ReadingLook(paper: Paper.night)),
    );
    await openOriginalChapter(tester);

    expect(
      tester.widget<Scaffold>(find.byType(Scaffold).last).backgroundColor,
      Palette.night,
    );
  });

  testWidgets('the end of a chapter leads to the next one', (tester) async {
    await pumpApp(tester, shelf: [loeb]);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ý chính'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đọc bản 2 phút'));
    await tester.pumpAndSettle();

    expect(find.text('Xong Chương Một'), findsOneWidget);
    expect(find.text('Tiếp theo là Chương Sáu, dài 4 phút.'), findsOneWidget);

    await tester.tap(find.text('Đọc Chương Sáu'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
    expect(find.text('Xong Chương Sáu'), findsOneWidget);
    expect(find.text('Về danh sách chương'), findsOneWidget);
  });

  Future<void> openChapterOneOriginal(WidgetTester tester) async {
    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bản gốc'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đọc bản gốc'));
    await tester.pumpAndSettle();
  }

  void goBack(WidgetTester tester) =>
      tester.state<NavigatorState>(find.byType(Navigator)).pop();

  testWidgets('the library offers to continue where reading stopped', (
    tester,
  ) async {
    await pumpApp(
      tester,
      shelf: [loeb],
      spots: FakeReadingSpotStore({
        'book-1': const ReadingSpot(
          chapterId: 'book-1-c0',
          chapterLabel: 'Chương Một',
          minutesLeft: 3,
          option: LengthOption(ReadingLength.shortened, 4),
        ),
      }),
    );

    expect(find.text('Chương Một, còn 3 phút'), findsOneWidget);
    await tester.tap(find.text('Đọc tiếp'));
    await tester.pumpAndSettle();

    expect(find.text('Bản 4 phút của book-1-c0.'), findsOneWidget);
    expect(find.text('Kéo thước tới thời gian bạn có.'), findsNothing);
  });

  testWidgets('reopening a chapter asks to continue from the last spot', (
    tester,
  ) async {
    final spots = FakeReadingSpotStore();
    await pumpApp(tester, shelf: [loeb], spots: spots);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await openChapterOneOriginal(tester);
    expect(find.text('Lần trước bạn đọc đến'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Đoạn 25 của chương một.'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    final stoppedAt = spots.saved['book-1']!.block;
    expect(stoppedAt, greaterThan(10));

    goBack(tester);
    await tester.pumpAndSettle();
    await openChapterOneOriginal(tester);
    expect(find.text('Lần trước bạn đọc đến'), findsOneWidget);
    expect(find.text('“Đoạn $stoppedAt của chương một.”'), findsOneWidget);

    await tester.tap(find.text('Đọc tiếp'));
    await tester.pumpAndSettle();

    expect(find.text('Lần trước bạn đọc đến'), findsNothing);
    expect(
      find.text('Đoạn $stoppedAt của chương một.').hitTestable(),
      findsOneWidget,
    );
  });

  testWidgets('starting over keeps the reader at the top', (tester) async {
    final spots = FakeReadingSpotStore({
      'book-1': const ReadingSpot(
        chapterId: 'book-1-c0',
        chapterLabel: 'Chương Một',
        minutesLeft: 4,
        option: LengthOption(ReadingLength.original, 8),
        block: 30,
      ),
    });
    await pumpApp(tester, shelf: [loeb], spots: spots);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await openChapterOneOriginal(tester);

    await tester.tap(find.text('Đọc từ đầu'));
    await tester.pumpAndSettle();

    expect(find.text('Lần trước bạn đọc đến'), findsNothing);
    expect(
      find.textContaining('Tôi thực sự tin rằng').hitTestable(),
      findsOneWidget,
    );
    expect(spots.saved['book-1']!.block, 0);
  });

  testWidgets('finishing a chapter points the library to the next one', (
    tester,
  ) async {
    final spots = FakeReadingSpotStore();
    await pumpApp(tester, shelf: [loeb], spots: spots);
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ý chính'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đọc bản 2 phút'));
    await tester.pumpAndSettle();

    goBack(tester);
    await tester.pumpAndSettle();
    goBack(tester);
    await tester.pumpAndSettle();
    expect(find.text('Tiếp theo trong sách'), findsOneWidget);

    await tester.tap(find.text('Đọc tiếp'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
    // The last chapter is read, so there is nothing left to continue.
    expect(spots.saved['book-1'], isNull);
  });

  Future<void> listenThenLeave(WidgetTester tester) async {
    await openOriginalChapter(tester);
    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();
    goBack(tester);
    await tester.pumpAndSettle();
  }

  testWidgets('leaving a book keeps the voice reading it', (tester) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await listenThenLeave(tester);

    expect(speech.stops, 1);
    expect(speech.played, [1]);
    expect(find.byType(MiniPlayer), findsOneWidget);
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
    expect(find.text('đang nghe'), findsOneWidget);

    goBack(tester);
    await tester.pumpAndSettle();
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
    expect(speech.stops, 1);

    speech.finishSentence();
    await tester.pumpAndSettle();
    expect(find.textContaining('Tôi thực sự tin rằng'), findsNothing);
  });

  testWidgets('the bar stops the voice', (tester) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await listenThenLeave(tester);

    await tester.tap(find.byTooltip('Tạm dừng'));
    await tester.pumpAndSettle();
    expect(speech.paused, isTrue);

    await tester.tap(find.byTooltip('Tắt giọng đọc'));
    await tester.pumpAndSettle();
    expect(speech.stops, greaterThan(1));
    expect(find.byTooltip('Tắt giọng đọc'), findsNothing);
  });

  testWidgets('tapping the bar returns to the voice, without restarting it', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await listenThenLeave(tester);
    goBack(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('Tôi thực sự tin rằng'));
    await tester.pumpAndSettle();

    expect(find.text('Lùi một câu'), findsOneWidget);
    expect(find.byTooltip('Tắt giọng đọc'), findsNothing);
    expect(speech.played, [1]);
    expect(speech.stops, 1);
  });

  testWidgets('another chapter shows the bar and can take the voice over', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(tester, shelf: [loeb], speech: speech);
    await listenThenLeave(tester);

    await openChapterOneOriginal(tester);
    expect(find.text('Lùi một câu'), findsNothing);
    expect(find.byTooltip('Tắt giọng đọc'), findsOneWidget);

    await showTools(tester);
    await tester.tap(find.text('Nghe'));
    await tester.pumpAndSettle();
    expect(find.text('Lùi một câu'), findsOneWidget);
    expect(find.byTooltip('Tắt giọng đọc'), findsNothing);
    expect(speech.played, [1, 2]);
  });

  testWidgets('the home screen offers to listen on from the last sentence', (
    tester,
  ) async {
    final speech = FakeSpeech();
    await pumpApp(
      tester,
      shelf: [loeb],
      speech: speech,
      spots: FakeReadingSpotStore({
        'book-1': const ReadingSpot(
          chapterId: 'book-1-c0',
          chapterLabel: 'Chương Một',
          minutesLeft: 3,
          option: LengthOption(ReadingLength.original, 8),
          block: 20,
          quote: 'Đoạn 20 của chương một.',
          listened: true,
        ),
      }),
    );
    expect(find.text('Bạn đã nghe đến đoạn này'), findsOneWidget);
    expect(find.text('Đoạn 20 của chương một.'), findsOneWidget);

    await tester.tap(find.text('Nghe tiếp'));
    await tester.pumpAndSettle();

    expect(speech.synthesized.first.$1, 'Đoạn 20 của chương một.');
    expect(find.text('Lùi một câu'), findsOneWidget);
  });

  testWidgets('listening keeps the spot on the sentence being heard', (
    tester,
  ) async {
    final spots = FakeReadingSpotStore();
    await pumpApp(tester, shelf: [loeb], spots: spots);
    await listenThenLeave(tester);

    final spot = spots.saved['book-1']!;
    expect(spot.listened, isTrue);
    expect(spot.chapterId, chapterSix.chapterId);
    expect(spot.quote, contains('Tôi thực sự tin rằng'));
  });

  testWidgets('a book that continued shows it on its chapter page', (
    tester,
  ) async {
    await pumpApp(
      tester,
      shelf: [loeb],
      spots: FakeReadingSpotStore({
        'book-1': const ReadingSpot(
          chapterId: 'book-1-c1',
          chapterLabel: 'Chương Sáu',
          minutesLeft: 2,
        ),
      }),
    );
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Đọc tiếp Chương Sáu, còn 2 phút'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tôi thực sự tin rằng'), findsOneWidget);
  });
}
