'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export default function VendorLoginPage() {
  const router = useRouter();
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
        router.push('/dashboard');
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
      router.push('/dashboard');
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
