import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AccountService } from '../../accounts/application/account.service';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { BookService } from '../../books/application/book.service';
import { DigestRequestSchema } from '../domain/digest';
import { DigestService } from '../application/digest.service';

@Controller('chapters')
@UseGuards(AuthGuard)
export class DigestController {
  constructor(
    private readonly digest: DigestService,
    private readonly books: BookService,
    private readonly accounts: AccountService,
  ) {}

  @Post(':id/digest')
  async create(@Param('id') chapterId: string, @CurrentAccount() account: Account, @Body() body: unknown) {
    const request = DigestRequestSchema.parse({ ...body as object, chapterId });
    const chapter = await this.books.chapter(account.id, chapterId);
    const paragraphs = chapter.blocks.map((block) => block.text);
    return this.digest.create(request, paragraphs, this.accounts.charge(account, 'digests', 1));
  }
}
