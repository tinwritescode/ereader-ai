import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHANGELOG_DIR, readChangelog } from './read-changelog';

describe('readChangelog', () => {
  it('reads every release written in the changelog folder', () => {
    const releases = readChangelog(CHANGELOG_DIR);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.map(({ version }) => version)).toContain('1.0.0');
  });

  it('refuses to start on a release written wrong, naming the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
    writeFileSync(join(dir, '2.0.0.md'), '## Mới\n- Không có ngày.\n');
    expect(() => readChangelog(dir)).toThrow('2.0.0.md');
  });

  it('skips what is not Markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
    writeFileSync(join(dir, '.DS_Store'), '');
    expect(readChangelog(dir)).toEqual([]);
  });
});
