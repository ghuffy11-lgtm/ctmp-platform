'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Lock, Info, XCircle, Save, ShieldCheck, Sparkles } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  code: string;
}

const STEPS = [
  'Basic Information',
  'Technical Requirements',
  'Evaluation Criteria',
  'Documents & Attachments',
];

// Migration 054 (2026-08-13): categories now come from the managed
// tender_categories table (Settings → Tender Categories). This array used to be
// hardcoded here AND in the other tender form; the fallback below only applies
// if the API call fails, so the form is never unusable.
const CATEGORY_FALLBACK = [
  'Construction', 'IT Services', 'Healthcare', 'Engineering',
  'Services', 'Insurance', 'Consulting', 'Supply',
];

// Categories come from the API (Settings → Tender Categories), falling back to
// the previously-hardcoded list only if that call fails.
function useTenderCategories(): string[] {
  const [categories, setCategories] = useState<string[]>(CATEGORY_FALLBACK);
  useEffect(() => {
    get<{ items: Array<{ name: string; isActive: boolean }> }>('/tender-categories', getAccessToken())
      .then(res => {
        const names = (res.items ?? []).filter(c => c.isActive).map(c => c.name);
        if (names.length > 0) setCategories(names);
      })
      .catch(() => {});
  }, []);
  return categories;
}


const PROCUREMENT_TYPES = ['Open Tender', 'Restricted', 'Single Source'];

interface FormData {
  title: string;
  departmentId: string;
  category: string;
  procurementType: string;
  estimatedBudget: string;
  visibility: 'PUBLIC' | 'INVITATION_ONLY';
  submissionDeadlineDate: string;
  submissionDeadlineTime: string;
  clarificationDeadlineDate: string;
  clarificationDeadlineTime: string;
  description: string;
  // BUG-137 (2026-06-19): require bidders to upload ≥1 supporting document.
  requiresSupportingDocuments: boolean;
}

const EMPTY_FORM: FormData = {
  title: '',
  departmentId: '',
  category: '',
  procurementType: '',
  estimatedBudget: '',
  visibility: 'PUBLIC',
  submissionDeadlineDate: '',
  submissionDeadlineTime: '',
  clarificationDeadlineDate: '',
  clarificationDeadlineTime: '',
  description: '',
  requiresSupportingDocuments: false,
};

