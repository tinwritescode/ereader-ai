import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_tasks.dart';

void main() {
  test('knows which chapter is being translated and which wait', () {
    final task = translation();
    expect(task.turnOf('c5'), ChapterTurn.now);
    expect(task.turnOf('c6'), ChapterTurn.later);
    expect(task.turnOf('c1'), ChapterTurn.none);
  });

  test('a queued task has every chapter waiting', () {
    final task = translation(state: TaskState.queued, current: null);
    expect(task.turnOf('c5'), ChapterTurn.later);
  });

  test('a stopped task translates nothing', () {
    final task = translation(state: TaskState.stopped, current: null);
    expect(task.turnOf('c5'), ChapterTurn.none);
    expect(task.turnOf('c6'), ChapterTurn.none);
  });

  test('a whole book voice takes turns the same way', () {
    final task = bookVoice();
    expect(task.turnOf('c7'), ChapterTurn.now);
    expect(task.turnOf('c8'), ChapterTurn.later);
    expect(task.turnOf('c2'), ChapterTurn.none);
  });
}
