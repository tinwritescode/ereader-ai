import 'dart:io';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/books/data/repositories/books_repository_impl.dart';
import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:flutter_test/flutter_test.dart';

/// Runs only with a live backend: `API_BASE_URL=http://localhost:3000 EPUB_FIXTURE=/path/book.epub`.
void main() {
  final baseUrl = Platform.environment['API_BASE_URL'];
  final fixture = Platform.environment['EPUB_FIXTURE'];

  test(
    'imports the EPUB from EPUB_FIXTURE into the live backend',
    () async {
      final repository = BooksRepositoryImpl(
        Dio(
          BaseOptions(
            baseUrl: baseUrl!,
            headers: {
              'Authorization': 'Bearer ${Platform.environment['ACCESS_TOKEN']}',
            },
          ),
        ),
      );
      final progress = <double>[];

      final book = await repository.importEpub(
        EpubSource(path: fixture!, fileName: 'live.epub'),
        onProgress: progress.add,
      );

      expect(book.title, isNotEmpty);
      expect(book.status, 'READY');
      expect(progress.last, 1.0);
    },
    skip: baseUrl == null || fixture == null
        ? 'needs API_BASE_URL and EPUB_FIXTURE'
        : false,
  );
}
