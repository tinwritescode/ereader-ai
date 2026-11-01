import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { toChapterSummary } from '../../books/presentation/books.controller';
import { BookShareService } from '../application/book-share.service';
import { BookShare, CreateShareRequestSchema, OpenShareRequestSchema } from '../domain/book-share';

const toShareResponse = ({ id, createdAt, holder }: BookShare) => ({ shareId: id, createdAt, opened: holder !== null });

@Controller()
export class BookShareController {
  constructor(private readonly shares: BookShareService) {}

  @Post('books/:id/shares')
  @UseGuards(AuthGuard)
  async create(@Param('id') bookId: string, @CurrentAccount() account: Account, @Body() body: unknown) {
    const parsed = CreateShareRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'SHARE_PASSWORD_INVALID' });
    const { share, token } = await this.shares.create(account, bookId, parsed.data.password);
    return { ...toShareResponse(share), token };
  }

  @Get('books/:id/shares')
  @UseGuards(AuthGuard)
  async list(@Param('id') bookId: string, @CurrentAccount() account: Account) {
    return { shares: (await this.shares.list(account, bookId)).map(toShareResponse) };
  }

  @Delete('shares/:id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  revoke(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.shares.revoke(account, id);
  }

  @Post('shared/:token/open')
  @HttpCode(204)
  open(@Param('token') token: string, @Body() body: unknown) {
    const parsed = OpenShareRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'SHARE_REQUEST_INVALID' });
    return this.shares.open({ token, ...parsed.data });
  }

  @Get('shared/:token')
  async book(@Param('token') token: string, @Headers('x-share-device') device: string | undefined) {
    const { title, author, chapters } = await this.shares.book(token, device);
    return { title, author, chapters: chapters.map(toChapterSummary) };
  }

  @Get('shared/:token/chapters/:chapterId')
  async chapter(
    @Param('token') token: string,
    @Param('chapterId') chapterId: string,
    @Headers('x-share-device') device: string | undefined,
  ) {
    const { chapter, vietnamese } = await this.shares.chapter(token, device, chapterId);
    return { chapterId, label: chapter.label, original: chapter.blocks, vietnamese };
  }
}
