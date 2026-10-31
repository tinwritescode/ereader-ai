import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/tasks/data/tasks_repository_impl.dart';
import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _voice = {
  'id': 'v1',
  'kind': 'chapterVoice',
  'bookId': 'b1',
  'chapterId': 'c1',
  'bookTitle': 'Hunger Games',
  'chapterLabel': 'Chương Hai',
  'minutes': null,
  'voiceCode': 'vieneu-clone',
  'voiceName': 'Hạt Dẻ',
  'state': 'running',
  'code': null,
  'done': 3,
  'total': 10,
  'position': null,
  'createdAt': '2026-10-31T10:00:00.000Z',
  'finishedAt': null,
};

const _translation = {
  'id': 't1',
  'kind': 'bookTranslation',
  'bookId': 'b2',
  'bookTitle': 'Dune',
  'state': 'running',
  'code': null,
  'done': 4,
  'total': 22,
  'percent': 18,
  'position': null,
  'current': {'chapterId': 'c5', 'percent': 40},
  'waiting': ['c5', 'c6'],
  'createdAt': '2026-10-31T09:00:00.000Z',
  'finishedAt': null,
};

const _bookVoice = {
  'id': 'bv1',
  'kind': 'bookVoice',
  'bookId': 'b3',
  'bookTitle': 'Cuộc chiến sinh tồn',
  'voiceCode': 'vieneu-clone',
  'voiceName': 'Hạt Dẻ',
  'state': 'running',
  'code': null,
  'done': 6,
  'total': 27,
  'percent': 22,
  'position': null,
  'current': {'chapterId': 'c7', 'percent': 40},
  'waiting': ['c7', 'c8'],
  'voiced': ['c2', 'c3'],
  'createdAt': '2026-10-31T11:00:00.000Z',
  'finishedAt': null,
};

class _Server implements HttpClientAdapter {
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add('${options.method} ${options.path}');
    return switch (options.path) {
      '/speech/tasks' => _json({
        'tasks': [_voice],
      }),
      '/translations/tasks' => _json({
        'tasks': [_translation],
      }),
      '/voices/tasks' => _json({
        'tasks': [_bookVoice],
      }),
      '/books/b3/voice' =>
        options.method == 'POST'
            ? _json(_bookVoice)
            : _json({
                'chapters': 27,
                'skipped': 2,
                'minutes': 580,
                'task': _bookVoice,
              }),
      '/books/b2/translation' => _json({
        'translated': ['c1', 'c2'],
        'task': _translation,
      }),
      _ => ResponseBody.fromString('', 204),
    };
  }

  ResponseBody _json(Object body) => ResponseBody.fromString(
    jsonEncode(body),
    200,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Server server;
  late TasksRepositoryImpl repository;

  setUp(() {
    server = _Server();
    repository = TasksRepositoryImpl(
      Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = server,
    );
  });

  test('lists every kind of task, oldest first', () async {
    final tasks = await repository.tasks();

    expect(tasks.map((task) => task.id), ['t1', 'v1', 'bv1']);
    final translation = tasks.first;
    expect(translation, isA<BookTranslationTask>());
    if (translation is BookTranslationTask) {
      expect(translation.percent, 18);
      expect(translation.current, (chapterId: 'c5', percent: 40));
      expect(translation.waiting, ['c5', 'c6']);
      expect(translation.done, 4);
    }
    expect(tasks[1].percent, 30);
    expect(tasks.last, isA<BookVoiceTask>());
  });

  test('reads where a book translation stands', () async {
    final translation = await repository.translationOf('b2');

    expect(translation.translated, {'c1', 'c2'});
    expect(translation.task?.id, 't1');
  });

  test('reads what a voice for the whole book would take', () async {
    final voice = await repository.voiceOf('b3');

    expect(voice.chapters, 27);
    expect(voice.skipped, 2);
    expect(voice.minutes, 580);
    expect(voice.task?.voiced, ['c2', 'c3']);
    expect(voice.task?.voiceName, 'Hạt Dẻ');
  });

  test('starts a voice for the whole book', () async {
    final task = await repository.voiceBook(
      'b3',
      voiceCode: 'vieneu-clone',
      startChapterId: 'c7',
    );
    expect(task.id, 'bv1');
    expect(server.asked, ['POST /books/b3/voice']);
  });

  test('cancels and resumes each kind at its own address', () async {
    final [translation, voice, book] = await repository.tasks();
    server.asked.clear();

    await repository.cancel(translation);
    await repository.cancel(voice);
    await repository.resume(translation);
    await repository.resume(voice);
    await repository.cancel(book);
    await repository.resume(book);
    await repository.putFirst('t1', 'c9');

    expect(server.asked, [
      'DELETE /translations/tasks/t1',
      'DELETE /speech/tasks/v1',
      'POST /translations/tasks/t1/resume',
      'POST /speech/tasks/v1/resume',
      'DELETE /voices/tasks/bv1',
      'POST /voices/tasks/bv1/resume',
      'POST /translations/tasks/t1/first',
    ]);
  });
}
