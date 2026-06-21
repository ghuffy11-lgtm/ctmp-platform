'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { MailCheck } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// BUG-151 (2026-06-22): hCaptcha sitekey — defaults to hCaptcha's documented
// test key for dev/staging. Swap via NEXT_PUBLIC_HCAPTCHA_SITE_KEY in
// production (per the captcha-staging memory + register page pattern).
const HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // BUG-151 (2026-06-22): forgot-password now requires CAPTCHA token
      // server-side. Per-IP throttling + per-email cooldown + audit log
      // are enforced on the backend even if a bot bypasses this widget.
      await post('/vendor-auth/forgot-password', { email, captchaToken });
    } catch (err) {
      // Backend returns 400 if captcha fails / 429 if throttled / 204
      // on success. Surface generic errors but do NOT leak whether the
      // email exists (the success path always sets `submitted`).
      const msg = err instanceof Error ? err.message : 'Request failed';
      if (msg.toLowerCase().includes('captcha')) {
        setError('CAPTCHA verification failed. Try again.');
        captchaRef.current?.resetCaptcha();
        setCaptchaToken('');
        setLoading(false);
        return;
      }
      if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
        setError('Too many requests. Please wait a few minutes and try again.');
        setLoading(false);
        return;
      }
      // Anything else — proceed to success page to preserve no-enumeration.
    } finally {
      // Always show success to prevent email enumeration (when reaching this
      // line via a non-captcha failure path).
      if (!error) {
        setSubmitted(true);
      }
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
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55 mb-3">
            Verify you are human
          </p>
          <div className="flex justify-center">
            <HCaptcha
              ref={captchaRef}
              sitekey={HCAPTCHA_SITE_KEY}
              theme="light"
              onVerify={token => { setCaptchaToken(token); setError(null); }}
              onExpire={() => setCaptchaToken('')}
              onError={() => {
                setCaptchaToken('');
                setError('CAPTCHA failed to load. Refresh and try again.');
              }}
            />
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-600 text-center">{error}</p>
        )}
        <Button type="submit" size="lg" fullWidth disabled={loading || !captchaToken}>
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
