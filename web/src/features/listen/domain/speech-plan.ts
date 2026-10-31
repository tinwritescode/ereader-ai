// Keep in step with backend/src/modules/speech/domain/speech-plan.ts: clips are found by their
// exact text, so a sentence cut differently here is voiced and charged again.
// speech-plan.golden.json holds all three to the same answers.
const MAX_SENTENCE_CHARACTERS = 300
const SPOKEN_CHARS_PER_SECOND = 15
const SENTENCE = /.+?(?:[.!?…]+["”’)]*(?=\s|$)|$)/gs
// What Dart's trim removes: JavaScript's whitespace and U+0085.
const SPACE = /^[\s\u0085]$/
const TRAILING_SPACE = /[\s\u0085]+$/

/** A piece of the chapter read in one call, and where it sits in its block. */
export type SpokenSentence = { block: number; start: number; end: number; text: string }

/** The sentences read aloud from these blocks, in order. */
export function planSpeech(blocks: readonly { text: string }[]): SpokenSentence[] {
  return blocks.flatMap(({ text }, block) =>
    [...text.matchAll(SENTENCE)].flatMap((match) =>
      withinLimit({ block, text, from: match.index, to: match.index + match[0].length }),
    ),
  )
}

export function spokenMinutes(sentences: readonly string[]): number {
  return Math.ceil(sentences.reduce((total, text) => total + Math.ceil(text.length / SPOKEN_CHARS_PER_SECOND), 0) / 60)
}

/** How many sentences after `from` it takes to fill `seconds` of speech. */
export function sentencesWithin({
  plan,
  from,
  seconds,
}: {
  plan: readonly SpokenSentence[]
  from: number
  seconds: number
}): number {
  let characters = seconds * SPOKEN_CHARS_PER_SECOND
  let count = 0
  for (const sentence of plan.slice(from + 1)) {
    if (characters <= 0) break
    characters -= sentence.text.length
    count += 1
  }
  return count
}

/** Position in the plan of the sentence holding character `offset` of `block`. */
export function sentenceAt({
  plan,
  block,
  offset,
}: {
  plan: readonly SpokenSentence[]
  block: number
  offset: number
}): number {
  const first = plan.findIndex((sentence) => sentence.block === block)
  if (first < 0) return 0
  const last = plan.findLastIndex((sentence) => sentence.block === block && sentence.start <= offset)
  return last < 0 ? first : last
}

function withinLimit({
  block,
  text,
  from,
  to,
}: {
  block: number
  text: string
  from: number
  to: number
}): SpokenSentence[] {
  const pieces: SpokenSentence[] = []
  let start = from
  while (start < to) {
    while (start < to && SPACE.test(text.charAt(start))) start += 1
    if (start === to) break
    const end =
      to - start <= MAX_SENTENCE_CHARACTERS ? to : cutBefore({ text, start, limit: start + MAX_SENTENCE_CHARACTERS })
    const piece = text.slice(start, end).replace(TRAILING_SPACE, '')
    if (piece.length > 0) pieces.push({ block, start, end: start + piece.length, text: piece })
    start = end
  }
  return pieces
}

/** Last comma before `limit`, else the last space, else `limit` itself. */
function cutBefore({ text, start, limit }: { text: string; start: number; limit: number }): number {
  const comma = text.lastIndexOf(',', limit - 1)
  if (comma > start + Math.floor(MAX_SENTENCE_CHARACTERS / 2)) return comma + 1
  const space = text.lastIndexOf(' ', limit - 1)
  return space > start ? space : limit
}
