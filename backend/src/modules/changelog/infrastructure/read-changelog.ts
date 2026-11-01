import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Release, parseRelease } from '../domain/release';

/** backend/changelog in the repo, /app/changelog in the image: one Markdown file per version. */
export const CHANGELOG_DIR = join(process.cwd(), 'changelog');

/** Every release in [dir]; throws on one written wrong, so a bad note stops a deploy rather than a reader. */
export function readChangelog(dir: string): Release[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => parseRelease(name, readFileSync(join(dir, name), 'utf8')));
}
