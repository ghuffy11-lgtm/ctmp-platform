'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { get, patch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TenderCriteriaEditor } from '@/components/TenderCriteriaEditor';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lock,
  Info,
  ArrowLeft,
  Save,
} from 'lucide-react';

const CATEGORIES = [
  'Construction', 'IT Services', 'Healthcare', 'Engineering',
  'Services', 'Insurance', 'Consulting', 'Supply',
];

const PROCUREMENT_TYPES = ['Open Tender', 'Restricted', 'Single Source'];

interface TenderData {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  category: string;
  status: string;
  procurementType: string | null;
  estimatedBudget: number | null;
  submissionDeadline: string | null;
  departmentName?: string;
  departmentCode?: string | null;
  departmentId?: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface FormData {
  title: string;
  departmentId: string;
  category: string;
  procurementType: string;
  estimatedBudget: string;
  submissionDeadlineDate: string;
  submissionDeadlineTime: string;
  description: string;
}

function toFormData(tender: TenderData): FormData {
  let deadlineDate = '';
  let deadlineTime = '';
  if (tender.submissionDeadline) {
    const d = new Date(tender.submissionDeadline);
    deadlineDate = d.toISOString().slice(0, 10);
    deadlineTime = d.toTimeString().slice(0, 5);
  }
  return {
    title: tender.title,
    departmentId: tender.departmentId ?? '',
    category: tender.category ?? '',
    procurementType: tender.procurementType ?? '',
    estimatedBudget: tender.estimatedBudget != null ? String(tender.estimatedBudget) : '',
    submissionDeadlineDate: deadlineDate,
    submissionDeadlineTime: deadlineTime,
    description: tender.description ?? '',
  };
}

// BUG-010: budget editable only in Draft + Internal Review.
const BUDGET_EDITABLE_STATUSES = new Set(['Draft', 'Internal Review']);

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
  );
}

export default function EditTenderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromCreate = searchParams.get('from') === 'create';
  const tenderId = params.id as string;

  const [tender, setTender] = useState<TenderData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken();
        const [result, deptRes] = await Promise.all([
          get<TenderData>(`/tenders/${tenderId}`, token),
          get<{ data: Department[] }>('/departments?pageSize=100', token).catch(() => ({ data: [] })),
        ]);
        setTender(result);
        setForm(toFormData(result));
        setDepartments(deptRes.data ?? []);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load tender');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenderId]);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm(f => f ? { ...f, [field]: value } : f);
  }

  async function handleSave() {
    if (!form || !form.title.trim() || !tender) return;
    setSaving(true);
    try {
      const token = getAccessToken();
      let submissionDeadline: string | null = null;
      if (form.submissionDeadlineDate) {
        const time = form.submissionDeadlineTime || '23:59';
        submissionDeadline = new Date(`${form.submissionDeadlineDate}T${time}:00`).toISOString();
      }
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category || null,
        procurementType: form.procurementType || null,
        submissionDeadline,
        description: form.description.trim() || null,
      };
      // BUG-009: only send departmentId on Draft (backend rejects mid-flight).
      if (tender.status === 'Draft' && form.departmentId) {
        payload.departmentId = form.departmentId;
      }
      // BUG-010: only send estimatedBudget when editable.
      if (BUDGET_EDITABLE_STATUSES.has(tender.status)) {
        payload.estimatedBudget = form.estimatedBudget ? Number(form.estimatedBudget) : null;
      }
      await patch(`/tenders/${tenderId}`, payload, token);
      router.push(`/tenders/${tenderId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <div className="h-3.5 bg-card rounded animate-pulse w-40" />
        <div className="h-8 bg-card rounded animate-pulse w-72" />
        <div className="h-64 bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError || !tender || !form) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex flex-col items-center gap-3 py-24">
        <AlertCircle className="w-12 h-12 text-danger" />
        <p className="text-sm text-text-secondary">{loadError ?? 'Tender not found'}</p>
        <Link href="/tenders" className="text-sm text-accent hover:underline font-semibold">
          Back to Tenders
        </Link>
      </div>
    );
  }

  const canSave = form.title.trim().length > 0 && !saving;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary mb-6">
        <Link href="/tenders" className="hover:text-accent transition-colors">Tenders</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href={`/tenders/${tenderId}`} className="hover:text-accent transition-colors">
          {tender.referenceNumber}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">Edit</span>
      </nav>

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Edit Tender</h1>
        <StatusBadge status={tender.status} />
      </div>

      {/* Form Card */}
      <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {/* Card Header */}
        <div className="px-8 py-5 border-b border-border bg-bg rounded-t-xl">
          <h2 className="text-base font-semibold text-text-primary">Basic Information</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Update the details of this tender. Reference number cannot be changed.
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
                  value={tender.referenceNumber}
                  disabled
                  className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg text-text-secondary/60 cursor-not-allowed pr-10 font-mono"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/40" />
              </div>
            </div>
          </div>

          {/* BUG-009: Department editable in Draft only; locked after submission. */}
          <div>
            <FieldLabel required>Department</FieldLabel>
            {tender.status === 'Draft' ? (
              <select
                value={form.departmentId}
                onChange={e => update('departmentId', e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg cursor-pointer transition-shadow"
              >
                <option value="">Select Department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={tender.departmentName ?? '—'}
                  disabled
                  className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg text-text-secondary/70 cursor-not-allowed pr-10"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/40" />
                <p className="text-xs text-text-secondary mt-1">Department is locked after the tender leaves Draft status.</p>
              </div>
            )}
          </div>

          {/* Row 2: Category + Budget (BUG-010: budget editable in Draft + Internal Review only) */}
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
              <FieldLabel>Estimated Budget (KWD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-secondary">
                  KWD
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.estimatedBudget}
                  onChange={e => update('estimatedBudget', e.target.value)}
                  placeholder="0.00"
                  disabled={!BUDGET_EDITABLE_STATUSES.has(tender.status)}
                  className={`w-full pl-14 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg placeholder:text-text-secondary/40 transition-shadow ${!BUDGET_EDITABLE_STATUSES.has(tender.status) ? 'cursor-not-allowed text-text-secondary/70' : ''}`}
                />
              </div>
              {!BUDGET_EDITABLE_STATUSES.has(tender.status) && (
                <p className="text-xs text-text-secondary mt-1">Budget is locked after approval.</p>
              )}
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
              <Info className="w-3.5 h-3.5" />
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
            href={`/tenders/${tenderId}`}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:bg-bg px-4 py-2 rounded-lg transition-colors border border-border"
          >
            <ArrowLeft className="w-4 h-4" />
            Discard Changes
          </Link>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* BUG-060 / WALK-007: post-create cue. Officer landed here straight
          from /tenders/new so they can configure criteria as a next step. */}
      {fromCreate && (
        <div className="mt-6 bg-accent/5 border border-accent/30 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Tender created — next: set the Technical Evaluation Criteria</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Define the criteria evaluators will score against (weights must total 100). You can revisit this page anytime before approval.
            </p>
          </div>
        </div>
      )}

      {/* Phase F (BUG-044): Per-tender criteria editor — visible whenever the
          tender exists; backend rejects saves at non-editable statuses anyway. */}
      <div className="mt-6">
        <TenderCriteriaEditor
          tenderId={tenderId}
          editable={['Draft', 'Internal Review', 'Approved'].includes(tender.status)}
        />
      </div>
    </div>
  );
}
