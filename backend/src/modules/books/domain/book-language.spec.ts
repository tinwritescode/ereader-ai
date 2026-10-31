import { bookLanguage } from './book-language';

const VIETNAMESE = 'Mình đáng bị bỏ lại đơn độc thế này lắm. Tại sao mình không thể đem lại hạnh phúc cho ai hết, dù chỉ một chút.';
const ENGLISH = 'The quick brown fox jumps over the lazy dog, and nobody in the village ever spoke of it again.';
const FRENCH = 'Après être allé à la gare, il a vu que le train était déjà parti et il a pleuré à côté de sa sœur.';

describe('bookLanguage', () => {
  it('trusts the words over a file that says English', () => {
    expect(bookLanguage({ declared: 'en', text: VIETNAMESE })).toBe('vi');
  });

  it('reads Vietnamese however its accents are encoded', () => {
    expect(bookLanguage({ declared: null, text: VIETNAMESE.normalize('NFD') })).toBe('vi');
  });

  it.each([[ENGLISH, 'en'], [FRENCH, 'fr']])('keeps what a foreign book declares', (text, declared) => {
    expect(bookLanguage({ declared, text })).toBe(declared);
  });

  it.each(['vi', 'vi-VN', 'UND', 'und', null])('calls foreign words unknown when the file says %s', (declared) => {
    expect(bookLanguage({ declared, text: ENGLISH })).toBe('und');
  });
});
