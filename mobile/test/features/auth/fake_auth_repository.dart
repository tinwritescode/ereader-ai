import 'dart:async';

import 'package:ereader_mobile/features/auth/domain/account.dart';
import 'package:ereader_mobile/features/auth/domain/auth_repository.dart';

const testPlans = {
  PlanName.free: PlanLimits(
    books: 3,
    monthlyDigests: 10,
    monthlyVbeeMinutes: 30,
    chapterVoice: false,
  ),
  PlanName.plus: PlanLimits(
    books: 30,
    monthlyDigests: 100,
    monthlyVbeeMinutes: 300,
    chapterVoice: false,
  ),
  PlanName.max: PlanLimits(
    books: 200,
    monthlyDigests: 500,
    monthlyVbeeMinutes: 1500,
    chapterVoice: true,
  ),
};

Account testAccount({
  PlanName plan = PlanName.free,
  bool isSuperAdmin = false,
  int digestsUsed = 7,
  int vbeeMinutesUsed = 12,
  PlanName? requestedPlan,
}) => Account(
  email: 'reader@example.com',
  isSuperAdmin: isSuperAdmin,
  plan: plan,
  requestedPlan: requestedPlan,
  digestsUsed: digestsUsed,
  vbeeMinutesUsed: vbeeMinutesUsed,
  resetsOn: DateTime(2026, 12),
  plans: testPlans,
);

class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({Account? account, this.restoreError})
    : kept = account ?? testAccount();

  /// What a successful sign-in, or the server, answers with.
  Account kept;
  bool signedIn = true;
  AuthException? restoreError;
  AuthException? signInError;
  bool? askedNewAccount;
  final requests = <PlanName>[];
  final managed = <ManagedAccount>[];
  final granted = <(String, PlanName)>[];
  final _lost = StreamController<void>.broadcast();

  void loseSession() => _lost.add(null);

  @override
  Stream<void> get sessionLost => _lost.stream;

  @override
  Future<Account?> restore() async {
    if (restoreError case final error?) throw error;
    return signedIn ? kept : null;
  }

  @override
  Future<Account> signIn({required bool newAccount}) async {
    askedNewAccount = newAccount;
    if (signInError case final error?) throw error;
    signedIn = true;
    return kept;
  }

  @override
  Future<void> signOut() async => signedIn = false;

  @override
  Future<Account> me() async => kept;

  @override
  Future<void> requestPlan(PlanName plan) async {
    requests.add(plan);
    kept = testAccount(plan: kept.plan, requestedPlan: plan);
  }

  @override
  Future<List<ManagedAccount>> accounts() async => managed;

  @override
  Future<void> setPlan(String accountId, PlanName plan) async =>
      granted.add((accountId, plan));
}
