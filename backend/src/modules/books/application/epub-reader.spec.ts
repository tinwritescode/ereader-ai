import { buildEpub } from '../testing/epub-fixture';
import { EpubBook, readEpub } from './epub-reader';

async function read(options: Parameters<typeof buildEpub>[0]): Promise<EpubBook> {
  const result = await readEpub(await buildEpub(options));
  if (result.kind !== 'ok') throw new Error(result.reason);
  return result.book;
}

const outline = ({ chapters }: EpubBook) => chapters.map(({ kind, label }) => [kind, label]);

describe('readEpub chapters', () => {
  it('reads an EPUB 2 table of contents, top level only', async () => {
    expect(outline(await read({ toc: 'ncx' }))).toEqual([
      ['main', 'Chương Một'],
      ['main', 'Chương Hai'],
      ['main', 'Chương Ba'],
    ]);
  });

  it.each(['nav', 'ncx'] as const)('keeps the text before a %s table of contents as front matter', async (toc) => {
    const book = await read({ toc, frontMatter: true });
    expect(outline(book)).toEqual([
      ['front', 'Giới thiệu'],
      ['main', 'Chương Một'],
      ['main', 'Chương Hai'],
      ['main', 'Chương Ba'],
    ]);
    expect(book.chapters[0].blocks.map(({ text }) => text)).toContain('Một cuốn sách viết để thử.');
  });

  it('names chapters by their first short line when the book has no table of contents, and marks none as front', async () => {
    expect(outline(await read({ withNav: false }))).toEqual([
      ['main', 'Giới thiệu'],
      ['main', 'Chương Một'],
      ['main', 'Chương Ba'],
    ]);
  });
});
