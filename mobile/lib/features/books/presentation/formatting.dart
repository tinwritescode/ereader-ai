import '../domain/entities/chapter.dart';

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

/// What a chapter is called, whichever way round the book stores it: some put
/// "Chương Một" over a title, others "Quy luật 1" under "QUY LUẬT 1 ĐỨNG THẲNG".
({String? number, String title}) chapterHeading(ChapterSummary chapter) {
  final label = chapter.label.trim();
  final subtitle = chapter.subtitle?.trim();
  if (subtitle == null || subtitle.isEmpty) {
    return (number: null, title: displayTitle(label));
  }
  final shortFirst = label.length <= subtitle.length;
  final short = shortFirst ? label : subtitle;
  final long = shortFirst ? subtitle : label;
  if (!long.toLowerCase().startsWith(short.toLowerCase())) {
    return (number: label, title: displayTitle(subtitle));
  }
  final rest = long.substring(short.length).replaceFirst(_titleJoint, '');
  return rest.isEmpty
      ? (number: null, title: displayTitle(long))
      : (number: short, title: displayTitle(rest));
}

final _titleJoint = RegExp(r'^[\s:.,–—-]+');

/// The shortest name of a chapter, for "Đọc tiếp Chương Hai".
String chapterName(ChapterSummary chapter) {
  final (:number, :title) = chapterHeading(chapter);
  return number ?? title;
}

String errorMessage(String code) => switch (code) {
  'EPUB_INVALID' => 'File này không phải EPUB hợp lệ.',
  'UNSUPPORTED_TYPE' => 'Chỉ hỗ trợ file .epub.',
  'FILE_TOO_LARGE' => 'File lớn hơn 100 MB.',
  'PLAN_FILE_TOO_LARGE' => 'File lớn hơn mức của gói này.',
  'BOOK_LIMIT' => 'Đã đủ số sách của gói này.',
  'DIGEST_LIMIT' => 'Hết lượt rút gọn tháng này.',
  'NETWORK_ERROR' => 'Không kết nối được máy chủ.',
  'DIGEST_FAILED' => 'AI chưa rút gọn được chương này.',
  _ => 'Máy chủ báo lỗi $code.',
};
