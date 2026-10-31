import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../auth/presentation/auth_cubit.dart';
import '../../books/domain/entities/reading_length.dart';
import '../../books/domain/repositories/books_repository.dart';
import '../../books/presentation/length_memory.dart';
import '../../books/presentation/pages/book_page.dart';
import '../../books/presentation/pages/reader_page.dart';
import '../../listen/domain/speech.dart';
import '../../listen/presentation/listen_bloc.dart';
import '../domain/chapter_task.dart';
import 'tasks_cubit.dart';
import 'tasks_page.dart';

/// The app's way to reach its pages from outside any of them.
final appNavigator = GlobalKey<NavigatorState>();

void _show(
  ScaffoldMessengerState messenger, {
  required String text,
  required String action,
  required VoidCallback onAction,
}) {
  messenger.showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.ink,
      content: Text(text, style: readingStyle(size: 14, color: Palette.sheet)),
      action: SnackBarAction(
        label: action,
        textColor: Palette.marker,
        onPressed: onAction,
      ),
    ),
  );
}

void showTaskStarted(BuildContext context, String chapterLabel) => _show(
  ScaffoldMessenger.of(context),
  text: 'Đang tạo giọng đọc $chapterLabel. Xong sẽ báo.',
  action: 'Xem tác vụ',
  onAction: () => openTasks(context),
);

void showTranslationStarted(BuildContext context, String bookTitle) => _show(
  ScaffoldMessenger.of(context),
  text: 'Đang dịch $bookTitle. Xong sẽ báo.',
  action: 'Xem tác vụ',
  onAction: () => openTasks(context),
);

void openTasks(BuildContext context) => appNavigator.currentState?.push(
  TasksPage.route((task) => unawaited(openMadeBy(context, task))),
);

/// Opens what a finished task made: the voiced chapter, or the translated book.
Future<void> openMadeBy(BuildContext context, LongTask task) => switch (task) {
  ChapterVoiceTask() => openChapterOf(context, task),
  BookTranslationTask() => openTranslatedBook(context, task),
  BookVoiceTask() => openVoicedBook(context, task),
};

/// Opens the book with Vietnamese offered first for every chapter.
Future<void> openTranslatedBook(
  BuildContext context,
  BookTranslationTask task,
) async {
  final repository = context.read<BooksRepository>();
  context.read<LengthMemory>().last = ReadingLength.vietnamese;
  try {
    final books = await repository.books();
    final book = books.where((book) => book.bookId == task.bookId).firstOrNull;
    final navigator = appNavigator.currentState;
    if (book == null || navigator == null || !navigator.mounted) return;
    await navigator.push(BookPage.route(navigator.context, book));
  } on BooksException {
    // The task list stays open; the reader can tap again.
  }
}

/// Opens the task's chapter with its voice already reading.
Future<void> openChapterOf(BuildContext context, ChapterVoiceTask task) async {
  final repository = context.read<BooksRepository>();
  final listen = context.read<ListenBloc>();
  final speech = context.read<Speech>();
  try {
    final (books, chapters, voices) = await (
      repository.books(),
      repository.chapters(task.bookId),
      speech.cloudVoices(),
    ).wait;
    final book = books.where((book) => book.bookId == task.bookId).firstOrNull;
    final chapter = chapters
        .where((chapter) => chapter.chapterId == task.chapterId)
        .firstOrNull;
    if (book == null || chapter == null) return;
    final voice = voices.where((v) => v.code == task.voiceCode).firstOrNull;
    if (voice != null) listen.add(ListenVoiceChosen(voice));
    final minutes = task.minutes;
    final option = minutes == null
        ? LengthOption(ReadingLength.original, chapter.minutes)
        : LengthOption(ReadingLength.shortened, minutes);
    await appNavigator.currentState?.push(
      ReaderPage.route(
        repository: repository,
        book: book,
        chapter: chapter,
        options: [option],
        option: option,
        listen: true,
      ),
    );
  } on BooksException {
    // The task list stays open; the reader can tap again.
  }
}

/// Goes back to where the book was left, with its voice already reading.
Future<void> openVoicedBook(BuildContext context, BookVoiceTask task) async {
  final repository = context.read<BooksRepository>();
  final listen = context.read<ListenBloc>();
  final speech = context.read<Speech>();
  try {
    final (books, voices) = await (
      repository.books(),
      speech.cloudVoices(),
    ).wait;
    final book = books.where((book) => book.bookId == task.bookId).firstOrNull;
    final navigator = appNavigator.currentState;
    if (book == null || navigator == null || !navigator.mounted) return;
    final voice = voices.where((v) => v.code == task.voiceCode).firstOrNull;
    if (voice != null) listen.add(ListenVoiceChosen(voice));
    await navigator.push(
      BookPage.route(navigator.context, book, resume: true, listen: true),
    );
  } on BooksException {
    // The task list stays open; the reader can tap again.
  }
}

/// Tells of finished tasks, and looks again whenever the app comes back.
class TaskNotices extends StatefulWidget {
  const TaskNotices({super.key, required this.child});

  final Widget child;

  @override
  State<TaskNotices> createState() => _TaskNoticesState();
}

class _TaskNoticesState extends State<TaskNotices> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _signedIn) {
      unawaited(context.read<TasksCubit>().refresh());
    }
  }

  bool get _signedIn => context.read<AuthCubit>().state is AuthSignedIn;

  void _tell(BuildContext context, TasksState state) {
    final messenger = ScaffoldMessenger.of(context);
    for (final task in state.notices) {
      final stopped = task.state == TaskState.stopped;
      final (:done, :halted, :open) = switch (task) {
        ChapterVoiceTask(:final chapterLabel) => (
          done: 'Đã tạo xong giọng đọc $chapterLabel.',
          halted: 'Dừng tạo giọng đọc $chapterLabel ở ${task.percent}%.',
          open: 'Nghe ngay',
        ),
        BookVoiceTask(:final bookTitle) => (
          done: 'Đã tạo xong giọng đọc $bookTitle.',
          halted: 'Dừng tạo giọng đọc $bookTitle ở ${task.percent}%.',
          open: 'Nghe ngay',
        ),
        BookTranslationTask(:final bookTitle) => (
          done: 'Đã dịch xong $bookTitle.',
          halted: 'Dừng dịch $bookTitle ở ${task.percent}%.',
          open: 'Đọc ngay',
        ),
      };
      _show(
        messenger,
        text: stopped ? halted : done,
        action: stopped ? 'Xem tác vụ' : open,
        onAction: () =>
            stopped ? openTasks(context) : openMadeBy(context, task),
      );
    }
    context.read<TasksCubit>().noticesShown();
  }

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (before, after) =>
            before is! AuthSignedIn && after is AuthSignedIn,
        listener: (context, _) => context.read<TasksCubit>().refresh(),
      ),
      BlocListener<TasksCubit, TasksState>(
        listenWhen: (_, after) => after.notices.isNotEmpty,
        listener: _tell,
      ),
    ],
    child: widget.child,
  );
}
