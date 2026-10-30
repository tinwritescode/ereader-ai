import '../domain/entities/reading_length.dart';

/// The length the reader chose last, preselected in the next sheet. Kept for the app session.
class LengthMemory {
  ReadingLength last = ReadingLength.shortened;
}
