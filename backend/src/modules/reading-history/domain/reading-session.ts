import { z } from 'zod';

/** The versions of a chapter the app offers, as the web names them. */
export const READING_LENGTHS = ['original', 'vietnamese', 'shortened', 'keyPoints'] as const;

export const HISTORY_MODES = ['read', 'listen'] as const;
export type HistoryMode = (typeof HISTORY_MODES)[number];

const Report = z.object({
  bookId: z.string().min(1).max(200),
  chapterId: z.string().min(1).max(200),
  /** The chapter's name when it was read, e.g. "Chương Hai". */
  chapterLabel: z.string().max(300),
  length: z.enum(READING_LENGTHS),
  minutes: z.number().int().min(0).max(10_000),
  /** The block reading stopped at, and the character inside it the voice reached. */
  block: z.number().int().min(0),
  offset: z.number().int().min(0),
  /** The words it stopped on; null when there were none to show. */
  quote: z.string().max(300).nullable(),
  /** Share of the chapter behind the reader, from 0 to 1. */
  progress: z.number().min(0).max(1),
  done: z.boolean(),
});

/** What the app tells about one sitting with a chapter; a listen always names its voice. */
export const SessionReportSchema = z.discriminatedUnion('mode', [
  Report.extend({ mode: z.literal('read') }),
  Report.extend({ mode: z.literal('listen'), voice: z.string().min(1).max(100) }),
]);
export type SessionReport = z.infer<typeof SessionReportSchema>;

export const SessionIdSchema = z.string().uuid();

export const HistoryFilterSchema = z.object({
  mode: z.enum(HISTORY_MODES).optional(),
  bookId: z.string().min(1).max(200).optional(),
});
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

export const RecordingRequestSchema = z.object({ on: z.boolean() });

/** One sitting: opened at `startedAt`, last heard from at `endedAt`. */
export type ReadingSession = SessionReport & { id: string; accountId: string; startedAt: Date; endedAt: Date };

/** The newest sessions shown; older ones stay kept but out of the list. */
export const HISTORY_PAGE = 200;

/** A later report moves the session on, but a finished chapter stays finished. */
export function reportedAgain({ session, report, at }: { session: ReadingSession; report: SessionReport; at: Date }): ReadingSession {
  return { ...report, id: session.id, accountId: session.accountId, startedAt: session.startedAt, endedAt: at, done: session.done || report.done };
}

export function matches(session: ReadingSession, { mode, bookId }: HistoryFilter): boolean {
  return (mode === undefined || session.mode === mode) && (bookId === undefined || session.bookId === bookId);
}
