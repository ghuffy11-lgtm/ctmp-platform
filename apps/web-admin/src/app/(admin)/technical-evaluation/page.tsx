'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';
import { useConfirm } from '@/components/dialog/DialogProvider';
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
  // Weight comes from the tender's per-tender criteria config (or DEFAULT_CRITERIA);
  // sent through to the backend so per-criterion rows persist with their weight.
  weight: number;
  score: number | '';
  passed: boolean;
}

interface TechnicalEvaluation {
  id: string;
  bidId: string;
  evaluatorUserId?: string;
  evaluatorName?: string;
  result?: 'PASS' | 'FAIL';
  score?: number;
  // BUG-057 / WALK-026: hydration fields surfaced by the backend extension.
  comments?: string;
  finalizedAt?: string;
  updatedAt?: string;
  criterionScores?: Array<{
    criterion: string;
    weight: number;
    score: number;
    comments?: string;
  }>;
}

// Fallback used when the tender has no per-tender criteria configured yet
// (pre-Phase F tenders). New tenders should use the editor on /tenders/[id]/edit.
const DEFAULT_CRITERIA: Omit<CriterionScore, 'score' | 'passed'>[] = [
  {
    criterion: 'Compliance with Technical Specs',
    description: 'Full adherence to Appendix A equipment list and operational parameters.',
    maxScore: 30,
    weight: 30,
  },
  {
    criterion: 'Team Experience & Qualifications',
    description: 'Years of relevant experience for the assigned Project Manager and Senior Engineers.',
    maxScore: 25,
    weight: 25,
  },
  {
    criterion: 'Project Methodology & Timeline',
    description: 'Detailing project phase milestones and risk mitigation strategies.',
    maxScore: 25,
    weight: 25,
  },
  {
    criterion: 'Support & Maintenance SLA',
    description: 'Post-implementation technical support availability and response times.',
    maxScore: 20,
    weight: 20,
  },
];

interface TenderCriterion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxScore: number;
  weight: number | null;
  mandatory: boolean;
}

const PASS_THRESHOLD = 70;

