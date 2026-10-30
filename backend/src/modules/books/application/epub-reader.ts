import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { HTMLElement, Node, NodeType, parse as parseHtml } from 'node-html-parser';
import { posix } from 'node:path';

export type EpubMetadata = {
  title: string | null;
  author: string | null;
  language: string | null;
};

export type EpubBlock = {
  kind: 'heading' | 'paragraph';
  text: string;
};

export type EpubChapter = {
  label: string;
  subtitle: string | null;
  blocks: EpubBlock[];
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
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRST_ENTRY_NAME_OFFSET = 30;
const FIRST_ENTRY_NAME_LENGTH_OFFSET = 26;
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'pre']);

const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

type SpineDocument = { path: string; html: string };

/** A block plus the anchor ids that land on it, so TOC fragments can be resolved to a position. */
type PlacedBlock = EpubBlock & { path: string; anchors: string[] };

type TocEntry = { label: string; path: string; fragment: string | null };

/**
 * Validates the EPUB container (OCF), reads Dublin Core metadata, and splits the spine text into chapters
 * using the top level of the table of contents. Without one, each spine document becomes a chapter.
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
  const blocks = spine.flatMap(blocksOf);
  if (blocks.length === 0) {
    return { kind: 'invalid', reason: 'NO_TEXT' };
  }
  const toc = await readToc(zip, manifest);
  return {
    kind: 'ok',
    book: {
      metadata: packageMetadata(packageDocument),
      chapters: splitChapters(blocks, spine, toc),
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
async function readCover(zip: JSZip, packageDocument: unknown, manifest: ManifestItem[]): Promise<EpubCover | null> {
  const coverMeta = list(child(child(packageDocument, 'metadata'), 'meta'))
    .find((meta) => child(meta, '@_name') === 'cover');
  const item = manifest.find((candidate) => candidate.properties.includes('cover-image'))
    ?? manifest.find((candidate) => candidate.id === child(coverMeta, '@_content'));
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

/** Walks the document in order; ids met before a block (or inside it) are attached to that block. */
function blocksOf({ path, html }: SpineDocument): PlacedBlock[] {
  const blocks: PlacedBlock[] = [];
  let pendingAnchors: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType !== NodeType.ELEMENT_NODE || !(node instanceof HTMLElement)) return;
    if (node.id) pendingAnchors.push(node.id);
    const tag = node.rawTagName?.toLowerCase();
    if (tag !== undefined && BLOCK_TAGS.has(tag) && !hasBlockDescendant(node)) {
      const content = node.text.replace(/\s+/g, ' ').trim();
      const anchors = [...pendingAnchors, ...node.querySelectorAll('[id]').map((element) => element.id)];
      if (content.length > 0) {
        blocks.push({ kind: tag.startsWith('h') ? 'heading' : 'paragraph', text: content, path, anchors });
        pendingAnchors = [];
      }
      return;
    }
    node.childNodes.forEach(visit);
  };
  const document = parseHtml(html);
  visit(document.querySelector('body') ?? document);
  return blocks;
}

function hasBlockDescendant(element: HTMLElement): boolean {
  return element.querySelectorAll([...BLOCK_TAGS].join(',')).length > 0;
}

async function readToc(zip: JSZip, manifest: ManifestItem[]): Promise<TocEntry[]> {
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
    const [file, fragment] = href.split('#');
    return [{
      label: link.text.replace(/\s+/g, ' ').trim(),
      path: resolvePath(posix.dirname(nav.path), file),
      fragment: fragment ?? null,
    }];
  });
}

function splitChapters(blocks: PlacedBlock[], spine: SpineDocument[], toc: TocEntry[]): EpubChapter[] {
  const starts = toc
    .map((entry) => ({ entry, start: tocEntryStart(blocks, entry) }))
    .filter((located): located is { entry: TocEntry; start: number } => located.start !== null)
    .sort((a, b) => a.start - b.start)
    .filter((located, index, all) => index === 0 || located.start !== all[index - 1].start);
  if (starts.length === 0) {
    return spine
      .map((document) => blocks.filter((block) => block.path === document.path))
      .filter((chapterBlocks) => chapterBlocks.length > 0)
      .map((chapterBlocks, index) => {
        const label = chapterBlocks[0].kind === 'heading' ? chapterBlocks[0].text : `Phần ${index + 1}`;
        return toChapter(label, chapterBlocks);
      });
  }
  return starts.map(({ entry, start }, index) =>
    toChapter(entry.label, blocks.slice(start, starts[index + 1]?.start ?? blocks.length)),
  );
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
function toChapter(label: string, placed: PlacedBlock[]): EpubChapter {
  const blocks = placed.map(({ kind, text: content }) => ({ kind, text: content }));
  const firstBody = blocks.findIndex((block) => block.kind !== 'heading');
  const bodyStart = firstBody === -1 ? blocks.length : firstBody;
  const subtitle = blocks.slice(0, bodyStart).map((block) => block.text).filter((heading) => heading !== label).join(' ');
  return { label, subtitle: subtitle.length > 0 ? subtitle : null, blocks: blocks.slice(bodyStart) };
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
