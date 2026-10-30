import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../../auth/presentation/account_widgets.dart';
import '../../../auth/presentation/auth_cubit.dart';
import '../../../listen/domain/listen_source.dart';
import '../../../listen/domain/speech_plan.dart';
import '../../../listen/presentation/listen_bloc.dart';
import '../../../listen/presentation/listen_panel.dart';
import '../../../listen/presentation/mini_player.dart';
import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../../domain/entities/reading_look.dart';
import '../../domain/entities/reading_spot.dart';
import '../../domain/repositories/books_repository.dart';
import '../bloc/reader_bloc.dart';
import '../formatting.dart';
import '../reading_look_cubit.dart';
import '../reading_spots_cubit.dart';
import '../widgets.dart';
import 'look_sheet.dart';

// The red margin line; the minutes left are written by hand to its left.
const _marginLine = 26.0;
const _textLeft = 40.0;

/// Colours of the page on each [Paper].
typedef _PageColors = ({
  Color paper,
  Color text,
  Color title,
  Color muted,
  Color track,
  Color line,
  Color button,
  Color onButton,
});

_PageColors _colorsOf(Paper paper) => switch (paper) {
  Paper.day => (
    paper: Palette.paper,
    text: Palette.text,
    title: Palette.ink,
    muted: Palette.muted,
    track: Palette.rose,
    line: Palette.rule,
    button: Palette.ink,
    onButton: Palette.sheet,
  ),
  Paper.night => (
    paper: Palette.night,
    text: Palette.nightText,
    title: Palette.nightText,
    muted: Palette.nightMuted,
    track: Palette.nightRule,
    line: Palette.nightRule,
    button: Palette.marker,
    onButton: Palette.ink,
  ),
};

/// A sentence held down by the reader, and where the finger was.
typedef _Picked = ({SpokenSentence sentence, Offset at});

class ReaderPage extends StatefulWidget {
  const ReaderPage({
    super.key,
    required this.book,
    required this.chapter,
    required this.options,
    this.listen = false,
    this.resume = false,
    this.next,
    this.onNext,
  });

  final Book book;
  final ChapterSummary chapter;
  final List<LengthOption> options;

  /// Goes to the saved spot without asking; the reader already chose to continue.
  final bool resume;

  /// Starts reading aloud as soon as the text has loaded.
  final bool listen;

  /// The chapter after this one, and how to open it; null on the last chapter.
  final ChapterSummary? next;
  final VoidCallback? onNext;

  static Route<void> route({
    required BooksRepository repository,
    required Book book,
    required ChapterSummary chapter,
    required List<LengthOption> options,
    required LengthOption option,
    bool listen = false,
    bool resume = false,
    ChapterSummary? next,
    VoidCallback? onNext,
  }) {
    return MaterialPageRoute(
      builder: (_) => BlocProvider(
        create: (_) =>
            ReaderBloc(repository: repository, chapter: chapter, option: option)
              ..add(ReaderLengthChosen(option)),
        child: ReaderPage(
          book: book,
          chapter: chapter,
          options: options,
          listen: listen,
          resume: resume,
          next: next,
          onNext: onNext,
        ),
      ),
    );
  }

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  final _scroll = ScrollController();
  final _stack = GlobalKey();
  // One key per block, so a sentence can be found on the page.
  final _blockKeys = <int, GlobalKey>{};
  late bool _listenOnLoad = widget.listen;
  double _read = 0;
  bool _tools = false;
  _Picked? _picked;
  late final _spots = context.read<ReadingSpotsCubit>();
  // The opening text decides once whether to ask about the last spot.
  bool _placed = false;
  ReadingSpot? _offer;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final max = _scroll.position.maxScrollExtent;
      setState(() => _read = max <= 0 ? 0 : (_scroll.offset / max).clamp(0, 1));
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  ListenSource _source(LengthOption option) => ListenSource(
    book: widget.book,
    chapter: widget.chapter,
    option: option,
    next: widget.next,
  );

