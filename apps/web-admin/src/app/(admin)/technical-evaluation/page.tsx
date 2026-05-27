'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';
import { AlertTriangle, ClipboardList, Package, ChevronRight, Eye, Save, PenLine, Lock } from 'lucide-react';

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

interface BidSummary {
  id: string;
  vendorId: string;
  vendorCompany: string;
  submittedAt: string | null;
  technicalEnvelopeStatus: 'SUBMITTED' | 'OPENED' | 'LOCKED' | 'SEALED' | 'DRAFT';
  technicalResult?: 'PASS' | 'FAIL';
  technicalScore?: number;
}

interface TenderBidsResponse {
  items: BidSummary[];
  total: number;
}

interface CriterionScore {
  criterion: string;
  description: string;
  maxScore: number;
  score: number | '';
  passed: boolean;
}

interface TechnicalEvaluation {
  id: string;
  bidId: string;
  evaluatorUserId?: string;
  result: 'PASS' | 'FAIL';
  score?: number;
}

// Pending API addition: tender criteria config. Hardcoded for now to match
// stitch design. Replace with GET /tenders/{tenderId}/technical-criteria when
// endpoint lands.
const DEFAULT_CRITERIA: Omit<CriterionScore, 'score' | 'passed'>[] = [
  {
    criterion: 'Compliance with Technical Specs',
    description: 'Full adherence to Appendix A equipment list and operational parameters.',
    maxScore: 30,
  },
  {
    criterion: 'Team Experience & Qualifications',
    description: 'Years of relevant experience for the assigned Project Manager and Senior Engineers.',
    maxScore: 25,
  },
  {
    criterion: 'Project Methodology & Timeline',
    description: 'Detailing project phase milestones and risk mitigation strategies.',
    maxScore: 25,
  },
  {
    criterion: 'Support & Maintenance SLA',
    description: 'Post-implementation technical support availability and response times.',
    maxScore: 20,
  },
];

const PASS_THRESHOLD = 70;

