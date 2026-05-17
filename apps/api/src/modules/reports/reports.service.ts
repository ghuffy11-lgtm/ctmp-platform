import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExportReportDto } from './dto/export-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async listReports() {
    // TODO: return list of available report codes + descriptions
    throw new Error('Not implemented');
  }

  async exportReport(reportCode: string, dto: ExportReportDto) {
    // TODO: enqueue async job, return jobId + status URL
    throw new Error('Not implemented');
  }

  async getJob(jobId: string) {
    // TODO: return job status (pending/running/complete/failed) + download URL if complete
    throw new Error('Not implemented');
  }

  async download(jobId: string) {
    // TODO: check job complete, stream file, audit log download
    throw new Error('Not implemented');
  }
}
