# CI + Security-Alerts UI + Audit-Chain Unit Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire GitHub Actions e2e CI, add a `/security-alerts` admin page backed by a new API endpoint, and add unit tests for the audit-chain (`verifyChain` / `log`).

**Architecture:** Three independent additions that do not change any existing behavior. CI boots the full Docker stack and runs 5 Playwright specs. Security-alerts adds two methods to `AuditService` and two routes to `AuditController`, then a new Next.js page + sidebar entry. Audit-chain unit tests exercise `verifyChain` and `log` in isolation using Jest mocks — no Postgres required.

**Tech Stack:** GitHub Actions, Docker Compose, NestJS/Prisma (backend), Next.js 15 / React 19 / Tailwind (frontend), Jest / ts-jest (unit tests), Playwright (e2e).

---

## File Map

| File | Action | What it does |
|------|--------|--------------|
| `.github/workflows/e2e.yml` | Create | Boot compose → wait → run Playwright → upload artifacts |
| `apps/api/src/modules/audit/audit.service.spec.ts` | Create | Unit tests for `listSecurityAlerts`, `acknowledgeAlert`, `verifyChain`, `log`, `onModuleInit` |
| `apps/api/src/modules/audit/audit.service.ts` | Modify | Add `listSecurityAlerts` + `acknowledgeAlert` methods |
| `apps/api/src/modules/audit/audit.controller.ts` | Modify | Add `GET /security-alerts` + `PATCH /security-alerts/:id/acknowledge` |
| `apps/web-admin/src/app/(admin)/security-alerts/page.tsx` | Create | Security alerts list + acknowledge UI |
| `apps/web-admin/src/components/layout/Sidebar.tsx` | Modify | Add Security Alerts nav item |
| `agents/backlog/MASTER_TASK_TRACKER.md` | Modify | Mark tasks complete |
| `agents/handoffs/HANDOVER.md` | Modify | Append handover entry |

---

## Task 1: GitHub Actions e2e Workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

The git repo root IS `ctmp-platform/`. All relative paths below are relative to that root.