// Tenders where technical evaluation is active: envelopes opened, scoring in progress.
const EVALUATION_STATUSES = ['Technical Opening', 'Technical Evaluation'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function emptyCriteria(): CriterionScore[] {
  return DEFAULT_CRITERIA.map(c => ({ ...c, score: '', passed: false }));
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="p-4 border-b border-border animate-pulse">
      <div className="h-3 bg-bg rounded w-24 mb-2" />
      <div className="h-3.5 bg-bg rounded w-48" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TechnicalEvaluationPage() {
  const { openPdfViewer } = usePdfViewer();
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const [bids, setBids] = useState<BidSummary[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);

  const [evaluations, setEvaluations] = useState<TechnicalEvaluation[]>([]);
  const [criteria, setCriteria] = useState<CriterionScore[]>(emptyCriteria);
  const [recommendation, setRecommendation] = useState<'PASS' | 'FAIL'>('FAIL');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [viewingProposal, setViewingProposal] = useState(false);

  // ─── Fetch tenders in evaluation phase ──────────────────────────────────────
  useEffect(() => {
    async function fetchTenders() {
      setTendersLoading(true);
      try {
        const token = getAccessToken();
        const results = await Promise.all(
          EVALUATION_STATUSES.map(status =>
            get<PaginatedTenders>(
              `/tenders?status=${encodeURIComponent(status)}&pageSize=50`,
              token,
            ).catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
          ),
        );
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (merged.length > 0) setSelectedTenderId(merged[0].id);
      } finally {
        setTendersLoading(false);
      }
    }
    fetchTenders();
  }, []);

  // ─── Fetch bids + existing evaluations for selected tender ──────────────────
  const fetchTenderData = useCallback(async (tenderId: string) => {
    setBidsLoading(true);
    setBids([]);
    setEvaluations([]);
    setSelectedBidId(null);
    try {
      const token = getAccessToken();
      // GAP: GET /tenders/{tenderId}/bids not yet in OpenAPI contract.
      // Calling it speculatively; falls back to empty list.
      const [bidsRes, evalsRes] = await Promise.all([
        get<TenderBidsResponse>(`/tenders/${tenderId}/bids?pageSize=100`, token).catch(
          () => ({ items: [], total: 0 } as TenderBidsResponse),
        ),
        get<{ items: TechnicalEvaluation[] }>(
          `/tenders/${tenderId}/technical-evaluations`,
          token,
        ).catch(() => ({ items: [] })),
      ]);
      setBids(bidsRes.items ?? []);
      setEvaluations(evalsRes.items ?? []);
      if ((bidsRes.items ?? []).length > 0) {
        setSelectedBidId(bidsRes.items[0].id);
      }
    } finally {
      setBidsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) fetchTenderData(selectedTenderId);
  }, [selectedTenderId, fetchTenderData]);

  // ─── Reset scorecard when bid changes ───────────────────────────────────────
  useEffect(() => {
    setCriteria(emptyCriteria());
    setRecommendation('FAIL');
    setNotes('');
    setSubmitError(null);
  }, [selectedBidId]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const selectedTender = tenders.find(t => t.id === selectedTenderId) ?? null;
  const selectedBid = bids.find(b => b.id === selectedBidId) ?? null;

  const totalScore = useMemo(
    () =>
      criteria.reduce(
        (sum, c) => sum + (typeof c.score === 'number' ? c.score : 0),
        0,
      ),
    [criteria],
  );
  const maxTotal = useMemo(
    () => criteria.reduce((sum, c) => sum + c.maxScore, 0),
    [criteria],
  );

  function evaluationFor(bidId: string): TechnicalEvaluation | undefined {
    return evaluations.find(e => e.bidId === bidId);
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────
  function updateCriterion(idx: number, patch: Partial<CriterionScore>) {
    setCriteria(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function handleViewProposal() {
    if (!selectedBid) return;
    setViewingProposal(true);
    try {
      const token = getAccessToken();
      const list = await get<{ documents: Array<{ id: string; filename: string }> }>(
        `/bids/${selectedBid.id}/envelopes/TECHNICAL/documents`,
        token,
      );
      const docs = list.documents ?? [];
      if (docs.length === 0) {
        alert('No technical documents uploaded for this bid.');
        return;
      }
      const doc = docs[0];
      // Iframes can't carry an Authorization header, so we pre-fetch the PDF
      // with the bearer token and feed the modal a blob URL. The view endpoint
      // writes the audit row server-side before streaming.
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(
        `${apiBase}/api/v1/bids/${selectedBid.id}/envelopes/TECHNICAL/documents/${doc.id}/view`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Failed to open proposal (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      openPdfViewer({
        src: url,
        title: doc.filename ?? `${selectedBid.vendorCompany} — Technical proposal`,
        onClose: () => URL.revokeObjectURL(url),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open proposal');
    } finally {
      setViewingProposal(false);
    }
  }

  async function handleSaveEvaluation() {
    if (!selectedBid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = getAccessToken();
      const criteriaBreakdown = criteria
        .map(c => `${c.criterion}: ${typeof c.score === 'number' ? c.score : 0}/${c.maxScore}`)
        .join(' · ');
      const fullNotes = [
        `Recommendation: ${recommendation}`,
        `Criteria breakdown — ${criteriaBreakdown}`,
        notes ? `Evaluator notes: ${notes}` : '',
      ].filter(Boolean).join('\n');
      await post(
        `/bids/${selectedBid.id}/technical-evaluations`,
        {
          score: totalScore,
          notes: fullNotes,
        },
        token,
      );
      if (selectedTenderId) await fetchTenderData(selectedTenderId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save evaluation');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalize() {
    if (!selectedTenderId) return;
    if (!confirm('Finalize technical results? Only PASSED vendors proceed to commercial.')) return;
    setFinalizing(true);
    try {
      const token = getAccessToken();
      await post(`/tenders/${selectedTenderId}/finalize-technical-results`, {}, token);
      await fetchTenderData(selectedTenderId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to finalize');
    } finally {
      setFinalizing(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden -m-8">
      {/* Compliance banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-3 flex-shrink-0">
        <AlertTriangle className="w-5 h-5 text-amber-700" />
        <span className="text-sm font-semibold text-amber-900">
          Commercial envelopes remain sealed. Do not request or reference commercial information at this stage.
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Tender List ─────────────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-r border-border bg-bg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-card">
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Tenders Under Evaluation
            </p>
            <p className="text-xs text-text-secondary">
              {tenders.length} active
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tendersLoading ? (
              Array.from({ length: 3 }).map((_, i) => <ListSkeleton key={i} />)
            ) : tenders.length === 0 ? (
              <div className="p-6 text-center">
                <ClipboardList className="w-10 h-10 text-text-secondary/20 mx-auto mb-2" />
                <p className="text-xs text-text-secondary">
                  No tenders in technical evaluation phase.
                </p>
              </div>
            ) : (
              tenders.map(t => {
                const isSelected = t.id === selectedTenderId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTenderId(t.id)}
                    className={`p-4 border-b border-border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-card border-l-4 border-l-accent shadow-sm'
                        : 'border-l-4 border-l-transparent hover:bg-card/70'
                    }`}
                  >
                    <p className={`text-xs font-bold mb-1 ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>
                      {t.referenceNumber}
                    </p>
                    <p className={`text-sm font-semibold leading-snug mb-1.5 ${
                      isSelected ? 'text-text-primary' : 'text-text-secondary'
                    }`}>
                      {t.title}
                    </p>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                      {t.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Bid List ────────────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 border-r border-border bg-bg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-card flex justify-between items-center">
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Submitted Bids
            </p>
            <span className="bg-accent/10 text-accent px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
              {bids.length} submissions
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {bidsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <ListSkeleton key={i} />)
            ) : bids.length === 0 ? (
              <div className="p-6 text-center">
                <Package className="w-10 h-10 text-text-secondary/20 mx-auto mb-2" />
                <p className="text-xs text-text-secondary">
                  {selectedTender ? 'No bids found.' : 'Select a tender.'}
                </p>
                {selectedTender && (
                  <p className="text-[10px] text-text-secondary mt-2 italic">
                    GET /tenders/{'{id}'}/bids endpoint pending API contract update.
                  </p>
                )}
              </div>
            ) : (
              bids.map(b => {
                const isSelected = b.id === selectedBidId;
                const existing = evaluationFor(b.id);
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBidId(b.id)}
                    className={`p-4 border-b border-border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-card border-l-4 border-l-accent shadow-sm'
                        : 'border-l-4 border-l-transparent hover:bg-card/70'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className={`text-sm font-semibold ${
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      }`}>
                        {b.vendorCompany}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        b.technicalEnvelopeStatus === 'OPENED'
                          ? 'bg-success/10 text-success'
                          : 'bg-border text-text-secondary'
                      }`}>
                        {b.technicalEnvelopeStatus}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Submitted: {formatDate(b.submittedAt)}
                    </p>
                    {existing && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          existing.result === 'PASS'
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}>
                          {existing.result}
                        </span>
                        {typeof existing.score === 'number' && (
                          <span className="text-xs text-text-secondary font-mono">
                            {existing.score}/{maxTotal}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Scorecard ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-bg">
          {!selectedTender || !selectedBid ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <ClipboardList className="w-14 h-14 text-text-secondary/20" />
              <p className="text-sm font-semibold text-text-secondary">
                {!selectedTender
                  ? 'Select a tender to begin evaluation.'
                  : 'Select a bid to score.'}
              </p>
            </div>
          ) : (
            <div className="p-6 max-w-5xl mx-auto">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1 text-xs text-text-secondary mb-3">
                <Link href="/tenders" className="hover:text-accent transition-colors">Tenders</Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link href={`/tenders/${selectedTender.id}`} className="hover:text-accent transition-colors">
                  {selectedTender.referenceNumber}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-text-primary font-medium">Technical Evaluation</span>
              </nav>

              <div className="flex justify-between items-start mb-5">
                <div>
                  <h1 className="text-xl font-bold text-text-primary tracking-tight">
                    Technical Scorecard — {selectedBid.vendorCompany}
                  </h1>
                  <p className="text-sm text-text-secondary mt-1">
                    Review the technical envelope requirements and assign scores based on submission quality.
                  </p>
                </div>
                <button
                  onClick={() => handleViewProposal()}
                  disabled={viewingProposal}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="View full proposal"
                >
                  <Eye className="w-[18px] h-[18px]" />
                  {viewingProposal ? 'Opening…' : 'View Full Proposal'}
                </button>
              </div>

              {/* Criteria table */}
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">
                        Technical Criterion
                      </th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-center w-24">
                        Max
                      </th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-center w-32">
                        Score
                      </th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-center w-24">
                        Met
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {criteria.map((c, i) => (
                      <tr key={c.criterion} className="hover:bg-bg/40 transition-colors">
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-text-primary">{c.criterion}</p>
                          <p className="text-xs text-text-secondary mt-0.5">{c.description}</p>
                        </td>
                        <td className="px-5 py-4 text-center text-sm font-bold text-text-primary">
                          {c.maxScore}
                        </td>
                        <td className="px-5 py-4">
                          <input
                            type="number"
                            min={0}
                            max={c.maxScore}
                            value={c.score}
                            onChange={e => {
                              const raw = e.target.value;
                              const val: number | '' = raw === '' ? '' : Math.min(c.maxScore, Math.max(0, Number(raw)));
                              updateCriterion(i, { score: val });
                            }}
                            placeholder="0"
                            className="w-full text-center border border-border rounded-lg py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-accent bg-card"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={c.passed}
                                onChange={e => updateCriterion(i, { passed: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-10 h-5 bg-border rounded-full peer-checked:bg-accent transition-colors relative">
                                <span className={`absolute top-[2px] left-[2px] bg-white w-4 h-4 rounded-full transition-transform ${
                                  c.passed ? 'translate-x-5' : ''
                                }`} />
                              </div>
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary + actions — BUG-021 retest D1: Save lives on its own row below
                  so Pass/Fail have room to breathe instead of being crammed into one row. */}
              <div className="space-y-4 mb-6">
                <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-xs font-bold uppercase text-text-secondary">Current Score</p>
                      <p className="text-3xl font-bold text-accent mt-1">
                        {totalScore}
                        <span className="text-text-secondary text-lg font-medium"> / {maxTotal}</span>
                      </p>
                    </div>
                    <div className="h-12 w-px bg-border" />
                    <div>
                      <p className="text-xs font-bold uppercase text-text-secondary">Requirement</p>
                      <p className="text-base font-semibold text-text-primary mt-1">
                        Min. {PASS_THRESHOLD} to pass
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    <span className="text-xs font-bold uppercase text-text-secondary">Recommendation</span>
                    <div className="flex bg-bg p-1 rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => setRecommendation('FAIL')}
                        className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${
                          recommendation === 'FAIL'
                            ? 'bg-danger text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Fail
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecommendation('PASS')}
                        className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${
                          recommendation === 'PASS'
                            ? 'bg-success text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Pass
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSaveEvaluation}
                  disabled={submitting}
                  className="w-full bg-accent hover:bg-accent-hover text-white rounded-xl shadow-md font-bold text-base px-6 py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {submitting ? 'Saving…' : 'Save Evaluation'}
                </button>
              </div>

              {submitError && (
                <p className="text-sm text-danger mb-4">{submitError}</p>
              )}

              {/* Evaluator notes */}
              <div className="bg-card rounded-xl border border-dashed border-border p-5 mb-6">
                <h4 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                  <PenLine className="w-[18px] h-[18px] text-accent" />
                  Evaluator Notes (Internal Only)
                </h4>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Provide detailed justification for the scores assigned above..."
                  className="w-full border border-border rounded-lg p-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg placeholder:text-text-secondary/50 resize-none"
                />
                <p className="text-[11px] text-text-secondary mt-2 italic">
                  * Notes visible to Tender Committee and Audit only. No vendor access.
                </p>
              </div>

              {/* Finalize */}
              <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-bold text-text-primary">Finalize Technical Results</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Lock all scorecards for this tender. Only PASSED vendors proceed to commercial comparison.
                  </p>
                </div>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing || evaluations.length === 0}
                  className="px-5 py-2.5 bg-text-primary text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Lock className="w-[18px] h-[18px]" />
                  {finalizing ? 'Finalizing…' : 'Finalize'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
