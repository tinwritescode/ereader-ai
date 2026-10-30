import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/book.dart';
import '../../domain/entities/epub_source.dart';
import '../../domain/repositories/books_repository.dart';

/// Returns `null` when the user cancels.
typedef PickEpub = Future<EpubSource?> Function();

sealed class Upload {
  const Upload();
}

final class NoUpload extends Upload {
  const NoUpload();
}

final class Uploading extends Upload {
  const Uploading(this.fileName, this.progress);

  final String fileName;
  final double progress;
}

final class UploadFailed extends Upload {
  const UploadFailed(this.fileName, this.code);

  final String fileName;
  final String code;
}

class LibraryState {
  const LibraryState({
    this.books = const [],
    this.loading = true,
    this.loadError,
    this.upload = const NoUpload(),
  });

  final List<Book> books;
  final bool loading;
  final String? loadError;
  final Upload upload;

  LibraryState copyWith({
    List<Book>? books,
    bool? loading,
    String? loadError,
    Upload? upload,
  }) => LibraryState(
    books: books ?? this.books,
    loading: loading ?? this.loading,
    loadError: loadError,
    upload: upload ?? this.upload,
  );
}

sealed class LibraryEvent {
  const LibraryEvent();
}

final class LibraryStarted extends LibraryEvent {
  const LibraryStarted();
}

final class ImportRequested extends LibraryEvent {
  const ImportRequested();
}

class LibraryBloc extends Bloc<LibraryEvent, LibraryState> {
  LibraryBloc({required BooksRepository repository, required PickEpub pickEpub})
    : _repository = repository,
      _pickEpub = pickEpub,
      super(const LibraryState()) {
    on<LibraryStarted>(_onStarted);
    on<ImportRequested>(_onImportRequested);
  }

  final BooksRepository _repository;
  final PickEpub _pickEpub;

  Future<void> _onStarted(
    LibraryStarted event,
    Emitter<LibraryState> emit,
  ) async {
    emit(state.copyWith(loading: true));
    try {
      emit(state.copyWith(books: await _repository.books(), loading: false));
    } on BooksException catch (error) {
      emit(state.copyWith(loading: false, loadError: error.code));
    }
  }

  Future<void> _onImportRequested(
    ImportRequested event,
    Emitter<LibraryState> emit,
  ) async {
    if (state.upload is Uploading) return;
    final source = await _pickEpub();
    if (source == null) return;
    emit(state.copyWith(upload: Uploading(source.fileName, 0)));
    try {
      final book = await _repository.importEpub(
        source,
        onProgress: (progress) =>
            emit(state.copyWith(upload: Uploading(source.fileName, progress))),
      );
      // Importing the same file again returns the existing book; keep one entry per book.
      final others = state.books.where(
        (existing) => existing.bookId != book.bookId,
      );
      emit(state.copyWith(books: [book, ...others], upload: const NoUpload()));
    } on BooksException catch (error) {
      emit(state.copyWith(upload: UploadFailed(source.fileName, error.code)));
    }
  }
}
