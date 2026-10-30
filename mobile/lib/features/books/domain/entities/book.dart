class Book {
  const Book({
    required this.bookId,
    required this.title,
    required this.author,
    required this.status,
    required this.chapterCount,
    required this.minutes,
    this.coverUrl,
  });

  final String bookId;
  final String title;
  final String? author;
  final String status;
  final int chapterCount;
  final int minutes;

  /// The cover the EPUB carries; null when it has none.
  final String? coverUrl;
}
