import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';
import 'package:ereader_mobile/features/tasks/presentation/tasks_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_tasks.dart';

void main() {
  final finished = DateTime.utc(2026, 10, 31);
  late FakeTasksRepository repository;
  late FakeTaskNoticeStore notices;
  late TasksCubit cubit;

  setUp(() {
    repository = FakeTasksRepository();
    notices = FakeTaskNoticeStore();
    cubit = TasksCubit(repository, notices, pollEvery: Duration.zero);
  });

  tearDown(() => cubit.close());

  test('counts what is under way', () async {
    repository.list = [
      task(),
      task(id: 't2', state: TaskState.queued, position: 1),
      task(id: 't3', state: TaskState.done, finishedAt: finished),
    ];
    await cubit.refresh();
    expect(cubit.state.active, 2);
  });

  test('tells of a finish once, even after a restart of the app', () async {
    repository.list = [task(state: TaskState.done, finishedAt: finished)];
    await cubit.refresh();
    expect(cubit.state.notices.map((task) => task.id), ['t1']);

    cubit.noticesShown();
    await cubit.refresh();
    expect(cubit.state.notices, isEmpty);

    final again = TasksCubit(repository, notices, pollEvery: Duration.zero);
    addTearDown(again.close);
    await again.refresh();
    expect(again.state.notices, isEmpty);
  });

  test('tells of a resumed task again when it finishes', () async {
    repository.list = [
      task(
        state: TaskState.stopped,
        code: 'SPEECH_FAILED',
        finishedAt: finished,
      ),
    ];
    await cubit.refresh();
    cubit.noticesShown();
    repository.list = [
      task(
        state: TaskState.done,
        finishedAt: finished.add(const Duration(minutes: 1)),
      ),
    ];
    await cubit.refresh();
    expect(cubit.state.notices.single.state, TaskState.done);
  });

  test('says nothing about tasks still running', () async {
    repository.list = [task()];
    await cubit.refresh();
    expect(cubit.state.notices, isEmpty);
  });

  test(
    'keeps looking while something runs, and stops when all is done',
    () async {
      repository.list = [task()];
      await cubit.refresh();
      await pumpEventQueue();
      expect(repository.fetches, greaterThan(1));

      repository.list = [task(state: TaskState.done, finishedAt: finished)];
      await pumpEventQueue();
      final settled = repository.fetches;
      await pumpEventQueue();
      expect(repository.fetches, settled);
    },
  );

  test('keeps the last list when the server cannot be reached', () async {
    repository.list = [task(state: TaskState.done, finishedAt: finished)];
    await cubit.refresh();
    repository.failure = const TasksException('NETWORK');
    await cubit.refresh();
    expect(cubit.state.tasks, hasLength(1));
  });

  test(
    'starts a book translation where the reader is, and follows it',
    () async {
      final started = await cubit.translateBook('b1', startChapterId: 'c3');

      expect(repository.translating.single, (
        bookId: 'b1',
        startChapterId: 'c3',
      ));
      expect(cubit.state.tasks.single.id, started.id);
      expect(cubit.state.active, 1);
    },
  );

  test('moves a chapter to the front of a translation', () async {
    await cubit.putFirst(translation(), 'c9');
    expect(repository.putFirsts.single, (taskId: 'tr1', chapterId: 'c9'));
  });

  test('tells of a finished translation like any other task', () async {
    repository.list = [
      translation(state: TaskState.done, current: null, finishedAt: finished),
    ];
    await cubit.refresh();
    expect(cubit.state.notices.single, isA<BookTranslationTask>());
  });
}
