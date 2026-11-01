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

/// Body text of a chapter, as paragraphs and in-chapter headings, with the
/// book's pictures beside them. Numbering blocks stays the text's own affair.
class ChapterText {
  const ChapterText(this.blocks, {this.figures = const []});

  final List<TextBlock> blocks;
  final List<Figure> figures;
}

/// A picture standing before the block at index [before]; the block count
/// puts it last.
class Figure {
  const Figure({
    required this.before,
    required this.url,
    required this.alt,
    required this.aspectRatio,
  });

  final int before;
  final String url;
  final String? alt;
  final double aspectRatio;
}

enum TextBlockKind { heading, paragraph }

class TextBlock {
  const TextBlock(this.kind, this.text);

  final TextBlockKind kind;
  final String text;
}
