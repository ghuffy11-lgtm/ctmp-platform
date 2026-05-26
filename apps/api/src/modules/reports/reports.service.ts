import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, Prisma, ReportExportJobFormat, ReportExportJobStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReportQueueService } from './report-queue.service';
import { ReportStorageService } from './report-storage.service';
import { ExportReportDto } from './dto/export-report.dto';

export interface ReportDefinition {
  code: string;
  name: string;
  description?: string;
  category?: string;
  requiresCommercialExportPermission?: boolean;
}

const REPORT_CATALOG: ReportDefinition[] = [
  { code: 'tender_summary',         name: 'Tender Summary',         description: 'Active tenders, status counts, owners.', category: 'Tender' },
  { code: 'tender_lifecycle',       name: 'Tender Lifecycle',       description: 'Per-tender stage durations + workflow timings.', category: 'Tender' },
  { code: 'vendor_directory',       name: 'Vendor Directory',       description: 'Approved vendors with primary contact + activity.', category: 'Vendor' },
  { code: 'vendor_activity',        name: 'Vendor Activity',        description: 'Logins, bids, clarifications per vendor.', category: 'Vendor' },
  { code: 'bid_submissions',        name: 'Bid Submissions',        description: 'Submissions with envelope checksum verification.', category: 'Operations' },
  { code: 'technical_evaluations',  name: 'Technical Evaluations',  description: 'Per-bid technical scores + pass/fail.', category: 'Operations' },
  { code: 'commercial_comparison',  name: 'Commercial Comparison',  description: 'Ranked commercial offers.', category: 'Financial', requiresCommercialExportPermission: true },
  { code: 'award_history',          name: 'Award History',          description: 'Awarded tenders + amounts.', category: 'Financial', requiresCommercialExportPermission: true },
  { code: 'audit_trail',            name: 'Audit Trail',            description: 'Filtered audit log export.', category: 'Audit' },
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: ReportQueueService,
    private readonly storage: ReportStorageService,
  ) {}

  async listReports() {
    return { items: REPORT_CATALOG };
  }

  async exportReport(reportCode: string, dto: ExportReportDto, userId: string, perms: string[]) {
    const normalisedCode = reportCode.toLowerCase();
    const def = REPORT_CATALOG.find(r => r.code === normalisedCode);
    if (!def) throw new NotFoundException(`Unknown report code: ${reportCode}`);

    if (def.requiresCommercialExportPermission && !perms.includes('commercial:export')) {
      throw new ForbiddenException('commercial:export permission required for this report');
    }

    const format = (dto.format ?? 'XLSX').toUpperCase();
    if (format !== 'XLSX' && format !== 'PDF') {
      throw new BadRequestException('format must be XLSX or PDF');
    }

    const filters: Record<string, unknown> = {};
    if (dto.fromDate) filters.fromDate = dto.fromDate;
    if (dto.toDate) filters.toDate = dto.toDate;
    if (dto.departmentId) filters.departmentId = dto.departmentId;
    if (dto.tenderId) filters.tenderId = dto.tenderId;

    const job = await this.prisma.reportExportJob.create({
      data: {
        reportCode: def.code,
        reportName: def.name,
        requestedBy: userId,
        format: format as ReportExportJobFormat,
        status: ReportExportJobStatus.QUEUED,
        filters: filters as Prisma.InputJsonValue,
      },
    });

    try {
      await this.queue.enqueue(job.id);
    } catch (err) {
      // Roll the DB row to FAILED so the user sees the error rather than a forever-queued job.
      await this.prisma.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: ReportExportJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : 'Queue enqueue failed',
        },
      });
      throw err;
    }

    await this.audit.log({
      eventType: 'REPORT_EXPORT_ENQUEUED',
      entityType: 'ReportExportJob',
      entityId: job.id,
      actorUserId: userId,
      afterValue: { reportCode: def.code, format, filters },
      riskLevel: def.requiresCommercialExportPermission ? AuditRiskLevel.HIGH : AuditRiskLevel.LOW,
    });

    return {
      id: job.id,
      reportCode: job.reportCode,
      reportName: job.reportName,
      status: job.status,
      format: job.format,
      enqueuedAt: job.enqueuedAt.toISOString(),
    };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.reportExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    return {
      id: job.id,
      reportCode: job.reportCode,
      reportName: job.reportName ?? undefined,
      status: job.status,
      format: job.format,
      enqueuedAt: job.enqueuedAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      errorMessage: job.errorMessage ?? undefined,
      fileSize: job.fileSize ? Number(job.fileSize) : undefined,
    };
  }

  async download(jobId: string, userId: string) {
    const job = await this.prisma.reportExportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== ReportExportJobStatus.COMPLETED) {
      throw new BadRequestException(`Job is ${job.status}; only COMPLETED jobs can be downloaded`);
    }
    if (!job.storageKey) {
      throw new BadRequestException('Job has no storage key');
    }
    // Caller-scope check — actors can only download their own jobs unless reports:list_all.
    if (job.requestedBy !== userId) {
      throw new ForbiddenException('Not your report job');
    }

    const { stream, size, mimeType } = await this.storage.stream(job.storageKey);

    await this.audit.log({
      eventType: 'REPORT_DOWNLOADED',
      entityType: 'ReportExportJob',
      entityId: jobId,
      actorUserId: userId,
      afterValue: { reportCode: job.reportCode },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return {
      id: job.id,
      reportCode: job.reportCode,
      reportName: job.reportName ?? undefined,
      format: job.format,
      storageKey: job.storageKey,
      fileSize: size,
      mimeType,
      stream,
    };
  }

  async listJobs(page: number, pageSize: number, requestedBy?: string) {
    const where = requestedBy ? { requestedBy } : {};
    const skip = (page - 1) * pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.reportExportJob.count({ where }),
      this.prisma.reportExportJob.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { enqueuedAt: 'desc' },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map(j => ({
        id: j.id,
        reportCode: j.reportCode,
        reportName: j.reportName ?? undefined,
        status: j.status,
        format: j.format,
        enqueuedAt: j.enqueuedAt.toISOString(),
        completedAt: j.completedAt?.toISOString(),
        errorMessage: j.errorMessage ?? undefined,
        fileSize: j.fileSize ? Number(j.fileSize) : undefined,
      })),
    };
  }
}
