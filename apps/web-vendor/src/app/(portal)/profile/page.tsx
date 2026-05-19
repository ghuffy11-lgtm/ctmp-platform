'use client';

import { useState, useEffect } from 'react';
import { get, patch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

  if (loading) return <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>;
  if (!profile) {
    return (
      <div className="p-8 max-w-md mx-auto bg-card border border-danger/30 rounded-xl text-center">
        <p className="text-sm text-danger">{error ?? 'Profile not available'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Company Profile</h1>
        <p className="text-sm text-text-secondary mt-0.5">Update non-sensitive fields. Email changes require admin support.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">Registration Status</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={
              profile.vendor.status === 'PENDING' ? 'Internal Review' :
              profile.vendor.status === 'APPROVED' ? 'Approved' :
              profile.vendor.status === 'REJECTED' ? 'Cancelled' :
              profile.vendor.status === 'SUSPENDED' ? 'Suspended' :
              profile.vendor.status === 'BLACKLISTED' ? 'Cancelled' :
              'Draft'
            } />
            <span className="text-xs text-text-secondary">{profile.vendor.status}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-secondary">Registered {new Date(profile.vendor.registeredAt).toLocaleDateString('en-GB')}</p>
          {profile.vendor.approvedAt && (
            <p className="text-xs text-success">Approved {new Date(profile.vendor.approvedAt).toLocaleDateString('en-GB')}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}
      {success && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-sm text-success">Profile saved.</div>
      )}

      <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-5 space-y-5">
        <Section title="Company">
          <Field label="Company Name" value={form.companyName} onChange={v => update('companyName', v)} required />
          <Field label="Tax Number" value={form.taxNumber} onChange={v => update('taxNumber', v)} />
          <Field label="Country (ISO-3166)" value={form.country} onChange={v => update('country', v)} maxLength={2} placeholder="US" />
          <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} />
          <Field label="Website" value={form.website} onChange={v => update('website', v)} colspan />
          <Field label="Address" value={form.address} onChange={v => update('address', v)} colspan multiline />

          <ReadOnlyField
            label="Registration Number"
            value={profile.vendor.registrationNumber ?? '—'}
            note="Cannot be changed after registration."
          />
        </Section>

        <Section title="Primary Contact">
          <Field label="Full Name" value={form.contactFullName} onChange={v => update('contactFullName', v)} required />
          <Field label="Phone" value={form.contactPhone} onChange={v => update('contactPhone', v)} />
          <ReadOnlyField
            label="Email"
            value={profile.primaryContact?.email ?? '—'}
            note="Email change requires re-verification — contact admin support."
          />
          <ReadOnlyField
            label="MFA"
            value={profile.primaryContact?.mfaEnabled ? 'Enabled' : 'Disabled'}
            note="Configure MFA via your authenticator app and admin support."
          />
        </Section>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setForm(original)}
            disabled={!dirty || saving}
            className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!dirty || saving}
            className="px-5 py-2 bg-accent text-white rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{title}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, required, maxLength, placeholder, colspan, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  colspan?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className={colspan ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
        {label}{required && ' *'}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          required={required}
          maxLength={maxLength}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}
    </div>
  );
}

function ReadOnlyField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
        {label} <span className="text-text-secondary/60 font-normal italic">(read-only)</span>
      </label>
      <div className="px-3 py-2 border border-border rounded-lg text-sm bg-bg/50 text-text-secondary cursor-not-allowed">
        {value}
      </div>
      {note && <p className="text-[10px] text-text-secondary/70 italic mt-1">{note}</p>}
    </div>
  );
}
