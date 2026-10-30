import 'package:ereader_mobile/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import '../test/features/books/fake_books_repository.dart';
import '../test/features/listen/fake_speech.dart';

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
        repository: FakeBooksRepository(shelf: [loeb]),
        speech: FakeSpeech(),
        pickEpub: () async => null,
      ),
    );
    await hold('library');

    await tester.tap(find.text('Gerald M. Loeb'));
    await hold('book');

    await tester.tap(
      find.text('Nó đòi hỏi kiến thức, kinh nghiệm và năng khiếu'),
    );
    await hold('choose-length');

    await tester.tapAt(const Offset(200, 100));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Chương Sáu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nghe'));
    await hold('player');
  });
}
