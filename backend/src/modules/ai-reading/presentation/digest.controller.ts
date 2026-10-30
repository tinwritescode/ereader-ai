import { Body, Controller, Param, Post, Query } from '@nestjs/common';
import { BookService } from '../../books/application/book.service';
import { parseUserId } from '../../books/presentation/books.controller';
import { DigestRequestSchema } from '../domain/digest';
import { DigestService } from '../application/digest.service';

@Controller('chapters')
export class DigestController {
  constructor(
    private readonly digest: DigestService,
    private readonly books: BookService,
  ) {}

  @Post(':id/digest')
  create(@Param('id') chapterId: string, @Query() query: unknown, @Body() body: unknown) {
    const request = DigestRequestSchema.parse({ ...body as object, chapterId });
    const chapter = this.books.chapter(parseUserId(query), chapterId);
    return this.digest.create(request, chapter.blocks.map((block) => block.text));
  }
}
