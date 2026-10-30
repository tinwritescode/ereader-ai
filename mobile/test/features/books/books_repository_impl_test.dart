import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/books/data/repositories/books_repository_impl.dart';
import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/features/books/domain/repositories/books_repository.dart';
import 'package:flutter_test/flutter_test.dart';

const _bookJson = {
  'bookId': 'book-1',
  'status': 'READY',
  'title': 'The Battle for Investment Survival',
  'author': 'Gerald M. Loeb',
  'language': 'vi',
  'chapterCount': 36,
  'minutes': 557,
};

void main() {
  late EpubSource source;

  setUp(() async {
    final dir = await Directory.systemTemp.createTemp('books-repo-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/loeb.epub')
      ..writeAsBytesSync(List.filled(32, 1));
    source = EpubSource(path: file.path, fileName: 'loeb.epub');
  });

  test('uploads the file as multipart and parses the imported book', () async {
    final adapter = _FakeAdapter((_) => (202, _bookJson));
    final progress = <double>[];

    final book = await _repository(
      adapter,
    ).importEpub(source, onProgress: progress.add);

    expect(book.title, 'The Battle for Investment Survival');
    expect((book.chapterCount, book.minutes), (36, 557));
    expect(adapter.requests.single.uri.toString(), 'http://api.test/books');
    expect(adapter.bodies.single, contains('name="userId"'));
    expect(adapter.bodies.single, contains('filename="loeb.epub"'));
    expect(progress.last, 1.0);
  });

  test('lists the books of the user', () async {
    final adapter = _FakeAdapter((_) => (200, [_bookJson]));

    final books = await _repository(adapter).books();

    expect(books.single.bookId, 'book-1');
    expect(
      adapter.requests.single.uri.toString(),
      'http://api.test/books?userId=user-1',
    );
  });

  test('reads chapter summaries and the original body', () async {
    final adapter = _FakeAdapter(
      (options) => switch (options.uri.path) {
        '/books/book-1/chapters' => (
          200,
          {
            'bookId': 'book-1',
            'chapters': [
              {
                'chapterId': 'c0',
                'index': 0,
                'label': 'Chương Một',
                'subtitle': null,
                'wordCount': 1692,
                'minutes': 8,
              },
            ],
          },
        ),
        _ => (
          200,
          {
            'chapterId': 'c0',
            'blocks': [
              {'blockId': 'b0', 'kind': 'heading', 'text': 'Phần một'},
              {
                'blockId': 'b1',
                'kind': 'paragraph',
                'text': 'Tôi thực sự tin rằng.',
              },
            ],
          },
        ),
      },
    );
    final repository = _repository(adapter);

    final chapters = await repository.chapters('book-1');
    final original = await repository.original('c0');

    expect(
      (
        chapters.single.label,
        chapters.single.subtitle,
        chapters.single.minutes,
      ),
      ('Chương Một', null, 8),
    );
    expect(original.blocks.map((block) => block.kind), [
      TextBlockKind.heading,
      TextBlockKind.paragraph,
    ]);
  });

  test('asks for a shortened chapter and splits it into paragraphs', () async {
    final adapter = _FakeAdapter(
      (_) => (
        201,
        {
          'content': 'Một.\n\nHai.',
          'targetWords': 800,
          'cacheKey': 'k',
          'cached': false,
        },
      ),
    );

    final text = await _repository(adapter).shortened('c0', minutes: 4);

    expect(text.blocks.map((block) => block.text), ['Một.', 'Hai.']);
    expect(
      adapter.requests.single.uri.toString(),
      'http://api.test/chapters/c0/digest?userId=user-1',
    );
    expect(jsonDecode(adapter.bodies.single), {
      'targetLang': 'vi',
      'targetMinutes': 4,
    });
  });

  test('throws the server error code when the upload is rejected', () async {
    final adapter = _FakeAdapter((_) => (400, {'code': 'EPUB_INVALID'}));

    await expectLater(
      _repository(adapter).importEpub(source, onProgress: (_) {}),
      throwsA(
        isA<BooksException>().having((e) => e.code, 'code', 'EPUB_INVALID'),
      ),
    );
  });

  test('throws NETWORK_ERROR when the server cannot be reached', () async {
    await expectLater(
      _repository(_FakeAdapter.unreachable()).books(),
      throwsA(
        isA<BooksException>().having((e) => e.code, 'code', 'NETWORK_ERROR'),
      ),
    );
  });
}

BooksRepositoryImpl _repository(HttpClientAdapter adapter) =>
    BooksRepositoryImpl(
      Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter,
      userId: 'user-1',
    );

typedef _Respond = (int, Object) Function(RequestOptions options);

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(_Respond respond) : _respond = respond;

  _FakeAdapter.unreachable() : _respond = null;

  final _Respond? _respond;
  final requests = <RequestOptions>[];
  final bodies = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final respond = _respond;
    if (respond == null) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'refused',
      );
    }
    requests.add(options);
    if (requestStream != null) {
      bodies.add(
        utf8.decode(
          await requestStream.expand((chunk) => chunk).toList(),
          allowMalformed: true,
        ),
      );
    }
    final (status, json) = respond(options);
    return ResponseBody.fromString(
      jsonEncode(json),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
