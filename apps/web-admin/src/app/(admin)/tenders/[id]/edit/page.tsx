'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { get, patch, post, del } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TenderCriteriaEditor } from '@/components/TenderCriteriaEditor';
import { TenderBoqEditor } from '@/components/TenderBoqEditor';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lock,
  Info,
  ArrowLeft,
  Save,
  Send,
  Upload,
  Download,
  FolderOpen,
  FileText,
  Trash2,
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
  // BUG-122 (2026-06-11): visibility editable in DRAFT / INTERNAL_REVIEW
  // (pre-publish). Backend additionally rejects the change when any
  // submitted bid exists.
  visibility?: 'PUBLIC' | 'INVITATION_ONLY';
  // BUG-137 (2026-06-19): require bidders to upload ≥1 supporting doc.
  requiresSupportingDocuments?: boolean;
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
  // BUG-122 (2026-06-11): visibility editable pre-publish.
  visibility: 'PUBLIC' | 'INVITATION_ONLY';
  // BUG-137 (2026-06-19): require bidders to upload ≥1 supporting doc.
  requiresSupportingDocuments: boolean;
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
    // BUG-122 (2026-06-11): preserve current visibility in the form.
    visibility: tender.visibility ?? 'PUBLIC',
    // BUG-137 (2026-06-19): preserve current flag.
    requiresSupportingDocuments: tender.requiresSupportingDocuments ?? false,
  };
}

