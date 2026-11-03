import JSZip from 'jszip';
import { PICTURE_TYPES } from '../domain/book';
import { EpubChapter, EpubCover, EpubImage } from './epub-reader';

/** What [writeEpub] puts in the file: what [readEpub] reads out of one, all of it in the book proper. */
export type EpubDraft = {
  /** Stays the same each time the same book is written, so a reading app knows it again. */
  id: string;
  metadata: { title: string; author: string | null; language: string };
  cover: EpubCover | null;
  chapters: Omit<EpubChapter, 'kind'>[];
};

const XHTML = 'application/xhtml+xml';

/** An EPUB 3 file: a cover page, then one file per chapter, each listed in the table of contents. */
export async function writeEpub({ id, metadata, cover, chapters }: EpubDraft): Promise<Buffer> {
  const pictures = new Map(chapters.flatMap(({ figures }) => figures.map(({ image }) => [image.name, image])));
  const coverName = cover && `cover.${extensionOf(cover.mediaType)}`;
  const chapterFiles = chapters.map((chapter, index) => ({ id: `c${index + 1}`, href: `text/c${index + 1}.xhtml`, chapter }));
  const items = [
    { id: 'nav', href: 'nav.xhtml', mediaType: XHTML, properties: 'nav' },
    ...(cover && coverName
      ? [
          { id: 'cover-image', href: `images/${coverName}`, mediaType: cover.mediaType, properties: 'cover-image' },
          { id: 'cover', href: 'text/cover.xhtml', mediaType: XHTML, properties: null },
        ]
      : []),
    ...chapterFiles.map(({ id: itemId, href }) => ({ id: itemId, href, mediaType: XHTML, properties: null })),
    ...[...pictures.values()].map(({ name, mediaType }, index) => ({
      id: `p${index + 1}`,
      href: `images/${name}`,
      mediaType,
      properties: null,
    })),
  ];
  const spine = [...(cover ? ['cover'] : []), ...chapterFiles.map(({ id: itemId }) => itemId)];

  const zip = new JSZip();
  // Readers find the type from the first entry, which must be stored as it is.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('OEBPS/content.opf', packageDocument({ id, metadata, items, spine, withCover: cover !== null }));
  zip.file('OEBPS/nav.xhtml', page({ title: metadata.title, body: navBody(chapterFiles) }));
  if (cover && coverName) {
    zip.file(`OEBPS/images/${coverName}`, cover.bytes);
    zip.file('OEBPS/text/cover.xhtml', page({ title: metadata.title, body: `<img src="../images/${coverName}" alt=""/>` }));
  }
  for (const { href, chapter } of chapterFiles) {
    zip.file(`OEBPS/${href}`, page({ title: chapter.label, body: chapterBody(chapter) }));
  }
  for (const { name, bytes } of pictures.values()) {
    zip.file(`OEBPS/images/${name}`, bytes);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

type Item = { id: string; href: string; mediaType: string; properties: string | null };

function packageDocument({
  id,
  metadata: { title, author, language },
  items,
  spine,
  withCover,
}: {
  id: string;
  metadata: EpubDraft['metadata'];
  items: Item[];
  spine: string[];
  withCover: boolean;
}): string {
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escape(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escape(id)}</dc:identifier>
    <dc:title>${escape(title)}</dc:title>
    ${author === null ? '' : `<dc:creator>${escape(author)}</dc:creator>`}
    <dc:language>${escape(language)}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    ${withCover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
${items.map(manifestItem).join('\n')}
  </manifest>
  <spine>${spine.map((idref) => `<itemref idref="${idref}"/>`).join('')}</spine>
</package>`;
}

function manifestItem({ id, href, mediaType, properties }: Item): string {
  const marked = properties === null ? '' : ` properties="${properties}"`;
  return `    <item id="${id}" href="${escape(href)}" media-type="${escape(mediaType)}"${marked}/>`;
}

function navBody(chapterFiles: { href: string; chapter: { label: string } }[]): string {
  const entries = chapterFiles.map(({ href, chapter }) => `<li><a href="${href}">${escape(chapter.label)}</a></li>`);
  return `<nav epub:type="toc" id="toc"><h1>Mục lục</h1><ol>${entries.join('')}</ol></nav>`;
}

/** The label and subtitle open the chapter; each picture stands before the block it was found before. */
function chapterBody({ label, subtitle, blocks, figures }: Omit<EpubChapter, 'kind'>): string {
  const figuresBefore = (index: number) =>
    figures.filter(({ before }) => before === index).map(({ alt, image }) => figure(image, alt));
  return [
    `<h1>${escape(label)}</h1>`,
    ...(subtitle === null ? [] : [`<h2>${escape(subtitle)}</h2>`]),
    ...blocks.flatMap(({ kind, text }, index) => [
      ...figuresBefore(index),
      kind === 'heading' ? `<h2>${escape(text)}</h2>` : `<p>${escape(text)}</p>`,
    ]),
    ...figures.filter(({ before }) => before >= blocks.length).map(({ alt, image }) => figure(image, alt)),
  ].join('\n');
}

function figure({ name, width, height }: EpubImage, alt: string | null): string {
  return `<div class="figure"><img src="../images/${name}" alt="${escape(alt ?? '')}" width="${width}" height="${height}"/></div>`;
}

function page({ title, body }: { title: string; body: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${escape(title)}</title></head>
<body>
${body}
</body>
</html>`;
}

function extensionOf(mediaType: string): string {
  const known = [...PICTURE_TYPES].find(([, type]) => type === mediaType)?.[0];
  return known ?? (mediaType.replace(/^image\//, '').replace(/[^a-z0-9].*$/i, '') || 'img');
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

function escape(text: string): string {
  return text.replace(/[&<>"]/g, (character) => ESCAPES[character]);
}