// Tenders where technical evaluation is active: envelopes opened, scoring in progress.
// Active evaluation statuses — scorecard is editable.
const EVALUATION_STATUSES = ['Technical Opening', 'Technical Evaluation'];
// WALK-054: completed statuses — evaluator can revisit read-only.
const PAST_EVALUATION_STATUSES = [
  'Commercial Sealed',
  'Committee Commercial Opening',
  'Commercial Evaluation / Comparison',
  'Award Recommendation',
  'Awarded',
  'Tender Closed',
];
const PAST_SET = new Set(PAST_EVALUATION_STATUSES);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function emptyCriteria(template?: Omit<CriterionScore, 'score' | 'passed'>[]): CriterionScore[] {
  return (template ?? DEFAULT_CRITERIA).map(c => ({ ...c, score: '', passed: false }));
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
  const confirm = useConfirm();
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const [bids, setBids] = useState<BidSummary[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);

  const [evaluations, setEvaluations] = useState<TechnicalEvaluation[]>([]);
  const [tenderCriteria, setTenderCriteria] = useState<Omit<CriterionScore, 'score' | 'passed'>[]>(DEFAULT_CRITERIA);
  const [criteria, setCriteria] = useState<CriterionScore[]>(emptyCriteria);
  const [recommendation, setRecommendation] = useState<'PASS' | 'FAIL'>('FAIL');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [viewingProposal, setViewingProposal] = useState(false);
  // WALK-056: filter the side list by reference number or title.
  const [tenderFilter, setTenderFilter] = useState('');

  // ─── Fetch tenders in evaluation phase ──────────────────────────────────────
  useEffect(() => {
    async function fetchTenders() {
      setTendersLoading(true);
      try {
        const token = getAccessToken();
        // BUG-075 (2026-06-01): keep only tenders currently in evaluation. Owner
        // directive: "once evaluation is completed then remove it from Technical
        // Evaluation, because tender will appear in Technical Comparison which is
        // what we need." Supersedes the WALK-054 revisit-read-only behaviour.
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

  // ─── Fetch bids + existing evaluations + per-tender criteria ─────────────
  const fetchTenderData = useCallback(async (tenderId: string) => {
    setBidsLoading(true);
    setBids([]);
    setEvaluations([]);
    setSelectedBidId(null);
    try {
      const token = getAccessToken();
      // GAP: GET /tenders/{tenderId}/bids not yet in OpenAPI contract.
      // Calling it speculatively; falls back to empty list.
      const [bidsRes, evalsRes, criteriaRes] = await Promise.all([
        get<TenderBidsResponse>(`/tenders/${tenderId}/bids?pageSize=100`, token).catch(
          () => ({ items: [], total: 0 } as TenderBidsResponse),
        ),
        get<{ items: TechnicalEvaluation[] }>(
          `/tenders/${tenderId}/technical-evaluations`,
          token,
        ).catch(() => ({ items: [] })),
        get<TenderCriterion[]>(`/tenders/${tenderId}/criteria`, token).catch(() => [] as TenderCriterion[]),
      ]);
      setBids(bidsRes.items ?? []);
      setEvaluations(evalsRes.items ?? []);
      // Phase F (BUG-044): hydrate the scorecard from per-tender criteria when
      // configured. Fall back to DEFAULT_CRITERIA for pre-Phase-F tenders.
      if (Array.isArray(criteriaRes) && criteriaRes.length > 0) {
        setTenderCriteria(criteriaRes.map(c => ({
          criterion: c.name,
          description: c.description ?? '',
          maxScore: c.maxScore,
          // Fall back to maxScore if weight wasn't configured — keeps the
          // backend per-criterion weighted-average meaningful.
          weight: c.weight ?? c.maxScore,
        })));
      } else {
        setTenderCriteria(DEFAULT_CRITERIA);
      }
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

  // BUG-057 / WALK-026: hydrate the scorecard from the caller's saved
  // evaluation for this bid. If no saved row exists for this evaluator, fall
  // back to a blank scorecard. Hydration only fires when the bid OR the
  // tender criteria OR the evaluation list changes.
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  // BUG-074: also surface the JWT username so the scorecard can show
  // "Evaluating as: <name>" above the form. JWT payload puts adUsername (or
  // email fallback) in `username` — good-enough identity for the active form.
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(undefined);
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload)) as { sub?: string; username?: string };
      setCurrentUserId(decoded?.sub);
      setCurrentUsername(decoded?.username);
    } catch {
      setCurrentUserId(undefined);
      setCurrentUsername(undefined);
    }
  }, []);

  // BUG-057 / WALK-025: lets us auto-flip the recommendation pill to PASS
  // when the overall score crosses ≥70 — but only until the evaluator has
  // manually picked a side, at which point we leave their choice alone.
  const [recommendationDirty, setRecommendationDirty] = useState(false);

  useEffect(() => {
    const own = currentUserId
      ? evaluations.find(e => e.bidId === selectedBidId && e.evaluatorUserId === currentUserId)
      : undefined;
    if (own && own.criterionScores && own.criterionScores.length > 0) {
      // Hydrate criteria by matching saved rows to the current template by
      // criterion name. Saved scores are normalised 0–100; the form input is
      // an absolute number in 0..maxScore so convert back.
      const tmpl = emptyCriteria(tenderCriteria);
      const hydrated = tmpl.map(c => {
        const saved = own.criterionScores!.find(s => s.criterion === c.criterion);
        if (!saved) return c;
        const absScore = Math.round((saved.score / 100) * c.maxScore * 100) / 100;
        return { ...c, score: absScore, passed: absScore >= c.maxScore * 0.7 };
      });
      setCriteria(hydrated);
      setRecommendation(own.result === 'PASS' ? 'PASS' : 'FAIL');
      // Strip the "Recommendation: …" prefix added by save (it duplicates the toggle state).
      const rawNotes = own.comments ?? '';
      const stripped = rawNotes
        .replace(/^Recommendation:\s*(PASS|FAIL)\s*\n?/, '')
        .replace(/^Evaluator notes:\s*/, '');
      setNotes(stripped);
      setRecommendationDirty(true);
    } else {
      setCriteria(emptyCriteria(tenderCriteria));
      setRecommendation('FAIL');
      setNotes('');
      setRecommendationDirty(false);
    }
    setSubmitError(null);
  }, [selectedBidId, tenderCriteria, evaluations, currentUserId]);

  // BUG-057 / WALK-025: auto-flip recommendation to PASS once the running
  // total crosses ≥70. Stops once the evaluator has manually touched the
  // toggle so we never overwrite an explicit choice.
  function setRecommendationManual(next: 'PASS' | 'FAIL') {
    setRecommendation(next);
    setRecommendationDirty(true);
  }

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

  // BUG-057 / WALK-025: auto-flip the Pass toggle to PASS once the total
  // score crosses ≥70 (normalised to a 0–100 percentage of maxTotal). Only
  // fires until the evaluator explicitly clicks Pass or Fail.
  useEffect(() => {
    if (recommendationDirty) return;
    if (maxTotal <= 0) return;
    const pct = (totalScore / maxTotal) * 100;
    if (pct >= PASS_THRESHOLD && recommendation !== 'PASS') {
      setRecommendation('PASS');
    } else if (pct < PASS_THRESHOLD && recommendation !== 'FAIL') {
      setRecommendation('FAIL');
    }
  }, [totalScore, maxTotal, recommendation, recommendationDirty]);

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
      // Phase B: send per-criterion rows so the Technical Comparison matrix can
      // render vendor×criterion consensus. Backend stores each row in
      // technical_evaluation_scores and computes the weighted overall score.
      const criterionScores = criteria.map(c => ({
        criterion: c.criterion,
        weight: c.weight,
        // Normalise per-criterion score to a 0–100 scale (input is `score/maxScore`).
        score: typeof c.score === 'number' && c.maxScore > 0
          ? Math.round((c.score / c.maxScore) * 100 * 100) / 100
          : 0,
      }));
      const fullNotes = [
        `Recommendation: ${recommendation}`,
        notes ? `Evaluator notes: ${notes}` : '',
      ].filter(Boolean).join('\n');
      await post(
        `/bids/${selectedBid.id}/technical-evaluations`,
        {
          criterionScores,
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
    const ok = await confirm({
      title: 'Finalize technical results',
      body: 'Finalize technical results? Only PASSED vendors proceed to commercial.',
      destructive: true,
      confirmLabel: 'Finalize',
    });
    if (!ok) return;
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
          <div className="p-4 border-b border-border bg-card space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Tenders Under Evaluation
            </p>
            <p className="text-xs text-text-secondary">
              {tenders.filter(t => !PAST_SET.has(t.status)).length} active · {tenders.filter(t => PAST_SET.has(t.status)).length} past
            </p>
            {/* WALK-056: search box so the Past evaluations list stays
                navigable once dozens of finalised tenders accumulate. */}
            <input
              type="text"
              value={tenderFilter}
              onChange={e => setTenderFilter(e.target.value)}
              placeholder="Filter by reference or title…"
              className="w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            />
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
              (() => {
                const q = tenderFilter.trim().toLowerCase();
                const matches = q
                  ? tenders.filter(t =>
                      t.referenceNumber.toLowerCase().includes(q) ||
                      t.title.toLowerCase().includes(q),
                    )
                  : tenders;
                const active = matches.filter(t => !PAST_SET.has(t.status));
                const past = matches.filter(t => PAST_SET.has(t.status));
                const renderItem = (t: TenderSummary, isPast: boolean) => {
                  const isSelected = t.id === selectedTenderId;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTenderId(t.id)}
                      className={`p-4 border-b border-border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-card border-l-4 border-l-accent shadow-sm'
                          : 'border-l-4 border-l-transparent hover:bg-card/70'
                      } ${isPast ? 'opacity-75' : ''}`}
                    >
                      <p className={`text-xs font-bold mb-1 ${isSelected ? 'text-accent' : 'text-text-secondary'}`}>
                        {t.referenceNumber}
                      </p>
                      <p className={`text-sm font-semibold leading-snug mb-1.5 ${
                        isSelected ? 'text-text-primary' : 'text-text-secondary'
                      }`}>
                        {t.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isPast
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {t.status}
                        </span>
                        {isPast && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                            View only
                          </span>
                        )}
                      </div>
                    </div>
                  );
                };
                return (
                  <>
                    {active.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-bg/60 border-b border-border text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                          Active
                        </div>
                        {active.map(t => renderItem(t, false))}
                      </>
                    )}
                    {past.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-bg/60 border-b border-border text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                          Past evaluations (view only)
                        </div>
                        {past.map(t => renderItem(t, true))}
                      </>
                    )}
                  </>
                );
              })()
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
                    {/* BUG-057 / WALK-028: progress indicator per bid. */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {existing ? (
                        <>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-success/15 text-success">
                            Evaluated
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            existing.result === 'PASS'
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          }`}>
                            {existing.result ?? 'PENDING'}
                          </span>
                          {typeof existing.score === 'number' && (
                            <span className="text-[11px] text-text-secondary font-mono">
                              {existing.score}/{maxTotal}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      )}
                    </div>
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

              {/* BUG-057 / WALK-027: post-finalize summary banner. Shown when the
                  tender has moved past Technical Evaluation, with the per-vendor
                  PASS/FAIL outcome list. Lifts the "what was decided" answer to
                  the top instead of leaving the page looking like it's mid-work. */}
              {PAST_SET.has(selectedTender.status) && (
                <FinalisedSummaryBanner bids={bids} evaluations={evaluations} maxTotal={maxTotal} />
              )}

              {/* BUG-074: identify the active evaluator above the scorecard so
                   committee/audit can see who's filling in scores at a glance. */}
              {!PAST_SET.has(selectedTender.status) && currentUsername && (
                <div className="mb-4 bg-accent/5 border border-accent/30 rounded-xl px-5 py-3 flex items-center gap-3">
                  <PenLine className="w-4 h-4 text-accent" />
                  <p className="text-sm text-text-primary">
                    <span className="text-text-secondary">Evaluating as:</span>{' '}
                    <span className="font-bold">{currentUsername}</span>
                  </p>
                </div>
              )}

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
                        onClick={() => setRecommendationManual('FAIL')}
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
                        onClick={() => setRecommendationManual('PASS')}
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
                {selectedTender && PAST_SET.has(selectedTender.status) ? (
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-700">
                    <p className="font-semibold">Technical evaluation finalised</p>
                    <p className="text-xs mt-0.5">
                      This tender has moved past the technical evaluation phase ({selectedTender.status}). The scorecard is view-only; saved scores remain accessible for reference.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleSaveEvaluation}
                    disabled={submitting}
                    className="w-full bg-accent hover:bg-accent-hover text-white rounded-xl shadow-md font-bold text-base px-6 py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    {submitting ? 'Saving…' : 'Save Evaluation'}
                  </button>
                )}
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

              {/* Finalize — hidden when the tender has already moved past
                  technical evaluation (WALK-054 view-only mode).
                  BUG-073 (2026-06-01): button is disabled until every bid has
                  at least one evaluation row. Tooltip names the unevaluated
                  vendors so the evaluator knows where to go next. Owner finalized
                  a tender with one vendor un-evaluated → locked the tender from
                  edit; this gate prevents the same trap. */}
              {selectedTender && !PAST_SET.has(selectedTender.status) && (() => {
                const evaluatedBidIds = new Set(evaluations.map(e => e.bidId));
                const unevaluatedBids = bids.filter(b => !evaluatedBidIds.has(b.id));
                const blockedReason = bids.length === 0
                  ? 'No bids submitted yet.'
                  : unevaluatedBids.length > 0
                    ? `Cannot finalize — un-evaluated: ${unevaluatedBids.map(b => b.vendorCompany).join(', ')}.`
                    : null;
                return (
                  <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-sm font-bold text-text-primary">Finalize Technical Results</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Lock all scorecards for this tender. Only PASSED vendors proceed to commercial comparison.
                      </p>
                      {blockedReason && (
                        <p className="text-xs text-danger mt-1 font-semibold">{blockedReason}</p>
                      )}
                    </div>
                    <button
                      onClick={handleFinalize}
                      disabled={finalizing || blockedReason !== null}
                      title={blockedReason ?? 'Finalize technical results'}
                      className="px-5 py-2.5 bg-text-primary text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Lock className="w-[18px] h-[18px]" />
                      {finalizing ? 'Finalizing…' : 'Finalize'}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// BUG-057 / WALK-027: post-finalize summary block. Shown at the top of the
// scorecard column when the tender has moved past Technical Evaluation, so the
// engineer landing on the page sees "this is what was decided" instead of
// reading an empty action card.
function FinalisedSummaryBanner({
  bids,
  evaluations,
  maxTotal,
}: {
  bids: BidSummary[];
  evaluations: TechnicalEvaluation[];
  maxTotal: number;
}) {
  // Group evaluations by bid; pick the latest finalizedAt (or updatedAt) per bid
  // so the timestamp shown is the most recent meaningful action.
  let latestFinalisedAt: string | undefined;
  const perBid = new Map<string, TechnicalEvaluation[]>();
  for (const e of evaluations) {
    perBid.set(e.bidId, [...(perBid.get(e.bidId) ?? []), e]);
    const t = e.finalizedAt ?? e.updatedAt;
    if (t && (!latestFinalisedAt || t > latestFinalisedAt)) latestFinalisedAt = t;
  }

  return (
    <div className="bg-card border border-success/40 rounded-xl overflow-hidden mb-5 shadow-sm">
      <div className="bg-success/10 px-5 py-3 border-b border-success/20 flex items-center gap-2">
        <Lock className="w-4 h-4 text-success" />
        <p className="text-xs uppercase tracking-wider font-bold text-success">Finalised</p>
        {latestFinalisedAt && (
          <p className="text-xs text-text-secondary ml-auto">
            {new Date(latestFinalisedAt).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-text-primary font-semibold mb-3">
          Technical evaluation outcome
        </p>
        <div className="space-y-1.5">
          {bids.map(b => {
            const evals = perBid.get(b.id) ?? [];
            const pass = evals.filter(e => e.result === 'PASS').length;
            const fail = evals.filter(e => e.result === 'FAIL').length;
            const finalResult = evals.length === 0
              ? 'No evaluations'
              : pass * 2 >= evals.length ? 'PASS' : 'FAIL';
            return (
              <div key={b.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                <p className="text-sm text-text-primary truncate">{b.vendorCompany}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {evals.length > 0 && (
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                      {pass} pass · {fail} fail
                    </span>
                  )}
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    finalResult === 'PASS'
                      ? 'bg-success/15 text-success'
                      : finalResult === 'FAIL'
                        ? 'bg-danger/15 text-danger'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {finalResult}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-text-secondary italic mt-3">
          Scorecards below remain accessible for reference. The decision was locked at finalize and cannot be edited from this page.
          {' '}Per-vendor consensus uses majority of evaluator PASS results — see Technical Comparison for the matrix view.
        </p>
      </div>
    </div>
  );
}
