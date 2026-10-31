const _digits = [
  'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', //
];
const _groups = ['', ' nghìn', ' triệu', ' tỷ'];

final _date = RegExp(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b');
final _time = RegExp(r'\b(\d{1,2}):(\d{2})\b');
final _decimal = RegExp(r'\b(\d+),(\d{1,2})\b(?![.,]\d)(%)?');
final _gluedDigit = RegExp(r'(\p{L})(\d)', unicode: true);
final _number = RegExp(r'(\$)?(\d{1,3}(?:[.,]\d{3})+|\d+)(%)?');

/// The voice model cannot read digits, so numbers become words before phonemes.
String spellNumbers(String text) => text
    .replaceAllMapped(_gluedDigit, (match) => '${match[1]} ${match[2]}')
    .replaceAllMapped(_date, (match) {
      final month = int.parse(match[2]!) == 4 ? 'tư' : _spell(match[2]!);
      return 'ngày ${_spell(match[1]!)} tháng $month năm ${_spell(match[3]!)}';
    })
    .replaceAllMapped(_time, (match) {
      return '${_spell(match[1]!)} giờ ${_spell(match[2]!)} phút';
    })
    .replaceAllMapped(_decimal, (match) {
      final decimals = match[2]!.split('').map(_spell).join(' ');
      return '${match[1]} phẩy $decimals${match[3] != null ? ' phần trăm' : ''}';
    })
    .replaceAllMapped(_number, (match) {
      final digits = match[2]!.replaceAll(RegExp('[.,]'), '');
      final prefix = match[1] != null ? ' đô la' : '';
      final suffix = match[3] != null ? ' phần trăm' : '';
      return '${_spell(digits)}$prefix$suffix';
    });

String _spell(String digits) {
  final value = BigInt.parse(digits);
  if (value == BigInt.zero) return _digits[0];
  // Too long to be a quantity (an id, a phone number): read digit by digit.
  if (digits.length > 12) {
    return digits.split('').map((d) => _digits[int.parse(d)]).join(' ');
  }
  final groups = <int>[];
  for (var rest = value.toInt(); rest > 0; rest ~/= 1000) {
    groups.add(rest % 1000);
  }
  final words = <String>[];
  for (var i = groups.length - 1; i >= 0; i--) {
    if (groups[i] == 0) continue;
    final inner = i < groups.length - 1;
    words.add('${_spellGroup(groups[i], full: inner)}${_groups[i]}');
  }
  return words.join(' ');
}

/// One group of three digits. [full] says the hundreds, as in "hai nghìn không trăm linh năm".
String _spellGroup(int group, {required bool full}) {
  final hundreds = group ~/ 100;
  final tens = group ~/ 10 % 10;
  final ones = group % 10;
  final parts = <String>[if (hundreds > 0 || full) '${_digits[hundreds]} trăm'];
  if (tens == 0) {
    if (ones > 0) {
      parts.add(parts.isEmpty ? _digits[ones] : 'linh ${_digits[ones]}');
    }
  } else if (tens == 1) {
    parts.add('mười');
    if (ones > 0) parts.add(ones == 5 ? 'lăm' : _digits[ones]);
  } else {
    parts.add('${_digits[tens]} mươi');
    if (ones > 0) {
      parts.add(switch (ones) {
        1 => 'mốt',
        5 => 'lăm',
        _ => _digits[ones],
      });
    }
  }
  return parts.join(' ');
}
