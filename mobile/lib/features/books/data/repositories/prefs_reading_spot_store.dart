import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/entities/reading_length.dart';
import '../../domain/entities/reading_spot.dart';
import '../../domain/repositories/reading_spot_store.dart';

const _key = 'reading.spots';

/// Stores every book's spot as one JSON object. Entries that do not parse are dropped.
class PrefsReadingSpotStore implements ReadingSpotStore {
  @override
  Future<Map<String, ReadingSpot>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return {};
    final Object? decoded;
    try {
      decoded = jsonDecode(raw);
    } on FormatException {
      return {};
    }
    if (decoded is! Map<String, dynamic>) return {};
    return {
      for (final MapEntry(:key, :value) in decoded.entries) key: ?_parse(value),
    };
  }

  @override
  Future<void> save(Map<String, ReadingSpot> spots) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key,
      jsonEncode({
        for (final MapEntry(:key, :value) in spots.entries) key: _encode(value),
      }),
    );
  }
}

Map<String, Object?> _encode(ReadingSpot spot) => {
  'chapterId': spot.chapterId,
  'chapterLabel': spot.chapterLabel,
  'minutesLeft': spot.minutesLeft,
  'length': spot.option?.length.name,
  'minutes': spot.option?.minutes,
  'block': spot.block,
};

ReadingSpot? _parse(Object? value) {
  if (value case {
    'chapterId': final String chapterId,
    'chapterLabel': final String chapterLabel,
    'minutesLeft': final int minutesLeft,
    'block': final int block,
  }) {
    final length = ReadingLength.values.asNameMap()[value['length']];
    final minutes = value['minutes'];
    return ReadingSpot(
      chapterId: chapterId,
      chapterLabel: chapterLabel,
      minutesLeft: minutesLeft,
      option: length != null && minutes is int
          ? LengthOption(length, minutes)
          : null,
      block: block,
    );
  }
  return null;
}
