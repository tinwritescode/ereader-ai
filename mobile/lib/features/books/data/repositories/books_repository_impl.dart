import 'package:dio/dio.dart';

import '../../domain/entities/book.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/epub_source.dart';
import '../../domain/repositories/books_repository.dart';

class BooksRepositoryImpl implements BooksRepository {
  const BooksRepositoryImpl(this._dio, {required String userId})
    : _userId = userId;

  final Dio _dio;
  final String _userId;

  Map<String, String> get _scope => {'userId': _userId};

  @override
  Future<Book> importEpub(
    EpubSource source, {
    required void Function(double progress) onProgress,
  }) async {
    final form = FormData.fromMap({
      'userId': _userId,
      'file': await MultipartFile.fromFile(
        source.path,
        filename: source.fileName,
      ),
    });
    return _call(() async {
      final response = await _dio.post<Object>(
        '/books',
        data: form,
        onSendProgress: (sent, total) {
          if (total > 0) onProgress(sent / total);
        },
      );
      return _toBook(response.data);
    });
  }

  @override
  Future<List<Book>> books() => _call(() async {
    final response = await _dio.get<Object>('/books', queryParameters: _scope);
    return _list(response.data).map(_toBook).toList();
  });

  @override
  Future<List<ChapterSummary>> chapters(String bookId) => _call(() async {
    final response = await _dio.get<Object>(
      '/books/$bookId/chapters',
      queryParameters: _scope,
    );
    return switch (response.data) {
      {'chapters': final List<Object?> chapters} =>
        chapters.map(_toChapterSummary).toList(),
      _ => throw const BooksException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<ChapterText> original(String chapterId) => _call(() async {
    final response = await _dio.get<Object>(
      '/chapters/$chapterId',
      queryParameters: _scope,
    );
    return switch (response.data) {
      {'blocks': final List<Object?> blocks} => ChapterText(
        blocks.map(_toTextBlock).toList(),
      ),
      _ => throw const BooksException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<ChapterText> shortened(String chapterId, {required int minutes}) =>
      _call(() async {
        final response = await _dio.post<Object>(
          '/chapters/$chapterId/digest',
          queryParameters: _scope,
          data: {'targetLang': 'vi', 'targetMinutes': minutes},
        );
        return switch (response.data) {
          {'content': final String content} => ChapterText([
            for (final paragraph in content.split('\n\n'))
              if (paragraph.trim().isNotEmpty)
                TextBlock(TextBlockKind.paragraph, paragraph.trim()),
          ]),
          _ => throw const BooksException('UNEXPECTED_RESPONSE'),
        };
      });

  Book _toBook(Object? json) => switch (json) {
    {
      'bookId': final String bookId,
      'title': final String title,
      'author': final String? author,
      'status': final String status,
      'hasCover': final bool hasCover,
      'chapterCount': final int chapterCount,
      'minutes': final int minutes,
    } =>
      Book(
        bookId: bookId,
        title: title,
        author: author,
        status: status,
        chapterCount: chapterCount,
        minutes: minutes,
        coverUrl: hasCover
            ? Uri.parse(
                '${_dio.options.baseUrl}/books/$bookId/cover',
              ).replace(queryParameters: _scope).toString()
            : null,
      ),
    _ => throw const BooksException('UNEXPECTED_RESPONSE'),
  };
}

Future<T> _call<T>(Future<T> Function() request) async {
  try {
    return await request();
  } on DioException catch (error) {
    throw BooksException(_errorCode(error));
  }
}

List<Object?> _list(Object? json) => json is List<Object?>
    ? json
    : throw const BooksException('UNEXPECTED_RESPONSE');

ChapterSummary _toChapterSummary(Object? json) => switch (json) {
  {
    'chapterId': final String chapterId,
    'label': final String label,
    'subtitle': final String? subtitle,
    'minutes': final int minutes,
  } =>
    ChapterSummary(
      chapterId: chapterId,
      label: label,
      subtitle: subtitle,
      minutes: minutes,
    ),
  _ => throw const BooksException('UNEXPECTED_RESPONSE'),
};

TextBlock _toTextBlock(Object? json) => switch (json) {
  {'kind': 'heading', 'text': final String text} => TextBlock(
    TextBlockKind.heading,
    text,
  ),
  {'kind': 'paragraph', 'text': final String text} => TextBlock(
    TextBlockKind.paragraph,
    text,
  ),
  _ => throw const BooksException('UNEXPECTED_RESPONSE'),
};

String _errorCode(DioException error) {
  final response = error.response;
  if (response == null) return 'NETWORK_ERROR';
  return switch (response.data) {
    {'code': final String code} => code,
    _ => 'HTTP_${response.statusCode}',
  };
}
