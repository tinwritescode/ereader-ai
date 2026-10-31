import { z } from 'zod';
import { SpeechRequestSchema } from './cloud-voice';

export const ChapterVoiceRequestSchema = z.object({
  bookId: z.string().min(1),
  chapterId: z.string().min(1),
  bookTitle: z.string().min(1),
  chapterLabel: z.string().min(1),
  /** The shortened length being prepared; null for the original chapter. */
  minutes: z.number().int().positive().nullable(),
  voiceCode: SpeechRequestSchema.shape.voiceCode,
  // Sent by the app so they match, to the letter, the sentences it asks for when listening.
  sentences: z.array(SpeechRequestSchema.shape.text).min(1).max(3_000),
});

export type ChapterVoiceRequest = z.infer<typeof ChapterVoiceRequestSchema>;

export type ChapterVoiceState =
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'stopped'; code: 'SPEECH_FAILED' | 'VBEE_LIMIT' };

/** Reads a whole chapter into stored clips ahead of listening. */
export type ChapterVoiceTask = ChapterVoiceRequest & {
  id: string;
  accountId: string;
  voiceName: string;
  state: ChapterVoiceState;
  /** Sentences ready, of [sentences]. */
  done: number;
  createdAt: Date;
  finishedAt: Date | null;
};

export function isFinished({ state }: Pick<ChapterVoiceTask, 'state'>): boolean {
  return state.kind === 'done' || state.kind === 'stopped';
}
