import { z } from 'zod';
import { ChapterInLine } from '../../../shared/tasks/chapter-line';
import { SpeechRequestSchema } from '../../speech/domain/cloud-voice';

export const BookVoiceRequestSchema = z.object({
  voiceCode: SpeechRequestSchema.shape.voiceCode,
  /** The chapter being read, voiced first; the start of the book when absent. */
  startChapterId: z.string().min(1).nullable().default(null),
});

export type BookVoiceState =
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'stopped'; code: 'SPEECH_FAILED' | 'VBEE_LIMIT' };

/** Reads every chapter of a book into stored clips ahead of listening. */
export type BookVoiceTask = {
  id: string;
  accountId: string;
  bookId: string;
  bookTitle: string;
  voiceCode: string;
  voiceName: string;
  /** Which text is read: voices are Vietnamese, so a foreign book is read from its translation. */
  source: 'original' | 'translation';
  /** Still to read, in the order they will be done; the head is the one under way. */
  remaining: ChapterInLine[];
  /** Read by this task, in the order they were done. */
  voiced: ChapterInLine[];
  /** Sentences done of the head of [remaining], while it is being read. */
  current: { done: number; parts: number } | null;
  state: BookVoiceState;
  createdAt: Date;
  finishedAt: Date | null;
};
