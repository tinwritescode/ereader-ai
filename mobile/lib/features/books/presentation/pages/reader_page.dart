import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../../listen/domain/speech.dart';
import '../../../listen/domain/speech_plan.dart';
import '../../../listen/presentation/listen_bloc.dart';
import '../../../listen/presentation/listen_panel.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../../domain/repositories/books_repository.dart';
import '../bloc/reader_bloc.dart';
import '../formatting.dart';

class ReaderPage extends StatefulWidget {
  const ReaderPage({
    super.key,
    required this.chapter,
    required this.options,
    this.listen = false,
  });

  final ChapterSummary chapter;
  final List<LengthOption> options;

  /// Starts reading aloud as soon as the text has loaded.
  final bool listen;

  static Route<void> route({
    required BooksRepository repository,
    required Speech speech,
    required ChapterSummary chapter,
    required List<LengthOption> options,
    required LengthOption option,
    bool listen = false,
  }) {
    return MaterialPageRoute(
      builder: (_) => MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (_) => ReaderBloc(
              repository: repository,
              chapter: chapter,
              option: option,
            )..add(ReaderLengthChosen(option)),
          ),
          BlocProvider(create: (_) => ListenBloc(speech)),
        ],
        child: ReaderPage(chapter: chapter, options: options, listen: listen),
      ),
    );
  }

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  final _scroll = ScrollController();
  // One key per block, so the sentence being read can be found on the page.
  final _blockKeys = <int, GlobalKey>{};
  late bool _listenOnLoad = widget.listen;
  double _read = 0;

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

  void _listenIfAsked(BuildContext context, ReaderState state) {
    if (state.text case ReaderTextLoaded(:final text) when _listenOnLoad) {
      _listenOnLoad = false;
      context.read<ListenBloc>().add(ListenRequested(text.blocks));
    }
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

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ReaderBloc>().state;
    final listen = context.watch<ListenBloc>().state.stage;
    final spoken = listen is ListenPlaying ? listen.sentence : null;
    final minutesLeft = (state.option.minutes * (1 - _read)).ceil();
    final subtitle = widget.chapter.subtitle;
    final shortened = state.option.length != ReadingLength.original;

    return MultiBlocListener(
      listeners: [
        BlocListener<ReaderBloc, ReaderState>(listener: _listenIfAsked),
        BlocListener<ListenBloc, ListenState>(
          listenWhen: (before, after) {
            final was = before.stage;
            final now = after.stage;
            return now is ListenPlaying &&
                (was is! ListenPlaying || was.index != now.index);
          },
          listener: (_, listening) {
            if (listening.stage case ListenPlaying(:final sentence)) {
              _reveal(sentence);
            }
          },
        ),
      ],
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  children: [
                    // The red margin line doubles as reading progress.
                    Positioned(
                      left: 18,
                      top: 10,
                      bottom: 0,
                      width: 3,
                      child: _MarginProgress(read: _read),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(left: 30),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const BackButton(color: Palette.ink),
                              const Spacer(),
                              if (widget.options.length > 1)
                                for (final option in widget.options)
                                  _VersionTab(
                                    option: option,
                                    selected: option == state.option,
                                    onTap: () {
                                      if (_scroll.hasClients) _scroll.jumpTo(0);
                                      context.read<ListenBloc>().add(
                                        const ListenStopped(),
                                      );
                                      context.read<ReaderBloc>().add(
                                        ReaderLengthChosen(option),
                                      );
                                    },
                                  ),
                              const SizedBox(width: 10),
                            ],
                          ),
                          Expanded(
                            child: switch (state.text) {
                              ReaderTextLoading() => Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const CircularProgressIndicator(),
                                    if (shortened) ...[
                                      const SizedBox(height: 16),
                                      Text(
                                        'AI đang rút gọn chương, thường mất 15–30 giây.',
                                        style: readingStyle(
                                          size: 13,
                                          color: Palette.muted,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              ReaderTextFailed(:final code) => Center(
                                child: TextButton(
                                  onPressed: () => context
                                      .read<ReaderBloc>()
                                      .add(ReaderLengthChosen(state.option)),
                                  child: Text('${errorMessage(code)} Thử lại'),
                                ),
                              ),
                              ReaderTextLoaded(:final text) =>
                                SingleChildScrollView(
                                  controller: _scroll,
                                  padding: const EdgeInsets.fromLTRB(
                                    8,
                                    6,
                                    22,
                                    32,
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      if (subtitle != null) ...[
                                        Text(
                                          widget.chapter.label,
                                          style: readingStyle(
                                            size: 12.5,
                                            color: Palette.muted,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                      ],
                                      Text(
                                        displayTitle(
                                          subtitle ?? widget.chapter.label,
                                        ),
                                        style: readingStyle(
                                          size: 22,
                                          height: 1.3,
                                          weight: FontWeight.w600,
                                          color: Palette.ink,
                                        ),
                                      ),
                                      const SizedBox(height: 14),
                                      for (final (index, block)
                                          in text.blocks.indexed)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            bottom: 12,
                                          ),
                                          child: _Block(
                                            key: _blockKeys.putIfAbsent(
                                              index,
                                              GlobalKey.new,
                                            ),
                                            block: block,
                                            spoken: spoken?.block == index
                                                ? spoken
                                                : null,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                            },
                          ),
                          if (listen is ListenOff)
                            Container(
                              padding: const EdgeInsets.fromLTRB(8, 10, 22, 22),
                              decoration: const BoxDecoration(
                                border: Border(
                                  top: BorderSide(color: Palette.rule),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'còn ${durationLabel(minutesLeft)}',
                                    style: handStyle(size: 20),
                                  ),
                                  if (state.text case ReaderTextLoaded(
                                    :final text,
                                  ))
                                    TextButton.icon(
                                      onPressed: () => context
                                          .read<ListenBloc>()
                                          .add(ListenRequested(text.blocks)),
                                      icon: const Icon(
                                        Icons.volume_up,
                                        size: 18,
                                      ),
                                      label: Text(
                                        'Nghe',
                                        style: readingStyle(
                                          size: 15,
                                          weight: FontWeight.w600,
                                          color: Palette.ink,
                                        ),
                                      ),
                                    ),
                                  if (shortened)
                                    Flexible(
                                      child: Text(
                                        'AI viết lại từ bản gốc',
                                        textAlign: TextAlign.end,
                                        style: readingStyle(
                                          size: 12.5,
                                          color: Palette.muted,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (listen is! ListenOff)
                ListenPanel(
                  blocks: switch (state.text) {
                    ReaderTextLoaded(:final text) => text.blocks,
                    _ => const [],
                  },
                  minutes: state.option.minutes,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A block of the chapter, with the sentence being read in yellow marker.
class _Block extends StatelessWidget {
  const _Block({super.key, required this.block, required this.spoken});

  final TextBlock block;
  final SpokenSentence? spoken;

  @override
  Widget build(BuildContext context) {
    if (block.kind == TextBlockKind.heading) {
      return Text(
        displayTitle(block.text),
        style: readingStyle(
          size: 18,
          weight: FontWeight.w600,
        ).copyWith(backgroundColor: spoken == null ? null : Palette.marker),
      );
    }
    final style = readingStyle(size: 17, height: 1.7);
    final sentence = spoken;
    if (sentence == null) return Text(block.text, style: style);
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          TextSpan(text: block.text.substring(0, sentence.start)),
          TextSpan(
            text: block.text.substring(sentence.start, sentence.end),
            style: const TextStyle(backgroundColor: Palette.marker),
          ),
          TextSpan(text: block.text.substring(sentence.end)),
        ],
      ),
    );
  }
}

class _MarginProgress extends StatelessWidget {
  const _MarginProgress({required this.read});

  final double read;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(color: Palette.rose),
    child: Align(
      alignment: Alignment.topCenter,
      child: FractionallySizedBox(
        heightFactor: read.clamp(0, 1),
        widthFactor: 1,
        child: const ColoredBox(color: Palette.red),
      ),
    ),
  );
}

class _VersionTab extends StatelessWidget {
  const _VersionTab({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final LengthOption option;
  final bool selected;
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
              style: handStyle(
                size: 21,
                color: selected ? Palette.red : Palette.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
