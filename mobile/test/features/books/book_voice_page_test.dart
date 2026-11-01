import 'package:ereader_mobile/features/auth/domain/account.dart';
import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../auth/fake_auth_repository.dart';
import '../listen/fake_listen_choice_store.dart';
import '../listen/fake_speech.dart';
import '../tasks/fake_tasks.dart';
import 'fake_books_repository.dart';
import 'fake_reading_look_store.dart';
import 'fake_reading_spot_store.dart';
import '../changelog/fake_changelog.dart';

void main() {
  Future<void> openBook(
    WidgetTester tester, {
    required Account account,
    required FakeTasksRepository tasks,
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      EReaderApp(
        auth: FakeAuthRepository(account: account),
        repository: FakeBooksRepository(shelf: [loeb]),
        speech: FakeSpeech(cloud: const [CloudVoice('v', 'Hạt Dẻ')]),
        looks: FakeReadingLookStore(),
        listenChoices: FakeListenChoiceStore(),
        spots: FakeReadingSpotStore(),
        tasks: tasks,
        taskNotices: FakeTaskNoticeStore(),
        changelog: FakeChangelog(),
        seenReleases: FakeSeenStore(),
        pickEpub: () async =>
            const EpubSource(path: '/tmp/a.epub', fileName: 'a.epub'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gerald M. Loeb').last);
    await tester.pumpAndSettle();
  }

  testWidgets('on a smaller plan, the row explains Max', (tester) async {
    await openBook(
      tester,
      account: testAccount(),
      tasks: FakeTasksRepository(),
    );

    await tester.tap(find.text('Tạo giọng đọc cả sách'));
    await tester.pumpAndSettle();

    expect(find.text('Giọng đọc cả sách có ở gói Max'), findsOneWidget);
  });

  testWidgets('on Max, shows the minutes and starts the task', (tester) async {
    final tasks = FakeTasksRepository();
    await openBook(
      tester,
      account: testAccount(plan: PlanName.max),
      tasks: tasks,
    );

    await tester.tap(find.text('Tạo giọng đọc cả sách'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Tháng này còn 1488 phút'), findsOneWidget);

    await tester.tap(find.text('Tạo giọng cả sách'));
    await tester.pumpAndSettle();

    expect(tasks.voicing.single.voiceCode, 'v');
  });

  testWidgets('short of minutes, warns where it will stop', (tester) async {
    await openBook(
      tester,
      account: testAccount(plan: PlanName.max, vbeeMinutesUsed: 1290),
      tasks: FakeTasksRepository(),
    );

    await tester.tap(find.text('Tạo giọng đọc cả sách'));
    await tester.pumpAndSettle();

    expect(find.text('Tạo tới khi hết phút'), findsOneWidget);
    expect(find.textContaining('Đủ khoảng 9 chương'), findsOneWidget);
  });
}
