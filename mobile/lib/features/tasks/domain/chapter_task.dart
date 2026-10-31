enum TaskState { queued, running, done, stopped }

/// Long work the server does for the reader, followed on the task page.
sealed class LongTask {
  const LongTask({
    required this.id,
    required this.bookId,
    required this.bookTitle,
    required this.state,
    required this.code,
    required this.position,
    required this.createdAt,
    required this.finishedAt,
  });

  final String id;
  final String bookId;
  final String bookTitle;
  final TaskState state;

  /// Why it stopped.
  final String? code;

  /// Place in the queue, from 1; null unless queued.
  final int? position;
  final DateTime createdAt;
  final DateTime? finishedAt;

  bool get active => state == TaskState.queued || state == TaskState.running;

  int get percent;
}

/// Reading a whole chapter into stored audio on the server.
final class ChapterVoiceTask extends LongTask {
  const ChapterVoiceTask({
    required super.id,
    required super.bookId,
    required this.chapterId,
    required super.bookTitle,
    required this.chapterLabel,
    required this.minutes,
    required this.voiceCode,
    required this.voiceName,
    required super.state,
    required super.code,
    required this.done,
    required this.total,
    required super.position,
    required super.createdAt,
    required super.finishedAt,
  });

  final String chapterId;
  final String chapterLabel;

  /// The shortened length this was made for; null for a whole chapter.
  final int? minutes;
  final String voiceCode;
  final String voiceName;
  final int done;
  final int total;

  @override
  int get percent => total == 0 ? 0 : (done * 100 / total).floor();
}

/// Translating a whole book into Vietnamese, chapter by chapter.
final class BookTranslationTask extends LongTask {
  const BookTranslationTask({
    required super.id,
    required super.bookId,
    required super.bookTitle,
    required super.state,
    required super.code,
    required super.position,
    required super.createdAt,
    required super.finishedAt,
    required this.done,
    required this.total,
    required this.percent,
    required this.current,
    required this.waiting,
  });

  /// Chapters translated, of [total].
  final int done;
  final int total;

  /// Share of the words translated, weighed by chapter length.
  @override
  final int percent;

  /// The chapter being translated, and how far along it is.
  final ({String chapterId, int percent})? current;

  /// Chapters still to come, in order, [current] first.
  final List<String> waiting;

  ChapterTurn turnOf(String chapterId) => !active
      ? ChapterTurn.none
      : current?.chapterId == chapterId
      ? ChapterTurn.now
      : waiting.contains(chapterId)
      ? ChapterTurn.later
      : ChapterTurn.none;
}

/// Where a chapter stands in a book's translation.
enum ChapterTurn {
  /// Being translated right now.
  now,

  /// Waiting its turn.
  later,

  /// Not part of what is under way.
  none,
}

/// Where a book's translation stands.
class BookTranslation {
  const BookTranslation({required this.translated, required this.task});

  final Set<String> translated;

  /// The newest task for the book; null when there has been none lately.
  final BookTranslationTask? task;
}

/// What the reader asks to have prepared.
class ChapterVoiceJob {
  const ChapterVoiceJob({
    required this.bookId,
    required this.chapterId,
    required this.bookTitle,
    required this.chapterLabel,
    required this.minutes,
    required this.voiceCode,
    required this.sentences,
  });

  final String bookId;
  final String chapterId;
  final String bookTitle;
  final String chapterLabel;
  final int? minutes;
  final String voiceCode;

  /// Exactly as the player will ask for them, so the audio is found later.
  final List<String> sentences;
}

/// Carries the backend's stable error code.
class TasksException implements Exception {
  const TasksException(this.code);

  final String code;
}

/// Every method throws [TasksException] when the call fails.
abstract interface class TasksRepository {
  /// Every kind of task, oldest first.
  Future<List<LongTask>> tasks();

  Future<ChapterVoiceTask> create(ChapterVoiceJob job);

  /// Starts from [startChapterId], the chapter being read, when given.
  Future<BookTranslationTask> translateBook(
    String bookId, {
    String? startChapterId,
  });

  Future<BookTranslation> translationOf(String bookId);

  /// Moves a waiting chapter to the front of the book's line.
  Future<void> putFirst(String taskId, String chapterId);

  Future<void> cancel(LongTask task);

  Future<void> resume(LongTask task);
}

/// Remembers on this device which finishes the reader was told about.
abstract interface class TaskNoticeStore {
  Future<Set<String>> load();

  Future<void> save(Set<String> seen);
}
