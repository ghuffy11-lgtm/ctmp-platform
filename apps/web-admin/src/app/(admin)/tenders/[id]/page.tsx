'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { get, post, del } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ManageInvitedVendors } from '@/components/ManageInvitedVendors';
import { AmendAwardDialog } from '@/components/comparison/AmendAwardDialog';
import { RevertTenderDialog } from '@/components/dialog/RevertTenderDialog';
import { CancelTenderDialog } from '@/components/dialog/CancelTenderDialog';
import { HoldTenderDialog } from '@/components/dialog/HoldTenderDialog';
import { ResumeTenderDialog } from '@/components/dialog/ResumeTenderDialog';
import { ReopenTenderDialog } from '@/components/dialog/ReopenTenderDialog';
import { ExtendSubmissionDialog } from '@/components/dialog/ExtendSubmissionDialog';
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Send,
  Globe,
  Pencil,
  Info,
  Building2,
  FolderOpen,
  Upload,
  Download,
  Check,
  FileText,
  Lock,
  Table2,
  Paperclip,
  MessageSquare,
  Shield,
  ClipboardList,
  Package,
  RefreshCw,
  Pause,
  Play,
} from 'lucide-react';
import { TenderCriteriaEditor } from '@/components/TenderCriteriaEditor';
import { TenderBoqEditor } from '@/components/TenderBoqEditor';

interface TenderDocument {
  id: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
  mimeType: string;
  checksumSha256?: string;
}

interface TenderDetail {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  category: string;
  status: string;
  // BUG-132 (2026-06-14): set when status === 'Suspended'; Resume returns
  // the tender to this state.
  previousStatus?: string | null;
  procurementType: string | null;
  estimatedBudget: number | null;
  submissionDeadline: string | null;
  departmentName: string;
  departmentCode: string;
  visibility?: 'PUBLIC' | 'INVITATION_ONLY';
  createdAt: string;
  bidCount: number;
  daysLeft: number | null;
  documents: TenderDocument[];
}

type TabId = 'overview' | 'criteria' | 'boq' | 'clarifications' | 'bids' | 'audit';

// BUG-085 (2026-06-02): Criteria + BoQ surfaced as first-class tabs alongside
// Overview / Clarifications / Bids / Audit. Owner walked the previous flow and
// found that managers had to click Edit just to view criteria + BoQ — an edit
// affordance shown for read-only purposes. Tabs are read-only; edit still
// happens on /tenders/:id/edit (unchanged).
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Info className="w-4 h-4" /> },
  { id: 'criteria', label: 'Criteria', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'boq', label: 'BoQ', icon: <Package className="w-4 h-4" /> },
  { id: 'clarifications', label: 'Clarifications', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'bids', label: 'Bids', icon: <FileText className="w-4 h-4" /> },
  { id: 'audit', label: 'Audit Trail', icon: <Shield className="w-4 h-4" /> },
];

const LIFECYCLE_STAGES = [
  { label: 'Draft', key: 'Draft' },
  { label: 'Internal Review', key: 'Internal Review' },
  { label: 'Approved', key: 'Approved' },
  { label: 'Published', key: 'Published' },
  { label: 'Clarification Period', key: 'Clarification Period' },
  { label: 'Submission Closed', key: 'Submission Closed' },
  { label: 'Technical Opening', key: 'Technical Opening' },
  { label: 'Technical Evaluation', key: 'Technical Evaluation' },
  { label: 'Commercial Sealed', key: 'Commercial Sealed' },
  { label: 'Comm. Opening', key: 'Committee Commercial Opening' },
  { label: 'Commercial Eval.', key: 'Commercial Evaluation / Comparison' },
  { label: 'Award Recommendation', key: 'Award Recommendation' },
  { label: 'Awarded', key: 'Awarded' },
  { label: 'Tender Closed', key: 'Tender Closed' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): React.ReactNode {
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-text-secondary" />;
  if (mimeType.includes('word') || mimeType.includes('doc')) return <FileText className="w-5 h-5 text-text-secondary" />;
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('xls')) return <Table2 className="w-5 h-5 text-text-secondary" />;
  return <Paperclip className="w-5 h-5 text-text-secondary" />;
}

const TENDER_DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const EDITABLE_STATUSES = ['Draft', 'Internal Review', 'Approved'];
// BUG-132 (2026-06-14): Cancel allowed from every state except already-Cancelled.
// Hold/Resume superseded the old per-state allowlist on Cancel.

