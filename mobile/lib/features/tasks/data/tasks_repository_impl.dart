import 'package:dio/dio.dart';

import '../domain/chapter_task.dart';

class TasksRepositoryImpl implements TasksRepository {
  const TasksRepositoryImpl(this._api);

  final Dio _api;

  @override
  Future<List<ChapterTask>> tasks() => _call(() async {
    final response = await _api.get<Object?>('/speech/tasks');
    return switch (response.data) {
      {'tasks': final List<Object?> tasks} => tasks.map(_toTask).toList(),
      _ => throw const TasksException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<ChapterTask> create(ChapterVoiceJob job) => _call(() async {
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
    return _toTask(response.data);
  });

  @override
  Future<void> cancel(String id) =>
      _call(() => _api.delete<Object?>('/speech/tasks/$id'));

  @override
  Future<void> resume(String id) =>
      _call(() => _api.post<Object?>('/speech/tasks/$id/resume'));

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

ChapterTask _toTask(Object? json) => switch (json) {
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
    'finishedAt': final String? finishedAt,
  } =>
    ChapterTask(
      id: id,
      bookId: bookId,
      chapterId: chapterId,
      bookTitle: bookTitle,
      chapterLabel: chapterLabel,
      minutes: minutes,
      voiceCode: voiceCode,
      voiceName: voiceName,
      state:
          ChapterTaskState.values.asNameMap()[state] ??
          (throw const TasksException('UNEXPECTED_RESPONSE')),
      code: code,
      done: done,
      total: total,
      position: position,
      finishedAt: finishedAt == null ? null : DateTime.parse(finishedAt),
    ),
  _ => throw const TasksException('UNEXPECTED_RESPONSE'),
};
