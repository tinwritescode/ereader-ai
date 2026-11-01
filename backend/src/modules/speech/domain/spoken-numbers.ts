const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['tỷ', 'triệu', 'nghìn', ''];
const SCALE_DIGITS = 3;
const MAX_DIGITS = SCALES.length * SCALE_DIGITS;
const UNITS: Readonly<Record<string, string>> = {
  '%': 'phần trăm',
  'km/h': 'ki lô mét trên giờ',
  km: 'ki lô mét',
  kg: 'ki lô gam',
  cm: 'xăng ti mét',
};
const NUMBER = /(\d+(?:\.\d{3})*)(?:,(\d+))?(?:\s*(%|km\/h|km|kg|cm)(?![\p{L}\d]))?/gu;

const digitByDigit = (digits: string) => [...digits].map((digit) => DIGITS[Number(digit)]).join(' ');

/** Up to three digits; [padded] when a bigger part came first, so 5 in 2005 is "không trăm lẻ năm". */
function group(value: number, padded: boolean): string[] {
  const [hundreds, tens, ones] = [Math.floor(value / 100), Math.floor(value / 10) % 10, value % 10];
  const hasHundreds = hundreds > 0 || padded;
  const words = hasHundreds ? [DIGITS[hundreds], 'trăm'] : [];
  if (tens === 0 && ones > 0 && hasHundreds) words.push('lẻ');
  if (tens === 1) words.push('mười');
  if (tens > 1) words.push(DIGITS[tens], 'mươi');
  if (ones === 1 && tens > 1) words.push('mốt');
  else if (ones === 5 && tens > 0) words.push('lăm');
  else if (ones > 0) words.push(DIGITS[ones]);
  return words;
}

function whole(digits: string): string {
  if (digits.length > MAX_DIGITS || (digits.length > 1 && digits.startsWith('0'))) return digitByDigit(digits);
  if (Number(digits) === 0) return DIGITS[0];
  const padded = digits.padStart(MAX_DIGITS, '0');
  const words: string[] = [];
  SCALES.forEach((scale, index) => {
    const value = Number(padded.slice(index * SCALE_DIGITS, (index + 1) * SCALE_DIGITS));
    if (value > 0) words.push(...group(value, words.length > 0), scale);
  });
  return words.filter(Boolean).join(' ');
}

/** For a voice that reads literally: digits, percents and common units become the words they stand for. */
export function spelledOut(text: string): string {
  return text.replace(NUMBER, (_, integer: string, decimals?: string, unit?: string) =>
    [
      whole(integer.replaceAll('.', '')),
      ...(decimals === undefined ? [] : ['phẩy', digitByDigit(decimals)]),
      ...(unit === undefined ? [] : [UNITS[unit]]),
    ].join(' '),
  );
}
