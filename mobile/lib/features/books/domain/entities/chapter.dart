class ChapterSummary {
  const ChapterSummary({
    required this.chapterId,
    required this.label,
    required this.subtitle,
    required this.minutes,
  });

  final String chapterId;

  /// The table-of-contents entry, e.g. "Chương Một".
  final String label;

  /// The heading under the label, when the book has one.
  final String? subtitle;
  final int minutes;
}

/// Body text of a chapter, as paragraphs and in-chapter headings.
class ChapterText {
  const ChapterText(this.blocks);

  final List<TextBlock> blocks;
}

enum TextBlockKind { heading, paragraph }

class TextBlock {
  const TextBlock(this.kind, this.text);

  final TextBlockKind kind;
  final String text;
}
