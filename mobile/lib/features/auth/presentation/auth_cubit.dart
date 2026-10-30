import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../domain/account.dart';
import '../domain/auth_repository.dart';

sealed class AuthState {
  const AuthState();
}

final class AuthChecking extends AuthState {
  const AuthChecking();
}

final class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.failure});

  final String? failure;
}

/// A session exists on this device, but the server could not be reached.
final class AuthUnreachable extends AuthState {
  const AuthUnreachable();
}

final class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.account);

  final Account account;
}

class AuthCubit extends Cubit<AuthState> {
  AuthCubit(this._repository) : super(const AuthChecking()) {
    _lost = _repository.sessionLost.listen((_) {
      emit(const AuthSignedOut());
    });
  }

  final AuthRepository _repository;
  late final StreamSubscription<void> _lost;

  /// Finds the session kept on this device.
  Future<void> start() async {
    emit(const AuthChecking());
    try {
      final account = await _repository.restore();
      if (isClosed) return;
      emit(account == null ? const AuthSignedOut() : AuthSignedIn(account));
    } on AuthException {
      if (!isClosed) emit(const AuthUnreachable());
    }
  }

  Future<void> signIn({bool newAccount = false}) async {
    try {
      emit(AuthSignedIn(await _repository.signIn(newAccount: newAccount)));
    } on AuthException catch (error) {
      emit(
        AuthSignedOut(
          failure: error.code == AuthException.canceled ? null : error.code,
        ),
      );
    }
  }

  Future<void> signOut() async {
    await _repository.signOut();
    emit(const AuthSignedOut());
  }

  /// Brings plan and usage up to date; keeps what is shown when that fails.
  Future<void> refresh() async {
    try {
      final account = await _repository.me();
      if (!isClosed && state is AuthSignedIn) emit(AuthSignedIn(account));
    } on AuthException {
      return;
    }
  }

  Future<void> requestPlan(PlanName plan) async {
    await _repository.requestPlan(plan);
    await refresh();
  }

  @override
  Future<void> close() async {
    await _lost.cancel();
    return super.close();
  }
}
