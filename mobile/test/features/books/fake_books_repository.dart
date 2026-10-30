import 'dart:async';

import 'package:ereader_mobile/features/books/domain/entities/book.dart';
import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/features/books/domain/repositories/books_repository.dart';

const loeb = Book(
  bookId: 'book-1',
  title: 'The Battle for Investment Survival',
  author: 'Gerald M. Loeb',
  status: 'READY',
  chapterCount: 2,
  minutes: 12,
);

const chapterOne = ChapterSummary(
  chapterId: 'book-1-c0',
  label: 'Chương Một',
  subtitle: 'NÓ ĐÒI HỎI KIẾN THỨC, KINH NGHIỆM VÀ NĂNG KHIẾU',
  minutes: 8,
);

const chapterSix = ChapterSummary(
  chapterId: 'book-1-c1',
  label: 'Chương Sáu',
  subtitle: null,
  minutes: 4,
);

/// In-memory backend with Loeb's first chapters. Records the shortened versions asked for.
class FakeBooksRepository implements BooksRepository {
  FakeBooksRepository({
    List<Book>? shelf,
    this.importResult = loeb,
    this.importError,
    this.uploadProgress = const [],
    this.shortenedError,
  }) : shelf = shelf ?? [];

  final List<Book> shelf;
  final Book importResult;
  final BooksException? importError;
  final List<double> uploadProgress;
  final BooksException? shortenedError;
  final shortenedRequests = <({String chapterId, int minutes})>[];

  /// When set, shortened versions wait for it, like a slow AI call.
  Completer<void>? shortenedGate;

  @override
  Future<Book> importEpub(
    EpubSource source, {
    required void Function(double progress) onProgress,
  }) async {
    uploadProgress.forEach(onProgress);
    final error = importError;
    if (error != null) throw error;
    return importResult;
  }

  @override
  Future<List<Book>> books() async => shelf;

  @override
  Future<List<ChapterSummary>> chapters(String bookId) async => [
    chapterOne,
    chapterSix,
  ];

  @override
  Future<ChapterText> original(String chapterId) async => ChapterText([
    const TextBlock(
      TextBlockKind.paragraph,
      'Tôi thực sự tin rằng, không có gì khó khăn hơn việc kiếm lợi nhuận.',
    ),
    // Chapter One is long enough to scroll, so a reading spot can sit inside it.
    if (chapterId == chapterOne.chapterId)
      for (var i = 1; i <= 40; i++)
        TextBlock(TextBlockKind.paragraph, 'Đoạn $i của chương một.'),
  ]);

  @override
  Future<ChapterText> shortened(
    String chapterId, {
    required int minutes,
  }) async {
    shortenedRequests.add((chapterId: chapterId, minutes: minutes));
    await shortenedGate?.future;
    final error = shortenedError;
    if (error != null) throw error;
    return ChapterText([
      TextBlock(TextBlockKind.paragraph, 'Bản $minutes phút của $chapterId.'),
    ]);
  }
}
