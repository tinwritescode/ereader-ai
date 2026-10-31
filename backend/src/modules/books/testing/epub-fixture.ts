import JSZip from 'jszip';

export type EpubFixtureOptions = {
  mimetype?: string;
  title?: string;
  withNav?: boolean;
  /** How the package names its cover image; none by default. */
  cover?: 'epub3' | 'epub2';
  language?: string;
  /** The language the words are in, when it differs from the declared one. */
  writtenIn?: string;
  /** Text in the file before the first table-of-contents entry. */
  frontMatter?: boolean;
  /** Where the table of contents lives; EPUB 2 keeps it in an NCX file. */
  toc?: 'nav' | 'ncx';
};

export const COVER_PNG = Buffer.from('fake-png-bytes');

const words = (count: number, word: string) => Array.from({ length: count }, () => word).join(' ');

/**
 * Three chapters across two files. Chương Hai starts mid-file at an anchor, the way Calibre splits books.
 * Chương Một: 600 words (3 min). Chương Hai: 200 words (1 min). Chương Ba: 1000 words (5 min).
 */
export async function buildEpub({
  mimetype = 'application/epub+zip',
  title = 'Synthetic Book',
  withNav = true,
  cover,
  language = 'vi',
  frontMatter = false,
  toc = 'nav',
  writtenIn = language,
}: EpubFixtureOptions = {}): Promise<Buffer> {
  const [one, two, three] = writtenIn.startsWith('vi') ? ['một', 'hai', 'ba'] : ['one', 'two', 'three'];
  const zip = new JSZip();
  zip.file('mimetype', mimetype, { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">synthetic</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator id="author">Ada Writer</dc:creator>
    <dc:language>${language}</dc:language>
    ${cover === 'epub2' ? '<meta name="cover" content="art"/>' : ''}
  </metadata>
  <manifest>
    ${withNav && toc === 'nav' ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
    ${withNav && toc === 'ncx' ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}
    <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
    ${cover === undefined ? '' : `<item id="art" href="images/art.png" media-type="image/png"${cover === 'epub3' ? ' properties="cover-image"' : ''}/>`}
    <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`);
  if (cover !== undefined) zip.file('OEBPS/images/art.png', COVER_PNG);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol>
  <li><a href="text/c1.xhtml">Chương Một</a><ol><li><a href="text/c1.xhtml#t1">TIÊU ĐỀ MỘT</a></li></ol></li>
  <li><a href="text/c1.xhtml#c2">Chương Hai</a></li>
  <li><a href="text/c2.xhtml">Chương Ba</a></li>
</ol></nav></body></html>`);
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<docTitle><text>${title}</text></docTitle>
<navMap>
  <navPoint id="p1" playOrder="1"><navLabel><text>Chương Một</text></navLabel><content src="text/c1.xhtml"/>
    <navPoint id="p1a" playOrder="2"><navLabel><text>TIÊU ĐỀ MỘT</text></navLabel><content src="text/c1.xhtml#t1"/></navPoint>
  </navPoint>
  <navPoint id="p2" playOrder="3"><navLabel><text>Chương Hai</text></navLabel><content src="text/c1.xhtml#c2"/></navPoint>
  <navPoint id="p3" playOrder="4"><navLabel><text>Chương Ba</text></navLabel><content src="text/c2.xhtml"/></navPoint>
</navMap></ncx>`);
  zip.file('OEBPS/text/cover.xhtml', `<html><body>${frontMatter || !withNav ? '<p>Giới thiệu</p><p>Một cuốn sách viết để thử.</p>' : ''}</body></html>`);
  zip.file('OEBPS/text/c1.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chương Một</h1>
<h2 id="t1">TIÊU ĐỀ MỘT</h2>
<p>${words(300, one)}</p>
<p>${words(300, one)} &amp; hết</p>
<h1 id="c2">Chương Hai</h1>
<p>${words(200, two)}</p>
</body></html>`);
  zip.file('OEBPS/text/c2.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chương Ba</h1>
<div><p>${words(500, three)}</p><p>${words(500, three)}</p></div>
</body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
