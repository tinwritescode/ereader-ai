import 'dart:convert';
import 'dart:io';

import 'spoken_numbers.dart';

const _longestWord = 12;
// Shorter sentences always end in a plain full stop, as sea_g2p's punc_norm does.
const _shortSentenceWords = 5;
const _letterPrefix = '@';

final _token = RegExp(
  r"[A-Za-zÀ-ỹĐđ]+(?:[-'][A-Za-zÀ-ỹĐđ]+)*|\s+|.",
  unicode: true,
);
final _word = RegExp(r"^[A-Za-zÀ-ỹĐđ]+(?:[-'][A-Za-zÀ-ỹĐđ]+)*$", unicode: true);
final _acronym = RegExp(r'^[A-Z]{2,}$');
final _dropped = RegExp('["“”‘’«»]');
final _pause = RegExp(r'[;:()\[\]–—…]|\s-+\s');
final _marks = RegExp(r'[\s,.!?]*[,.!?][\s,.!?]*');
final _stop = RegExp('[.!?]');

/// Vietnamese text to the phonemes the voice model was trained on.
///
/// After its normalizer, sea_g2p, the model's frontend, converts one word at a time, so a table
/// of its output gives the same result on the phone. `tool/build_speech_assets.py` builds it.
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
    for (final match in _token.allMatches(_normalized(text))) {
      final token = match[0]!;
      if (token.trim().isEmpty) {
        out.write(' ');
      } else if (_word.hasMatch(token)) {
        out.write(_wordPhonemes(token));
      } else if (_stop.hasMatch(token) || token == ',') {
        out.write(token);
      }
    }
    return out.toString().trim();
  }

  /// What sea_g2p's normalizer does to punctuation: quotes go, pauses become
  /// commas, a run of marks becomes one, and the text ends on a mark.
  String _normalized(String text) {
    final spelled = spellNumbers(text).replaceAll(_dropped, '');
    final paused = spelled.replaceAll('…', '. ').replaceAll(_pause, ', ');
    final marked = paused
        .replaceAllMapped(_marks, (match) {
          final stop = _stop.firstMatch(match[0]!);
          return '${stop?[0] ?? ','} ';
        })
        .replaceFirst(RegExp(r'^[\s,.!?]+'), '')
        .trim();
    if (marked.isEmpty) return marked;
    final words = marked.split(RegExp(r'\s+')).length;
    final open = marked.replaceFirst(RegExp(r'[,.!?]$'), '');
    if (words < _shortSentenceWords) return '$open.';
    return open == marked ? '$marked.' : marked;
  }

  String _wordPhonemes(String word) {
    final lower = word.toLowerCase();
    if (_table[word] ?? _table[lower] case final known?) return known;
    if (_acronym.hasMatch(word)) {
      return lower.split('').map((c) => _table['$_letterPrefix$c']).join(' ');
    }
    return word
        .split('-')
        .map((part) {
          final lowerPart = part.toLowerCase();
          return _table[lowerPart] ?? _syllablesInside(lowerPart);
        })
        .join(' ');
  }

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
