'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';

type State = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token found in the link. Please check your email and try again.');
      return;
    }
    post<void>('/vendor-auth/verify-email', { token })
      .then(() => setState('success'))
      .catch((err) => {
        setState('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed. The link may have expired.');
      });
  }, [token]);

  if (state === 'loading') {
    return (
      <AuthShell title="Verifying your email…" subtitle="This will only take a moment.">
        <div className="flex justify-center py-6">
          <Loader2 className="w-10 h-10 text-electric-500 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  if (state === 'success') {
    return (
      <AuthShell title="Email Verified" subtitle="">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-emerald-100 border border-emerald-300 mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-slate-900/70 mb-6">
            Your email address has been confirmed. An administrator will review and approve your account shortly.
          </p>
          <Link href="/login">
            <Button size="lg" fullWidth>Go to Sign In</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verification Failed" subtitle="">
      <div className="text-center">
        <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-rose-100 border border-rose-300 mb-5">
          <XCircle className="w-8 h-8 text-rose-600" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-slate-900/70 mb-6">
          {message || 'Something went wrong. Please request a new verification email.'}
        </p>
        <Link href="/login">
          <Button size="lg" fullWidth variant="ghost">Back to Sign In</Button>
        </Link>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
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
      <VerifyEmailContent />
    </Suspense>
  );
}
