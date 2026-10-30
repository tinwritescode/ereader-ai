import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

typedef SessionTokens = ({String access, String refresh});

abstract interface class TokenStore {
  Future<SessionTokens?> read();
  Future<void> write(SessionTokens tokens);
  Future<void> clear();
}

class KeychainTokenStore implements TokenStore {
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';
  final _storage = const FlutterSecureStorage();

  @override
  Future<SessionTokens?> read() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    if (access == null || refresh == null) return null;
    return (access: access, refresh: refresh);
  }

  @override
  Future<void> write(SessionTokens tokens) async {
    await _storage.write(key: _accessKey, value: tokens.access);
    await _storage.write(key: _refreshKey, value: tokens.refresh);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// The tokens of the signed-in reader, and the one place that renews them.
class Session {
  Session(this._store, this._auth);

  final TokenStore _store;

  /// Talks to /auth only: it must not pass through [SessionInterceptor].
  final Dio _auth;
  final _lost = StreamController<void>.broadcast();
  late final Future<void> _loaded = _load();
  SessionTokens? _tokens;
  Future<String?>? _renewing;

  Stream<void> get lost => _lost.stream;

  Future<void> _load() async => _tokens = await _store.read();

  Future<String?> accessToken() async {
    await _loaded;
    return _tokens?.access;
  }

  Future<void> open(SessionTokens tokens) async {
    await _loaded;
    _tokens = tokens;
    await _store.write(tokens);
  }

  Future<void> close() async {
    await _loaded;
    _tokens = null;
    await _store.clear();
  }

  /// A fresh access token; null when the session is over.
  ///
  /// Refresh tokens work once, so requests failing together share one renewal.
  /// Throws [DioException] when the server cannot be reached: the session is
  /// still good, and must survive a tunnel.
  Future<String?> renew() => _renewing ??= _renew().whenComplete(() {
    _renewing = null;
  });

  Future<String?> _renew() async {
    final refresh = (await accessToken()) == null ? null : _tokens?.refresh;
    if (refresh == null) return null;
    try {
      final response = await _auth.post<Object?>(
        '/auth/refresh',
        data: {'refreshToken': refresh},
      );
      return switch (response.data) {
        {
          'accessToken': final String access,
          'refreshToken': final String refresh,
        } =>
          _renewed((access: access, refresh: refresh)),
        _ => throw StateError('Unexpected /auth/refresh response'),
      };
    } on DioException catch (error) {
      if (error.response?.statusCode != 401) rethrow;
      await close();
      _lost.add(null);
      return null;
    }
  }

  Future<String> _renewed(SessionTokens tokens) async {
    await open(tokens);
    return tokens.access;
  }
}

/// Puts the access token on every request, and renews it once when it has expired.
class SessionInterceptor extends Interceptor {
  SessionInterceptor(this._session, this._api);

  static const _retried = 'session_retried';
  static const _header = 'Authorization';

  final Session _session;
  final Dio _api;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _session.accessToken();
    if (token != null) options.headers[_header] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 || options.extra[_retried] == true) {
      return handler.next(err);
    }
    try {
      final token = await _freshToken(options);
      if (token == null) return handler.next(err);
      options
        ..extra[_retried] = true
        ..headers[_header] = 'Bearer $token';
      // A multipart body is a one-shot stream.
      if (options.data case final FormData form) options.data = form.clone();
      handler.resolve(await _api.fetch<Object?>(options));
    } on DioException catch (failure) {
      handler.next(failure);
    }
  }

  /// Another request may have renewed the token while this one was in the air.
  Future<String?> _freshToken(RequestOptions failed) async {
    final current = await _session.accessToken();
    final sent = failed.headers[_header];
    if (current != null && sent != 'Bearer $current') return current;
    return _session.renew();
  }
}