  /// The voice is on this very version of this chapter.
  bool _heardHere(ListenState listen, LengthOption option) {
    final heard = listen.heard;
    return heard != null &&
        heard.book.bookId == widget.book.bookId &&
        heard.chapter.chapterId == widget.chapter.chapterId &&
        heard.option == option;
  }

  void _onText(BuildContext context, ReaderState state) {
    if (state.text case ReaderTextFailed(code: 'DIGEST_LIMIT')) {
      _showDigestLimit();
    }
    if (state.text case ReaderTextLoaded(:final text)) {
      if (_placed) {
        _afterLayout(_remember);
      } else {
        _placed = true;
        _place(text.blocks, state.option);
      }
    }
  }

  /// The limit never stops reading: the original is always one tap away.
  void _showDigestLimit() {
    final auth = context.read<AuthCubit>();
    final original = widget.options.firstWhere(
      (option) => option.length == ReadingLength.original,
    );
    unawaited(auth.refresh());
    final state = auth.state;
    final used = state is AuthSignedIn
        ? 'Bạn đã dùng ${state.account.limits.monthlyDigests} trên ${state.account.limits.monthlyDigests} chương của gói ${state.account.plan.label}. Lượt mới có vào ${state.account.resetLabel}.'
        : 'Bạn đã dùng hết lượt của gói này.';
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Palette.paper,
      builder: (sheet) => LimitSheet(
        title: 'Hết lượt rút gọn tháng này',
        body: used,
        way: 'Đọc bản gốc',
        onWay: () {
          Navigator.of(sheet).pop();
          _chooseVersion(original);
        },
      ),
    );
  }

  void _afterLayout(VoidCallback action) =>
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) action();
      });

  /// Goes back to the saved spot in this version of the chapter, or asks first.
  void _place(List<TextBlock> blocks, LengthOption option) {
    final listen = context.read<ListenBloc>();
    if (_heardHere(listen.state, option)) {
      if (listen.state.stage case ListenPlaying(:final sentence)) {
        _afterLayout(() => _reveal(sentence));
      }
      return;
    }
    final spot = _spots.state[widget.book.bookId];
    final saved =
        spot != null &&
            spot.chapterId == widget.chapter.chapterId &&
            spot.option == option &&
            (spot.block > 0 || spot.offset > 0) &&
            spot.block < blocks.length
        ? spot
        : null;
    if (_listenOnLoad) {
      _listenOnLoad = false;
      final from = widget.resume ? saved : null;
      listen.add(
        ListenRequested(
          blocks,
          source: _source(option),
          block: from?.block ?? 0,
          offset: from?.offset ?? 0,
        ),
      );
    }
    if (saved == null) {
      _afterLayout(_remember);
    } else if (widget.resume) {
      _afterLayout(() => _goTo(saved.block));
    } else {
      setState(() => _offer = saved);
    }
  }

  void _goTo(int block) {
    final target = _blockKeys[block]?.currentContext;
    if (target != null) Scrollable.ensureVisible(target, alignment: 0.08);
    _afterLayout(_remember);
  }

  void _answerOffer({required bool resume}) {
    final offer = _offer;
    setState(() => _offer = null);
    if (resume && offer != null) {
      _afterLayout(() => _goTo(offer.block));
    } else {
      _afterLayout(_remember);
    }
  }

  /// The first block whose bottom is below the top of the page.
  int _topBlock() {
    final top = MediaQuery.paddingOf(context).top + 52;
    final indexes = _blockKeys.keys.toList()..sort();
    for (final index in indexes) {
      final box = _blockKeys[index]?.currentContext?.findRenderObject();
      if (box is RenderBox &&
          box.attached &&
          box.localToGlobal(Offset(0, box.size.height)).dy > top) {
        return index;
      }
    }
    return 0;
  }

  /// Saves where reading is now. At the end of a chapter the spot moves to
  /// the next one, or is cleared after the last.
  void _remember() {
    if (_offer != null || !_scroll.hasClients) return;
    final state = context.read<ReaderBloc>().state;
    final text = state.text;
    if (text is! ReaderTextLoaded) return;
    // The voice keeps the spot on its sentence.
    if (_heardHere(context.read<ListenBloc>().state, state.option)) return;
    final position = _scroll.position;
    final finished =
        position.maxScrollExtent <= 0 ||
        position.pixels >= position.maxScrollExtent - 24;
    if (finished) {
      final next = widget.next;
      if (next == null) {
        unawaited(_spots.clear(widget.book.bookId));
      } else {
        unawaited(
          _spots.record(
            widget.book.bookId,
            ReadingSpot(
              chapterId: next.chapterId,
              chapterLabel: chapterName(next),
              minutesLeft: next.minutes,
            ),
          ),
        );
      }
      return;
    }
    final block = _topBlock();
    unawaited(
      _spots.record(
        widget.book.bookId,
        ReadingSpot(
          chapterId: widget.chapter.chapterId,
          chapterLabel: chapterName(widget.chapter),
          minutesLeft: (state.option.minutes * (1 - _read)).ceil(),
          option: state.option,
          block: block,
          quote: text.text.blocks[block].text,
        ),
      ),
    );
  }

  void _reveal(SpokenSentence sentence) {
    final paragraph = _blockKeys[sentence.block]?.currentContext
        ?.findRenderObject();
    if (paragraph is! RenderParagraph || !_scroll.hasClients) return;
    final boxes = paragraph.getBoxesForSelection(
      TextSelection(baseOffset: sentence.start, extentOffset: sentence.end),
    );
    final target = RenderAbstractViewport.of(paragraph).getOffsetToReveal(
      paragraph,
      0.3,
      rect: boxes.isEmpty ? null : boxes.first.toRect(),
    );
    _scroll.animateTo(
      target.offset.clamp(0, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  /// One tap clears a held sentence, or else shows or hides the tools.
  void _tapPage() => setState(() {
    if (_picked != null) {
      _picked = null;
    } else {
      _tools = !_tools;
    }
  });

  void _pick(List<TextBlock> blocks, int block, int offset, Offset global) {
    final plan = planSpeech(blocks);
    final stack = _stack.currentContext?.findRenderObject();
    if (plan.isEmpty || stack is! RenderBox) return;
    HapticFeedback.selectionClick();
    setState(
      () => _picked = (
        sentence: plan[sentenceAt(plan, block, offset)],
        at: stack.globalToLocal(global),
      ),
    );
  }

  void _listenFromPicked(List<TextBlock> blocks) {
    final picked = _picked;
    if (picked == null) return;
    setState(() => _picked = null);
    context.read<ListenBloc>().add(
      ListenRequested(
        blocks,
        source: _source(context.read<ReaderBloc>().state.option),
        block: picked.sentence.block,
        offset: picked.sentence.start,
      ),
    );
  }

  bool _onScroll(ScrollUpdateNotification update, bool listening) {
    // Only the reader's own drag hides the tools, not the scroll that follows speech.
    if (update.dragDetails == null) return false;
    final hideTools = _tools && !listening;
    if (hideTools || _picked != null || _offer != null) {
      setState(() {
        if (hideTools) _tools = false;
        _picked = null;
        // Scrolling on answers the question: reading goes on from here.
        _offer = null;
      });
    }
    return false;
  }

  void _chooseVersion(LengthOption option) {
    if (_scroll.hasClients) _scroll.jumpTo(0);
    final listen = context.read<ListenBloc>();
    final shown = context.read<ReaderBloc>().state.option;
    if (_heardHere(listen.state, shown)) listen.add(const ListenStopped());
    context.read<ReaderBloc>().add(ReaderLengthChosen(option));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ReaderBloc>().state;
    final look = context.watch<ReadingLookCubit>().state;
    final colors = _colorsOf(look.paper);
    final voice = context.watch<ListenBloc>().state;
    final listening = _heardHere(voice, state.option);
    final listen = listening ? voice.stage : const ListenOff();
    final marked =
        (listen is ListenPlaying ? listen.sentence : null) ?? _picked?.sentence;
    final loaded = switch (state.text) {
      ReaderTextLoaded(:final text) => text,
      _ => null,
    };
    // With nothing to read yet, or while listening, the tools stay up.
    final tools = _tools || loaded == null || listening;
    final minutesLeft = (state.option.minutes * (1 - _read)).ceil();
    final shortened = state.option.length != ReadingLength.original;
    final safe = MediaQuery.paddingOf(context);
    final picked = _picked;

    return MultiBlocListener(
      listeners: [
        BlocListener<ReaderBloc, ReaderState>(listener: _onText),
        BlocListener<ListenBloc, ListenState>(
          listenWhen: (before, after) {
            final was = before.stage;
            final now = after.stage;
            return now is ListenPlaying &&
                (was is! ListenPlaying || was.index != now.index);
          },
          listener: (context, listening) {
            final option = context.read<ReaderBloc>().state.option;
            if (listening.stage case ListenPlaying(
              :final sentence,
            ) when _heardHere(listening, option)) {
              _reveal(sentence);
            }
          },
        ),
        // After listening, Nghe stays one tap away.
        BlocListener<ListenBloc, ListenState>(
          listenWhen: (before, after) =>
              before.stage is! ListenOff && after.stage is ListenOff,
          listener: (_, _) => setState(() => _tools = true),
        ),
      ],
      child: Scaffold(
        backgroundColor: colors.paper,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                key: _stack,
                children: [
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: _marginLine + 3,
                    child: _Margin(
                      read: _read,
                      track: colors.track,
                      minutesLeft: loaded == null ? null : minutesLeft,
                      highest: safe.top + 64,
                    ),
                  ),
                  Positioned.fill(
                    left: _textLeft,
                    child: NotificationListener<ScrollEndNotification>(
                      onNotification: (_) {
                        _remember();
                        return false;
                      },
                      child: NotificationListener<ScrollUpdateNotification>(
                        onNotification: (update) =>
                            _onScroll(update, listening),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: _tapPage,
                          child: switch (state.text) {
                            ReaderTextLoading() => _Waiting(
                              shortened: shortened,
                              color: colors.muted,
                            ),
                            ReaderTextFailed(:final code) => Center(
                              child: TextButton(
                                onPressed: () => context.read<ReaderBloc>().add(
                                  ReaderLengthChosen(state.option),
                                ),
                                child: Text('${errorMessage(code)} Thử lại'),
                              ),
                            ),
                            ReaderTextLoaded(:final text) =>
                              SingleChildScrollView(
                                controller: _scroll,
                                padding: EdgeInsets.fromLTRB(
                                  0,
                                  safe.top + 52,
                                  24,
                                  safe.bottom + 96,
                                ),
                                child: _Chapter(
                                  chapter: widget.chapter,
                                  blocks: text.blocks,
                                  blockKeys: _blockKeys,
                                  marked: marked,
                                  look: look,
                                  colors: colors,
                                  next: widget.next,
                                  onNext: widget.onNext,
                                  onHold: (block, offset, global) =>
                                      _pick(text.blocks, block, offset, global),
                                ),
                              ),
                          },
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    child: _Appear(
                      visible: tools,
                      child: _TopBar(
                        colors: colors,
                        options: widget.options,
                        selected: state.option,
                        onChoose: _chooseVersion,
                      ),
                    ),
                  ),
                  if (loaded != null)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _Appear(
                        visible: tools && !listening && _offer == null,
                        child: _ToolBar(
                          colors: colors,
                          minutesLeft: minutesLeft,
                          shortened: shortened,
                          onLook: () => showModalBottomSheet<void>(
                            context: context,
                            builder: (_) => const LookSheet(),
                          ),
                          onListen: () => context.read<ListenBloc>().add(
                            ListenRequested(
                              loaded.blocks,
                              source: _source(state.option),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (_offer case final offer?
                      when loaded != null && !listening)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _ResumeOffer(
                        colors: colors,
                        quote: loaded.blocks[offer.block].text,
                        onResume: () => _answerOffer(resume: true),
                        onStartOver: () => _answerOffer(resume: false),
                      ),
                    ),
                  if (picked != null && loaded != null)
                    _ListenHere(
                      at: picked.at,
                      highest: safe.top + 8,
                      width: MediaQuery.sizeOf(context).width,
                      onTap: () => _listenFromPicked(loaded.blocks),
                    ),
                ],
              ),
            ),
            if (listening)
              ListenPanel(
                blocks: loaded?.blocks ?? const [],
                source: _source(state.option),
                minutes: state.option.minutes,
              )
            else
              const MiniPlayer(),
          ],
        ),
      ),
    );
  }
}

/// Fades the tools in and out; gone means gone, not just transparent.
class _Appear extends StatelessWidget {
  const _Appear({required this.visible, required this.child});

  final bool visible;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: const Duration(milliseconds: 180),
    child: visible ? child : const SizedBox.shrink(),
  );
}

class _Waiting extends StatelessWidget {
  const _Waiting({required this.shortened, required this.color});

  final bool shortened;
  final Color color;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const CircularProgressIndicator(),
        if (shortened) ...[
          const SizedBox(height: 16),
          Text(
            'AI đang rút gọn chương, thường mất 15–30 giây.',
            style: readingStyle(size: 13, color: color),
          ),
        ],
      ],
    ),
  );
}

