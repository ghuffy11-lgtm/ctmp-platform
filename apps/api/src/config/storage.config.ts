import { registerAs } from '@nestjs/config';
import { resolve } from 'path';

export default registerAs('storage', () => ({
  driver: process.env.STORAGE_DRIVER ?? 'local',
  localRoot: process.env.STORAGE_LOCAL_ROOT ?? resolve(process.cwd(), 'data'),
  s3Endpoint: process.env.STORAGE_S3_ENDPOINT ?? '',
  s3Region: process.env.STORAGE_S3_REGION ?? 'us-east-1',
  s3AccessKey: process.env.STORAGE_S3_ACCESS_KEY ?? '',
  s3SecretKey: process.env.STORAGE_S3_SECRET_KEY ?? '',
  s3BucketPrefix: process.env.STORAGE_S3_BUCKET_PREFIX ?? 'ctmp',
  s3ForcePathStyle: (process.env.STORAGE_S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
  s3AutoCreateBuckets: (process.env.STORAGE_S3_AUTO_CREATE_BUCKETS ?? 'false').toLowerCase() === 'true',
}));
