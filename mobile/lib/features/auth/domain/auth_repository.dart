import 'account.dart';

class AuthException implements Exception {
  const AuthException(this.code);

  /// The reader closed the sign-in page.
  static const canceled = 'CANCELED';

  final String code;
}

abstract interface class AuthRepository {
  /// The account of the session kept on this device; null when there is none.
  /// Throws [AuthException] when the server cannot be reached.
  Future<Account?> restore();

  /// Opens the sign-in page, or the sign-up page when [newAccount].
  Future<Account> signIn({required bool newAccount});

  Future<void> signOut();

  Future<Account> me();

  Future<void> requestPlan(PlanName plan);

  Future<List<ManagedAccount>> accounts();

  Future<void> setPlan(String accountId, PlanName plan);

  /// Fires when the server ends the session, e.g. it can no longer be renewed.
  Stream<void> get sessionLost;
}
