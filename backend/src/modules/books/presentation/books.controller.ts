import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Account, PLANS } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { BookSummary } from '../application/book-store';
import { BookService } from '../application/book.service';
import { BookImportRejection, ChapterRecord } from '../domain/book';

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
  BOOK_LIMIT: () => new HttpException({ code: 'BOOK_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS),
} satisfies Record<BookImportRejection, () => Error>;

@Controller('books')
@UseGuards(AuthGuard)
export class BooksController {
  constructor(private readonly books: BookService) {}

  @Post()
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAccount() account: Account,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED' });
    }
    const limits = PLANS[account.plan];
    if (file.size > limits.maxFileBytes) {
      throw new HttpException({ code: 'PLAN_FILE_TOO_LARGE' }, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const result = await this.books.importEpub({
      userId: account.id,
      fileName: file.originalname,
      bytes: file.buffer,
      maxBooks: limits.books,
    });
    switch (result.kind) {
      case 'rejected':
        throw rejections[result.code]();
      case 'created':
        response.status(HttpStatus.ACCEPTED);
        return toBookResponse(await this.books.summarize(result.book));
      case 'existing':
        response.status(HttpStatus.OK);
        return toBookResponse(await this.books.summarize(result.book));
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  }

  @Get()
  async list(@CurrentAccount() account: Account) {
    return (await this.books.list(account.id)).map(toBookResponse);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.books.status(account.id, id);
  }

  @Get(':id/chapters')
  async chapters(@Param('id') id: string, @CurrentAccount() account: Account) {
    return { bookId: id, chapters: (await this.books.chapters(account.id, id)).map(toChapterSummary) };
  }
}

@Controller('books')
export class CoversController {
  constructor(private readonly books: BookService) {}

  @Get(':id/cover')
  async cover(@Param('id') id: string, @Res() response: Response) {
    const { bytes, mediaType } = await this.books.cover(id);
    response.type(mediaType).send(bytes);
  }
}

@Controller('chapters')
@UseGuards(AuthGuard)
export class ChaptersController {
  constructor(private readonly books: BookService) {}

  @Get(':id')
  async chapter(@Param('id') id: string, @CurrentAccount() account: Account) {
    const { blocks, ...chapter } = await this.books.chapter(account.id, id);
    return { ...toChapterSummary(chapter), bookId: chapter.bookId, blocks };
  }
}

function toBookResponse({ id, status, title, author, language, cover, chapterCount, minutes }: BookSummary) {
  return { bookId: id, status, title, author, language, hasCover: cover !== null, chapterCount, minutes };
}

function toChapterSummary({ id, index, label, subtitle, kind, wordCount, minutes }: Omit<ChapterRecord, 'blocks'>) {
  return { chapterId: id, index, label, subtitle, kind, wordCount, minutes };
}
