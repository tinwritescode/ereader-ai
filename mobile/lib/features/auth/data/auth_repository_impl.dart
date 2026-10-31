import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../domain/account.dart';
import '../domain/auth_repository.dart';
import 'session.dart';

const _callbackScheme = 'com.ereaderai.ereadermobile';
const _authorizeUrl = 'https://api.workos.com/user_management/authorize';

/// Opens [url] in a system sign-in page and answers with the callback URL.
typedef OpenSignIn = Future<String> Function(Uri url, String callbackScheme);

Future<String> openSignInPage(Uri url, String callbackScheme) =>
    FlutterWebAuth2.authenticate(
      url: url.toString(),
      callbackUrlScheme: callbackScheme,
      options: const FlutterWebAuth2Options(preferEphemeral: true),
    );

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required Dio api,
    required Dio auth,
    required Session session,
    required String clientId,
    OpenSignIn openSignIn = openSignInPage,
  }) : _api = api,
       _auth = auth,
       _session = session,
       _clientId = clientId,
       _openSignIn = openSignIn;

  final Dio _api;
  final Dio _auth;
  final Session _session;
  final String _clientId;
  final OpenSignIn _openSignIn;

  @override
  Stream<void> get sessionLost => _session.lost;

  @override
  Future<Account?> restore() async {
    if (await _session.accessToken() == null) return null;
    try {
      return await me();
    } on AuthException catch (error) {
      if (error.code == 'SIGN_IN_REQUIRED' || error.code == 'HTTP_401') {
        return null;
      }
      rethrow;
    }
  }

  @override
  Future<Account> signIn({required bool newAccount}) async {
    final verifier = _randomToken();
    final state = _randomToken();
    final callback = await _callback(
      Uri.parse(_authorizeUrl).replace(
        queryParameters: {
          'response_type': 'code',
          'client_id': _clientId,
          'redirect_uri': '$_callbackScheme://callback',
          'provider': 'authkit',
          'code_challenge': base64Url
              .encode(sha256.convert(ascii.encode(verifier)).bytes)
              .replaceAll('=', ''),
          'code_challenge_method': 'S256',
          'state': state,
          if (newAccount) 'screen_hint': 'sign-up',
        },
      ),
    );
    final query = Uri.parse(callback).queryParameters;
    final code = query['code'];
    if (code == null || query['state'] != state) {
      throw const AuthException('SIGN_IN_FAILED');
    }
    await _session.open(await _exchange(code, verifier));
    return me();
  }

  Future<String> _callback(Uri url) async {
    try {
      return await _openSignIn(url, _callbackScheme);
    } on PlatformException catch (error) {
      throw AuthException(
        error.code == 'CANCELED' ? AuthException.canceled : 'SIGN_IN_FAILED',
      );
    }
  }

  Future<SessionTokens> _exchange(String code, String verifier) =>
      _call(() async {
        final response = await _auth.post<Object?>(
          '/auth/token',
          data: {'code': code, 'codeVerifier': verifier},
        );
        return switch (response.data) {
          {
            'accessToken': final String access,
            'refreshToken': final String refresh,
          } =>
            (access: access, refresh: refresh),
          _ => throw const AuthException('UNEXPECTED_RESPONSE'),
        };
      });

  @override
  Future<void> signOut() => _session.close();

  @override
  Future<Account> me() => _call(() async {
    final response = await _api.get<Object?>('/me');
    return _toAccount(response.data);
  });

  @override
  Future<void> requestPlan(PlanName plan) => _call(
    () => _api.post<Object?>('/me/plan-request', data: {'plan': plan.name}),
  );

  @override
  Future<List<ManagedAccount>> accounts() => _call(() async {
    final response = await _api.get<Object?>('/admin/accounts');
    return switch (response.data) {
      {'accounts': final List<Object?> accounts} =>
        accounts.map(_toManagedAccount).toList(),
      _ => throw const AuthException('UNEXPECTED_RESPONSE'),
    };
  });

  @override
  Future<void> setPlan(String accountId, PlanName plan) => _call(
    () => _api.patch<Object?>(
      '/admin/accounts/$accountId',
      data: {'plan': plan.name},
    ),
  );
}

String _randomToken() {
  final random = Random.secure();
  return base64Url
      .encode(List.generate(32, (_) => random.nextInt(256)))
      .replaceAll('=', '');
}

Future<T> _call<T>(Future<T> Function() request) async {
  try {
    return await request();
  } on DioException catch (error) {
    final response = error.response;
    throw AuthException(switch (response?.data) {
      {'code': final String code} => code,
      _ when response == null => 'NETWORK_ERROR',
      _ => 'HTTP_${response.statusCode}',
    });
  }
}

PlanName _plan(String name) => PlanName.values.firstWhere(
  (plan) => plan.name == name,
  orElse: () => throw const AuthException('UNEXPECTED_RESPONSE'),
);

Account _toAccount(Object? json) => switch (json) {
  {
    'email': final String email,
    'role': final String role,
    'plan': final String plan,
    'requestedPlan': final String? requestedPlan,
    'usage': {
      'digests': final int digests,
      'vbeeMinutes': final int vbeeMinutes,
    },
    'resetsOn': final String resetsOn,
    'plans': final Map<String, Object?> plans,
  } =>
    Account(
      email: email,
      isSuperAdmin: role == 'super_admin',
      plan: _plan(plan),
      requestedPlan: requestedPlan == null ? null : _plan(requestedPlan),
      digestsUsed: digests,
      vbeeMinutesUsed: vbeeMinutes,
      resetsOn: DateTime.parse(resetsOn),
      plans: {
        for (final MapEntry(:key, :value) in plans.entries)
          _plan(key): _toLimits(value),
      },
    ),
  _ => throw const AuthException('UNEXPECTED_RESPONSE'),
};

PlanLimits _toLimits(Object? json) => switch (json) {
  {
    'books': final int books,
    'monthlyDigests': final int monthlyDigests,
    'monthlyVbeeMinutes': final int monthlyVbeeMinutes,
    'chapterVoice': final bool chapterVoice,
  } =>
    PlanLimits(
      books: books,
      monthlyDigests: monthlyDigests,
      monthlyVbeeMinutes: monthlyVbeeMinutes,
      chapterVoice: chapterVoice,
    ),
  _ => throw const AuthException('UNEXPECTED_RESPONSE'),
};

ManagedAccount _toManagedAccount(Object? json) => switch (json) {
  {
    'id': final String id,
    'email': final String email,
    'role': final String role,
    'plan': final String plan,
    'requestedPlan': final String? requestedPlan,
    'usage': {'digests': final int digests},
  } =>
    ManagedAccount(
      id: id,
      email: email,
      isSuperAdmin: role == 'super_admin',
      plan: _plan(plan),
      requestedPlan: requestedPlan == null ? null : _plan(requestedPlan),
      digestsUsed: digests,
    ),
  _ => throw const AuthException('UNEXPECTED_RESPONSE'),
};
