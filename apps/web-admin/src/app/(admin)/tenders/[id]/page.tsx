'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { get, post, del } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ManageInvitedVendors } from '@/components/ManageInvitedVendors';
import { AmendAwardDialog } from '@/components/comparison/AmendAwardDialog';
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
  Table2,
  Paperclip,
  MessageSquare,
  Shield,
} from 'lucide-react';

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

type TabId = 'overview' | 'clarifications' | 'bids' | 'audit';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Info className="w-4 h-4" /> },
  { id: 'clarifications', label: 'Clarifications', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'bids', label: 'Bids', icon: <FileText className="w-4 h-4" /> },
  { id: 'audit', label: 'Audit Trail', icon: <Shield className="w-4 h-4" /> },
];

const TAB_STUB_ICONS: Record<TabId, React.ReactNode> = {
  overview: <Info className="w-12 h-12 text-text-secondary/20" />,
  clarifications: <MessageSquare className="w-12 h-12 text-text-secondary/20" />,
  bids: <FileText className="w-12 h-12 text-text-secondary/20" />,
  audit: <Shield className="w-12 h-12 text-text-secondary/20" />,
};

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
const CANCELLABLE_STATUSES = ['Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period'];

export default function TenderDetailPage() {
  const params = useParams();
  const tenderId = params.id as string;
  const [tab, setTab] = useState<TabId>('overview');
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
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
    edit: false,      // tender:edit
    award: false,     // award:finalize (legacy Issue Award action)
    amend: false,     // award:amend
    minutes: false,   // award:minutes:generate
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
      edit:     hasPermission(t, 'tender:edit'),
      award:    hasPermission(t, 'award:finalize'),
      amend:    hasPermission(t, 'award:amend'),
      minutes:  hasPermission(t, 'award:minutes:generate'),
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
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
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
                  onClick={() => {
                    if (confirm('Issue formal award? This closes the tender and notifies the winning vendor.')) {
                      handleAction('award');
                    }
                  }}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {actionLoading === 'award' ? 'Issuing…' : 'Issue Award'}
                </button>
              )}
            </>
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
          {CANCELLABLE_STATUSES.includes(tender.status) && perms.cancel && (
            <button
              onClick={() => {
                if (confirm('Cancel this tender? This action cannot be undone.')) {
                  handleAction('cancel');
                }
              }}
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
                          {tender.estimatedBudget.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
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

      {/* Stub tabs */}
      {tab !== 'overview' && (
        <div className="bg-card rounded-xl border border-border p-16 text-center">
          <div className="flex justify-center mb-4">
            {TAB_STUB_ICONS[tab]}
          </div>
          <p className="text-sm font-semibold text-text-primary mb-1">
            {tab === 'clarifications' && 'Clarification Center'}
            {tab === 'bids' && 'Submitted Bids'}
            {tab === 'audit' && 'Audit Trail'}
          </p>
          <p className="text-xs text-text-secondary">
            {tab === 'clarifications' && 'Vendor questions and procurement officer replies will appear here.'}
            {tab === 'bids' && 'Submitted bid envelopes will appear here after the submission deadline.'}
            {tab === 'audit' && 'A tamper-proof log of all actions taken on this tender.'}
          </p>
        </div>
      )}
    </div>
  );
}
