import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/auth/data/auth_repository_impl.dart';
import 'package:ereader_mobile/features/auth/data/session.dart';
import 'package:ereader_mobile/features/auth/domain/account.dart';
import 'package:ereader_mobile/features/auth/domain/auth_repository.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _me = {
  'email': 'reader@example.com',
  'role': 'super_admin',
  'plan': 'max',
  'requestedPlan': null,
  'usage': {'digests': 2, 'vbeeMinutes': 3, 'bookTranslations': 1},
  'resetsOn': '2026-12-01',
  'plans': {
    'free': {
      'books': 3,
      'monthlyDigests': 10,
      'monthlyVbeeMinutes': 30,
      'chapterVoice': false,
      'monthlyBookTranslations': 0,
      'maxFileBytes': 1,
    },
    'plus': {
      'books': 30,
      'monthlyDigests': 100,
      'monthlyVbeeMinutes': 300,
      'chapterVoice': false,
      'monthlyBookTranslations': 0,
      'maxFileBytes': 1,
    },
    'max': {
      'books': 200,
      'monthlyDigests': 500,
      'monthlyVbeeMinutes': 1500,
      'chapterVoice': true,
      'monthlyBookTranslations': 3,
      'maxFileBytes': 1,
    },
  },
};

class _Store implements TokenStore {
  SessionTokens? tokens;

  @override
  Future<SessionTokens?> read() async => tokens;

  @override
  Future<void> write(SessionTokens tokens) async => this.tokens = tokens;

  @override
  Future<void> clear() async => tokens = null;
}

class _Server implements HttpClientAdapter {
  Map<String, Object?>? exchanged;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path == '/auth/token') {
      final body = options.data;
      if (body is Map<String, Object?>) exchanged = body;
      return _json({'accessToken': 'a', 'refreshToken': 'r'});
    }
    return _json(_me);
  }

  ResponseBody _json(Object body) => ResponseBody.fromString(
    jsonEncode(body),
    200,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Server server;
  late _Store store;

  AuthRepositoryImpl repository(OpenSignIn open) {
    server = _Server();
    store = _Store();
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))
      ..httpClientAdapter = server;
    return AuthRepositoryImpl(
      api: dio,
      auth: dio,
      session: Session(store, dio),
      clientId: 'client_test',
      openSignIn: open,
    );
  }

  test('signs in with PKCE and keeps the tokens', () async {
    late Uri asked;
    final auth = repository((url, scheme) async {
      asked = url;
      return '$scheme://callback?code=the-code&state=${url.queryParameters['state']}';
    });

    final account = await auth.signIn(newAccount: false);

    expect(asked.queryParameters, containsPair('provider', 'authkit'));
    expect(asked.queryParameters, containsPair('client_id', 'client_test'));
    expect(
      asked.queryParameters['redirect_uri'],
      'com.ereaderai.ereadermobile://callback',
    );
    expect(asked.queryParameters.containsKey('screen_hint'), isFalse);
    expect(asked.toString(), isNot(contains('client_secret')));
    final verifier = server.exchanged?['codeVerifier'];
    expect(verifier, isA<String>());
    expect(
      asked.queryParameters['code_challenge'],
      base64Url
          .encode(sha256.convert(ascii.encode('$verifier')).bytes)
          .replaceAll('=', ''),
    );
    expect(server.exchanged?['code'], 'the-code');
    expect(store.tokens, (access: 'a', refresh: 'r'));
    expect(account.isSuperAdmin, isTrue);
    expect(account.plan, PlanName.max);
    expect(account.limits.books, 200);
    expect(account.limits.monthlyBookTranslations, 3);
    expect(account.bookTranslationsUsed, 1);
    expect(account.resetLabel, 'ngày 1/12');
  });

  test('opens the sign-up page for a new account', () async {
    late Uri asked;
    final auth = repository((url, scheme) async {
      asked = url;
      return '$scheme://callback?code=c&state=${url.queryParameters['state']}';
    });

    await auth.signIn(newAccount: true);

    expect(asked.queryParameters['screen_hint'], 'sign-up');
  });

  test('refuses a callback carrying another state', () async {
    final auth = repository(
      (_, scheme) async => '$scheme://callback?code=stolen&state=other',
    );

    await expectLater(
      auth.signIn(newAccount: false),
      throwsA(
        isA<AuthException>().having((e) => e.code, 'code', 'SIGN_IN_FAILED'),
      ),
    );
    expect(server.exchanged, isNull);
    expect(store.tokens, isNull);
  });

  test('reports closing the page as canceled', () async {
    final auth = repository((_, _) async {
      throw PlatformException(code: 'CANCELED');
    });

    await expectLater(
      auth.signIn(newAccount: false),
      throwsA(
        isA<AuthException>().having(
          (e) => e.code,
          'code',
          AuthException.canceled,
        ),
      ),
    );
  });

  test('has no account to restore without tokens', () async {
    expect(await repository((_, _) async => '').restore(), isNull);
  });
}
