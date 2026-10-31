import 'package:ereader_mobile/features/listen/domain/spoken_numbers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reads numbers the Vietnamese way', () {
    expect(spellNumbers('35 năm'), 'ba mươi lăm năm');
    expect(spellNumbers('21'), 'hai mươi mốt');
    expect(spellNumbers('10'), 'mười');
    expect(spellNumbers('15'), 'mười lăm');
    expect(spellNumbers('105'), 'một trăm linh năm');
    expect(spellNumbers('1929'), 'một nghìn chín trăm hai mươi chín');
    expect(spellNumbers('2005'), 'hai nghìn không trăm linh năm');
    expect(spellNumbers('0'), 'không');
  });

  test('understands thousands separators, percent and dollars', () {
    expect(spellNumbers('1.000.000'), 'một triệu');
    expect(spellNumbers('5%'), 'năm phần trăm');
    expect(spellNumbers(r'$50'), 'năm mươi đô la');
  });

  test('leaves text without numbers alone', () {
    expect(spellNumbers('Phố Wall'), 'Phố Wall');
  });

  test('reads a decimal comma as phẩy', () {
    expect(spellNumbers('tăng 3,5%'), 'tăng ba phẩy năm phần trăm');
  });

  test('reads a date and a time the long way', () {
    expect(
      spellNumbers('vào 12/4/1975 lúc 9:05'),
      'vào ngày mười hai tháng tư năm một nghìn chín trăm bảy mươi lăm '
      'lúc chín giờ năm phút',
    );
  });
}
