'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Reply } from 'lucide-react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Chip } from '@/components/ui/StatusBadge';
import { Loading, Empty, ErrorBanner } from '@/components/ui/Empty';

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
}

interface Clarification {
  id: string;
  tenderId: string;
  question: string;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  createdAt: string;
  // BUG-147 (2026-06-21): backend now exposes who asked. Useful for
  // distinguishing admin-initiated threads from vendor-initiated ones.
  askedByAdmin?: boolean;
  askedByName?: string | null;
  replies: Array<{
    id: string;
    reply: string;
    // BUG-145 (2026-06-19): every reply is private; field kept for legacy.
    visibility?: 'PRIVATE_TO_VENDOR' | 'GENERAL_PUBLIC';
    // BUG-147 (2026-06-21): who replied (admin vs vendor) — used to decide
    // whether the vendor's reply form should be shown for this thread.
    repliedByAdmin?: boolean;
    repliedAt: string;
    repliedByName?: string | null;
  }>;
}

// BUG-146 (2026-06-21): picker source switched to the new
// /vendor/clarification-tenders endpoint, which returns every tender the
// vendor has a clarification thread on, regardless of tender lifecycle
// state. The old ELIGIBLE_STATUSES + iterate-/tenders?status=… approach
// missed tenders past Clarification Period because the backend tender
// listing intentionally hides post-submission states from vendors (no
// commercial visibility leak per owner directive). The new endpoint
// bypasses that hide-from-list rule but only exposes the identity of
// tenders the vendor already has a thread on.

