import 'package:flutter/material.dart';

import '../../../app/theme.dart';

/// Every line of notebook text sits on this grid.
const lineHeight = 28.0;

// Moves a ruled line from the bottom of a text line up to just under its baseline.
const _baselineLift = 6.0;

/// Width of the left margin, left of the red line.
const marginWidth = 54.0;

/// Line height factor that puts text of [size] on the ruled grid.
double onGrid(double size) => lineHeight / size;

/// Ruled notebook paper. Pass the page's [scroll] so the lines move with the text.
class RuledPaper extends StatelessWidget {
  const RuledPaper({super.key, required this.scroll, required this.child});

  final ScrollController scroll;
  final Widget child;

  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: _RuledPainter(scroll, MediaQuery.paddingOf(context).top),
    child: child,
  );
}

class _RuledPainter extends CustomPainter {
  _RuledPainter(this.scroll, this.top) : super(repaint: scroll);

  final ScrollController scroll;

  /// Where page content starts, under the status bar; the lines count from here.
  final double top;

  @override
  void paint(Canvas canvas, Size size) {
    final offset = scroll.hasClients ? scroll.offset : 0.0;
    final line = Paint()..color = Palette.rule;
    for (
      var y = (top - _baselineLift - offset) % lineHeight;
      y < size.height;
      y += lineHeight
    ) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    }
    canvas.drawLine(
      const Offset(marginWidth, 0),
      Offset(marginWidth, size.height),
      Paint()
        ..color = Palette.red.withValues(alpha: 0.75)
        ..strokeWidth = 1.5,
    );
  }

  @override
  bool shouldRepaint(_RuledPainter oldDelegate) => oldDelegate.scroll != scroll;
}

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: Palette.ink,
        foregroundColor: Palette.sheet,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      onPressed: onPressed,
      child: Text(
        label,
        style: readingStyle(
          size: 16,
          weight: FontWeight.w600,
          color: Palette.sheet,
        ),
      ),
    );
  }
}

/// A notebook label: printed field names with the values written by hand.
class BookLabel extends StatelessWidget {
  const BookLabel({super.key, required this.fields, this.onTap});

  final List<(String, String)> fields;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Palette.sheet,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Palette.ink, width: 2),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            decoration: BoxDecoration(
              border: Border.all(color: Palette.ink),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Column(
              children: [
                for (final (name, value) in fields)
                  Container(
                    padding: const EdgeInsets.only(top: 5),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Palette.rule)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          name,
                          style: readingStyle(size: 11.5, color: Palette.muted),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            value,
                            style: handStyle(size: 20, color: Palette.ink),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
