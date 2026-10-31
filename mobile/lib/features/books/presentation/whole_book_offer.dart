import '../../tasks/domain/chapter_task.dart';

/// What the book page offers about one whole-book task.
sealed class WholeBookOffer {
  const WholeBookOffer();
}

/// Does not apply to this book.
final class OfferHidden extends WholeBookOffer {
  const OfferHidden();
}

/// The reader's plan does not have it.
final class OfferLocked extends WholeBookOffer {
  const OfferLocked();
}

final class OfferOpen extends WholeBookOffer {
  const OfferOpen();
}

final class OfferUnderWay extends WholeBookOffer {
  const OfferUnderWay(this.task);

  final WholeBookTask task;
}

/// Stopped part way; going on is always allowed.
final class OfferStopped extends WholeBookOffer {
  const OfferStopped(this.task);

  final WholeBookTask task;
}

final class OfferDone extends WholeBookOffer {
  const OfferDone();
}

WholeBookOffer? _ofTask(WholeBookTask? task) => switch (task) {
  null => null,
  _ when task.active => OfferUnderWay(task),
  _ when task.state == TaskState.stopped => OfferStopped(task),
  _ => null,
};

/// [monthly] is the plan's book translations a month; [standing] is null until loaded.
WholeBookOffer translateOfferFor({
  required bool foreign,
  required int chapterCount,
  required int monthly,
  required BookTranslation? standing,
}) {
  if (!foreign) return const OfferHidden();
  if (_ofTask(standing?.task) case final offer?) return offer;
  if (standing != null && standing.translated.length >= chapterCount) {
    return const OfferDone();
  }
  if (monthly == 0) return const OfferLocked();
  return const OfferOpen();
}

/// [allowed] is whether the plan has it; [standing] is null until loaded.
WholeBookOffer voiceOfferFor({
  required bool allowed,
  required BookVoice? standing,
}) {
  final task = standing?.task;
  if (_ofTask(task) case final offer?) return offer;
  if (task?.state == TaskState.done && standing?.skipped == 0) {
    return const OfferDone();
  }
  return allowed ? const OfferOpen() : const OfferLocked();
}

/// About how many of [chapters] the [left] minutes pay for.
int chaptersWithin({
  required int chapters,
  required int minutes,
  required int left,
}) => left >= minutes ? chapters : chapters * left ~/ minutes;
