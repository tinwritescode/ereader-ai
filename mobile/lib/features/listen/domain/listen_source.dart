import '../../books/domain/entities/book.dart';
import '../../books/domain/entities/chapter.dart';
import '../../books/domain/entities/reading_length.dart';

/// What the voice is reading, so it can go on after the reader closes.
class ListenSource {
  const ListenSource({
    required this.book,
    required this.chapter,
    required this.option,
    required this.next,
  });

  final Book book;
  final ChapterSummary chapter;
  final LengthOption option;

  /// The chapter after this one; null on the last chapter.
  final ChapterSummary? next;
}
