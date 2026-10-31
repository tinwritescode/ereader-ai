import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';

ChapterVoiceTask task({
  String id = 't1',
  TaskState state = TaskState.running,
  int done = 112,
  int total = 180,
  int? position,
  String? code,
  DateTime? finishedAt,
}) => ChapterVoiceTask(
  id: id,
  bookId: 'b1',
  chapterId: 'c1',
  bookTitle: 'Cuộc chiến sinh tồn',
  chapterLabel: 'Chương Hai',
  minutes: null,
  voiceCode: 'vieneu-clone',
  voiceName: 'Hạt Dẻ',
  state: state,
  code: code,
  done: done,
  total: total,
  position: position,
  createdAt: DateTime.utc(2026, 10, 31),
  finishedAt: finishedAt,
);

BookTranslationTask translation({
  String id = 'tr1',
  String bookId = 'b1',
  TaskState state = TaskState.running,
  int done = 4,
  int total = 22,
  int percent = 18,
  ({String chapterId, int percent})? current = (chapterId: 'c5', percent: 40),
  List<String> waiting = const ['c5', 'c6'],
  int? position,
  String? code,
  DateTime? finishedAt,
}) => BookTranslationTask(
  id: id,
  bookId: bookId,
  bookTitle: 'Dune',
  state: state,
  code: code,
  done: done,
  total: total,
  percent: percent,
  current: current,
  waiting: waiting,
  position: position,
  createdAt: DateTime.utc(2026, 10, 31),
  finishedAt: finishedAt,
);

class FakeTasksRepository implements TasksRepository {
  FakeTasksRepository([this.list = const []]);

  List<LongTask> list;
  Set<String> translated = {};
  TasksException? failure;
  final created = <ChapterVoiceJob>[];
  final cancelled = <String>[];
  final resumed = <String>[];
  final translating = <({String bookId, String? startChapterId})>[];
  final putFirsts = <({String taskId, String chapterId})>[];
  var fetches = 0;

  @override
  Future<List<LongTask>> tasks() async {
    fetches++;
    final error = failure;
    if (error != null) throw error;
    return list;
  }

  @override
  Future<ChapterVoiceTask> create(ChapterVoiceJob job) async {
    final error = failure;
    if (error != null) throw error;
    created.add(job);
    return task();
  }

  @override
  Future<BookTranslationTask> translateBook(
    String bookId, {
    String? startChapterId,
  }) async {
    final error = failure;
    if (error != null) throw error;
    translating.add((bookId: bookId, startChapterId: startChapterId));
    final started = translation(bookId: bookId, state: TaskState.queued);
    list = [...list, started];
    return started;
  }

  @override
  Future<BookTranslation> translationOf(String bookId) async {
    final error = failure;
    if (error != null) throw error;
    final tasks = list.whereType<BookTranslationTask>().where(
      (task) => task.bookId == bookId,
    );
    return BookTranslation(
      translated: translated,
      task: tasks.isEmpty ? null : tasks.last,
    );
  }

  @override
  Future<void> putFirst(String taskId, String chapterId) async =>
      putFirsts.add((taskId: taskId, chapterId: chapterId));

  @override
  Future<void> cancel(LongTask task) async => cancelled.add(task.id);

  @override
  Future<void> resume(LongTask task) async => resumed.add(task.id);
}

class FakeTaskNoticeStore implements TaskNoticeStore {
  var seen = <String>{};

  @override
  Future<Set<String>> load() async => seen;

  @override
  Future<void> save(Set<String> seen) async => this.seen = seen;
}
