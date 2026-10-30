import 'package:ereader_mobile/features/books/domain/entities/reading_look.dart';
import 'package:ereader_mobile/features/books/domain/repositories/reading_look_store.dart';

/// Keeps the reading look in memory and remembers the last one saved.
class FakeReadingLookStore implements ReadingLookStore {
  FakeReadingLookStore([this.saved = const ReadingLook()]);

  ReadingLook saved;

  @override
  Future<ReadingLook> load() async => saved;

  @override
  Future<void> save(ReadingLook look) async => saved = look;
}
