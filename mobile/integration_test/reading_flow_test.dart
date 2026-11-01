import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/books/data/repositories/books_repository_impl.dart';
import 'package:ereader_mobile/features/books/data/repositories/prefs_reading_look_store.dart';
import 'package:ereader_mobile/features/books/data/repositories/prefs_reading_spot_store.dart';
import 'package:ereader_mobile/features/listen/data/cloud_voices.dart';
import 'package:ereader_mobile/features/listen/data/nano_speech.dart';
import 'package:ereader_mobile/features/listen/data/prefs_listen_choice_store.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/features/auth/fake_auth_repository.dart';
import '../test/features/tasks/fake_tasks.dart';
import '../test/features/changelog/fake_changelog.dart';

/// Runs on a simulator against a live backend that already holds one imported book for the account of `ACCESS_TOKEN`:
/// `flutter test integration_test --dart-define=API_BASE_URL=http://localhost:3013`.
/// Prints `SCREEN:<name>` and holds each screen for 2 s so a wrapper script can capture it.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<void> hold(WidgetTester tester, String screen) async {
    // ignore: avoid_print
    print('SCREEN:$screen');
    await tester.pump(const Duration(seconds: 2));
    await Future<void>.delayed(const Duration(seconds: 2));
  }

  testWidgets(
    'library, book, length choice, and reader against the live backend',
    (tester) async {
      const baseUrl = String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://localhost:3013',
      );
      // A real access token: this walks the live backend.
      const accessToken = String.fromEnvironment('ACCESS_TOKEN');
      final api = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          headers: {'Authorization': 'Bearer $accessToken'},
        ),
      );
      await tester.pumpWidget(
        EReaderApp(
          auth: FakeAuthRepository(),
          repository: BooksRepositoryImpl(api),
          speech: NanoSpeech(cloud: CloudVoices(api)),
          looks: PrefsReadingLookStore(),
          listenChoices: PrefsListenChoiceStore(),
          spots: PrefsReadingSpotStore(),
          tasks: FakeTasksRepository(),
          taskNotices: FakeTaskNoticeStore(),
          changelog: FakeChangelog(),
          seenReleases: FakeSeenStore(),
          pickEpub: () async => null,
        ),
      );
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await hold(tester, 'library');

      await tester.tap(find.text('Gerald M. Loeb'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      expect(find.text('Chương Một'), findsOneWidget);
      await hold(tester, 'book');

      await tester.tap(
        find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Chương Một dài 8 phút'), findsOneWidget);
      await hold(tester, 'sheet');

      await tester.tap(find.text('Đọc bản 4 phút'));
      // The real LLM answers in 15–30 s; the spinner never settles, so poll instead of pumpAndSettle.
      for (var waited = 0; waited < 120; waited++) {
        await tester.pump(const Duration(seconds: 1));
        if (find.byType(CircularProgressIndicator).evaluate().isEmpty) break;
      }
      // Tools stay hidden while reading; one tap shows them.
      await tester.tapAt(const Offset(200, 600));
      await tester.pumpAndSettle();
      expect(find.text('AI viết lại từ bản gốc'), findsOneWidget);
      await hold(tester, 'reader-shortened');

      await tester.tap(find.text('gốc'));
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -1500),
      );
      await tester.pumpAndSettle();
      expect(find.byType(Scrollable), findsWidgets);
      await hold(tester, 'reader-original');
    },
  );
}