class _Chapter extends StatelessWidget {
  const _Chapter({
    required this.chapter,
    required this.blocks,
    required this.blockKeys,
    required this.marked,
    required this.look,
    required this.colors,
    required this.next,
    required this.onNext,
    required this.onHold,
  });

  final ChapterSummary chapter;
  final List<TextBlock> blocks;
  final Map<int, GlobalKey> blockKeys;
  final SpokenSentence? marked;
  final ReadingLook look;
  final _PageColors colors;
  final ChapterSummary? next;
  final VoidCallback? onNext;
  final void Function(int block, int offset, Offset global) onHold;

  @override
  Widget build(BuildContext context) {
    final (:number, :title) = chapterHeading(chapter);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (number != null) ...[
          Text(number, style: readingStyle(size: 12.5, color: colors.muted)),
          const SizedBox(height: 4),
        ],
        Text(
          title,
          style: readingStyle(
            size: 22,
            height: 1.3,
            weight: FontWeight.w600,
            color: colors.title,
          ),
        ),
        const SizedBox(height: 14),
        for (final (index, block) in blocks.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: _Block(
              textKey: blockKeys.putIfAbsent(index, GlobalKey.new),
              block: block,
              marked: marked?.block == index ? marked : null,
              look: look,
              colors: colors,
              onHold: (offset, global) => onHold(index, offset, global),
            ),
          ),
        const SizedBox(height: 28),
        _ChapterEnd(
          chapter: chapter,
          next: next,
          onNext: onNext,
          colors: colors,
        ),
      ],
    );
  }
}

