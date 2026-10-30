import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/chapter.dart';
import '../../domain/repositories/books_repository.dart';

sealed class BookState {
  const BookState();
}

final class BookLoading extends BookState {
  const BookLoading();
}

final class BookLoaded extends BookState {
  const BookLoaded(this.chapters);

  final List<ChapterSummary> chapters;
}

final class BookFailed extends BookState {
  const BookFailed(this.code);

  final String code;
}

sealed class BookEvent {
  const BookEvent();
}

final class BookStarted extends BookEvent {
  const BookStarted(this.bookId);

  final String bookId;
}

class BookBloc extends Bloc<BookEvent, BookState> {
  BookBloc(this._repository) : super(const BookLoading()) {
    on<BookStarted>(_onStarted);
  }

  final BooksRepository _repository;

  Future<void> _onStarted(BookStarted event, Emitter<BookState> emit) async {
    emit(const BookLoading());
    try {
      emit(BookLoaded(await _repository.chapters(event.bookId)));
    } on BooksException catch (error) {
      emit(BookFailed(error.code));
    }
  }
}
