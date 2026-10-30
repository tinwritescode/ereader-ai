import { planDigest } from './digest-plan';

const words = (count: number, word = 'chữ') => Array.from({ length: count }, () => word).join(' ');

describe('planDigest', () => {
  it('keeps a chapter that fits one call as a single part', () => {
    expect(planDigest({ paragraphs: [words(300), words(200)], targetWords: 250, maxPartWords: 1_000 })).toEqual([
      { paragraphs: [words(300), words(200)], targetWords: 250 },
    ]);
  });

  it('splits a long chapter at paragraph breaks, in order, sharing the target by length', () => {
    const plan = planDigest({
      paragraphs: [words(600, 'a'), words(600, 'b'), words(300, 'c')],
      targetWords: 300,
      maxPartWords: 1_000,
    });

    expect(plan).toEqual([
      { paragraphs: [words(600, 'a')], targetWords: 120 },
      { paragraphs: [words(600, 'b'), words(300, 'c')], targetWords: 180 },
    ]);
  });

  it('cuts a single paragraph longer than one call into word runs', () => {
    const plan = planDigest({ paragraphs: [words(2_500)], targetWords: 500, maxPartWords: 1_000 });

    expect(plan.map((part) => part.paragraphs.join(' ').split(' ').length)).toEqual([1_000, 1_000, 500]);
    expect(plan.map((part) => part.targetWords)).toEqual([200, 200, 100]);
  });

  it('never asks a part for fewer than a few sentences', () => {
    const plan = planDigest({ paragraphs: [words(990), words(20)], targetWords: 50, maxPartWords: 1_000 });

    expect(plan.map((part) => part.targetWords)).toEqual([49, 30]);
  });
});
