import 'package:shared_preferences/shared_preferences.dart';

import '../domain/release.dart';

const _seen = 'changelog.seen';

class PrefsSeenReleaseStore implements SeenReleaseStore {
  @override
  Future<String?> load() async =>
      (await SharedPreferences.getInstance()).getString(_seen);

  @override
  Future<void> save(String version) async =>
      (await SharedPreferences.getInstance()).setString(_seen, version);
}
