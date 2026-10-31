import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../../auth/domain/account.dart';
import '../../../auth/presentation/account_page.dart';
import '../../../auth/presentation/auth_cubit.dart';
import '../../../auth/presentation/plans_page.dart';
import '../../../listen/presentation/listen_bloc.dart';
import '../../../listen/presentation/mini_player.dart';
import '../../../tasks/domain/chapter_task.dart';
import '../../../tasks/presentation/task_notices.dart';
import '../../../tasks/presentation/tasks_cubit.dart';
import '../../domain/entities/book.dart';
import '../../domain/entities/reading_spot.dart';
import '../bloc/library_bloc.dart';
import '../formatting.dart';
import '../reading_spots_cubit.dart';
import '../widgets.dart';
import 'book_page.dart';

const _pagePadding = EdgeInsets.only(
  left: marginWidth + 12,
  right: 18,
  bottom: lineHeight,
);
const _shelfGap = 14.0;

class LibraryPage extends StatefulWidget {
  const LibraryPage({super.key});

  @override
  State<LibraryPage> createState() => _LibraryPageState();
}

class _LibraryPageState extends State<LibraryPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<LibraryBloc>().state;
    final upload = state.upload;
    final listening = context.watch<ListenBloc>().state.heard != null;
    final spots = context.watch<ReadingSpotsCubit>().state;
    final latest = listening ? null : _latest(state.books, spots);
    final auth = context.watch<AuthCubit>().state;
    final account = auth is AuthSignedIn ? auth.account : null;
    final empty =
        !state.loading &&
        state.loadError == null &&
        state.books.isEmpty &&
        upload is NoUpload;

    return Scaffold(
      body: RuledPaper(
        scroll: _scroll,
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async =>
                      context.read<LibraryBloc>().add(const LibraryStarted()),
                  child: ListView(
                    controller: _scroll,
                    padding: _pagePadding,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: Text(
                              'Thư viện',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: readingStyle(
                                size: 26,
                                height: onGrid(26) * 2,
                                weight: FontWeight.w600,
                                color: Palette.ink,
                              ),
                            ),
                          ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const _TasksEntry(),
                              IconButton(
                                tooltip: 'Tài khoản',
                                icon: const Icon(
                                  Icons.person_outline,
                                  color: Palette.ink,
                                ),
                                onPressed: () => Navigator.of(
                                  context,
                                ).push(AccountPage.route()),
                              ),
                            ],
                          ),
                        ],
                      ),
                      if (latest case (final book, final spot))
                        _ContinueCard(book: book, spot: spot),
                      if (upload is! NoUpload) _UploadEntry(upload: upload),
                      if (state.loading && state.books.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(child: CircularProgressIndicator()),
                        ),
                      if (state.loadError case final code?)
                        _Note(
                          'Không tải được thư viện. ${errorMessage(code)} Kéo xuống để thử lại.',
                        ),
                      if (empty)
                        const _Note(
                          'Chưa có sách nào. Thêm một file EPUB để bắt đầu đọc.',
                        ),
                      _Shelf(
                        books: state.books,
                        spots: spots,
                        account: account,
                        onAdd: upload is Uploading
                            ? null
                            : () => context.read<LibraryBloc>().add(
                                const ImportRequested(),
                              ),
                      ),
                    ],
                  ),
                ),
              ),
              MiniPlayer(
                onOpen: (heard) => Navigator.of(
                  context,
                ).push(BookPage.route(context, heard.book, resume: true)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The book touched last that is still on the shelf, and where it stopped.
(Book, ReadingSpot)? _latest(List<Book> books, Map<String, ReadingSpot> spots) {
  for (final MapEntry(:key, :value) in spots.entries.toList().reversed) {
    final book = books.where((book) => book.bookId == key).firstOrNull;
    if (book != null) return (book, value);
  }
  return null;
}

/// The way to the task page, with how many tasks are under way.
class _TasksEntry extends StatelessWidget {
  const _TasksEntry();

  @override
  Widget build(BuildContext context) {
    final active = context.watch<TasksCubit>().state.active;
    return InkWell(
      onTap: () => openTasks(context),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (active > 0) ...[
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: Palette.marker,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$active',
                  style: handStyle(size: 20, color: Palette.ink),
                ),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              'Tác vụ',
              style: readingStyle(
                size: 14,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: readingStyle(size: 14.5, height: onGrid(14.5)));
}

/// Brings the reader back with the very words they stopped on.
class _ContinueCard extends StatelessWidget {
  const _ContinueCard({required this.book, required this.spot});

  final Book book;
  final ReadingSpot spot;

  String get _lead {
    if (spot.quote == null) return 'Tiếp theo trong sách';
    return spot.listened
        ? 'Bạn đã nghe đến đoạn này'
        : 'Bạn đã đọc đến đoạn này';
  }

  @override
  Widget build(BuildContext context) {
    final quote = spot.quote;
    return Padding(
      padding: const EdgeInsets.only(bottom: lineHeight),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Palette.sheet,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Palette.ink, width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_lead, style: handStyle(size: 20)),
            if (quote != null) ...[
              const SizedBox(height: 4),
              Text(
                quote.trim(),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: readingStyle(
                  size: 15,
                  height: 1.55,
                ).copyWith(backgroundColor: Palette.marker),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              '${book.title}, ${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: readingStyle(size: 12.5, color: Palette.muted),
            ),
            const SizedBox(height: 10),
            PrimaryButton(
              label: spot.listened ? 'Nghe tiếp' : 'Đọc tiếp',
              onPressed: () => Navigator.of(context).push(
                BookPage.route(
                  context,
                  book,
                  resume: true,
                  listen: spot.listened,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Two books side by side, with a place for the next one at the end.
class _Shelf extends StatelessWidget {
  const _Shelf({
    required this.books,
    required this.spots,
    required this.account,
    required this.onAdd,
  });

  final List<Book> books;
  final Map<String, ReadingSpot> spots;
  final Account? account;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final width = (constraints.maxWidth - _shelfGap) / 2;
      final account = this.account;
      return Wrap(
        spacing: _shelfGap,
        runSpacing: lineHeight,
        children: [
          for (final book in books)
            _ShelfBook(book: book, spot: spots[book.bookId], width: width),
          if (account != null && books.length >= account.limits.books)
            _ShelfFull(width: width, account: account)
          else
            _AddBook(width: width, onTap: onAdd),
        ],
      );
    },
  );
}

class _ShelfBook extends StatelessWidget {
  const _ShelfBook({
    required this.book,
    required this.spot,
    required this.width,
  });

  final Book book;
  final ReadingSpot? spot;
  final double width;

  @override
  Widget build(BuildContext context) {
    final author = book.author;
    final spot = this.spot;
    final working = context
        .watch<TasksCubit>()
        .state
        .tasks
        .where(
          (task) =>
              task.bookId == book.bookId &&
              task.state == ChapterTaskState.running,
        )
        .firstOrNull;
    return SizedBox(
      width: width,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.of(context).push(BookPage.route(context, book)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BookCover(book: book, width: width - 4),
            const SizedBox(height: 10),
            Text(
              book.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: readingStyle(
                size: 14,
                height: 1.4,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
            if (author != null)
              Text(
                author,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: readingStyle(size: 12.5, color: Palette.muted),
              ),
            if (working != null)
              Text(
                'tạo giọng đọc ${working.percent}%',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: handStyle(size: 17),
              )
            else if (spot != null)
              Text(
                '${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: handStyle(size: 17),
              ),
          ],
        ),
      ),
    );
  }
}

class _AddBook extends StatelessWidget {
  const _AddBook({required this.width, required this.onTap});

  final double width;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width - 4,
    height: (width - 4) * coverRatio,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: CustomPaint(
        painter: _DashedOutline(),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.add, color: Palette.ink),
            const SizedBox(height: 4),
            Text(
              'Thêm sách EPUB',
              textAlign: TextAlign.center,
              style: readingStyle(
                size: 13,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Takes the place of [_AddBook] once the plan's shelf is full.
class _ShelfFull extends StatelessWidget {
  const _ShelfFull({required this.width, required this.account});

  final double width;
  final Account account;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width - 4,
    height: (width - 4) * coverRatio,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.of(context).push(PlansPage.route()),
      child: CustomPaint(
        painter: _DashedOutline(),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Đã đủ ${account.limits.books} cuốn của gói ${account.plan.label}.',
                textAlign: TextAlign.center,
                style: readingStyle(size: 13, height: 1.4),
              ),
              const SizedBox(height: 4),
              Text(
                'Xem các gói',
                style: readingStyle(
                  size: 13,
                  weight: FontWeight.w600,
                  color: Palette.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _DashedOutline extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const dash = 5.0;
    final paint = Paint()
      ..color = Palette.ink
      ..strokeWidth = 1.5;
    for (var x = 0.0; x < size.width; x += dash * 2) {
      final end = Offset(x + dash, 0);
      canvas.drawLine(Offset(x, 0), end, paint);
      canvas.drawLine(
        Offset(x, size.height),
        end.translate(0, size.height),
        paint,
      );
    }
    for (var y = 0.0; y < size.height; y += dash * 2) {
      final end = Offset(0, y + dash);
      canvas.drawLine(Offset(0, y), end, paint);
      canvas.drawLine(
        Offset(size.width, y),
        end.translate(size.width, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedOutline oldDelegate) => false;
}

class _UploadEntry extends StatelessWidget {
  const _UploadEntry({required this.upload});

  final Upload upload;

  @override
  Widget build(BuildContext context) {
    final (fileName, status, progress) = switch (upload) {
      Uploading(:final fileName, :final progress) => (
        fileName,
        'Đang tải lên, ${(progress * 100).round()}%',
        progress,
      ),
      UploadFailed(:final fileName, :final code) => (
        fileName,
        'Không thêm được. ${errorMessage(code)}',
        null,
      ),
      NoUpload() => ('', '', null),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: lineHeight),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BookLabel(fields: [('Sách', fileName)]),
          const SizedBox(height: 8),
          _Note(status),
          if (progress != null)
            LinearProgressIndicator(
              value: progress,
              color: Palette.red,
              backgroundColor: Palette.rose,
            ),
        ],
      ),
    );
  }
}
