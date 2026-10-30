import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { TTS_GATEWAY, TtsError, TtsGateway } from '../application/tts-gateway';
import { SpeechRequestSchema } from '../domain/cloud-voice';

@Controller('speech')
export class SpeechController {
  constructor(@Optional() @Inject(TTS_GATEWAY) private readonly tts: TtsGateway | null) {}

  @Get('voices')
  async voices() {
    return { voices: this.tts ? await this.upstream(() => this.tts!.voices()) : [] };
  }

  @Post()
  async speak(@Body() body: unknown, @Res() response: Response) {
    const tts = this.tts;
    if (!tts) throw new ServiceUnavailableException({ code: 'SPEECH_UNAVAILABLE' });
    const parsed = SpeechRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'SPEECH_TEXT_INVALID' });
    const { text, voiceCode } = parsed.data;
    const voices = await this.upstream(() => tts.voices());
    if (!voices.some((voice) => voice.code === voiceCode)) {
      throw new BadRequestException({ code: 'VOICE_UNKNOWN' });
    }
    const audio = await this.upstream(() => tts.speak(text, voiceCode));
    response.status(200).type('audio/wav').send(audio);
  }

  private async upstream<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof TtsError) throw new BadGatewayException({ code: 'SPEECH_FAILED' });
      throw error;
    }
  }
}
