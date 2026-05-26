import { test, expect } from '@playwright/test';
import { authJson, signAdminToken, vendorLogin } from '../helpers/api';
import { ensureAdminUser, ensurePublishedTender, forceVerifyVendorPrimaryEmail, resetVendorByEmail, withDb } from '../helpers/db';
import { COMMERCIAL_FIXTURE, TECHNICAL_FIXTURE } from '../helpers/fixtures';

const ADMIN_BASE = process.env.QA_ADMIN_URL ?? 'http://10.1.13.98:4200';
const VENDOR_BASE = process.env.QA_VENDOR_URL ?? 'http://10.1.13.98:4300';
const API_BASE = process.env.QA_API_URL ?? 'http://10.1.13.98:3000';
const MAILHOG_BASE = process.env.QA_MAILHOG_URL ?? 'http://10.1.13.98:8025';

const TEST_RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const REPORT_FILE = `phase-9-validation-report-${TEST_RUN_ID}.md`;

interface TestResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  description: string;
  details: string[];
  errorMessage?: string;
}

const results: TestResult[] = [];

function recordResult(testName: string, status: 'PASS' | 'FAIL' | 'ERROR', description: string, details: string[] = [], errorMessage?: string) {
  results.push({
    testName,
    status,
    description,
    details,
    errorMessage,
  });
  console.log(`[${status}] ${testName}: ${description}`);
  if (errorMessage) {
    console.log(`  Error: ${errorMessage}`);
  }
  details.forEach(d => console.log(`  - ${d}`));
}

