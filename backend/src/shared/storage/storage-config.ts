import { z } from 'zod';
import { LocalDiskStorageGateway } from './local-disk.storage-gateway';
import { S3StorageGateway } from './s3.storage-gateway';
import { StorageGateway } from './storage-gateway';

const S3EnvSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().min(1).default('auto'),
  S3_URL_STYLE: z.enum(['path', 'virtual-host']).default('virtual-host'),
});

const DiskEnvSchema = z.object({ STORAGE_DIR: z.string().min(1).default('.data/storage') });

/** A bucket when all S3 settings are present, the local disk otherwise. */
export function storageFromEnv(env: Record<string, string | undefined>): StorageGateway {
  const s3 = S3EnvSchema.safeParse(env);
  if (s3.success) {
    const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_URL_STYLE } = s3.data;
    return new S3StorageGateway({
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      region: S3_REGION,
      urlStyle: S3_URL_STYLE,
    });
  }
  return new LocalDiskStorageGateway(DiskEnvSchema.parse(env).STORAGE_DIR);
}
