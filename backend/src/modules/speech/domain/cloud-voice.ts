import { z } from 'zod';

/** A voice that a speech provider renders on its servers, as the app shows it. */
export type CloudVoice = {
  code: string;
  name: string;
  gender: 'male' | 'female';
};

/** One sentence at a time: the app reads ahead by sentences, and a cap keeps one call from spending a chapter's credits. */
export const SpeechRequestSchema = z.object({
  text: z.string().trim().min(1).max(300),
  voiceCode: z.string().min(1),
});

// About what a Vietnamese voice reads in a second; plans count minutes before the audio exists.
const SPOKEN_CHARS_PER_SECOND = 15;

export function spokenSeconds(text: string): number {
  return Math.ceil(text.length / SPOKEN_CHARS_PER_SECOND);
}

export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