export default function CreateTenderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [departments, setDepartments] = useState<Department[]>([]);
  const submissionDateRef = useRef<HTMLInputElement>(null);
  const submissionTimeRef = useRef<HTMLInputElement>(null);
  const clarificationDateRef = useRef<HTMLInputElement>(null);
  const clarificationTimeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const departmentRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const currentStep = 0;
  const categories = useTenderCategories();

  useEffect(() => {
    const token = getAccessToken();
    get<{ data: Department[] }>('/departments?pageSize=100', token)
      .then((res) => setDepartments(res.data ?? []))
      .catch(() => {});
  }, []);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSaveDraft() {
    // Fall back to DOM values to handle inputs set via JS without firing React events
    const title = (form.title || titleRef.current?.value || '').trim();
    const departmentId = form.departmentId || departmentRef.current?.value || '';
    const submissionDate = form.submissionDeadlineDate || submissionDateRef.current?.value || '';
    const submissionTime = form.submissionDeadlineTime || submissionTimeRef.current?.value || '';
    const clarificationDate = form.clarificationDeadlineDate || clarificationDateRef.current?.value || '';
    const clarificationTime = form.clarificationDeadlineTime || clarificationTimeRef.current?.value || '';
    const description = (form.description || descriptionRef.current?.value || '').trim();

    if (!title) { setError('Tender title is required.'); return; }
    if (!departmentId) { setError('Department is required.'); return; }
    if (!submissionDate) { setError('Submission deadline is required.'); return; }

    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      const deadlineTime = submissionTime || '23:59';
      const submissionDeadline = new Date(`${submissionDate}T${deadlineTime}:00`).toISOString();

      let clarificationDeadline: string | undefined;
      if (clarificationDate) {
        const clTime = clarificationTime || '23:59';
        clarificationDeadline = new Date(`${clarificationDate}T${clTime}:00`).toISOString();
      }

      const payload: Record<string, unknown> = {
        title,
        description: description || undefined,
        departmentId,
        submissionDeadline,
        ...(clarificationDeadline ? { clarificationDeadline } : {}),
      };
      if (form.category) payload.category = form.category;
      if (form.procurementType) payload.procurementType = form.procurementType;
      if (form.estimatedBudget && !Number.isNaN(Number(form.estimatedBudget))) {
        payload.estimatedBudget = Number(form.estimatedBudget);
      }
      payload.visibility = form.visibility;
      // BUG-137 (2026-06-19): always pass the flag so backend persists it.
      payload.requiresSupportingDocuments = form.requiresSupportingDocuments;
      const result = await post<{ id: string }>('/tenders', payload, token);
      // BUG-060 / WALK-007: drop the officer straight into the edit page so
      // they can configure the Technical Evaluation Criteria before submitting
      // for approval. The edit page (BUG-044) hosts the TenderCriteriaEditor.
      router.push(`/tenders/${result.id}/edit?from=create`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tender');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto w-full">
      <nav className="flex text-slate-500 text-sm mb-2">
        <Link href="/tenders" className="hover:text-blue-600 transition-colors">Tenders</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900 font-semibold">Create New Tender</span>
      </nav>
      <h2 className="text-2xl font-bold text-slate-900 mb-8">Create New Tender</h2>

      {/* Stepper */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-2 flex-1 relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold z-10 ${
                i === currentStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {i + 1}
              </div>
              <span className={`text-xs ${i === currentStep ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{label}</span>
              {i < STEPS.length - 1 && (
                <div className="absolute top-5 left-1/2 w-full h-[2px] bg-slate-200" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-900">Stage 1: Basic Information</h3>
          <p className="text-sm text-slate-500 mt-1">Define the primary identity and scope of the procurement process.</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Row 1: Title + Reference */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Tender Title <span className="text-rose-500">*</span></label>
              <input
                ref={titleRef}
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="e.g. Annual IT Infrastructure Upgrade 2026"
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Reference Number</label>
              <div className="relative">
                <input
                  type="text"
                  value="Auto-generated on save"
                  disabled
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-sm italic cursor-not-allowed"
                />
                <Lock className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
            </div>
          </div>

          {/* Department */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Department <span className="text-rose-500">*</span></label>
            <select
              ref={departmentRef}
              value={form.departmentId}
              onChange={(e) => update('departmentId', e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm bg-white"
            >
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>

          {/* Category + Procurement Type + Estimated Budget — BUG-008/010 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Category</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm bg-white"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Estimated Budget (KWD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">KWD</span>
                <input
                  type="number"
                  min="0"
                  value={form.estimatedBudget}
                  onChange={(e) => update('estimatedBudget', e.target.value)}
                  placeholder="e.g. 100000"
                  className="w-full pl-14 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <p className="text-xs text-slate-400">Optional now — required before Publish.</p>
            </div>
          </div>

          {/* BUG-015: visibility — locked once saved. */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Visibility</label>
            <div className="flex flex-wrap gap-6 mt-1">
              {(['PUBLIC', 'INVITATION_ONLY'] as const).map((v) => (
                <label key={v} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    value={v}
                    checked={form.visibility === v}
                    onChange={() => update('visibility', v)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">
                    {v === 'PUBLIC' ? 'Public — open to all approved vendors' : 'Invitation only — select vendors after save'}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Locked once saved. Invitation-only tenders require at least 3 invited vendors before Publish.
            </p>
          </div>

          {/* BUG-137 (2026-06-19): require bidders to upload supporting docs. */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Supporting Documents</label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requiresSupportingDocuments}
                onChange={(e) => update('requiresSupportingDocuments', e.target.checked)}
                className="w-4 h-4 accent-blue-600 mt-0.5"
              />
              <span className="text-sm text-slate-700">
                Require vendors to upload supporting documents (certificates, letters, etc.)
                <span className="block text-xs text-slate-500 mt-0.5">
                  When enabled, vendors must attach at least one PDF before submitting their bid.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Procurement Type</label>
            <div className="flex flex-wrap gap-6 mt-1">
              {PROCUREMENT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="procurementType"
                    value={type}
                    checked={form.procurementType === type}
                    onChange={() => update('procurementType', type)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">{type}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">Optional now — required before Publish.</p>
          </div>

          {/* Submission Deadline */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Submission Deadline <span className="text-rose-500">*</span></label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <input
                ref={submissionDateRef}
                type="date"
                value={form.submissionDeadlineDate}
                onChange={(e) => update('submissionDeadlineDate', e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
              />
              <input
                ref={submissionTimeRef}
                type="time"
                value={form.submissionDeadlineTime}
                onChange={(e) => update('submissionDeadlineTime', e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
              />
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Closing time is based on your local timezone.
            </p>
          </div>

          {/* Clarification Deadline */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Clarification Deadline <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <input
                ref={clarificationDateRef}
                type="date"
                value={form.clarificationDeadlineDate}
                onChange={(e) => update('clarificationDeadlineDate', e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
              />
              <input
                ref={clarificationTimeRef}
                type="time"
                value={form.clarificationDeadlineTime}
                onChange={(e) => update('clarificationDeadlineTime', e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Tender Description</label>
            <textarea
              ref={descriptionRef}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Provide a detailed overview of the procurement requirements, scope of work, and key performance indicators..."
              rows={6}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm resize-y"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <Link
            href="/tenders"
            className="px-6 py-2.5 text-sm text-rose-600 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-2"
          >
            <XCircle className="w-5 h-5" /> Cancel
          </Link>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="px-6 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl flex gap-4">
          <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Compliance Check</h4>
            <p className="text-xs text-slate-500 mt-1">Inputs are validated against current procurement regulations and institutional policies.</p>
          </div>
        </div>
        <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex gap-4">
          <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Drafts Auto-Saved</h4>
            <p className="text-xs text-slate-500 mt-1">Saved drafts can be edited later from the Tenders list before submission for review.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
