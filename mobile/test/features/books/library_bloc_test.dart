import 'package:ereader_mobile/features/books/domain/entities/epub_source.dart';
import 'package:ereader_mobile/features/books/domain/repositories/books_repository.dart';
import 'package:ereader_mobile/features/books/presentation/bloc/library_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_books_repository.dart';

const _source = EpubSource(path: '/tmp/loeb.epub', fileName: 'loeb.epub');

void main() {
  Future<LibraryBloc> started(
    FakeBooksRepository repository, {
    EpubSource? picked = _source,
  }) async {
    final bloc = LibraryBloc(
      repository: repository,
      pickEpub: () async => picked,
    );
    addTearDown(bloc.close);
    bloc.add(const LibraryStarted());
    await Future<void>.delayed(Duration.zero);
    return bloc;
  }

  test('loads the books on the shelf', () async {
    final bloc = await started(FakeBooksRepository(shelf: [loeb]));

    expect(bloc.state.loading, isFalse);
    expect(bloc.state.books.single.title, loeb.title);
  });

  test('shows upload progress, then puts the imported book first', () async {
    final bloc = await started(FakeBooksRepository(uploadProgress: [0.5, 1.0]));
    final uploads = <Upload>[];
    final subscription = bloc.stream.listen(
      (state) => uploads.add(state.upload),
    );
    addTearDown(subscription.cancel);

    bloc.add(const ImportRequested());
    await Future<void>.delayed(Duration.zero);

    expect(uploads.whereType<Uploading>().map((upload) => upload.progress), [
      0,
      0.5,
      1.0,
    ]);
    expect(bloc.state.upload, isA<NoUpload>());
    expect(bloc.state.books.single.bookId, loeb.bookId);
  });

  test('keeps one entry when the same book is imported again', () async {
    final bloc = await started(FakeBooksRepository(shelf: [loeb]));

    bloc.add(const ImportRequested());
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.books, hasLength(1));
  });

  test('keeps the server error code when the upload is rejected', () async {
    final bloc = await started(
      FakeBooksRepository(importError: const BooksException('EPUB_INVALID')),
    );

    bloc.add(const ImportRequested());
    await Future<void>.delayed(Duration.zero);

    expect(
      bloc.state.upload,
      isA<UploadFailed>().having(
        (upload) => upload.code,
        'code',
        'EPUB_INVALID',
      ),
    );
  });

  test('does nothing when the picker is cancelled', () async {
    final bloc = await started(FakeBooksRepository(), picked: null);

    bloc.add(const ImportRequested());
    await Future<void>.delayed(Duration.zero);

    expect(bloc.state.upload, isA<NoUpload>());
    expect(bloc.state.books, isEmpty);
  });
}
