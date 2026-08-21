'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { MailCheck, Upload, FileText, X, Loader2 } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/Empty';

const HCAPTCHA_SITE_KEY =
  process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? '10000000-ffff-ffff-ffff-000000000001';

// BUG-137 (2026-06-19): vendor registration documents. Must match the backend
// catalogue in apps/api/src/modules/vendor-auth/vendor-document-types.ts.
interface VendorDocType {
  code: string;
  label: string;
  required: boolean;
  multi: boolean;
  maxFiles?: number;
}
// BUG-138 (2026-06-19): trimmed to 3 slots per owner directive.
const VENDOR_DOC_TYPES: VendorDocType[] = [
  { code: 'COMMERCIAL_LICENSE',   label: 'Commercial License',         required: true,  multi: false },
  { code: 'AUTHORISATION_LETTER', label: 'Authorisation Letter',       required: false, multi: false },
  { code: 'OTHER',                label: 'Other supporting documents', required: false, multi: true, maxFiles: 5 },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface UploadedDoc {
  documentId: string;
  filename: string;
  fileSize: number;
}

export default function VendorRegisterPage() {
  // BUG-101 (2026-06-04): owner simplified the registration form — drop
  // Registration Number / Tax Number / Country (collected later at approval if
  // needed). Add Company Website.
  const [form, setForm] = useState({
    companyName: '',
    companyNameAr: '',
    website: '',
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

  // BUG-137 (2026-06-19): per-type uploaded documents. Each slot stores a
  // list (multi types allow >1; non-multi keep length ≤1 by design).
  const [docs, setDocs] = useState<Record<string, UploadedDoc[]>>({});
  const [docUploading, setDocUploading] = useState<Record<string, boolean>>({});

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleDocFile(typeCode: string, file: File) {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit.');
      return;
    }
    setError(null);
    setDocUploading(prev => ({ ...prev, [typeCode]: true }));
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${API_BASE}/api/v1/vendor-auth/registration-documents/upload`, {
        method: 'POST',
        body,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      const uploaded: UploadedDoc = {
        documentId: data.documentId,
        filename: data.filename,
        fileSize: data.fileSize,
      };
      setDocs(prev => {
        const cur = prev[typeCode] ?? [];
        const typeDef = VENDOR_DOC_TYPES.find(t => t.code === typeCode);
        if (typeDef?.multi) {
          return { ...prev, [typeCode]: [...cur, uploaded] };
        }
        return { ...prev, [typeCode]: [uploaded] };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocUploading(prev => ({ ...prev, [typeCode]: false }));
    }
  }

  function removeDoc(typeCode: string, documentId: string) {
    setDocs(prev => ({
      ...prev,
      [typeCode]: (prev[typeCode] ?? []).filter(d => d.documentId !== documentId),
    }));
  }

  // BUG-137: submit is disabled until every required slot has at least one
  // uploaded file.
  const requiredDocsMissing = VENDOR_DOC_TYPES.filter(t => t.required && !(docs[t.code]?.length));
  const canSubmit = requiredDocsMissing.length === 0 && captchaToken.trim().length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken.trim()) {
      setError('Complete the CAPTCHA before submitting');
      return;
    }
    if (requiredDocsMissing.length > 0) {
      setError(`Upload required documents: ${requiredDocsMissing.map(t => t.label).join(', ')}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // BUG-137 (2026-06-19): pack uploaded docs into the register payload.
      const documents = Object.entries(docs).flatMap(([type, list]) =>
        list.map(d => ({ type, documentId: d.documentId })),
      );
      await post('/vendor-auth/register', {
        companyName: form.companyName,
        // Migration 054 (2026-08-13): optional — an international supplier may
        // have no Arabic trade name, so this must never block registration.
        companyNameAr: form.companyNameAr.trim() || undefined,
        website: form.website || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        email: form.contactEmail,
        password: form.password,
        captchaToken,
        documents,
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
            label="Company Name (Arabic)"
            value={form.companyNameAr}
            onChange={e => update('companyNameAr', e.target.value)}
            dir="rtl"
            lang="ar"
            placeholder="اسم الشركة بالعربية (اختياري)"
          />
          <Input
            label="Company Website"
            type="url"
            value={form.website}
            onChange={e => update('website', e.target.value)}
            placeholder="https://www.example.com"
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

        {/* BUG-137 (2026-06-19): registration documents. Owner needs Commercial
            License + Authorised Representative ID before approval. Other types
            are optional. */}
        <Section title="Required Documents">
          <div className="md:col-span-2 space-y-3">
            <p className="text-[11px] text-slate-900/60 leading-relaxed">
              Upload PDF copies of your company documents. Only PDF files up to 10 MB are accepted.
              Documents are reviewed by procurement before your account is approved.
            </p>
            {VENDOR_DOC_TYPES.map(t => {
              const uploaded = docs[t.code] ?? [];
              const uploading = !!docUploading[t.code];
              const canAddMore = t.multi
                ? uploaded.length < (t.maxFiles ?? 5)
                : uploaded.length === 0;
              return (
                <div key={t.code} className="border border-slate-900/15 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {t.label}{' '}
                      {t.required ? (
                        <span className="text-[10px] uppercase font-bold text-rose-600 ml-1">Required</span>
                      ) : (
                        <span className="text-[10px] uppercase font-semibold text-slate-500 ml-1">Optional</span>
                      )}
                    </p>
                    {canAddMore && (
                      <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-900/20 hover:bg-slate-100 cursor-pointer">
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {uploading ? 'Uploading…' : (t.multi && uploaded.length > 0 ? 'Add another' : 'Upload PDF')}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          disabled={uploading}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handleDocFile(t.code, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {uploaded.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">No file uploaded yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {uploaded.map(d => (
                        <li key={d.documentId} className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          <span className="flex items-center gap-1.5 truncate">
                            <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span className="truncate text-slate-900">{d.filename}</span>
                            <span className="text-slate-500 ml-1">({(d.fileSize / 1024).toFixed(0)} KB)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDoc(t.code, d.documentId)}
                            className="text-slate-500 hover:text-rose-600 p-0.5"
                            aria-label="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
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
          <Button type="submit" size="md" disabled={!canSubmit}>
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
