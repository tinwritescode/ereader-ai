import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/entities/reading_look.dart';
import '../../domain/repositories/reading_look_store.dart';

const _size = 'reading.size';
const _spacing = 'reading.spacing';
const _paper = 'reading.paper';

/// Stores the look by enum name; an unknown or missing name falls back to the default.
class PrefsReadingLookStore implements ReadingLookStore {
  @override
  Future<ReadingLook> load() async {
    final prefs = await SharedPreferences.getInstance();
    const fallback = ReadingLook();
    return ReadingLook(
      size:
          TextSize.values.asNameMap()[prefs.getString(_size)] ?? fallback.size,
      spacing:
          LineSpacing.values.asNameMap()[prefs.getString(_spacing)] ??
          fallback.spacing,
      paper:
          Paper.values.asNameMap()[prefs.getString(_paper)] ?? fallback.paper,
    );
  }

  @override
  Future<void> save(ReadingLook look) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_size, look.size.name);
    await prefs.setString(_spacing, look.spacing.name);
    await prefs.setString(_paper, look.paper.name);
  }
}
