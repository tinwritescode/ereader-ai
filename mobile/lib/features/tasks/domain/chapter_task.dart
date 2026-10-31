enum ChapterTaskState { queued, running, done, stopped }

/// Reading a whole chapter into stored audio on the server.
class ChapterTask {
  const ChapterTask({
    required this.id,
    required this.bookId,
    required this.chapterId,
    required this.bookTitle,
    required this.chapterLabel,
    required this.minutes,
    required this.voiceCode,
    required this.voiceName,
    required this.state,
    required this.code,
    required this.done,
    required this.total,
    required this.position,
    required this.finishedAt,
  });

  final String id;
  final String bookId;
  final String chapterId;
  final String bookTitle;
  final String chapterLabel;

  /// The shortened length this was made for; null for the original chapter.
  final int? minutes;
  final String voiceCode;
  final String voiceName;
  final ChapterTaskState state;

  /// Why it stopped.
  final String? code;
  final int done;
  final int total;

  /// Place in the queue, from 1; null unless queued.
  final int? position;
  final DateTime? finishedAt;

  bool get active =>
      state == ChapterTaskState.queued || state == ChapterTaskState.running;

  int get percent => total == 0 ? 0 : (done * 100 / total).floor();
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
  Future<List<ChapterTask>> tasks();

  Future<ChapterTask> create(ChapterVoiceJob job);

  Future<void> cancel(String id);

  Future<void> resume(String id);
}

/// Remembers on this device which finishes the reader was told about.
abstract interface class TaskNoticeStore {
  Future<Set<String>> load();

  Future<void> save(Set<String> seen);
}
