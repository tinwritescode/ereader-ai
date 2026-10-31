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
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AccountService } from '../../accounts/application/account.service';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { SpeechService } from '../application/speech.service';
import { TTS_GATEWAY, TtsError, TtsGateway } from '../application/tts-gateway';
import { SpeechRequestSchema, spokenSeconds } from '../domain/cloud-voice';

@Controller('speech')
@UseGuards(AuthGuard)
export class SpeechController {
  constructor(
    @Optional() @Inject(TTS_GATEWAY) private readonly tts: TtsGateway | null,
    private readonly speech: SpeechService,
    private readonly accounts: AccountService,
  ) {}

  @Get('voices')
  async voices() {
    return { voices: this.tts ? await this.upstream(() => this.tts!.voices()) : [] };
  }

  @Post()
  async speak(@Body() body: unknown, @CurrentAccount() account: Account, @Res() response: Response) {
    const tts = this.tts;
    if (!tts) throw new ServiceUnavailableException({ code: 'SPEECH_UNAVAILABLE' });
    const parsed = SpeechRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'SPEECH_TEXT_INVALID' });
    const { text, voiceCode } = parsed.data;
    const voices = await this.upstream(() => tts.voices());
    if (!voices.some((voice) => voice.code === voiceCode)) {
      throw new BadRequestException({ code: 'VOICE_UNKNOWN' });
    }
    const charge = this.accounts.charge(account, 'vbeeSeconds', spokenSeconds(text));
    const audio = await this.upstream(() => this.speech.speak(tts, text, voiceCode, charge));
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
