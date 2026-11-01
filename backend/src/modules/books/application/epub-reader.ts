import { XMLParser } from 'fast-xml-parser';
import { imageSize } from 'image-size';
import JSZip from 'jszip';
import { HTMLElement, Node, NodeType, parse as parseHtml } from 'node-html-parser';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { ChapterKind, PICTURE_TYPES } from '../domain/book';

export type EpubMetadata = {
  title: string | null;
  author: string | null;
  language: string | null;
};

export type EpubBlock = {
  kind: 'heading' | 'paragraph';
  text: string;
};

/** A picture the reader can show. Its name comes from its bytes, so one picture is kept once. */
export type EpubImage = {
  name: string;
  bytes: Buffer;
  mediaType: string;
  width: number;
  height: number;
};

/** A picture standing before the block at index [before]; the chapter's block count puts it last. */
export type EpubFigure = {
  before: number;
  alt: string | null;
  image: EpubImage;
};

export type EpubChapter = {
  label: string;
  subtitle: string | null;
  kind: ChapterKind;
  blocks: EpubBlock[];
  figures: EpubFigure[];
};

export type EpubCover = {
  bytes: Buffer;
  mediaType: string;
};

export type EpubBook = {
  metadata: EpubMetadata;
  chapters: EpubChapter[];
  cover: EpubCover | null;
};

export type EpubReadResult =
  | { kind: 'ok'; book: EpubBook }
  | { kind: 'invalid'; reason: string };

const EPUB_MIMETYPE = 'application/epub+zip';
const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml';
const SHORT_LINE = 60;
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRST_ENTRY_NAME_OFFSET = 30;
const FIRST_ENTRY_NAME_LENGTH_OFFSET = 26;
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre']);
const PICTURE_TAGS = new Set(['img', 'image']);

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

type SpineDocument = { path: string; html: string };

/** Where a picture is in the file, before it is known to be readable. */
type PictureSource = { path: string; alt: string | null };

/**
 * A block plus the anchor ids that land on it, so TOC fragments can be resolved to a position.
 * Pictures ride on blocks, so that they never change where chapters begin or how blocks are numbered.
 */
type PlacedBlock = EpubBlock & { path: string; anchors: string[]; picturesBefore: PictureSource[]; picturesAfter: PictureSource[] };

type PlacedChapter = Omit<EpubChapter, 'figures'> & { pictures: (PictureSource & { before: number })[] };

type TocEntry = { label: string; path: string; fragment: string | null };

/**
 * Validates the EPUB container (OCF), reads Dublin Core metadata, and splits the spine text into chapters
 * using the top level of the table of contents. Text before its first entry is kept as front matter.
 * Without one, each spine document becomes a chapter.
 */
export async function readEpub(bytes: Buffer): Promise<EpubReadResult> {
  if (!startsWithMimetypeEntry(bytes)) {
    return { kind: 'invalid', reason: 'FIRST_ENTRY_NOT_MIMETYPE' };
  }
  const zip = await loadZip(bytes);
  if (!zip) {
    return { kind: 'invalid', reason: 'ZIP_UNREADABLE' };
  }
  const mimetype = await zip.file('mimetype')?.async('string');
  if (mimetype?.trim() !== EPUB_MIMETYPE) {
    return { kind: 'invalid', reason: 'MIMETYPE_MISMATCH' };
  }
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container === undefined ? null : rootfilePath(parseXml(container));
  const opf = opfPath === null ? undefined : await zip.file(opfPath)?.async('string');
  if (opfPath === null || opf === undefined) {
    return { kind: 'invalid', reason: 'PACKAGE_DOCUMENT_MISSING' };
  }
  const packageDocument = child(parseXml(opf), 'package');
  const manifest = manifestItems(packageDocument, posix.dirname(opfPath));
  const spine = await readSpine(zip, packageDocument, manifest);
  const blocks = placeBlocks(spine);
  if (blocks.length === 0) {
    return { kind: 'invalid', reason: 'NO_TEXT' };
  }
  const toc = await readToc(zip, manifest);
  return {
    kind: 'ok',
    book: {
      metadata: packageMetadata(packageDocument),
      chapters: await withFigures(zip, splitChapters(blocks, spine, toc), coverItem(packageDocument, manifest)?.path),
      cover: await readCover(zip, packageDocument, manifest),
    },
  };
}

function startsWithMimetypeEntry(bytes: Buffer): boolean {
  if (bytes.length < FIRST_ENTRY_NAME_OFFSET || !bytes.subarray(0, 4).equals(ZIP_LOCAL_HEADER)) {
    return false;
  }
  const nameLength = bytes.readUInt16LE(FIRST_ENTRY_NAME_LENGTH_OFFSET);
  const name = bytes.toString('latin1', FIRST_ENTRY_NAME_OFFSET, FIRST_ENTRY_NAME_OFFSET + nameLength);
  return name === 'mimetype';
}

