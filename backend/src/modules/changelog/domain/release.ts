import { z } from 'zod';

/** A run of a note's text; marked runs are written in bold and shown under the marker. */
export type Segment = { text: string; marked: boolean };
/** One line of a release's notes. */
export type Note = Segment[];

/** What one version of the app changed, as written in changelog/<version>.md. */
export type Release = {
  version: string;
  date: string;
  title: string;
  added: Note[];
  fixed: Note[];
};

const FILE_NAME = /^(\d+)\.(\d+)\.(\d+)\.md$/;
const FRONT_MATTER = /^---\n[\s\S]*?\n---\n?/;
const SECTIONS = new Map<string, 'added' | 'fixed'>([
  ['Mới', 'added'],
  ['Sửa', 'fixed'],
]);

const FrontMatterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be written as YYYY-MM-DD'),
  title: z.string().min(1),
});

type Fail = (why: string) => never;

/** Reads one changelog file; throws, naming the file, when it is not written as the format asks. */
export function parseRelease(fileName: string, text: string): Release {
  const fail: Fail = (why) => {
    throw new Error(`changelog/${fileName}: ${why}`);
  };
  if (!FILE_NAME.test(fileName)) fail('the file name must be the version, such as 1.3.0.md');
  const body = text.replace(/\r\n/g, '\n');
  const head = FRONT_MATTER.exec(body) ?? fail('it must start with --- date and title ---');
  const { added, fixed } = readNotes(body.slice(head[0].length).split('\n'), fail);
  if (added.length + fixed.length === 0) fail('it has no notes');
  return { version: fileName.replace(/\.md$/, ''), ...readFrontMatter(head[0], fail), added, fixed };
}

function readFrontMatter(text: string, fail: Fail): { date: string; title: string } {
  const fields = Object.fromEntries(
    text.split('\n').flatMap((line) => {
      const field = /^(\w+):(.*)$/.exec(line);
      return field ? [[field[1], field[2].trim()]] : [];
    }),
  );
  const parsed = FrontMatterSchema.safeParse(fields);
  return parsed.success
    ? parsed.data
    : fail(parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; '));
}

/** Notes under ## Mới and ## Sửa; an indented line goes on with the note above it. */
function readNotes(lines: readonly string[], fail: Fail): Pick<Release, 'added' | 'fixed'> {
  const notes: Record<'added' | 'fixed', string[]> = { added: [], fixed: [] };
  let open: string[] | null = null;
  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      open = notes[SECTIONS.get(heading[1]) ?? fail(`unknown heading "${heading[1]}", use Mới or Sửa`)];
    } else if (line.startsWith('- ')) {
      (open ?? fail('a note must come under ## Mới or ## Sửa')).push(line.slice(2).trim());
    } else if (line.trim()) {
      const list = open?.length ? open : fail(`unexpected line "${line.trim()}"`);
      list[list.length - 1] += ` ${line.trim()}`;
    }
  }
  return { added: notes.added.map(segments), fixed: notes.fixed.map(segments) };
}

/** **bold** runs become marked segments. */
function segments(note: string): Note {
  return note
    .split(/(\*\*[^*]+\*\*)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**') ? { text: part.slice(2, -2), marked: true } : { text: part, marked: false },
    );
}

export function newestFirst(releases: readonly Release[]): Release[] {
  return [...releases].sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
}
