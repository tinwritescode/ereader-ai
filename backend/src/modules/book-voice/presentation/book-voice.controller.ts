import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { shareDone } from '../../../shared/tasks/chapter-line';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { BookVoiceService } from '../application/book-voice.service';
import { BookVoiceRequestSchema, BookVoiceTask } from '../domain/book-voice';

@Controller()
@UseGuards(AuthGuard)
export class BookVoiceController {
  constructor(private readonly voices: BookVoiceService) {}

  @Post('books/:id/voice')
  async create(@Param('id') bookId: string, @Body() body: unknown, @CurrentAccount() account: Account) {
    const parsed = BookVoiceRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'TASK_INVALID' });
    const task = await this.voices.create(account, bookId, parsed.data);
    return toResponse(task, this.voices.position(task));
  }

  @Get('books/:id/voice')
  async ofBook(@Param('id') bookId: string, @CurrentAccount() account: Account) {
    const { task, ...standing } = await this.voices.ofBook(account, bookId);
    return { ...standing, task: task && toResponse(task, this.voices.position(task)) };
  }

  @Get('voices/tasks')
  async list(@CurrentAccount() account: Account) {
    const tasks = await this.voices.list(account);
    return { tasks: tasks.map((task) => toResponse(task, this.voices.position(task))) };
  }

  @Delete('voices/tasks/:id')
  @HttpCode(204)
  cancel(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.voices.cancel(account, id);
  }

  @Post('voices/tasks/:id/resume')
  async resume(@Param('id') id: string, @CurrentAccount() account: Account) {
    const task = await this.voices.resume(account, id);
    return toResponse(task, this.voices.position(task));
  }
}

function toResponse(task: BookVoiceTask, position: number | null) {
  const { id, bookId, bookTitle, voiceCode, voiceName, state, remaining, voiced, current, createdAt, finishedAt } = task;
  const [head] = remaining;
  return {
    id,
    kind: 'bookVoice',
    bookId,
    bookTitle,
    voiceCode,
    voiceName,
    state: state.kind,
    code: state.kind === 'stopped' ? state.code : null,
    done: voiced.length,
    total: voiced.length + remaining.length,
    percent: shareDone({ remaining, finished: voiced, current }),
    position,
    /** The chapter being read and how far along it is. */
    current: head && current ? { chapterId: head.chapterId, percent: Math.round((100 * current.done) / current.parts) } : null,
    /** Chapters still to come, in order. */
    waiting: remaining.map(({ chapterId }) => chapterId),
    voiced: voiced.map(({ chapterId }) => chapterId),
    createdAt,
    finishedAt,
  };
}
