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
  replies: Array<{
    id: string;
    reply: string;
    visibility: 'PRIVATE_TO_VENDOR' | 'GENERAL_PUBLIC';
    repliedAt: string;
    repliedByName?: string;
  }>;
}

const ELIGIBLE_STATUSES = ['Published', 'Clarification Period'];

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
        const results = await Promise.all(
          ELIGIBLE_STATUSES.map(s =>
            get<{ data: TenderSummary[] }>(
              `/tenders?status=${encodeURIComponent(s)}&pageSize=50`,
              token,
            ).catch(() => ({ data: [] })),
          ),
        );
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (merged.length > 0) setSelectedTenderId(merged[0].id);
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
        subtitle="Ask procurement to clarify scope, requirements, or terms. You see your own threads plus any replies marked public."
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
              No tenders in clarification or published phase.
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
                  description="Your questions and any public replies on this tender will appear here."
                />
              ) : (
                <div className="space-y-4">
                  {clarifications.map(c => <ThreadCard key={c.id} clarification={c} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ clarification }: { clarification: Clarification }) {
  return (
    <GlassCard padding="none" className="overflow-hidden">
      <div className="p-6 border-b border-slate-900/10">
        <div className="flex items-start justify-between gap-4 mb-3">
          <StatusBadge status={clarification.status} />
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
                  {r.repliedByName ?? 'Procurement Officer'}
                </span>
                <Chip
                  tone={r.visibility === 'GENERAL_PUBLIC' ? 'electric' : 'neutral'}
                  className="ml-auto"
                >
                  {r.visibility === 'GENERAL_PUBLIC' ? 'PUBLIC' : 'PRIVATE'}
                </Chip>
              </div>
              <p className="text-sm text-slate-900/80 leading-relaxed">{r.reply}</p>
              <p className="text-[10px] text-slate-900/50 mt-2">
                {new Date(r.repliedAt).toLocaleString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
