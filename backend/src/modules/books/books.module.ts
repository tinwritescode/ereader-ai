import { DynamicModule, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { z } from 'zod';
import { LocalDiskStorageGateway } from '../../shared/storage/local-disk.storage-gateway';
import { STORAGE_GATEWAY } from '../../shared/storage/storage-gateway';
import { BookService } from './application/book.service';
import { BooksController, ChaptersController } from './presentation/books.controller';

export type BooksModuleOptions = {
  maxUploadBytes: number;
  storageDir: string;
};

const BooksEnvSchema = z.object({
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  STORAGE_DIR: z.string().min(1).default('.data/storage'),
});

export function booksOptionsFromEnv(env: NodeJS.ProcessEnv): BooksModuleOptions {
  const { UPLOAD_MAX_BYTES, STORAGE_DIR } = BooksEnvSchema.parse(env);
  return { maxUploadBytes: UPLOAD_MAX_BYTES, storageDir: STORAGE_DIR };
}

@Module({})
export class BooksModule {
  static register({ maxUploadBytes, storageDir }: BooksModuleOptions): DynamicModule {
    return {
      module: BooksModule,
      imports: [MulterModule.register({ limits: { fileSize: maxUploadBytes, files: 1 } })],
      controllers: [BooksController, ChaptersController],
      providers: [
        BookService,
        { provide: STORAGE_GATEWAY, useValue: new LocalDiskStorageGateway(storageDir) },
      ],
      exports: [BookService],
    };
  }
}
