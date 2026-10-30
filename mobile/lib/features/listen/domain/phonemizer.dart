import 'dart:convert';
import 'dart:io';

const _fixups = {
  '–': '—',
  '/': ' ',
  '&': ' ',
  "'": '',
  '’': '',
  '‘': '',
  '-': '',
  '*': '',
};
const _longestWord = 12;

final _token = RegExp(
  r"[A-Za-zÀ-ỹĐđ]+(?:[-'][A-Za-zÀ-ỹĐđ]+)*|\s+|.",
  unicode: true,
);
final _word = RegExp(r"^[A-Za-zÀ-ỹĐđ]+(?:[-'][A-Za-zÀ-ỹĐđ]+)*$", unicode: true);

/// Vietnamese text to the phonemes the voice model was trained on.
///
/// vig2p, the model's frontend, converts one word at a time, so a table of its output gives
/// the same result on the phone. `tool/build_speech_assets.py` builds the table.
class Phonemizer {
  Phonemizer(this._table);

  factory Phonemizer.fromGzippedTable(List<int> gzipped) {
    final table = <String, String>{};
    for (final line in LineSplitter.split(utf8.decode(gzip.decode(gzipped)))) {
      final tab = line.indexOf('\t');
      table[line.substring(0, tab)] = line.substring(tab + 1);
    }
    return Phonemizer(table);
  }

  final Map<String, String> _table;

  String phonemize(String text) {
    final out = StringBuffer();
    for (final match in _token.allMatches(text)) {
      final token = match[0]!;
      if (token.trim().isEmpty) {
        out.write(' ');
      } else if (_word.hasMatch(token)) {
        out.write(_wordPhonemes(token.toLowerCase()));
      } else {
        out.write(_fixups[token] ?? token);
      }
    }
    return out.toString().trim();
  }

  String _wordPhonemes(String word) =>
      _table[word] ?? word.split('-').map(_syllablesInside).join(' ');

  /// A word outside the table: reads the longest known pieces, skipping letters that fit none.
  String _syllablesInside(String word) {
    final pieces = <String>[];
    var start = 0;
    while (start < word.length) {
      var end = (start + _longestWord).clamp(0, word.length);
      for (; end > start + 1; end--) {
        if (_table.containsKey(word.substring(start, end))) break;
      }
      final known = _table[word.substring(start, end)];
      if (known != null) pieces.add(known);
      start = end;
    }
    return pieces.join(' ');
  }
}
