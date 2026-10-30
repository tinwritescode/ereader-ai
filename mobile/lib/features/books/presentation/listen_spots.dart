import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../listen/presentation/listen_bloc.dart';
import '../domain/entities/reading_spot.dart';
import 'formatting.dart';
import 'reading_spots_cubit.dart';

/// Keeps the reading spot on the sentence being heard, on any screen.
class ListenSpots extends StatelessWidget {
  const ListenSpots({super.key, required this.child});

  final Widget child;

  void _onListen(BuildContext context, ListenState state) {
    final spots = context.read<ReadingSpotsCubit>();
    final source = state.source;
    if (source == null) return;
    final bookId = source.book.bookId;
    final next = source.next;
    if (state.stage case ListenPlaying(:final sentence)) {
      unawaited(
        spots.record(
          bookId,
          ReadingSpot(
            chapterId: source.chapter.chapterId,
            chapterLabel: chapterName(source.chapter),
            minutesLeft: (source.option.minutes * (1 - state.done)).ceil(),
            option: source.option,
            block: sentence.block,
            offset: sentence.start,
            quote: sentence.text,
            listened: true,
          ),
        ),
      );
    } else if (next == null) {
      unawaited(spots.clear(bookId));
    } else {
      unawaited(
        spots.record(
          bookId,
          ReadingSpot(
            chapterId: next.chapterId,
            chapterLabel: chapterName(next),
            minutesLeft: next.minutes,
            listened: true,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => BlocListener<ListenBloc, ListenState>(
    listenWhen: (before, after) {
      final was = before.stage;
      final now = after.stage;
      final reachedSentence =
          now is ListenPlaying &&
          (was is! ListenPlaying || was.index != now.index);
      final finished = was is! ListenOff && now is ListenOff && after.done == 1;
      return reachedSentence || finished;
    },
    listener: _onListen,
    child: child,
  );
}
