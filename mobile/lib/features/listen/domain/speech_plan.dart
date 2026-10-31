import '../../books/domain/entities/chapter.dart';

/// Longest text for one model call. The model takes 510 phonemes, and text
/// yields at most about 1.5 phonemes per character.
const maxSentenceCharacters = 300;

/// A piece of the chapter read in one model call, and where it sits in its block.
class SpokenSentence {
  const SpokenSentence({
    required this.block,
    required this.start,
    required this.end,
    required this.text,
  });

  final int block;
  final int start;
  final int end;
  final String text;
}

// About what a Vietnamese voice reads in a second at normal speed.
const _spokenCharactersPerSecond = 15;

// A sentence ends at punctuation followed by a space or the end of the block,
// so "1.000" stays whole.
final _sentence = RegExp(r'.+?(?:[.!?…]+["”’)]*(?=\s|$)|$)', dotAll: true);

List<SpokenSentence> planSpeech(List<TextBlock> blocks) => [
  for (final (index, block) in blocks.indexed)
    for (final match in _sentence.allMatches(block.text))
      ..._withinLimit(index, block.text, match.start, match.end),
];

/// About how long [sentences] take to read, in whole minutes.
int spokenMinutes(List<String> sentences) {
  final characters = sentences.fold(0, (sum, text) => sum + text.length);
  return (characters / _spokenCharactersPerSecond / 60).ceil();
}

/// How many sentences after [from] it takes to fill [seconds] of speech.
int sentencesWithin(List<SpokenSentence> plan, int from, double seconds) {
  var characters = seconds * _spokenCharactersPerSecond;
  var count = 0;
  for (var index = from + 1; index < plan.length && characters > 0; index++) {
    characters -= plan[index].text.length;
    count++;
  }
  return count;
}

/// Position in [plan] of the sentence holding character [offset] of [block].
int sentenceAt(List<SpokenSentence> plan, int block, int offset) {
  final inBlock = plan.indexed.where((entry) => entry.$2.block == block);
  if (inBlock.isEmpty) return 0;
  return inBlock
      .lastWhere(
        (entry) => entry.$2.start <= offset,
        orElse: () => inBlock.first,
      )
      .$1;
}

Iterable<SpokenSentence> _withinLimit(
  int block,
  String text,
  int from,
  int to,
) sync* {
  var start = from;
  while (start < to) {
    while (start < to && text[start].trim().isEmpty) {
      start++;
    }
    if (start == to) return;
    final end = to - start <= maxSentenceCharacters
        ? to
        : _cutBefore(text, start, start + maxSentenceCharacters);
    final piece = text.substring(start, end).trimRight();
    if (piece.isNotEmpty) {
      yield SpokenSentence(
        block: block,
        start: start,
        end: start + piece.length,
        text: piece,
      );
    }
    start = end;
  }
}

/// Last comma before [limit], else the last space, else [limit] itself.
int _cutBefore(String text, int start, int limit) {
  final comma = text.lastIndexOf(',', limit - 1);
  if (comma > start + maxSentenceCharacters ~/ 2) return comma + 1;
  final space = text.lastIndexOf(' ', limit - 1);
  return space > start ? space : limit;
}
