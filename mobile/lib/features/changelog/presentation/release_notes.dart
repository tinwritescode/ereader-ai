import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../domain/release.dart';

const _noteSize = 15.0;
const _noteHeight = 1.5;

/// The lower half of each line under the marker, as the pen would draw it.
Paint _markerPaint() => Paint()
  ..shader = const LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      Colors.transparent,
      Colors.transparent,
      Palette.marker,
      Palette.marker,
    ],
    stops: [0, .52, .52, 1],
    tileMode: TileMode.repeated,
  ).createShader(const Rect.fromLTWH(0, 0, 1, _noteSize * _noteHeight));

/// One note, a dot before it: ink for something new, grey for a fix.
class NoteLine extends StatelessWidget {
  const NoteLine(this.note, {super.key, required this.isNew});

  final Note note;
  final bool isNew;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.only(top: 10, right: 9),
          decoration: BoxDecoration(
            color: isNew ? Palette.ink : Palette.muted,
            shape: BoxShape.circle,
          ),
        ),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                for (final segment in note)
                  TextSpan(
                    text: segment.text,
                    style: segment.marked
                        ? TextStyle(background: _markerPaint())
                        : null,
                  ),
              ],
            ),
            style: readingStyle(size: _noteSize, height: _noteHeight),
          ),
        ),
      ],
    ),
  );
}

/// A note as plain words, for where the marker would be too much.
String plainNote(Note note) => note.map((segment) => segment.text).join();

String dateLabel(DateTime date) =>
    '${date.day} tháng ${date.month}, ${date.year}';
