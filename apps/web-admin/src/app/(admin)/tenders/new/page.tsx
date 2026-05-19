'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

const CATEGORIES = [
  'Construction', 'IT Services', 'Healthcare', 'Engineering',
  'Services', 'Insurance', 'Consulting', 'Supply',
];

const PROCUREMENT_TYPES = ['Open Tender', 'Restricted', 'Single Source'];

const STEPS = [
  'Basic Information',
  'Technical Requirements',
  'Evaluation Criteria',
  'Documents & Attachments',
];

interface FormData {
  title: string;
  category: string;
  procurementType: string;
  estimatedBudget: string;
  submissionDeadlineDate: string;
  submissionDeadlineTime: string;
  description: string;
}

const EMPTY_FORM: FormData = {
  title: '',
  category: '',
  procurementType: '',
  estimatedBudget: '',
  submissionDeadlineDate: '',
  submissionDeadlineTime: '',
  description: '',
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
  );
}

export default function CreateTenderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSaveDraft() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const token = getAccessToken();
      let submissionDeadline: string | null = null;
      if (form.submissionDeadlineDate) {
        const time = form.submissionDeadlineTime || '23:59';
        submissionDeadline = new Date(`${form.submissionDeadlineDate}T${time}:00`).toISOString();
      }
      const result = await post<{ id: string }>('/tenders', {
        title: form.title.trim(),
        category: form.category || null,
        procurementType: form.procurementType || null,
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : null,
        submissionDeadline,
        description: form.description.trim() || null,
      }, token);
      router.push(`/tenders/${result.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save tender');
    } finally {
      setSaving(false);
    }
  }

  const canSave = form.title.trim().length > 0 && !saving;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary mb-6">
        <Link href="/tenders" className="hover:text-accent transition-colors">Tenders</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-text-primary font-semibold">Create New Tender</span>
      </nav>

      <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-8">Create New Tender</h1>

      {/* Step Indicator */}
      <div className="flex items-center mb-10">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                  i === 0
                    ? 'bg-accent text-white'
                    : 'bg-bg border border-border text-text-secondary'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium text-center leading-tight ${
                  i === 0 ? 'text-accent' : 'text-text-secondary'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mb-5 mx-3 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Form Card */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {/* Card Header */}
        <div className="px-8 py-5 border-b border-border bg-bg rounded-t-xl">
          <h2 className="text-base font-semibold text-text-primary">Stage 1: Basic Information</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Define the primary identity and scope of the procurement process.
          </p>
        </div>

        {/* Form Body */}
        <div className="p-8 space-y-7">
          {/* Row 1: Title + Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <FieldLabel required>Tender Title</FieldLabel>
              <input
                type="text"
                value={form.title}
                onChange={e => update('title', e.target.value)}
                placeholder="e.g. Annual IT Infrastructure Upgrade 2024"
                className="w-full px-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg placeholder:text-text-secondary/40 transition-shadow"
              />
            </div>
            <div>
              <FieldLabel>Reference Number</FieldLabel>
              <div className="relative">
                <input
                  type="text"
                  value="Auto-generated on save"
                  disabled
                  className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg text-text-secondary/50 italic cursor-not-allowed pr-10"
                />
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[16px] text-text-secondary/40">
                  lock
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Category + Budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <FieldLabel>Category</FieldLabel>
              <select
                value={form.category}
                onChange={e => update('category', e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg cursor-pointer transition-shadow"
              >
                <option value="">Select Category</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Estimated Budget (USD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-secondary">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.estimatedBudget}
                  onChange={e => update('estimatedBudget', e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg placeholder:text-text-secondary/40 transition-shadow"
                />
              </div>
            </div>
          </div>

          {/* Procurement Type */}
          <div>
            <FieldLabel>Procurement Type</FieldLabel>
            <div className="flex flex-wrap gap-6 mt-1">
              {PROCUREMENT_TYPES.map(type => (
                <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="procurementType"
                    value={type}
                    checked={form.procurementType === type}
                    onChange={() => update('procurementType', type)}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm text-text-primary group-hover:text-accent transition-colors">
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Submission Deadline */}
          <div className="max-w-lg">
            <FieldLabel>Submission Deadline</FieldLabel>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                value={form.submissionDeadlineDate}
                onChange={e => update('submissionDeadlineDate', e.target.value)}
                className="px-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg transition-shadow"
              />
              <input
                type="time"
                value={form.submissionDeadlineTime}
                onChange={e => update('submissionDeadlineTime', e.target.value)}
                className="px-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg transition-shadow"
              />
            </div>
            <p className="flex items-center gap-1 text-xs text-text-secondary mt-2">
              <span className="material-symbols-outlined text-[13px]">info</span>
              Closing time is based on GMT+3 (Kuwait time).
            </p>
          </div>

          {/* Description */}
          <div>
            <FieldLabel>Tender Description</FieldLabel>
            <textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Provide a detailed overview of the procurement requirements, scope of work, and key performance indicators..."
              rows={6}
              className="w-full px-4 py-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg placeholder:text-text-secondary/40 resize-none transition-shadow"
            />
          </div>
        </div>

        {/* Card Footer */}
        <div className="px-8 py-5 border-t border-border bg-bg rounded-b-xl flex items-center justify-between">
          <Link
            href="/tenders"
            className="flex items-center gap-1.5 text-sm text-danger hover:bg-danger/5 px-4 py-2 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">cancel</span>
            Cancel
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold border border-border text-text-secondary hover:bg-card rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              {saving ? 'Saving…' : 'Save as Draft'}
            </button>
            <button
              disabled
              title="Complete all steps to proceed"
              className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold bg-accent text-white rounded-lg opacity-40 cursor-not-allowed"
            >
              Next: Technical Requirements
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-card border border-border rounded-xl flex gap-3">
          <span className="material-symbols-outlined text-[22px] text-accent flex-shrink-0">verified_user</span>
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-0.5">Compliance Check</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              All inputs are validated against current regional procurement regulations and institutional policies.
            </p>
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl flex gap-3">
          <span className="material-symbols-outlined text-[22px] text-success flex-shrink-0">auto_awesome</span>
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-0.5">Smart Suggestions</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Evaluation criteria suggestions based on your chosen tender category are available in step 3.
            </p>
          </div>
        </div>
        <div className="p-5 bg-card border border-border rounded-xl flex gap-3">
          <span className="material-symbols-outlined text-[22px] text-text-secondary flex-shrink-0">help_outline</span>
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-0.5">Need Assistance?</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Contact the procurement helpdesk at extension 4022 for guidance on filling these forms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
