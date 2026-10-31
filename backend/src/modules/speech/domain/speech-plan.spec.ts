import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { planSpeech, spokenMinutes } from './speech-plan';

const golden = z
  .object({
    blocks: z.array(z.string()),
    sentences: z.array(z.object({ block: z.number(), start: z.number(), end: z.number(), text: z.string() })),
  })
  .parse(JSON.parse(readFileSync(join(__dirname, 'speech-plan.golden.json'), 'utf8')));

describe('planSpeech', () => {
  it('cuts text exactly as the app does, so stored clips match what it asks for', () => {
    expect(planSpeech(golden.blocks.map((text) => ({ text })))).toEqual(golden.sentences.map(({ text }) => text));
  });
});

describe('spokenMinutes', () => {
  it('rounds up the time to read the sentences', () => {
    expect(spokenMinutes(['a'.repeat(901)])).toBe(2);
    expect(spokenMinutes([])).toBe(0);
  });
});
