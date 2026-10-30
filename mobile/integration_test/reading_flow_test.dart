import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/books/data/repositories/books_repository_impl.dart';
import 'package:ereader_mobile/features/books/data/repositories/prefs_reading_look_store.dart';
import 'package:ereader_mobile/features/listen/data/kokoro_speech.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// Runs on a simulator against a live backend that already holds one imported book for `USER_ID`:
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
      const userId = String.fromEnvironment(
        'USER_ID',
        defaultValue: 'demo-user',
      );
      await tester.pumpWidget(
        EReaderApp(
          repository: BooksRepositoryImpl(
            Dio(BaseOptions(baseUrl: baseUrl)),
            userId: userId,
          ),
          speech: KokoroSpeech(),
          looks: PrefsReadingLookStore(),
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
