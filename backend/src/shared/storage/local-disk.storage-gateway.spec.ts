import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorageGateway } from './local-disk.storage-gateway';

describe('LocalDiskStorageGateway', () => {
  it('reads back what it stored, and nothing for a key it never stored', async () => {
    const root = await mkdtemp(join(tmpdir(), 'storage-'));
    try {
      const gateway = new LocalDiskStorageGateway(root);
      await gateway.put({ key: 'speech/a.wav', bytes: Buffer.from('audio') });

      await expect(gateway.get('speech/a.wav')).resolves.toEqual(Buffer.from('audio'));
      await expect(gateway.get('speech/missing.wav')).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
