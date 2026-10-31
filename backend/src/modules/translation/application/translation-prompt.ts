import { z } from 'zod';

export const TRANSLATION_PROMPT_VERSION = 'translate-v1';

export const TranslationOutputSchema = z.object({
  blocks: z.array(z.object({ id: z.string(), text: z.string().trim().min(1) })).min(1),
});

export function translationInstructions({ part, partCount }: { part: number; partCount: number }): string {
  const scope = partCount === 1
    ? 'The input is one whole chapter of a book.'
    : `The input is part ${part} of ${partCount} of one chapter of a book. The parts are joined in order.`;
  return [
    'You translate books into Vietnamese for readers who read them in full.',
    scope,
    'The input JSON has "blocks": headings and paragraphs in reading order, each with an "id".',
    'Translate every block into natural, literary Vietnamese. Keep the meaning, tone, names, numbers and the order of ideas.',
    'Translate each block on its own: never merge, split, drop or reorder blocks, and add no notes or commentary.',
    'Return JSON only: {"blocks": [{"id": "...", "text": "..."}]}, with the same ids in the same order, plain text without markdown.',
  ].join('\n');
}
