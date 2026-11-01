import 'package:dio/dio.dart';

import '../domain/release.dart';

class ChangelogRepositoryImpl implements ChangelogRepository {
  const ChangelogRepositoryImpl(this._api);

  final Dio _api;

  @override
  Future<List<Release>> list() async {
    try {
      final response = await _api.get<Object?>('/changelog');
      return switch (response.data) {
        {'releases': final List<Object?> releases} =>
          releases.map(_release).toList(),
        _ => throw const ChangelogException(),
      };
    } on DioException {
      throw const ChangelogException();
    }
  }
}

Release _release(Object? json) => switch (json) {
  {
    'version': final String version,
    'date': final String date,
    'title': final String title,
    'added': final List<Object?> added,
    'fixed': final List<Object?> fixed,
  } =>
    Release(
      version: version,
      date: DateTime.parse('${date}T00:00:00Z'),
      title: title,
      added: added.map(_note).toList(),
      fixed: fixed.map(_note).toList(),
    ),
  _ => throw const ChangelogException(),
};

Note _note(Object? json) => switch (json) {
  final List<Object?> segments => segments.map(_segment).toList(),
  _ => throw const ChangelogException(),
};

Segment _segment(Object? json) => switch (json) {
  {'text': final String text, 'marked': final bool marked} => Segment(
    text,
    marked: marked,
  ),
  _ => throw const ChangelogException(),
};
