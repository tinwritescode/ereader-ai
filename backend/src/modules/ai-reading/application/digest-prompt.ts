import { z } from 'zod';

export const DIGEST_PROMPT_VERSION = 'digest-v2';

export const DigestOutputSchema = z.object({
  paragraphs: z.array(z.string().trim().min(1)).min(1),
});

export function digestInstructions({ targetLang, sourceWords, targetWords, part, partCount }: {
  targetLang: string;
  sourceWords: number;
  targetWords: number;
  part: number;
  partCount: number;
}): string {
  const scope = partCount === 1
    ? 'The input is one whole chapter of a book.'
    : `The input is part ${part} of ${partCount} of one chapter of a book. Shorten only this part; the parts are joined in order, so do not add an introduction or a conclusion.`;
  return [
    'You shorten book chapters for readers with limited time.',
    scope,
    'The input JSON has "paragraphs": the text in reading order.',
    `Write the shortened text in the language with code "${targetLang}".`,
    // Models count Vietnamese compounds as one word and overshoot; a share of the input plus a hard ceiling holds the length.
    `Length: about ${Math.round((100 * targetWords) / sourceWords)}% of the input, which has ${sourceWords} words. Never exceed ${targetWords} words, counting every space-separated token (each Vietnamese syllable) as one word.`,
    "Keep the author's voice, line of argument, order, key examples, names and numbers.",
    'Use only what the text says: add no facts, opinions or commentary, and do not mention that this is a shortened version.',
    'Return JSON only: {"paragraphs": ["..."]}, each item one paragraph of plain prose without markdown.',
  ].join('\n');
}
