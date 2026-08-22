'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';
import {
  ClipboardList,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Eye,
  Gavel,
  Trophy,
  FileText,
  MessageCircle,
  Download,
  XCircle,
  Table2,
  Paperclip,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskType = 'TENDER_APPROVAL' | 'AWARD_APPROVAL';

interface ApprovalTask {
  id: string;
  type: TaskType;
  referenceNumber: string;
  title: string;
  requestedBy: string;
  department: string;
  requestedAt: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string | null;
  documents: TaskDocument[];
}

interface TaskDocument {
  id: string;
  name: string;
  mimeType: string;
}

// BUG-059 / WALK-004/005: full detail fetched when a task is selected — list
// endpoint omits description + documents, so we re-fetch via /tenders/:id to
// populate both.
interface TenderDetail {
  id: string;
  description?: string | null;
  documents?: Array<{
    id: string;
    filename: string;
    mimeType: string;
  }>;
}

interface TenderListItem {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  departmentName: string;
  createdAt: string;
  submissionDeadline: string | null;
  description: string | null;
  createdByName?: string;
  documents?: TaskDocument[];
}

interface PaginatedTenders {
  data: TenderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivePriority(task: TenderListItem): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!task.submissionDeadline) return 'MEDIUM';
  const daysLeft = Math.ceil(
    (new Date(task.submissionDeadline).getTime() - Date.now()) / 86_400_000,
  );
  if (daysLeft <= 3) return 'HIGH';
  if (daysLeft <= 10) return 'MEDIUM';
  return 'LOW';
}

function tenderToTask(tender: TenderListItem, type: TaskType): ApprovalTask {
  return {
    id: tender.id,
    type,
    referenceNumber: tender.referenceNumber,
    title: tender.title,
    requestedBy: tender.createdByName ?? 'Unknown',
    department: tender.departmentName,
    requestedAt: tender.createdAt,
    priority: derivePriority(tender),
    description: tender.description,
    documents: tender.documents ?? [],
  };
}

const PRIORITY_STYLES: Record<'HIGH' | 'MEDIUM' | 'LOW', string> = {
  HIGH: 'bg-danger/10 text-danger',
  MEDIUM: 'bg-accent/10 text-accent',
  LOW: 'bg-success/10 text-success',
};

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: React.ReactNode; colorClass: string }> = {
  TENDER_APPROVAL: { label: 'Tender Approval', icon: <Gavel className="w-4 h-4" />, colorClass: 'text-accent bg-accent/10' },
  AWARD_APPROVAL:  { label: 'Award Approval',  icon: <Trophy className="w-4 h-4" />, colorClass: 'text-success bg-success/10' },
};

const TASK_TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Task Types' },
  { value: 'TENDER_APPROVAL', label: 'Tender Approval' },
  { value: 'AWARD_APPROVAL', label: 'Award Approval' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      <td className="px-5 py-3.5"><div className="h-8 w-8 bg-bg rounded-full animate-pulse" /></td>
      <td className="px-4 py-3.5">
        <div className="h-3.5 bg-bg rounded animate-pulse w-24 mb-1.5" />
        <div className="h-3 bg-bg rounded animate-pulse w-40" />
      </td>
      <td className="px-4 py-3.5">
        <div className="h-3.5 bg-bg rounded animate-pulse w-28 mb-1" />
        <div className="h-3 bg-bg rounded animate-pulse w-20" />
      </td>
      <td className="px-4 py-3.5"><div className="h-5 bg-bg rounded-full animate-pulse w-14" /></td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2 justify-end">
          <div className="h-7 w-16 bg-bg rounded animate-pulse" />
          <div className="h-7 w-16 bg-bg rounded animate-pulse" />
        </div>
      </td>
    </tr>
  );
}

// ─── Empty Detail Panel ───────────────────────────────────────────────────────

function EmptyDetailPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <ClipboardList className="w-14 h-14 text-text-secondary/20" />
      <p className="text-sm font-semibold text-text-secondary">No task selected</p>
      <p className="text-xs text-text-secondary/70 max-w-[200px]">
        Click a row in the queue to review its details here.
      </p>
    </div>
  );
}

// ─── Document icon ────────────────────────────────────────────────────────────

