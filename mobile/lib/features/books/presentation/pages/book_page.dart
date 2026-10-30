import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../../domain/repositories/books_repository.dart';
import '../../../listen/domain/speech.dart';
import '../bloc/book_bloc.dart';
import '../formatting.dart';
import '../length_memory.dart';
import '../widgets.dart';
import 'choose_length_sheet.dart';
import 'reader_page.dart';

class BookPage extends StatefulWidget {
  const BookPage({super.key, required this.book});

  final Book book;

  static Route<void> route(BuildContext context, Book book) {
    final repository = context.read<BooksRepository>();
    return MaterialPageRoute(
      builder: (_) => BlocProvider(
        create: (_) => BookBloc(repository)..add(BookStarted(book.bookId)),
        child: BookPage(book: book),
      ),
    );
  }

  @override
  State<BookPage> createState() => _BookPageState();
}

class _BookPageState extends State<BookPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<BookBloc>().state;
    final book = widget.book;
    final author = book.author;
    return Scaffold(
      body: RuledPaper(
        scroll: _scroll,
        child: SafeArea(
          bottom: false,
          child: Stack(
            children: [
              CustomScrollView(
                controller: _scroll,
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(
                      marginWidth + 12,
                      lineHeight,
                      18,
                      lineHeight,
                    ),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            book.title,
                            style: readingStyle(
                              size: 21,
                              height: onGrid(21),
                              weight: FontWeight.w600,
                              color: Palette.ink,
                            ),
                          ),
                          Text(
                            [?author, '${book.chapterCount} chương'].join(', '),
                            style: readingStyle(
                              size: 13,
                              height: onGrid(13),
                              color: Palette.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  switch (state) {
                    BookLoading() => const SliverFillRemaining(
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    BookFailed(:final code) => SliverFillRemaining(
                      child: Center(
                        child: TextButton(
                          onPressed: () => context.read<BookBloc>().add(
                            BookStarted(book.bookId),
                          ),
                          child: Text('${errorMessage(code)} Thử lại'),
                        ),
                      ),
                    ),
                    BookLoaded(:final chapters) => SliverList.builder(
                      itemCount: chapters.length,
                      itemBuilder: (context, index) => _ChapterRow(
                        chapter: chapters[index],
                        onTap: () => _open(chapters, index),
                      ),
                    ),
                  },
                  const SliverPadding(
                    padding: EdgeInsets.only(bottom: lineHeight * 2),
                  ),
                ],
              ),
              const Positioned(
                left: 2,
                top: 0,
                child: BackButton(color: Palette.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Opens chapter [index]: asks for a length first unless it is short.
  Future<void> _open(List<ChapterSummary> chapters, int index) async {
    final chapter = chapters[index];
    final next = index + 1 < chapters.length ? chapters[index + 1] : null;
    final options = lengthOptionsFor(chapter.minutes);
    final memory = context.read<LengthMemory>();
    final navigator = Navigator.of(context);
    final repository = context.read<BooksRepository>();
    final speech = context.read<Speech>();
    final choice = options.length == 1
        ? LengthChoice(options.single)
        : await showModalBottomSheet<LengthChoice>(
            context: context,
            isScrollControlled: true,
            builder: (_) => ChooseLengthSheet(
              chapter: chapter,
              options: options,
              preselected: memory.last,
            ),
          );
    if (choice == null) return;
    memory.last = choice.option.length;
    await navigator.push(
      ReaderPage.route(
        repository: repository,
        speech: speech,
        chapter: chapter,
        options: options,
        option: choice.option,
        listen: choice.listen,
        next: next,
        onNext: next == null
            ? null
            : () {
                navigator.pop();
                if (mounted) unawaited(_open(chapters, index + 1));
              },
      ),
    );
  }
}

class _ChapterRow extends StatelessWidget {
  const _ChapterRow({required this.chapter, required this.onTap});

  final ChapterSummary chapter;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final subtitle = chapter.subtitle;
    return InkWell(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: marginWidth,
            child: Padding(
              padding: const EdgeInsets.only(right: 8),
              // The second line of the row carries the title, so the minutes sit beside it.
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const SizedBox(height: lineHeight),
                  Text(
                    "${chapter.minutes}'",
                    style: handStyle(size: 22, height: onGrid(22)),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 18, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    subtitle == null ? '' : chapter.label,
                    style: readingStyle(
                      size: 12.5,
                      height: onGrid(12.5),
                      color: Palette.muted,
                    ),
                  ),
                  Text(
                    displayTitle(subtitle ?? chapter.label),
                    style: readingStyle(
                      size: 15,
                      height: onGrid(15),
                      weight: FontWeight.w600,
                      color: Palette.ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
