import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { StorageGateway } from './storage-gateway';

/** Development adapter; replace with an S3-compatible adapter behind the same port. */
export class LocalDiskStorageGateway implements StorageGateway {
  constructor(private readonly rootDir: string) {}

  async put({ key, bytes }: { key: string; bytes: Buffer }): Promise<void> {
    const path = join(this.rootDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}
