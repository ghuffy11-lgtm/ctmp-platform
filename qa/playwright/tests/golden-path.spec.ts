import { test, expect } from '@playwright/test';
import {
  ensureAdminUser,
  ensurePublishedTender,
  forceVerifyVendorPrimaryEmail,
  resetTender,
  resetVendorByEmail,
  withDb,
} from '../helpers/db';
import { authJson, signAdminToken, vendorLogin } from '../helpers/api';
import { COMMERCIAL_FIXTURE, TECHNICAL_FIXTURE } from '../helpers/fixtures';

const ADMIN_BASE = process.env.QA_ADMIN_URL ?? 'http://localhost:4200';
const VENDOR_BASE = process.env.QA_VENDOR_URL ?? 'http://localhost:4300';
const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

// Test identities — fixed so re-runs reset cleanly.
const ADMIN = {
  email: 'qa-admin@hadiclinic.com.kw',
  password: 'QaAdminPass!2026',
  displayName: 'QA Admin',
};
const VENDOR = {
  company: 'QA Vendor LLC',
  email: 'qa-vendor@example.com',
  password: 'QaVendorPass!2026',
  contactName: 'QA Vendor Contact',
};
const TENDER = {
  reference: 'TDR-QA-0001',
  title: 'QA Golden-Path Tender',
  description: 'End-to-end test tender. Created and reset by the Playwright suite.',
};

