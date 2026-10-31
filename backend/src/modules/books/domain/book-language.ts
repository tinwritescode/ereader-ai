// Letters only Vietnamese spells with; French and German accents are not among them.
const VIETNAMESE_LETTER = /[ăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/u;
const SAMPLE_WORDS = 5_000;
// Roughly half of Vietnamese words hold one; other languages using the Latin alphabet stay near none.
const VIETNAMESE_SHARE = 0.2;

function isVietnamese(text: string): boolean {
  const words = text.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean).slice(0, SAMPLE_WORDS);
  return words.filter((word) => VIETNAMESE_LETTER.test(word)).length >= words.length * VIETNAMESE_SHARE && words.length > 0;
}

/** What the words say beats what the file says: tools such as Calibre stamp "en" on anything. */
export function bookLanguage({ declared, text }: { declared: string | null; text: string }): string {
  if (isVietnamese(text)) return 'vi';
  const code = declared?.toLowerCase();
  return !code || code.startsWith('vi') || code === 'und' ? 'und' : code;
}
