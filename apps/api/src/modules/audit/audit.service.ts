import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RequestContextService } from '../../common/request-context/request-context.service';
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

// Stable canonical JSON for hashing. Must agree with Prisma's JSONB
// serialisation roundtrip — Prisma writes Date via Date.prototype.toJSON()
// (ISO-8601) and Buffer via base64, so we normalise those the same way
// BEFORE hashing. Without these branches `Object.keys(new Date()) === []`
// and we would emit '{}' at write time but read back an ISO string at
// verify time — exactly the asymmetry that produced the AUDIT_CHAIN_BREAK
// alerts of 2026-05-21. See agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md.
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
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
    private readonly requestContext: RequestContextService,
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
      } else if (result.breakKind === 'link') {
        this.logger.error(
          `AUDIT CHAIN BREAK (link) at row id=${result.brokenAtId} — predecessor hash=${result.expectedPrev}, stored prev_hash=${result.actualPrev}`,
        );
        await this.recordSecurityAlert(result);
      } else {
        this.logger.error(
          `AUDIT CHAIN BREAK (hash) at row id=${result.brokenAtId} — recomputed=${result.recomputedHash}, stored=${result.storedHash}`,
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
   *
   * On failure, distinguishes a `link` break (this row's prev_hash doesn't
   * match the predecessor's hash) from a `hash` break (this row's stored
   * hash doesn't match the SHA-256 of the canonicalised payload). Earlier
   * versions of this method conflated the two by overloading `actualPrev`
   * with `row.hashChainValue` on hash mismatches — see
   * agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md.
   */
  async verifyChain(limit = 1000): Promise<
    | { ok: true; checked: number; range?: [bigint, bigint] }
    | { ok: false; breakKind: 'link'; checked: number; brokenAtId: string; expectedPrev: string; actualPrev: string }
    | { ok: false; breakKind: 'hash'; checked: number; brokenAtId: string; storedHash: string; recomputedHash: string }
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
          breakKind: 'link',
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
          breakKind: 'hash',
          checked: rows.indexOf(row),
          brokenAtId: row.id.toString(),
          storedHash: row.hashChainValue,
          recomputedHash: recomputed,
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

  private async recordSecurityAlert(
    result:
      | { breakKind: 'link'; brokenAtId: string; expectedPrev: string; actualPrev: string }
      | { breakKind: 'hash'; brokenAtId: string; storedHash: string; recomputedHash: string },
  ) {
    const message =
      result.breakKind === 'link'
        ? `Audit hash chain integrity broken (link) at audit_logs.id=${result.brokenAtId}. Predecessor hash=${result.expectedPrev}, stored prev_hash=${result.actualPrev}.`
        : `Audit hash chain integrity broken (hash) at audit_logs.id=${result.brokenAtId}. Recomputed hash=${result.recomputedHash}, stored hash=${result.storedHash}.`;
    try {
      await this.prisma.securityAlert.create({
        data: {
          alertType: 'AUDIT_CHAIN_BREAK',
          severity: AuditRiskLevel.CRITICAL,
          message,
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
    // Fall back to the per-request AsyncLocalStorage context for IP / UA
    // when the caller didn't pass them explicitly. Background jobs and
    // scripts run outside any request scope and will see undefined here,
    // which is fine — those rows have no meaningful client IP.
    const ctx = this.requestContext.get();
    const resolvedIpAddress = entry.ipAddress ?? ctx?.ipAddress;
    const resolvedUserAgent = entry.userAgent ?? ctx?.userAgent;

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
        ipAddress: resolvedIpAddress,
        userAgent: resolvedUserAgent,
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

  // Eagerly load the actor's display name (internal users) or vendor company
  // name (vendor users) so the audit log viewer doesn't have to fall back to
  // a UUID prefix. Both relations are nullable — a row may have neither
  // actor (system-internal events) or one of the two — so they're optional
  // here and the serializer resolves the first available name.
  private static readonly ACTOR_INCLUDE = {
    actorUser: { select: { displayName: true } },
    actorVendorUser: { select: { vendor: { select: { companyName: true } } } },
  } as const;

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
        include: AuditService.ACTOR_INCLUDE,
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
        include: AuditService.ACTOR_INCLUDE,
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
    actorName:
      log.actorUser?.displayName ??
      log.actorVendorUser?.vendor?.companyName ??
      undefined,
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

  /**
   * Record a document-view event. Two writes happen in sequence and BOTH must
   * succeed before the caller is allowed to stream the file (master plan rule:
   * audit-log writes BEFORE the PDF is streamed; failing-open is forbidden):
   *
   *   1. document_view_log — queryable view-history index used by the "N views
   *      logged" badge in Phases B and C.
   *   2. audit_logs — the cryptographic hash chain entry (via this.log()).
   *
   * Vendor self-views of their own bid are intentionally NOT recorded here —
   * audit-logging is for non-owner access. Callers gate that.
   */
  async logDocumentView(input: {
    userId: string;
    bidDocumentId: string;
    tenderId?: string;
    bidId?: string;
    viewContext: string;
  }): Promise<void> {
    const ctx = this.requestContext.get();
    await this.prisma.documentViewLog.create({
      data: {
        userId: input.userId,
        bidDocumentId: input.bidDocumentId,
        tenderId: input.tenderId ?? null,
        bidId: input.bidId ?? null,
        viewContext: input.viewContext,
        ipAddress: ctx?.ipAddress ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });
    await this.log({
      eventType: 'BID_DOCUMENT_VIEWED',
      entityType: 'BidDocument',
      entityId: input.bidDocumentId,
      actorUserId: input.userId,
      tenderId: input.tenderId,
      bidId: input.bidId,
      metadata: { viewContext: input.viewContext },
      riskLevel: AuditRiskLevel.LOW,
    });
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
