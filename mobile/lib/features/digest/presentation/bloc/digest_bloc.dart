import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/digest_request.dart';
import '../../domain/usecases/request_digest.dart';

sealed class DigestState {
  const DigestState();
}

final class DigestIdle extends DigestState {
  const DigestIdle();
}

final class DigestLoading extends DigestState {
  const DigestLoading(this.text);

  final String text;
}

final class DigestComplete extends DigestState {
  const DigestComplete(this.text);

  final String text;
}

final class DigestFailure extends DigestState {
  const DigestFailure(this.message);

  final String message;
}

sealed class DigestEvent {
  const DigestEvent();
}

final class DigestRequested extends DigestEvent {
  const DigestRequested(this.request);

  final DigestRequest request;
}

class DigestBloc extends Bloc<DigestEvent, DigestState> {
  DigestBloc(this._requestDigest) : super(const DigestIdle()) {
    on<DigestRequested>(_onRequested);
  }

  final RequestDigest _requestDigest;

  Future<void> _onRequested(
    DigestRequested event,
    Emitter<DigestState> emit,
  ) async {
    emit(const DigestLoading(''));
    final buffer = StringBuffer();
    try {
      await emit.forEach<String>(
        _requestDigest(event.request),
        onData: (chunk) {
          buffer.write(chunk);
          return DigestLoading(buffer.toString());
        },
      );
      emit(DigestComplete(buffer.toString()));
    } catch (error) {
      emit(DigestFailure(error.toString()));
    }
  }
}
