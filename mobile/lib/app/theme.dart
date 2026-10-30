import 'package:flutter/material.dart';

/// Tokens from design/reader-flow-v2.html: a Vietnamese school notebook written in purple ink.
/// Red is the teacher's pen: minutes in the margin, the margin line, the choice on the ruler.
abstract final class Palette {
  static const paper = Color(0xFFF6F5FC);
  static const sheet = Color(0xFFFFFFFF);
  static const ink = Color(0xFF2A1F6E);
  static const text = Color(0xFF1E1A3A);
  static const muted = Color(0xFF6A6690);
  static const rule = Color(0xFFD3D0EC);
  static const red = Color(0xFFD8344F);
  static const rose = Color(0xFFF3C3CC);
  static const ruler = Color(0xFFFCF0B4);
  static const rulerEdge = Color(0xFFD9BE3C);
  static const marker = Color(0xFFFBE36B);

  // The reading page at night: the purple ink becomes the paper.
  static const night = Color(0xFF17123F);
  static const nightText = Color(0xFFDAD6F2);
  static const nightMuted = Color(0xFF9C97C9);
  static const nightRule = Color(0xFF3A3370);
}

const _read = 'Literata';
const _hand = 'PatrickHand';

/// Literata ships as one variable font, so weight is set on the axis as well as on [FontWeight].
TextStyle readingStyle({
  required double size,
  double height = 1.3,
  FontWeight weight = FontWeight.w400,
  Color color = Palette.text,
}) => TextStyle(
  fontFamily: _read,
  fontSize: size,
  height: height,
  fontWeight: weight,
  fontVariations: [FontVariation.weight(weight.value.toDouble())],
  color: color,
);

/// What a person would write on the page: minutes, time left, a book's name on its label.
TextStyle handStyle({
  required double size,
  double height = 1.2,
  Color color = Palette.red,
}) =>
    TextStyle(fontFamily: _hand, fontSize: size, height: height, color: color);

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    fontFamily: _read,
    scaffoldBackgroundColor: Palette.paper,
    colorScheme: ColorScheme.fromSeed(
      seedColor: Palette.ink,
      primary: Palette.ink,
      onPrimary: Palette.sheet,
      surface: Palette.paper,
      onSurface: Palette.text,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: Palette.text,
      displayColor: Palette.text,
    ),
    dividerColor: Palette.rule,
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Palette.sheet,
      showDragHandle: true,
      dragHandleColor: Palette.rule,
    ),
  );
}
