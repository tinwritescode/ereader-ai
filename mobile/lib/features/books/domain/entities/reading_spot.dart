import 'reading_length.dart';

/// Where reading stopped in one book.
class ReadingSpot {
  const ReadingSpot({
    required this.chapterId,
    required this.chapterLabel,
    required this.minutesLeft,
    this.option,
    this.block = 0,
  });

  final String chapterId;

  /// Shown in the library, e.g. "Chương Hai".
  final String chapterLabel;
  final int minutesLeft;

  /// The version being read; null when the chapter is next but not yet opened.
  final LengthOption? option;

  /// The first block at the top of the page when reading stopped.
  final int block;
}
