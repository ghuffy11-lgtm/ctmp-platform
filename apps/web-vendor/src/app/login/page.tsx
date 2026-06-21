'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/Empty';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mfaRequired?: boolean;
  mfaSessionToken?: string;
}

// BUG-110 (2026-06-05): if the visitor clicked a tender card while anonymous,
// they arrived at /login?next=/tenders/<uuid>. After successful login we want
// to forward to that intended detail page instead of /dashboard. Sanitise to
// defend against open-redirect: must start with `/` and not begin with `//` or
// contain `:` (which would indicate a scheme).
function sanitiseNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';
  if (raw.includes(':')) return '/dashboard';
  return raw;
}

// BUG-110: Next.js requires `useSearchParams()` callers to be wrapped in
// a Suspense boundary so the build can prerender the page.
export default function VendorLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VendorLoginPageInner />
    </Suspense>
  );
}

function VendorLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitiseNext(searchParams.get('next'));
  // BUG-112 (2026-06-07) Piece 4: banner shown when the vendor was
  // signed out by idle-timeout or by the 401 interceptor.
  const signoutReason = searchParams.get('reason');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSession, setMfaSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await post<LoginResponse>('/vendor-auth/login', { email, password });
      if (res.mfaRequired && res.mfaSessionToken) {
        setMfaSession(res.mfaSessionToken);
      } else {
        setTokens(res.accessToken, res.refreshToken);
        router.push(nextPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaSession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await post<LoginResponse>('/vendor-auth/mfa/verify', {
        sessionToken: mfaSession,
        code: mfaCode,
      });
      setTokens(res.accessToken, res.refreshToken);
      router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={mfaSession ? 'Verify Identity' : 'Welcome Back'}
      subtitle={mfaSession ? 'Enter the 6-digit code from your authenticator app.' : 'Sign in to manage your bids.'}
    >
      {error && <div className="mb-5"><ErrorBanner message={error} /></div>}

      {signoutReason && !error && (
        <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm text-center">
          {signoutReason === 'timeout'
            ? 'You were signed out due to inactivity. Please sign in again.'
            : signoutReason === 'expired'
              ? 'Your session has expired. Please sign in again.'
              : 'Please sign in to continue.'}
        </div>
      )}

      {!mfaSession ? (
        <form onSubmit={handleLogin} className="space-y-5">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <Button type="submit" size="lg" fullWidth disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleMfa} className="space-y-5">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={mfaCode}
            onChange={e => setMfaCode(e.target.value)}
            required
            placeholder="000000"
            aria-label="MFA code"
            className="input-field w-full rounded-3xl px-6 py-5 text-center text-3xl font-mono tracking-[0.4em]"
          />
          <Button type="submit" size="lg" fullWidth disabled={loading || mfaCode.length !== 6}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
      )}

      <div className="mt-8 flex justify-between text-xs">
        <Link href="/register" className="text-electric-500 hover:text-electric-600 hover:underline">
          Register as vendor
        </Link>
        <Link href="/forgot-password" className="text-slate-900/55 hover:text-electric-600">
          Forgot password?
        </Link>
      </div>
    </AuthShell>
  );
}
