/// "45 phút", "1 giờ", "9 giờ 17 phút".
String durationLabel(int minutes) {
  if (minutes < 60) return '$minutes phút';
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return rest == 0 ? '$hours giờ' : '$hours giờ $rest phút';
}

/// Many EPUBs set headings in capitals; show them in sentence case.
String displayTitle(String text) {
  final hasLetters = text.toUpperCase() != text.toLowerCase();
  if (!hasLetters || text != text.toUpperCase()) return text;
  final lower = text.toLowerCase();
  return lower[0].toUpperCase() + lower.substring(1);
}

String errorMessage(String code) => switch (code) {
  'EPUB_INVALID' => 'File này không phải EPUB hợp lệ.',
  'UNSUPPORTED_TYPE' => 'Chỉ hỗ trợ file .epub.',
  'FILE_TOO_LARGE' => 'File lớn hơn 100 MB.',
  'NETWORK_ERROR' => 'Không kết nối được máy chủ.',
  'DIGEST_FAILED' => 'AI chưa rút gọn được chương này.',
  _ => 'Máy chủ báo lỗi $code.',
};
