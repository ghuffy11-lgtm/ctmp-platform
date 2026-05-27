'use client';

import { TenderTimelineDrawer } from '@/components/TenderTimelineDrawer';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  User, Globe, Lock, ChevronRight, Building2, CornerDownLeft,
  Search, MessageSquare, Download, RefreshCw, CheckCircle2, SearchX,
  FileText, Calendar, Clock, Printer,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  departmentName: string;
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface Clarification {
  id: string;
  tenderId: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorCompany: string | null;
  question: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  createdAt: string;
  replies: ClarificationReply[];
}

interface ClarificationReply {
  id: string;
  clarificationId: string;
  reply: string;
  visibility: 'PRIVATE_TO_VENDOR' | 'GENERAL_PUBLIC';
  repliedAt: string;
  repliedByName?: string;
}

interface ClarificationListResponse {
  items: Clarification[];
  total: number;
  page: number;
  pageSize: number;
}

type ClarificationTab = 'ALL' | 'OPEN' | 'ANSWERED';
type SortOrder = 'NEWEST' | 'OLDEST';
type ReplyVisibility = 'PRIVATE_TO_VENDOR' | 'GENERAL_PUBLIC';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_STYLES: Record<Clarification['status'], string> = {
  OPEN:     'bg-amber-100 text-amber-800',
  ANSWERED: 'bg-success/10 text-success',
  CLOSED:   'bg-border text-text-secondary',
};

// ─── Skeletons ────────────────────────────────────────────────────────────────

function TenderSkeleton() {
  return (
    <div className="p-4 border-b border-border animate-pulse">
      <div className="flex justify-between mb-1.5">
        <div className="h-3 bg-bg rounded w-20" />
        <div className="h-4 bg-bg rounded-full w-16" />
      </div>
      <div className="h-3.5 bg-bg rounded w-48 mb-2" />
      <div className="h-3 bg-bg rounded w-24" />
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-bg rounded-lg" />
          <div>
            <div className="h-3.5 bg-bg rounded w-32 mb-1.5" />
            <div className="h-3 bg-bg rounded w-48" />
          </div>
        </div>
        <div className="h-6 bg-bg rounded-full w-20" />
      </div>
      <div className="h-4 bg-bg rounded w-64 mb-2 ml-13" />
      <div className="h-3 bg-bg rounded w-full mb-1 ml-13" />
      <div className="h-3 bg-bg rounded w-3/4 ml-13" />
    </div>
  );
}

// ─── Thread Card ──────────────────────────────────────────────────────────────

interface ThreadCardProps {
  clarification: Clarification;
  isExpanded: boolean;
  onToggle: () => void;
  tenderId: string;
  onReplied: () => void;
}

