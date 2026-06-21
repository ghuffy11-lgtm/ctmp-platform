'use client';

import Cookies from 'js-cookie';

const TOKEN_KEY = 'ctmp_vendor_access_token';
const REFRESH_KEY = 'ctmp_vendor_refresh_token';

// BUG-151 (2026-06-22): tighten vendor token cookies before public launch.
//   • `secure: true` in production so the browser never sends the cookie
//     over plain HTTP. The vendor portal is served via HTTPS in
//     staging/prod; only the dev (http://localhost) workflow needs the
//     insecure-cookie escape hatch.
//   • Per-token `expires` matching the JWT TTL — previously the cookies
//     were "session" cookies that lived until the browser process closed
//     (shared-kiosk risk).
//
// Note: this is interim hardening. The proper fix is to move the refresh
// token into a server-set `HttpOnly; Secure; SameSite=Strict` cookie
// (BUG-153 candidate). That's a bigger backend refactor and is deferred
// to the first post-launch release. Until then, this reduces (but does
// not eliminate) the XSS-token-theft blast radius.
const IS_PRODUCTION_HOSTNAME =
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:';
const SECURE = IS_PRODUCTION_HOSTNAME;

// Access token lifetime (24h per VENDOR_JWT_EXPIRES_IN default) — used as
// the cookie expiry so it doesn't outlive its own JWT.
const ACCESS_EXPIRES_DAYS = 1;
// Refresh token lifetime (7d default) — same alignment.
const REFRESH_EXPIRES_DAYS = 7;

export function getAccessToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
  Cookies.set(TOKEN_KEY, access, {
    sameSite: 'strict',
    secure: SECURE,
    expires: ACCESS_EXPIRES_DAYS,
  });
  Cookies.set(REFRESH_KEY, refresh, {
    sameSite: 'strict',
    secure: SECURE,
    expires: REFRESH_EXPIRES_DAYS,
  });
}

export function clearTokens() {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(REFRESH_KEY);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(REFRESH_KEY);
}

export interface VendorTokenPayload {
  sub: string;
  vendorId: string;
  email: string;
  // BUG-112 (2026-06-07) Piece 4: configured idle timeout, propagated
  // from session.idle_timeout_minutes at sign-in. Read by useIdleTimeout.
  idleTimeoutMinutes?: number;
  exp: number;
}

export function decodeToken(token: string): VendorTokenPayload | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload)) as VendorTokenPayload;
  } catch {
    return null;
  }
}