/// A block of the chapter, with the sentence being read or held in yellow marker.
/// Holding it reports the character under the finger.
class _Block extends StatelessWidget {
  const _Block({
    required this.textKey,
    required this.block,
    required this.marked,
    required this.look,
    required this.colors,
    required this.onHold,
  });

  final GlobalKey textKey;
  final TextBlock block;
  final SpokenSentence? marked;
  final ReadingLook look;
  final _PageColors colors;
  final void Function(int offset, Offset global) onHold;

  bool get _heading => block.kind == TextBlockKind.heading;

  Widget _text() {
    if (_heading) {
      return Text(
        displayTitle(block.text),
        key: textKey,
        style: readingStyle(
          size: look.size.points + 1,
          weight: FontWeight.w600,
          color: marked == null ? colors.title : Palette.text,
        ).copyWith(backgroundColor: marked == null ? null : Palette.marker),
      );
    }
    final style = readingStyle(
      size: look.size.points,
      height: look.spacing.factor,
      color: colors.text,
    );
    final sentence = marked;
    if (sentence == null) return Text(block.text, key: textKey, style: style);
    return Text.rich(
      key: textKey,
      TextSpan(
        style: style,
        children: [
          TextSpan(text: block.text.substring(0, sentence.start)),
          TextSpan(
            text: block.text.substring(sentence.start, sentence.end),
            // Dark text on the marker, whatever the paper.
            style: const TextStyle(
              backgroundColor: Palette.marker,
              color: Palette.text,
            ),
          ),
          TextSpan(text: block.text.substring(sentence.end)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onLongPressStart: (details) {
      final paragraph = textKey.currentContext?.findRenderObject();
      // A heading's displayed title is not its stored text, so offsets differ.
      final offset = paragraph is RenderParagraph && !_heading
          ? paragraph.getPositionForOffset(details.localPosition).offset
          : 0;
      onHold(offset, details.globalPosition);
    },
    child: _text(),
  );
}

class _ChapterEnd extends StatelessWidget {
  const _ChapterEnd({
    required this.chapter,
    required this.next,
    required this.onNext,
    required this.colors,
  });

  final ChapterSummary chapter;
  final ChapterSummary? next;
  final VoidCallback? onNext;
  final _PageColors colors;

  @override
  Widget build(BuildContext context) {
    final next = this.next;
    final onNext = this.onNext;
    void backToChapters() => Navigator.of(context).pop();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: Transform.rotate(
            angle: -0.035,
            alignment: Alignment.centerLeft,
            child: Text(
              'Xong ${chapterName(chapter)}',
              style: handStyle(size: 30),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          next == null
              ? 'Đây là chương cuối.'
              : 'Tiếp theo là ${chapterName(next)}, dài ${durationLabel(next.minutes)}.',
          style: readingStyle(size: 14, color: colors.muted),
        ),
        const SizedBox(height: 18),
        if (next != null && onNext != null) ...[
          PrimaryButton(label: 'Đọc ${chapterName(next)}', onPressed: onNext),
          const SizedBox(height: 4),
          TextButton(
            onPressed: backToChapters,
            child: Text(
              'Về danh sách chương',
              style: readingStyle(
                size: 15,
                weight: FontWeight.w600,
                color: colors.title,
              ),
            ),
          ),
        ] else
          PrimaryButton(
            label: 'Về danh sách chương',
            onPressed: backToChapters,
          ),
      ],
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.colors,
    required this.options,
    required this.selected,
    required this.onChoose,
  });

  final _PageColors colors;
  final List<LengthOption> options;
  final LengthOption selected;
  final ValueChanged<LengthOption> onChoose;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: colors.paper,
      border: Border(bottom: BorderSide(color: colors.line)),
    ),
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.only(left: 8, right: 10),
        child: Row(
          children: [
            BackButton(color: colors.title),
            const Spacer(),
            if (options.length > 1)
              for (final option in options)
                _VersionTab(
                  option: option,
                  selected: option == selected,
                  muted: colors.muted,
                  onTap: () => onChoose(option),
                ),
          ],
        ),
      ),
    ),
  );
}

