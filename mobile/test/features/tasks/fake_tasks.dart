import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';

ChapterTask task({
  String id = 't1',
  ChapterTaskState state = ChapterTaskState.running,
  int done = 112,
  int total = 180,
  int? position,
  String? code,
  DateTime? finishedAt,
}) => ChapterTask(
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
  finishedAt: finishedAt,
);

class FakeTasksRepository implements TasksRepository {
  FakeTasksRepository([this.list = const []]);

  List<ChapterTask> list;
  TasksException? failure;
  final created = <ChapterVoiceJob>[];
  final cancelled = <String>[];
  final resumed = <String>[];
  var fetches = 0;

  @override
  Future<List<ChapterTask>> tasks() async {
    fetches++;
    final error = failure;
    if (error != null) throw error;
    return list;
  }

  @override
  Future<ChapterTask> create(ChapterVoiceJob job) async {
    final error = failure;
    if (error != null) throw error;
    created.add(job);
    return task();
  }

  @override
  Future<void> cancel(String id) async => cancelled.add(id);

  @override
  Future<void> resume(String id) async => resumed.add(id);
}

class FakeTaskNoticeStore implements TaskNoticeStore {
  var seen = <String>{};

  @override
  Future<Set<String>> load() async => seen;

  @override
  Future<void> save(Set<String> seen) async => this.seen = seen;
}