function ThreadCard({ clarification, isExpanded, onToggle, tenderId, onReplied }: ThreadCardProps) {
  const [reply, setReply] = useState('');
  const [visibility, setVisibility] = useState<ReplyVisibility>('PRIVATE_TO_VENDOR');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const vendorLabel = clarification.vendorCompany
    ? clarification.vendorCompany
    : clarification.vendorId
      ? `Vendor ${clarification.vendorId.slice(0, 8)}`
      : 'Anonymous Vendor';

  async function handleSubmitReply() {
    if (!reply.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = getAccessToken();
      await post(
        `/clarifications/${clarification.id}/reply`,
        { reply, isPublic: visibility === 'GENERAL_PUBLIC' },
        token,
      );
      setReply('');
      onReplied();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit reply');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isExpanded) {
    return (
      <div
        onClick={onToggle}
        className={`bg-card border border-border rounded-xl overflow-hidden cursor-pointer group transition-all hover:shadow-md ${
          clarification.status === 'CLOSED' ? 'opacity-70' : ''
        }`}
      >
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-bg rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-text-primary">{vendorLabel}</span>
                {clarification.replies.some(r => r.visibility === 'GENERAL_PUBLIC') ? (
                  <Globe className="w-3.5 h-3.5 text-text-secondary" aria-label="Public reply" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-text-secondary" aria-label="Private" />
                )}
              </div>
              <p className="text-sm text-text-secondary truncate">{clarification.question}</p>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs font-semibold text-text-secondary">{formatDate(clarification.createdAt)}</p>
              <p className={`text-xs font-bold uppercase mt-0.5 ${
                clarification.status === 'ANSWERED' ? 'text-success' :
                clarification.status === 'OPEN' ? 'text-amber-600' : 'text-text-secondary'
              }`}>
                {clarification.status}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-text-secondary group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    );
  }

  // Expanded
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Question header */}
      <div
        className="p-5 border-b border-border bg-white cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">{vendorLabel}</p>
              <p className="text-xs text-text-secondary">
                {clarification.vendorId ? `ID: ${clarification.vendorId.slice(0, 8)}… ` : ''}
                Submitted {formatDate(clarification.createdAt)}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${STATUS_STYLES[clarification.status]}`}>
            {clarification.status}
          </span>
        </div>
        <div className="pl-[52px]">
          <p className="text-sm font-semibold text-text-primary mb-1.5 leading-snug">{clarification.question}</p>
        </div>
      </div>

      {/* Replies / history */}
      {clarification.replies.length > 0 && (
        <div className="bg-bg px-5 py-4 pl-16 space-y-3 border-b border-border">
          {clarification.replies.map(r => (
            <div key={r.id} className="bg-card rounded-lg border border-border p-3.5 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <CornerDownLeft className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-semibold text-text-primary">
                  {r.repliedByName ?? 'Procurement Officer'}
                </span>
                <span className={`ml-auto flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  r.visibility === 'GENERAL_PUBLIC'
                    ? 'bg-accent/10 text-accent'
                    : 'bg-border text-text-secondary'
                }`}>
                  {r.visibility === 'GENERAL_PUBLIC'
                    ? <Globe className="w-2.5 h-2.5" />
                    : <Lock className="w-2.5 h-2.5" />
                  }
                  {r.visibility === 'GENERAL_PUBLIC' ? 'Public' : 'Private'}
                </span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{r.reply}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply form — only for OPEN clarifications */}
      {clarification.status === 'OPEN' && (
        <div className="p-5 border-t border-border bg-white">
          <div className="flex items-center gap-2 mb-3">
            <CornerDownLeft className="w-5 h-5 text-accent" />
            <span className="text-sm font-semibold text-text-primary">Submit Clarification Response</span>
          </div>
          <textarea
            value={reply}
            onChange={e => { setReply(e.target.value); setSubmitError(null); }}
            rows={4}
            placeholder="Type your official response here..."
            className="w-full rounded-lg border border-border focus:border-accent focus:ring-2 focus:ring-accent/20 text-sm p-3.5 mb-4 resize-none outline-none transition-shadow bg-bg placeholder:text-text-secondary/40"
          />
          {submitError && (
            <p className="text-xs text-danger mb-3">{submitError}</p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Visibility toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Visibility:</span>
              <div className="flex bg-bg rounded-lg p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setVisibility('PRIVATE_TO_VENDOR')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    visibility === 'PRIVATE_TO_VENDOR'
                      ? 'bg-card shadow-sm text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Private
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('GENERAL_PUBLIC')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    visibility === 'GENERAL_PUBLIC'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Public
                  </span>
                </button>
              </div>
            </div>
            {/* Submit buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                className="px-5 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg transition-colors"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleSubmitReply}
                disabled={submitting || !reply.trim()}
                className="px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClarificationsPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);

  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [clarificationsLoading, setClarificationsLoading] = useState(false);

  const [tab, setTab] = useState<ClarificationTab>('ALL');
  const [sort, setSort] = useState<SortOrder>('NEWEST');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // ─── Fetch tenders eligible for clarifications (Published + Clarification Period) ──
  useEffect(() => {
    const ELIGIBLE_STATUSES = ['Published', 'Clarification Period'];
    async function fetchTenders() {
      setTendersLoading(true);
      try {
        const token = getAccessToken();
        const results = await Promise.all(
          ELIGIBLE_STATUSES.map(s =>
            get<PaginatedTenders>(
              `/tenders?status=${encodeURIComponent(s)}&pageSize=50`,
              token,
            ).catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
          ),
        );
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (merged.length > 0) {
          setSelectedTenderId(merged[0].id);
        }
      } catch {
        // swallow — show empty state
      } finally {
        setTendersLoading(false);
      }
    }
    fetchTenders();
  }, []);

  // ─── Fetch clarifications for selected tender ───────────────────────────────
  const fetchClarifications = useCallback(async (tenderId: string) => {
    setClarificationsLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<ClarificationListResponse>(
        `/tenders/${tenderId}/clarifications?pageSize=100`,
        token,
      );
      setClarifications(res.items ?? []);
    } catch {
      setClarifications([]);
    } finally {
      setClarificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) {
      setExpandedId(null);
      setTab('ALL');
      fetchClarifications(selectedTenderId);
    }
  }, [selectedTenderId, fetchClarifications]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const selectedTender = tenders.find(t => t.id === selectedTenderId) ?? null;

  const filtered = clarifications
    .filter(c => {
      if (tab === 'OPEN') return c.status === 'OPEN';
      if (tab === 'ANSWERED') return c.status === 'ANSWERED';
      return true;
    })
    .sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort === 'NEWEST' ? -diff : diff;
    });

  const openCount = clarifications.filter(c => c.status === 'OPEN').length;
  const answeredCount = clarifications.filter(c => c.status === 'ANSWERED').length;

  function tenderPendingCount(tenderId: string): number {
    if (tenderId !== selectedTenderId) return 0;
    return openCount;
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Panel: Tender List ──────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-border bg-bg flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-card">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
            Active Tenders
          </p>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            <input
              type="text"
              placeholder="Search tenders..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent bg-bg placeholder:text-text-secondary/50"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tendersLoading ? (
            Array.from({ length: 4 }).map((_, i) => <TenderSkeleton key={i} />)
          ) : tenders.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="text-text-secondary/20 block mb-2" style={{ width: 40, height: 40 }} />
              <p className="text-xs text-text-secondary">No tenders in Published or Clarification Period.</p>
            </div>
          ) : (
            tenders.map(tender => {
              const isSelected = tender.id === selectedTenderId;
              const days = daysUntil(tender.submissionDeadline);
              const pending = tenderPendingCount(tender.id);
              return (
                <div
                  key={tender.id}
                  onClick={() => setSelectedTenderId(tender.id)}
                  className={`p-4 border-b border-border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-card border-l-4 border-l-accent shadow-sm'
                      : 'border-l-4 border-l-transparent hover:bg-card/70'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs font-bold ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>
                      {tender.referenceNumber}
                    </span>
                    {pending > 0 ? (
                      <span className="bg-danger/10 text-danger px-2 py-0.5 rounded text-[10px] font-bold">
                        {pending} PENDING
                      </span>
                    ) : (
                      <span className="bg-border text-text-secondary px-2 py-0.5 rounded text-[10px] font-bold">
                        0 PENDING
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-semibold leading-snug ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {tender.title}
                  </p>
                  {days !== null && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-text-secondary" />
                      <span className="text-xs text-text-secondary">
                        {days > 0 ? `Due in ${days} day${days !== 1 ? 's' : ''}` : 'Overdue'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Center Panel: Threads ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedTender ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <MessageSquare className="text-text-secondary/20" style={{ width: 56, height: 56 }} />
            <p className="text-sm font-semibold text-text-secondary">Select a tender to view clarifications.</p>
          </div>
        ) : (
          <>
            {/* Sticky header */}
            <div className="bg-card border-b border-border px-6 pt-5 pb-0 flex-shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.04)] z-10">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1 text-xs text-text-secondary mb-2">
                <Link href="/tenders" className="hover:text-accent transition-colors">Tenders</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link href={`/tenders/${selectedTender.id}`} className="hover:text-accent transition-colors">
                  {selectedTender.title}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-text-primary font-medium">Clarifications</span>
              </nav>

              <div className="flex justify-between items-end mb-4">
                <h1 className="text-xl font-bold text-text-primary tracking-tight">
                  Clarification Threads:{' '}
                  <span className="font-mono text-accent">{selectedTender.referenceNumber}</span>
                </h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => selectedTenderId && fetchClarifications(selectedTenderId)}
                    className="p-2 rounded-lg hover:bg-bg border border-border transition-colors text-text-secondary"
                    title="Refresh"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="p-2 rounded-lg hover:bg-bg border border-border transition-colors text-text-secondary print:hidden"
                    title="Print"
                  >
                    <Printer className="w-5 h-5" />
                  </button>
                  <button
                    disabled
                    title="Export (Coming in next release — depends on Reports module renderer)"
                    className="p-2 rounded-lg border border-border text-text-secondary/40 cursor-not-allowed print:hidden"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tabs + sort */}
              <div className="flex items-end justify-between border-t border-border pt-1">
                <div className="flex gap-1">
                  {(
                    [
                      { key: 'ALL', label: `All Threads (${clarifications.length})` },
                      { key: 'OPEN', label: `Pending (${openCount})` },
                      { key: 'ANSWERED', label: `Answered (${answeredCount})` },
                    ] as { key: ClarificationTab; label: string }[]
                  ).map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        tab === t.key
                          ? 'border-accent text-accent'
                          : 'border-transparent text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <span className="text-xs text-text-secondary">Sort by:</span>
                  <select
                    value={sort}
                    onChange={e => setSort(e.target.value as SortOrder)}
                    className="text-sm text-text-primary bg-transparent border-none focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="NEWEST">Newest First</option>
                    <option value="OLDEST">Oldest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {clarificationsLoading ? (
                Array.from({ length: 3 }).map((_, i) => <ThreadSkeleton key={i} />)
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  {tab === 'OPEN'
                    ? <CheckCircle2 className="text-text-secondary/20" style={{ width: 48, height: 48 }} />
                    : <SearchX className="text-text-secondary/20" style={{ width: 48, height: 48 }} />
                  }
                  <p className="text-sm text-text-secondary">
                    {tab === 'OPEN'
                      ? 'No pending clarifications.'
                      : tab === 'ANSWERED'
                        ? 'No answered clarifications.'
                        : 'No clarification threads for this tender.'}
                  </p>
                </div>
              ) : (
                filtered.map(c => (
                  <ThreadCard
                    key={c.id}
                    clarification={c}
                    isExpanded={expandedId === c.id}
                    onToggle={() => setExpandedId(prev => prev === c.id ? null : c.id)}
                    tenderId={selectedTender.id}
                    onReplied={() => fetchClarifications(selectedTender.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Right Toolbelt ───────────────────────────────────────────────────── */}
      <div className="w-14 flex-shrink-0 border-l border-border bg-card flex flex-col items-center py-5 gap-4">
        {selectedTender && (
          <>
            <Link
              href={`/tenders/${selectedTender.id}`}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-bg text-text-secondary hover:text-accent transition-colors"
              title="Tender Details"
            >
              <FileText className="w-5 h-5" />
            </Link>
            <button
              onClick={() => setTimelineOpen(true)}
              disabled={!selectedTender}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-bg text-text-secondary hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Timeline"
            >
              <Calendar className="w-5 h-5" />
            </button>
            <div className="w-6 h-px bg-border" />
            <button
              onClick={() => selectedTenderId && fetchClarifications(selectedTenderId)}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-bg text-text-secondary hover:text-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      <TenderTimelineDrawer
        tenderId={selectedTender?.id ?? null}
        tenderReference={selectedTender?.referenceNumber}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
    </div>
  );
}