class _ToolBar extends StatelessWidget {
  const _ToolBar({
    required this.colors,
    required this.minutesLeft,
    required this.shortened,
    required this.onLook,
    required this.onListen,
  });

  final _PageColors colors;
  final int minutesLeft;
  final bool shortened;
  final VoidCallback onLook;
  final VoidCallback onListen;

  @override
  Widget build(BuildContext context) {
    final action = readingStyle(
      size: 15,
      weight: FontWeight.w600,
      color: colors.title,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.paper,
        border: Border(top: BorderSide(color: colors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(_textLeft, 10, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'còn ${durationLabel(minutesLeft)}',
                      style: handStyle(size: 20),
                    ),
                    if (shortened)
                      Text(
                        'AI viết lại từ bản gốc',
                        style: readingStyle(size: 12.5, color: colors.muted),
                      ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onLook,
                child: Text('Aa', style: action),
              ),
              TextButton(
                onPressed: onListen,
                child: Text('Nghe', style: action),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Asks whether to go back to where reading stopped last time.
class _ResumeOffer extends StatelessWidget {
  const _ResumeOffer({
    required this.colors,
    required this.quote,
    required this.onResume,
    required this.onStartOver,
  });

  final _PageColors colors;
  final String quote;
  final VoidCallback onResume;
  final VoidCallback onStartOver;

  @override
  Widget build(BuildContext context) {
    final text = quote.trim();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.paper,
        border: Border(top: BorderSide(color: colors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(_textLeft, 14, 16, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Lần trước bạn đọc đến',
                style: readingStyle(size: 12.5, color: colors.muted),
              ),
              const SizedBox(height: 4),
              Text(
                '“$text”',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: readingStyle(size: 15, height: 1.45, color: colors.text),
              ),
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                children: [
                  TextButton(
                    onPressed: onStartOver,
                    child: Text(
                      'Đọc từ đầu',
                      style: readingStyle(
                        size: 15,
                        weight: FontWeight.w600,
                        color: colors.title,
                      ),
                    ),
                  ),
                  FilledButton(
                    onPressed: onResume,
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.button,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text(
                      'Đọc tiếp',
                      style: readingStyle(
                        size: 15,
                        weight: FontWeight.w600,
                        color: colors.onButton,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The one action offered on a held sentence.
class _ListenHere extends StatelessWidget {
  const _ListenHere({
    required this.at,
    required this.highest,
    required this.width,
    required this.onTap,
  });

  final Offset at;
  final double highest;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final above = at.dy - 68;
    return Positioned(
      left: (at.dx - 40).clamp(12, width - 200),
      // Under the finger when there is no room above it.
      top: above < highest ? at.dy + 28 : above,
      child: Material(
        color: Palette.ink,
        borderRadius: BorderRadius.circular(14),
        elevation: 2,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
            child: Text(
              'Nghe từ câu này',
              style: readingStyle(
                size: 15,
                weight: FontWeight.w600,
                color: Palette.sheet,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The red margin line, filled as far as the reader has read, with the
/// minutes left written beside where it ends.
class _Margin extends StatelessWidget {
  const _Margin({
    required this.read,
    required this.track,
    required this.minutesLeft,
    required this.highest,
  });

  final double read;
  final Color track;
  final int? minutesLeft;

  /// Keeps the minutes clear of the status bar at the start of a chapter.
  final double highest;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final height = constraints.maxHeight;
      final reached = height * read.clamp(0, 1);
      final minutes = minutesLeft;
      return Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: 0,
            top: 0,
            bottom: 0,
            width: 3,
            child: ColoredBox(color: track),
          ),
          Positioned(
            right: 0,
            top: 0,
            height: reached,
            width: 3,
            child: const ColoredBox(color: Palette.red),
          ),
          if (minutes != null)
            Positioned(
              right: 7,
              top: (reached - 10).clamp(highest, height - 24),
              child: Text("$minutes'", style: handStyle(size: 20, height: 1)),
            ),
        ],
      );
    },
  );
}

class _VersionTab extends StatelessWidget {
  const _VersionTab({
    required this.option,
    required this.selected,
    required this.muted,
    required this.onTap,
  });

  final LengthOption option;
  final bool selected;
  final Color muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          child: Container(
            padding: const EdgeInsets.only(bottom: 1),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: selected ? Palette.red : Colors.transparent,
                  width: 2,
                ),
              ),
            ),
            child: Text(
              option.length == ReadingLength.original
                  ? 'gốc'
                  : "${option.minutes}'",
              style: handStyle(size: 21, color: selected ? Palette.red : muted),
            ),
          ),
        ),
      ),
    );
  }
}
