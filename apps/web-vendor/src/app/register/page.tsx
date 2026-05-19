'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { post } from '@/lib/api';

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
        email: form.contactEmail,
        password: form.password,
        captchaToken,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-[48px] text-success mb-4 inline-block">mark_email_read</span>
          <h1 className="text-xl font-bold text-text-primary mb-2">Registration submitted</h1>
          <p className="text-sm text-text-secondary mb-4">
            Verification email sent to <strong>{form.contactEmail}</strong>. Confirm your email,
            then await admin approval. You will receive a follow-up email once approved.
          </p>
          <Link href="/login" className="inline-block px-4 py-2 bg-accent text-white rounded-lg font-bold">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-bg via-card to-blue-50">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Register as a Vendor</h1>
        <p className="text-sm text-text-secondary mb-6">
          Submit your company details. Registration is reviewed by procurement before activation.
        </p>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3 mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company Name" value={form.companyName} onChange={v => update('companyName', v)} required />
          <Field label="Registration Number" value={form.registrationNumber} onChange={v => update('registrationNumber', v)} />
          <Field label="Tax Number" value={form.taxNumber} onChange={v => update('taxNumber', v)} />
          <Field label="Country" value={form.country} onChange={v => update('country', v)} />
          <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} />
          <Field label="Address" value={form.address} onChange={v => update('address', v)} colspan />

          <div className="col-span-full mt-2 mb-1">
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">Primary Contact</p>
          </div>
          <Field label="Contact Full Name" value={form.contactFullName} onChange={v => update('contactFullName', v)} required />
          <Field label="Contact Phone" value={form.contactPhone} onChange={v => update('contactPhone', v)} />
          <Field label="Contact Email" value={form.contactEmail} onChange={v => update('contactEmail', v)} type="email" required colspan />
          <Field label="Password" value={form.password} onChange={v => update('password', v)} type="password" required colspan />

          <div className="col-span-full mt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">CAPTCHA</p>
            <input
              type="text"
              value={captchaToken}
              onChange={e => setCaptchaToken(e.target.value)}
              placeholder="Paste CAPTCHA token (placeholder — real provider integration pending)"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-[11px] text-text-secondary italic mt-1">
              CAPTCHA is mandatory per procurement compliance. Token is validated server-side.
            </p>
          </div>

          <div className="col-span-full flex justify-end gap-2 mt-2">
            <Link href="/login" className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-accent text-white rounded-lg font-bold disabled:opacity-50"
            >
              {loading ? 'Submitting…' : 'Submit Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required, colspan,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  colspan?: boolean;
}) {
  const inputId = useId();
  return (
    <div className={colspan ? 'col-span-full' : ''}>
      <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
        {label}{required && ' *'}
      </label>
      <input
        id={inputId}
        aria-label={label}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </div>
  );
}
