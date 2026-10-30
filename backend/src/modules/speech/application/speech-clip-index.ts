/** A sentence already read aloud, and where its audio is stored. */
export type SpeechClip = {
  key: string;
  voiceCode: string;
  text: string;
  objectKey: string;
  bytes: number;
};

export const SPEECH_CLIP_INDEX = Symbol('SPEECH_CLIP_INDEX');

/** Finds stored audio by clip key. Adding the same key twice keeps the first. */
export interface SpeechClipIndex {
  find(key: string): Promise<string | null>;
  add(clip: SpeechClip): Promise<void>;
}

/** For development and tests: forgotten on restart. */
export class InMemorySpeechClipIndex implements SpeechClipIndex {
  private readonly clips = new Map<string, SpeechClip>();

  async find(key: string): Promise<string | null> {
    return this.clips.get(key)?.objectKey ?? null;
  }

  async add(clip: SpeechClip): Promise<void> {
    if (!this.clips.has(clip.key)) this.clips.set(clip.key, clip);
  }
}
