import '../entities/reading_look.dart';

/// Keeps the [ReadingLook] on the device.
abstract interface class ReadingLookStore {
  Future<ReadingLook> load();
  Future<void> save(ReadingLook look);
}
