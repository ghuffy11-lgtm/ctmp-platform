'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api';
import { setTokens } from '@/lib/auth';

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-bg via-card to-blue-50">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">CTMP Vendor Portal</h1>
          <p className="text-sm text-text-secondary mt-1">Sign in to manage your bids</p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {!mfaSession ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <p className="text-sm text-text-secondary">
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border rounded-lg text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="000000"
            />
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full py-2.5 bg-accent text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        <div className="mt-6 flex justify-between text-xs">
          <Link href="/register" className="text-accent hover:underline">Register as vendor</Link>
          <Link href="/forgot-password" className="text-text-secondary hover:text-accent">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