// BUG-010: budget editable only in Draft + Internal Review.
const BUDGET_EDITABLE_STATUSES = new Set(['Draft', 'Internal Review']);
// BUG-085 (2026-06-02): same gate the detail-page Documents block uses.
const EDITABLE_STATUSES = ['Draft', 'Internal Review', 'Approved'];
const TENDER_DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  // BUG-085: permission for the Submit-for-Approval CTA at the bottom of /edit.
  const [canSubmit, setCanSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const t = getAccessToken();
    if (t) setCanSubmit(hasPermission(t, 'tender:edit'));
  }, []);
  const confirm = useConfirm();

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

  // BUG-085: Submit-for-Approval mirrors the detail page button so officers
  // can complete tender setup + advance the workflow from /edit without
  // bouncing back.
  async function handleSubmitForApproval() {
    if (!tender) return;
    const ok = await confirm({
      title: 'Submit for approval',
      body: 'Submit this tender for internal review? You will no longer be able to change the Department after this.',
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/submit-for-approval`, {}, token);
      router.push(`/tenders/${tenderId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit for approval');
    } finally {
      setSubmitting(false);
    }
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
      // BUG-122b (2026-06-11): in APPROVED status the backend only accepts a
      // visibility-only payload. Skip every other field. For Draft/IR the
      // full payload goes as before.
      const payload: Record<string, unknown> = {};
      const visibilityChanged = form.visibility !== tender.visibility;

      if (tender.status === 'Approved') {
        if (visibilityChanged) {
          payload.visibility = form.visibility;
        } else {
          // Nothing to send — bail without hitting the API.
          router.push(`/tenders/${tenderId}`);
          return;
        }
      } else {
        payload.title = form.title.trim();
        payload.category = form.category || null;
        payload.procurementType = form.procurementType || null;
        payload.submissionDeadline = submissionDeadline;
        payload.description = form.description.trim() || null;
        // BUG-009: only send departmentId on Draft (backend rejects mid-flight).
        if (tender.status === 'Draft' && form.departmentId) {
          payload.departmentId = form.departmentId;
        }
        // BUG-010: only send estimatedBudget when editable.
        if (BUDGET_EDITABLE_STATUSES.has(tender.status)) {
          payload.estimatedBudget = form.estimatedBudget ? Number(form.estimatedBudget) : null;
        }
        // BUG-122: visibility alongside everything else in Draft / Internal Review.
        if (visibilityChanged) {
          payload.visibility = form.visibility;
        }
        // BUG-137 (2026-06-19): allow flag edit pre-publish.
        if (form.requiresSupportingDocuments !== (tender.requiresSupportingDocuments ?? false)) {
          payload.requiresSupportingDocuments = form.requiresSupportingDocuments;
        }
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

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{fromCreate ? 'Tender Setup' : 'Edit Tender'}</h1>
        <StatusBadge status={tender.status} />
      </div>

      {/* BUG-085 (2026-06-02): banner moved to the TOP so the officer sees the
           setup path immediately. Owner found the previous flow confusing —
           Save → end up here → not realising the page also holds Criteria + BoQ
           + Documents. Banner names the four sections + final action. */}
      {fromCreate && (
        <div className="mb-6 bg-accent/5 border border-accent/30 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Tender created — finish setup below</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Scroll through Basic Information → <Link href="#documents" className="text-accent hover:underline">Documents</Link> → <Link href="#criteria" className="text-accent hover:underline">Criteria</Link> → <Link href="#boq" className="text-accent hover:underline">BoQ</Link>, then click <strong>Submit for Approval</strong> at the bottom. Weights for Criteria must total 100; BoQ defines what vendors price per line.
            </p>
          </div>
        </div>
      )}

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

          {/* BUG-122 + BUG-122b (2026-06-11): Visibility — editable while
              tender is pre-publish (DRAFT, INTERNAL_REVIEW, or APPROVED).
              Locked once Published. Backend rejects when any submitted bid
              exists, regardless of state. */}
          {(tender.status === 'Draft' || tender.status === 'Internal Review' || tender.status === 'Approved') ? (
            <div>
              <FieldLabel>Visibility</FieldLabel>
              <div className="flex flex-wrap gap-6 mt-1">
                {(['PUBLIC', 'INVITATION_ONLY'] as const).map(v => (
                  <label key={v} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      checked={form.visibility === v}
                      onChange={() => update('visibility', v)}
                      className="w-4 h-4 accent-accent"
                    />
                    <span className="text-sm text-text-primary group-hover:text-accent transition-colors">
                      {v === 'PUBLIC' ? 'Public — open to all approved vendors' : 'Invitation only — manage invited vendors after save'}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Editable while pre-publish. Switching to Invitation Only requires at least 3 invited vendors before you can Publish.
              </p>
            </div>
          ) : (
            <div>
              <FieldLabel>Visibility</FieldLabel>
              <p className="text-sm text-text-primary">
                {tender.visibility === 'INVITATION_ONLY' ? 'Invitation only' : 'Public'}
                <span className="ml-2 text-xs text-text-secondary">(locked after Approval)</span>
              </p>
            </div>
          )}

          {/* BUG-137 (2026-06-19): Supporting documents requirement. Editable
              pre-publish; informational badge after that. */}
          {(tender.status === 'Draft' || tender.status === 'Internal Review' || tender.status === 'Approved') ? (
            <div>
              <FieldLabel>Supporting Documents</FieldLabel>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiresSupportingDocuments}
                  onChange={e => update('requiresSupportingDocuments', e.target.checked)}
                  className="w-4 h-4 accent-accent mt-0.5"
                />
                <span className="text-sm text-text-primary">
                  Require vendors to upload supporting documents (certificates, letters, etc.)
                  <span className="block text-xs text-text-secondary mt-0.5">
                    When enabled, vendors must attach at least one PDF before submitting their bid.
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <div>
              <FieldLabel>Supporting Documents</FieldLabel>
              <p className="text-sm text-text-primary">
                {tender.requiresSupportingDocuments ? 'Required (vendors must attach ≥1 PDF)' : 'Optional'}
                <span className="ml-2 text-xs text-text-secondary">(locked after Publish)</span>
              </p>
            </div>
          )}

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

      {/* BUG-085: Tender Documents block lifted from the detail page so the
          officer can attach RFQ docs as part of the one-page setup flow. */}
      <div id="documents" className="mt-6 scroll-mt-6">
        <TenderDocumentsBlock
          tenderId={tenderId}
          editable={EDITABLE_STATUSES.includes(tender.status)}
        />
      </div>

      {/* Phase F (BUG-044): Per-tender criteria editor — visible whenever the
          tender exists; backend rejects saves at non-editable statuses anyway. */}
      <div id="criteria" className="mt-6 scroll-mt-6">
        <TenderCriteriaEditor
          tenderId={tenderId}
          editable={EDITABLE_STATUSES.includes(tender.status)}
        />
      </div>

      {/* BUG-068 / Phase F BOQ: Per-tender BOQ editor — same status gate as
          the criteria editor. Vendors will fill unit prices against these lines. */}
      <div id="boq" className="mt-6 scroll-mt-6">
        <TenderBoqEditor
          tenderId={tenderId}
          editable={EDITABLE_STATUSES.includes(tender.status)}
        />
      </div>

      {/* BUG-085: Submit-for-Approval CTA at the bottom — mirrors the detail
          page action so the officer can complete setup and advance the workflow
          without navigating back. Only when status=Draft + caller has tender:edit. */}
      {tender.status === 'Draft' && canSubmit && (
        <div className="mt-8 bg-card border border-accent/40 rounded-xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold text-text-primary">Ready to submit?</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Make sure Criteria weights total 100 and the BoQ lines are configured. After submit, the tender moves to Internal Review.
            </p>
          </div>
          <button
            onClick={handleSubmitForApproval}
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      )}
    </div>
  );
}

// BUG-085 (2026-06-02): Tender Documents block — same upload + delete pattern
// as the detail-page Overview tab. Inline component to keep the edit-page
// change scoped to this one file. Lift to packages/ui if a third surface needs
// it.
function TenderDocumentsBlock({ tenderId, editable }: { tenderId: string; editable: boolean }) {
  const confirm = useConfirm();
  const [docs, setDocs] = useState<Array<{ id: string; filename: string; fileSize: number; mimeType: string; uploadedAt: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const token = getAccessToken();
      const t = await get<{ documents: Array<{ id: string; filename: string; fileSize: number; mimeType: string; uploadedAt: string }> }>(
        `/tenders/${tenderId}`,
        token,
      );
      setDocs(t.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenderId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${apiBase}/api/v1/tenders/${tenderId}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string, filename: string) {
    const ok = await confirm({
      title: 'Delete document',
      body: `Delete "${filename}"? This cannot be undone.`,
      destructive: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const token = getAccessToken();
      await del(`/tenders/${tenderId}/documents/${docId}`, token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleDownload(docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/api/v1/tenders/${tenderId}/documents/${docId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-bg/40">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Tender Documents</h3>
          <p className="text-xs text-text-secondary mt-0.5">RFQ, scope of work, drawings, addenda — anything vendors need to bid.</p>
        </div>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={TENDER_DOC_ACCEPT}
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm text-accent hover:underline font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </>
        )}
      </div>
      {error && <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-xs text-danger">{error}</div>}
      {docs === null ? (
        <div className="py-8 text-center text-sm text-text-secondary">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="py-10 text-center">
          <FolderOpen className="w-10 h-10 text-text-secondary/30 mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No documents attached yet.</p>
          {editable && <p className="text-xs text-text-secondary mt-1">Click <strong>Upload</strong> above to attach the RFQ / scope / drawings.</p>}
        </div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">File</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Size</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Uploaded</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {docs.map(doc => (
              <tr key={doc.id} className="hover:bg-bg/60 transition-colors">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-text-secondary" />
                    <span className="text-sm text-text-primary">{doc.filename}</span>
                  </div>
                </td>
                <td className="px-6 py-3.5 text-sm text-text-secondary">{formatFileSize(doc.fileSize)}</td>
                <td className="px-6 py-3.5 text-sm text-text-secondary">
                  {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-6 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDownload(doc.id, doc.filename)}
                      className="p-1.5 hover:bg-bg rounded-lg text-text-secondary hover:text-accent transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {editable && (
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        className="p-1.5 hover:bg-danger/5 rounded-lg text-text-secondary hover:text-danger transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
