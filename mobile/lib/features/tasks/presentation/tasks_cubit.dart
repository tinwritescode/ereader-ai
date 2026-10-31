import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../domain/chapter_task.dart';

class TasksState {
  const TasksState({this.tasks = const [], this.notices = const []});

  final List<LongTask> tasks;

  /// Finishes the reader has not been told about yet.
  final List<LongTask> notices;

  int get active => tasks.where((task) => task.active).length;
}

const _poll = Duration(seconds: 4);

/// The account's tasks, looked at again for as long as one is under way.
class TasksCubit extends Cubit<TasksState> {
  TasksCubit(this._repository, this._store, {Duration pollEvery = _poll})
    : _pollEvery = pollEvery,
      super(const TasksState());

  final TasksRepository _repository;
  final TaskNoticeStore _store;
  final Duration _pollEvery;
  Timer? _next;
  Set<String>? _seen;

  Future<void> refresh() async {
    _next?.cancel();
    try {
      final tasks = await _repository.tasks();
      final seen = _seen ??= await _store.load();
      final finished = {
        for (final task in tasks)
          if (!task.active) _finishOf(task): task,
      };
      final fresh = finished.keys.where((key) => !seen.contains(key));
      final notices = [
        ...state.notices,
        for (final key in fresh) finished[key]!,
      ];
      if (fresh.isNotEmpty) {
        seen.addAll(fresh.toList());
        await _store.save(seen);
      }
      if (isClosed) return;
      emit(TasksState(tasks: tasks, notices: notices));
    } on TasksException {
      // The list stays as it was; the next look tries again.
    }
    if (state.active > 0 && !isClosed) _next = Timer(_pollEvery, refresh);
  }

  void noticesShown() => emit(TasksState(tasks: state.tasks));

  Future<void> create(ChapterVoiceJob job) async {
    await _repository.create(job);
    await refresh();
  }

  Future<BookTranslationTask> translateBook(
    String bookId, {
    String? startChapterId,
  }) async {
    final task = await _repository.translateBook(
      bookId,
      startChapterId: startChapterId,
    );
    await refresh();
    return task;
  }

  Future<void> putFirst(BookTranslationTask task, String chapterId) async {
    await _repository.putFirst(task.id, chapterId);
    await refresh();
  }

  Future<void> cancel(LongTask task) async {
    await _repository.cancel(task);
    await refresh();
  }

  Future<void> resume(LongTask task) async {
    await _repository.resume(task);
    await refresh();
  }

  @override
  Future<void> close() {
    _next?.cancel();
    return super.close();
  }
}

// A resumed task finishes anew, so the moment is part of what was told.
String _finishOf(LongTask task) =>
    '${task.id}:${task.state.name}:${task.finishedAt?.toIso8601String()}';
