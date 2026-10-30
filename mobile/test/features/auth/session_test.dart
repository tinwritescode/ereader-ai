import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/auth/data/session.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryStore implements TokenStore {
  _MemoryStore(this.tokens);

  SessionTokens? tokens;

  @override
  Future<SessionTokens?> read() async => tokens;

  @override
  Future<void> write(SessionTokens tokens) async => this.tokens = tokens;

  @override
  Future<void> clear() async => tokens = null;
}

/// A server whose access tokens start out expired, until /auth/refresh hands out [good].
class _Server implements HttpClientAdapter {
  _Server({this.refreshStatus = 200, this.reachable = true});

  final int refreshStatus;
  bool reachable;
  static const good = 'fresh';
  int refreshes = 0;
  final seen = <String?>[];
  final bodies = <int>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final bytes = await requestStream?.fold<int>(0, (sum, c) => sum + c.length);
    if (options.path == '/auth/refresh') {
      refreshes++;
      await Future<void>.delayed(Duration.zero);
      if (!reachable) {
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'offline',
        );
      }
      return _json(refreshStatus, {'accessToken': good, 'refreshToken': 'r2'});
    }
    seen.add(options.headers['Authorization'] as String?);
    if (bytes != null) bodies.add(bytes);
    return options.headers['Authorization'] == 'Bearer $good'
        ? _json(200, {'ok': true})
        : _json(401, {'code': 'SIGN_IN_REQUIRED'});
  }

  ResponseBody _json(int status, Object body) => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Server server;
  late _MemoryStore store;
  late Session session;
  late Dio api;

  void start(_Server adapter, {SessionTokens? tokens}) {
    server = adapter;
    store = _MemoryStore(tokens ?? (access: 'old', refresh: 'r1'));
    final base = BaseOptions(baseUrl: 'http://api.test');
    session = Session(store, Dio(base)..httpClientAdapter = server);
    api = Dio(base)..httpClientAdapter = server;
    api.interceptors.add(SessionInterceptor(session, api));
  }

  test('renews an expired token, keeps the new pair, and retries', () async {
    start(_Server());

    final response = await api.get<Object?>('/books');

    expect(response.statusCode, 200);
    expect(server.seen, ['Bearer old', 'Bearer fresh']);
    expect(store.tokens, (access: 'fresh', refresh: 'r2'));
  });

  test('requests failing together share one renewal', () async {
    start(_Server());

    await Future.wait([for (var i = 0; i < 5; i++) api.get<Object?>('/books')]);

    expect(server.refreshes, 1);
  });

  test('sends an upload whole again after renewing', () async {
    start(_Server());

    await api.post<Object?>(
      '/books',
      data: FormData.fromMap({
        'file': MultipartFile.fromBytes(List.filled(64, 1), filename: 'a.epub'),
      }),
    );

    expect(server.bodies, hasLength(2));
    expect(server.bodies.last, greaterThan(64));
  });

  test('ends the session when the server refuses to renew it', () async {
    start(_Server(refreshStatus: 401));
    var lost = 0;
    session.lost.listen((_) => lost++);

    await expectLater(api.get<Object?>('/books'), throwsA(isA<DioException>()));
    await pumpEventQueue();

    expect(lost, 1);
    expect(store.tokens, isNull);
  });

  test('keeps the session through a network failure', () async {
    start(_Server(reachable: false));
    var lost = 0;
    session.lost.listen((_) => lost++);

    await expectLater(api.get<Object?>('/books'), throwsA(isA<DioException>()));
    await pumpEventQueue();

    expect(lost, 0);
    expect(store.tokens, isNotNull);
  });
}
