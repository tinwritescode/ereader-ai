import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { z } from 'zod';
import { BookService, BookSummary } from '../application/book.service';
import { BookImportRejection, ChapterRecord } from '../domain/book';

const UserScopeSchema = z.object({ userId: z.string().min(1) });

/** Until auth lands, the caller names its user in the form body or query string. */
export function parseUserId(input: unknown): string {
  const parsed = UserScopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({ code: 'USER_ID_REQUIRED' });
  }
  return parsed.data.userId;
}

/** Multer enforces the size limit before the handler runs; give its error the stable code. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(HttpStatus.PAYLOAD_TOO_LARGE).json({ code: 'FILE_TOO_LARGE' });
  }
}

const rejections = {
  UNSUPPORTED_TYPE: () => new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_TYPE' }),
  EPUB_INVALID: () => new BadRequestException({ code: 'EPUB_INVALID' }),
} satisfies Record<BookImportRejection, () => Error>;

@Controller('books')
export class BooksController {
  constructor(private readonly books: BookService) {}

  @Post()
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED' });
    }
    const result = await this.books.importEpub({
      userId: parseUserId(body),
      fileName: file.originalname,
      bytes: file.buffer,
    });
    switch (result.kind) {
      case 'rejected':
        throw rejections[result.code]();
      case 'created':
        response.status(HttpStatus.ACCEPTED);
        return toBookResponse(this.books.summarize(result.book));
      case 'existing':
        response.status(HttpStatus.OK);
        return toBookResponse(this.books.summarize(result.book));
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  }

  @Get()
  list(@Query() query: unknown) {
    return this.books.list(parseUserId(query)).map(toBookResponse);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @Query('userId') userId: string) {
    return this.books.status(userId, id);
  }

  @Get(':id/chapters')
  chapters(@Param('id') id: string, @Query() query: unknown) {
    return { bookId: id, chapters: this.books.chapters(parseUserId(query), id).map(toChapterSummary) };
  }
}

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly books: BookService) {}

  @Get(':id')
  chapter(@Param('id') id: string, @Query() query: unknown) {
    const { blocks, ...chapter } = this.books.chapter(parseUserId(query), id);
    return { ...toChapterSummary(chapter), bookId: chapter.bookId, blocks };
  }
}

function toBookResponse({ id, status, title, author, language, chapterCount, minutes }: BookSummary) {
  return { bookId: id, status, title, author, language, chapterCount, minutes };
}

function toChapterSummary({ id, index, label, subtitle, wordCount, minutes }: Omit<ChapterRecord, 'blocks'>) {
  return { chapterId: id, index, label, subtitle, wordCount, minutes };
}
