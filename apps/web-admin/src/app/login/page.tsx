'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api';
import { setTokens } from '@/lib/auth';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mfaRequired: boolean;
  mfaToken?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const usernameId = useId();
  const passwordId = useId();
  const mfaCodeId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post<LoginResponse>('/auth/login', { username, password });
      if (res.mfaRequired && res.mfaToken) {
        setMfaToken(res.mfaToken);
        setMfaRequired(true);
      } else {
        setTokens(res.accessToken, res.refreshToken);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post<LoginResponse>('/auth/mfa/verify', {
        token: mfaToken,
        code: mfaCode,
      });
      setTokens(res.accessToken, res.refreshToken);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'MFA verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#0F172A]">CTMP</h1>
          <p className="text-sm text-gray-500 mt-1">Corporate Tender Management Platform</p>
        </div>

        {!mfaRequired ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor={usernameId} className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id={usernameId}
                aria-label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jsmith@company.local"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            <div>
              <label htmlFor={passwordId} className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id={passwordId}
                aria-label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0F172A] text-white py-2 rounded-lg font-medium hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="text-center text-xs text-gray-400 mt-2">
              Use your Active Directory credentials
            </p>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-lg font-semibold text-gray-800">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-500 mt-1">
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>
            <div>
              <label htmlFor={mfaCodeId} className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                id={mfaCodeId}
                aria-label="Verification Code"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#3B82F6]"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full bg-[#0F172A] text-white py-2 rounded-lg font-medium hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => setMfaRequired(false)}
              className="w-full text-sm text-[#3B82F6] hover:underline"
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
