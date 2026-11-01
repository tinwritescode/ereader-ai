import { z } from 'zod';

export const TRANSLATION_PROMPT_VERSION = 'translate-v2';

export const TranslationOutputSchema = z.object({
  blocks: z.array(z.object({ id: z.string(), text: z.string().trim().min(1) })).min(1),
});

/** One book's decisions, made once, so every chapter calls the same people the same things. */
export const StyleSheetSchema = z.object({
  voice: z.string().min(1),
  narrator: z.string().min(1),
  characters: z.array(z.object({ name: z.string(), gender: z.string(), role: z.string() })),
  address: z.array(
    z.object({
      between: z.string(),
      a_calls_self: z.string(),
      a_calls_b: z.string(),
      b_calls_self: z.string(),
      b_calls_a: z.string(),
    }),
  ),
  terms: z.array(z.object({ source: z.string(), vietnamese: z.string() })),
});
export type StyleSheet = z.infer<typeof StyleSheetSchema>;

export function styleSheetInstructions(): string {
  return [
    'You are the lead Vietnamese translator of a book, writing the style sheet every chapter must follow.',
    'The input has the title, the author and passages from all through the book.',
    'Return JSON only: {"voice": "...", "narrator": "...", "characters": [{"name": "...", "gender": "...", "role": "..."}], "address": [{"between": "A and B", "a_calls_self": "...", "a_calls_b": "...", "b_calls_self": "...", "b_calls_a": "..."}], "terms": [{"source": "...", "vietnamese": "..."}]}',
    'voice: genre, period, register and how the Vietnamese should sound, in two sentences.',
    'narrator: the Vietnamese first-person word for the narrator or author (tôi, ta, ...), and how the book addresses its reader, if it does.',
    'characters: people who recur. Keep foreign names in their original spelling; a title beside a name is translated (Miss Baker is cô Baker, Mr Smith is ông Smith).',
    'address: for each pair who speak, the Vietnamese pronouns of address, chosen from age, rank, intimacy and the period.',
    'terms: recurring coined terms, titles, places and concepts, one Vietnamese rendering each. Only what recurs.',
    'Base everything on the passages; invent nothing about the plot. A book without characters has empty lists for them.',
  ].join('\n');
}

export function translationInstructions({
  part,
  partCount,
  sheet,
}: {
  part: number;
  partCount: number;
  sheet: StyleSheet;
}): string {
  return [
    'You are an acclaimed Vietnamese literary translator. You write Vietnamese a publisher would print, not English in Vietnamese words.',
    `The input JSON has "blocks", the headings and paragraphs to translate, each with an "id". They are part ${part} of ${partCount} of one chapter.`,
    'If it has "previous_translation", that is how the text just before reads: carry on from it, keeping its pronouns and its tone, and neither translate nor return it.',
    'Read everything first, then write each block as if it were first written in Vietnamese. Recast sentences freely: reorder them, split or join clauses within a block, turn nouns into verbs, as long as nothing is added or lost.',
    'Follow the style sheet exactly: its voice, its pronouns of address and its terms. A pair changes pronouns only when their relation changes in the story.',
    'Vietnamese has no neutral "you", "he" or "she": every pronoun must fit who speaks to whom. Leave a pronoun out wherever Vietnamese would. Do not repeat "anh ấy" or "cô ấy" where a name, a role or nothing reads better.',
    'Avoid the marks of machine translation: "một" before every noun, chains of "của", "bị" and "được" wherever English had a passive, "điều đó" and "việc" as empty nouns, "đã", "đang" and "sẽ" on every verb.',
    'Dialogue must sound spoken, in the speaker\'s own register. Render idioms and jokes by their effect, with a Vietnamese turn of phrase where one exists.',
    'Translate titles and ordinary words: Miss, Mr and Mrs become cô, ông and bà. Leave no English in the text except names, and give measures as a Vietnamese reader would say them.',
    'Keep the meaning, the names, the numbers and the order of ideas. Add no notes or commentary.',
    'Translate each block on its own: never merge, split, drop or reorder blocks.',
    'Return JSON only: {"blocks": [{"id": "...", "text": "..."}]}, with the same ids in the same order, plain text without markdown.',
    `Style sheet: ${JSON.stringify(sheet)}`,
  ].join('\n');
}

export function editingInstructions(sheet: StyleSheet): string {
  return [
    'You edit a Vietnamese translation of a book. The input has "blocks", each with the English "text" and its Vietnamese "draft".',
    'Improve the Vietnamese wherever it is awkward, stiff or sounds translated, and correct any meaning the draft got wrong. Leave what already reads well.',
    'Follow the style sheet. Keep every block whole, add no notes, and shorten nothing.',
    'Return JSON only: {"blocks": [{"id": "...", "text": "..."}]}, with the same ids in the same order, plain text without markdown.',
    `Style sheet: ${JSON.stringify(sheet)}`,
  ].join('\n');
}
