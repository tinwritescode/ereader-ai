import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../../app/theme.dart';

// Keeps the labels of the first and last stops inside the ruler.
const _inset = 30.0;

/// The option whose place on the ruler is closest to [fraction].
T nearestStop<T>(
  List<T> options,
  double Function(T option) fractionOf,
  double fraction,
) {
  double distance(T option) => (fractionOf(option) - fraction).abs();
  return options.reduce((a, b) => distance(a) <= distance(b) ? a : b);
}

/// A school ruler with labelled stops: tap or drag to pick one.
class NotchRuler<T> extends StatelessWidget {
  const NotchRuler({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
    required this.fractionOf,
    required this.ticks,
    required this.stop,
    this.height = 84,
  });

  final List<T> options;
  final T selected;
  final ValueChanged<T> onChanged;

  /// Where [options] sit, from 0 at the left end to 1 at the right.
  final double Function(T option) fractionOf;

  /// Marks along the top edge, in the same fractions.
  final List<double> ticks;
  final Widget Function(T option, bool selected) stop;
  final double height;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final span = constraints.maxWidth - 2 * _inset;
        double xOf(T option) => _inset + span * fractionOf(option);
        void pick(double x) {
          final option = nearestStop(options, fractionOf, (x - _inset) / span);
          if (option != selected) onChanged(option);
        }

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) => pick(details.localPosition.dx),
          onHorizontalDragUpdate: (details) => pick(details.localPosition.dx),
          child: SizedBox(
            height: height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: CustomPaint(painter: _TicksPainter(ticks)),
                ),
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 160),
                  curve: Curves.easeOut,
                  left: xOf(selected) - 8,
                  top: -12,
                  child: const CustomPaint(
                    size: Size(16, 12),
                    painter: _PinPainter(),
                  ),
                ),
                for (final option in options)
                  Positioned(
                    left: xOf(option) - 30,
                    top: 20,
                    width: 60,
                    child: Semantics(
                      button: true,
                      selected: option == selected,
                      child: stop(option, option == selected),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TicksPainter extends CustomPainter {
  const _TicksPainter(this.ticks);

  final List<double> ticks;

  @override
  void paint(Canvas canvas, Size size) {
    final body = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(6),
    );
    canvas.drawRRect(body, Paint()..color = Palette.ruler);
    canvas.drawRRect(
      body,
      Paint()
        ..color = Palette.rulerEdge
        ..style = PaintingStyle.stroke,
    );
    final tick = Paint()..color = Palette.text;
    final span = size.width - 2 * _inset;
    for (final fraction in ticks) {
      final x = _inset + span * fraction;
      canvas.drawLine(Offset(x, 0), Offset(x, 14), tick);
    }
  }

  @override
  bool shouldRepaint(_TicksPainter oldDelegate) =>
      !listEquals(oldDelegate.ticks, ticks);
}

class _PinPainter extends CustomPainter {
  const _PinPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = Palette.red);
  }

  @override
  bool shouldRepaint(_PinPainter oldDelegate) => false;
}
