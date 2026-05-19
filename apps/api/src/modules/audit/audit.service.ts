import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditSearchDto } from './dto/audit-search.dto';

const GENESIS_HASH = '0'.repeat(64);

// Shared 32-bit key for pg_advisory_xact_lock. Any constant value works as long
// as every replica uses the same one; choosing a memorable hex marker helps
// when an operator inspects pg_locks.
const AUDIT_LOCK_KEY = 0x6354_4d50;

export interface AuditLogEntry {
  eventType: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  actorVendorUserId?: string;
  actorRoleCode?: string;
  tenderId?: string;
  vendorId?: string;
  bidId?: string;
  ipAddress?: string;
  userAgent?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  riskLevel?: AuditRiskLevel;
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if ((this.config.get<string>('audit.verifyOnStart') ?? 'true').toLowerCase() === 'false') {
      this.logger.log('Audit chain verifier disabled by audit.verifyOnStart=false');
      return;
    }
    const limit = Number(this.config.get<string>('audit.verifyLimit') ?? '1000');
    try {
      const result = await this.verifyChain(limit);
      if (result.ok) {
        this.logger.log(
          `Audit chain verified — ${result.checked} rows OK${result.range ? ` (id ${result.range[0]}..${result.range[1]})` : ''}`,
        );
      } else {
        this.logger.error(
          `AUDIT CHAIN BREAK at row id=${result.brokenAtId} — expected prev=${result.expectedPrev}, got=${result.actualPrev}`,
        );
        await this.recordSecurityAlert(result);
      }
    } catch (err) {
      this.logger.error(`Audit chain verifier failed to run: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Recompute hash chain over the last N rows and confirm each row's
   * prev_hash_chain_value matches the previous row's hash_chain_value AND
   * each row's hash_chain_value matches SHA-256(prev || canonical(payload)).
   * Cheap O(N) scan; default 1000 rows on boot.
   */
  async verifyChain(limit = 1000): Promise<
    | { ok: true; checked: number; range?: [bigint, bigint] }
    | { ok: false; checked: number; brokenAtId: string; expectedPrev: string; actualPrev: string }
  > {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { id: 'desc' },
      take: limit,
    });
    if (rows.length === 0) return { ok: true, checked: 0 };
    rows.reverse();

    let expectedPrev: string = rows[0].prevHashChainValue ?? GENESIS_HASH;
    for (const row of rows) {
      const actualPrev = row.prevHashChainValue ?? GENESIS_HASH;
      if (actualPrev !== expectedPrev) {
        return {
          ok: false,
          checked: rows.indexOf(row),
          brokenAtId: row.id.toString(),
          expectedPrev,
          actualPrev,
        };
      }
      const payload = {
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId ?? undefined,
        actorUserId: row.actorUserId ?? undefined,
        actorVendorUserId: row.actorVendorUserId ?? undefined,
        actorRoleCode: row.actorRoleCode ?? undefined,
        tenderId: row.tenderId ?? undefined,
        vendorId: row.vendorId ?? undefined,
        bidId: row.bidId ?? undefined,
        ipAddress: row.ipAddress ?? undefined,
        userAgent: row.userAgent ?? undefined,
        beforeValue: row.beforeValue ?? null,
        afterValue: row.afterValue ?? null,
        reason: row.reason ?? undefined,
        metadata: row.metadata ?? null,
        riskLevel: row.riskLevel,
      };
      const recomputed = createHash('sha256')
        .update(actualPrev + canonicalize(payload))
        .digest('hex');
      if (recomputed !== row.hashChainValue) {
        return {
          ok: false,
          checked: rows.indexOf(row),
          brokenAtId: row.id.toString(),
          expectedPrev,
          actualPrev: row.hashChainValue,
        };
      }
      expectedPrev = row.hashChainValue;
    }

    return {
      ok: true,
      checked: rows.length,
      range: [rows[0].id, rows[rows.length - 1].id],
    };
  }

  private async recordSecurityAlert(result: {
    brokenAtId: string;
    expectedPrev: string;
    actualPrev: string;
  }) {
    try {
      await this.prisma.securityAlert.create({
        data: {
          alertType: 'AUDIT_CHAIN_BREAK',
          severity: AuditRiskLevel.CRITICAL,
          message: `Audit hash chain integrity broken at audit_logs.id=${result.brokenAtId}. Expected prev=${result.expectedPrev}, actual=${result.actualPrev}.`,
          metadata: result as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record AUDIT_CHAIN_BREAK security alert: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Append a hash-chained audit log entry. The Prisma transaction wraps a
   * Postgres advisory lock acquired on a constant key — every replica's audit
   * write serializes through this lock so two concurrent calls cannot read the
   * same previous-hash and produce a chain fork. The lock is released
   * automatically when the transaction commits or rolls back. DB triggers
   * still reject UPDATE / DELETE on audit_logs.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // 0x6354_4d50 = 'cTMP' — arbitrary 32-bit key shared by every replica.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

      const last = await tx.auditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { hashChainValue: true },
      });
      const prevHash = last?.hashChainValue ?? GENESIS_HASH;

      const payload = {
        eventType: entry.eventType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorUserId: entry.actorUserId,
        actorVendorUserId: entry.actorVendorUserId,
        actorRoleCode: entry.actorRoleCode,
        tenderId: entry.tenderId,
        vendorId: entry.vendorId,
        bidId: entry.bidId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        beforeValue: entry.beforeValue ?? null,
        afterValue: entry.afterValue ?? null,
        reason: entry.reason,
        metadata: entry.metadata ?? null,
        riskLevel: entry.riskLevel ?? AuditRiskLevel.LOW,
      };

      const hashChainValue = createHash('sha256')
        .update(prevHash + canonicalize(payload))
        .digest('hex');

      await tx.auditLog.create({
        data: {
          ...payload,
          beforeValue: payload.beforeValue as Prisma.InputJsonValue,
          afterValue: payload.afterValue as Prisma.InputJsonValue,
          metadata: payload.metadata as Prisma.InputJsonValue,
          prevHashChainValue: prevHash === GENESIS_HASH ? null : prevHash,
          hashChainValue,
        },
      });
    });
  }

  async search(query: AuditSearchDto) {
    const page = (query as any).page ?? 1;
    const pageSize = (query as any).pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {};
    if ((query as any).eventType) where.eventType = (query as any).eventType;
    if ((query as any).entityType) where.entityType = (query as any).entityType;

    const skip = (page - 1) * pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map(this.serialize),
    };
  }

  async getTenderLogs(tenderId: string, query: AuditSearchDto) {
    const page = (query as any).page ?? 1;
    const pageSize = (query as any).pageSize ?? 50;
    const skip = (page - 1) * pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where: { tenderId } }),
      this.prisma.auditLog.findMany({
        where: { tenderId },
        skip,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: items.map(this.serialize),
    };
  }

  private serialize = (log: any) => ({
    id: String(log.id),
    eventType: log.eventType,
    actorUserId: log.actorUserId ?? undefined,
    actorVendorUserId: log.actorVendorUserId ?? undefined,
    actorRole: log.actorRoleCode ?? undefined,
    entityType: log.entityType,
    entityId: log.entityId ?? undefined,
    tenderId: log.tenderId ?? undefined,
    vendorId: log.vendorId ?? undefined,
    bidId: log.bidId ?? undefined,
    ipAddress: log.ipAddress ?? undefined,
    userAgent: log.userAgent ?? undefined,
    eventTime: log.eventTime.toISOString(),
    beforeValue: log.beforeValue ?? undefined,
    afterValue: log.afterValue ?? undefined,
    reason: log.reason ?? undefined,
    metadata: log.metadata ?? undefined,
    riskLevel: log.riskLevel,
    hashChainValue: log.hashChainValue,
  });

  async listSecurityAlerts(query: {
    page?: number;
    pageSize?: number;
    unacknowledgedOnly?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 50, 200));
    const skip = (page - 1) * pageSize;
    const where = query.unacknowledgedOnly ? { acknowledgedAt: null } : {};

    const [total, items] = await this.prisma.$transaction([
      this.prisma.securityAlert.count({ where }),
      this.prisma.securityAlert.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map(a => ({
        id: String(a.id),
        alertType: a.alertType,
        severity: a.severity,
        message: a.message,
        metadata: a.metadata ?? undefined,
        sourceIp: a.sourceIp ?? undefined,
        targetEntityType: a.targetEntityType ?? undefined,
        targetEntityId: a.targetEntityId ?? undefined,
        acknowledgedBy: a.acknowledgedBy ?? undefined,
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? undefined,
        acknowledged: a.acknowledgedAt !== null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async acknowledgeAlert(id: bigint, acknowledgedBy: string): Promise<void> {
    try {
      await this.prisma.securityAlert.update({
        where: { id },
        data: { acknowledgedBy, acknowledgedAt: new Date() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException(`Security alert ${id} not found`);
      }
      throw err;
    }
  }
}
