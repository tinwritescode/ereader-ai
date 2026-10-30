import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/presentation/formatting.dart';
import 'package:flutter_test/flutter_test.dart';

ChapterSummary chapter(String label, String? subtitle) => ChapterSummary(
  chapterId: 'c',
  label: label,
  subtitle: subtitle,
  minutes: 1,
);

void main() {
  test('a number over a title stays that way, in sentence case', () {
    expect(chapterHeading(chapter('Chương Một', 'NÓ ĐÒI HỎI KIẾN THỨC')), (
      number: 'Chương Một',
      title: 'Nó đòi hỏi kiến thức',
    ));
  });

  test('a long label under a short subtitle loses the repeated number', () {
    expect(
      chapterHeading(chapter('QUY LUẬT 1 ĐỨNG THẲNG HIÊN NGANG', 'Quy luật 1')),
      (number: 'Quy luật 1', title: 'Đứng thẳng hiên ngang'),
    );
  });

  test('a joint between number and title is dropped', () {
    expect(chapterHeading(chapter('Quy luật 2: Đối xử tốt', 'Quy luật 2')), (
      number: 'Quy luật 2',
      title: 'Đối xử tốt',
    ));
  });

  test('a chapter with one name has no number', () {
    expect(chapterHeading(chapter('Dẫn nhập', null)), (
      number: null,
      title: 'Dẫn nhập',
    ));
    expect(chapterHeading(chapter('Dẫn nhập', 'DẪN NHẬP')), (
      number: null,
      title: 'Dẫn nhập',
    ));
  });

  test('the short name is the number when there is one', () {
    expect(chapterName(chapter('QUY LUẬT 1 ĐỨNG', 'Quy luật 1')), 'Quy luật 1');
    expect(chapterName(chapter('Dẫn nhập', null)), 'Dẫn nhập');
  });
}
