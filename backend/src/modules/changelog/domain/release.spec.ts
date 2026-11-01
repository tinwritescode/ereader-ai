import { newestFirst, parseRelease } from './release';

const text = `---
date: 2026-11-01
title: Theo dõi từng tác vụ dài
---

## Mới
- **Trang Tác vụ** cho biết chương nào đang dịch,
  và đã được bao nhiêu phần trăm.
- **Báo cho bạn** khi một chương dịch xong.

## Sửa
- Hạt Dẻ đọc ít lỗi phát âm hơn.
`;

describe('parseRelease', () => {
  it('reads the version from the file name and the notes from the Markdown', () => {
    expect(parseRelease('1.3.0.md', text)).toEqual({
      version: '1.3.0',
      date: '2026-11-01',
      title: 'Theo dõi từng tác vụ dài',
      added: [
        [
          { text: 'Trang Tác vụ', marked: true },
          { text: ' cho biết chương nào đang dịch, và đã được bao nhiêu phần trăm.', marked: false },
        ],
        [
          { text: 'Báo cho bạn', marked: true },
          { text: ' khi một chương dịch xong.', marked: false },
        ],
      ],
      fixed: [[{ text: 'Hạt Dẻ đọc ít lỗi phát âm hơn.', marked: false }]],
    });
  });

  it('marks only what is closed in bold, and keeps every run of text', () => {
    const note = (line: string) => parseRelease('1.0.0.md', `---\ndate: 2026-11-01\ntitle: t\n---\n## Mới\n- ${line}\n`).added[0];
    expect(note('**Mới**.')).toEqual([
      { text: 'Mới', marked: true },
      { text: '.', marked: false },
    ]);
    expect(note('**chưa đóng')).toEqual([{ text: '**chưa đóng', marked: false }]);
  });

  it('allows one new note and one fix', () => {
    const one = '---\ndate: 2026-11-01\ntitle: t\n---\n## Mới\n- Một.\n## Sửa\n- Hai.\n';
    expect(parseRelease('1.0.0.md', one)).toMatchObject({ added: [expect.any(Array)], fixed: [expect.any(Array)] });
  });

  it('allows a release with only fixes', () => {
    const fixes = text.replace(/## Mới[\s\S]*?(?=## Sửa)/, '');
    expect(parseRelease('1.3.1.md', fixes)).toMatchObject({ added: [], fixed: [expect.any(Array)] });
  });

  it.each([
    ['a file name that is not a version', 'notes.md', text],
    ['a missing date', '1.0.0.md', text.replace('date: 2026-11-01\n', '')],
    ['a date not written as YYYY-MM-DD', '1.0.0.md', text.replace('2026-11-01', '1/11/2026')],
    ['a missing title', '1.0.0.md', text.replace('title: Theo dõi từng tác vụ dài\n', '')],
    ['a heading other than Mới or Sửa', '1.0.0.md', text.replace('## Sửa', '## Khác')],
    ['an item before any heading', '1.0.0.md', text.replace('## Mới\n', '')],
    ['a line that is neither a note nor its continuation', '1.0.0.md', text.replace('## Mới\n', '## Mới\nGhi chú lạc.\n')],
    ['a line before any heading', '1.0.0.md', text.replace('## Mới\n', 'Ghi chú lạc.\n## Mới\n')],
    ['a release with nothing in it', '1.0.0.md', '---\ndate: 2026-11-01\ntitle: Trống\n---\n'],
  ])('refuses %s, naming the file', (_, name, body) => {
    expect(() => parseRelease(name, body)).toThrow(name);
  });
});

describe('newestFirst', () => {
  it('orders versions by number, not by text', () => {
    const at = (version: string) => ({ version, date: '2026-01-01', title: 't', added: [], fixed: [] });
    expect(newestFirst([at('1.2.0'), at('1.10.0'), at('1.9.3')]).map(({ version }) => version)).toEqual([
      '1.10.0',
      '1.9.3',
      '1.2.0',
    ]);
  });
});
