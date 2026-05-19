import { test, expect } from '@playwright/test';
import { resetVendorByEmail, withDb } from '../helpers/db';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const VENDOR = {
  email: 'qa-captcha-vendor@example.com',
  password: 'QaCaptchaPass!2026',
  companyName: 'QA Captcha Vendor LLC',
};

/**
 * Stub CAPTCHA provider in apps/api/src/common/services/captcha.service.ts:
 *   - token === ''       → verified=false (caught by class-validator @IsNotEmpty first → 400 DTO error)
 *   - token === 'invalid'→ verified=false (caught by CaptchaService → 400 'CAPTCHA verification failed')
 *   - any other non-empty string → verified=true
 * Both failures write a FAILURE row to captcha_verification_logs.
 * Every success writes a SUCCESS row AND the registration_request links to it via captcha_verification_id.
 */
test.describe.serial('Vendor self-registration CAPTCHA gate', () => {
  test.beforeAll(async () => {
    await resetVendorByEmail(VENDOR.email);
  });

  test('missing captchaToken → 400 from DTO validation, no captcha row written', async () => {
    const before = await captchaRowCount();

    const res = await fetch(`${API_BASE}/api/v1/vendor-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: VENDOR.companyName,
        email: VENDOR.email,
        password: VENDOR.password,
        // captchaToken intentionally omitted
      }),
    });

    expect(res.status, 'DTO-level validation rejects missing token').toBe(400);
    const body = (await res.json().catch(() => ({}))) as any;
    expect(JSON.stringify(body)).toMatch(/captchaToken/);

    const after = await captchaRowCount();
    expect(after, 'no captcha log row created when DTO rejects request').toBe(before);
  });

  test('"invalid" stub token → 400, FAILURE row recorded, no vendor created', async () => {
    const before = await captchaRowCount({ result: 'FAILURE' });

    const res = await fetch(`${API_BASE}/api/v1/vendor-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: VENDOR.companyName,
        email: VENDOR.email,
        password: VENDOR.password,
        captchaToken: 'invalid',
      }),
    });

    expect(res.status, 'CAPTCHA verification fails for "invalid" stub token').toBe(400);
    const body = (await res.json().catch(() => ({}))) as any;
    expect(JSON.stringify(body)).toMatch(/CAPTCHA/i);

    const after = await captchaRowCount({ result: 'FAILURE' });
    expect(after, 'one new FAILURE row written').toBe(before + 1);

    await withDb(async client => {
      const r = await client.query<{ id: string }>(
        `SELECT id FROM vendor_users WHERE email = $1 LIMIT 1`,
        [VENDOR.email],
      );
      expect(r.rowCount, 'no vendor user created on CAPTCHA failure').toBe(0);
    });
  });

  test('valid token → 201, SUCCESS row recorded, registration links to captcha_verification_id', async () => {
    const before = await captchaRowCount({ result: 'SUCCESS' });

    const res = await fetch(`${API_BASE}/api/v1/vendor-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: VENDOR.companyName,
        email: VENDOR.email,
        password: VENDOR.password,
        captchaToken: 'qa-fixture-valid-captcha-token',
      }),
    });

    expect(res.ok, `register status: ${res.status}`).toBeTruthy();
    const body = (await res.json()) as { registrationId: string; status: string };
    expect(body.status).toBe('PENDING_VERIFICATION');
    expect(body.registrationId).toBeTruthy();

    const after = await captchaRowCount({ result: 'SUCCESS' });
    expect(after, 'one new SUCCESS row written').toBe(before + 1);

    await withDb(async client => {
      const r = await client.query<{ captcha_verification_id: string | null; provider: string | null; result: string | null }>(
        `SELECT vrr.captcha_verification_id::text AS captcha_verification_id,
                cvl.provider, cvl.result::text
         FROM vendor_registration_requests vrr
         JOIN vendor_users vu ON vu.vendor_id = vrr.vendor_id
         LEFT JOIN captcha_verification_logs cvl ON cvl.id = vrr.captcha_verification_id
         WHERE vu.email = $1
         ORDER BY vrr.submitted_at DESC LIMIT 1`,
        [VENDOR.email],
      );
      expect(r.rowCount, 'registration request row exists').toBe(1);
      expect(r.rows[0].captcha_verification_id, 'FK populated').toBeTruthy();
      expect(r.rows[0].result, 'linked captcha log is SUCCESS').toBe('SUCCESS');
      expect(r.rows[0].provider, 'provider stamped').toBe('stub');
    });
  });

  test('replay of same email → 400 duplicate, no new captcha row consumed against vendor', async () => {
    const res = await fetch(`${API_BASE}/api/v1/vendor-auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: VENDOR.companyName,
        email: VENDOR.email,
        password: VENDOR.password,
        captchaToken: 'qa-fixture-valid-captcha-token',
      }),
    });

    expect(res.status, 'second register call on same email is rejected').toBe(400);
    const body = (await res.json().catch(() => ({}))) as any;
    expect(JSON.stringify(body)).toMatch(/already registered/i);
  });
});

async function captchaRowCount(filter: { result?: 'SUCCESS' | 'FAILURE' } = {}): Promise<number> {
  return withDb(async client => {
    const sql = filter.result
      ? `SELECT COUNT(*)::int AS n FROM captcha_verification_logs WHERE target_action = 'vendor_register' AND result = $1::captcha_result`
      : `SELECT COUNT(*)::int AS n FROM captcha_verification_logs WHERE target_action = 'vendor_register'`;
    const params = filter.result ? [filter.result] : [];
    const r = await client.query<{ n: number }>(sql, params);
    return r.rows[0]?.n ?? 0;
  });
}
