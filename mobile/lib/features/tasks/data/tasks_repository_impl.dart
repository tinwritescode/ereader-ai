import 'package:dio/dio.dart';

import '../domain/chapter_task.dart';

class TasksRepositoryImpl implements TasksRepository {
  const TasksRepositoryImpl(this._api);

  final Dio _api;

  @override
  Future<List<LongTask>> tasks() => _call(() async {
    final [voices, translations, books] = await Future.wait([
      _list('/speech/tasks', _toVoiceTask),
      _list('/translations/tasks', _toTranslationTask),
      _list('/voices/tasks', _toBookVoiceTask),
    ]);
    return [...voices, ...translations, ...books]
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  });

  Future<List<LongTask>> _list(
    String path,
    LongTask Function(Object?) parse,
  ) async {
    final response = await _api.get<Object?>(path);
    return switch (response.data) {
      {'tasks': final List<Object?> tasks} => tasks.map(parse).toList(),
      _ => throw const TasksException('UNEXPECTED_RESPONSE'),
    };
  }

  @override
  Future<ChapterVoiceTask> create(ChapterVoiceJob job) => _call(() async {
    final response = await _api.post<Object?>(
      '/speech/tasks',
      data: {
        'bookId': job.bookId,
        'chapterId': job.chapterId,
        'bookTitle': job.bookTitle,
        'chapterLabel': job.chapterLabel,
        'minutes': job.minutes,
        'voiceCode': job.voiceCode,
        'sentences': job.sentences,
      },
    );
    return _toVoiceTask(response.data);
  });

  @override
  Future<BookTranslationTask> translateBook(
    String bookId, {
    String? startChapterId,
  }) => _call(() async {
    final response = await _api.post<Object?>(
      '/books/$bookId/translation',
      data: {'startChapterId': startChapterId},
    );
    return _toTranslationTask(response.data);
  });

