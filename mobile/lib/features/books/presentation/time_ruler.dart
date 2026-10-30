import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../domain/entities/reading_length.dart';
import 'length_names.dart';

const _height = 84.0;
// Keeps the labels of the first and last stops inside the ruler.
const _inset = 30.0;
const _maxTicks = 16;

/// The option closest to [fraction] of the ruler, where 1 is the longest option.
LengthOption nearestOption(List<LengthOption> options, double fraction) {
  final longest = options
      .map((option) => option.minutes)
      .reduce((a, b) => a > b ? a : b);
  double distance(LengthOption option) =>
      (option.minutes / longest - fraction).abs();
  return options.reduce((a, b) => distance(a) <= distance(b) ? a : b);
}

/// Reading time on a school ruler: tap or drag to the length you have time for.
class TimeRuler extends StatelessWidget {
  const TimeRuler({
    super.key,
    required this.options,
    required this.selected,
    required this.onChanged,
  });

  final List<LengthOption> options;
  final LengthOption selected;
  final ValueChanged<LengthOption> onChanged;

  @override
  Widget build(BuildContext context) {
    final longest = options
        .map((option) => option.minutes)
        .reduce((a, b) => a > b ? a : b);
    return LayoutBuilder(
      builder: (context, constraints) {
        final span = constraints.maxWidth - 2 * _inset;
        double xOf(LengthOption option) =>
            _inset + span * option.minutes / longest;
        void pick(double x) {
          final option = nearestOption(options, (x - _inset) / span);
          if (option != selected) onChanged(option);
        }

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) => pick(details.localPosition.dx),
          onHorizontalDragUpdate: (details) => pick(details.localPosition.dx),
          child: SizedBox(
            height: _height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: CustomPaint(painter: _TicksPainter(longest)),
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
                    child: _Stop(option: option, selected: option == selected),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Stop extends StatelessWidget {
  const _Stop({required this.option, required this.selected});

  final LengthOption option;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${option.minutes}',
            style: handStyle(
              size: selected ? 25 : 21,
              height: 1,
              color: selected ? Palette.red : Palette.text,
            ),
          ),
          Text(lengthName(option.length), style: readingStyle(size: 11.5)),
        ],
      ),
    );
  }
}

class _TicksPainter extends CustomPainter {
  const _TicksPainter(this.minutes);

  final int minutes;

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
    final step = (minutes / _maxTicks).ceil();
    for (var minute = 0; minute <= minutes; minute += step) {
      final x = _inset + span * minute / minutes;
      canvas.drawLine(Offset(x, 0), Offset(x, 14), tick);
    }
  }

  @override
  bool shouldRepaint(_TicksPainter oldDelegate) =>
      oldDelegate.minutes != minutes;
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
