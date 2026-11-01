import { Block, ChapterKind, ChapterRecord, Figure } from './book';

export type ChapterShape = Pick<ChapterRecord, 'id' | 'label' | 'subtitle' | 'kind' | 'figures'>;

type ReadChapter = {
  label: string;
  subtitle: string | null;
  kind: ChapterKind;
  blocks: Pick<Block, 'text'>[];
  figures: Figure[];
};

const sameText = (one: Pick<Block, 'text'>[], other: Pick<Block, 'text'>[]) =>
  one.length === other.length && one.every(({ text }, index) => text === other[index].text);

/**
 * New names for a stored book's chapters, from a fresh read of its file. Reading spots, translations
 * and audio hang on chapter ids and boundaries, so only a chapter holding exactly the same text changes.
 */
export function reshapedChapters(stored: ChapterRecord[], fresh: ReadChapter[]): ChapterShape[] {
  return stored.flatMap(({ id, blocks }) => {
    const same = fresh.find((chapter) => sameText(chapter.blocks, blocks));
    return same ? [{ id, label: same.label, subtitle: same.subtitle, kind: same.kind, figures: same.figures }] : [];
  });
}
