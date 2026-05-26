import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

const ADMIN_BASE = process.env.QA_ADMIN_URL ?? 'http://10.1.13.98:4200';

const ADMIN_CREDS = {
  username: 'admin@ctmp.local',
  password: 'Admin@12345!',
};

interface PageCheck {
  path: string;
  name: string;
  expectVisible?: RegExp;
}

const ADMIN_PAGES: PageCheck[] = [
  { path: '/dashboard',            name: 'Dashboard',            expectVisible: /Dashboard|Overview|Welcome/i },
  { path: '/tenders',              name: 'Tenders List',         expectVisible: /All Tenders|Tenders/i },
  { path: '/tenders/new',          name: 'Create Tender',        expectVisible: /Create New Tender|Basic Information/i },
  { path: '/vendors',              name: 'Vendors List',         expectVisible: /Vendor|Companies/i },
  { path: '/approvals',            name: 'Approvals',            expectVisible: /Approval/i },
  { path: '/clarifications',       name: 'Clarifications',       expectVisible: /Clarification/i },
  { path: '/technical-evaluation', name: 'Technical Evaluation', expectVisible: /Technical|Evaluation/i },
  { path: '/committee-opening',    name: 'Committee Opening',    expectVisible: /Committee|Opening/i },
  { path: '/commercial-comparison',name: 'Commercial Comparison',expectVisible: /Commercial|Comparison/i },
  { path: '/reports',              name: 'Reports',              expectVisible: /Report/i },
  { path: '/audit-log',            name: 'Audit Log',            expectVisible: /Audit/i },
  { path: '/security-alerts',      name: 'Security Alerts',      expectVisible: /Security|Alert/i },
  { path: '/settings',             name: 'Settings',             expectVisible: /Setting/i },
];

interface PageResult {
  name: string;
  path: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  consoleErrors: string[];
  failedRequests: { url: string; status: number; statusText: string }[];
  loadTimeMs: number;
  contentVisible: boolean;
  note?: string;
}

const results: PageResult[] = [];

async function loginAsAdmin(page: Page) {
  await page.goto(`${ADMIN_BASE}/login`);
  await page.getByLabel('Username', { exact: true }).fill(ADMIN_CREDS.username);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_CREDS.password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL(/dashboard|tenders/, { timeout: 15_000 });
}