**Important context:**
- Docker Compose is at `infrastructure/docker/docker-compose.yml`. Its relative paths (build context `../..`, migrations volume `../../database/migrations`) resolve from the compose file's own directory, not from cwd. Docker Compose honors this when you pass `-f`.
- `NEXT_PUBLIC_API_URL` is not set as a build ARG in the Dockerfiles, so Next.js bakes in the `?? 'http://localhost:3000'` fallback from `apps/web-admin/src/lib/api.ts`. This is correct for CI — the API is on `localhost:3000` of the runner.
- `golden-path.spec.ts` navigates to `VENDOR_BASE/register` and `ADMIN_BASE/login`, so web-admin and web-vendor MUST be running.
- pnpm workspace root is `ctmp-platform/` (where `pnpm-workspace.yaml` lives). Install with `pnpm install` at repo root, then run playwright via `pnpm --filter @ctmp/qa-playwright run test`.

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 40

    steps:
      - uses: actions/checkout@v4

      # ── Docker stack ────────────────────────────────────────────────────────
      - name: Create .env for docker compose
        run: |
          cat > infrastructure/docker/.env << 'EOF'
          POSTGRES_USER=ctmp
          POSTGRES_PASSWORD=ctmp_ci
          POSTGRES_DB=ctmp
          POSTGRES_PORT=5432
          REDIS_PORT=6379
          NODE_ENV=production
          API_PORT=3000
          JWT_SECRET=ci-jwt-secret-for-testing-only-32chars
          JWT_REFRESH_SECRET=ci-jwt-refresh-secret-only-32chars
          VENDOR_JWT_SECRET=ci-vendor-jwt-secret-only-32chars
          VENDOR_JWT_REFRESH_SECRET=ci-vendor-jwt-refresh-only-32ch
          SMTP_HOST=mailhog
          SMTP_PORT=1025
          CAPTCHA_PROVIDER=none
          CAPTCHA_SECRET_KEY=
          AUDIT_VERIFY_ON_START=false
          STORAGE_DRIVER=local
          REPORT_WORKER_ENABLED=true
          REPORT_WORKER_CONCURRENCY=1
          WEB_ADMIN_PORT=4200
          WEB_VENDOR_PORT=4300
          MAILHOG_SMTP_PORT=1025
          MAILHOG_WEB_PORT=8025
          EOF

      - name: Build and start stack
        run: |
          docker compose \
            -f infrastructure/docker/docker-compose.yml \
            --env-file infrastructure/docker/.env \
            up -d --build
        timeout-minutes: 25

      - name: Wait for postgres
        run: |
          for i in $(seq 1 30); do
            docker exec ctmp-postgres pg_isready -U ctmp -d ctmp 2>/dev/null && echo "postgres ready" && break
            echo "waiting for postgres... ($i/30)"
            sleep 5
          done

      - name: Wait for API health
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:3000/api/health && echo "" && echo "api ready" && break
            echo "waiting for api... ($i/30)"
            sleep 5
          done

      - name: Wait for web-admin
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:4200 > /dev/null && echo "web-admin ready" && break
            echo "waiting for web-admin... ($i/30)"
            sleep 5
          done

      - name: Wait for web-vendor
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:4300 > /dev/null && echo "web-vendor ready" && break
            echo "waiting for web-vendor... ($i/30)"
            sleep 5
          done

      # ── Node / pnpm ─────────────────────────────────────────────────────────
      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install QA dependencies
        run: pnpm --filter @ctmp/qa-playwright install

      - name: Install Playwright browsers
        run: pnpm --filter @ctmp/qa-playwright exec playwright install chromium --with-deps

      # ── Tests ───────────────────────────────────────────────────────────────
      - name: Run e2e tests
        env:
          QA_API_URL: http://localhost:3000
          QA_ADMIN_URL: http://localhost:4200
          QA_VENDOR_URL: http://localhost:4300
          QA_MAILHOG_URL: http://localhost:8025
          QA_JWT_SECRET: ci-jwt-secret-for-testing-only-32chars
          QA_VENDOR_JWT_SECRET: ci-vendor-jwt-secret-only-32chars
          DATABASE_URL: postgresql://ctmp:ctmp_ci@localhost:5432/ctmp
        run: pnpm --filter @ctmp/qa-playwright run test

      # ── Artifacts ───────────────────────────────────────────────────────────
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: qa/playwright/playwright-report/
          retention-days: 14

      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: qa/playwright/test-results/
          retention-days: 7

      - name: Dump docker logs on failure
        if: failure()
        run: |
          docker compose -f infrastructure/docker/docker-compose.yml --env-file infrastructure/docker/.env logs --tail=100
```

- [ ] **Step 2: Verify YAML syntax**

```bash
# From ctmp-platform/ (repo root)
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/e2e.yml')); print('YAML OK')"
```

Expected output: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add GitHub Actions e2e workflow

Boot full docker compose stack, wait for API + web health, run all
5 Playwright specs (golden-path + 4 invariant specs), upload HTML
report and traces as artifacts on every push/PR."
```

---

## Task 2: Failing Tests for Security-Alerts Backend (TDD — RED phase)

**Files:**
- Create: `apps/api/src/modules/audit/audit.service.spec.ts`

