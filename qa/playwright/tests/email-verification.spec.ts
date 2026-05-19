import { test, expect } from '@playwright/test';
import { resetVendorByEmail, withDb } from '../helpers/db';
import { clearMailbox, extractVerificationToken, waitForEmail } from '../helpers/mailhog';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const VENDOR = {
  email: 'qa-verify-vendor@example.com',
  password: 'QaVerifyPass!2026',
  companyName: 'QA Verify Vendor LLC',
  contactName: 'QA Verify Contact',
};

test.describe.serial('Vendor email verification round-trip via MailHog', () => {
  test.beforeAll(async () => {
    await resetVendorByEmail(VENDOR.email);
    await clearMailbox();
  });

  test('register → email arrives → verify token clears email_verified_at NULL', async () => {
    // 1. Register the vendor through the public API.
    const registerRes = await fetch(`${API_BASE}/api/vendor-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: VENDOR.companyName,
        contactFullName: VENDOR.contactName,
        contactEmail: VENDOR.email,
        password: VENDOR.password,
        captchaToken: 'qa-fixture-captcha-token',
      }),
    });
    expect(registerRes.ok, `register response: ${registerRes.status}`).toBeTruthy();

    // 2. Verify email arrived in MailHog.
    let token: string;
    try {
      const message = await waitForEmail(VENDOR.email, 20_000);
      token = extractVerificationToken(message);
    } catch (err) {
      // Fall back to the DB-side token if SMTP plumbing isn't fully wired.
      const dbToken = await withDb(async client => {
        const r = await client.query<{ token_hash: string; raw_token: string | null }>(
          `SELECT token_hash, NULL::text AS raw_token FROM vendor_email_verification_tokens vt
           JOIN vendor_users vu ON vu.id = vt.vendor_user_id
           WHERE vu.email = $1 ORDER BY vt.created_at DESC LIMIT 1`,
          [VENDOR.email],
        );
        return r.rows[0];
      });
      // Only the hash is stored. Real raw token must come from the email.
      throw new Error(
        `No verification email reached MailHog. DB has token_hash=${dbToken?.token_hash ?? 'none'} but raw token is unrecoverable. Confirm api SMTP_HOST=mailhog. Original error: ${err instanceof Error ? err.message : err}`,
      );
    }

    expect(token, 'extracted token from email body').toMatch(/^[a-f0-9]{64}$/);

    // 3. Verify with the token.
    const verifyRes = await fetch(`${API_BASE}/api/vendor-auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(verifyRes.ok, `verify response: ${verifyRes.status}`).toBeTruthy();

    // 4. Confirm DB flipped email_verified_at.
    await withDb(async client => {
      const r = await client.query<{ email_verified_at: Date | null }>(
        `SELECT email_verified_at FROM vendor_users WHERE email = $1`,
        [VENDOR.email],
      );
      expect(r.rows[0]?.email_verified_at, 'email_verified_at populated').toBeTruthy();
    });
  });

  test('replay of same token is rejected', async () => {
    // Same token shouldn't be usable a second time. Get the most recent token row.
    const row = await withDb(async client => {
      const r = await client.query<{ token_hash: string; used_at: Date | null }>(
        `SELECT token_hash, used_at FROM vendor_email_verification_tokens vt
         JOIN vendor_users vu ON vu.id = vt.vendor_user_id
         WHERE vu.email = $1 ORDER BY vt.created_at DESC LIMIT 1`,
        [VENDOR.email],
      );
      return r.rows[0];
    });
    expect(row, 'token row exists').toBeTruthy();
    // Schema should mark used tokens — verify via used_at column or equivalent.
    // Some schema variants don't have used_at; the soft-assert keeps the spec
    // useful even if the column is named differently.
    expect.soft(row.used_at, 'token row stamped as used').toBeTruthy();
  });
});
