import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_spot.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/features/auth/fake_auth_repository.dart';
import '../test/features/books/fake_books_repository.dart';
import '../test/features/books/fake_reading_look_store.dart';
import '../test/features/books/fake_reading_spot_store.dart';
import '../test/features/listen/fake_listen_choice_store.dart';
import '../test/features/listen/fake_speech.dart';
import '../test/features/tasks/fake_tasks.dart';

/// Walks the app on sample data for `tool/capture_screenshots.sh`, which saves
/// a screenshot each time this prints `SCREEN:<name>`.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('the screens shown in the README', (tester) async {
    Future<void> hold(String screen) async {
      await tester.pumpAndSettle();
      // ignore: avoid_print
      print('SCREEN:$screen');
      await Future<void>.delayed(const Duration(seconds: 3));
    }

    await tester.pumpWidget(
      EReaderApp(
        auth: FakeAuthRepository(),
        repository: FakeBooksRepository(shelf: [loeb]),
        speech: FakeSpeech(),
        looks: FakeReadingLookStore(),
        listenChoices: FakeListenChoiceStore(),
        spots: FakeReadingSpotStore({
          'book-1': ReadingSpot(
            chapterId: chapterOne.chapterId,
            chapterLabel: chapterOne.label,
            minutesLeft: 6,
            option: lengthOptionsFor(chapterOne.minutes).first,
            block: 12,
            quote:
                'Tôi thực sự tin rằng, không có gì khó khăn hơn việc kiếm lợi nhuận.',
            listened: true,
          ),
        }),
        tasks: FakeTasksRepository(),
        taskNotices: FakeTaskNoticeStore(),
        pickEpub: () async => null,
      ),
    );
    await hold('library');

    await tester.tap(find.text('Gerald M. Loeb').last);
    await hold('book');

    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await hold('choose-length');

    await tester.tap(find.text('Bản gốc'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đọc bản gốc'));
    await hold('resume');

    tester.state<NavigatorState>(find.byType(Navigator)).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chương Sáu'));
    await hold('reader');

    await tester.tapAt(const Offset(200, 600));
    await hold('reader-tools');

    await tester.tap(find.text('Nghe'));
    await hold('player');

    tester.state<NavigatorState>(find.byType(Navigator)).pop();
    await hold('still-listening');
  });
}
