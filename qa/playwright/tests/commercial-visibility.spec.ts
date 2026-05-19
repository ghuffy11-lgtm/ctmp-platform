import { test, expect } from '@playwright/test';
import {
  ensureAdminUser,
  ensureApprovedVendor,
  ensurePublishedTender,
  resetTender,
} from '../helpers/db';
import {
  authJson,
  signAdminToken,
  signAdminTokenWithPermissions,
  signVendorToken,
} from '../helpers/api';
import { TECHNICAL_FIXTURE, COMMERCIAL_FIXTURE } from '../helpers/fixtures';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const ADMIN = {
  email: 'qa-cv-admin@hadiclinic.com.kw',
  password: 'QaPass!2026',
  displayName: 'QA Commercial-Visibility Admin',
};
const VENDOR = {
  email: 'qa-cv-vendor@example.com',
  password: 'QaPass!2026',
  companyName: 'QA CV Vendor LLC',
  contactName: 'CV Contact',
};
const TENDER = {
  reference: 'TDR-QA-CV-0001',
  title: 'QA Commercial-Visibility Tender',
  description: 'Single bid, two admins with different commercial permissions.',
};

test.describe.serial('Commercial visibility permission matrix', () => {
  let adminUserId: string;
  let tenderId: string;
  let bidId: string;

  test.beforeAll(async () => {
    adminUserId = await ensureAdminUser(ADMIN);
    tenderId = await ensurePublishedTender({
      reference: TENDER.reference,
      title: TENDER.title,
      description: TENDER.description,
      adminUserId,
    });
    await resetTender(TENDER.reference);

    // Submit one bid + drive it through to commercial-opened state.
    const vendor = await ensureApprovedVendor(VENDOR);
    const vendorToken = await signVendorToken(vendor.vendorUserId);
    const adminToken = await signAdminToken(adminUserId);

    const bid = await authJson<{ id: string }>(
      vendorToken,
      `/tenders/${tenderId}/bids/draft`,
      { method: 'POST', body: '{}' },
    );
    bidId = bid.id;

    for (const env of ['TECHNICAL', 'COMMERCIAL'] as const) {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([env === 'TECHNICAL' ? TECHNICAL_FIXTURE : COMMERCIAL_FIXTURE], { type: 'text/plain' }),
        `${env.toLowerCase()}.txt`,
      );
      await fetch(`${API_BASE}/api/bids/${bidId}/envelopes/${env}/documents`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
    }
    await authJson(vendorToken, `/bids/${bidId}/submit`, { method: 'POST', body: '{}' });

    await authJson(adminToken, `/tenders/${tenderId}/close-submissions`, { method: 'POST' });
    await authJson(adminToken, `/tenders/${tenderId}/technical-opening`, { method: 'POST' });
    await authJson(adminToken, `/bids/${bidId}/technical-evaluations`, {
      method: 'POST',
      body: JSON.stringify({ score: 90, notes: 'QA pass' }),
    });
    await authJson(adminToken, `/tenders/${tenderId}/finalize-technical-results`, { method: 'POST' });

    const session = await authJson<{ id: string; committeeMembers: Array<{ userId: string }> }>(
      adminToken,
      `/tenders/${tenderId}/committee-sessions`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: new Date().toISOString(),
          memberIds: [adminUserId, adminUserId],
        }),
      },
    );
    await authJson(adminToken, `/committee-sessions/${session.id}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ attendeeIds: session.committeeMembers.map(m => m.userId) }),
    });
    await authJson(adminToken, `/committee-sessions/${session.id}/open-commercial-envelopes`, {
      method: 'POST',
      body: JSON.stringify({ remarks: 'QA visibility opening' }),
    });
    await authJson(adminToken, `/bids/${bidId}/commercial-evaluations`, {
      method: 'POST',
      body: JSON.stringify({ totalPrice: 50_000, notes: 'QA fixture price' }),
    });
  });

  test('admin WITH commercial:view sees full amount', async () => {
    const token = signAdminTokenWithPermissions(adminUserId, [
      'tenders:list', 'tenders:read',
      'commercial:view', 'commercial:evaluate', 'commercial:export', 'commercial:download',
    ]);
    const cmp = await authJson<{
      callerCommercialAccess: { canView: boolean; canDownload: boolean; canEvaluate: boolean; canExport: boolean };
      rows: Array<{ commercialDetailsVisible: boolean; totalAmount?: number; currency?: string }>;
    }>(token, `/tenders/${tenderId}/commercial-comparison`);

    expect(cmp.callerCommercialAccess.canView).toBe(true);
    expect(cmp.callerCommercialAccess.canExport).toBe(true);
    expect(cmp.rows.length).toBeGreaterThan(0);
    const row = cmp.rows[0];
    expect(row.commercialDetailsVisible, 'details visible to commercial:view holder').toBe(true);
    expect(row.totalAmount, 'amount populated').toBe(50_000);
  });

  test('admin WITHOUT commercial:view is rejected with 403', async () => {
    const token = signAdminTokenWithPermissions(adminUserId, ['tenders:list', 'tenders:read']);
    const res = await fetch(`${API_BASE}/api/tenders/${tenderId}/commercial-comparison`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status, 'no commercial:view → 403').toBe(403);
  });

  test('admin WITH commercial:view but WITHOUT commercial:export sees amount but cannot export', async () => {
    const token = signAdminTokenWithPermissions(adminUserId, [
      'tenders:list', 'tenders:read', 'commercial:view',
    ]);
    const cmp = await authJson<{
      callerCommercialAccess: { canView: boolean; canExport: boolean };
      rows: Array<{ commercialDetailsVisible: boolean; totalAmount?: number }>;
    }>(token, `/tenders/${tenderId}/commercial-comparison`);

    expect(cmp.callerCommercialAccess.canView).toBe(true);
    expect(cmp.callerCommercialAccess.canExport, 'no commercial:export flag').toBe(false);
    expect(cmp.rows[0].commercialDetailsVisible).toBe(true);
    expect(cmp.rows[0].totalAmount).toBe(50_000);
  });
});
