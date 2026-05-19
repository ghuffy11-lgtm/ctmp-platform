'use client';

import Cookies from 'js-cookie';

const TOKEN_KEY = 'ctmp_vendor_access_token';
const REFRESH_KEY = 'ctmp_vendor_refresh_token';

export function getAccessToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
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

export interface VendorTokenPayload {
  sub: string;
  vendorId: string;
  email: string;
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
