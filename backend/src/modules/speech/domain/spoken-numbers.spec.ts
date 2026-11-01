import { spelledOut } from './spoken-numbers';

describe('spelledOut', () => {
  it.each([
    ['0', 'không'],
    ['5', 'năm'],
    ['10', 'mười'],
    ['15', 'mười lăm'],
    ['21', 'hai mươi mốt'],
    ['25', 'hai mươi lăm'],
    ['105', 'một trăm lẻ năm'],
    ['1995', 'một nghìn chín trăm chín mươi lăm'],
    ['2005', 'hai nghìn không trăm lẻ năm'],
    ['1.000.000', 'một triệu'],
    ['3000000000', 'ba tỷ'],
    ['1,5', 'một phẩy năm'],
    ['007', 'không không bảy'],
  ])('reads %s', (digits, words) => {
    expect(spelledOut(digits)).toBe(words);
  });

  it('spells out numbers, percents and units inside a sentence', () => {
    expect(spelledOut('Năm 1995, anh đi 5 km, tốn 20% tiền.')).toBe(
      'Năm một nghìn chín trăm chín mươi lăm, anh đi năm ki lô mét, tốn hai mươi phần trăm tiền.',
    );
  });

  it('leaves words alone', () => {
    expect(spelledOut('Cô ấy cười, không nói gì.')).toBe('Cô ấy cười, không nói gì.');
  });
});
