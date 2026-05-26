'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await post('/vendor-auth/forgot-password', { email });
    } finally {
      // Always show success to prevent email enumeration.
      setSubmitted(true);
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email" subtitle="Reset instructions are on the way.">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-emerald-100 border border-emerald-300 mb-5">
            <MailCheck className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-slate-900/70 mb-6">
            If an account exists for that email, we have sent reset instructions.
          </p>
          <Link href="/login">
            <Button size="lg" fullWidth>Back to Sign In</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset Password" subtitle="Enter your account email and we'll send instructions.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
          autoComplete="email"
        />
        <Button type="submit" size="lg" fullWidth disabled={loading}>
          {loading ? 'Sending…' : 'Send Reset Email'}
        </Button>
        <Link
          href="/login"
          className="block text-center text-xs text-slate-900/55 hover:text-electric-600"
        >
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
