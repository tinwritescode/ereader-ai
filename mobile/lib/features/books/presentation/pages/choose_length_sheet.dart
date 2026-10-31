import 'package:flutter/material.dart';

import '../../../../app/theme.dart';
import '../../domain/entities/chapter.dart';
import '../../domain/entities/reading_length.dart';
import '../formatting.dart';
import '../length_names.dart';
import '../time_ruler.dart';
import '../widgets.dart';

String _hint(ReadingLength length) => switch (length) {
  ReadingLength.original => 'Đọc nguyên văn, không qua AI.',
  ReadingLength.vietnamese => 'Cả chương, AI dịch sang tiếng Việt.',
  ReadingLength.shortened => 'Giữ mọi luận điểm, bỏ ví dụ lặp lại.',
  ReadingLength.keyPoints => 'Chỉ những điều tác giả muốn bạn nhớ.',
};

/// What the reader picked on the sheet, and whether to listen rather than read.
class LengthChoice {
  const LengthChoice(this.option, {this.listen = false});

  final LengthOption option;
  final bool listen;
}

class ChooseLengthSheet extends StatefulWidget {
  const ChooseLengthSheet({
    super.key,
    required this.chapter,
    required this.options,
    required this.preselected,
  });

  final ChapterSummary chapter;
  final List<LengthOption> options;
  final ReadingLength preselected;

  @override
  State<ChooseLengthSheet> createState() => _ChooseLengthSheetState();
}

class _ChooseLengthSheetState extends State<ChooseLengthSheet> {
  // The translation is as long as the original, so it is a switch, not a stop on the ruler.
  late final _ruler = widget.options
      .where((option) => option.length != ReadingLength.vietnamese)
      .toList();
  late final _translation = widget.options
      .where((option) => option.length == ReadingLength.vietnamese)
      .firstOrNull;
  late LengthOption _selected = _ruler.firstWhere(
    (option) =>
        option.length == widget.preselected ||
        (widget.preselected == ReadingLength.vietnamese &&
            option.length == ReadingLength.original),
    orElse: () => _ruler.first,
  );
  late bool _vietnamese = widget.preselected == ReadingLength.vietnamese;

  @override
  Widget build(BuildContext context) {
    final translation = _translation;
    final canTranslate =
        translation != null && _selected.length == ReadingLength.original;
    final chosen = canTranslate && _vietnamese ? translation : _selected;
    final isOriginal = chosen.length == ReadingLength.original;
    final isVietnamese = chosen.length == ReadingLength.vietnamese;
    final duration = durationLabel(chosen.minutes);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${widget.chapter.label} dài ${durationLabel(widget.chapter.minutes)}',
              style: readingStyle(
                size: 21,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Kéo thước tới thời gian bạn có.',
              style: readingStyle(size: 14, color: Palette.muted),
            ),
            const SizedBox(height: 28),
            TimeRuler(
              options: _ruler,
              selected: _selected,
              onChanged: (option) => setState(() => _selected = option),
            ),
            if (canTranslate)
              InkWell(
                onTap: () => setState(() => _vietnamese = !_vietnamese),
                child: Row(
                  children: [
                    Checkbox(
                      value: _vietnamese,
                      activeColor: Palette.ink,
                      onChanged: (value) =>
                          setState(() => _vietnamese = value ?? false),
                    ),
                    Text('Tiếng Việt', style: readingStyle(size: 15)),
                  ],
                ),
              ),
            const SizedBox(height: 18),
            Text(
              isOriginal || isVietnamese
                  ? '${lengthName(chosen.length)} $duration'
                  : '${lengthName(chosen.length)} còn $duration',
              style: readingStyle(
                size: 16,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _hint(chosen.length),
              style: readingStyle(size: 14, color: Palette.muted),
            ),
            const SizedBox(height: 18),
            PrimaryButton(
              label: isOriginal
                  ? 'Đọc bản gốc'
                  : isVietnamese
                  ? 'Đọc bản tiếng Việt'
                  : 'Đọc bản $duration',
              onPressed: () => Navigator.of(context).pop(LengthChoice(chosen)),
            ),
            TextButton(
              onPressed: () =>
                  Navigator.of(context).pop(LengthChoice(chosen, listen: true)),
              child: Text(
                'Nghe bản này',
                style: readingStyle(
                  size: 15,
                  weight: FontWeight.w600,
                  color: Palette.ink,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
