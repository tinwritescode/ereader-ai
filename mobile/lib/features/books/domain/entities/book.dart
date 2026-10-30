class Book {
  const Book({
    required this.bookId,
    required this.title,
    required this.author,
    required this.status,
    required this.chapterCount,
    required this.minutes,
  });

  final String bookId;
  final String title;
  final String? author;
  final String status;
  final int chapterCount;
  final int minutes;
}
