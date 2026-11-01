/// A run of a note's text; [marked] runs are shown under the marker.
class Segment {
  const Segment(this.text, {this.marked = false});

  final String text;
  final bool marked;
}

/// One line of a release's notes.
typedef Note = List<Segment>;

/// What one version changed, as written in backend/changelog.
class Release {
  const Release({
    required this.version,
    required this.date,
    required this.title,
    required this.added,
    required this.fixed,
  });

  final String version;
  final DateTime date;
  final String title;
  final List<Note> added;
  final List<Note> fixed;
}

class ChangelogException implements Exception {
  const ChangelogException();
}

abstract interface class ChangelogRepository {
  /// Every release, newest first.
  Future<List<Release>> list();
}

/// The newest version the reader has been shown, kept on this device.
abstract interface class SeenReleaseStore {
  Future<String?> load();
  Future<void> save(String version);
}
