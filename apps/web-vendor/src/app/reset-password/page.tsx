'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, KeyRound } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type State = 'idle' | 'submitting' | 'success' | 'error';

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setState('error');
      setMessage('No reset token in the link. Request a new password reset email.');
      return;
    }
    if (password.length < 12) {
      setState('error');
      setMessage('Password must be at least 12 characters long.');
      return;
    }
    if (password !== confirm) {
      setState('error');
      setMessage('Passwords do not match.');
      return;
    }
    setState('submitting');
    setMessage('');
    try {
      await post<void>('/vendor-auth/reset-password', { token, newPassword: password });
      setState('success');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Reset failed. The link may have expired.');
    }
  }

  if (!token) {
    return (
      <AuthShell title="Invalid Reset Link" subtitle="">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-rose-100 border border-rose-300 mb-5">
            <XCircle className="w-8 h-8 text-rose-600" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-slate-900/70 mb-6">
            This reset link is missing a token. Please request a new password reset email.
          </p>
          <Link href="/forgot-password">
            <Button size="lg" fullWidth>Request a new link</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (state === 'success') {
    return (
      <AuthShell title="Password Reset" subtitle="">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-emerald-100 border border-emerald-300 mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-slate-900/70 mb-6">
            Your password has been updated. You can now sign in with your new credentials.
          </p>
          <Button size="lg" fullWidth onClick={() => router.push('/login')}>Go to Sign In</Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Pick a new password — minimum 12 characters.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 12 characters"
          required
          autoComplete="new-password"
        />
        <Input
          type="password"
          label="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type the same password again"
          required
          autoComplete="new-password"
        />
        {state === 'error' && message && (
          <p className="text-sm text-rose-600">{message}</p>
        )}
        <Button type="submit" size="lg" fullWidth disabled={state === 'submitting'}>
          {state === 'submitting' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Updating…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Set new password
            </span>
          )}
        </Button>
        <p className="text-xs text-center text-slate-500">
          Remembered your password?{' '}
          <Link href="/login" className="text-electric-600 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Loading…" subtitle="">
          <div className="flex justify-center py-6">
            <Loader2 className="w-10 h-10 text-electric-500 animate-spin" />
          </div>
        </AuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
