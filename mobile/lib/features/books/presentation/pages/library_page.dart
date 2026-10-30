import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/book.dart';
import '../bloc/library_bloc.dart';
import '../formatting.dart';
import '../reading_spots_cubit.dart';
import '../widgets.dart';
import 'book_page.dart';

const _pagePadding = EdgeInsets.only(left: marginWidth + 12, right: 18);

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
                      Text(
                        'Thư viện',
                        style: readingStyle(
                          size: 26,
                          height: onGrid(26) * 2,
                          weight: FontWeight.w600,
                          color: Palette.ink,
                        ),
                      ),
                      if (upload is! NoUpload) _UploadEntry(upload: upload),
                      for (final book in state.books) _BookEntry(book: book),
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
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 22),
                child: PrimaryButton(
                  label: 'Thêm sách EPUB',
                  onPressed: upload is Uploading
                      ? null
                      : () => context.read<LibraryBloc>().add(
                          const ImportRequested(),
                        ),
                ),
              ),
            ],
          ),
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

class _BookEntry extends StatelessWidget {
  const _BookEntry({required this.book});

  final Book book;

  @override
  Widget build(BuildContext context) {
    final author = book.author;
    final spot = context.watch<ReadingSpotsCubit>().state[book.bookId];
    return Padding(
      padding: const EdgeInsets.only(bottom: lineHeight),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BookLabel(
            fields: [
              ('Sách', book.title),
              if (author != null) ('Tác giả', author),
            ],
            onTap: () =>
                Navigator.of(context).push(BookPage.route(context, book)),
          ),
          const SizedBox(height: 8),
          if (spot == null)
            _Note(
              '${book.chapterCount} chương, khoảng ${durationLabel(book.minutes)} đọc',
            )
          else
            InkWell(
              onTap: () => Navigator.of(
                context,
              ).push(BookPage.route(context, book, resume: true)),
              child: Text(
                'Đọc tiếp ${spot.chapterLabel}, còn ${durationLabel(spot.minutesLeft)}',
                style: readingStyle(
                  size: 14.5,
                  height: onGrid(14.5),
                  weight: FontWeight.w600,
                  color: Palette.ink,
                ),
              ),
            ),
        ],
      ),
    );
  }
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
