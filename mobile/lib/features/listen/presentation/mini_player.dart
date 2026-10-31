import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/formatting.dart';
import '../../books/presentation/widgets.dart';
import '../domain/listen_source.dart';
import 'listen_bloc.dart';
import 'listen_panel.dart';

String _line(ListenStage stage) => switch (stage) {
  ListenPlaying(:final sentence) => sentence.text,
  ListenFailed() => 'Chưa đọc được đoạn này',
  ListenNeedsVoice() => 'Cần tải giọng đọc',
  ListenDownloading(:final progress) =>
    'Đang tải giọng đọc, ${(progress * 100).floor()}%',
  ListenPreparing(:final ready, :final needed, :final slow) => preparingLine(
    ready,
    needed,
    slow: slow,
  ),
  ListenOff() => preparingLine(0, 0),
};

/// The voice's bar on every page outside its own chapter. Takes no room while
/// nothing is being read.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key, this.onOpen});

  /// Goes to the chapter being read; null keeps the bar to its buttons.
  final ValueChanged<ListenSource>? onOpen;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ListenBloc>().state;
    final source = state.heard;
    if (source == null) return const SizedBox.shrink();
    final bloc = context.read<ListenBloc>();
    final stage = state.stage;
    final onOpen = this.onOpen;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
        child: Material(
          color: Palette.night,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onOpen == null ? null : () => onOpen(source),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 4, 8),
                  child: Row(
                    children: [
                      BookCover(book: source.book, width: 34),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _line(stage),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: readingStyle(
                                size: 13.5,
                                color: Palette.nightText,
                              ),
                            ),
                            Text(
                              '${chapterName(source.chapter)}, ${state.voice.label}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: readingStyle(
                                size: 12,
                                color: Palette.nightMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (stage is ListenPlaying)
                        IconButton(
                          tooltip: stage.paused ? 'Đọc tiếp' : 'Tạm dừng',
                          color: Palette.nightText,
                          onPressed: () => bloc.add(const ListenPauseToggled()),
                          icon: Icon(
                            stage.paused ? Icons.play_arrow : Icons.pause,
                          ),
                        ),
                      IconButton(
                        tooltip: 'Tắt giọng đọc',
                        color: Palette.nightText,
                        onPressed: () => bloc.add(const ListenStopped()),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                LinearProgressIndicator(
                  value: state.done,
                  minHeight: 3,
                  color: Palette.marker,
                  backgroundColor: Palette.nightRule,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
