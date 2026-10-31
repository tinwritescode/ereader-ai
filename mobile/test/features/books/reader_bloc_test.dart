import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:ereader_mobile/features/books/presentation/bloc/reader_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_books_repository.dart';

void main() {
  test(
    'opens the shortened version, switches to the original, and reuses what it already loaded',
    () async {
      final repository = FakeBooksRepository();
      final options = lengthOptionsFor(chapterOne.minutes);
      final shortened = options[1];
      final bloc = ReaderBloc(
        repository: repository,
        chapter: chapterOne,
        option: shortened,
      );
      addTearDown(bloc.close);

      bloc.add(ReaderLengthChosen(shortened));
      await Future<void>.delayed(Duration.zero);
      expect(_text(bloc.state), 'Bản 4 phút của book-1-c0.');

      bloc.add(ReaderLengthChosen(options.first));
      await Future<void>.delayed(Duration.zero);
      expect(_text(bloc.state), startsWith('Tôi thực sự tin rằng'));

      bloc.add(ReaderLengthChosen(shortened));
      await Future<void>.delayed(Duration.zero);
      expect(_text(bloc.state), 'Bản 4 phút của book-1-c0.');
      expect(repository.shortenedRequests, [
        (chapterId: 'book-1-c0', minutes: 4),
      ]);
    },
  );

  test(
    'opens the translation once it is ready, and shows the original until then',
    () async {
      final repository = FakeBooksRepository();
      const vietnamese = LengthOption(ReadingLength.vietnamese, 8);
      final bloc = ReaderBloc(
        repository: repository,
        chapter: chapterOne,
        option: vietnamese,
      );
      addTearDown(bloc.close);

      bloc.add(const ReaderLengthChosen(vietnamese));
      await Future<void>.delayed(Duration.zero);
      expect(
        bloc.state.text,
        isA<ReaderTextUntranslated>().having(
          (text) => text.original.blocks.first.text,
          'original',
          startsWith('Tôi thực sự tin rằng'),
        ),
      );

      repository.translations[chapterOne.chapterId] = const ChapterText([
        TextBlock(TextBlockKind.paragraph, 'Bản dịch chương một.'),
      ]);
      bloc.add(const ReaderLengthChosen(vietnamese));
      await Future<void>.delayed(Duration.zero);
      expect(_text(bloc.state), 'Bản dịch chương một.');
    },
  );
}

String _text(ReaderState state) => switch (state.text) {
  ReaderTextLoaded(:final text) => text.blocks.first.text,
  final other => fail('expected loaded text, got $other'),
};
