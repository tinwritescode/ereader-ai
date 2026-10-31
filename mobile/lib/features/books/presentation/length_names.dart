import '../domain/entities/reading_length.dart';

String lengthName(ReadingLength length) => switch (length) {
  ReadingLength.original => 'Bản gốc',
  ReadingLength.vietnamese => 'Tiếng Việt',
  ReadingLength.shortened => 'Rút gọn',
  ReadingLength.keyPoints => 'Ý chính',
};
