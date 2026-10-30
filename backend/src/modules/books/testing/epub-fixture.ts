import JSZip from 'jszip';

export type EpubFixtureOptions = {
  mimetype?: string;
  title?: string;
  withNav?: boolean;
};

const words = (count: number, word: string) => Array.from({ length: count }, () => word).join(' ');

/**
 * Three chapters across two files. Chương Hai starts mid-file at an anchor, the way Calibre splits books.
 * Chương Một: 600 words (3 min). Chương Hai: 200 words (1 min). Chương Ba: 1000 words (5 min).
 */
export async function buildEpub({
  mimetype = 'application/epub+zip',
  title = 'Synthetic Book',
  withNav = true,
}: EpubFixtureOptions = {}): Promise<Buffer> {
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
    <dc:language>vi</dc:language>
  </metadata>
  <manifest>
    ${withNav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
    <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol>
  <li><a href="text/c1.xhtml">Chương Một</a><ol><li><a href="text/c1.xhtml#t1">TIÊU ĐỀ MỘT</a></li></ol></li>
  <li><a href="text/c1.xhtml#c2">Chương Hai</a></li>
  <li><a href="text/c2.xhtml">Chương Ba</a></li>
</ol></nav></body></html>`);
  zip.file('OEBPS/text/cover.xhtml', '<html><body><p>Cover page</p></body></html>');
  zip.file('OEBPS/text/c1.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chương Một</h1>
<h2 id="t1">TIÊU ĐỀ MỘT</h2>
<p>${words(300, 'một')}</p>
<p>${words(300, 'một')} &amp; hết</p>
<h1 id="c2">Chương Hai</h1>
<p>${words(200, 'hai')}</p>
</body></html>`);
  zip.file('OEBPS/text/c2.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chương Ba</h1>
<div><p>${words(500, 'ba')}</p><p>${words(500, 'ba')}</p></div>
</body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
