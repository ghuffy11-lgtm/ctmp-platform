'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Eye, FileText, Download, MessageSquare } from 'lucide-react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Loading, ErrorBanner } from '@/components/ui/Empty';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Chip } from '@/components/ui/StatusBadge';
import { MessageBanner } from '@/components/ui/MessageBanner';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { blockedStateForTender, vendorMessage } from '@/lib/vendor-messages';
import { useNotify } from '@/components/dialog/DialogProvider';

interface TenderDetail {
  id: string;
  referenceNumber: string;
  title: string;
  description?: string;
  status: string;
  submissionDeadline: string | null;
  clarificationDeadline?: string | null;
  departmentName?: string;
  category?: string;
  estimatedBudget?: string | number | null;
  requirements?: string[];
  documents?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

const BID_ELIGIBLE_STATUSES = new Set(['Published', 'Clarification Period']);

interface MyBidLite { id: string; tenderId: string; status: string }

export default function VendorTenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const notify = useNotify();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // BUG-083 (2026-06-01): track the caller's existing bid on this tender so we
  // can disable "Start Bid" and link to /bids/[id] instead when they've already
  // submitted. Owner reported the wizard re-launchable post-submit.
  const [myBid, setMyBid] = useState<MyBidLite | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const [res, mine] = await Promise.all([
          get<TenderDetail>(`/tenders/${id}`, token),
          get<{ items: MyBidLite[] }>('/vendor-auth/me/bids?pageSize=200', token).catch(() => ({ items: [] })),
        ]);
        setTender(res);
        const existing = (mine.items ?? []).find(b => b.tenderId === id) ?? null;
        setMyBid(existing);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tender');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loading />;
  if (error || !tender) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <ErrorBanner message={error ?? 'Tender not found'} />
        <Link href="/tenders" className="inline-flex items-center gap-2 text-electric-500 hover:underline text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Tenders
        </Link>
      </div>
    );
  }

  const canBid = BID_ELIGIBLE_STATUSES.has(tender.status);

  // WALK-016 / WALK-017: vendor-side View + Download for tender RFQ documents.
  // Server-side audit log happens in the streaming endpoint.
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  async function fetchDocBlob(docId: string): Promise<Blob> {
    const token = getAccessToken();
    const res = await fetch(`${apiBase}/api/v1/tenders/${id}/documents/${docId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return res.blob();
  }

  async function handleViewDoc(docId: string) {
    try {
      const blob = await fetchDocBlob(docId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      await notify({ title: 'Could not open the document',
        body: err instanceof Error ? err.message : 'Failed to open document.', variant: 'error' });
    }
  }

  async function handleDownloadDoc(docId: string, filename: string) {
    try {
      const blob = await fetchDocBlob(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      await notify({ title: 'Could not download the document',
        body: err instanceof Error ? err.message : 'Failed to download document.', variant: 'error' });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link
        href="/tenders"
        className="inline-flex items-center gap-2 text-electric-500 hover:text-electric-600 hover:underline text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tenders
      </Link>

      <GlassCard padding="xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm text-slate-900/55">{tender.referenceNumber}</div>
            <h1 className="heading-font text-3xl md:text-4xl font-semibold mt-2 tracking-tighter">
              {tender.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusBadge status={tender.status} />
              {tender.departmentName && (
                <span className="text-sm text-slate-900/65">{tender.departmentName}</span>
              )}
              {tender.category && (
                <span className="text-sm text-electric-600">· {tender.category}</span>
              )}
            </div>
          </div>
          {/* BUG-117 (2026-06-09): estimatedBudget hidden on vendor portal —
              internal-only reference. Owner directive: vendors should bid
              against the BoQ, not anchor to the buyer's budget figure. */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-12">
          <div className="lg:col-span-2 space-y-10">
            {tender.description && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-3">Description</h3>
                <p className="text-slate-900/80 leading-relaxed whitespace-pre-wrap">{tender.description}</p>
              </section>
            )}

            {tender.requirements && tender.requirements.length > 0 && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-4">Key Requirements</h3>
                <ul className="space-y-3">
                  {tender.requirements.map((req, i) => (
                    <li key={i} className="flex gap-3 text-slate-900/80">
                      <Check className="w-5 h-5 text-electric-500 shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tender.documents && tender.documents.length > 0 && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-4">Tender Documents</h3>
                <div className="space-y-2">
                  {tender.documents.map(d => {
                    const isPdf = d.mimeType?.includes('pdf');
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/5 border border-slate-900/10 px-5 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-5 h-5 text-electric-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{d.filename}</div>
                            <div className="text-xs text-slate-900/55">
                              {(d.fileSize / 1024).toFixed(0)} KB · Uploaded {formatDate(d.uploadedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isPdf && (
                            <button
                              type="button"
                              onClick={() => handleViewDoc(d.id)}
                              className="btn-ghost px-3 py-2 rounded-2xl text-xs flex items-center gap-1"
                              title="View document"
                            >
                              <Eye className="w-4 h-4" /> View
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownloadDoc(d.id, d.filename)}
                            className="btn-ghost px-3 py-2 rounded-2xl text-xs flex items-center gap-1"
                            title="Download document"
                          >
                            <Download className="w-4 h-4" /> Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* WALK-018: Clarifications live inside the tender detail page so
                the vendor reads tender info and the Q&A thread on the same
                surface. The standalone /clarifications nav remains for cross-
                tender browsing. */}
            <ClarificationsSection tenderId={id} tenderStatus={tender.status} />
          </div>

          <aside className="space-y-4">
            {tender.submissionDeadline && (
              <DeadlineCard label="Submission Deadline" iso={tender.submissionDeadline} />
            )}
            {tender.clarificationDeadline && (
              <DeadlineCard label="Clarification Deadline" iso={tender.clarificationDeadline} />
            )}

            {/* BUG-083: if vendor already has a bid here, show "View Submitted Bid"
                  (post-submit immutable) or "Continue Bid" (still in DRAFT). */}
            {myBid && myBid.status !== 'DRAFT' ? (
              <Link
                href={`/bids/${myBid.id}`}
                className="btn-ghost block text-center rounded-3xl py-5 text-base font-semibold tracking-wide"
              >
                VIEW SUBMITTED BID
              </Link>
            ) : myBid && myBid.status === 'DRAFT' ? (
              <Link
                href={`/bids/wizard/${tender.id}`}
                className="btn-electric block text-center rounded-3xl py-5 text-base font-semibold tracking-wide"
              >
                CONTINUE BID
              </Link>
            ) : canBid ? (
              <Link
                href={`/bids/wizard/${tender.id}`}
                className="btn-electric block text-center rounded-3xl py-5 text-base font-semibold tracking-wide"
              >
                START BID
              </Link>
            ) : (
              (() => {
                const state = blockedStateForTender(tender.status);
                return state ? (
                  <MessageBanner
                    message={vendorMessage(state, {
                      deadline: tender.submissionDeadline ?? undefined,
                      tenderRef: tender.referenceNumber,
                    })}
                  />
                ) : null;
              })()
            )}
            {tender.documents && tender.documents.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  for (const d of tender.documents ?? []) {
                    await handleDownloadDoc(d.id, d.filename);
                  }
                }}
                className="btn-ghost w-full rounded-3xl py-4 text-sm"
              >
                Download All Documents
              </button>
            )}
          </aside>
        </div>
      </GlassCard>
    </div>
  );
}

function DeadlineCard({ label, iso }: { label: string; iso: string }) {
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const tone = days <= 3 ? 'text-rose-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="glass rounded-3xl p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-900/55">{label}</div>
      <div className="heading-font text-2xl font-semibold mt-2 tracking-tighter">
        {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className={`text-sm mt-1 ${tone}`}>
        {days > 0 ? `${days} day${days !== 1 ? 's' : ''} remaining` : days === 0 ? 'Today' : 'Passed'}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBudget(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'KWD',
    maximumFractionDigits: 0,
  }).format(n);
}

// WALK-018: inline Clarifications surface on the tender detail page so
// vendors don't have to leave to ask a question or read public answers.
interface ClarificationItem {
  id: string;
  question: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  createdAt: string;
  vendorName?: string | null;
  replies: Array<{
    id: string;
    reply: string;
    visibility: 'PRIVATE_TO_VENDOR' | 'GENERAL_PUBLIC';
    repliedAt: string;
    repliedByName?: string;
  }>;
}

const ASK_ELIGIBLE_STATUSES = new Set(['Published', 'Clarification Period']);

function ClarificationsSection({ tenderId, tenderStatus }: { tenderId: string; tenderStatus: string }) {
  const [items, setItems] = useState<ClarificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [posting, setPosting] = useState(false);

  const canAsk = ASK_ELIGIBLE_STATUSES.has(tenderStatus);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await get<{ items: ClarificationItem[] }>(`/tenders/${tenderId}/clarifications`, token);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clarifications');
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/clarifications`, { question: trimmed }, token);
      setQuestion('');
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post question');
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      <h3 className="heading-font text-lg font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-electric-500" /> Clarifications
      </h3>

      {canAsk && (
        <form onSubmit={handleAsk} className="mb-4 rounded-2xl bg-slate-900/5 border border-slate-900/10 p-4 space-y-3">
          <Textarea
            placeholder="Ask a question about this tender. The reply goes only to you."
            value={question}
            onChange={e => setQuestion(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={posting || !question.trim()}>
              {posting ? 'Sending…' : 'Send question'}
            </Button>
          </div>
        </form>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-900/55 italic">No clarifications posted yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map(c => (
            <div key={c.id} className="rounded-2xl bg-slate-900/5 border border-slate-900/10 p-4">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <p className="text-xs text-slate-900/55">
                    {c.vendorName ?? 'Anonymised bidder'} · {formatDate(c.createdAt)}
                  </p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{c.question}</p>
                </div>
                <Chip>{c.status}</Chip>
              </div>
              {c.replies.length > 0 && (
                <div className="mt-3 border-t border-slate-900/10 pt-3 space-y-2">
                  {c.replies.map(r => (
                    <div key={r.id} className="rounded-xl bg-white/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[11px] text-slate-900/60">
                          {r.repliedByName ?? 'Procurement'} · {formatDate(r.repliedAt)}
                        </p>
                        {/* BUG-145 (2026-06-19): every reply is private to the asking vendor. */}
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          Private
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{r.reply}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
