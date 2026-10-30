import 'reading_length.dart';

/// Where reading stopped in one book.
class ReadingSpot {
  const ReadingSpot({
    required this.chapterId,
    required this.chapterLabel,
    required this.minutesLeft,
    this.option,
    this.block = 0,
    this.offset = 0,
    this.quote,
    this.listened = false,
  });

  final String chapterId;

  /// Shown in the library, e.g. "Chương Hai".
  final String chapterLabel;
  final int minutesLeft;

  /// The version being read; null when the chapter is next but not yet opened.
  final LengthOption? option;

  /// The first block at the top of the page when reading stopped.
  final int block;

  /// The character the voice stopped at inside [block].
  final int offset;

  /// The words reading stopped on; null when the chapter is not yet opened.
  final String? quote;

  /// The voice got here, so going on means listening.
  final bool listened;
}