Write tests for the two NEW methods first (they don't exist yet — tests must fail).

- [ ] **Step 1: Create the spec file with security-alerts tests**

```typescript
// apps/api/src/modules/audit/audit.service.spec.ts
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

// Build a mock audit log row with a valid hash chain. The payload shape must
// exactly match what AuditService.log() writes so the verifyChain recomputation
// produces the same hash.
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
  });
});
```

- [ ] **Step 2: Run tests — confirm RED**

```bash
# From ctmp-platform/
pnpm --filter @ctmp/api test -- --testPathPattern=audit.service.spec --no-coverage
```

Expected output: Tests FAIL because `listSecurityAlerts` and `acknowledgeAlert` do not exist yet.

---

## Task 3: Implement Security-Alerts Backend (TDD — GREEN phase)

**Files:**
- Modify: `apps/api/src/modules/audit/audit.service.ts`
- Modify: `apps/api/src/modules/audit/audit.controller.ts`

- [ ] **Step 1: Add `listSecurityAlerts` and `acknowledgeAlert` to `AuditService`**

Add these two methods at the bottom of `audit.service.ts`, before the closing brace of the class (after `getTenderLogs`):

```typescript
  async listSecurityAlerts(query: {
    page?: number;
    pageSize?: number;
    unacknowledgedOnly?: boolean;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
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
    await this.prisma.securityAlert.update({
      where: { id },
      data: { acknowledgedBy, acknowledgedAt: new Date() },
    });
  }
```

- [ ] **Step 2: Add routes to `AuditController`**

Replace the contents of `apps/api/src/modules/audit/audit.controller.ts` with:

```typescript
import { Controller, Get, Patch, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';
import { AuditSearchDto } from './dto/audit-search.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs')
  @RequirePermissions('audit:read')
  @ApiOperation({ operationId: 'searchAuditLogs', summary: 'Search system-wide audit logs' })
  search(@Query() query: AuditSearchDto) {
    return this.auditService.search(query);
  }

  @Get('tenders/:tenderId/audit-logs')
  @RequirePermissions('audit:read')
  @ApiOperation({ operationId: 'getTenderAuditLogs', summary: 'Get audit logs for a specific tender' })
  getTenderLogs(@Param('tenderId') tenderId: string, @Query() query: AuditSearchDto) {
    return this.auditService.getTenderLogs(tenderId, query);
  }

  @Get('security-alerts')
  @RequirePermissions('audit:view')
  @ApiOperation({ operationId: 'listSecurityAlerts', summary: 'List security alerts (e.g. AUDIT_CHAIN_BREAK)' })
  listSecurityAlerts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unacknowledgedOnly') unacknowledgedOnly?: string,
  ) {
    return this.auditService.listSecurityAlerts({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      unacknowledgedOnly: unacknowledgedOnly === 'true',
    });
  }

  @Patch('security-alerts/:id/acknowledge')
  @RequirePermissions('audit:view')
  @ApiOperation({ operationId: 'acknowledgeSecurityAlert', summary: 'Acknowledge a security alert' })
  acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.auditService.acknowledgeAlert(BigInt(id), userId);
  }
}
```

- [ ] **Step 3: Run tests — confirm GREEN**

```bash
pnpm --filter @ctmp/api test -- --testPathPattern=audit.service.spec --no-coverage
```

Expected: All tests in `listSecurityAlerts` and `acknowledgeAlert` suites PASS.

- [ ] **Step 4: Verify TypeScript**

```bash
pnpm --filter @ctmp/api exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/audit/audit.service.ts \
        apps/api/src/modules/audit/audit.controller.ts \
        apps/api/src/modules/audit/audit.service.spec.ts
git commit -m "feat(audit): add security-alerts list + acknowledge endpoints

GET /security-alerts returns paginated security_alerts rows with
optional ?unacknowledgedOnly=true filter. PATCH /security-alerts/:id/
acknowledge stamps acknowledgedBy + acknowledgedAt. Both gated by
audit:view permission. Includes TDD unit tests (RED→GREEN verified)."
```

---

## Task 4: Security-Alerts Frontend Page

**Files:**
- Create: `apps/web-admin/src/app/(admin)/security-alerts/page.tsx`
- Modify: `apps/web-admin/src/components/layout/Sidebar.tsx`

The page follows the same pattern as `audit-log/page.tsx`: `audit:view` permission gate, loading state, table, pagination, expandable rows.

- [ ] **Step 1: Create the security-alerts page**

```tsx
// apps/web-admin/src/app/(admin)/security-alerts/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, patch } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  metadata?: Record<string, unknown>;
  sourceIp?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  acknowledged: boolean;
  createdAt: string;
}

interface SecurityAlertListResponse {
  items: SecurityAlert[];
  total: number;
  page: number;
  pageSize: number;
}

const SEVERITY_STYLES: Record<SecurityAlert['severity'], string> = {
  LOW:      'bg-success/10 text-success',
  MEDIUM:   'bg-amber-100 text-amber-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-danger/15 text-danger font-bold',
};

const PAGE_SIZE = 50;

export default function SecurityAlertsPage() {
  const [permChecked, setPermChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    setCanView(!!token && hasPermission(token, 'audit:view'));
    setPermChecked(true);
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (unacknowledgedOnly) params.set('unacknowledgedOnly', 'true');
      const res = await get<SecurityAlertListResponse>(`/security-alerts?${params}`, token);
      setAlerts(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security alerts');
    } finally {
      setLoading(false);
    }
  }, [canView, page, unacknowledgedOnly]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function acknowledge(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setAckLoading(id);
    try {
      await patch(`/security-alerts/${id}/acknowledge`, {}, token);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() } : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed');
    } finally {
      setAckLoading(null);
    }
  }

  if (!permChecked) return null;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4 text-center max-w-md mx-auto">
        <span className="material-symbols-outlined text-[72px] text-text-secondary/30">security</span>
        <h1 className="text-xl font-bold text-text-primary">Audit Access Required</h1>
        <p className="text-sm text-text-secondary">
          Viewing security alerts requires the <code className="bg-bg px-1.5 py-0.5 rounded text-xs">audit:view</code> permission.
        </p>
      </div>
    );
  }

  const unacked = alerts.filter(a => !a.acknowledged).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Security Alerts</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            System integrity events — audit chain breaks and other critical signals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unacked > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-danger/15 text-danger text-xs font-bold">
              {unacked} unacknowledged
            </span>
          )}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={unacknowledgedOnly}
              onChange={e => { setUnacknowledgedOnly(e.target.checked); setPage(1); }}
              className="rounded border-border"
            />
            Unacknowledged only
          </label>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-40">Time</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Severity</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Message</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-36">Status</th>
              <th className="px-4 py-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">Loading…</td></tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <span className="material-symbols-outlined text-[40px] text-text-secondary/30 block mb-2">verified_user</span>
                  <p className="text-sm text-text-secondary">No security alerts. System integrity is intact.</p>
                </td>
              </tr>
            ) : (
              alerts.map(alert => (
                <>
                  <tr
                    key={alert.id}
                    onClick={() => setExpanded(prev => prev === alert.id ? null : alert.id)}
                    className={`cursor-pointer hover:bg-bg/60 ${!alert.acknowledged ? 'bg-danger/5' : ''}`}
                  >
                    <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                      {new Date(alert.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-text-primary">{alert.alertType}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_STYLES[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary max-w-sm truncate">{alert.message}</td>
                    <td className="px-4 py-3">
                      {alert.acknowledged ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); acknowledge(alert.id); }}
                          disabled={ackLoading === alert.id}
                          className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-semibold hover:bg-danger/90 disabled:opacity-50"
                        >
                          {ackLoading === alert.id ? 'Saving…' : 'Acknowledge'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`material-symbols-outlined text-[18px] text-text-secondary transition-transform ${expanded === alert.id ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </td>
                  </tr>
                  {expanded === alert.id && (
                    <tr key={`${alert.id}-detail`} className="bg-bg">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {alert.sourceIp && <DetailGroup label="Source IP" value={alert.sourceIp} mono />}
                          {alert.targetEntityType && <DetailGroup label="Target Entity Type" value={alert.targetEntityType} />}
                          {alert.targetEntityId && <DetailGroup label="Target Entity ID" value={alert.targetEntityId} mono />}
                          {alert.acknowledgedBy && <DetailGroup label="Acknowledged By" value={alert.acknowledgedBy} mono />}
                          {alert.acknowledgedAt && (
                            <DetailGroup
                              label="Acknowledged At"
                              value={new Date(alert.acknowledgedAt).toLocaleString('en-GB')}
                            />
                          )}
                        </div>
                        {alert.metadata && (
                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Metadata</p>
                            <pre className="bg-card rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48 border border-border">
                              {JSON.stringify(alert.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>

        {total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg">
            <p className="text-xs text-text-secondary">Page {page} of {totalPages} • {total} total alerts</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >Previous</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailGroup({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-0.5">{label}</p>
      <p className={`text-xs text-text-primary ${mono ? 'font-mono' : ''} break-all`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add Security Alerts to the sidebar**

In `apps/web-admin/src/components/layout/Sidebar.tsx`, add the new nav item after `'/audit-log'`:

Find:
```typescript
  { href: '/audit-log', label: 'Audit Log', icon: 'policy' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
```

Replace with:
```typescript
  { href: '/audit-log', label: 'Audit Log', icon: 'policy' },
  { href: '/security-alerts', label: 'Security Alerts', icon: 'security', permission: 'audit:view' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @ctmp/web-admin exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web-admin/src/app/\(admin\)/security-alerts/page.tsx \
        apps/web-admin/src/components/layout/Sidebar.tsx
git commit -m "feat(web-admin): add /security-alerts page

Lists AUDIT_CHAIN_BREAK and other security_alerts rows. Unacknowledged
alerts highlighted in red. One-click Acknowledge calls PATCH
/security-alerts/:id/acknowledge. Expandable rows show metadata,
source IP, and acknowledger. Gated by audit:view permission."
```

---

## Task 5: Audit-Chain Unit Tests (verifyChain + log + onModuleInit)

**Files:**
- Modify: `apps/api/src/modules/audit/audit.service.spec.ts`

Add these new `describe` blocks into the existing `describe('AuditService', ...)` suite, after the `acknowledgeAlert` block.

- [ ] **Step 1: Add verifyChain tests**

Append to the describe block in `audit.service.spec.ts`:

```typescript
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

      // Recompute what the hash should be
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
```

- [ ] **Step 2: Run all audit tests**

```bash
pnpm --filter @ctmp/api test -- --testPathPattern=audit.service.spec --no-coverage --verbose
```

Expected: All tests PASS. `onModuleInit > skips` will pass because `configMock.get('audit.verifyOnStart')` returns `'false'` by default.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit/audit.service.spec.ts
git commit -m "test(audit): add unit tests for verifyChain, log, onModuleInit

Covers: empty chain, valid 1-row and 3-row chains, broken prevHash
detection, tampered hashChainValue detection, advisory-lock call order,
genesis-hash write, chain continuation, exact SHA-256 value, startup
skip/ok/break paths. No Postgres — all Prisma calls mocked."
```

---

## Task 6: Update Tracker and Handover

**Files:**
- Modify: `agents/backlog/MASTER_TASK_TRACKER.md`
- Modify: `agents/handoffs/HANDOVER.md`

- [ ] **Step 1: Mark tasks complete in MASTER_TASK_TRACKER.md**

In the Phase 7 section, find the `[ ]` items for CI and QA and update them. Add new completed entries:

```markdown
- [x] CI wiring — GitHub Actions e2e workflow.
  - Completed 2026-05-19. `.github/workflows/e2e.yml` boots full Docker Compose stack (postgres, redis, mailhog, minio, api, web-admin, web-vendor), waits for each service health, installs pnpm + Playwright chromium, runs all 5 Playwright specs, uploads HTML report (14d) and traces (7d) on every push/PR.
- [x] Admin security-alerts UI (/security-alerts page).
  - Completed 2026-05-19. Backend: `listSecurityAlerts` + `acknowledgeAlert` in `AuditService`; `GET /security-alerts` + `PATCH /security-alerts/:id/acknowledge` in `AuditController` (both gated by `audit:view`). Frontend: `apps/web-admin/src/app/(admin)/security-alerts/page.tsx` — paginated table, unacked badge + filter, one-click acknowledge, expandable metadata. Sidebar nav item added.
- [x] Audit-chain unit tests.
  - Completed 2026-05-19. `apps/api/src/modules/audit/audit.service.spec.ts` covers `verifyChain` (5 cases: empty, valid 1-row, valid 3-row, broken prevHash, tampered hash), `log` (4 cases: advisory lock order, genesis hash write, chain continuation, exact SHA-256), `onModuleInit` (3 cases: skip/ok/break), `listSecurityAlerts` (2 cases), `acknowledgeAlert` (1 case). No Postgres required.
```

- [ ] **Step 2: Append to HANDOVER.md**

Add at the top (after the `---` separator, before the previous entry):

```markdown
## 2026-05-19 — CI wiring + security-alerts UI + audit-chain unit tests

**Date/time:** 2026-05-19 (morning) GMT+3
**Agent/task:** Three independent additions from the post-Phase-7 punch list.

**Files changed:**

CI:
- `.github/workflows/e2e.yml` — GitHub Actions workflow. Builds full compose stack (all 6 services + mailhog + minio), polls each for health, installs pnpm 9 + Node 22 + Playwright chromium, runs `pnpm --filter @ctmp/qa-playwright run test`, uploads `playwright-report/` (14d) and `test-results/` (7d) as artifacts. Dumps docker logs on job failure.

Security alerts backend:
- `apps/api/src/modules/audit/audit.service.ts` — Added `listSecurityAlerts({ page, pageSize, unacknowledgedOnly })` and `acknowledgeAlert(id: bigint, acknowledgedBy: string)`.
- `apps/api/src/modules/audit/audit.controller.ts` — Added `GET /security-alerts` and `PATCH /security-alerts/:id/acknowledge`, both gated by `audit:view`. BigInt id comes in as string param; service receives `BigInt(id)`.

Security alerts frontend:
- `apps/web-admin/src/app/(admin)/security-alerts/page.tsx` — Paginated table of `security_alerts` rows. Unacknowledged rows highlighted red with badge count. One-click Acknowledge button calls PATCH. Expandable rows show metadata JSON, sourceIp, acknowledger, timestamp. Empty-state shows "System integrity is intact."
- `apps/web-admin/src/components/layout/Sidebar.tsx` — Added `{ href: '/security-alerts', label: 'Security Alerts', icon: 'security', permission: 'audit:view' }` after Audit Log.

Unit tests:
- `apps/api/src/modules/audit/audit.service.spec.ts` — 15 unit tests covering all AuditService methods. No Postgres. Duplicates `canonicalize` locally (not exported from service — intentional). Uses `makeAuditRow` helper to build mock rows with valid hash chains.

**What changed:**
CI is now wired — every push/PR runs the full e2e suite. Security alert rows from the boot verifier are now visible and actionable in the admin UI. The audit chain algorithm is covered by unit tests that don't need Postgres.

**Why:**
Priority order chosen by user: CI first (ongoing confidence), then security alerts UI (makes the boot verifier useful), then unit tests (algorithm correctness without DB).

**Verification:**
- `.github/workflows/e2e.yml` — YAML parses cleanly (`python3 -c "import yaml; yaml.safe_load(open(...))"`)
- `audit.service.spec.ts` — all 15 tests pass (`pnpm --filter @ctmp/api test -- --testPathPattern=audit.service.spec`)
- `apps/api` tsc clean
- `apps/web-admin` tsc clean

**Open questions / known limits:**
- CI build time: building web-admin and web-vendor (Next.js) takes 5–10 min. Add Docker layer caching (`docker/setup-buildx-action` + cache-to/from) if CI becomes too slow.
- `NEXT_PUBLIC_API_URL` baked at build time. The Dockerfiles don't set it as a build ARG, so Next.js falls back to `?? 'http://localhost:3000'` from `lib/api.ts`. This is correct for CI (API is on localhost:3000 of the runner) but wrong for production (needs a build ARG). Do not fix now — it's a separate concern for the production deployment runbook.
- Security alerts page does not have a Playwright spec covering it (out of scope for this task).
- `audit:view` is used for both listing and acknowledging security alerts. If the team wants to restrict acknowledgement to a subset of users, a separate `security:acknowledge` permission would need to be added to the seed data.

**Next recommended step:**
1. Push the branch and verify the CI workflow triggers and all 5 Playwright specs pass.
2. Phase 8 documentation — system deployment runbook.
3. Add Docker build-cache to the CI workflow (GHA cache action) to reduce build time from ~20 min to ~5 min.
```

- [ ] **Step 3: Final commit**

```bash
git add agents/backlog/MASTER_TASK_TRACKER.md agents/handoffs/HANDOVER.md
git commit -m "docs: update tracker and handover for CI + security-alerts + audit tests"
```

---

## Self-Review

**Spec coverage:**
- CI wiring ✓ — builds full stack, waits for health, runs 5 specs, uploads artifacts
- Security alerts backend ✓ — list + acknowledge, BigInt handled, permission gated
- Security alerts frontend ✓ — permission check, paginated table, acknowledge action, sidebar entry
- Audit chain unit tests ✓ — verifyChain (5 cases), log (4 cases), onModuleInit (3 cases), new service methods (3 cases)

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `listSecurityAlerts` in service matches `listSecurityAlerts` in controller ✓
- `acknowledgeAlert(id: bigint, ...)` in service; controller passes `BigInt(id)` ✓
- `makeAuditRow` returns a shape that matches what `verifyChain` expects (`id`, `prevHashChainValue`, `hashChainValue`, `eventType`, `entityType`, etc.) ✓
- `configMock.get` returns `'false'` for `audit.verifyOnStart` by default → `onModuleInit > skips` passes without touching `findMany` ✓
- `$transaction` mock switches between callback-style (for `log`) and array-style (for `listSecurityAlerts`) — tests reset mocks in `beforeEach` and the `listSecurityAlerts` test overrides `$transaction` inline ✓
