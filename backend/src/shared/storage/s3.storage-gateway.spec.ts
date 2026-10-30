import { randomUUID } from 'node:crypto';
import { S3StorageGateway } from './s3.storage-gateway';

// Runs against an S3-compatible server, e.g. LocalStack: TEST_S3_ENDPOINT=http://localhost:4566.
const endpoint = process.env.TEST_S3_ENDPOINT;

(endpoint ? describe : describe.skip)('S3StorageGateway', () => {
  const storage = () =>
    new S3StorageGateway({
      endpoint: endpoint!,
      region: 'us-east-1',
      bucket: `ereader-test-${randomUUID()}`,
      accessKeyId: 'test',
      secretAccessKey: 'test',
      urlStyle: 'path',
      createBucket: true,
    });

  it('reads back what it stored, and nothing for a key it never stored', async () => {
    const gateway = storage();
    const bytes = Buffer.from('RIFF audio');

    await gateway.put({ key: 'speech/voice/abc.wav', bytes });
    await gateway.put({ key: 'speech/voice/abc.wav', bytes });

    await expect(gateway.get('speech/voice/abc.wav')).resolves.toEqual(bytes);
    await expect(gateway.get('speech/voice/missing.wav')).resolves.toBeNull();
  });
});