async function loadZip(bytes: Buffer): Promise<JSZip | null> {
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    return null;
  }
}

function parseXml(source: string): unknown {
  try {
    const document: unknown = xml.parse(source);
    return document;
  } catch {
    return undefined;
  }
}

function rootfilePath(document: unknown): string | null {
  const rootfile = first(child(child(child(document, 'container'), 'rootfiles'), 'rootfile'));
  const path = child(rootfile, '@_full-path');
  return typeof path === 'string' && path.length > 0 ? path : null;
}

function packageMetadata(packageDocument: unknown): EpubMetadata {
  const metadata = child(packageDocument, 'metadata');
  return {
    title: text(child(metadata, 'title')),
    author: text(child(metadata, 'creator')),
    language: text(child(metadata, 'language')),
  };
}

type ManifestItem = { id: string; path: string; mediaType: string | null; properties: string[] };

function manifestItems(packageDocument: unknown, baseDir: string): ManifestItem[] {
  return list(child(child(packageDocument, 'manifest'), 'item')).flatMap((item) => {
    const id = child(item, '@_id');
    const href = child(item, '@_href');
    const properties = child(item, '@_properties');
    const mediaType = child(item, '@_media-type');
    if (typeof id !== 'string' || typeof href !== 'string') return [];
    return [{
      id,
      path: resolvePath(baseDir, href),
      mediaType: typeof mediaType === 'string' ? mediaType : null,
      properties: typeof properties === 'string' ? properties.split(/\s+/) : [],
    }];
  });
}

/** EPUB 3 marks the image in the manifest; EPUB 2 names it in a `cover` meta. */
function coverItem(packageDocument: unknown, manifest: ManifestItem[]): ManifestItem | undefined {
  const coverMeta = list(child(child(packageDocument, 'metadata'), 'meta'))
    .find((meta) => child(meta, '@_name') === 'cover');
  return manifest.find((candidate) => candidate.properties.includes('cover-image'))
    ?? manifest.find((candidate) => candidate.id === child(coverMeta, '@_content'));
}

async function readCover(zip: JSZip, packageDocument: unknown, manifest: ManifestItem[]): Promise<EpubCover | null> {
  const item = coverItem(packageDocument, manifest);
  if (item?.mediaType?.startsWith('image/') !== true) return null;
  const bytes = await zip.file(item.path)?.async('nodebuffer');
  return bytes === undefined ? null : { bytes, mediaType: item.mediaType };
}

async function readSpine(zip: JSZip, packageDocument: unknown, manifest: ManifestItem[]): Promise<SpineDocument[]> {
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const paths = list(child(child(packageDocument, 'spine'), 'itemref'))
    .map((itemref) => byId.get(String(child(itemref, '@_idref'))))
    .filter((item): item is ManifestItem => item !== undefined && !item.properties.includes('nav'))
    .map((item) => item.path);
  const documents = await Promise.all(paths.map(async (path) => ({ path, html: await zip.file(path)?.async('string') })));
  return documents.flatMap(({ path, html }) => (html === undefined ? [] : [{ path, html }]));
}

/**
 * The blocks of the whole spine. A picture ending a file stays after that file's last block;
 * one in a file with no text, such as a plate between chapters, waits for the next block.
 */
function placeBlocks(spine: SpineDocument[]): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  let waiting: PictureSource[] = [];
  for (const document of spine) {
    const { placed, left } = blocksOf(document, waiting);
    const last = placed.at(-1);
    last?.picturesAfter.push(...left);
    waiting = last ? [] : left;
    blocks.push(...placed);
  }
  blocks.at(-1)?.picturesAfter.push(...waiting);
  return blocks;
}

type Waiting = { anchors: string[]; pictures: PictureSource[] };

/** Walks the document in order; ids and pictures met before a block are attached to that block. */
function blocksOf({ path, html }: SpineDocument, pictures: PictureSource[]): { placed: PlacedBlock[]; left: PictureSource[] } {
  const placed: PlacedBlock[] = [];
  const waiting: Waiting = { anchors: [], pictures };
  const visit = (node: Node) => {
    if (!isElement(node)) return;
    if (node.id) waiting.anchors.push(node.id);
    const tag = tagOf(node);
    if (PICTURE_TAGS.has(tag)) {
      waiting.pictures = [...waiting.pictures, ...pictureSource(node, path)];
    } else if (BLOCK_TAGS.has(tag) && !hasBlockDescendant(node)) {
      placed.push(...leafBlock(node, tag, path, waiting));
    } else {
      node.childNodes.forEach(visit);
    }
  };
  visit(bodyOf(html));
  return { placed, left: waiting.pictures };
}

