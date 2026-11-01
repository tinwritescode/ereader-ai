import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/changelog/data/changelog_repository_impl.dart';
import 'package:ereader_mobile/features/changelog/domain/release.dart';
import 'package:flutter_test/flutter_test.dart';

class _Server implements HttpClientAdapter {
  _Server(this.status, this.body);

  final int status;
  final Object body;
  String? path;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    path = options.path;
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ChangelogRepositoryImpl _repository(_Server server) =>
    ChangelogRepositoryImpl(Dio()..httpClientAdapter = server);

void main() {
  test('reads the releases the backend lists, newest first', () async {
    final server = _Server(200, {
      'releases': [
        {
          'version': '1.1.0',
          'date': '2026-11-01',
          'title': 'Theo dõi tác vụ',
          'added': [
            [
              {'text': 'Trang Tác vụ', 'marked': true},
              {'text': ' cho biết phần trăm.', 'marked': false},
            ],
          ],
          'fixed': [],
        },
      ],
    });
    final [release] = await _repository(server).list();
    expect(server.path, '/changelog');
    expect(release.version, '1.1.0');
    expect(release.date, DateTime.utc(2026, 11, 1));
    expect(release.title, 'Theo dõi tác vụ');
    expect(release.added.single.map((s) => (s.text, s.marked)), [
      ('Trang Tác vụ', true),
      (' cho biết phần trăm.', false),
    ]);
    expect(release.fixed, isEmpty);
  });

  test('turns a failed or unexpected answer into ChangelogException', () async {
    await expectLater(
      _repository(_Server(500, {})).list(),
      throwsA(isA<ChangelogException>()),
    );
    await expectLater(
      _repository(_Server(200, {'releases': 'none'})).list(),
      throwsA(isA<ChangelogException>()),
    );
  });
}
