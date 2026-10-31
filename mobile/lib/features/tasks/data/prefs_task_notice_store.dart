import 'package:shared_preferences/shared_preferences.dart';

import '../domain/chapter_task.dart';

const _seen = 'tasks.seen';
// Finished tasks leave the list after a week, so an old mark is never needed.
const _kept = 200;

class PrefsTaskNoticeStore implements TaskNoticeStore {
  @override
  Future<Set<String>> load() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_seen) ?? const []).toSet();
  }

  @override
  Future<void> save(Set<String> seen) async {
    final prefs = await SharedPreferences.getInstance();
    final recent = seen.toList();
    final start = recent.length > _kept ? recent.length - _kept : 0;
    await prefs.setStringList(_seen, recent.sublist(start));
  }
}
