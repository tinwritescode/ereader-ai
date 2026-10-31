import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UsageCharge } from '../../../shared/usage-charge';
import { STORAGE_GATEWAY, StorageGateway } from '../../../shared/storage/storage-gateway';
import { SPEECH_CLIP_INDEX, SpeechClip, SpeechClipIndex } from './speech-clip-index';
import { TtsGateway } from './tts-gateway';

// Part of every clip key: bump it when the audio format changes, so old clips are not served.
const CLIP_FORMAT = 'wav-24k-mono-v1';

/** Reads a sentence aloud once per voice; later requests are served from storage. */
@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    @Inject(STORAGE_GATEWAY) private readonly storage: StorageGateway,
    @Inject(SPEECH_CLIP_INDEX) private readonly index: SpeechClipIndex,
  ) {}

  async speak(tts: TtsGateway, text: string, voiceCode: string, charge: UsageCharge): Promise<Buffer> {
    const key = createHash('sha256').update(`${CLIP_FORMAT}\n${voiceCode}\n${text}`).digest('hex');
    const kept = await this.kept(key);
    if (kept) return kept;

    await charge.take();
    const audio = await tts.speak(text, voiceCode).catch(async (error: unknown) => {
      await charge.giveBack();
      throw error;
    });
    await this.keep({ key, voiceCode, text, objectKey: `speech/${voiceCode}/${key}.wav`, bytes: audio.length }, audio);
    return audio;
  }

  /** Reads [sentences] a few at a time until [stopped]; rejects with the first failure, and starts no more after it. */
  async speakAll({ tts, sentences, voiceCode, charge, atOnce, stopped, onSpoken }: {
    tts: TtsGateway;
    sentences: readonly string[];
    voiceCode: string;
    charge: (text: string) => UsageCharge;
    atOnce: number;
    stopped: () => boolean;
    onSpoken: () => Promise<void>;
  }): Promise<void> {
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (!failed && !stopped() && next < sentences.length) {
        const text = sentences[next];
        next += 1;
        try {
          await this.speak(tts, text, voiceCode, charge(text));
          await onSpoken();
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };
    const results = await Promise.allSettled(Array.from({ length: atOnce }, worker));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }

  // Storage only saves credits: when it fails, reading goes on through the voice service.
  private async kept(key: string): Promise<Buffer | null> {
    try {
      const objectKey = await this.index.find(key);
      return objectKey ? await this.storage.get(objectKey) : null;
    } catch {
      this.logger.warn('Stored speech could not be read');
      return null;
    }
  }

  private async keep(clip: SpeechClip, audio: Buffer): Promise<void> {
    try {
      // The object first, so the index never points at audio that is not there.
      await this.storage.put({ key: clip.objectKey, bytes: audio });
      await this.index.add(clip);
    } catch {
      this.logger.warn('Speech could not be stored');
    }
  }
}
