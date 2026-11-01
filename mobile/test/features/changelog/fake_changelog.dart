import 'package:ereader_mobile/features/changelog/domain/release.dart';

Release release(String version, {bool added = true}) => Release(
  version: version,
  date: DateTime.utc(2026, 11, 1),
  title: 'Bản $version',
  added: [
    if (added) [const Segment('Mới', marked: true)],
  ],
  fixed: const [
    [Segment('Sửa.')],
  ],
);

class FakeChangelog implements ChangelogRepository {
  List<Release> releases = [];
  bool fails = false;

  @override
  Future<List<Release>> list() async =>
      fails ? throw const ChangelogException() : releases;
}

class FakeSeenStore implements SeenReleaseStore {
  String? seen;

  @override
  Future<String?> load() async => seen;

  @override
  Future<void> save(String version) async => seen = version;
}
