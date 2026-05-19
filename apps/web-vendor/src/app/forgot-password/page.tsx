'use client';

import { useState } from 'react';
import Link from 'next/link';
import { post } from '@/lib/api';

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
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-[48px] text-success mb-4 inline-block">mark_email_read</span>
          <h1 className="text-xl font-bold text-text-primary mb-2">Check your email</h1>
          <p className="text-sm text-text-secondary mb-4">
            If an account exists for that email, we have sent reset instructions.
          </p>
          <Link href="/login" className="inline-block px-4 py-2 bg-accent text-white rounded-lg font-bold">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-xl border border-border p-8 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-text-primary">Reset Password</h1>
        <p className="text-sm text-text-secondary">Enter your account email. We will send reset instructions.</p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="you@company.com"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-accent text-white rounded-lg font-bold disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send Reset Email'}
        </button>
        <Link href="/login" className="block text-center text-xs text-text-secondary hover:text-accent">Back to sign in</Link>
      </form>
    </div>
  );
}
