import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../../auth/domain/account.dart';
import '../../../auth/presentation/auth_cubit.dart';
import '../../../listen/domain/listen_source.dart';
import '../../../listen/domain/speech.dart';
import '../../../listen/presentation/listen_bloc.dart';
import '../../../listen/presentation/mini_player.dart';
import '../../../tasks/domain/chapter_task.dart';
import '../../../tasks/presentation/chapter_voice_sheet.dart';
import '../../../tasks/presentation/task_notices.dart';
import '../../../tasks/presentation/tasks_cubit.dart';
import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../../domain/entities/reading_spot.dart';
import '../../domain/repositories/books_repository.dart';
import '../bloc/book_bloc.dart';
import '../formatting.dart';
import '../length_memory.dart';
import '../reading_spots_cubit.dart';
import '../whole_book_offer.dart';
import '../whole_book_widgets.dart';
import '../widgets.dart';
import 'choose_length_sheet.dart';
import 'reader_page.dart';

const _rowDivider = Color(0x6B2A1F6E);

class BookPage extends StatefulWidget {
  const BookPage({
    super.key,
    required this.book,
    this.resume = false,
    this.listen = false,
  });

  final Book book;

  /// Goes straight back to where reading stopped, once the chapters load.
  final bool resume;

  /// With [resume], starts the voice there as well.
  final bool listen;

  static Route<void> route(
    BuildContext context,
    Book book, {
    bool resume = false,
    bool listen = false,
  }) {
    final repository = context.read<BooksRepository>();
    return MaterialPageRoute(
      builder: (_) => BlocProvider(
        create: (_) => BookBloc(repository)..add(BookStarted(book.bookId)),
        child: BookPage(book: book, resume: resume, listen: listen),
      ),
    );
  }

  @override
  State<BookPage> createState() => _BookPageState();
}

class _BookPageState extends State<BookPage> {
  final _scroll = ScrollController();
  late bool _resume = widget.resume;

  /// What the server last said about this book's translation.
  BookTranslation? _translation;

  /// What the server last said about a voice for the whole book.
  BookVoice? _voice;

  @override
  void initState() {
    super.initState();
    if (widget.book.isForeign) unawaited(_loadTranslation());
    unawaited(_loadVoice());
  }

  Future<void> _loadVoice() async {
    try {
      final voice = await context.read<TasksRepository>().voiceOf(
        widget.book.bookId,
      );
      if (mounted) setState(() => _voice = voice);
    } on TasksException {
      // The book reads as before; the next change to the task asks again.
    }
  }

  Future<void> _loadTranslation() async {
    try {
      final translation = await context.read<TasksRepository>().translationOf(
        widget.book.bookId,
      );
      if (mounted) setState(() => _translation = translation);
    } on TasksException {
      // The book reads as before; the next change to the task asks again.
    }
  }

  T? _liveTask<T extends WholeBookTask>(TasksState tasks) => tasks.tasks
      .whereType<T>()
      .where((task) => task.bookId == widget.book.bookId)
      .lastOrNull;

  /// The loaded standing, with the task as the task list last saw it.
  BookVoice? _voiceStanding(TasksState tasks) {
    final loaded = _voice;
    final live = _liveTask<BookVoiceTask>(tasks);
    if (loaded == null) return null;
    return BookVoice(
      chapters: loaded.chapters,
      skipped: loaded.skipped,
      minutes: loaded.minutes,
      task: live ?? loaded.task,
    );
  }

  /// The loaded standing, with the task as the task list last saw it.
  BookTranslation? _standing(TasksState tasks) {
    final loaded = _translation;
    final live = _liveTask<BookTranslationTask>(tasks);
    if (loaded == null && live == null) return null;
    return BookTranslation(
      translated: loaded?.translated ?? const {},
      task: live ?? loaded?.task,
    );
  }

  /// Vietnamese is offered once a translation of the book has begun.
  bool _hasVietnamese() {
    final standing = _standing(context.read<TasksCubit>().state);
    return widget.book.isForeign &&
        standing != null &&
        (standing.translated.isNotEmpty || standing.task != null);
  }

