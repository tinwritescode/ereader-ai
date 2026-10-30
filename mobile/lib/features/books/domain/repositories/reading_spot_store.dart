import '../entities/reading_spot.dart';

/// Keeps a [ReadingSpot] per book on the device, by book id.
abstract interface class ReadingSpotStore {
  Future<Map<String, ReadingSpot>> load();
  Future<void> save(Map<String, ReadingSpot> spots);
}
