import { z } from 'zod';
import { DEFAULT_WORDS_PER_MINUTE } from '../../../shared/reading-time';

export const DigestRequestSchema = z.object({
  chapterId: z.string().min(1),
  targetLang: z.string().min(2).max(10),
  // The app offers lengths relative to each chapter (about 50% and 25%), so any whole minute count is valid.
  targetMinutes: z.number().int().min(1).max(240),
  wpm: z.number().int().min(80).max(500).default(DEFAULT_WORDS_PER_MINUTE),
});

export type DigestRequest = z.infer<typeof DigestRequestSchema>;

export type DigestResult = {
  cacheKey: string;
  targetWords: number;
  content: string;
  cached: boolean;
};
