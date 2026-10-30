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
  late LengthOption _selected = widget.options.firstWhere(
    (option) => option.length == widget.preselected,
    orElse: () => widget.options.first,
  );

  @override
  Widget build(BuildContext context) {
    final isOriginal = _selected.length == ReadingLength.original;
    final duration = durationLabel(_selected.minutes);
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
              options: widget.options,
              selected: _selected,
              onChanged: (option) => setState(() => _selected = option),
            ),
            const SizedBox(height: 18),
            Text(
              isOriginal
                  ? 'Bản gốc $duration'
                  : '${lengthName(_selected.length)} còn $duration',
              style: readingStyle(
                size: 16,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _hint(_selected.length),
              style: readingStyle(size: 14, color: Palette.muted),
            ),
            const SizedBox(height: 18),
            PrimaryButton(
              label: isOriginal ? 'Đọc bản gốc' : 'Đọc bản $duration',
              onPressed: () =>
                  Navigator.of(context).pop(LengthChoice(_selected)),
            ),
            TextButton(
              onPressed: () => Navigator.of(
                context,
              ).pop(LengthChoice(_selected, listen: true)),
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
