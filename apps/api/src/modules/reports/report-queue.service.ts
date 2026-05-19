import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, ConnectionOptions, Job } from 'bullmq';
import { ReportExportJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ReportRendererService } from './report-renderer.service';
import { ReportStorageService } from './report-storage.service';

interface ReportJobPayload {
  jobId: string;
}

@Injectable()
export class ReportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportQueueService.name);
  private queue?: Queue<ReportJobPayload>;
  private worker?: Worker<ReportJobPayload>;
  private connection!: ConnectionOptions;
  private queueName!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly renderer: ReportRendererService,
    private readonly storage: ReportStorageService,
  ) {}

  onModuleInit() {
    this.queueName = this.config.get<string>('reports.queueName') ?? 'ctmp-report-exports';
    this.connection = {
      host: this.config.get<string>('reports.redisHost') ?? 'localhost',
      port: this.config.get<number>('reports.redisPort') ?? 6379,
      password: this.config.get<string>('reports.redisPassword') || undefined,
      db: this.config.get<number>('reports.redisDb') ?? 0,
    };

    this.queue = new Queue<ReportJobPayload>(this.queueName, { connection: this.connection });

    const enabled = this.config.get<boolean>('reports.workerEnabled') !== false;
    if (!enabled) {
      this.logger.warn('Report worker disabled by REPORT_WORKER_ENABLED=false');
      return;
    }

    const concurrency = this.config.get<number>('reports.workerConcurrency') ?? 2;
    this.worker = new Worker<ReportJobPayload>(
      this.queueName,
      async (job: Job<ReportJobPayload>) => this.process(job.data.jobId),
      { connection: this.connection, concurrency },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Report job ${job?.data.jobId} failed: ${err.message}`);
    });
    this.worker.on('completed', job => {
      this.logger.log(`Report job ${job.data.jobId} completed`);
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.worker?.close(),
      this.queue?.close(),
    ]);
  }

  /**
   * Producer — called by reports.service.exportReport after the DB row is created.
   * Idempotent on jobId because BullMQ rejects duplicates.
   */
  async enqueue(jobId: string): Promise<void> {
    if (!this.queue) throw new Error('Report queue not initialized');
    await this.queue.add('export', { jobId }, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  }

  // -------------------------------------------------------------------------

  private async process(jobId: string): Promise<void> {
    const dbJob = await this.prisma.reportExportJob.findUnique({ where: { id: jobId } });
    if (!dbJob) {
      this.logger.warn(`Report job ${jobId} not found in DB; skipping`);
      return;
    }
    if (dbJob.status === ReportExportJobStatus.COMPLETED) {
      this.logger.warn(`Report job ${jobId} already COMPLETED; skipping`);
      return;
    }

    await this.prisma.reportExportJob.update({
      where: { id: jobId },
      data: { status: ReportExportJobStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const buffer = await this.renderer.render({
        reportCode: dbJob.reportCode,
        reportName: dbJob.reportName ?? dbJob.reportCode,
        format: dbJob.format,
        filters: (dbJob.filters as Record<string, unknown>) ?? undefined,
        requestedBy: dbJob.requestedBy,
      });
      const { storageKey, fileSize } = await this.storage.write(jobId, dbJob.format, buffer);
      await this.prisma.reportExportJob.update({
        where: { id: jobId },
        data: {
          status: ReportExportJobStatus.COMPLETED,
          completedAt: new Date(),
          storageKey,
          fileSize: BigInt(fileSize),
        },
      });
    } catch (err) {
      this.logger.error(`Render failed for job ${jobId}`, err as Error);
      await this.prisma.reportExportJob.update({
        where: { id: jobId },
        data: {
          status: ReportExportJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}