  Future<void> _offerTranslation() async {
    final auth = context.read<AuthCubit>();
    final tasks = context.read<TasksCubit>();
    final messenger = ScaffoldMessenger.of(context);
    if (auth.state case AuthSignedIn(:final account)) {
      final monthly = account.limits.monthlyBookTranslations;
      final spot = context.read<ReadingSpotsCubit>().state[widget.book.bookId];
      final go = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Palette.paper,
        builder: (_) => TranslateSheet(
          chapterCount: widget.book.chapterCount,
          from: spot?.chapterLabel,
          left: monthly - account.bookTranslationsUsed,
          monthly: monthly,
          resetLabel: account.resetLabel,
        ),
      );
      if (go != true || !mounted) return;
      try {
        await tasks.translateBook(
          widget.book.bookId,
          startChapterId: spot?.chapterId,
        );
        if (mounted) showTranslationStarted(context, widget.book.title);
        unawaited(auth.refresh());
        await _loadTranslation();
      } on TasksException catch (error) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(switch (error.code) {
              'TRANSLATION_LIMIT' => 'Đã hết lượt dịch sách tháng này.',
              'PLAN_REQUIRED' => 'Dịch cả sách có ở gói Max.',
              'ALREADY_TRANSLATED' => 'Sách đã được dịch xong.',
              _ => 'Chưa dịch được, kiểm tra mạng rồi thử lại.',
            }),
          ),
        );
      }
    }
  }

  void _showLocked({required String title, required String body}) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Palette.paper,
      builder: (_) => WholeBookLockedSheet(title: title, body: body),
    );
  }

  void _showTranslationLocked() {
    final auth = context.read<AuthCubit>().state;
    final max = auth is AuthSignedIn
        ? auth.account.plans[PlanName.max]?.monthlyBookTranslations ?? 0
        : 0;
    _showLocked(
      title: 'Dịch cả sách có ở gói Max',
      body:
          'Gói Max dịch $max cuốn sách sang tiếng Việt mỗi tháng, '
          'giữ nguyên từng đoạn của bản gốc.',
    );
  }

  /// Foreign books are read from their translation, so that comes first.
  Future<void> _offerVoice() async {
    final repository = context.read<TasksRepository>();
    try {
      final voice = await repository.voiceOf(widget.book.bookId);
      if (!mounted) return;
      setState(() => _voice = voice);
      if (voice.skipped > 0) {
        final choice = await showModalBottomSheet<PartlyTranslatedChoice>(
          context: context,
          backgroundColor: Palette.paper,
          builder: (_) => PartlyTranslatedSheet(
            chapters: voice.chapters,
            skipped: voice.skipped,
          ),
        );
        if (!mounted) return;
        if (choice == PartlyTranslatedChoice.translateFirst) {
          await _offerTranslation();
        }
        if (choice != PartlyTranslatedChoice.voiceTranslated) return;
      }
      await _chooseBookVoice(voice);
    } on TasksException {
      _tellVoiceFailed();
    } on SpeechException {
      _tellVoiceFailed();
    }
  }

  void _tellVoiceFailed() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Chưa tạo được, kiểm tra mạng rồi thử lại.'),
      ),
    );
  }

  Future<void> _chooseBookVoice(BookVoice standing) async {
    final auth = context.read<AuthCubit>();
    final tasks = context.read<TasksCubit>();
    final current = context.read<ListenBloc>().state.voice;
    final book = widget.book;
    final spot = context.read<ReadingSpotsCubit>().state[book.bookId];
    final voices = await context.read<Speech>().cloudVoices();
    final state = auth.state;
    if (!mounted || voices.isEmpty || state is! AuthSignedIn) return;
    final account = state.account;
    final left = account.limits.monthlyVbeeMinutes - account.vbeeMinutesUsed;
    final enough = left >= standing.minutes;
    final chosen = await showModalBottomSheet<CloudVoice>(
      context: context,
      isScrollControlled: true,
      builder: (_) => VoiceSheet(
        title: 'Tạo giọng đọc cả sách',
        action: enough ? 'Tạo giọng cả sách' : 'Tạo tới khi hết phút',
        voices: voices,
        first: current is CloudVoice ? current : voices.first,
        note: [
          '${standing.chapters} chương, khoảng '
              '${durationLabel(standing.minutes)} giọng. '
              'Tháng này còn $left phút.',
          if (spot != null)
            'Tạo từ ${spot.chapterLabel} tới hết, '
                'rồi quay lại các chương trước.',
          if (enough)
            'Câu đã có giọng không tính phút. Huỷ thì giữ phần đã tạo, '
                'không tính phần chưa tạo.'
          else
            'Đủ khoảng ${chaptersWithin(chapters: standing.chapters, minutes: standing.minutes, left: left)} '
                'chương. Hết phút thì dừng, phần đã tạo vẫn nghe được. '
                'Tháng sau bấm Chạy tiếp để làm nốt.',
        ].join('\n'),
      ),
    );
    if (chosen == null || !mounted) return;
    await tasks.voiceBook(
      book.bookId,
      voiceCode: chosen.code,
      startChapterId: spot?.chapterId,
    );
    if (mounted) showTaskStarted(context, book.title);
    await _loadVoice();
  }

  Future<void> _resumeTask(WholeBookTask task) async {
    try {
      await context.read<TasksCubit>().resume(task);
    } on TasksException {
      // The row stays as it was; another tap tries again.
    }
  }

  void _resumeOnLoad(BuildContext context, BookState state) {
    if (state case BookLoaded(:final chapters) when _resume) {
      _resume = false;
      final heard = context.read<ListenBloc>().state.heard;
      final spot = context.read<ReadingSpotsCubit>().state[widget.book.bookId];
      if (heard?.book.bookId == widget.book.bookId) {
        _rejoin(chapters, heard!);
      } else if (spot != null) {
        _continue(chapters, spot, listen: widget.listen);
      }
    }
  }

  void _continue(
    List<ChapterSummary> chapters,
    ReadingSpot spot, {
    required bool listen,
  }) {
    final index = chapters.indexWhere(
      (chapter) => chapter.chapterId == spot.chapterId,
    );
    if (index >= 0) {
      unawaited(
        _open(
          chapters,
          index,
          option: spot.option,
          resume: true,
          listen: listen,
        ),
      );
    }
  }

  void _rejoin(List<ChapterSummary> chapters, ListenSource heard) {
    final index = chapters.indexWhere(
      (chapter) => chapter.chapterId == heard.chapter.chapterId,
    );
    if (index >= 0) {
      unawaited(_open(chapters, index, option: heard.option, resume: true));
    }
  }

  void _openHeard(ListenSource heard) {
    final state = context.read<BookBloc>().state;
    if (state case BookLoaded(
      :final chapters,
    ) when heard.book.bookId == widget.book.bookId) {
      _rejoin(chapters, heard);
    } else {
      unawaited(
        Navigator.of(
          context,
        ).push(BookPage.route(context, heard.book, resume: true)),
      );
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<BookBloc>().state;
    final book = widget.book;
    final heard = context.watch<ListenBloc>().state.heard;
    final hearing = heard?.book.bookId == book.bookId ? heard : null;
    final spot = context.watch<ReadingSpotsCubit>().state[book.bookId];
    final tasks = context.watch<TasksCubit>().state;
    final standing = _standing(tasks);
    final voice = _voiceStanding(tasks);
    final account = switch (context.watch<AuthCubit>().state) {
      AuthSignedIn(:final account) => account,
      _ => null,
    };
    final monthly = account?.limits.monthlyBookTranslations ?? 0;
    final offer = translateOfferFor(
      foreign: book.isForeign,
      chapterCount: book.chapterCount,
      monthly: monthly,
      standing: standing,
    );
    return MultiBlocListener(
      listeners: [
        BlocListener<BookBloc, BookState>(listener: _resumeOnLoad),
        // Chapters finished while the page is open get their marks.
        BlocListener<TasksCubit, TasksState>(
          listenWhen: (before, after) {
            final was = _liveTask<BookTranslationTask>(before);
            final now = _liveTask<BookTranslationTask>(after);
            return now != null &&
                (was?.done != now.done || was?.state != now.state);
          },
          listener: (_, _) => unawaited(_loadTranslation()),
        ),
        BlocListener<TasksCubit, TasksState>(
          listenWhen: (before, after) =>
              _liveTask<BookVoiceTask>(before)?.state !=
              _liveTask<BookVoiceTask>(after)?.state,
          listener: (_, _) => unawaited(_loadVoice()),
        ),
      ],
      child: Scaffold(
        body: RuledPaper(
          scroll: _scroll,
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    children: [
                      CustomScrollView(
                        controller: _scroll,
                        slivers: [
                          SliverToBoxAdapter(child: _Head(book: book)),
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
                            BookLoaded(:final chapters) => SliverMainAxisGroup(
                              slivers: [
                                if (spot != null && hearing == null)
                                  SliverToBoxAdapter(
                                    child: _Continue(
                                      spot: spot,
                                      onTap: () => _continue(
                                        chapters,
                                        spot,
                                        listen: spot.listened,
                                      ),
                                    ),
                                  ),
                                SliverToBoxAdapter(
                                  child: WholeBookRow(
                                    offer: offer,
                                    words: (
                                      title: 'Dịch cả sách sang tiếng Việt',
                                      note:
                                          'gói Max, tháng này còn '
                                          '${monthly - (account?.bookTranslationsUsed ?? 0)} lượt',
                                      doing: 'Đang dịch cả sách',
                                      waiting: 'Chờ dịch cả sách',
                                      named: 'Dịch cả sách',
                                      finished:
                                          'Đã dịch cả sách sang tiếng Việt',
                                    ),
                                    onOffer: _offerTranslation,
                                    onLocked: _showTranslationLocked,
                                    onFollow: () => openTasks(context),
                                    onResume: _resumeTask,
                                  ),
                                ),
                                SliverToBoxAdapter(
                                  child: WholeBookRow(
                                    offer: voiceOfferFor(
                                      allowed:
                                          account?.limits.chapterVoice ?? false,
                                      standing: voice,
                                    ),
                                    words: (
                                      title: 'Tạo giọng đọc cả sách',
                                      note: 'gói Max',
                                      doing: 'Đang tạo giọng cả sách',
                                      waiting: 'Chờ tạo giọng cả sách',
                                      named: 'Tạo giọng cả sách',
                                      finished: 'Đã có giọng đọc cả sách',
                                    ),
                                    onOffer: _offerVoice,
                                    onLocked: () => _showLocked(
                                      title: 'Giọng đọc cả sách có ở gói Max',
                                      body:
                                          'Gói Max tạo sẵn giọng cho cả cuốn, '
                                          'nghe liền mạch từ đầu tới cuối, kể cả khi mạng yếu.',
                                    ),
                                    onFollow: () => openTasks(context),
                                    onResume: _resumeTask,
                                  ),
                                ),
                                SliverList.builder(
                                  itemCount: chapters.length,
                                  itemBuilder: (context, index) => _ChapterRow(
                                    chapter: chapters[index],
                                    mark: [
                                      ?_markOf(
                                        chapters[index].chapterId,
                                        standing,
                                      ),
                                      ?_voiceMarkOf(
                                        chapters[index].chapterId,
                                        voice?.task,
                                      ),
                                    ].join(', '),
                                    hearing:
                                        hearing?.chapter.chapterId ==
                                        chapters[index].chapterId,
                                    onTap: () => _open(chapters, index),
                                  ),
                                ),
                              ],
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
                MiniPlayer(onOpen: _openHeard),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Opens chapter [index]: asks for a length first, unless it is short or
  /// [option] is already known.
  Future<void> _open(
    List<ChapterSummary> chapters,
    int index, {
    LengthOption? option,
    bool resume = false,
    bool listen = false,
  }) async {
    final chapter = chapters[index];
    final next = index + 1 < chapters.length ? chapters[index + 1] : null;
    final options = lengthOptionsFor(
      chapter.minutes,
      vietnamese: _hasVietnamese(),
    );
    final memory = context.read<LengthMemory>();
    final navigator = Navigator.of(context);
    final repository = context.read<BooksRepository>();
    final choice = option != null
        ? LengthChoice(option)
        : options.length == 1
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
        book: widget.book,
        resume: resume,
        chapter: chapter,
        options: options,
        option: choice.option,
        listen: listen || choice.listen,
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

/// How far a chapter's translation is, as a note on its row.
String? _markOf(String chapterId, BookTranslation? standing) {
  if (standing == null) return null;
  if (standing.translated.contains(chapterId)) return 'đã dịch';
  final task = standing.task;
  if (task == null) return null;
  return switch (task.turnOf(chapterId)) {
    ChapterTurn.now => 'đang dịch ${task.current?.percent ?? 0}%',
    ChapterTurn.later => 'chờ dịch',
    ChapterTurn.none => null,
  };
}

/// How far a chapter's voice is, as a note on its row.
String? _voiceMarkOf(String chapterId, BookVoiceTask? task) {
  if (task == null) return null;
  if (task.voiced.contains(chapterId)) return 'có giọng';
  return switch (task.turnOf(chapterId)) {
    ChapterTurn.now => 'đang tạo ${task.current?.percent ?? 0}%',
    ChapterTurn.later => 'chờ giọng',
    ChapterTurn.none => null,
  };
}

class _Head extends StatelessWidget {
  const _Head({required this.book});

  final Book book;

  @override
  Widget build(BuildContext context) {
    final author = book.author;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        marginWidth + 12,
        lineHeight,
        18,
        lineHeight,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BookCover(book: book, width: 76),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  book.title,
                  style: readingStyle(
                    size: 18,
                    height: 1.25,
                    weight: FontWeight.w600,
                    color: Palette.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  [?author, '${book.chapterCount} chương'].join(', '),
                  style: readingStyle(size: 13, color: Palette.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Continue extends StatelessWidget {
  const _Continue({required this.spot, required this.onTap});

  final ReadingSpot spot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(marginWidth + 12, 0, 18, lineHeight),
    child: PrimaryButton(
      label:
          '${spot.listened ? 'Nghe' : 'Đọc'} tiếp ${spot.chapterLabel}, '
          'còn ${durationLabel(spot.minutesLeft)}',
      onPressed: onTap,
    ),
  );
}

/// One chapter as a strip the width of the page; a tap anywhere opens it.
class _ChapterRow extends StatelessWidget {
  const _ChapterRow({
    required this.chapter,
    required this.mark,
    required this.hearing,
    required this.onTap,
  });

  final ChapterSummary chapter;

  /// How far its translation and voice are; empty when neither has begun.
  final String mark;
  final bool hearing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (:number, :title) = chapterHeading(chapter);
    final titleStyle = readingStyle(
      size: 15.5,
      height: onGrid(15.5),
      weight: FontWeight.w600,
      color: Palette.ink,
    );
    final note = [
      ?number,
      if (hearing) 'đang nghe',
      if (mark.isNotEmpty) mark,
    ].join(', ');
    return Container(
      foregroundDecoration: const BoxDecoration(
        border: Border(top: BorderSide(color: _rowDivider, width: 1.5)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          highlightColor: Palette.marker.withValues(alpha: 0.45),
          splashColor: Palette.marker.withValues(alpha: 0.3),
          child: Padding(
            padding: const EdgeInsets.only(bottom: lineHeight),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: marginWidth,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Text(
                      "${chapter.minutes}'",
                      textAlign: TextAlign.right,
                      style: handStyle(size: 22, height: onGrid(22)),
                    ),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (note.isNotEmpty)
                          Text(
                            note,
                            style: handStyle(
                              size: 18,
                              height: onGrid(18),
                              color: hearing ? Palette.red : Palette.muted,
                            ),
                          ),
                        Text(
                          title,
                          style: hearing
                              ? titleStyle.copyWith(
                                  backgroundColor: Palette.marker,
                                )
                              : titleStyle,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(
                  width: 34,
                  height: lineHeight,
                  child: Icon(
                    Icons.chevron_right,
                    size: 20,
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
}