  @override
  Future<BookTranslation> translationOf(String bookId) => _call(() async {
    final response = await _api.get<Object?>('/books/$bookId/translation');
    return switch (response.data) {
      {'translated': final List<Object?> translated, 'task': final task} =>
        BookTranslation(
          translated: translated.whereType<String>().toSet(),
          task: task == null ? null : _toTranslationTask(task),
        ),
      _ => throw const TasksException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<BookVoiceTask> voiceBook(
    String bookId, {
    required String voiceCode,
    String? startChapterId,
  }) => _call(() async {
    final response = await _api.post<Object?>(
      '/books/$bookId/voice',
      data: {'voiceCode': voiceCode, 'startChapterId': startChapterId},
    );
    return _toBookVoiceTask(response.data);
  });

  @override
  Future<BookVoice> voiceOf(String bookId) => _call(() async {
    final response = await _api.get<Object?>('/books/$bookId/voice');
    return switch (response.data) {
      {
        'chapters': final int chapters,
        'skipped': final int skipped,
        'minutes': final int minutes,
        'task': final task,
      } =>
        BookVoice(
          chapters: chapters,
          skipped: skipped,
          minutes: minutes,
          task: task == null ? null : _toBookVoiceTask(task),
        ),
      _ => throw const TasksException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<void> putFirst(String taskId, String chapterId) => _call(
    () => _api.post<Object?>(
      '/translations/tasks/$taskId/first',
      data: {'chapterId': chapterId},
    ),
  );

  @override
  Future<void> cancel(LongTask task) =>
      _call(() => _api.delete<Object?>(_address(task)));

  @override
  Future<void> resume(LongTask task) =>
      _call(() => _api.post<Object?>('${_address(task)}/resume'));

  String _address(LongTask task) => switch (task) {
    ChapterVoiceTask() => '/speech/tasks/${task.id}',
    BookTranslationTask() => '/translations/tasks/${task.id}',
    BookVoiceTask() => '/voices/tasks/${task.id}',
  };

  Future<T> _call<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (error) {
      throw TasksException(switch (error.response?.data) {
        {'code': final String code} => code,
        _ => 'NETWORK',
      });
    }
  }
}

ChapterVoiceTask _toVoiceTask(Object? json) => switch (json) {
  {
    'id': final String id,
    'bookId': final String bookId,
    'chapterId': final String chapterId,
    'bookTitle': final String bookTitle,
    'chapterLabel': final String chapterLabel,
    'minutes': final int? minutes,
    'voiceCode': final String voiceCode,
    'voiceName': final String voiceName,
    'state': final String state,
    'code': final String? code,
    'done': final int done,
    'total': final int total,
    'position': final int? position,
    'createdAt': final String createdAt,
    'finishedAt': final String? finishedAt,
  } =>
    ChapterVoiceTask(
      id: id,
      bookId: bookId,
      chapterId: chapterId,
      bookTitle: bookTitle,
      chapterLabel: chapterLabel,
      minutes: minutes,
      voiceCode: voiceCode,
      voiceName: voiceName,
      state: _state(state),
      code: code,
      done: done,
      total: total,
      position: position,
      createdAt: DateTime.parse(createdAt),
      finishedAt: finishedAt == null ? null : DateTime.parse(finishedAt),
    ),
  _ => throw const TasksException('UNEXPECTED_RESPONSE'),
};

BookTranslationTask _toTranslationTask(Object? json) => switch (json) {
  {
    'id': final String id,
    'bookId': final String bookId,
    'bookTitle': final String bookTitle,
    'state': final String state,
    'code': final String? code,
    'done': final int done,
    'total': final int total,
    'percent': final int percent,
    'position': final int? position,
    'current': final Object? current,
    'waiting': final List<Object?> waiting,
    'createdAt': final String createdAt,
    'finishedAt': final String? finishedAt,
  } =>
    BookTranslationTask(
      id: id,
      bookId: bookId,
      bookTitle: bookTitle,
      state: _state(state),
      code: code,
      done: done,
      total: total,
      percent: percent,
      position: position,
      current: _current(current),
      waiting: waiting.whereType<String>().toList(),
      createdAt: DateTime.parse(createdAt),
      finishedAt: finishedAt == null ? null : DateTime.parse(finishedAt),
    ),
  _ => throw const TasksException('UNEXPECTED_RESPONSE'),
};

BookVoiceTask _toBookVoiceTask(Object? json) => switch (json) {
  {
    'id': final String id,
    'bookId': final String bookId,
    'bookTitle': final String bookTitle,
    'voiceCode': final String voiceCode,
    'voiceName': final String voiceName,
    'state': final String state,
    'code': final String? code,
    'done': final int done,
    'total': final int total,
    'percent': final int percent,
    'position': final int? position,
    'current': final Object? current,
    'waiting': final List<Object?> waiting,
    'voiced': final List<Object?> voiced,
    'createdAt': final String createdAt,
    'finishedAt': final String? finishedAt,
  } =>
    BookVoiceTask(
      id: id,
      bookId: bookId,
      bookTitle: bookTitle,
      voiceCode: voiceCode,
      voiceName: voiceName,
      state: _state(state),
      code: code,
      done: done,
      total: total,
      percent: percent,
      position: position,
      current: _current(current),
      waiting: waiting.whereType<String>().toList(),
      voiced: voiced.whereType<String>().toList(),
      createdAt: DateTime.parse(createdAt),
      finishedAt: finishedAt == null ? null : DateTime.parse(finishedAt),
    ),
  _ => throw const TasksException('UNEXPECTED_RESPONSE'),
};

({String chapterId, int percent})? _current(Object? json) => switch (json) {
  {'chapterId': final String chapterId, 'percent': final int percent} => (
    chapterId: chapterId,
    percent: percent,
  ),
  _ => null,
};

TaskState _state(String name) =>
    TaskState.values.asNameMap()[name] ??
    (throw const TasksException('UNEXPECTED_RESPONSE'));
