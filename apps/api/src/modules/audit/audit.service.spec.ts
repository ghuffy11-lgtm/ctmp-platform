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
});
