import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../domain/entities/reading_length.dart';
import 'length_names.dart';
import 'notch_ruler.dart';

const _maxTicks = 16;

int _longest(List<LengthOption> options) =>
    options.map((option) => option.minutes).reduce((a, b) => a > b ? a : b);

/// The option closest to [fraction] of the ruler, where 1 is the longest option.
LengthOption nearestOption(List<LengthOption> options, double fraction) {
  final longest = _longest(options);
  return nearestStop(options, (option) => option.minutes / longest, fraction);
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
    final longest = _longest(options);
    final step = (longest / _maxTicks).ceil();
    return NotchRuler<LengthOption>(
      options: options,
      selected: selected,
      onChanged: onChanged,
      fractionOf: (option) => option.minutes / longest,
      ticks: [
        for (var minute = 0; minute <= longest; minute += step)
          minute / longest,
      ],
      stop: (option, selected) => Column(
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
