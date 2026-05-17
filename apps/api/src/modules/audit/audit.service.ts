import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditSearchDto } from './dto/audit-search.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    action: string;
    userId?: string;
    vendorId?: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    // TODO: insert append-only record; NEVER allow update/delete per DB triggers
    throw new Error('Not implemented');
  }

  async search(query: AuditSearchDto) {
    throw new Error('Not implemented');
  }

  async getTenderLogs(tenderId: string, query: AuditSearchDto) {
    throw new Error('Not implemented');
  }
}
