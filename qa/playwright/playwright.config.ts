import { defineConfig, devices } from '@playwright/test';

const ADMIN_BASE = process.env.QA_ADMIN_URL ?? 'http://localhost:4200';
const VENDOR_BASE = process.env.QA_VENDOR_URL ?? 'http://localhost:4300';
const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1, // golden path mutates DB; keep single worker
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    adminBase: ADMIN_BASE,
    vendorBase: VENDOR_BASE,
    apiBase: API_BASE,
  },
});
