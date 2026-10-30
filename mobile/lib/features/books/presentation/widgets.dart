import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../domain/entities/book.dart';

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

/// Height of a book cover over its width.
const coverRatio = 1.48;
// Too narrow for a label to be read, so the notebook shows only its spine.
const _labelledCoverWidth = 60.0;

/// A book standing on the page: the cover from its EPUB, or else a school
/// notebook with its label filled in.
class BookCover extends StatelessWidget {
  const BookCover({super.key, required this.book, required this.width});

  final Book book;
  final double width;

  @override
  Widget build(BuildContext context) {
    final url = book.coverUrl;
    final notebook = _NotebookCover(book: book, width: width);
    return Container(
      width: width,
      height: width * coverRatio,
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.horizontal(
          left: Radius.circular(2),
          right: Radius.circular(5),
        ),
        boxShadow: [BoxShadow(color: Color(0x292A1F6E), offset: Offset(3, 4))],
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.horizontal(
          left: Radius.circular(2),
          right: Radius.circular(5),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (url == null)
              notebook
            else
              Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => notebook,
              ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  stops: [0, 0.03, 0.04, 0.09],
                  colors: [
                    Color(0x38000000),
                    Color(0x38000000),
                    Color(0x33FFFFFF),
                    Color(0x00FFFFFF),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotebookCover extends StatelessWidget {
  const _NotebookCover({required this.book, required this.width});

  final Book book;
  final double width;

  @override
  Widget build(BuildContext context) {
    final author = book.author;
    return ColoredBox(
      color: Palette.ink,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: width * 0.08,
            child: const ColoredBox(color: Palette.red),
          ),
          if (width >= _labelledCoverWidth)
            Positioned(
              left: width * 0.14,
              right: width * 0.07,
              top: width * 0.2,
              child: Container(
                padding: EdgeInsets.all(width * 0.06),
                decoration: BoxDecoration(
                  color: Palette.sheet,
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      book.title,
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: handStyle(
                        size: width * 0.115,
                        height: 1.15,
                        color: Palette.ink,
                      ),
                    ),
                    if (author != null) ...[
                      const Divider(height: 6, color: Palette.rule),
                      Text(
                        author,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: handStyle(
                          size: width * 0.095,
                          color: Palette.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
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
