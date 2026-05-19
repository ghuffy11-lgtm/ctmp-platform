import { registerAs } from '@nestjs/config';
import { resolve } from 'path';

export default registerAs('reports', () => ({
  storagePath: process.env.REPORT_STORAGE_PATH ?? resolve(process.cwd(), 'data', 'reports'),
  workerEnabled: (process.env.REPORT_WORKER_ENABLED ?? 'true').toLowerCase() !== 'false',
  workerConcurrency: parseInt(process.env.REPORT_WORKER_CONCURRENCY ?? '2', 10),
  redisHost: process.env.REDIS_HOST ?? 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: parseInt(process.env.REDIS_DB ?? '0', 10),
  queueName: process.env.REPORT_QUEUE_NAME ?? 'ctmp-report-exports',
}));
