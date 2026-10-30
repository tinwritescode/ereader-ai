import 'package:file_picker/file_picker.dart';

import '../../domain/entities/epub_source.dart';

/// Opens the system document picker filtered to `.epub`; `null` when cancelled.
Future<EpubSource?> pickEpubFromDevice() async {
  final file = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: const ['epub'],
  );
  final path = file?.path;
  if (file == null || path == null) return null;
  return EpubSource(path: path, fileName: file.name);
}