test.describe.serial('Admin Portal — logged-in page tour', () => {
  let page: Page;
  const consoleMessages: ConsoleMessage[] = [];

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') consoleMessages.push(msg);
    });

    await loginAsAdmin(page);
    console.log(`\n=== Logged in as ${ADMIN_CREDS.username} ===`);
    console.log(`=== Touring ${ADMIN_PAGES.length} admin pages ===\n`);
  });

  for (const check of ADMIN_PAGES) {
    test(`visit ${check.name} (${check.path})`, async () => {
      const consoleErrors: string[] = [];
      const failedRequests: { url: string; status: number; statusText: string }[] = [];

      const consoleHandler = (msg: ConsoleMessage) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter known noise
          if (text.includes('Failed to load resource') && text.includes('favicon')) return;
          consoleErrors.push(text);
        }
      };
      const responseHandler = (response: import('@playwright/test').Response) => {
        const status = response.status();
        if (status >= 400) {
          failedRequests.push({
            url: response.url(),
            status,
            statusText: response.statusText(),
          });
        }
      };

      page.on('console', consoleHandler);
      page.on('response', responseHandler);

      const startTime = Date.now();
      let contentVisible = false;
      let note = '';

      try {
        const response = await page.goto(`${ADMIN_BASE}${check.path}`, {
          waitUntil: 'networkidle',
          timeout: 30_000,
        });

        if (!response) {
          note = 'No response received';
        } else if (response.status() >= 400) {
          note = `Page returned ${response.status()}`;
        }

        // Give client-side rendering a moment
        await page.waitForTimeout(2000);

        // Check if expected content is visible
        if (check.expectVisible) {
          contentVisible = await page.getByText(check.expectVisible).first().isVisible().catch(() => false);
        } else {
          contentVisible = true;
        }

        // Check if redirected to login (lost auth)
        const finalUrl = page.url();
        if (finalUrl.includes('/login') && check.path !== '/login') {
          note = `Redirected to /login (auth lost or page requires permission)`;
        }
      } catch (e) {
        note = e instanceof Error ? e.message : String(e);
      } finally {
        page.off('console', consoleHandler);
        page.off('response', responseHandler);
      }

      const loadTimeMs = Date.now() - startTime;

      const hasErrors = consoleErrors.length > 0 || failedRequests.length > 0;
      const status: PageResult['status'] = (note && note.includes('Redirected to /login'))
        ? 'WARN'
        : (!contentVisible || hasErrors)
          ? (contentVisible ? 'WARN' : 'FAIL')
          : 'PASS';

      const result: PageResult = {
        name: check.name,
        path: check.path,
        status,
        consoleErrors,
        failedRequests,
        loadTimeMs,
        contentVisible,
        note: note || undefined,
      };
      results.push(result);

      const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
      console.log(`${icon} ${check.name.padEnd(28)} ${check.path.padEnd(28)} ${loadTimeMs}ms`);
      if (consoleErrors.length > 0) {
        console.log(`   Console errors (${consoleErrors.length}):`);
        consoleErrors.slice(0, 5).forEach(e => console.log(`     - ${e.slice(0, 200)}`));
      }
      if (failedRequests.length > 0) {
        console.log(`   Failed requests (${failedRequests.length}):`);
        failedRequests.slice(0, 5).forEach(r => console.log(`     - ${r.status} ${r.url}`));
      }
      if (note) console.log(`   Note: ${note}`);

      // Don't fail the test outright — we want to record all pages
      expect(true).toBeTruthy();
    });
  }

  test.afterAll(async () => {
    const passed = results.filter(r => r.status === 'PASS').length;
    const warned = results.filter(r => r.status === 'WARN').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const total = results.length;

    console.log(`\n========== ADMIN PAGE TOUR SUMMARY ==========`);
    console.log(`Total pages visited: ${total}`);
    console.log(`✅ PASS:  ${passed}`);
    console.log(`⚠️  WARN:  ${warned}`);
    console.log(`❌ FAIL:  ${failed}`);
    console.log(``);

    if (failed > 0 || warned > 0) {
      console.log(`--- ISSUES FOUND ---\n`);
      results.filter(r => r.status !== 'PASS').forEach(r => {
        console.log(`${r.status === 'FAIL' ? '❌' : '⚠️ '} ${r.name} (${r.path})`);
        if (r.note) console.log(`   Note: ${r.note}`);
        if (!r.contentVisible) console.log(`   Content not visible`);
        if (r.consoleErrors.length > 0) {
          console.log(`   Console errors:`);
          r.consoleErrors.forEach(e => console.log(`     - ${e.slice(0, 250)}`));
        }
        if (r.failedRequests.length > 0) {
          console.log(`   Failed network requests:`);
          r.failedRequests.forEach(req => console.log(`     - ${req.status} ${req.statusText}: ${req.url}`));
        }
        console.log(``);
      });
    }

    // Markdown report
    let md = `# Admin Page Tour Report\n\n`;
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Admin:** ${ADMIN_CREDS.username}\n`;
    md += `**Base URL:** ${ADMIN_BASE}\n\n`;
    md += `## Summary\n\n`;
    md += `| Status | Count |\n|---|---|\n`;
    md += `| ✅ PASS | ${passed} |\n`;
    md += `| ⚠️ WARN | ${warned} |\n`;
    md += `| ❌ FAIL | ${failed} |\n`;
    md += `| **Total** | **${total}** |\n\n`;
    md += `## Page Details\n\n`;
    md += `| Status | Page | Path | Load (ms) | Console Errors | Failed Requests | Note |\n`;
    md += `|---|---|---|---|---|---|---|\n`;
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
      md += `| ${icon} ${r.status} | ${r.name} | \`${r.path}\` | ${r.loadTimeMs} | ${r.consoleErrors.length} | ${r.failedRequests.length} | ${r.note ?? ''} |\n`;
    });
    md += `\n## Issues Detail\n\n`;
    const issues = results.filter(r => r.status !== 'PASS');
    if (issues.length === 0) {
      md += `_No issues found._\n`;
    } else {
      issues.forEach(r => {
        md += `### ${r.status === 'FAIL' ? '❌' : '⚠️'} ${r.name} (${r.path})\n\n`;
        if (r.note) md += `**Note:** ${r.note}\n\n`;
        if (!r.contentVisible) md += `- Expected content not visible on page\n`;
        if (r.consoleErrors.length > 0) {
          md += `**Console errors:**\n\`\`\`\n${r.consoleErrors.join('\n')}\n\`\`\`\n\n`;
        }
        if (r.failedRequests.length > 0) {
          md += `**Failed requests:**\n`;
          r.failedRequests.forEach(req => {
            md += `- \`${req.status} ${req.statusText}\` ${req.url}\n`;
          });
          md += `\n`;
        }
      });
    }

    console.log(`\n=== Markdown report ===\n`);
    console.log(md);
  });
});
