import { DynamicModule, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { z } from 'zod';
import { STORAGE_GATEWAY, StorageGateway } from '../../shared/storage/storage-gateway';
import { BookService } from './application/book.service';
import { BooksController, ChaptersController } from './presentation/books.controller';

export type BooksModuleOptions = {
  maxUploadBytes: number;
  storage: StorageGateway;
};

const BooksEnvSchema = z.object({
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
});

export function booksOptionsFromEnv(env: NodeJS.ProcessEnv, storage: StorageGateway): BooksModuleOptions {
  return { maxUploadBytes: BooksEnvSchema.parse(env).UPLOAD_MAX_BYTES, storage };
}

@Module({})
export class BooksModule {
  static register({ maxUploadBytes, storage }: BooksModuleOptions): DynamicModule {
    return {
      module: BooksModule,
      imports: [MulterModule.register({ limits: { fileSize: maxUploadBytes, files: 1 } })],
      controllers: [BooksController, ChaptersController],
      providers: [
        BookService,
        { provide: STORAGE_GATEWAY, useValue: storage },
      ],
      exports: [BookService],
    };
  }
}
