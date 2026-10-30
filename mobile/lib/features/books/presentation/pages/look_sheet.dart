import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/reading_look.dart';
import '../notch_ruler.dart';
import '../reading_look_cubit.dart';

const _quarters = [0.0, 0.25, 0.5, 0.75, 1.0];

String _spacingName(LineSpacing spacing) => switch (spacing) {
  LineSpacing.tight => 'Sít',
  LineSpacing.normal => 'Vừa',
  LineSpacing.loose => 'Thoáng',
};

/// Text size, line spacing, and paper, on the same ruler used to choose a length.
class LookSheet extends StatelessWidget {
  const LookSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final look = context.watch<ReadingLookCubit>().state;
    final cubit = context.read<ReadingLookCubit>();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _Heading('Cỡ chữ'),
            const SizedBox(height: 18),
            NotchRuler<TextSize>(
              options: TextSize.values,
              selected: look.size,
              onChanged: (size) => cubit.change(look.copyWith(size: size)),
              fractionOf: (size) => size.index / (TextSize.values.length - 1),
              ticks: _quarters,
              height: 64,
              stop: (size, selected) => Text(
                'A',
                textAlign: TextAlign.center,
                semanticsLabel: 'Chữ cỡ ${size.index + 1}',
                style: readingStyle(
                  size: 13 + size.index * 6.0,
                  height: 1.1,
                  color: selected ? Palette.red : Palette.text,
                ),
              ),
            ),
            const SizedBox(height: 22),
            const _Heading('Giãn dòng'),
            const SizedBox(height: 18),
            NotchRuler<LineSpacing>(
              options: LineSpacing.values,
              selected: look.spacing,
              onChanged: (spacing) =>
                  cubit.change(look.copyWith(spacing: spacing)),
              fractionOf: (spacing) =>
                  spacing.index / (LineSpacing.values.length - 1),
              ticks: _quarters,
              height: 64,
              stop: (spacing, selected) => Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  _spacingName(spacing),
                  textAlign: TextAlign.center,
                  style: readingStyle(
                    size: 13,
                    color: selected ? Palette.red : Palette.text,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 22),
            const _Heading('Trang giấy'),
            const SizedBox(height: 10),
            Row(
              children: [
                for (final (index, paper) in Paper.values.indexed) ...[
                  if (index > 0) const SizedBox(width: 10),
                  Expanded(
                    child: _PaperChoice(
                      paper: paper,
                      selected: paper == look.paper,
                      onTap: () => cubit.change(look.copyWith(paper: paper)),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: readingStyle(size: 16, weight: FontWeight.w600, color: Palette.ink),
  );
}

class _PaperChoice extends StatelessWidget {
  const _PaperChoice({
    required this.paper,
    required this.selected,
    required this.onTap,
  });

  final Paper paper;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final night = paper == Paper.night;
    final color = night ? Palette.nightText : Palette.text;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: night ? Palette.night : Palette.paper,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? Palette.red
                  : (night ? Palette.night : Palette.rule),
              width: selected ? 2 : 1.5,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                night ? 'Đêm' : 'Giấy',
                style: readingStyle(size: 14, color: color),
              ),
              Text(
                night ? 'Giảm chói khi tối' : 'Ban ngày',
                style: readingStyle(
                  size: 12,
                  color: color.withValues(alpha: 0.75),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
