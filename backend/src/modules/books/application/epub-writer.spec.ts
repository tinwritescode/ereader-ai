import { createHash } from 'node:crypto';
import { readEpub } from './epub-reader';
import { writeEpub } from './epub-writer';
import { PICTURE_PNG } from '../testing/epub-fixture';

const picture = {
  // Named by its bytes, as the reader names it.
  name: `${createHash('sha256').update(PICTURE_PNG).digest('hex')}.png`,
  bytes: PICTURE_PNG,
  mediaType: 'image/png',
  width: 2,
  height: 1,
};

const book = {
  id: 'book-1',
  metadata: { title: 'Gatsby <vĩ đại> & bạn', author: 'F. Scott Fitzgerald', language: 'vi' },
  cover: { bytes: PICTURE_PNG, mediaType: 'image/png' },
  chapters: [
    {
      label: 'Chương 1',
      subtitle: 'Mùa hè ở West Egg',
      blocks: [
        { kind: 'paragraph' as const, text: 'Hồi tôi còn trẻ & dễ bị tổn thương, cha tôi có cho tôi một lời khuyên.' },
        { kind: 'heading' as const, text: 'Phần giữa' },
        { kind: 'paragraph' as const, text: '"Mỗi khi muốn phê phán ai," ông bảo, "con hãy nhớ <điều này>."' },
      ],
      figures: [
        { before: 0, alt: 'Bản đồ', image: picture },
        { before: 3, alt: null, image: picture },
      ],
    },
    {
      label: 'Chương 2',
      subtitle: null,
      blocks: [{ kind: 'paragraph' as const, text: 'Cách West Egg chừng nửa đường lên New York là một thung lũng tro.' }],
      figures: [],
    },
  ],
};

describe('writeEpub', () => {
  it('writes a book the reader reads back as written', async () => {
    const result = await readEpub(await writeEpub(book));

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.book.metadata).toEqual(book.metadata);
    expect(result.book.cover).toEqual(book.cover);
    expect(result.book.chapters).toEqual(book.chapters.map((chapter) => ({ ...chapter, kind: 'main' })));
  });

  it('keeps a cover of any picture type the book came with', async () => {
    const cover = { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mediaType: 'image/svg+xml' };
    const result = await readEpub(await writeEpub({ ...book, cover }));

    expect(result.kind === 'ok' && result.book.cover).toEqual(cover);
  });

  it('writes a book with no cover and no author', async () => {
    const result = await readEpub(await writeEpub({ ...book, cover: null, metadata: { ...book.metadata, author: null } }));

    expect(result.kind === 'ok' && result.book.cover).toBeNull();
    expect(result.kind === 'ok' && result.book.metadata.author).toBeNull();
  });
});
