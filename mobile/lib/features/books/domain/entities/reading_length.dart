enum ReadingLength {
  original,

  /// The whole chapter, translated into Vietnamese.
  vietnamese,
  shortened,
  keyPoints;

  /// AI rewrote it shorter; the original and its translation are whole.
  bool get isShortened => this == shortened || this == keyPoints;
}

class LengthOption {
  const LengthOption(this.length, this.minutes);

  final ReadingLength length;
  final int minutes;

  @override
  bool operator ==(Object other) =>
      other is LengthOption &&
      other.length == length &&
      other.minutes == minutes;

  @override
  int get hashCode => Object.hash(length, minutes);

  @override
  String toString() => 'LengthOption($length, $minutes)';
}

/// Chapters shorter than this open the original directly.
const minimumShortenableMinutes = 5;
const _minimumOptionMinutes = 2;

/// Lengths scale with the chapter (about 50% and 25%), so a short chapter is never offered a longer version.
/// With [vietnamese], the book's translation follows the original.
List<LengthOption> lengthOptionsFor(
  int chapterMinutes, {
  bool vietnamese = false,
}) {
  final original = [
    LengthOption(ReadingLength.original, chapterMinutes),
    if (vietnamese) LengthOption(ReadingLength.vietnamese, chapterMinutes),
  ];
  if (chapterMinutes < minimumShortenableMinutes) return original;
  return [
    ...original,
    LengthOption(ReadingLength.shortened, (chapterMinutes * 0.5).round()),
    LengthOption(
      ReadingLength.keyPoints,
      (chapterMinutes * 0.25).round().clamp(
        _minimumOptionMinutes,
        chapterMinutes,
      ),
    ),
  ];
}
