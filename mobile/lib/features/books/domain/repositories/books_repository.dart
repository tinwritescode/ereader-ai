import '../entities/book.dart';
import '../entities/chapter.dart';
import '../entities/epub_source.dart';

/// Carries the backend's stable error code, e.g. `EPUB_INVALID` or `FILE_TOO_LARGE`.
class BooksException implements Exception {
  const BooksException(this.code);

  final String code;

  @override
  String toString() => 'BooksException($code)';
}

/// Every method throws [BooksException] when the server rejects the call or cannot be reached.
abstract interface class BooksRepository {
  Future<Book> importEpub(
    EpubSource source, {
    required void Function(double progress) onProgress,
  });

  Future<List<Book>> books();

  Future<List<ChapterSummary>> chapters(String bookId);

  Future<ChapterText> original(String chapterId);

  Future<ChapterText> shortened(String chapterId, {required int minutes});

  /// The chapter in Vietnamese; throws `TRANSLATION_NOT_READY` until it is translated.
  Future<ChapterText> translated(String chapterId);
}
