import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../../domain/repositories/books_repository.dart';

sealed class ReaderText {
  const ReaderText();
}

final class ReaderTextLoading extends ReaderText {
  const ReaderTextLoading();
}

final class ReaderTextLoaded extends ReaderText {
  const ReaderTextLoaded(this.text);

  final ChapterText text;
}

final class ReaderTextFailed extends ReaderText {
  const ReaderTextFailed(this.code);

  final String code;
}

class ReaderState {
  const ReaderState({required this.option, required this.text});

  final LengthOption option;
  final ReaderText text;
}

sealed class ReaderEvent {
  const ReaderEvent();
}

/// Opens the chapter at [option]; also used by the switch between original and shorter version.
final class ReaderLengthChosen extends ReaderEvent {
  const ReaderLengthChosen(this.option);

  final LengthOption option;
}

class ReaderBloc extends Bloc<ReaderEvent, ReaderState> {
  ReaderBloc({
    required BooksRepository repository,
    required ChapterSummary chapter,
    required LengthOption option,
  }) : _repository = repository,
       _chapter = chapter,
       super(ReaderState(option: option, text: const ReaderTextLoading())) {
    on<ReaderLengthChosen>(_onLengthChosen);
  }

  final BooksRepository _repository;
  final ChapterSummary _chapter;
  final _cache = <LengthOption, ChapterText>{};

  Future<void> _onLengthChosen(
    ReaderLengthChosen event,
    Emitter<ReaderState> emit,
  ) async {
    final option = event.option;
    final cached = _cache[option];
    if (cached != null) {
      emit(ReaderState(option: option, text: ReaderTextLoaded(cached)));
      return;
    }
    emit(ReaderState(option: option, text: const ReaderTextLoading()));
    try {
      final text = option.length == ReadingLength.original
          ? await _repository.original(_chapter.chapterId)
          : await _repository.shortened(
              _chapter.chapterId,
              minutes: option.minutes,
            );
      _cache[option] = text;
      // A later switch may have replaced this request; only the current choice updates the screen.
      if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextLoaded(text)));
      }
    } on BooksException catch (error) {
      if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextFailed(error.code)));
      }
    }
  }
}
