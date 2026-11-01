import { LocalDiskStorageGateway } from '../../../shared/storage/local-disk.storage-gateway';
import { BookRecord, ChapterRecord, SHAPE_VERSION } from '../domain/book';
import { buildEpub } from '../testing/epub-fixture';
import { readEpub } from './epub-reader';
import { InMemoryBookStore } from './book-store';
import { BookService } from './book.service';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const oldBook = (language: string, shapeVersion = 0): BookRecord => ({
  id: 'b',
  userId: 'u',
  title: 'Sách',
  author: null,
  language,
  status: 'READY',
  sourceChecksum: 'sum',
  sourceKey: 'sources/b.epub',
  cover: null,
  shapeVersion,
});

const oldChapter: Omit<ChapterRecord, 'blocks' | 'figures'> = {
  id: 'b-c0', bookId: 'b', index: 0, label: 'Phần 1', subtitle: null, kind: 'main', wordCount: 3, minutes: 1,
};

async function shelf(book: BookRecord) {
  const storage = new LocalDiskStorageGateway(await mkdtemp(join(tmpdir(), 'reshape-')));
  await storage.put({ key: book.sourceKey, bytes: await buildEpub({ language: 'en', writtenIn: 'vi', frontMatter: true }) });
  const store = new InMemoryBookStore();
  const blocks = [
    { blockId: 'b-c0-b0', kind: 'paragraph' as const, text: 'Giới thiệu' },
    { blockId: 'b-c0-b1', kind: 'paragraph' as const, text: 'Một cuốn sách viết để thử.' },
  ];
  await store.add(book, [{ ...oldChapter, blocks, figures: [] }]);
  return { store, service: new BookService(storage, store) };
}

describe('BookService.reshapeStale', () => {
  it('gives a book read before pictures its pictures, without touching its text', async () => {
    const bytes = await buildEpub({ pictures: true });
    const epub = await readEpub(bytes);
    if (epub.kind !== 'ok') throw new Error(epub.reason);
    const storage = new LocalDiskStorageGateway(await mkdtemp(join(tmpdir(), 'reshape-')));
    await storage.put({ key: 'sources/b.epub', bytes });
    const store = new InMemoryBookStore();
    const blocks = epub.book.chapters[0].blocks.map((block, index) => ({ ...block, blockId: `b-c0-b${index}` }));
    await store.add(oldBook('vi'), [{ ...oldChapter, blocks, figures: [] }]);
    const service = new BookService(storage, store);

    await service.reshapeStale(async () => undefined);

    const [chapter] = await store.chapters('b');
    expect(chapter.blocks).toEqual(blocks);
    expect(chapter.figures).toEqual([
      { before: 1, alt: 'Bản đồ', image: epub.book.chapters[0].figures[0].image.name, width: 2, height: 1 },
    ]);
    await expect(service.image(chapter.figures[0].image)).resolves.toMatchObject({ mediaType: 'image/png' });
  });

  it('corrects language, names and front matter, keeping chapter ids, and says which book turned Vietnamese', async () => {
    const { store, service } = await shelf(oldBook('en'));
    const turned: string[] = [];
    await service.reshapeStale(async (book) => void turned.push(book.id));
    expect(await store.find('b')).toMatchObject({ language: 'vi', shapeVersion: SHAPE_VERSION });
    expect(await store.chapters('b')).toMatchObject([{ id: 'b-c0', label: 'Giới thiệu', kind: 'front' }]);
    expect(turned).toEqual(['b']);
  });

  it('runs once: a second pass finds nothing to do', async () => {
    const { service } = await shelf(oldBook('en'));
    await service.reshapeStale(async () => undefined);
    const turned: string[] = [];
    await service.reshapeStale(async (book) => void turned.push(book.id));
    expect(turned).toEqual([]);
  });

  it('does not mention a book that was Vietnamese already', async () => {
    const { service } = await shelf(oldBook('vi'));
    const turned: string[] = [];
    await service.reshapeStale(async (book) => void turned.push(book.id));
    expect(turned).toEqual([]);
  });

  it('leaves the book to try again if the step before it fails', async () => {
    const { store, service } = await shelf(oldBook('en'));
    await service.reshapeStale(async () => { throw new Error('task store down'); });
    expect(await store.find('b')).toMatchObject({ language: 'en', shapeVersion: 0 });
  });
});
