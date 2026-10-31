import 'package:ereader_mobile/features/auth/domain/account.dart';
import 'package:ereader_mobile/features/auth/domain/auth_repository.dart';
import 'package:ereader_mobile/features/books/domain/entities/book.dart';
import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/features/books/domain/repositories/books_repository.dart';
import 'package:ereader_mobile/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../books/fake_books_repository.dart';
import '../books/fake_reading_look_store.dart';
import '../books/fake_reading_spot_store.dart';
import '../listen/fake_listen_choice_store.dart';
import '../listen/fake_speech.dart';
import 'fake_auth_repository.dart';

Book _book(int index) => Book(
  bookId: 'book-$index',
  title: 'Sách $index',
  author: 'Tác giả $index',
  status: 'READY',
  chapterCount: 1,
  minutes: 5,
  coverUrl: null,
);

void main() {
  Future<void> pump(
    WidgetTester tester,
    FakeAuthRepository auth, {
    List<Book>? shelf,
    BooksException? shortenedError,
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      EReaderApp(
        auth: auth,
        repository: FakeBooksRepository(
          shelf: shelf,
          shortenedError: shortenedError,
        ),
        speech: FakeSpeech(),
        looks: FakeReadingLookStore(),
        listenChoices: FakeListenChoiceStore(),
        spots: FakeReadingSpotStore(),
        pickEpub: () async =>
            const EpubSource(path: '/tmp/a.epub', fileName: 'a.epub'),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> openAccount(WidgetTester tester) async {
    await tester.tap(find.byTooltip('Tài khoản'));
    await tester.pumpAndSettle();
  }

  testWidgets('asks to sign in, then opens the library', (tester) async {
    final auth = FakeAuthRepository()..signedIn = false;
    await pump(tester, auth);
    expect(find.text('Thư viện'), findsNothing);

    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();

    expect(auth.askedNewAccount, isFalse);
    expect(find.text('Thư viện'), findsOneWidget);
  });

  testWidgets('offers the sign-up page', (tester) async {
    final auth = FakeAuthRepository()..signedIn = false;
    await pump(tester, auth);

    await tester.tap(find.text('Tạo tài khoản'));
    await tester.pumpAndSettle();

    expect(auth.askedNewAccount, isTrue);
  });

  testWidgets('says nothing when the sign-in page is closed', (tester) async {
    final auth = FakeAuthRepository()
      ..signedIn = false
      ..signInError = const AuthException(AuthException.canceled);
    await pump(tester, auth);

    await tester.tap(find.text('Đăng nhập'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Chưa đăng nhập được'), findsNothing);
    expect(find.text('Đăng nhập'), findsOneWidget);
  });

  testWidgets('offers to retry, not to sign in, when the server is away', (
    tester,
  ) async {
    final auth = FakeAuthRepository(
      restoreError: const AuthException('NETWORK_ERROR'),
    );
    await pump(tester, auth);
    expect(find.text('Đăng nhập'), findsNothing);

    auth.restoreError = null;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();

    expect(find.text('Thư viện'), findsOneWidget);
  });

  testWidgets('shows usage against the plan', (tester) async {
    await pump(tester, FakeAuthRepository(), shelf: [_book(1), _book(2)]);
    await openAccount(tester);

    expect(find.text('reader@example.com'), findsOneWidget);
    expect(find.text('Gói Free'), findsOneWidget);
    expect(find.text('2 trên 3 cuốn'), findsOneWidget);
    expect(find.text('7 trên 10 chương, làm mới ngày 1/12'), findsOneWidget);
    expect(find.text('12 trên 30 phút, làm mới ngày 1/12'), findsOneWidget);
    expect(find.text('Quản trị'), findsNothing);
  });

  testWidgets('signing out goes back to the door and forgets the shelf', (
    tester,
  ) async {
    final auth = FakeAuthRepository();
    await pump(tester, auth, shelf: [_book(1)]);
    await openAccount(tester);

    await tester.tap(find.text('Đăng xuất'));
    await tester.pumpAndSettle();

    expect(find.text('Đăng nhập'), findsOneWidget);
    expect(find.text('Tài khoản'), findsNothing);
    expect(auth.signedIn, isFalse);
  });

  testWidgets('goes back to the door when the session is lost', (tester) async {
    final auth = FakeAuthRepository();
    await pump(tester, auth);

    auth.loseSession();
    await tester.pumpAndSettle();

    expect(find.text('Đăng nhập'), findsOneWidget);
  });

  testWidgets('sends a request for a higher plan, once', (tester) async {
    final auth = FakeAuthRepository();
    await pump(tester, auth);
    await openAccount(tester);
    await tester.tap(find.text('Xem các gói'));
    await tester.pumpAndSettle();
    expect(find.text('1.500 phút giọng qua mạng mỗi tháng'), findsOneWidget);
    expect(find.text('đang dùng'), findsOneWidget);

    await tester.tap(find.text('Yêu cầu nâng gói').first);
    await tester.pumpAndSettle();

    expect(auth.requests, [PlanName.plus]);
    expect(find.text('đã gửi yêu cầu'), findsOneWidget);
  });

  testWidgets('turns the add tile into a note when the shelf is full', (
    tester,
  ) async {
    await pump(
      tester,
      FakeAuthRepository(),
      shelf: [_book(1), _book(2), _book(3)],
    );

    expect(find.text('Thêm sách EPUB'), findsNothing);
    expect(find.text('Đã đủ 3 cuốn của gói Free.'), findsOneWidget);

    await tester.tap(find.text('Xem các gói'));
    await tester.pumpAndSettle();
    expect(find.text('Các gói'), findsOneWidget);
  });

  testWidgets('lets the super admin change a plan', (tester) async {
    final auth = FakeAuthRepository(
      account: testAccount(plan: PlanName.max, isSuperAdmin: true),
    );
    auth.managed.add(
      const ManagedAccount(
        id: 'a-1',
        email: 'minh.anh@example.com',
        isSuperAdmin: false,
        plan: PlanName.free,
        requestedPlan: PlanName.plus,
        digestsUsed: 3,
      ),
    );
    await pump(tester, auth);
    await openAccount(tester);
    await tester.tap(find.text('Quản trị'));
    await tester.pumpAndSettle();
    expect(find.text('muốn lên Plus'), findsOneWidget);

    await tester.tap(find.text('Plus'));
    await tester.pumpAndSettle();

    expect(auth.granted, [('a-1', PlanName.plus)]);
  });

  testWidgets('out of shortened chapters, offers the original instead', (
    tester,
  ) async {
    await pump(
      tester,
      FakeAuthRepository(),
      shelf: [loeb],
      shortenedError: const BooksException('DIGEST_LIMIT'),
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

    expect(find.text('Hết lượt rút gọn tháng này'), findsOneWidget);
    expect(
      find.text(
        'Bạn đã dùng 10 trên 10 chương của gói Free. Lượt mới có vào ngày 1/12.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Đọc bản gốc'));
    await tester.pumpAndSettle();

    expect(find.text('Hết lượt rút gọn tháng này'), findsNothing);
    expect(find.text('Đoạn 1 của chương một.'), findsOneWidget);
  });
}
