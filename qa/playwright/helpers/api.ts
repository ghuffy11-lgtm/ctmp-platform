import { createHmac } from 'crypto';
import { withDb } from './db';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';
const JWT_SECRET = process.env.QA_JWT_SECRET ?? process.env.JWT_SECRET ?? 'qa-jwt-secret';
const VENDOR_JWT_SECRET =
  process.env.QA_VENDOR_JWT_SECRET ?? process.env.VENDOR_JWT_SECRET ?? 'qa-vendor-jwt-secret';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

/**
 * AD-bypass: sign an internal-user JWT directly with the api's JWT_SECRET.
 * Real /auth/login goes through AD bind which QA can't reach.
 */
export async function signAdminToken(userId: string): Promise<string> {
  const permissions = await withDb(async client => {
    const r = await client.query<{ code: string }>(
      `SELECT p.code FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1`,
      [userId],
    );
    return r.rows.map(x => x.code);
  });
  const user = await withDb(async client => {
    const r = await client.query<{ ad_username: string | null; email: string }>(
      `SELECT ad_username, email FROM users WHERE id = $1`,
      [userId],
    );
    return r.rows[0];
  });
  if (!user) throw new Error(`User ${userId} not found for token signing`);

  return signHs256(
    {
      sub: userId,
      username: user.ad_username ?? user.email,
      permissions,
      type: 'internal',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
  );
}

/**
 * Sign an internal-user JWT with a specific permission allowlist override.
 * Used by commercial-visibility tests to compare an admin WITH commercial:view
 * vs an admin WITHOUT it.
 */
export function signAdminTokenWithPermissions(userId: string, permissions: string[]): string {
  return signHs256(
    {
      sub: userId,
      username: 'qa-admin',
      permissions,
      type: 'internal',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
  );
}

export async function vendorLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/vendor-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vendor login failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

/**
 * Sign a vendor JWT directly. Skips the real /vendor-auth/login (bcrypt + lockout
 * + email-verify gate). Useful when seeding test vendors.
 */
export async function signVendorToken(vendorUserId: string): Promise<string> {
  const user = await withDb(async client => {
    const r = await client.query<{
      id: string;
      vendor_id: string;
      email: string;
      token_version: number;
    }>(
      `SELECT id, vendor_id, email, token_version FROM vendor_users WHERE id = $1`,
      [vendorUserId],
    );
    return r.rows[0];
  });
  if (!user) throw new Error(`VendorUser ${vendorUserId} not found`);

  return signHs256(
    {
      sub: user.id,
      vendorId: user.vendor_id,
      email: user.email,
      type: 'vendor',
      version: user.token_version,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    VENDOR_JWT_SECRET,
  );
}

export async function authFetch(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function authJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(token, path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