function fileIcon(mime: string): { icon: React.ReactNode } {
  if (mime.includes('pdf')) return { icon: <FileText className="w-5 h-5 flex-shrink-0 text-danger" /> };
  if (mime.includes('word') || mime.includes('doc')) return { icon: <FileText className="w-5 h-5 flex-shrink-0 text-accent" /> };
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('xls'))
    return { icon: <Table2 className="w-5 h-5 flex-shrink-0 text-success" /> };
  return { icon: <Paperclip className="w-5 h-5 flex-shrink-0 text-text-secondary" /> };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // BUG-059 / WALK-004/005: full tender detail (description + documents).
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const { openPdfViewer } = usePdfViewer();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const [tenderRes, awardRes] = await Promise.all([
        get<PaginatedTenders>('/tenders?status=Internal%20Review&pageSize=50', token),
        get<PaginatedTenders>('/tenders?status=Award%20Recommendation&pageSize=50', token),
      ]);
      const combined: ApprovalTask[] = [
        ...tenderRes.data.map(t => tenderToTask(t, 'TENDER_APPROVAL')),
        ...awardRes.data.map(t => tenderToTask(t, 'AWARD_APPROVAL')),
      ];
      combined.sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      setTasks(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // ─── Reset detail panel when selection changes ─────────────────────────────
  useEffect(() => {
    setComments('');
    setActionError(null);
    setDetail(null);
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const d = await get<TenderDetail>(`/tenders/${selectedId}`, token);
        if (!cancelled) setDetail(d);
      } catch {
        // detail fetch failure is non-fatal — caller still sees the task summary.
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // BUG-059 / WALK-005: one-click View opens the PDF in the shared modal viewer.
  async function handleViewDoc(docId: string, filename: string) {
    if (!selectedTask) return;
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/api/v1/tenders/${selectedTask.id}/documents/${docId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      openPdfViewer({
        src: url,
        title: filename,
        onClose: () => URL.revokeObjectURL(url),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open document');
    }
  }

  async function handleDownloadDoc(docId: string, filename: string) {
    if (!selectedTask) return;
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/api/v1/tenders/${selectedTask.id}/documents/${docId}`, {
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

  // ─── Filtered view ─────────────────────────────────────────────────────────
  const filteredTasks = tasks.filter(task => {
    if (typeFilter && task.type !== typeFilter) return false;
    if (dateFilter) {
      const taskDate = new Date(task.requestedAt).toISOString().slice(0, 10);
      if (taskDate !== dateFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !task.referenceNumber.toLowerCase().includes(q) &&
        !task.title.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const selectedTask = filteredTasks.find(t => t.id === selectedId) ?? null;

  // ─── Actions ───────────────────────────────────────────────────────────────
  async function handleAction(action: 'APPROVE' | 'REJECT') {
    if (!selectedTask) return;
    // 2026-08-22: the API now enforces this too (ApproveTenderDto / RejectTenderDto,
    // MinLength(20) — the house convention for audit free-text on a regulated state
    // change). Keep the two in step; before today only this client-side check existed.
    if (comments.trim().length < 20) {
      setActionError('Comments are required for audit compliance — at least 20 characters.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const token = getAccessToken();
      if (selectedTask.type === 'AWARD_APPROVAL') {
        await post(
          `/tenders/${selectedTask.id}/award-approval`,
          { approved: action === 'APPROVE', notes: comments },
          token,
        );
      } else {
        // POST /tenders/{id}/approve or /reject — endpoint not yet in contract; backend stub
        const endpoint = action === 'APPROVE'
          ? `/tenders/${selectedTask.id}/approve`
          : `/tenders/${selectedTask.id}/reject`;
        await post(endpoint, { comments }, token);
      }
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
      setSelectedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = tasks.length;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Pane: Queue ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border bg-card overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-7 pb-4 border-b border-border flex items-end justify-between flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Approval Queue</h1>
            {!loading && (
              <p className="text-sm text-text-secondary mt-1">
                {pendingCount === 0
                  ? 'No pending tasks.'
                  : <>You have <span className="font-semibold text-text-primary">{pendingCount}</span> task{pendingCount !== 1 ? 's' : ''} pending review.</>}
              </p>
            )}
          </div>
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 bg-bg border-b border-border flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-text-secondary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by ID or subject..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-card placeholder:text-text-secondary/50"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-48 py-2 px-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-card"
          >
            {TASK_TYPE_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="w-44 py-2 px-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-card"
          />
          {(search || typeFilter || dateFilter) && (
            <button
              onClick={() => { setSearch(''); setTypeFilter(''); setDateFilter(''); }}
              className="p-2 border border-border rounded-lg hover:bg-card transition-colors text-text-secondary"
              title="Clear filters"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertCircle className="w-12 h-12 text-danger" />
              <p className="text-sm text-text-secondary">{error}</p>
              <button onClick={fetchTasks} className="text-sm text-accent hover:underline font-semibold">Retry</button>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-bg border-b border-border sticky top-0 z-10">
                  <th className="px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Task / Subject</th>
                  <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Requested By</th>
                  <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">Priority</th>
                  <th className="px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <CheckCircle2 className="w-12 h-12 text-text-secondary/20" />
                        <p className="text-sm text-text-secondary">
                          {tasks.length === 0 ? 'No pending approvals.' : 'No tasks match your filters.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map(task => {
                    const cfg = TASK_TYPE_CONFIG[task.type];
                    const isSelected = selectedId === task.id;
                    return (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedId(isSelected ? null : task.id)}
                        className={`cursor-pointer transition-colors group ${
                          isSelected
                            ? 'bg-accent/5 border-l-4 border-accent'
                            : 'hover:bg-bg/70 border-l-4 border-transparent'
                        }`}
                      >
                        {/* Type */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.colorClass}`}>
                              {cfg.icon}
                            </div>
                            <span className="text-xs font-medium text-text-secondary hidden xl:block">{cfg.label}</span>
                          </div>
                        </td>

                        {/* Task / Subject */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="text-sm font-bold text-text-primary font-mono tracking-wide">
                            {task.referenceNumber}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5 truncate">{task.title}</p>
                        </td>

                        {/* Requested By */}
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-text-primary">{task.requestedBy}</p>
                          <p className="text-xs text-text-secondary">{task.department}</p>
                        </td>

                        {/* Priority */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                            {task.priority}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedId(task.id); setComments(''); }}
                              className="px-3 py-1.5 border border-border text-text-secondary rounded text-xs font-medium hover:bg-bg transition-colors"
                            >
                              Review
                            </button>
                            <Link
                              href={`/tenders/${task.id}`}
                              onClick={e => e.stopPropagation()}
                              className="px-3 py-1.5 border border-border text-text-secondary rounded text-xs font-medium hover:bg-bg transition-colors"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Right Pane: Detail ───────────────────────────────────────────────── */}
      <div className="w-[380px] flex-shrink-0 flex flex-col bg-bg border-l border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
          <h2 className="text-base font-bold text-text-primary">Approval Details</h2>
        </div>

        {!selectedTask ? (
          <EmptyDetailPanel />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Summary Card */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <div className="flex justify-between items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <span className="inline-flex px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded uppercase tracking-wider">
                      {TASK_TYPE_CONFIG[selectedTask.type].label}
                    </span>
                    <p className="text-xs font-mono font-bold text-text-secondary mt-1">{selectedTask.referenceNumber}</p>
                    <h3 className="text-sm font-bold text-text-primary mt-1 leading-snug">{selectedTask.title}</h3>
                  </div>
                  <span className={`flex-shrink-0 px-2 py-1 rounded text-xs font-semibold uppercase ${PRIORITY_STYLES[selectedTask.priority]}`}>
                    {selectedTask.priority}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary">Requested By</p>
                    <p className="text-sm font-semibold text-text-primary mt-0.5">{selectedTask.requestedBy}</p>
                    <p className="text-xs text-text-secondary">{selectedTask.department}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary">Request Date</p>
                    <p className="text-sm font-semibold text-text-primary mt-0.5">{formatDate(selectedTask.requestedAt)}</p>
                    <p className="text-xs text-text-secondary">{formatTime(selectedTask.requestedAt)}</p>
                  </div>
                </div>
              </div>

              {/* Justification */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  <FileText className="w-3.5 h-3.5" />
                  Tender Description
                </label>
                <div className="bg-card border border-border rounded-lg p-4 text-sm text-text-secondary leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {/* WALK-004: prefer the detail-fetched description (full text);
                      fall back to the summary description, then to placeholder. */}
                  {detail?.description || selectedTask.description
                    ? (detail?.description ?? selectedTask.description)
                    : <span className="italic text-text-secondary/50">No description provided.</span>}
                </div>
              </div>

              {/* Comments */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Your Comments <span className="text-danger normal-case">*</span>
                </label>
                <textarea
                  value={comments}
                  onChange={e => { setComments(e.target.value); setActionError(null); }}
                  rows={4}
                  placeholder="Enter your feedback or reason for rejection..."
                  className="w-full bg-card border border-border rounded-lg p-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-secondary/40 transition-shadow resize-none"
                />
                <p className="text-[11px] text-text-secondary">Required for audit log and transparency.</p>
                {actionError && (
                  <p className="text-xs text-danger font-medium">{actionError}</p>
                )}
              </div>

              {/* Related Documents — WALK-005 wires View (PDF modal) + Download. */}
              {(detail?.documents?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Related Documents
                  </label>
                  <div className="space-y-2">
                    {(detail?.documents ?? []).map(doc => {
                      const { icon } = fileIcon(doc.mimeType);
                      const isPdf = doc.mimeType?.includes('pdf');
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-2 p-3 bg-card border border-border rounded-lg hover:border-accent transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {icon}
                            <span className="text-sm text-text-primary truncate" title={doc.filename}>{doc.filename}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isPdf && (
                              <button
                                type="button"
                                onClick={() => handleViewDoc(doc.id, doc.filename)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded transition-colors"
                                title="View in modal"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownloadDoc(doc.id, doc.filename)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg rounded transition-colors"
                              title="Download file"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 p-5 bg-card border-t border-border space-y-3 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => handleAction('APPROVE')}
                disabled={submitting}
                className="w-full py-3 bg-success hover:bg-success/90 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4.5 h-4.5" />
                {submitting ? 'Processing…' : 'Confirm Approval'}
              </button>
              <button
                onClick={() => handleAction('REJECT')}
                disabled={submitting}
                className="w-full py-3 border border-danger text-danger hover:bg-danger/5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle className="w-4.5 h-4.5" />
                Reject Request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
