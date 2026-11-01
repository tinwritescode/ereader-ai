import { ChapterRecord } from './book';
import { reshapedChapters } from './book-reshape';

const FIGURE = { before: 0, image: 'a.png', alt: null, width: 2, height: 1 };

const stored = (index: number, label: string, text: string): ChapterRecord => ({
  id: `b-c${index}`,
  bookId: 'b',
  index,
  label,
  subtitle: null,
  kind: 'main',
  wordCount: 1,
  minutes: 1,
  blocks: [{ blockId: `b-c${index}-b0`, kind: 'paragraph', text }],
  figures: [],
});

const fresh = (label: string, text: string, kind: 'main' | 'front' = 'main') => ({
  label,
  subtitle: null,
  kind,
  blocks: [{ kind: 'paragraph' as const, text }],
  figures: [FIGURE],
});

describe('reshapedChapters', () => {
  it('renames a stored chapter that holds the same text, keeping its id', () => {
    expect(reshapedChapters([stored(0, 'Phần 1', 'a'), stored(1, 'Phần 2', 'b')], [fresh('Mục lục', 'a', 'front'), fresh('Hoa anh đào', 'b')])).toEqual([
      { id: 'b-c0', label: 'Mục lục', subtitle: null, kind: 'front', figures: [FIGURE] },
      { id: 'b-c1', label: 'Hoa anh đào', subtitle: null, kind: 'main', figures: [FIGURE] },
    ]);
  });

  it('leaves alone a chapter whose text no longer lines up', () => {
    expect(reshapedChapters([stored(0, 'Phần 1', 'a')], [fresh('Khác', 'a và b')])).toEqual([]);
  });

  it('adds nothing for text the stored book never held', () => {
    expect(reshapedChapters([stored(0, 'Phần 1', 'a')], [fresh('Mới', 'z'), fresh('Hoa', 'a')])).toEqual([
      { id: 'b-c0', label: 'Hoa', subtitle: null, kind: 'main', figures: [FIGURE] },
    ]);
  });
});
