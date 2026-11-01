import { spokenSeconds } from './cloud-voice';

// Keep in step with mobile/lib/features/listen/domain/speech_plan.dart: clips are found by their
// exact text, so a sentence cut differently here is voiced and charged again when the app asks.
// speech-plan.golden.json holds both to the same answers.
const MAX_SENTENCE_CHARACTERS = 300;
const SENTENCE = /.+?(?:[.!?…]+["”’)]*(?=\s|$)|$)/gs;
// What Dart's trim removes: JavaScript's whitespace and U+0085.
const SPACE = /^[\s\u0085]$/;
const TRAILING_SPACE = /[\s\u0085]+$/;

/** The sentences the app reads aloud from these blocks, in order. */
export function planSpeech(blocks: readonly { text: string }[]): string[] {
  return blocks.flatMap(({ text }) =>
    [...text.matchAll(SENTENCE)].flatMap((match) =>
      withinLimit(text, match.index, match.index + match[0].length, MAX_SENTENCE_CHARACTERS),
    ),
  );
}

export function spokenMinutes(sentences: readonly string[]): number {
  return Math.ceil(sentences.reduce((total, text) => total + spokenSeconds(text), 0) / 60);
}

/** [text] in pieces of at most [limit] characters, cut the way sentences are. */
export function piecesWithin(text: string, limit: number): string[] {
  return withinLimit(text, 0, text.length, limit);
}

function withinLimit(text: string, from: number, to: number, limit: number): string[] {
  const pieces: string[] = [];
  let start = from;
  while (start < to) {
    while (start < to && SPACE.test(text[start])) start += 1;
    if (start === to) break;
    const end = to - start <= limit ? to : cutBefore(text, start, limit);
    const piece = text.slice(start, end).replace(TRAILING_SPACE, '');
    if (piece.length > 0) pieces.push(piece);
    start = end;
  }
  return pieces;
}

/** Last comma within [limit] of [start], else the last space, else [limit] itself. */
function cutBefore(text: string, start: number, limit: number): number {
  const end = start + limit;
  const comma = text.lastIndexOf(',', end - 1);
  if (comma > start + Math.floor(limit / 2)) return comma + 1;
  const space = text.lastIndexOf(' ', end - 1);
  return space > start ? space : end;
}