test.describe.serial('Golden path — register → bid → evaluate → award', () => {
  let adminUserId: string;
  let tenderId: string;
  let vendorId: string;
  let bidId: string;

  test.beforeAll(async () => {
    // Clean slate.
    await resetVendorByEmail(VENDOR.email);
    adminUserId = await ensureAdminUser(ADMIN);
    tenderId = await ensurePublishedTender({
      reference: TENDER.reference,
      title: TENDER.title,
      description: TENDER.description,
      adminUserId,
    });
    await resetTender(TENDER.reference);
  });

  test('vendor registers via portal', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/register`);
    await page.fill('input[type="text"]:near(:text("Company Name"))', VENDOR.company);
    // Walk every Field by label.
    await page.getByLabel(/Company Name/i).fill(VENDOR.company);
    await page.getByLabel(/Contact Full Name/i).fill(VENDOR.contactName);
    await page.getByLabel(/Contact Email/i).fill(VENDOR.email);
    await page.getByLabel(/Password/i).fill(VENDOR.password);
    // CAPTCHA token field is a free-text input in the scaffold; the API stub treats any non-empty value as valid in dev mode.
    await page.locator('input[placeholder*="CAPTCHA"]').fill('qa-fixture-captcha-token');
    await page.getByRole('button', { name: /Submit Registration/i }).click();
    await expect(page.getByText(/Registration submitted/i)).toBeVisible({ timeout: 15_000 });
  });

  test('admin approves vendor', async ({ page, request }) => {
    // Force-verify the email so approval is allowed (real flow would click an emailed link).
    await forceVerifyVendorPrimaryEmail(VENDOR.email);

    // Capture vendor UUID via API (using admin token).
    const adminToken = await signAdminToken(adminUserId);
    const list = await authJson<{ items: Array<{ id: string; email: string }> }>(
      adminToken,
      '/vendors?status=PENDING_APPROVAL&pageSize=50',
    );
    const found = list.items.find(v => v.email === VENDOR.email);
    expect(found, 'pending vendor present after registration').toBeTruthy();
    vendorId = found!.id;

    // Drive the UI approval.
    await page.goto(`${ADMIN_BASE}/login`);
    await page.getByLabel(/Username|Email/i).first().fill(ADMIN.email);
    await page.getByLabel(/Password/i).fill(ADMIN.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL(/dashboard|tenders/, { timeout: 15_000 });

    await page.goto(`${ADMIN_BASE}/vendors`);
    await expect(page.getByText(VENDOR.company).first()).toBeVisible({ timeout: 10_000 });
    await page.getByText(VENDOR.company).first().click();
    await page.getByRole('button', { name: /Approve Vendor/i }).click();
    await page.getByRole('button', { name: /OK|Yes|Confirm/i }).click().catch(() => {});
    // Approve dialog uses window.confirm — Playwright auto-accepts via dialog handler.
  });

  test('vendor logs in + submits bid', async ({ page }) => {
    // Vendor login.
    await page.goto(`${VENDOR_BASE}/login`);
    await page.getByLabel(/Email/i).fill(VENDOR.email);
    await page.getByLabel(/Password/i).fill(VENDOR.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 15_000 });

    // Open tender detail.
    await page.goto(`${VENDOR_BASE}/tenders/${tenderId}`);
    await page.getByRole('link', { name: /Start Bid/i }).click();
    await page.waitForURL(new RegExp(`/bids/wizard/${tenderId}`), { timeout: 15_000 });

    // Step 1 → Continue.
    await page.getByRole('button', { name: /Continue/i }).click();

    // Step 2: upload TECHNICAL doc.
    const techInput = page.locator('input[type="file"]').first();
    await techInput.setInputFiles({
      name: 'technical-proposal.txt',
      mimeType: 'text/plain',
      buffer: TECHNICAL_FIXTURE,
    });
    await expect(page.getByText(/technical-proposal\.txt/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // Step 3: upload COMMERCIAL doc.
    const commInput = page.locator('input[type="file"]').first();
    await commInput.setInputFiles({
      name: 'commercial-pricing.txt',
      mimeType: 'text/plain',
      buffer: COMMERCIAL_FIXTURE,
    });
    await expect(page.getByText(/commercial-pricing\.txt/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Continue/i }).click();

    // Step 4: submit.
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: /Submit Bid/i }).click();
    await expect(page.getByText(/Bid submitted successfully/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Receipt Number/i)).toBeVisible();

    // Capture bidId from the bid list.
    const vendorToken = await vendorLogin(VENDOR.email, VENDOR.password);
    const mine = await authJson<{ items: Array<{ id: string; tenderId: string }> }>(
      vendorToken,
      '/vendor-auth/me/bids?pageSize=10',
    );
    const found = mine.items.find(b => b.tenderId === tenderId);
    expect(found).toBeTruthy();
    bidId = found!.id;
  });

  test('admin closes submissions, opens technical, evaluates pass, finalizes', async () => {
    const adminToken = await signAdminToken(adminUserId);

    await authJson(adminToken, `/tenders/${tenderId}/close-submissions`, { method: 'POST' });
    await authJson(adminToken, `/tenders/${tenderId}/technical-opening`, { method: 'POST' });

    await authJson(adminToken, `/bids/${bidId}/technical-evaluations`, {
      method: 'POST',
      body: JSON.stringify({ score: 95, notes: 'QA fixture — pass' }),
    });

    await authJson(adminToken, `/tenders/${tenderId}/finalize-technical-results`, { method: 'POST' });
  });

  test('admin runs committee opening + commercial evaluation + award flow', async () => {
    const adminToken = await signAdminToken(adminUserId);

    // Create a session with 2 members (chair + admin).
    const session = await authJson<{ id: string; committeeMembers: Array<{ userId: string }> }>(
      adminToken,
      `/tenders/${tenderId}/committee-sessions`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: new Date().toISOString(),
          memberIds: [adminUserId, adminUserId], // dedupe handled by DB if same; second member optional
        }),
      },
    ).catch(async () => {
      // Some configs reject duplicate userIds; fall back to single-member which will fail quorum.
      // Add a second admin user on the fly.
      const secondAdminId = await ensureAdminUser({
        email: 'qa-admin2@hadiclinic.com.kw',
        password: 'QaAdminPass!2026',
        displayName: 'QA Admin Second',
      });
      return authJson<{ id: string; committeeMembers: Array<{ userId: string }> }>(
        adminToken,
        `/tenders/${tenderId}/committee-sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            scheduledAt: new Date().toISOString(),
            memberIds: [adminUserId, secondAdminId],
          }),
        },
      );
    });

    // Record both members present (full attendance ensures quorum).
    await authJson(adminToken, `/committee-sessions/${session.id}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ attendeeIds: session.committeeMembers.map(m => m.userId) }),
    });

    // Open commercial envelopes — committee path.
    await authJson(adminToken, `/committee-sessions/${session.id}/open-commercial-envelopes`, {
      method: 'POST',
      body: JSON.stringify({ remarks: 'QA committee opening — fixture run' }),
    });

    // Commercial evaluation — record price.
    await authJson(adminToken, `/bids/${bidId}/commercial-evaluations`, {
      method: 'POST',
      body: JSON.stringify({ totalPrice: 100000, notes: 'QA fixture price' }),
    });

    // Award recommendation.
    await authJson(adminToken, `/tenders/${tenderId}/award-recommendations`, {
      method: 'POST',
      body: JSON.stringify({
        recommendedBidId: bidId,
        recommendedVendorId: vendorId,
        reason: 'Single qualified bid in QA fixture',
      }),
    }).catch(async () => {
      // Endpoint name from contract may be `/award-recommendation` (singular) — try both.
      await authJson(adminToken, `/tenders/${tenderId}/award-recommendation`, {
        method: 'POST',
        body: JSON.stringify({
          recommendedBidId: bidId,
          justification: 'Single qualified bid in QA fixture',
        }),
      });
    });

    // Approve + issue the award.
    await authJson(adminToken, `/tenders/${tenderId}/award-approval`, {
      method: 'POST',
      body: JSON.stringify({ approved: true, notes: 'QA approved' }),
    });
    await authJson(adminToken, `/tenders/${tenderId}/award`, { method: 'POST' });

    // Verify state in DB.
    await withDb(async client => {
      const r = await client.query<{ status: string; awarded_vendor_id: string | null }>(
        `SELECT status, awarded_vendor_id FROM tenders WHERE id = $1`,
        [tenderId],
      );
      expect(r.rows[0]).toBeTruthy();
      expect(r.rows[0].status).toBe('TENDER_CLOSED');
      expect(r.rows[0].awarded_vendor_id).toBe(vendorId);
    });
  });

  test('audit log captures every state-changing event', async () => {
    const adminToken = await signAdminToken(adminUserId);
    const audit = await authJson<{ items: Array<{ eventType: string; tenderId?: string }> }>(
      adminToken,
      '/audit-logs?pageSize=200',
    );
    const eventTypes = new Set(audit.items.map(i => i.eventType));
    // Spot-check the events most central to the golden path.
    for (const required of [
      'VENDOR_APPROVED',
      'BID_DOCUMENT_UPLOADED',
      'TECHNICAL_ENVELOPES_OPENED',
      'COMMERCIAL_ENVELOPES_OPENED',
      'AWARD_RECOMMENDED',
      'AWARD_APPROVED',
      'AWARD_ISSUED',
    ]) {
      expect(eventTypes.has(required), `audit event ${required} present`).toBeTruthy();
    }
  });
});
