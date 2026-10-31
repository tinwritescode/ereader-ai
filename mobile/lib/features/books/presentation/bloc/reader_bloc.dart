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

/// The translation is not made yet; the original stands in, faded, until it is.
final class ReaderTextUntranslated extends ReaderText {
  const ReaderTextUntranslated(this.original);

  final ChapterText original;
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
    if (state.option != option || state.text is! ReaderTextUntranslated) {
      emit(ReaderState(option: option, text: const ReaderTextLoading()));
    }
    try {
      final text = await _load(option);
      _cache[option] = text;
      // A later switch may have replaced this request; only the current choice updates the screen.
      if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextLoaded(text)));
      }
    } on BooksException catch (error) {
      if (error.code == 'TRANSLATION_NOT_READY') {
        await _showOriginalFor(option, emit);
      } else if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextFailed(error.code)));
      }
    }
  }

  Future<ChapterText> _load(LengthOption option) {
    final chapterId = _chapter.chapterId;
    return switch (option.length) {
      ReadingLength.original => _repository.original(chapterId),
      ReadingLength.vietnamese => _repository.translated(chapterId),
      ReadingLength.shortened || ReadingLength.keyPoints =>
        _repository.shortened(chapterId, minutes: option.minutes),
    };
  }

  Future<void> _showOriginalFor(
    LengthOption option,
    Emitter<ReaderState> emit,
  ) async {
    final original = LengthOption(ReadingLength.original, option.minutes);
    try {
      final text =
          _cache[original] ?? await _repository.original(_chapter.chapterId);
      _cache[original] = text;
      if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextUntranslated(text)));
      }
    } on BooksException catch (error) {
      if (state.option == option) {
        emit(ReaderState(option: option, text: ReaderTextFailed(error.code)));
      }
    }
  }
}
