class Book {
  const Book({
    required this.bookId,
    required this.title,
    required this.author,
    required this.status,
    required this.chapterCount,
    required this.minutes,
    this.coverUrl,
    this.language,
  });

  final String bookId;
  final String title;
  final String? author;
  final String status;
  final int chapterCount;
  final int minutes;

  /// The cover the EPUB carries; null when it has none.
  final String? coverUrl;

  /// The language the EPUB declares, e.g. "en"; null when it says none.
  final String? language;

  /// Declared in a language other than Vietnamese, so it can be translated.
  bool get isForeign {
    final language = this.language?.toLowerCase();
    return language != null && !language.startsWith('vi');
  }
}
