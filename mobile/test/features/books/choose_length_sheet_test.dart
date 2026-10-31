import 'package:ereader_mobile/app/theme.dart';
import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:ereader_mobile/features/books/presentation/pages/choose_length_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _chapter = ChapterSummary(
  chapterId: 'c1',
  label: 'Chương Một',
  subtitle: null,
  minutes: 20,
);

void main() {
  Future<LengthChoice? Function()> show(
    WidgetTester tester, {
    required ReadingLength preselected,
  }) async {
    LengthChoice? chosen;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async =>
                  chosen = await showModalBottomSheet<LengthChoice>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => ChooseLengthSheet(
                      chapter: _chapter,
                      options: lengthOptionsFor(20, vietnamese: true),
                      preselected: preselected,
                    ),
                  ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    return () => chosen;
  }

  testWidgets('offers the Vietnamese translation beside the original', (
    tester,
  ) async {
    final chosen = await show(tester, preselected: ReadingLength.original);
    expect(find.text('Bản gốc 20 phút'), findsOneWidget);

    await tester.tap(find.text('Tiếng Việt'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đọc bản tiếng Việt'));
    await tester.pumpAndSettle();

    expect(chosen()?.option, const LengthOption(ReadingLength.vietnamese, 20));
  });

  testWidgets('opens on the translation when it was chosen last', (
    tester,
  ) async {
    final chosen = await show(tester, preselected: ReadingLength.vietnamese);
    await tester.tap(find.text('Đọc bản tiếng Việt'));
    await tester.pumpAndSettle();
    expect(chosen()?.option.length, ReadingLength.vietnamese);
  });

  testWidgets('a shorter version is still read from the ruler', (tester) async {
    final chosen = await show(tester, preselected: ReadingLength.shortened);
    expect(find.text('Tiếng Việt'), findsNothing);
    await tester.tap(find.text('Đọc bản 10 phút'));
    await tester.pumpAndSettle();
    expect(chosen()?.option, const LengthOption(ReadingLength.shortened, 10));
  });
}
