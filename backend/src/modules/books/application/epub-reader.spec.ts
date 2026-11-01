import { buildEpub, PICTURE_PNG } from '../testing/epub-fixture';
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

describe('readEpub pictures', () => {
  const placed = ({ chapters }: EpubBook) =>
    chapters.map(({ figures }) => figures.map(({ before, alt }) => ({ before, alt })));

  it('leaves the text and its blocks as they were', async () => {
    const plain = await read({});
    const pictured = await read({ pictures: true });
    expect(pictured.chapters.map(({ blocks }) => blocks)).toEqual(plain.chapters.map(({ blocks }) => blocks));
  });

  it('places each picture among the blocks, skipping any it cannot show', async () => {
    expect(placed(await read({ pictures: true }))).toEqual([
      [{ before: 1, alt: 'Bản đồ' }],
      [{ before: 1, alt: null }],
      [{ before: 0, alt: null }, { before: 0, alt: null }, { before: 2, alt: null }],
    ]);
  });

  it('names a picture by what is in it and reads its size and type from its bytes', async () => {
    const { chapters } = await read({ pictures: true });
    const { image } = chapters[0].figures[0];
    expect(image).toMatchObject({ width: 2, height: 1, mediaType: 'image/png', bytes: PICTURE_PNG });
    expect(image.name).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(chapters[1].figures[0].image.name).toBe(image.name);
  });

  it('does not show the cover again inside the book', async () => {
    const { chapters } = await read({ pictures: true, cover: 'epub3', coverPicture: true });
    expect(chapters.flatMap(({ figures }) => figures)).toHaveLength(5);
  });
});
