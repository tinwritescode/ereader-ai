/// Text size on the reading page, in logical points.
enum TextSize {
  small(15),
  medium(17),
  large(19.5);

  const TextSize(this.points);

  final double points;
}

/// Space between lines, as a multiple of the text size.
enum LineSpacing {
  tight(1.5),
  normal(1.7),
  loose(1.95);

  const LineSpacing(this.factor);

  final double factor;
}

/// The notebook page by day, or the same page in purple ink for reading in the dark.
enum Paper { day, night }

/// How the reader likes the page to look. Kept between chapters and launches.
class ReadingLook {
  const ReadingLook({
    this.size = TextSize.medium,
    this.spacing = LineSpacing.normal,
    this.paper = Paper.day,
  });

  final TextSize size;
  final LineSpacing spacing;
  final Paper paper;

  ReadingLook copyWith({TextSize? size, LineSpacing? spacing, Paper? paper}) =>
      ReadingLook(
        size: size ?? this.size,
        spacing: spacing ?? this.spacing,
        paper: paper ?? this.paper,
      );

  @override
  bool operator ==(Object other) =>
      other is ReadingLook &&
      other.size == size &&
      other.spacing == spacing &&
      other.paper == paper;

  @override
  int get hashCode => Object.hash(size, spacing, paper);

  @override
  String toString() => 'ReadingLook($size, $spacing, $paper)';
}
