'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

  // Fetch eligible tenders.
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

  // Fetch clarifications when tender changes.
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Clarifications</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Ask procurement to clarify scope, requirements, or terms. You see your own threads + any
          replies marked public.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Tender list */}
        <div className="md:col-span-1 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-3 border-b border-border bg-bg">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Eligible Tenders
            </p>
          </div>
          {loading ? (
            <div className="p-4 text-xs text-text-secondary">Loading…</div>
          ) : tenders.length === 0 ? (
            <div className="p-4 text-xs text-text-secondary italic">No tenders in clarification or published phase.</div>
          ) : (
            <ul className="divide-y divide-border">
              {tenders.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedTenderId(t.id)}
                    className={`w-full text-left p-3 transition-colors ${
                      selectedTenderId === t.id ? 'bg-accent/5 border-l-4 border-l-accent' : 'hover:bg-bg/60'
                    }`}
                  >
                    <p className="text-[10px] font-mono font-bold text-accent">{t.referenceNumber}</p>
                    <p className="text-xs font-semibold text-text-primary mt-0.5 leading-snug">{t.title}</p>
                    <div className="mt-1">
                      <StatusBadge status={t.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thread + ask form */}
        <div className="md:col-span-3 space-y-4">
          {!selectedTender ? (
            <div className="bg-card rounded-xl border border-border shadow-sm p-8 text-center text-sm text-text-secondary">
              Select a tender on the left to view or post clarifications.
            </div>
          ) : (
            <>
              {/* Ask form */}
              <form
                onSubmit={handleAsk}
                className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3"
              >
                <p className="text-sm font-bold text-text-primary">Ask a question</p>
                <textarea
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  placeholder="Type your clarification request…"
                  rows={3}
                  required
                  className="w-full p-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent bg-bg resize-none"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={posting || !newQuestion.trim()}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-bold disabled:opacity-50"
                  >
                    {posting ? 'Submitting…' : 'Submit Question'}
                  </button>
                </div>
              </form>

              {/* Thread list */}
              <div className="space-y-3">
                {threadLoading ? (
                  <div className="p-6 text-center text-sm text-text-secondary">Loading threads…</div>
                ) : clarifications.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center">
                    <span className="material-symbols-outlined text-[40px] text-text-secondary/30 block mb-1">forum</span>
                    <p className="text-sm text-text-secondary">No clarifications on this tender yet.</p>
                  </div>
                ) : (
                  clarifications.map(c => <ThreadCard key={c.id} clarification={c} />)
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ clarification }: { clarification: Clarification }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            clarification.status === 'OPEN' ? 'bg-amber-100 text-amber-800' :
            clarification.status === 'ANSWERED' ? 'bg-success/15 text-success' :
            'bg-border text-text-secondary'
          }`}>
            {clarification.status}
          </span>
          <span className="text-[11px] text-text-secondary">
            {new Date(clarification.createdAt).toLocaleString('en-GB')}
          </span>
        </div>
        <p className="text-sm text-text-primary leading-relaxed">{clarification.question}</p>
      </div>

      {clarification.replies.length > 0 && (
        <div className="bg-bg/40 px-4 py-3 space-y-2 border-t border-border">
          {clarification.replies.map(r => (
            <div key={r.id} className="bg-card rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[14px] text-accent">reply</span>
                <span className="text-xs font-bold text-text-primary">
                  {r.repliedByName ?? 'Procurement Officer'}
                </span>
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  r.visibility === 'GENERAL_PUBLIC' ? 'bg-accent/10 text-accent' : 'bg-border text-text-secondary'
                }`}>
                  {r.visibility === 'GENERAL_PUBLIC' ? 'PUBLIC' : 'PRIVATE'}
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">{r.reply}</p>
              <p className="text-[10px] text-text-secondary/60 mt-1">
                {new Date(r.repliedAt).toLocaleString('en-GB')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
