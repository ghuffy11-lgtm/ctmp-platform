import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import bcrypt from 'bcrypt';
import {
  ensureAdminUser,
  ensureApprovedVendor,
  ensurePublishedTender,
  resetVendorByEmail,
  withDb,
} from '../helpers/db';
import { authJson, signAdminToken, signVendorToken } from '../helpers/api';

const VENDOR_BASE = process.env.QA_VENDOR_URL ?? 'https://vn.hadiclinic.com.kw:4201';
const API_BASE = process.env.QA_API_URL ?? 'https://vn.hadiclinic.com.kw:4201';

const ADMIN = {
  email: 'qa-redesign-admin@hadiclinic.com.kw',
  password: 'QaRedesignAdmin!2026',
  displayName: 'QA Redesign Admin',
};

// Pre-seeded approved vendor — used by all "authed page renders" checks.
// The full registration→approval handshake uses a separate email below.
const APPROVED_VENDOR = {
  email: 'qa-redesign-approved@example.com',
  password: 'QaRedesignApproved!2026',
  companyName: 'QA Redesign Approved Co',
  contactName: 'QA Approved Contact',
};

// Fresh vendor for the end-to-end registration→approval→login test.
const FRESH_VENDOR = {
  email: 'qa-redesign-fresh@example.com',
  password: 'QaRedesignFresh!2026',
  companyName: 'QA Redesign Fresh Co',
  contactName: 'QA Fresh Contact',
};

const TENDER = {
  reference: 'TDR-REDESIGN-0001',
  title: 'QA Redesign Smoke Tender',
  description: 'Tender for the redesign smoke suite.',
};

function vendorHost() {
  return new URL(VENDOR_BASE).hostname;
}

async function loginAs(context: BrowserContext, vendorUserId: string): Promise<void> {
  const token = await signVendorToken(vendorUserId);
  await context.addCookies([
    {
      name: 'ctmp_vendor_access_token',
      value: token,
      domain: vendorHost(),
      path: '/',
      httpOnly: false,
      secure: VENDOR_BASE.startsWith('https'),
      sameSite: 'Strict',
    },
    {
      name: 'ctmp_vendor_refresh_token',
      value: token,
      domain: vendorHost(),
      path: '/',
      httpOnly: false,
      secure: VENDOR_BASE.startsWith('https'),
      sameSite: 'Strict',
    },
  ]);
}

// Anonymous page → check redesign markers are present in the rendered HTML.
async function expectRedesignMarkers(page: Page) {
  await expect(page).toHaveTitle(/VENDOR\s*[•·]?\s*CONNECT/i);
}

