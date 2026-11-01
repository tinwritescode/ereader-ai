import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../auth/fake_auth_repository.dart';
import '../books/fake_books_repository.dart';
import '../books/fake_reading_look_store.dart';
import '../books/fake_reading_spot_store.dart';
import '../listen/fake_listen_choice_store.dart';
import '../listen/fake_speech.dart';
import '../tasks/fake_tasks.dart';
import 'fake_changelog.dart';

void main() {
  late FakeChangelog changelog;
  late FakeSeenStore seen;

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      EReaderApp(
        auth: FakeAuthRepository(),
        repository: FakeBooksRepository(),
        speech: FakeSpeech(),
        looks: FakeReadingLookStore(),
        listenChoices: FakeListenChoiceStore(),
        spots: FakeReadingSpotStore(),
        tasks: FakeTasksRepository(),
        taskNotices: FakeTaskNoticeStore(),
        changelog: changelog,
        seenReleases: seen,
        pickEpub: () async =>
            const EpubSource(path: '/tmp/a.epub', fileName: 'a.epub'),
      ),
    );
    await tester.pumpAndSettle();
  }

  setUp(() {
    changelog = FakeChangelog()
      ..releases = [release('1.1.0'), release('1.0.0')];
    seen = FakeSeenStore();
  });

  testWidgets('shows what is new once after an update, then keeps reading', (
    tester,
  ) async {
    seen.seen = '1.0.0';
    await open(tester);
    expect(find.text('Bản 1.1.0'), findsWidgets);

    await tester.tap(find.text('Đọc tiếp'));
    await tester.pumpAndSettle();
    expect(find.text('Đọc tiếp'), findsNothing);
    expect(seen.seen, '1.1.0');
  });

  testWidgets('says nothing on a first install', (tester) async {
    await open(tester);
    expect(find.text('Đọc tiếp'), findsNothing);
  });

  testWidgets('lists every version from the account page', (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('Tài khoản'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Có gì mới'));
    await tester.pumpAndSettle();

    expect(find.text('1.1.0'), findsOneWidget);
    expect(find.text('1.0.0'), findsOneWidget);
    expect(find.text('Sửa'), findsOneWidget);
    await tester.tap(find.text('Xem 2 thay đổi'));
    await tester.pumpAndSettle();
    expect(find.text('Sửa'), findsNWidgets(2));
  });
}