export default function TenderDetailPage() {
  const params = useParams();
  const tenderId = params.id as string;
  const confirm = useConfirm();
  const [tab, setTab] = useState<TabId>('overview');
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  // BUG-141 (2026-06-19): extend a Submission Closed tender.
  const [extendSubOpen, setExtendSubOpen] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Per-action permission flags. Token is read after mount so SSR and first
  // client paint match (BUG-046 hydration pattern). The state-change buttons
  // below also have status conditions; perm flags AND those conditions gate.
  const [perms, setPerms] = useState({
    submit: false,    // tender:edit
    publish: false,   // tender:publish
    closeSub: false,  // tender:close_submission
    techOpen: false,  // technical:open
    approve: false,   // tender:approve
    cancel: false,    // tender:cancel
    suspend: false,   // tender:suspend (BUG-132 — covers Hold AND Resume)
    edit: false,      // tender:edit
    award: false,     // award:finalize (legacy Issue Award action)
    amend: false,     // award:amend
    minutes: false,   // award:minutes:generate
    close: false,     // tender:close (WALK-052)
    revert: false,    // tender:revert (BUG-112)
  });
  useEffect(() => {
    const t = getAccessToken();
    if (!t) return;
    setPerms({
      submit:   hasPermission(t, 'tender:edit'),
      publish:  hasPermission(t, 'tender:publish'),
      closeSub: hasPermission(t, 'tender:close_submission'),
      techOpen: hasPermission(t, 'technical:open'),
      approve:  hasPermission(t, 'tender:approve'),
      cancel:   hasPermission(t, 'tender:cancel'),
      suspend:  hasPermission(t, 'tender:suspend'),
      edit:     hasPermission(t, 'tender:edit'),
      award:    hasPermission(t, 'award:finalize'),
      amend:    hasPermission(t, 'award:amend'),
      minutes:  hasPermission(t, 'award:minutes:generate'),
      close:    hasPermission(t, 'tender:close'),
      revert:   hasPermission(t, 'tender:revert'),
    });
  }, []);

  // Phase E (BUG-038): on-demand Award Minutes PDF.
  async function handleGenerateMinutes() {
    if (!tender) return;
    setGeneratingMinutes(true);
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/api/v1/tenders/${tender.id}/award/minutes.pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Award Minutes generation failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `award-minutes-${tender.referenceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate Award Minutes');
    } finally {
      setGeneratingMinutes(false);
    }
  }

  async function loadTender() {
    setLoading(true);
    try {
      const token = getAccessToken();
      const result = await get<TenderDetail>(`/tenders/${tenderId}`, token);
      setTender(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tender');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTender(); }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(action: string) {
    if (!tender) return;
    setActionLoading(action);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/${action}`, {}, token);
      await loadTender();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  // BUG-012: tender RFQ document upload pipeline.
  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingDoc(true);
    setDocError(null);
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch(`${apiBase}/api/v1/tenders/${tenderId}/documents`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? res.statusText);
      }
      await loadTender();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDocDelete(docId: string, filename: string) {
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
      await loadTender();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleDocDownload(docId: string, filename: string) {
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
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto space-y-4">
        <div className="h-3.5 bg-card rounded animate-pulse w-40" />
        <div className="h-8 bg-card rounded animate-pulse w-96" />
        <div className="h-4 bg-card rounded animate-pulse w-52" />
      </div>
    );
  }

  if (error || !tender) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto flex flex-col items-center gap-3 py-24">
        <AlertCircle className="w-12 h-12 text-danger" />
        <p className="text-sm text-text-secondary">{error ?? 'Tender not found'}</p>
        <Link href="/tenders" className="text-sm text-accent hover:underline font-semibold">
          Back to Tenders
        </Link>
      </div>
    );
  }

  const currentStageIndex = LIFECYCLE_STAGES.findIndex(s => s.key === tender.status);

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary mb-6">
        <Link href="/tenders" className="hover:text-accent transition-colors">Tenders</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">{tender.referenceNumber}</span>
      </nav>

      {/* Page Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{tender.title}</h1>
            <StatusBadge status={tender.status} />
          </div>
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{tender.referenceNumber}</span>
            {' · '}Created{' '}
            {new Date(tender.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* BUG-132 (2026-06-14): workflow buttons hidden while held or cancelled.
              Only Hold/Resume + Cancel are exposed in those states. */}
          {tender.status !== 'Suspended' && tender.status !== 'Cancelled' && (<>
          {tender.status === 'Draft' && perms.submit && (
            <button
              onClick={() => handleAction('submit-for-approval')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              {actionLoading === 'submit-for-approval' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit for Approval
                </>
              )}
            </button>
          )}
          {tender.status === 'Approved' && perms.publish && (
            <button
              onClick={() => handleAction('publish')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              <Globe className="w-4 h-4" />
              {actionLoading === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {tender.status === 'Published' && perms.closeSub && (
            <button
              onClick={() => handleAction('close-submissions')}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-border text-text-secondary text-sm font-semibold rounded-lg hover:bg-bg transition-colors disabled:opacity-60"
            >
              {actionLoading === 'close-submissions' ? 'Closing…' : 'Close Submissions'}
            </button>
          )}
          {tender.status === 'Submission Closed' && perms.techOpen && (
            <button
              onClick={() => handleAction('technical-opening')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              <FolderOpen className="w-4 h-4" />
              {actionLoading === 'technical-opening' ? 'Opening…' : 'Open Technical Envelopes'}
            </button>
          )}
          {/* BUG-141 (2026-06-19): re-open a Submission Closed tender with a
              new future deadline. Same permission as Close Submissions. */}
          {tender.status === 'Submission Closed' && perms.closeSub && (
            <button
              onClick={() => setExtendSubOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-amber-500/40 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-500/5 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              title="Re-open this tender with a new submission deadline so additional vendors can submit."
            >
              <RefreshCw className="w-4 h-4" />
              Extend Submission
            </button>
          )}
          {tender.status === 'Awarded' && (
            <>
              {perms.minutes && (
                <button
                  onClick={handleGenerateMinutes}
                  disabled={generatingMinutes}
                  className="px-4 py-2 border border-border text-text-secondary text-sm font-semibold rounded-lg hover:bg-bg transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  title="Generate the official Award Minutes PDF — a new copy is written every time"
                >
                  <FileText className="w-4 h-4" />
                  {generatingMinutes ? 'Generating…' : 'Generate Award Minutes'}
                </button>
              )}
              {perms.amend && (
                <button
                  onClick={() => setAmendOpen(true)}
                  className="px-4 py-2 border border-amber-300 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-1.5"
                  title="Amend the confirmed award — creates a new record that supersedes the active one"
                >
                  <Pencil className="w-4 h-4" />
                  Amend Award
                </button>
              )}
              {perms.award && (
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Issue award',
                      body: 'Issue formal award? This closes the tender and notifies the winning vendor.',
                      destructive: true,
                      confirmLabel: 'Issue award',
                    });
                    if (ok) handleAction('award');
                  }}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {actionLoading === 'award' ? 'Issuing…' : 'Issue Award'}
                </button>
              )}
              {/* WALK-052: final lifecycle close. PROCUREMENT_ADMIN-only. */}
              {perms.close && (
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Close tender',
                      body: 'Close this tender? The award decision is preserved; the tender moves from Awarded → Tender Closed.',
                      destructive: true,
                      confirmLabel: 'Close tender',
                    });
                    if (ok) handleAction('close-tender');
                  }}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 border border-border text-text-secondary text-sm font-semibold rounded-lg hover:bg-bg transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  title="Final lifecycle step: marks the tender as Closed for archival/reporting purposes."
                >
                  <Lock className="w-4 h-4" />
                  {actionLoading === 'close-tender' ? 'Closing…' : 'Close Tender'}
                </button>
              )}
            </>
          )}
          {/* BUG-125 (2026-06-11): Reopen from Tender Closed back to Awarded. */}
          {tender.status === 'Tender Closed' && perms.close && (
            <button
              onClick={() => setReopenOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-amber-500/30 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-500/5 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              title="Reopen this tender back to Awarded so the award can be amended or further actions taken."
            >
              <RefreshCw className="w-4 h-4" />
              Reopen Tender
            </button>
          )}
          {EDITABLE_STATUSES.includes(tender.status) && perms.edit && (
            <Link
              href={`/tenders/${tender.id}/edit`}
              className="px-4 py-2 border border-border text-text-secondary text-sm font-semibold rounded-lg hover:bg-bg transition-colors flex items-center gap-1.5"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </Link>
          )}
          {(tender.status === 'Published' || tender.status === 'Approved') && perms.revert && (
            <button
              onClick={() => setRevertOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-amber-500/40 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-500/5 transition-colors disabled:opacity-60"
              title="Roll a Published or Approved tender back to an earlier status so you can fix mistakes — including fields the edit form locks after approval. Blocked once vendors have submitted bids."
            >
              Revert
            </button>
          )}
          </>)}
          {/* BUG-132: Hold (available from every state except Suspended/Cancelled). */}
          {tender.status !== 'Suspended' && tender.status !== 'Cancelled' && perms.suspend && (
            <button
              onClick={() => setHoldOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-amber-500/40 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-500/5 transition-colors disabled:opacity-60 flex items-center gap-1.5"
              title="Put this tender on hold. Resume returns it to the same state."
            >
              <Pause className="w-4 h-4" />
              Hold
            </button>
          )}
          {/* BUG-132: Resume (only from Suspended). */}
          {tender.status === 'Suspended' && perms.suspend && (
            <button
              onClick={() => setResumeOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-amber-600 hover:opacity-90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
              title="Resume this tender to its previous state."
            >
              <Play className="w-4 h-4" />
              Resume
            </button>
          )}
          {/* BUG-132: Cancel allowed from every state except already-Cancelled. */}
          {tender.status !== 'Cancelled' && perms.cancel && (
            <button
              onClick={() => setCancelOpen(true)}
              disabled={actionLoading !== null}
              className="px-4 py-2 border border-danger/30 text-danger text-sm font-semibold rounded-lg hover:bg-danger/5 transition-colors disabled:opacity-60"
            >
              Cancel Tender
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 pb-3 pt-1 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="col-span-12 lg:col-span-8 space-y-5">
            {/* Description Card */}
            <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6">
              <div className="flex items-center gap-2 mb-5">
                <Info className="w-5 h-5 text-accent" />
                <h3 className="text-base font-semibold text-text-primary">Project Description</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {tender.description || 'No description provided.'}
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                      Lead Department
                    </p>
                    <div className="flex items-center gap-3 bg-bg p-3 rounded-lg border border-border">
                      <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4.5 h-4.5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{tender.departmentName}</p>
                        <p className="text-xs text-text-secondary">{tender.departmentCode}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-bg rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-card">
                    <h4 className="text-sm font-semibold text-text-primary">Key Details</h4>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-text-secondary">Category</span>
                      <span className="text-xs font-semibold text-text-primary">{tender.category || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-text-secondary">Procurement Type</span>
                      <span className="text-xs font-semibold text-text-primary">{tender.procurementType ?? '—'}</span>
                    </div>
                    {tender.estimatedBudget != null && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-text-secondary">Est. Budget</span>
                        <span className="text-xs font-semibold text-text-primary">
                          {/* WALK-008/012/019 / BUG-067: was hard-coded $/USD;
                              CTMP is a Kuwait-based on-prem deployment. Use KWD. */}
                          {tender.estimatedBudget.toLocaleString('en-GB', {
                            style: 'currency',
                            currency: 'KWD',
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    )}
                    {tender.submissionDeadline && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-text-secondary">Submission Deadline</span>
                        <span className="text-xs font-semibold text-danger">
                          {new Date(tender.submissionDeadline).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Documents Card */}
            <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-accent" />
                  <h3 className="text-base font-semibold text-text-primary">Tender Documents</h3>
                  <span className="ml-1 text-xs font-semibold bg-bg border border-border text-text-secondary px-2 py-0.5 rounded-full">
                    {tender.documents.length}
                  </span>
                </div>
                {EDITABLE_STATUSES.includes(tender.status) && (
                  <>
                    <input
                      ref={docInputRef}
                      type="file"
                      accept={TENDER_DOC_ACCEPT}
                      onChange={handleDocUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => docInputRef.current?.click()}
                      disabled={uploadingDoc}
                      className="flex items-center gap-1.5 text-sm text-accent hover:underline font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadingDoc ? 'Uploading…' : 'Upload'}
                    </button>
                  </>
                )}
              </div>
              {docError && (
                <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-xs text-danger">
                  {docError}
                </div>
              )}
              {tender.documents.length === 0 ? (
                <div className="py-10 text-center">
                  <FolderOpen className="w-10 h-10 text-text-secondary/30 mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No documents attached yet.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">File</th>
                      <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Size</th>
                      <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Uploaded</th>
                      <th className="px-6 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tender.documents.map(doc => (
                      <tr key={doc.id} className="hover:bg-bg/60 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            {getFileIcon(doc.mimeType)}
                            <span className="text-sm text-text-primary">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-sm text-text-secondary">{formatFileSize(doc.fileSize)}</td>
                        <td className="px-6 py-3.5 text-sm text-text-secondary">
                          {new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleDocDownload(doc.id, doc.filename)}
                              className="p-1.5 hover:bg-bg rounded-lg text-text-secondary hover:text-accent transition-colors"
                              title="Download"
                            >
                              <Download className="w-4.5 h-4.5" />
                            </button>
                            {EDITABLE_STATUSES.includes(tender.status) && (
                              <button
                                onClick={() => handleDocDelete(doc.id, doc.filename)}
                                className="p-1.5 hover:bg-danger/5 rounded-lg text-text-secondary hover:text-danger transition-colors"
                                title="Delete"
                              >
                                <AlertCircle className="w-4.5 h-4.5" />
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
          </div>

          {/* Right Column */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            {/* BUG-015: Manage Invited Vendors panel — only for INVITATION_ONLY tenders. */}
            {tender.visibility === 'INVITATION_ONLY' && (
              <ManageInvitedVendors tenderId={tender.id} tenderStatus={tender.status} />
            )}
            {/* Stats Bento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border p-5 rounded-xl">
                <p className="text-xs font-semibold tracking-widest text-text-secondary uppercase mb-2">Days Left</p>
                <p className="text-4xl font-bold text-text-primary leading-none">
                  {tender.daysLeft != null && tender.daysLeft >= 0 ? tender.daysLeft : '—'}
                </p>
              </div>
              <div className="bg-card border border-border p-5 rounded-xl">
                <p className="text-xs font-semibold tracking-widest text-text-secondary uppercase mb-2">Bids</p>
                <p className="text-4xl font-bold text-text-primary leading-none">
                  {String(tender.bidCount ?? 0).padStart(2, '0')}
                </p>
              </div>
            </div>

            {/* Workflow Progress */}
            <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
              <h4 className="text-sm font-semibold text-text-primary mb-5">Workflow Progress</h4>
              <div className="space-y-2">
                {LIFECYCLE_STAGES.map((stage, i) => {
                  const done = currentStageIndex >= 0 && i < currentStageIndex;
                  const active = i === currentStageIndex;
                  const pending = currentStageIndex >= 0 ? i > currentStageIndex : i > 0;
                  return (
                    <div key={stage.key} className={`flex items-center gap-3 ${pending ? 'opacity-40' : ''}`}>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-colors ${
                          done
                            ? 'bg-success text-white'
                            : active
                            ? 'bg-accent text-white ring-4 ring-accent/20'
                            : 'bg-bg border border-border text-text-secondary'
                        }`}
                      >
                        {done ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span
                        className={`text-xs transition-colors ${
                          active
                            ? 'font-semibold text-accent'
                            : done
                            ? 'text-text-secondary'
                            : 'text-text-secondary'
                        }`}
                      >
                        {stage.label}
                      </span>
                      {active && (
                        <span className="ml-auto text-[10px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                          Now
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <AmendAwardDialog
        open={amendOpen}
        tenderId={tender.id}
        currentVendorName={tender.title}
        onClose={() => setAmendOpen(false)}
        onAmended={() => { setAmendOpen(false); loadTender(); }}
      />

      <RevertTenderDialog
        open={revertOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        currentStatus={tender.status}
        onClose={() => setRevertOpen(false)}
        onReverted={() => { setRevertOpen(false); loadTender(); }}
      />

      <CancelTenderDialog
        open={cancelOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        tenderStatus={tender.status}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => { setCancelOpen(false); loadTender(); }}
      />

      <ReopenTenderDialog
        open={reopenOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        onClose={() => setReopenOpen(false)}
        onReopened={() => { setReopenOpen(false); loadTender(); }}
      />

      {/* BUG-141 (2026-06-19): Extend Submission dialog. */}
      <ExtendSubmissionDialog
        open={extendSubOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        currentSubmissionDeadline={tender.submissionDeadline}
        onClose={() => setExtendSubOpen(false)}
        onExtended={() => { setExtendSubOpen(false); loadTender(); }}
      />

      {/* BUG-132 (2026-06-14): Hold + Resume dialogs. */}
      <HoldTenderDialog
        open={holdOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        tenderStatus={tender.status}
        onClose={() => setHoldOpen(false)}
        onHeld={() => { setHoldOpen(false); loadTender(); }}
      />

      <ResumeTenderDialog
        open={resumeOpen}
        tenderId={tender.id}
        tenderReference={tender.referenceNumber}
        previousStatus={tender.previousStatus ?? null}
        onClose={() => setResumeOpen(false)}
        onResumed={() => { setResumeOpen(false); loadTender(); }}
      />

      {/* BUG-056 / WALK-009..022: real tab views (previously stubs). */}
      {tab === 'criteria' && (
        <div className="space-y-3">
          {perms.edit && EDITABLE_STATUSES.includes(tender.status) && (
            <div className="flex justify-end">
              <Link
                href={`/tenders/${tender.id}/edit#criteria`}
                className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit on edit page →
              </Link>
            </div>
          )}
          <TenderCriteriaEditor tenderId={tender.id} editable={false} />
        </div>
      )}
      {tab === 'boq' && (
        <div className="space-y-3">
          {perms.edit && EDITABLE_STATUSES.includes(tender.status) && (
            <div className="flex justify-end">
              <Link
                href={`/tenders/${tender.id}/edit#boq`}
                className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit on edit page →
              </Link>
            </div>
          )}
          <TenderBoqEditor tenderId={tender.id} editable={false} />
        </div>
      )}
      {tab === 'clarifications' && <ClarificationsTabPanel tenderId={tender.id} />}
      {tab === 'bids' && <BidsTabPanel tenderId={tender.id} />}
      {tab === 'audit' && <AuditTrailTabPanel tenderId={tender.id} />}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// BUG-056 — Tender detail tabs. Each panel fetches its own data on mount,
// renders an empty-state when nothing is there, and a tight list/table view
// otherwise. All three were stubs before this commit (WALK-009..022).
// ───────────────────────────────────────────────────────────────────────────

interface ClarificationReply {
  id: string;
  reply: string;
  visibility: 'GENERAL_PUBLIC' | 'PRIVATE_TO_VENDOR';
  repliedAt: string;
  repliedByName: string;
}

interface Clarification {
  id: string;
  vendorName: string | null;
  question: string;
  status: string;
  createdAt: string;
  replies: ClarificationReply[];
}

function ClarificationsTabPanel({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<Clarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // BUG-147 (2026-06-21): admin "Ask vendor a question" dialog state.
  const [askOpen, setAskOpen] = useState(false);
  // WALK-009/013/020 / BUG-067: caller can reply inline when they hold
  // `clarification:reply` (TECHNICAL_EVALUATOR + PROCUREMENT_ADMIN +
  // PROCUREMENT_OFFICER all carry it). BUG-147: same permission also gates
  // the new "Ask vendor a question" button.
  const [canReply, setCanReply] = useState(false);
  useEffect(() => {
    const t = getAccessToken();
    if (!t) return;
    setCanReply(hasPermission(t, 'clarification:reply'));
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await get<{ items: Clarification[] }>(`/tenders/${tenderId}/clarifications`, token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clarifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  // BUG-147 (2026-06-21): "+ Ask vendor a question" header strip — always
  // rendered when admin has clarification:reply, even when the list is
  // empty (so admin can initiate the first thread).
  const askHeader = canReply ? (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setAskOpen(true)}
        className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-bold hover:opacity-90 flex items-center gap-1.5"
      >
        <MessageSquare className="w-3.5 h-3.5" /> Ask vendor a question
      </button>
    </div>
  ) : null;

  if (loading) return (
    <div className="space-y-3">
      {askHeader}
      <TabSkeleton icon={<MessageSquare className="w-12 h-12 text-text-secondary/20" />} label="Loading clarifications…" />
    </div>
  );
  if (error) return (
    <div className="space-y-3">
      {askHeader}
      <TabError icon={<MessageSquare className="w-12 h-12 text-danger/40" />} message={error} />
    </div>
  );
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {askHeader}
        <TabEmpty
          icon={<MessageSquare className="w-12 h-12 text-text-secondary/20" />}
          title="No clarifications yet"
          body="Vendor questions and procurement replies will appear here. Click 'Ask vendor a question' to initiate the first thread."
        />
        {askOpen && (
          <AskVendorDialog
            tenderId={tenderId}
            onClose={() => setAskOpen(false)}
            onAsked={() => { setAskOpen(false); fetchItems(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {askHeader}
      {askOpen && (
        <AskVendorDialog
          tenderId={tenderId}
          onClose={() => setAskOpen(false)}
          onAsked={() => { setAskOpen(false); fetchItems(); }}
        />
      )}
      {items.map(c => (
        <div key={c.id} className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-text-secondary">
                {c.vendorName ?? 'Vendor (anonymised)'} ·{' '}
                {new Date(c.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">{c.question}</p>
            </div>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
              c.status === 'ANSWERED' ? 'bg-success/15 text-success' : 'bg-amber-100 text-amber-800'
            }`}>
              {c.status}
            </span>
          </div>
          {c.replies.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              {c.replies.map(r => (
                <div key={r.id} className="bg-bg/50 border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-semibold text-text-secondary">
                      {r.repliedByName} · {new Date(r.repliedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {/* BUG-145 (2026-06-19): every reply is private to the asking vendor. */}
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Private to vendor
                    </span>
                  </div>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{r.reply}</p>
                </div>
              ))}
            </div>
          )}
          {/* WALK-009/013/020 / BUG-067: inline reply form so the engineer
              never has to leave the tender to answer a question. */}
          {canReply && <ClarificationReplyForm clarificationId={c.id} onReplied={fetchItems} />}
        </div>
      ))}
    </div>
  );
}

function ClarificationReplyForm({ clarificationId, onReplied }: { clarificationId: string; onReplied: () => void }) {
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reply.trim();
    if (!trimmed) return;
    setPosting(true);
    setErr(null);
    try {
      const token = getAccessToken();
      // BUG-145 (2026-06-19): every reply is private to the asking vendor.
      // BUG-147 (2026-06-21): isPublic field removed; backend ignores it.
      await post(`/clarifications/${clarificationId}/reply`, { reply: trimmed }, token);
      setReply('');
      onReplied();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Reply failed');
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border pt-3 mt-3 space-y-2">
      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Write a reply (private to the asking vendor)…"
        rows={2}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent resize-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={posting || !reply.trim()}
          className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-bold hover:opacity-90 disabled:opacity-50"
        >
          {posting ? 'Posting…' : 'Post reply'}
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </form>
  );
}

// BUG-147 (2026-06-21): admin-side "Ask vendor a question" dialog. Picks
// a vendor from the bidders on this tender + posts a clarification with
// targetVendorId so the vendor sees it on their portal and can reply back.
function AskVendorDialog({ tenderId, onClose, onAsked }: { tenderId: string; onClose: () => void; onAsked: () => void }) {
  const [vendorOptions, setVendorOptions] = useState<Array<{ vendorId: string; vendorCompany: string }>>([]);
  const [vendorId, setVendorId] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<{ items: Array<{ id: string; vendorId?: string; vendorCompany: string }> }>(
          `/tenders/${tenderId}/bids?pageSize=100`,
          token,
        );
        // Dedupe by vendor id (one tender can have one bid per vendor today,
        // but defence in depth never hurt).
        const seen = new Map<string, string>();
        for (const b of res.items ?? []) {
          if (b.vendorId && !seen.has(b.vendorId)) seen.set(b.vendorId, b.vendorCompany);
        }
        const opts = Array.from(seen.entries()).map(([id, name]) => ({ vendorId: id, vendorCompany: name }));
        setVendorOptions(opts);
        if (opts.length > 0) setVendorId(opts[0].vendorId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load vendors');
      } finally {
        setLoading(false);
      }
    })();
  }, [tenderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!vendorId || trimmed.length < 10) return;
    setPosting(true);
    setErr(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/clarifications`, { question: trimmed, targetVendorId: vendorId }, token);
      onAsked();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to send clarification');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border">
          <h3 className="text-base font-bold text-text-primary">Ask a vendor a clarification</h3>
          <p className="text-xs text-text-secondary mt-1">Private to the chosen vendor. They will see this on their portal and can reply back.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Vendor</label>
            {loading ? (
              <p className="text-sm text-text-secondary italic">Loading bidders…</p>
            ) : vendorOptions.length === 0 ? (
              <p className="text-sm text-text-secondary italic">No vendors have submitted bids on this tender yet.</p>
            ) : (
              <select
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {vendorOptions.map(o => (
                  <option key={o.vendorId} value={o.vendorId}>{o.vendorCompany}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Type your clarification question (minimum 10 characters)…"
              rows={5}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent resize-none"
              required
            />
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-border rounded-md text-xs font-semibold text-text-secondary hover:bg-bg"
            >Cancel</button>
            <button
              type="submit"
              disabled={posting || !vendorId || question.trim().length < 10 || vendorOptions.length === 0}
              className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >{posting ? 'Sending…' : 'Send question'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BidRow {
  id: string;
  vendorId?: string;
  vendorCompany: string;
  submittedAt: string | null;
  technicalEnvelopeStatus: string;
  commercialEnvelopeStatus: string;
  technicalResult?: string;
}

// BUG-131 (2026-06-13): negotiation submissions are now folded into the
// /tenders/:id Bids tab so the owner can see the full bid history (initial
// + every negotiated round) without having to bounce to /commercial-comparison.
interface NegotiationInvitationApi {
  id: string;
  bidId: string;
  vendorId: string;
  vendorName: string;
  status: string;
  submission: {
    id: string;
    submittedAt: string;
    totalPrice: number | null;
    currency: string;
    commercialPdfFilename: string | null;
  } | null;
}
interface NegotiationRoundApi {
  id: string;
  roundNumber: number;
  launchedAt: string;
  closedAt: string | null;
  invitations: NegotiationInvitationApi[];
}
interface NegotiationListResponse {
  tenderId: string;
  rounds: NegotiationRoundApi[];
}

interface NegSubmissionRow {
  submissionId: string;
  roundNumber: number;
  submittedAt: string;
  totalPrice: number | null;
  currency: string;
  filename: string | null;
}

// BUG-142 (2026-06-19): supporting documents moved out of the Bids tab and
// into the Commercial Comparison per-vendor card. The Bids tab now only
// carries status info (initial bid + negotiation submissions).

function BidsTabPanel({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<BidRow[]>([]);
  // Map bidId → ordered list of negotiation submissions (oldest round first).
  const [negByBid, setNegByBid] = useState<Map<string, NegSubmissionRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        // Fetch bids + negotiation rounds in parallel. Negotiation fetch is
        // best-effort — viewers without negotiation:view perm just see the
        // initial bid rows (no nested submissions), they don't see an error.
        const [bidsRes, negRes] = await Promise.all([
          get<{ items: BidRow[] }>(`/tenders/${tenderId}/bids?pageSize=100`, token),
          get<NegotiationListResponse>(`/tenders/${tenderId}/negotiation`, token).catch(() => null),
        ]);
        if (cancelled) return;
        setItems(bidsRes.items ?? []);
        if (negRes && negRes.rounds) {
          const map = new Map<string, NegSubmissionRow[]>();
          for (const round of negRes.rounds) {
            for (const inv of round.invitations) {
              if (!inv.submission) continue;
              const existing = map.get(inv.bidId) ?? [];
              existing.push({
                submissionId: inv.submission.id,
                roundNumber: round.roundNumber,
                submittedAt: inv.submission.submittedAt,
                totalPrice: inv.submission.totalPrice,
                currency: inv.submission.currency,
                filename: inv.submission.commercialPdfFilename,
              });
              map.set(inv.bidId, existing);
            }
          }
          for (const subs of map.values()) {
            subs.sort((a, b) => a.roundNumber - b.roundNumber);
          }
          setNegByBid(map);
        } else {
          setNegByBid(new Map());
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load bids');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenderId]);

  if (loading) return <TabSkeleton icon={<FileText className="w-12 h-12 text-text-secondary/20" />} label="Loading bids…" />;
  if (error) return <TabError icon={<FileText className="w-12 h-12 text-danger/40" />} message={error} />;
  if (items.length === 0) {
    return (
      <TabEmpty
        icon={<FileText className="w-12 h-12 text-text-secondary/20" />}
        title="No bids submitted yet"
        body="Submitted bids will appear here once vendors have submitted their envelopes."
      />
    );
  }

  // BUG-131-fix (2026-06-13): pin display to Asia/Kuwait so the time shown
  // matches what the user actually saw in the portal regardless of the
  // browser host's timezone (workstation may be set to UTC).
  function fmtSubmittedAt(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kuwait',
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg/50 border-b border-border">
          <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
            <th className="px-4 py-3 font-bold">Vendor</th>
            <th className="px-4 py-3 font-bold">Submitted</th>
            <th className="px-4 py-3 font-bold">Technical envelope</th>
            <th className="px-4 py-3 font-bold">Commercial envelope</th>
            <th className="px-4 py-3 font-bold">Technical result</th>
          </tr>
        </thead>
        <tbody>
          {items.map(b => {
            const negs = negByBid.get(b.id) ?? [];
            return (
              <React.Fragment key={b.id}>
                <tr className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-text-primary">
                    <div className="flex items-center gap-2">
                      <span className="inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">Initial</span>
                      <span>{b.vendorCompany}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmtSubmittedAt(b.submittedAt)}</td>
                  <td className="px-4 py-3"><EnvelopePill status={b.technicalEnvelopeStatus} /></td>
                  <td className="px-4 py-3"><EnvelopePill status={b.commercialEnvelopeStatus} /></td>
                  <td className="px-4 py-3"><TechnicalResultPill result={b.technicalResult} /></td>
                </tr>
                {negs.map(n => (
                  <tr key={n.submissionId} className="border-b border-border last:border-0 bg-amber-50/30">
                    <td className="px-4 py-3 text-text-primary">
                      <div className="flex items-center gap-2 pl-6">
                        <span className="inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Round {n.roundNumber}</span>
                        <span className="text-text-secondary text-xs">↳ {b.vendorCompany}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{fmtSubmittedAt(n.submittedAt)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs" colSpan={3}>Negotiated commercial submission</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EnvelopePill({ status }: { status: string }) {
  const tone =
    status === 'OPENED' ? 'bg-success/15 text-success' :
    status === 'SEALED' || status === 'SUBMITTED' ? 'bg-amber-100 text-amber-800' :
    status === 'LOCKED' ? 'bg-slate-200 text-slate-800' :
    'bg-slate-100 text-slate-600';
  return <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tone}`}>{status}</span>;
}

function TechnicalResultPill({ result }: { result?: string }) {
  if (!result) return <span className="text-xs text-text-secondary">—</span>;
  const tone = result === 'PASS' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger';
  return <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tone}`}>{result}</span>;
}

interface AuditRow {
  id: string;
  eventType: string;
  actorName?: string;
  actorRole?: string;
  entityType: string;
  entityId?: string;
  // 2026-08-24: the API returns eventTime, never timestamp. This interface said
  // timestamp, the cast at the fetch boundary made TypeScript believe it, and
  // every row in the When column rendered "Invalid Date".
  eventTime: string;
  riskLevel?: string;
}

function AuditTrailTabPanel({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const res = await get<{ items: AuditRow[] }>(`/tenders/${tenderId}/audit-logs?pageSize=100`, token);
        if (!cancelled) setItems(res.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit log');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenderId]);

  if (loading) return <TabSkeleton icon={<Shield className="w-12 h-12 text-text-secondary/20" />} label="Loading audit trail…" />;
  if (error) return <TabError icon={<Shield className="w-12 h-12 text-danger/40" />} message={error} />;
  if (items.length === 0) {
    return (
      <TabEmpty
        icon={<Shield className="w-12 h-12 text-text-secondary/20" />}
        title="No audit events yet"
        body="A tamper-proof log of all actions taken on this tender will appear here as activity happens."
      />
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg/50 border-b border-border">
          <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
            <th className="px-4 py-3 font-bold">When</th>
            <th className="px-4 py-3 font-bold">Event</th>
            <th className="px-4 py-3 font-bold">Actor</th>
            <th className="px-4 py-3 font-bold">Entity</th>
            <th className="px-4 py-3 font-bold">Risk</th>
          </tr>
        </thead>
        <tbody>
          {items.map(a => (
            <tr key={a.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                {new Date(a.eventTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-text-primary">{a.eventType}</td>
              <td className="px-4 py-3 text-text-primary">
                {a.actorName ?? <span className="text-text-secondary">system</span>}
                {a.actorRole && <span className="ml-1 text-[10px] text-text-secondary">({a.actorRole})</span>}
              </td>
              <td className="px-4 py-3 text-text-secondary text-xs">
                {a.entityType}
                {a.entityId && <span className="ml-1 font-mono opacity-60">{a.entityId.slice(0, 8)}</span>}
              </td>
              <td className="px-4 py-3">
                {a.riskLevel ? (
                  <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    a.riskLevel === 'HIGH' ? 'bg-danger/15 text-danger' :
                    a.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {a.riskLevel}
                  </span>
                ) : <span className="text-xs text-text-secondary">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabSkeleton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-16 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <p className="text-xs text-text-secondary flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {label}
      </p>
    </div>
  );
}

function TabError({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="bg-card rounded-xl border border-danger/30 p-16 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <p className="text-sm font-semibold text-danger mb-1">Failed to load</p>
      <p className="text-xs text-text-secondary">{message}</p>
    </div>
  );
}

function TabEmpty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-16 text-center">
      <div className="flex justify-center mb-4">{icon}</div>
      <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>
      <p className="text-xs text-text-secondary max-w-md mx-auto">{body}</p>
    </div>
  );
}
