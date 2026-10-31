import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { ChapterVoiceService } from '../application/chapter-voice.service';
import { ChapterVoiceRequestSchema, ChapterVoiceTask } from '../domain/chapter-voice';

@Controller('speech/tasks')
@UseGuards(AuthGuard)
export class ChapterVoiceController {
  constructor(private readonly chapterVoices: ChapterVoiceService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentAccount() account: Account) {
    const parsed = ChapterVoiceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'TASK_INVALID' });
    return toResponse(await this.chapterVoices.create(account, parsed.data), null);
  }

  @Get()
  async list(@CurrentAccount() account: Account) {
    const tasks = await this.chapterVoices.list(account);
    return { tasks: tasks.map((task) => toResponse(task, this.chapterVoices.position(task))) };
  }

  @Delete(':id')
  @HttpCode(204)
  cancel(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.chapterVoices.cancel(account, id);
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string, @CurrentAccount() account: Account) {
    return toResponse(await this.chapterVoices.resume(account, id), null);
  }
}

function toResponse(task: ChapterVoiceTask, position: number | null) {
  const { id, bookId, chapterId, bookTitle, chapterLabel, minutes, voiceCode, voiceName, state, done, createdAt, finishedAt } = task;
  return {
    id,
    kind: 'chapterVoice',
    bookId,
    chapterId,
    bookTitle,
    chapterLabel,
    minutes,
    voiceCode,
    voiceName,
    state: state.kind,
    code: state.kind === 'stopped' ? state.code : null,
    done,
    total: task.sentences.length,
    position,
    createdAt,
    finishedAt,
  };
}
