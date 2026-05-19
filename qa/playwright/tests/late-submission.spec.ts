import { test, expect } from '@playwright/test';
import {
  ensureAdminUser,
  ensureApprovedVendor,
  ensurePastDeadlineTender,
  resetTender,
  withDb,
} from '../helpers/db';
import { authJson, signAdminToken, signVendorToken } from '../helpers/api';
import { TECHNICAL_FIXTURE, COMMERCIAL_FIXTURE } from '../helpers/fixtures';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const ADMIN = {
  email: 'qa-late-admin@hadiclinic.com.kw',
  password: 'QaAdminPass!2026',
  displayName: 'QA Late Admin',
};
const VENDOR = {
  email: 'qa-late-vendor@example.com',
  password: 'QaVendorPass!2026',
  companyName: 'QA Late Vendor LLC',
  contactName: 'QA Late Contact',
};
const TENDER = {
  reference: 'TDR-QA-LATE-0001',
  title: 'QA Late-Submission Tender',
};

test.describe.serial('Late submission exception flow', () => {
  let adminUserId: string;
  let adminToken: string;
  let tenderId: string;
  let vendorId: string;
  let vendorUserId: string;
  let vendorToken: string;

  test.beforeAll(async () => {
    adminUserId = await ensureAdminUser(ADMIN);
    tenderId = await ensurePastDeadlineTender({
      reference: TENDER.reference,
      title: TENDER.title,
      adminUserId,
      daysOverdue: 1,
    });
    await resetTender(TENDER.reference);
    // Reset moves submission_close_at +30 days — pull it back into the past.
    await withDb(async client => {
      await client.query(
        `UPDATE tenders SET submission_close_at = now() - interval '1 day' WHERE id = $1`,
        [tenderId],
      );
    });
    const v = await ensureApprovedVendor(VENDOR);
    vendorId = v.vendorId;
    vendorUserId = v.vendorUserId;

    adminToken = await signAdminToken(adminUserId);
    vendorToken = await signVendorToken(vendorUserId);
  });

  test('submit before exception is rejected with deadline error', async () => {
    // Draft a bid + attach docs first so the deadline check is the only thing blocking submit.
    const bid = await authJson<{ id: string; bidEnvelopes: Array<{ id: string; envelopeType: string }> }>(
      vendorToken,
      `/tenders/${tenderId}/bids/draft`,
      { method: 'POST', body: '{}' },
    );

    for (const env of ['TECHNICAL', 'COMMERCIAL'] as const) {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([env === 'TECHNICAL' ? TECHNICAL_FIXTURE : COMMERCIAL_FIXTURE], { type: 'text/plain' }),
        `${env.toLowerCase()}.txt`,
      );
      const res = await fetch(`${API_BASE}/api/v1/bids/${bid.id}/envelopes/${env}/documents`, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      expect(res.ok, `upload ${env} doc`).toBeTruthy();
    }

    // Submit should fail — past deadline, no exception.
    const res = await fetch(`${API_BASE}/api/v1/bids/${bid.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vendorToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status, 'reject submit past deadline without exception').toBeGreaterThanOrEqual(400);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('deadline');
  });

  test('admin grants exception, vendor submits as LATE_SUBMITTED', async () => {
    const exception = await authJson<{ id: string; status: string }>(
      adminToken,
      `/tenders/${tenderId}/late-submission-exceptions`,
      {
        method: 'POST',
        body: JSON.stringify({
          vendorId,
          reason: 'QA fixture — power outage at vendor site',
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }),
      },
    );
    expect(exception.status, 'exception granted on creation').toBe('GRANTED');

    // Find the existing bid (or draft a fresh one) and submit.
    const myBids = await authJson<{ items: Array<{ id: string; tenderId: string; status: string }> }>(
      vendorToken,
      '/vendor-auth/me/bids?pageSize=10',
    );
    const draftBid = myBids.items.find(b => b.tenderId === tenderId && b.status === 'DRAFT');
    expect(draftBid, 'draft bid still exists after first failed submit').toBeTruthy();

    // late-submissions.service.create() now links the active DRAFT bid to the
    // new exception inside the same transaction — submit() picks it up via the
    // bid.lateException prisma include without any QA-side wiring.

    const receipt = await authJson<{ receiptNumber: string; submittedAt: string }>(
      vendorToken,
      `/bids/${draftBid!.id}/submit`,
      { method: 'POST', body: '{}' },
    );
    expect(receipt.receiptNumber, 'receipt issued').toBeTruthy();

    // Verify bid status flipped to LATE_SUBMITTED.
    await withDb(async client => {
      const r = await client.query<{ status: string }>(
        `SELECT status FROM bids WHERE id = $1`,
        [draftBid!.id],
      );
      expect(r.rows[0].status).toBe('LATE_SUBMITTED');
    });
  });

  test('audit captures the exception grant', async () => {
    const audit = await authJson<{ items: Array<{ eventType: string; vendorId?: string }> }>(
      adminToken,
      '/audit-logs?pageSize=200',
    );
    const events = audit.items.map(i => i.eventType);
    const hasLateGrant = events.includes('LATE_SUBMISSION_EXCEPTION_GRANTED');
    expect(hasLateGrant, 'late-exception grant produces an audit row').toBeTruthy();
  });
});
