'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { MailCheck } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/Empty';

const HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

export default function VendorRegisterPage() {
  const [form, setForm] = useState({
    companyName: '',
    registrationNumber: '',
    taxNumber: '',
    country: '',
    address: '',
    phone: '',
    contactEmail: '',
    contactFullName: '',
    contactPhone: '',
    password: '',
  });
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken.trim()) {
      setError('Complete the CAPTCHA before submitting');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await post('/vendor-auth/register', {
        companyName: form.companyName,
        registrationNumber: form.registrationNumber || undefined,
        taxNumber: form.taxNumber || undefined,
        country: form.country || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.contactEmail,
        password: form.password,
        captchaToken,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      // CAPTCHA tokens are single-use server-side, reset for retry.
      setCaptchaToken('');
      captchaRef.current?.resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell title="Registration Submitted" subtitle="">
        <div className="text-center">
          <div className="inline-flex w-16 h-16 items-center justify-center rounded-3xl bg-emerald-100 border border-emerald-300 mb-5">
            <MailCheck className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-slate-900/70 mb-6 leading-relaxed">
            Verification email sent to <strong className="text-slate-900">{form.contactEmail}</strong>.
            Confirm your email, then await admin approval. You'll receive a follow-up email once approved.
          </p>
          <Link href="/login">
            <Button size="lg" fullWidth>Back to Sign In</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Register as a Vendor"
      subtitle="Submit your company details. Registration is reviewed by procurement before activation."
      wide
    >
      {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

      <form onSubmit={handleSubmit} className="space-y-8">
        <Section title="Company Information">
          <Input
            label="Company Name"
            value={form.companyName}
            onChange={e => update('companyName', e.target.value)}
            required
          />
          <Input
            label="Registration Number"
            value={form.registrationNumber}
            onChange={e => update('registrationNumber', e.target.value)}
          />
          <Input
            label="Tax Number"
            value={form.taxNumber}
            onChange={e => update('taxNumber', e.target.value)}
          />
          <Input
            label="Country"
            value={form.country}
            onChange={e => update('country', e.target.value)}
            maxLength={2}
            placeholder="KW"
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            className="md:col-span-2"
          />
          <Textarea
            label="Address"
            value={form.address}
            onChange={e => update('address', e.target.value)}
            rows={3}
            className="md:col-span-2"
          />
        </Section>

        <Section title="Primary Contact">
          <Input
            label="Contact Full Name"
            value={form.contactFullName}
            onChange={e => update('contactFullName', e.target.value)}
            required
          />
          <Input
            label="Contact Phone"
            value={form.contactPhone}
            onChange={e => update('contactPhone', e.target.value)}
          />
          <Input
            label="Contact Email"
            type="email"
            value={form.contactEmail}
            onChange={e => update('contactEmail', e.target.value)}
            required
            className="md:col-span-2"
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={e => update('password', e.target.value)}
            required
            className="md:col-span-2"
            autoComplete="new-password"
            hint="At least 12 characters with a mix of uppercase, lowercase, numbers, and symbols."
          />
        </Section>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55 mb-4">
            Verify you are human
          </p>
          <div className="flex justify-center md:justify-start">
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
          <p className="text-[11px] text-slate-900/50 italic mt-2">
            CAPTCHA is mandatory per procurement compliance. Token is validated server-side.
          </p>
        </div>

        <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-2 border-t border-slate-900/10">
          <Link href="/login" className="md:self-center">
            <Button variant="ghost" size="md" type="button" fullWidth>
              Cancel
            </Button>
          </Link>
          <Button type="submit" size="md" disabled={loading}>
            {loading ? 'Submitting…' : 'Submit Registration'}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55 mb-5">
        {title}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
    </div>
  );
}