const isElement = (node: Node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE && node instanceof HTMLElement;

const tagOf = (element: HTMLElement) => element.rawTagName?.toLowerCase() ?? '';

function bodyOf(html: string): HTMLElement {
  const document = parseHtml(html);
  return document.querySelector('body') ?? document;
}

/** A block with no words is not a block, but what waits for one and the pictures in it go on waiting. */
function leafBlock(node: HTMLElement, tag: string, path: string, waiting: Waiting): PlacedBlock[] {
  const content = node.text.replace(/\s+/g, ' ').trim();
  const inside = node.querySelectorAll([...PICTURE_TAGS].join(',')).flatMap((picture) => pictureSource(picture, path));
  const anchors = [...waiting.anchors, ...node.querySelectorAll('[id]').map((element) => element.id)];
  if (content.length === 0) {
    waiting.pictures = [...waiting.pictures, ...inside];
    return [];
  }
  const block: PlacedBlock = {
    kind: tag.startsWith('h') ? 'heading' : 'paragraph',
    text: content,
    path,
    anchors,
    picturesBefore: waiting.pictures,
    picturesAfter: inside,
  };
  waiting.anchors = [];
  waiting.pictures = [];
  return [block];
}

/** Inside the book only: a picture on the web would be a request to wherever it points. */
function pictureSource(element: HTMLElement, documentPath: string): PictureSource[] {
  const href = element.getAttribute('src') ?? element.getAttribute('xlink:href') ?? element.getAttribute('href');
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return [];
  const alt = element.getAttribute('alt')?.replace(/\s+/g, ' ').trim();
  try {
    return [{ path: resolvePath(posix.dirname(documentPath), href.split('#')[0]), alt: alt ? alt : null }];
  } catch {
    return [];
  }
}

function hasBlockDescendant(element: HTMLElement): boolean {
  return element.querySelectorAll([...BLOCK_TAGS].join(',')).length > 0;
}

async function readToc(zip: JSZip, manifest: ManifestItem[]): Promise<TocEntry[]> {
  const entries = await readNav(zip, manifest);
  return entries.length > 0 ? entries : readNcx(zip, manifest);
}

function tocEntry(label: string, baseDir: string, href: string): TocEntry {
  const [file, fragment] = href.split('#');
  return { label, path: resolvePath(baseDir, file), fragment: fragment ?? null };
}

/** EPUB 2 keeps the table of contents in an NCX file. */
async function readNcx(zip: JSZip, manifest: ManifestItem[]): Promise<TocEntry[]> {
  const ncx = manifest.find((item) => item.mediaType === NCX_MEDIA_TYPE);
  const source = ncx === undefined ? undefined : await zip.file(ncx.path)?.async('string');
  if (ncx === undefined || source === undefined) return [];
  return list(child(child(child(parseXml(source), 'ncx'), 'navMap'), 'navPoint')).flatMap((point) => {
    const label = text(child(child(point, 'navLabel'), 'text'));
    const href = child(child(point, 'content'), '@_src');
    return label === null || typeof href !== 'string' ? [] : [tocEntry(label, posix.dirname(ncx.path), href)];
  });
}

async function readNav(zip: JSZip, manifest: ManifestItem[]): Promise<TocEntry[]> {
  const nav = manifest.find((item) => item.properties.includes('nav'));
  const source = nav === undefined ? undefined : await zip.file(nav.path)?.async('string');
  if (nav === undefined || source === undefined) return [];
  const document = parseHtml(source);
  const tocNav = document.querySelectorAll('nav').find((element) => element.getAttribute('epub:type') === 'toc')
    ?? document.querySelector('nav');
  const topList = tocNav?.querySelector('ol');
  if (!topList) return [];
  return topList.childNodes.flatMap((item) => {
    if (!(item instanceof HTMLElement) || item.rawTagName?.toLowerCase() !== 'li') return [];
    const link = item.childNodes.find(
      (node): node is HTMLElement => node instanceof HTMLElement && node.rawTagName?.toLowerCase() === 'a',
    );
    const href = link?.getAttribute('href');
    if (!link || !href) return [];
    return [tocEntry(link.text.replace(/\s+/g, ' ').trim(), posix.dirname(nav.path), href)];
  });
}

function splitChapters(blocks: PlacedBlock[], spine: SpineDocument[], toc: TocEntry[]): PlacedChapter[] {
  const starts = toc
    .map((entry) => ({ entry, start: tocEntryStart(blocks, entry) }))
    .filter((located): located is { entry: TocEntry; start: number } => located.start !== null)
    .sort((a, b) => a.start - b.start)
    .filter((located, index, all) => index === 0 || located.start !== all[index - 1].start);
  if (starts.length === 0) return byDocument(blocks, spine, 'main');
  return [
    ...byDocument(blocks.slice(0, starts[0].start), spine, 'front'),
    ...starts.map(({ entry, start }, index) =>
      toChapter(entry.label, 'main', blocks.slice(start, starts[index + 1]?.start ?? blocks.length)),
    ),
  ];
}

function byDocument(blocks: PlacedBlock[], spine: SpineDocument[], kind: ChapterKind): PlacedChapter[] {
  return spine
    .map((document) => blocks.filter((block) => block.path === document.path))
    .filter((chapterBlocks) => chapterBlocks.length > 0)
    .map((chapterBlocks, index) => toChapter(openingLine(chapterBlocks[0]) ?? `Phần ${index + 1}`, kind, chapterBlocks));
}

/** A heading, or a short line that does not read as a sentence: what a title page or a "Giới thiệu" opens with. */
function openingLine({ kind, text: line }: EpubBlock): string | null {
  return kind === 'heading' || (line.length <= SHORT_LINE && !/[.,:;!?…]$/.test(line)) ? line : null;
}

function tocEntryStart(blocks: PlacedBlock[], { path, fragment }: TocEntry): number | null {
  const index = blocks.findIndex((block) =>
    block.path === path && (fragment === null || block.anchors.includes(fragment)),
  );
  return index === -1 ? null : index;
}

/**
 * The run of headings that opens the chapter becomes its subtitle (minus the one repeating the label)
 * and is left out of the body, so readers and digests start at the prose.
 */
function toChapter(label: string, kind: ChapterKind, placed: PlacedBlock[]): PlacedChapter {
  const blocks = placed.map(({ kind, text: content }) => ({ kind, text: content }));
  const firstBody = blocks.findIndex((block) => block.kind !== 'heading');
  const bodyStart = firstBody === -1 ? blocks.length : firstBody;
  const subtitle = blocks.slice(0, bodyStart).map((block) => block.text).filter((heading) => heading !== label).join(' ');
  const pictures = placed.flatMap(({ picturesBefore, picturesAfter }, index) => [
    ...picturesBefore.map((picture) => ({ ...picture, before: Math.max(index - bodyStart, 0) })),
    ...picturesAfter.map((picture) => ({ ...picture, before: Math.max(index + 1 - bodyStart, 0) })),
  ]);
  return { label, subtitle: subtitle.length > 0 ? subtitle : null, kind, blocks: blocks.slice(bodyStart), pictures };
}

/** Opens each picture once; what cannot be shown is left out and the text reads on without it. */
async function withFigures(zip: JSZip, chapters: PlacedChapter[], coverPath: string | undefined): Promise<EpubChapter[]> {
  const paths = new Set(chapters.flatMap(({ pictures }) => pictures.map(({ path }) => path)));
  paths.delete(coverPath ?? '');
  const images = new Map(await Promise.all([...paths].map(async (path) => [path, await readImage(zip, path)] as const)));
  return chapters.map(({ pictures, ...chapter }) => ({
    ...chapter,
    figures: pictures.flatMap(({ path, alt, before }) => {
      const image = images.get(path);
      return image ? [{ before, alt, image }] : [];
    }),
  }));
}

/** The type comes from the bytes, since a manifest or a file name can say anything. */
async function readImage(zip: JSZip, path: string): Promise<EpubImage | null> {
  const bytes = await zip.file(path)?.async('nodebuffer');
  if (bytes === undefined) return null;
  try {
    const { type, width, height } = imageSize(bytes);
    const mediaType = type === undefined ? undefined : PICTURE_TYPES.get(type);
    if (!mediaType) return null;
    return { name: `${createHash('sha256').update(bytes).digest('hex')}.${type}`, bytes, mediaType, width, height };
  } catch {
    return null;
  }
}

function resolvePath(baseDir: string, href: string): string {
  return posix.normalize(posix.join(baseDir, decodeURIComponent(href)));
}

function child(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const value: unknown = Reflect.get(node, key);
  return value;
}

function first(node: unknown): unknown {
  return Array.isArray(node) ? node[0] : node;
}

function list(node: unknown): unknown[] {
  if (node === undefined) return [];
  return Array.isArray(node) ? node : [node];
}

/** Dublin Core elements parse as a string, an element object with `#text`, or a list of either. */
function text(node: unknown): string | null {
  const element = first(node);
  const value = typeof element === 'object' ? child(element, '#text') : element;
  const trimmed = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}