export default function VendorClarificationsPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        // BUG-146 (2026-06-21): single call to /vendor/clarification-tenders
        // which returns every tender the vendor has a thread on, regardless
        // of tender lifecycle state. Replaces the old iterate-over-statuses
        // approach which missed tenders past Clarification Period.
        const res = await get<{ items: TenderSummary[] }>('/vendor/clarification-tenders', token)
          .catch(() => ({ items: [] }));
        setTenders(res.items ?? []);
        if ((res.items ?? []).length > 0) setSelectedTenderId(res.items[0].id);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const fetchClarifications = useCallback(async (tenderId: string) => {
    setThreadLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<{ items: Clarification[] }>(
        `/tenders/${tenderId}/clarifications`,
        token,
      ).catch(() => ({ items: [] }));
      setClarifications(res.items ?? []);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) fetchClarifications(selectedTenderId);
  }, [selectedTenderId, fetchClarifications]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenderId || !newQuestion.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${selectedTenderId}/clarifications`, { question: newQuestion }, token);
      setNewQuestion('');
      await fetchClarifications(selectedTenderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit clarification');
    } finally {
      setPosting(false);
    }
  }

  const selectedTender = tenders.find(t => t.id === selectedTenderId) ?? null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Clarifications"
        subtitle="Ask procurement to clarify scope, requirements, or terms. All replies are private to your company."
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tender selector */}
        <GlassCard padding="none" className="lg:col-span-1 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-900/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-900/55">
              Eligible Tenders
            </p>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-900/55">Loading…</div>
          ) : tenders.length === 0 ? (
            <div className="p-6 text-sm text-slate-900/55 italic">
              No active tenders available to view clarifications.
            </div>
          ) : (
            <ul className="divide-y divide-slate-900/5">
              {tenders.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTenderId(t.id)}
                    className={`w-full text-left p-5 transition-colors ${
                      selectedTenderId === t.id
                        ? 'bg-electric-500/10 border-l-2 border-l-electric-500'
                        : 'hover:bg-slate-900/5'
                    }`}
                  >
                    <p className="text-[10px] font-mono text-electric-600">{t.referenceNumber}</p>
                    <p className="text-sm font-medium mt-1 leading-snug line-clamp-2">{t.title}</p>
                    <div className="mt-2">
                      <StatusBadge status={t.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Thread area */}
        <div className="lg:col-span-3 space-y-6">
          {!selectedTender ? (
            <Empty
              icon={MessageSquare}
              title="Select a tender"
              description="Pick a tender on the left to view or post clarifications."
            />
          ) : (
            <>
              <GlassCard>
                <form onSubmit={handleAsk} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="heading-font text-xl font-semibold">Ask a question</h3>
                    <Chip tone="electric">{selectedTender.referenceNumber}</Chip>
                  </div>
                  <Textarea
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    placeholder="Type your clarification request…"
                    rows={4}
                    required
                  />
                  {error && <ErrorBanner message={error} />}
                  <div className="flex justify-end">
                    <Button type="submit" disabled={posting || !newQuestion.trim()} size="md">
                      {posting ? 'Submitting…' : 'Submit Question'}
                    </Button>
                  </div>
                </form>
              </GlassCard>

              {threadLoading ? (
                <Loading label="Loading threads…" />
              ) : clarifications.length === 0 ? (
                <Empty
                  icon={MessageSquare}
                  title="No clarifications yet"
                  description="Your questions on this tender and procurement's replies will appear here. All replies are private to your company."
                />
              ) : (
                <div className="space-y-4">
                  {clarifications.map(c => (
                    <ThreadCard
                      key={c.id}
                      clarification={c}
                      onReplied={() => selectedTenderId && fetchClarifications(selectedTenderId)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ clarification, onReplied }: { clarification: Clarification; onReplied: () => void }) {
  // BUG-147 (2026-06-21): vendor can reply when the ball is in their court.
  // That's true when (a) admin asked the original question (the thread is
  // awaiting the vendor's response), OR (b) the latest reply on the thread
  // is from admin (admin sent a follow-up that needs the vendor's response).
  const lastReply = clarification.replies.length > 0
    ? clarification.replies[clarification.replies.length - 1]
    : null;
  const askedByAdmin = !!clarification.askedByAdmin;
  const lastFromAdmin = lastReply ? !!lastReply.repliedByAdmin : false;
  const noRepliesYet = clarification.replies.length === 0;
  const ballInVendorCourt =
    (askedByAdmin && noRepliesYet) || // admin asked, vendor hasn't answered
    lastFromAdmin;                    // admin sent the latest message

  return (
    <GlassCard padding="none" className="overflow-hidden">
      <div className="p-6 border-b border-slate-900/10">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={clarification.status} />
            {askedByAdmin && (
              <Chip tone="electric">FROM PROCUREMENT</Chip>
            )}
          </div>
          <span className="text-xs text-slate-900/50">
            {new Date(clarification.createdAt).toLocaleString('en-GB')}
          </span>
        </div>
        <p className="text-sm text-slate-900/90 leading-relaxed">{clarification.question}</p>
      </div>

      {clarification.replies.length > 0 && (
        <div className="bg-slate-50 px-6 py-5 space-y-3">
          {clarification.replies.map(r => (
            <div
              key={r.id}
              className="rounded-2xl bg-white border border-slate-900/10 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Reply className="w-4 h-4 text-electric-600" />
                <span className="text-xs font-semibold">
                  {r.repliedByName ?? (r.repliedByAdmin ? 'Procurement Officer' : 'You')}
                </span>
                {/* BUG-145 (2026-06-19): every reply is private to the asking vendor. */}
                <Chip tone="neutral" className="ml-auto">PRIVATE</Chip>
              </div>
              <p className="text-sm text-slate-900/80 leading-relaxed">{r.reply}</p>
              <p className="text-[10px] text-slate-900/50 mt-2">
                {new Date(r.repliedAt).toLocaleString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* BUG-147 (2026-06-21): vendor reply form. Shown only when the ball
          is in the vendor's court (admin asked OR last reply was from admin). */}
      {ballInVendorCourt && (
        <VendorReplyForm clarificationId={clarification.id} onReplied={onReplied} />
      )}
    </GlassCard>
  );
}

function VendorReplyForm({ clarificationId, onReplied }: { clarificationId: string; onReplied: () => void }) {
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = reply.trim();
    if (trimmed.length < 1) return;
    setPosting(true);
    setErr(null);
    try {
      const token = getAccessToken();
      await post(`/clarifications/${clarificationId}/reply`, { reply: trimmed }, token);
      setReply('');
      onReplied();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to send reply');
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-900/10 px-6 py-4 space-y-3">
      <Textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Type your reply to procurement…"
        rows={3}
      />
      {err && <ErrorBanner message={err} />}
      <div className="flex justify-end">
        <Button type="submit" disabled={posting || !reply.trim()} size="sm">
          {posting ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}
