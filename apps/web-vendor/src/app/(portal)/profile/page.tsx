'use client';

import { useEffect, useState } from 'react';
import { get, patch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input, Textarea, ReadOnlyField } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Loading, ErrorBanner, SuccessBanner } from '@/components/ui/Empty';

interface ProfileResponse {
  vendor: {
    id: string;
    companyName: string;
    registrationNumber?: string;
    taxNumber?: string;
    country?: string;
    address?: string;
    phone?: string;
    website?: string;
    status: string;
    registeredAt: string;
    approvedAt?: string | null;
  };
  primaryContact: {
    id: string;
    email: string;
    fullName: string;
    phone?: string;
    emailVerified: boolean;
    lastLoginAt?: string | null;
    mfaEnabled: boolean;
  } | null;
}

type Editable = {
  companyName: string;
  taxNumber: string;
  country: string;
  address: string;
  phone: string;
  website: string;
  contactFullName: string;
  contactPhone: string;
};

const EMPTY: Editable = {
  companyName: '', taxNumber: '', country: '', address: '',
  phone: '', website: '', contactFullName: '', contactPhone: '',
};

const VENDOR_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Internal Review',
  APPROVED: 'Approved',
  REJECTED: 'Cancelled',
  SUSPENDED: 'Suspended',
  BLACKLISTED: 'Cancelled',
};

export default function VendorProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<Editable>(EMPTY);
  const [original, setOriginal] = useState<Editable>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const p = await get<ProfileResponse>('/vendor-auth/me', token);
        setProfile(p);
        const init: Editable = {
          companyName: p.vendor.companyName ?? '',
          taxNumber: p.vendor.taxNumber ?? '',
          country: p.vendor.country ?? '',
          address: p.vendor.address ?? '',
          phone: p.vendor.phone ?? '',
          website: p.vendor.website ?? '',
          contactFullName: p.primaryContact?.fullName ?? '',
          contactPhone: p.primaryContact?.phone ?? '',
        };
        setForm(init);
        setOriginal(init);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update<K extends keyof Editable>(k: K, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
    setSuccess(false);
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(original);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const token = getAccessToken();
      const diff: Partial<Editable> = {};
      for (const k of Object.keys(form) as (keyof Editable)[]) {
        if (form[k] !== original[k]) diff[k] = form[k];
      }
      const updated = await patch<ProfileResponse>('/vendor-auth/me', diff, token);
      setProfile(updated);
      setOriginal(form);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <ErrorBanner message={error ?? 'Profile not available'} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <PageHeader
        title="Company Profile"
        subtitle="Update non-sensitive fields. Email changes require admin support."
      />

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55">
              Registration Status
            </p>
            <div className="mt-2 flex items-center gap-3">
              <StatusBadge status={VENDOR_STATUS_LABEL[profile.vendor.status] ?? 'Draft'} />
              <span className="text-xs text-slate-900/55">{profile.vendor.status}</span>
            </div>
          </div>
          <div className="text-right text-sm text-slate-900/65">
            <p>Registered {new Date(profile.vendor.registeredAt).toLocaleDateString('en-GB')}</p>
            {profile.vendor.approvedAt && (
              <p className="text-emerald-600">
                Approved {new Date(profile.vendor.approvedAt).toLocaleDateString('en-GB')}
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {error && <ErrorBanner message={error} />}
      {success && <SuccessBanner message="Profile saved." />}

      <GlassCard padding="xl">
        <form onSubmit={handleSave} className="space-y-10">
          <Section title="Company">
            <Input
              label="Company Name"
              value={form.companyName}
              onChange={e => update('companyName', e.target.value)}
              required
            />
            <Input
              label="Tax Number"
              value={form.taxNumber}
              onChange={e => update('taxNumber', e.target.value)}
            />
            <Input
              label="Country (ISO-3166)"
              value={form.country}
              onChange={e => update('country', e.target.value)}
              maxLength={2}
              placeholder="KW"
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
            />
            <Input
              label="Website"
              value={form.website}
              onChange={e => update('website', e.target.value)}
              className="md:col-span-2"
            />
            <Textarea
              label="Address"
              value={form.address}
              onChange={e => update('address', e.target.value)}
              className="md:col-span-2"
              rows={3}
            />
            <ReadOnlyField
              label="Registration Number"
              value={profile.vendor.registrationNumber ?? '—'}
              hint="Cannot be changed after registration."
              className="md:col-span-2"
            />
          </Section>

          <Section title="Primary Contact">
            <Input
              label="Full Name"
              value={form.contactFullName}
              onChange={e => update('contactFullName', e.target.value)}
              required
            />
            <Input
              label="Phone"
              value={form.contactPhone}
              onChange={e => update('contactPhone', e.target.value)}
            />
            <ReadOnlyField
              label="Email"
              value={profile.primaryContact?.email ?? '—'}
              hint="Email change requires re-verification — contact admin support."
              className="md:col-span-2"
            />
            <ReadOnlyField
              label="MFA"
              value={profile.primaryContact?.mfaEnabled ? 'Enabled' : 'Disabled'}
              hint="Configure MFA via your authenticator app and admin support."
              className="md:col-span-2"
            />
          </Section>

          <div className="flex justify-end gap-3 border-t border-slate-900/10 pt-6">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setForm(original)}
              disabled={!dirty || saving}
            >
              Discard
            </Button>
            <Button
              type="submit"
              size="md"
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55 mb-6">
        {title}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
    </div>
  );
}
