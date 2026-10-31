import '../../tasks/domain/chapter_task.dart';

/// What the book page offers about translating the whole book.
sealed class TranslateOffer {
  const TranslateOffer();
}

/// The book is in Vietnamese already, or says no language.
final class TranslateHidden extends TranslateOffer {
  const TranslateHidden();
}

/// The reader's plan has no book translations.
final class TranslateLocked extends TranslateOffer {
  const TranslateLocked();
}

final class TranslateOffered extends TranslateOffer {
  const TranslateOffered();
}

final class TranslateUnderWay extends TranslateOffer {
  const TranslateUnderWay(this.task);

  final BookTranslationTask task;
}

/// Stopped on our side; going on costs nothing.
final class TranslateStopped extends TranslateOffer {
  const TranslateStopped(this.task);

  final BookTranslationTask task;
}

final class TranslateDone extends TranslateOffer {
  const TranslateDone();
}

/// [monthly] is the plan's book translations a month; [standing] is null until loaded.
TranslateOffer translateOfferFor({
  required bool foreign,
  required int chapterCount,
  required int monthly,
  required BookTranslation? standing,
}) {
  if (!foreign) return const TranslateHidden();
  final task = standing?.task;
  if (task != null && task.active) return TranslateUnderWay(task);
  if (task != null && task.state == TaskState.stopped) {
    return TranslateStopped(task);
  }
  if (standing != null && standing.translated.length >= chapterCount) {
    return const TranslateDone();
  }
  if (monthly == 0) return const TranslateLocked();
  return const TranslateOffered();
}
