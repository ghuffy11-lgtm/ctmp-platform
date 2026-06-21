'use client';

// BUG-112 (2026-06-07) Piece 4: enforce the configured idle timeout on the
// admin portal. The session.idle_timeout_minutes setting (BUG-107) is now
// carried on the JWT (`idleTimeoutMinutes`); this hook reads it, watches
// for user activity, and signs out + redirects to /login?reason=timeout
// when the timeout fires. Default 30 min if the claim is missing.

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
    if (!token) return; // Not signed in; nothing to time out.
    const payload = decodeToken(token);
    const minutes = Number((payload as any)?.idleTimeoutMinutes);
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
