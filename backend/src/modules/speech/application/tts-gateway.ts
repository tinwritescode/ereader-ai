import { CloudVoice } from '../domain/cloud-voice';

export type TtsErrorKind = 'UPSTREAM_ERROR';

/** Carries only a kind: provider messages may echo the text being read. */
export class TtsError extends Error {
  constructor(readonly kind: TtsErrorKind) {
    super(kind);
    this.name = 'TtsError';
  }
}

export const TTS_GATEWAY = Symbol('TTS_GATEWAY');

/** Application code depends on this seam, never on a provider's API. */
export interface TtsGateway {
  voices(): Promise<CloudVoice[]>;
  /** A mono 16-bit WAV at 24 kHz, the rate the app plays. */
  speak(text: string, voiceCode: string): Promise<Buffer>;
}