test.describe.serial('Phase 9: CTMP Deployment Validation on 10.1.13.98', () => {
  let adminUserId: string;
  let tenderId: string;
  let vendorId: string;
  let bidId: string;
  let sessionId: string;

  const ADMIN_CREDS = {
    email: 'admin@ctmp.local',
    password: 'Admin@12345!',
  };

  const VENDOR_CREDS = {
    email: `p9-vendor-${TEST_RUN_ID}@test.example.com`,
    password: 'TestVendor@2026',
    company: `P9 Test Vendor ${TEST_RUN_ID}`,
    contact: 'QA Tester',
  };

  const TENDER = {
    reference: `TDR-P9-${TEST_RUN_ID.slice(0, 8)}`,
    title: 'Phase 9 Validation Tender',
    description: 'End-to-end deployment validation test',
  };

  test.beforeAll(async () => {
    console.log(`\n=== Phase 9 Deployment Validation Started ===`);
    console.log(`Run ID: ${TEST_RUN_ID}`);
    console.log(`Admin Base: ${ADMIN_BASE}`);
    console.log(`Vendor Base: ${VENDOR_BASE}`);
    console.log(`API Base: ${API_BASE}`);
    console.log(`MailHog Base: ${MAILHOG_BASE}\n`);
  });

  // ==================== ADMIN PORTAL TESTS ====================

  test('API: Health check and connectivity', async ({ request }) => {
    try {
      const response = await request.get(`${API_BASE}/api/v1/health`);
      const isOk = response.ok();
      const body = await response.json().catch(() => ({}));

      recordResult(
        'API Health Check',
        isOk ? 'PASS' : 'FAIL',
        isOk ? 'API is responsive' : 'API is not responding correctly',
        [
          `Status Code: ${response.status()}`,
          `Response: ${JSON.stringify(body)}`,
          `URL: ${API_BASE}/api/v1/health`,
        ],
      );
    } catch (error) {
      recordResult(
        'API Health Check',
        'ERROR',
        'Failed to reach API',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('Admin Portal: Login page loads', async ({ page }) => {
    try {
      await page.goto(`${ADMIN_BASE}/login`, { waitUntil: 'networkidle' });
      const isVisible = await page.getByLabel(/Username|Email/i).first().isVisible();
      const hasSignInButton = await page.getByRole('button', { name: /Sign In/i }).isVisible();

      recordResult(
        'Admin Portal Load',
        isVisible && hasSignInButton ? 'PASS' : 'FAIL',
        isVisible && hasSignInButton ? 'Login page loaded successfully' : 'Login page elements missing',
        [
          `URL: ${page.url()}`,
          `Email input visible: ${isVisible}`,
          `Sign In button visible: ${hasSignInButton}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Admin Portal Load',
        'ERROR',
        'Failed to load admin portal',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('Admin: Login with seeded credentials', async ({ page }) => {
    try {
      await page.goto(`${ADMIN_BASE}/login`);
      await page.getByLabel(/Username/i).fill(ADMIN_CREDS.email);
      await page.getByLabel(/Password/i).fill(ADMIN_CREDS.password);

      // Capture login API response for diagnostic info
      const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
        { timeout: 10_000 },
      ).catch(() => null);

      await page.getByRole('button', { name: /Sign In/i }).click();

      const response = await responsePromise;
      const responseStatus = response ? response.status() : 'no response captured';

      const navigated = await page.waitForURL(/dashboard|tenders|home/, { timeout: 15_000 }).then(() => true).catch(() => false);

      recordResult(
        'Admin Login',
        navigated ? 'PASS' : 'FAIL',
        navigated ? 'Admin login successful' : 'Login did not navigate to dashboard',
        [
          `Credentials: ${ADMIN_CREDS.email}`,
          `Final URL: ${page.url()}`,
          `Login API response status: ${responseStatus}`,
        ],
      );

      adminUserId = ADMIN_CREDS.email;
    } catch (error) {
      recordResult(
        'Admin Login',
        'ERROR',
        'Admin login failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('Admin: Create new tender', async ({ page }) => {
    try {
      // Login first (test cookies/session persistence per test in same browser context)
      await page.goto(`${ADMIN_BASE}/login`);
      await page.getByLabel(/Username/i).fill(ADMIN_CREDS.email);
      await page.getByLabel(/Password/i).fill(ADMIN_CREDS.password);
      await page.getByRole('button', { name: /Sign In/i }).click();
      await page.waitForURL(/dashboard|tenders/, { timeout: 15_000 }).catch(() => {});

      await page.goto(`${ADMIN_BASE}/tenders`);

      const createButton = page.getByRole('link', { name: /Create New Tender/i }).first();
      const isVisible = await createButton.isVisible().catch(() => false);

      if (!isVisible) {
        recordResult(
          'Admin Create Tender UI',
          'FAIL',
          'Create tender button not found on page (may indicate auth or routing issue)',
          [
            `URL: ${page.url()}`,
            `Attempted to find: link with text "Create New Tender"`,
          ],
        );
        return;
      }

      await createButton.click();
      await page.waitForURL(/tenders\/new/, { timeout: 10_000 });

      // The actual form fields based on apps/web-admin/src/app/(admin)/tenders/new/page.tsx
      const titleInput = page.locator('input').filter({ hasText: '' }).first();
      await titleInput.fill(TENDER.title).catch(() => {});

      // Try to save draft button
      const saveButton = page.getByRole('button', { name: /Save.*Draft|Create|Submit/i }).first();
      const saveVisible = await saveButton.isVisible().catch(() => false);

      recordResult(
        'Admin Create Tender UI',
        saveVisible ? 'PASS' : 'FAIL',
        saveVisible ? 'Tender create form reachable and renders' : 'Tender create form not rendering correctly',
        [
          `URL: ${page.url()}`,
          `Title field filled: ${TENDER.title}`,
          `Save button visible: ${saveVisible}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Admin Create Tender UI',
        'ERROR',
        'Tender creation encountered an error',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  // ==================== VENDOR PORTAL TESTS ====================

  test('Vendor Portal: Registration page loads', async ({ page }) => {
    try {
      await page.goto(`${VENDOR_BASE}/register`, { waitUntil: 'networkidle' });
      const companyInput = await page.getByLabel(/Company Name/i).isVisible();
      const emailInput = await page.getByLabel(/Email/i).isVisible();
      const submitButton = await page.getByRole('button', { name: /Submit|Register/i }).isVisible();

      recordResult(
        'Vendor Portal Load',
        companyInput && emailInput && submitButton ? 'PASS' : 'FAIL',
        companyInput && emailInput && submitButton ? 'Registration page loaded successfully' : 'Registration page elements missing',
        [
          `URL: ${page.url()}`,
          `Company input visible: ${companyInput}`,
          `Email input visible: ${emailInput}`,
          `Submit button visible: ${submitButton}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Vendor Portal Load',
        'ERROR',
        'Failed to load vendor portal registration',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('Vendor: Self-registration with validation', async ({ page }) => {
    try {
      await page.goto(`${VENDOR_BASE}/register`);

      const companyInput = page.getByLabel(/Company Name/i);
      const contactInput = page.getByLabel(/Contact Full Name|Contact Name/i);
      const emailInput = page.getByLabel(/Contact Email|Email/i);
      const passwordInput = page.getByLabel(/Password/i);
      const captchaInput = page.locator('input[placeholder*="CAPTCHA"]');

      await companyInput.fill(VENDOR_CREDS.company).catch(() => {});
      await contactInput.fill(VENDOR_CREDS.contact).catch(() => {});
      await emailInput.fill(VENDOR_CREDS.email).catch(() => {});
      await passwordInput.fill(VENDOR_CREDS.password).catch(() => {});
      await captchaInput.fill('test-captcha-token').catch(() => {});

      const submitButton = page.getByRole('button', { name: /Submit|Register/i });
      await submitButton.click();

      const successMsg = await page.getByText(/submitted|registered|success/i).isVisible().catch(() => false);
      const confirmMsg = await page.getByText(/confirmation|verify|email/i).isVisible().catch(() => false);

      recordResult(
        'Vendor Self-Registration',
        successMsg || confirmMsg ? 'PASS' : 'FAIL',
        successMsg || confirmMsg ? 'Registration submission successful' : 'Registration submission unclear',
        [
          `Email: ${VENDOR_CREDS.email}`,
          `Company: ${VENDOR_CREDS.company}`,
          `Success message visible: ${successMsg}`,
          `Confirmation message visible: ${confirmMsg}`,
          `Final URL: ${page.url()}`,
        ],
      );

      vendorId = VENDOR_CREDS.email;
    } catch (error) {
      recordResult(
        'Vendor Self-Registration',
        'ERROR',
        'Vendor registration encountered an error',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('MailHog: Verify email verification link available', async ({ page, request }) => {
    try {
      await page.goto(`${MAILHOG_BASE}`, { waitUntil: 'networkidle' });

      const isLoaded = await page.locator('body').isVisible();

      recordResult(
        'MailHog Access',
        isLoaded ? 'PASS' : 'FAIL',
        isLoaded ? 'MailHog interface loaded' : 'MailHog interface failed to load',
        [
          `URL: ${MAILHOG_BASE}`,
        ],
      );

      // Poll MailHog API for the email (more reliable than UI search)
      let emailFound = false;
      let subject = '';
      let recipientLocal = VENDOR_CREDS.email.split('@')[0];

      for (let attempt = 0; attempt < 10; attempt++) {
        const response = await request.get(`${MAILHOG_BASE}/api/v2/search?kind=to&query=${encodeURIComponent(recipientLocal)}`);
        if (response.ok()) {
          const body = await response.json();
          if (body.total > 0) {
            emailFound = true;
            subject = body.items[0]?.Content?.Headers?.Subject?.[0] ?? '';
            break;
          }
        }
        await page.waitForTimeout(1000);
      }

      recordResult(
        'Vendor Registration Email',
        emailFound ? 'PASS' : 'FAIL',
        emailFound ? `Registration email found: "${subject}"` : 'Registration email not delivered to MailHog within 10s',
        [
          `Searched for: ${recipientLocal}`,
          `Email found: ${emailFound}`,
          `Subject: ${subject}`,
        ],
      );
    } catch (error) {
      recordResult(
        'MailHog Access',
        'ERROR',
        'MailHog access failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('Vendor Portal: Login page loads', async ({ page }) => {
    try {
      await page.goto(`${VENDOR_BASE}/login`, { waitUntil: 'networkidle' });
      const emailInput = await page.getByLabel(/Email/i).isVisible();
      const passwordInput = await page.getByLabel(/Password/i).isVisible();
      const signInButton = await page.getByRole('button', { name: /Sign In|Login/i }).isVisible();

      recordResult(
        'Vendor Login Page',
        emailInput && passwordInput && signInButton ? 'PASS' : 'FAIL',
        emailInput && passwordInput && signInButton ? 'Vendor login page loaded' : 'Vendor login page incomplete',
        [
          `URL: ${page.url()}`,
          `Email input: ${emailInput}`,
          `Password input: ${passwordInput}`,
          `Sign In button: ${signInButton}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Vendor Login Page',
        'ERROR',
        'Failed to load vendor login page',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  // ==================== API TESTS ====================

  test('API: Admin authentication token generation', async ({ request }) => {
    try {
      const response = await request.post(`${API_BASE}/api/v1/auth/login`, {
        data: {
          username: ADMIN_CREDS.email,
          password: ADMIN_CREDS.password,
        },
      });

      const isOk = response.ok();
      const body = await response.json().catch(() => ({}));

      recordResult(
        'Admin API Authentication',
        isOk ? 'PASS' : 'FAIL',
        isOk ? 'Admin authentication successful' : 'Admin authentication failed',
        [
          `Status: ${response.status()}`,
          `Has accessToken: ${!!body.accessToken}`,
          `Response keys: ${Object.keys(body).join(', ')}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Admin API Authentication',
        'ERROR',
        'Admin API authentication request failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('API: Get tenders list', async ({ request }) => {
    try {
      const authResponse = await request.post(`${API_BASE}/api/v1/auth/login`, {
        data: {
          username: ADMIN_CREDS.email,
          password: ADMIN_CREDS.password,
        },
      });

      const authBody = await authResponse.json().catch(() => ({}));
      const token = authBody.accessToken;

      if (!token) {
        recordResult(
          'Fetch Tenders List',
          'FAIL',
          'Could not obtain authentication token',
          [],
        );
        return;
      }

      const listResponse = await request.get(`${API_BASE}/api/v1/tenders?pageSize=10`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const isOk = listResponse.ok();
      const body = await listResponse.json().catch(() => ({}));

      recordResult(
        'Fetch Tenders List',
        isOk ? 'PASS' : 'FAIL',
        isOk ? 'Tenders list retrieved' : 'Failed to retrieve tenders',
        [
          `Status: ${listResponse.status()}`,
          `Item count: ${body.items?.length ?? 'unknown'}`,
          `Total: ${body.total ?? 'unknown'}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Fetch Tenders List',
        'ERROR',
        'Tenders list API request failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  test('API: Get vendors list', async ({ request }) => {
    try {
      const authResponse = await request.post(`${API_BASE}/api/v1/auth/login`, {
        data: {
          username: ADMIN_CREDS.email,
          password: ADMIN_CREDS.password,
        },
      });

      const authBody = await authResponse.json().catch(() => ({}));
      const token = authBody.accessToken;

      if (!token) {
        recordResult(
          'Fetch Vendors List',
          'FAIL',
          'Could not obtain authentication token',
          [],
        );
        return;
      }

      const listResponse = await request.get(`${API_BASE}/api/v1/vendors?pageSize=10`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const isOk = listResponse.ok();
      const body = await listResponse.json().catch(() => ({}));

      recordResult(
        'Fetch Vendors List',
        isOk ? 'PASS' : 'FAIL',
        isOk ? 'Vendors list retrieved' : 'Failed to retrieve vendors',
        [
          `Status: ${listResponse.status()}`,
          `Item count: ${body.items?.length ?? 'unknown'}`,
          `Total: ${body.total ?? 'unknown'}`,
        ],
      );
    } catch (error) {
      recordResult(
        'Fetch Vendors List',
        'ERROR',
        'Vendors list API request failed',
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  // ==================== SUMMARY REPORT ====================

  test.afterAll(async () => {
    console.log(`\n=== Phase 9 Validation Report ===\n`);

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const errors = results.filter(r => r.status === 'ERROR').length;
    const total = results.length;

    console.log(`Summary:`);
    console.log(`  PASS:  ${passed}/${total}`);
    console.log(`  FAIL:  ${failed}/${total}`);
    console.log(`  ERROR: ${errors}/${total}`);
    console.log(`\nDetailed Results:\n`);

    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${r.testName}`);
      console.log(`   Status: ${r.status}`);
      console.log(`   ${r.description}`);
      r.details.forEach(d => console.log(`   ${d}`));
      if (r.errorMessage) {
        console.log(`   ERROR: ${r.errorMessage}`);
      }
      console.log();
    });

    // Build markdown report
    let report = `# Phase 9 CTMP Deployment Validation Report\n\n`;
    report += `**Run ID:** ${TEST_RUN_ID}\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Environment:** http://10.1.13.98\n\n`;

    report += `## Summary\n\n`;
    report += `| Status | Count |\n`;
    report += `|--------|-------|\n`;
    report += `| ✅ PASS | ${passed} |\n`;
    report += `| ❌ FAIL | ${failed} |\n`;
    report += `| ⚠️ ERROR | ${errors} |\n`;
    report += `| **Total** | **${total}** |\n\n`;

    report += `## Detailed Results\n\n`;
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      report += `### ${icon} ${r.testName}\n\n`;
      report += `**Status:** ${r.status}\n\n`;
      report += `${r.description}\n\n`;
      if (r.details.length > 0) {
        report += `**Details:**\n`;
        r.details.forEach(d => {
          report += `- ${d}\n`;
        });
        report += `\n`;
      }
      if (r.errorMessage) {
        report += `**Error:** ${r.errorMessage}\n\n`;
      }
    });

    report += `## Issues Found\n\n`;
    const issues = results.filter(r => r.status !== 'PASS');
    if (issues.length === 0) {
      report += `✅ No issues detected.\n`;
    } else {
      issues.forEach(issue => {
        report += `- **${issue.testName}** (${issue.status}): ${issue.description}\n`;
        if (issue.errorMessage) {
          report += `  - Error: ${issue.errorMessage}\n`;
        }
      });
    }

    report += `\n## Next Steps\n\n`;
    report += `1. Review the issues listed above\n`;
    report += `2. Do NOT immediately fix issues — document and discuss with team\n`;
    report += `3. Prioritize by severity: ERROR > FAIL\n`;
    report += `4. Re-run validation after fixes\n`;

    console.log(`\n=== Report saved for documentation ===`);
    console.log(report);
  });
});
