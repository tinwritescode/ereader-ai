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

  it('keeps a sentence of exactly 300 characters whole', () => {
    expect(planSpeech([{ text: 'a'.repeat(300) }])).toEqual(['a'.repeat(300)]);
  });

  it('never makes a piece longer than 300 characters, even when a comma falls right after the limit', () => {
    expect(planSpeech([{ text: `${'b'.repeat(300)}, tail` }])).toEqual(['b'.repeat(300), ', tail']);
  });

  it('cuts after a comma only when it lies past the middle of the piece', () => {
    const atMiddle = `${'c'.repeat(150)},${'d'.repeat(200)}`;
    expect(planSpeech([{ text: atMiddle }])).toEqual([atMiddle.slice(0, 300), atMiddle.slice(300)]);
    const pastMiddle = `${'c'.repeat(151)},${'d'.repeat(200)}`;
    expect(planSpeech([{ text: pastMiddle }])).toEqual([pastMiddle.slice(0, 152), pastMiddle.slice(152)]);
  });
});

describe('spokenMinutes', () => {
  it('rounds up the time to read the sentences', () => {
    expect(spokenMinutes(['a'.repeat(901)])).toBe(2);
    expect(spokenMinutes([])).toBe(0);
  });
});