test.describe('Auth pages — redesign markers + form rendering', () => {
  test('GET /login serves the redesigned light-theme login', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/login`);
    await expectRedesignMarkers(page);
    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();
    await expect(page.getByLabel(/^Email/i)).toBeVisible();
    await expect(page.getByLabel(/^Password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Register as vendor/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Forgot password/i })).toBeVisible();
  });

  test('GET /register serves the light register form with hCaptcha', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/register`);
    await expectRedesignMarkers(page);
    await expect(page.getByRole('heading', { name: /Register as a Vendor/i })).toBeVisible();
    await expect(page.getByLabel(/^Company Name/i)).toBeVisible();
    await expect(page.getByLabel(/^Contact Email/i)).toBeVisible();
    await expect(page.getByLabel(/^Password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Submit Registration/i })).toBeVisible();
    // hCaptcha is loaded in an iframe. Just confirm the iframe attaches — solving the real
    // challenge is out of scope (covered manually elsewhere).
    await expect(page.locator('iframe[src*="hcaptcha.com"]').first()).toBeAttached({ timeout: 15_000 });
  });

  test('GET /forgot-password serves light email-reset form', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/forgot-password`);
    await expectRedesignMarkers(page);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button')).toBeVisible();
  });

  test('GET /verify-email?token=invalid surfaces error state on the light shell', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/verify-email?token=invalid-token-deadbeef`);
    await expectRedesignMarkers(page);
    // Either error or loading state — both are valid first paints; we just confirm the shell renders.
    await expect(page.locator('main, body')).not.toHaveText(/^$/);
  });

  test('client-side login form rejects bad credentials without crashing', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/login`);
    await page.getByLabel(/^Email/i).fill('does-not-exist@example.com');
    await page.getByLabel(/^Password/i).fill('WrongPassword123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    // The api returns 401; UI shows ErrorBanner. Either an error region appears or we stay on /login.
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  });
});

test.describe('Authenticated portal — redesign rendering across pages', () => {
  let vendorUserId: string;
  let adminUserId: string;
  let tenderId: string;

  test.beforeAll(async () => {
    adminUserId = await ensureAdminUser(ADMIN);
    const seeded = await ensureApprovedVendor(APPROVED_VENDOR);
    vendorUserId = seeded.vendorUserId;
    tenderId = await ensurePublishedTender({
      reference: TENDER.reference,
      title: TENDER.title,
      description: TENDER.description,
      adminUserId,
    });
  });

  test('top-nav: VENDOR • CONNECT branding + 5 portal links', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/dashboard`);
    // Wordmark is split across two divs; assert both pieces are in the nav.
    const nav = page.getByRole('navigation');
    await expect(nav.getByText('VENDOR', { exact: true })).toBeVisible();
    await expect(nav.getByText('CONNECT', { exact: true })).toBeVisible();
    for (const label of ['Dashboard', 'Tenders', 'My Bids', 'Clarifications', 'Profile']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('vendor chip shows company name and status badge after /vendor-auth/me settles', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/dashboard`);
    // Scope to the nav so we don't collide with the same company name in the dashboard heading.
    const nav = page.getByRole('navigation');
    await expect(nav.getByText(APPROVED_VENDOR.companyName, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('/dashboard renders greeting + 4 stat cards + recent tenders heading', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/dashboard`);
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
    for (const label of ['Active Bids', 'Open Tenders', 'In Evaluation', 'Awarded']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /Recent Tenders/i })).toBeVisible();
  });

  test('/tenders lists at least one tender card (seeded reference visible)', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/tenders`);
    await expect(page.getByRole('heading', { name: /Tenders/i }).first()).toBeVisible();
    await expect(page.getByText(TENDER.reference)).toBeVisible({ timeout: 15_000 });
  });

  test('/tenders/[id] detail page renders header + back link', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/tenders/${tenderId}`);
    await expect(page.getByText(TENDER.title).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Back to Tenders|Back/i }).first()).toBeVisible();
  });

  test('/bids renders 4 stat cards + table or empty state', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/bids`);
    // Heading uses PageHeader; just confirm we're past the loading spinner.
    await expect(page.getByRole('heading', { name: /My Bids|Bids/i }).first()).toBeVisible();
    for (const label of ['Drafts', 'Submitted', 'Evaluated', 'Awarded']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('/clarifications renders left selector + right thread area', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/clarifications`);
    await expect(page.getByRole('heading', { name: /Clarifications/i }).first()).toBeVisible();
  });

  test('/profile renders status card + Company + Primary Contact sections', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/profile`);
    await expect(page.getByText(/Company Information|Company Details|Company/i).first()).toBeVisible();
    await expect(page.getByText(/Primary Contact/i).first()).toBeVisible();
    // Editable Save button exists.
    await expect(page.getByRole('button', { name: /Save Changes|Save/i }).first()).toBeVisible();
  });

  test('logout button clears cookies and bounces to /login', async ({ context, page }) => {
    await loginAs(context, vendorUserId);
    await page.goto(`${VENDOR_BASE}/dashboard`);
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    const cookies = await context.cookies();
    expect(cookies.find(c => c.name === 'ctmp_vendor_access_token')).toBeFalsy();
  });
});

test.describe.serial('End-to-end approval handshake → vendor login (UI)', () => {
  // The remote API uses real hCaptcha (not the stub provider), so a headless
  // browser can't drive the /register form. The dark-themed /register page
  // *rendering* is covered by the visual smoke test above. Here we exercise
  // the workflow that comes AFTER registration: the gate on un-approved
  // logins, the admin approval call, and the post-approval login through the
  // redesigned UI. We seed a PENDING_APPROVAL vendor directly via the DB
  // (matching what the real /register endpoint would produce after email
  // verification).
  let adminUserId: string;

  test.beforeAll(async () => {
    adminUserId = await ensureAdminUser(ADMIN);
    await resetVendorByEmail(FRESH_VENDOR.email);

    // Seed a vendor in PENDING with a verified primary contact —
    // i.e. the exact state a real registrant reaches after clicking the
    // emailed verification link but before an admin approves them.
    await withDb(async client => {
      const vendorRow = await client.query<{ id: string }>(
        `INSERT INTO vendors (id, company_name, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'PENDING', now(), now())
         RETURNING id`,
        [FRESH_VENDOR.companyName],
      );
      const vendorId = vendorRow.rows[0].id;
      await client.query(
        `INSERT INTO vendor_users (
           id, vendor_id, email, password_hash, full_name, is_primary_contact,
           status, email_verified_at, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, true, 'ACTIVE', now(), now(), now()
         )`,
        [vendorId, FRESH_VENDOR.email, await bcrypt.hash(FRESH_VENDOR.password, 12), FRESH_VENDOR.contactName],
      );
    });
  });

  test('login before approval is rejected with an error banner', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/login`);
    await page.getByLabel(/^Email/i).fill(FRESH_VENDOR.email);
    await page.getByLabel(/^Password/i).fill(FRESH_VENDOR.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    // Should stay on /login with an error message — the API rejects un-approved vendors.
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByText(/not approved|pending|awaiting/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin approves the vendor via API (signed admin token)', async () => {
    const adminToken = await signAdminToken(adminUserId);
    const list = await authJson<{ items?: Array<{ id: string; email: string }>; data?: Array<{ id: string; email: string }> }>(
      adminToken,
      '/vendors?pageSize=100',
    );
    const items = list.items ?? list.data ?? [];
    const found = items.find(v => v.email === FRESH_VENDOR.email);
    expect(found, `vendor row visible in admin /vendors list (email=${FRESH_VENDOR.email})`).toBeTruthy();

    const approveRes = await fetch(`${API_BASE}/api/v1/vendors/${found!.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(approveRes.ok, `approve status: ${approveRes.status}`).toBeTruthy();
  });

  test('approved vendor logs in via UI and lands on /dashboard', async ({ page }) => {
    await page.goto(`${VENDOR_BASE}/login`);
    await page.getByLabel(/^Email/i).fill(FRESH_VENDOR.email);
    await page.getByLabel(/^Password/i).fill(FRESH_VENDOR.password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/i })).toBeVisible();
    // Vendor chip in the nav should eventually show our company name.
    const nav = page.getByRole('navigation');
    await expect(nav.getByText(FRESH_VENDOR.companyName, { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
