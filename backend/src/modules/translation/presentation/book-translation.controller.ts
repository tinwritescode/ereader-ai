import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { BookTranslationService } from '../application/book-translation.service';
import { BookTranslationRequestSchema, BookTranslationTask, percentDone, PutFirstRequestSchema } from '../domain/book-translation';

@Controller()
@UseGuards(AuthGuard)
export class BookTranslationController {
  constructor(private readonly translations: BookTranslationService) {}

  @Post('books/:id/translation')
  async create(@Param('id') bookId: string, @Body() body: unknown, @CurrentAccount() account: Account) {
    const parsed = BookTranslationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException({ code: 'TASK_INVALID' });
    const task = await this.translations.create(account, bookId, parsed.data.startChapterId);
    return toResponse(task, this.translations.position(task));
  }

  @Get('books/:id/translation')
  async ofBook(@Param('id') bookId: string, @CurrentAccount() account: Account) {
    const { translated, task } = await this.translations.ofBook(account, bookId);
    return { translated, task: task && toResponse(task, this.translations.position(task)) };
  }

  @Get('books/:id/translation/epub')
  async epub(@Param('id') bookId: string, @CurrentAccount() account: Account, @Res({ passthrough: true }) response: Response) {
    const { title, bytes } = await this.translations.epub(account, bookId);
    response.attachment(`${title} (tiếng Việt).epub`).type('application/epub+zip');
    return new StreamableFile(bytes);
  }

  @Get('chapters/:id/translation')
  async chapter(@Param('id') chapterId: string, @CurrentAccount() account: Account) {
    return { chapterId, blocks: await this.translations.chapter(account, chapterId) };
  }

  @Get('translations/tasks')
  async list(@CurrentAccount() account: Account) {
    const tasks = await this.translations.list(account);
    return { tasks: tasks.map((task) => toResponse(task, this.translations.position(task))) };
  }

  @Delete('translations/tasks/:id')
  @HttpCode(204)
  cancel(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.translations.cancel(account, id);
  }

  @Post('translations/tasks/:id/resume')
  async resume(@Param('id') id: string, @CurrentAccount() account: Account) {
    const task = await this.translations.resume(account, id);
    return toResponse(task, this.translations.position(task));
  }

  @Post('translations/tasks/:id/first')
  async putFirst(@Param('id') id: string, @Body() body: unknown, @CurrentAccount() account: Account) {
    const parsed = PutFirstRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'TASK_INVALID' });
    const task = await this.translations.putFirst(account, id, parsed.data.chapterId);
    return toResponse(task, this.translations.position(task));
  }
}

function toResponse(task: BookTranslationTask, position: number | null) {
  const { id, bookId, bookTitle, state, remaining, translated, current, createdAt, finishedAt } = task;
  const [head] = remaining;
  return {
    id,
    kind: 'bookTranslation',
    bookId,
    bookTitle,
    state: state.kind,
    code: state.kind === 'stopped' ? state.code : null,
    done: translated.length,
    total: translated.length + remaining.length,
    percent: percentDone(task),
    position,
    /** The chapter being translated and how far along it is. */
    current: head && current ? { chapterId: head.chapterId, percent: Math.round((100 * current.done) / current.parts) } : null,
    /** Chapters still to come, in order. */
    waiting: remaining.map(({ chapterId }) => chapterId),
    createdAt,
    finishedAt,
  };
}
