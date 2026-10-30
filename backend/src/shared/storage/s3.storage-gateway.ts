import {
  CreateBucketCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageGateway } from './storage-gateway';

export type S3Options = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Railway buckets use virtual-host URLs; LocalStack on localhost needs path-style. */
  urlStyle: 'path' | 'virtual-host';
  /** For test servers that start empty; Railway buckets already exist. */
  createBucket?: boolean;
};

/** Any S3-compatible store, such as a Railway bucket. */
export class S3StorageGateway implements StorageGateway {
  private readonly client: S3Client;
  private ready: Promise<void> | null = null;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.urlStyle === 'path',
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async put({ key, bytes }: { key: string; bytes: Buffer }): Promise<void> {
    await this.bucket();
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: bytes }));
  }

  async get(key: string): Promise<Buffer | null> {
    await this.bucket();
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  private bucket(): Promise<void> {
    if (!this.options.createBucket) return Promise.resolve();
    this.ready ??= this.client
      .send(new CreateBucketCommand({ Bucket: this.options.bucket }))
      .then(() => undefined);
    return this.ready;
  }
}
