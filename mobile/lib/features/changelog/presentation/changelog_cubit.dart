import 'package:flutter_bloc/flutter_bloc.dart';

import '../domain/release.dart';

class ChangelogState {
  const ChangelogState({this.releases = const [], this.seen});

  /// Newest first.
  final List<Release> releases;

  /// The newest version the reader has been shown.
  final String? seen;

  Release? get newest => releases.isEmpty ? null : releases.first;

  /// The newest version has not been read yet.
  bool get unseen => newest != null && newest!.version != seen;

  /// Worth stopping the reader for: something new, not only fixes.
  Release? get announce => unseen && newest!.added.isNotEmpty ? newest : null;
}

class ChangelogCubit extends Cubit<ChangelogState> {
  ChangelogCubit(this._repository, this._store) : super(const ChangelogState());

  final ChangelogRepository _repository;
  final SeenReleaseStore _store;

  Future<void> load() async {
    final List<Release> releases;
    try {
      releases = await _repository.list();
    } on ChangelogException {
      return;
    }
    var seen = await _store.load();
    // A first install has nothing to catch up on.
    if (seen == null && releases.isNotEmpty) {
      seen = releases.first.version;
      await _store.save(seen);
    }
    if (!isClosed) emit(ChangelogState(releases: releases, seen: seen));
  }

  /// The reader has seen the newest version, in the sheet or on the page.
  Future<void> read() async {
    final newest = state.newest;
    if (newest == null || !state.unseen) return;
    await _store.save(newest.version);
    if (!isClosed) {
      emit(ChangelogState(releases: state.releases, seen: newest.version));
    }
  }
}
