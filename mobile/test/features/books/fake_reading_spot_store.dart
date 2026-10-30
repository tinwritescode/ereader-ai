import 'package:ereader_mobile/features/books/domain/entities/reading_spot.dart';
import 'package:ereader_mobile/features/books/domain/repositories/reading_spot_store.dart';

/// Keeps reading spots in memory, by book id.
class FakeReadingSpotStore implements ReadingSpotStore {
  FakeReadingSpotStore([Map<String, ReadingSpot>? saved]) : saved = {...?saved};

  Map<String, ReadingSpot> saved;

  @override
  Future<Map<String, ReadingSpot>> load() async => {...saved};

  @override
  Future<void> save(Map<String, ReadingSpot> spots) async => saved = {...spots};
}
