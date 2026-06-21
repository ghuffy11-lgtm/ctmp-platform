'use client';

// BUG-112 (2026-06-07) Piece 4: vendor-portal mirror of the admin
// idle-timeout hook. Reads `idleTimeoutMinutes` from the decoded JWT
// (default 30), watches for user activity, and on timeout clears the
// tokens + bounces to /login?reason=timeout.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens, decodeToken, getAccessToken } from './auth';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
const DEFAULT_MINUTES = 30;

export function useIdleTimeout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const payload = decodeToken(token);
    const minutes = Number(payload?.idleTimeoutMinutes);
    const timeoutMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES) * 60_000;

    function fireTimeout() {
      clearTokens();
      router.push('/login?reason=timeout');
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fireTimeout, timeoutMs);
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [router]);
}
