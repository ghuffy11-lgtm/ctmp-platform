import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200,http://localhost:4300').split(','),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // BUG-144 (2026-06-19): full URLs for email templates. Always present so
  // every email contains a clickable absolute link regardless of whether the
  // env vars are set. Override via ADMIN_PORTAL_URL / VENDOR_PORTAL_URL env.
  adminPortalUrl: (process.env.ADMIN_PORTAL_URL ?? 'https://ctmp-admin.hadiclinic.com.kw:4202').replace(/\/+$/, ''),
  vendorPortalUrl: (process.env.VENDOR_PORTAL_URL ?? 'https://vn.hadiclinic.com.kw:4201').replace(/\/+$/, ''),
  // 2026-08-24: lifetime of a vendor-registry invitation link.
  //
  // Lives here rather than under `auth` because it is not an authentication
  // parameter. (When this was written `auth.*` was a dead namespace — no
  // registerAs('auth') existed and every lookup silently returned undefined.
  // That was fixed the same day in auth.config.ts; the note is kept because it
  // explains why this key is where it is.)
  vendorInviteTtlDays: parseInt(process.env.VENDOR_INVITE_TTL_DAYS ?? '14', 10),
}));
