import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockTx = {
  $executeRaw: jest.fn().mockResolvedValue(undefined),
  auditLog: {
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  },
};

const prismaMock = {
  $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  auditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  securityAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  },
};

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      'audit.verifyOnStart': 'false',
      'audit.verifyLimit': '10',
    };
    return cfg[key];
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GENESIS = '0'.repeat(64);

// Duplicated from audit.service.ts (not exported — intentional private detail).
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + (value as unknown[]).map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

import { createHash } from 'crypto';

function computeHash(prevHash: string, payload: Record<string, unknown>): string {
  return createHash('sha256').update(prevHash + canonicalize(payload)).digest('hex');
}

// Build a mock audit log row with a valid hash chain.
function makeAuditRow(
  id: bigint,
  prevHashChainValue: string | null,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const payload: Record<string, unknown> = {
    eventType: 'TEST_EVENT',
    entityType: 'TEST_ENTITY',
    entityId: undefined,
    actorUserId: undefined,
    actorVendorUserId: undefined,
    actorRoleCode: undefined,
    tenderId: undefined,
    vendorId: undefined,
    bidId: undefined,
    ipAddress: undefined,
    userAgent: undefined,
    beforeValue: null,
    afterValue: null,
    reason: undefined,
    metadata: null,
    riskLevel: AuditRiskLevel.LOW,
    ...overrides,
  };
  const prevHash = prevHashChainValue ?? GENESIS;
  return {
    id,
    ...payload,
    prevHashChainValue,
    hashChainValue: computeHash(prevHash, payload),
    eventTime: new Date('2026-01-01T00:00:00Z'),
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restore callback-style $transaction (clearAllMocks wipes implementations).
    prismaMock.$transaction.mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
    mockTx.$executeRaw.mockResolvedValue(undefined);
    mockTx.auditLog.findFirst.mockResolvedValue(null);
    mockTx.auditLog.create.mockResolvedValue({});
    prismaMock.securityAlert.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  // ─── listSecurityAlerts ───────────────────────────────────────────────────

  describe('listSecurityAlerts', () => {
    it('returns paginated security alert list', async () => {
      const fakeAlert = {
        id: 1n,
        alertType: 'AUDIT_CHAIN_BREAK',
        severity: AuditRiskLevel.CRITICAL,
        message: 'Chain broken at id=5',
        metadata: { brokenAtId: '5' },
        sourceIp: null,
        targetEntityType: null,
        targetEntityId: null,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      prismaMock.securityAlert.count.mockResolvedValue(1);
      prismaMock.securityAlert.findMany.mockResolvedValue([fakeAlert]);
      prismaMock.$transaction.mockImplementation(async (arr: Array<Promise<unknown>>) =>
        Promise.all(arr),
      );

      const result = await service.listSecurityAlerts({ page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: '1',
        alertType: 'AUDIT_CHAIN_BREAK',
        severity: 'CRITICAL',
        acknowledged: false,
      });
    });

    it('filters unacknowledged alerts when unacknowledgedOnly=true', async () => {
      prismaMock.securityAlert.count.mockResolvedValue(0);
      prismaMock.securityAlert.findMany.mockResolvedValue([]);
      prismaMock.$transaction.mockImplementation(async (arr: Array<Promise<unknown>>) =>
        Promise.all(arr),
      );

      await service.listSecurityAlerts({ page: 1, pageSize: 20, unacknowledgedOnly: true });

      expect(prismaMock.securityAlert.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ acknowledgedAt: null }) }),
      );
    });
  });

  // ─── acknowledgeAlert ─────────────────────────────────────────────────────

  describe('acknowledgeAlert', () => {
    it('updates acknowledgedBy and acknowledgedAt', async () => {
      prismaMock.securityAlert.update.mockResolvedValue({});

      await service.acknowledgeAlert(3n, 'user-uuid-1');

      expect(prismaMock.securityAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 3n },
          data: expect.objectContaining({
            acknowledgedBy: 'user-uuid-1',
            acknowledgedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException when alert does not exist', async () => {
      const p2025 = Object.assign(new Error('Record not found'), {
        code: 'P2025',
        name: 'PrismaClientKnownRequestError',
      });
      // Make it look like a Prisma error instance
      Object.setPrototypeOf(p2025, require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype);
      prismaMock.securityAlert.update.mockRejectedValue(p2025);

      await expect(service.acknowledgeAlert(99n, 'user-1')).rejects.toThrow('not found');
    });
  });

  // ─── verifyChain ──────────────────────────────────────────────────────────

  describe('verifyChain', () => {
    it('returns ok with 0 checked when table is empty', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      const result = await service.verifyChain();

      expect(result).toEqual({ ok: true, checked: 0 });
    });

    it('returns ok for a single genesis row', async () => {
      const row = makeAuditRow(1n, null);
      // findMany returns DESC; verifyChain reverses internally
      prismaMock.auditLog.findMany.mockResolvedValue([row]);

      const result = await service.verifyChain();

      expect(result).toEqual({ ok: true, checked: 1, range: [1n, 1n] });
    });

    it('returns ok for a valid 3-row chain', async () => {
      const row1 = makeAuditRow(1n, null);
      const row2 = makeAuditRow(2n, row1.hashChainValue);
      const row3 = makeAuditRow(3n, row2.hashChainValue);
      // DESC order from DB
      prismaMock.auditLog.findMany.mockResolvedValue([row3, row2, row1]);

      const result = await service.verifyChain();

      expect(result).toEqual({ ok: true, checked: 3, range: [1n, 3n] });
    });

    it('detects a row whose prevHashChainValue does not match predecessor', async () => {
      const row1 = makeAuditRow(1n, null);
      const row2 = makeAuditRow(2n, row1.hashChainValue);
      const row2Broken = { ...row2, prevHashChainValue: 'tampered_prev_value' };
      prismaMock.auditLog.findMany.mockResolvedValue([row2Broken, row1]);

      const result = await service.verifyChain();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.brokenAtId).toBe('2');
        expect(result.expectedPrev).toBe(row1.hashChainValue);
      }
    });

    it('detects a row whose hashChainValue has been tampered', async () => {
      const row1 = makeAuditRow(1n, null);
      const row1Tampered = { ...row1, hashChainValue: 'deadbeef'.repeat(8) };
      prismaMock.auditLog.findMany.mockResolvedValue([row1Tampered]);

      const result = await service.verifyChain();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.brokenAtId).toBe('1');
      }
    });

    it('passes limit to findMany', async () => {
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      await service.verifyChain(42);

      expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 42 }),
      );
    });
  });

  // ─── log ──────────────────────────────────────────────────────────────────

  describe('log', () => {
    it('acquires advisory lock before reading the chain', async () => {
      await service.log({ eventType: 'TEST', entityType: 'ENTITY' });

      // $executeRaw is called inside the transaction before findFirst
      const txCallOrder = mockTx.$executeRaw.mock.invocationCallOrder[0];
      const findCallOrder = mockTx.auditLog.findFirst.mock.invocationCallOrder[0];
      expect(txCallOrder).toBeLessThan(findCallOrder);
    });

    it('writes genesis hash when chain is empty', async () => {
      mockTx.auditLog.findFirst.mockResolvedValue(null);

      await service.log({ eventType: 'TENDER_PUBLISHED', entityType: 'TENDER', entityId: 'tender-1', riskLevel: AuditRiskLevel.MEDIUM });

      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ prevHashChainValue: null }),
        }),
      );
    });

    it('chains to the previous row hash', async () => {
      const prevHash = 'a'.repeat(64);
      mockTx.auditLog.findFirst.mockResolvedValue({ hashChainValue: prevHash });

      await service.log({ eventType: 'TENDER_PUBLISHED', entityType: 'TENDER' });

      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ prevHashChainValue: prevHash }),
        }),
      );
    });

    it('computes the correct SHA-256 hash', async () => {
      mockTx.auditLog.findFirst.mockResolvedValue(null);

      await service.log({
        eventType: 'TENDER_PUBLISHED',
        entityType: 'TENDER',
        entityId: 'tender-1',
        riskLevel: AuditRiskLevel.MEDIUM,
      });

      const createCall = mockTx.auditLog.create.mock.calls[0][0];
      const stored = createCall.data as Record<string, unknown>;

      // Recompute what the hash should be using the same canonicalize logic
      const payload: Record<string, unknown> = {
        eventType: 'TENDER_PUBLISHED',
        entityType: 'TENDER',
        entityId: 'tender-1',
        actorUserId: undefined,
        actorVendorUserId: undefined,
        actorRoleCode: undefined,
        tenderId: undefined,
        vendorId: undefined,
        bidId: undefined,
        ipAddress: undefined,
        userAgent: undefined,
        beforeValue: null,
        afterValue: null,
        reason: undefined,
        metadata: null,
        riskLevel: AuditRiskLevel.MEDIUM,
      };
      const expectedHash = computeHash(GENESIS, payload);

      expect(stored.hashChainValue).toBe(expectedHash);
    });
  });

  // ─── onModuleInit ─────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('skips verification when audit.verifyOnStart=false', async () => {
      // configMock already returns 'false' for 'audit.verifyOnStart'
      await service.onModuleInit();
      expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('logs success when chain is intact', async () => {
      configMock.get.mockImplementation((key: string) =>
        key === 'audit.verifyOnStart' ? 'true' : '10',
      );
      prismaMock.auditLog.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});

      await service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('verified'));
      expect(prismaMock.securityAlert.create).not.toHaveBeenCalled();

      logSpy.mockRestore();
    });

    it('creates AUDIT_CHAIN_BREAK security alert when chain is broken', async () => {
      configMock.get.mockImplementation((key: string) =>
        key === 'audit.verifyOnStart' ? 'true' : '10',
      );
      const row = makeAuditRow(1n, null);
      const tampered = { ...row, hashChainValue: 'badhash' };
      prismaMock.auditLog.findMany.mockResolvedValue([tampered]);

      await service.onModuleInit();

      expect(prismaMock.securityAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ alertType: 'AUDIT_CHAIN_BREAK' }),
        }),
      );
    });
  });
});
