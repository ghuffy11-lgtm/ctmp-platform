'use client';

import Cookies from 'js-cookie';

const TOKEN_KEY = 'ctmp_access_token';
const REFRESH_KEY = 'ctmp_refresh_token';

export function getAccessToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
  // httpOnly would be better but requires backend to set cookies;
  // storing in js-cookie until backend session-cookie support is wired
  Cookies.set(TOKEN_KEY, access, { sameSite: 'strict', secure: false });
  Cookies.set(REFRESH_KEY, refresh, { sameSite: 'strict', secure: false });
}

export function clearTokens() {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(REFRESH_KEY);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(REFRESH_KEY);
}

export interface TokenPayload {
  sub: string;
  username: string;
  permissions: string[];
  exp: number;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload)) as TokenPayload;
  } catch {
    return null;
  }
}

export function hasPermission(token: string, permission: string): boolean {
  const payload = decodeToken(token);
  return payload?.permissions?.includes(permission) ?? false;
}
