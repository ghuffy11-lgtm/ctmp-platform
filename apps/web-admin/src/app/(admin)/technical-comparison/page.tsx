'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, BarChart3, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TechnicalMatrix, type MatrixCriterion, type MatrixVendor } from '@/components/comparison/TechnicalMatrix';
import { VendorTechnicalCard, type ComparisonCriterion, type ComparisonVendor } from '@/components/comparison/VendorTechnicalCard';

interface TenderListItem {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  departmentName: string;
}

interface PaginatedTenders {
  data: TenderListItem[];
}

interface ComparisonResponse {
  tender: {
    id: string;
    referenceNumber: string;
    title: string;
    status: string;
    departmentName: string | null;
    departmentCode: string | null;
    technicalPassThreshold: number | null;
  };
  criteria: ComparisonCriterion[];
  totalMaxScore: number;
  summary: {
    bidCount: number;
    passCount: number;
    failCount: number;
    pendingCount: number;
    evaluatorTotal: number;
  };
  vendors: ComparisonVendor[];
}

// Tenders where Technical Comparison is useful — from Technical Opening onwards.
const ELIGIBLE_STATUSES = [
  'Technical Opening',
  'Technical Evaluation',
  'Commercial Sealed',
  'Committee Commercial Opening',
  'Commercial Evaluation / Comparison',
  'Award Recommendation',
  'Awarded',
  'Tender Closed',
];

function TechnicalComparisonContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenderIdFromUrl = searchParams.get('tenderId');

  const [tenders, setTenders] = useState<TenderListItem[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(tenderIdFromUrl);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTendersLoading(true);
      const token = getAccessToken();
      try {
        const results = await Promise.all(
          ELIGIBLE_STATUSES.map(status =>
            get<PaginatedTenders>(
              `/tenders?status=${encodeURIComponent(status)}&pageSize=50`,
              token,
            ).catch(() => ({ data: [] }) as PaginatedTenders),
          ),
        );
        if (cancelled) return;
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (!selectedTenderId && merged.length > 0) {
          setSelectedTenderId(merged[0].id);
        }
      } finally {
        if (!cancelled) setTendersLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadComparison = useCallback(async (tenderId: string) => {
    setComparisonLoading(true);
    setError(null);
    setComparison(null);
    try {
      const token = getAccessToken();
      const res = await get<ComparisonResponse>(`/tenders/${tenderId}/comparison/technical`, token);
      setComparison(res);
      if (res.vendors.length > 0 && !selectedVendorId) {
        setSelectedVendorId(res.vendors[0].vendorId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technical comparison');
    } finally {
      setComparisonLoading(false);
    }
  }, [selectedVendorId]);

  useEffect(() => {
    if (selectedTenderId) {
      loadComparison(selectedTenderId);
      // keep the URL in sync so deep-links work and the back button feels right
      const url = new URL(window.location.href);
      url.searchParams.set('tenderId', selectedTenderId);
      router.replace(`?${url.searchParams.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenderId]);

  const matrixCriteria = useMemo<MatrixCriterion[]>(
    () =>
      comparison?.criteria.map(c => ({
        id: c.id,
        name: c.name,
        maxScore: c.maxScore,
        weight: c.weight,
        mandatory: c.mandatory,
      })) ?? [],
    [comparison],
  );

  const matrixVendors = useMemo<MatrixVendor[]>(
    () =>
      comparison?.vendors.map(v => ({
        bidId: v.bidId,
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        consensusResult: v.consensusResult,
        consensusScore: v.consensusScore,
        consensusByCriterion: v.consensusByCriterion.map(c => ({
          criterionId: c.criterionId,
          consensusScore: c.consensusScore,
          evaluatorCount: c.evaluatorCount,
        })),
      })) ?? [],
    [comparison],
  );

  function handleSelectVendor(vendorId: string) {
    setSelectedVendorId(vendorId);
    setTimeout(() => {
      const el = document.getElementById(`vendor-${vendorId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Link href="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">Technical Comparison</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-accent" />
            Technical Comparison
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Read-only consolidated view of vendor technical evaluations. Scoring still happens on the
            Technical Evaluation page.
          </p>
        </div>
      </div>

      {/* Tender picker */}
      <div className="bg-card border border-border rounded-xl px-5 py-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
          Tender
        </label>
        {tendersLoading ? (
          <p className="text-sm text-text-secondary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading eligible tenders…
          </p>
        ) : tenders.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No tenders in Technical Opening or later. Open a tender to its technical phase first.
          </p>
        ) : (
          <select
            value={selectedTenderId ?? ''}
            onChange={e => setSelectedTenderId(e.target.value || null)}
            className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select a tender…</option>
            {tenders.map(t => (
              <option key={t.id} value={t.id}>
                {t.referenceNumber} — {t.title} ({t.status})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">{error}</p>
            <p className="text-xs text-text-secondary mt-1">
              Verify the tender has technical criteria configured and at least one bid + evaluation.
            </p>
          </div>
        </div>
      )}

      {comparisonLoading && (
        <div className="bg-card border border-border rounded-xl px-6 py-10 text-center">
          <Loader2 className="w-6 h-6 text-text-secondary animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Aggregating evaluations…</p>
        </div>
      )}

      {comparison && !comparisonLoading && (
        <div className="space-y-6">
          {/* Tender header */}
          <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <p className="text-xs font-mono text-text-secondary">{comparison.tender.referenceNumber}</p>
              <h2 className="text-lg font-bold text-text-primary truncate flex items-center gap-3 mt-0.5">
                {comparison.tender.title}
                <StatusBadge status={comparison.tender.status} />
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                {comparison.tender.departmentName ?? 'Department unset'} ·
                {' '}{comparison.summary.bidCount} bids ·
                {' '}{comparison.summary.passCount} PASS ·
                {' '}{comparison.summary.failCount} FAIL ·
                {' '}{comparison.summary.pendingCount} pending ·
                {' '}{comparison.summary.evaluatorTotal} evaluator-records
              </p>
            </div>
            {/* BUG-061 / WALK-033: "Score evaluations" link removed — owner
                considers it noise. Evaluators reach scoring via the sidebar. */}
          </div>

          {/* Matrix */}
          <TechnicalMatrix
            criteria={matrixCriteria}
            vendors={matrixVendors}
            totalMaxScore={comparison.totalMaxScore}
            passThreshold={comparison.tender.technicalPassThreshold}
            selectedVendorId={selectedVendorId}
            onSelectVendor={handleSelectVendor}
          />

          {/* Vendor cards */}
          {comparison.vendors.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
                Per-vendor detail
              </h3>
              {comparison.vendors.map(v => (
                <VendorTechnicalCard
                  key={v.bidId}
                  vendor={v}
                  criteria={comparison.criteria}
                  totalMaxScore={comparison.totalMaxScore}
                  initialExpanded={v.vendorId === selectedVendorId}
                  highlight={v.vendorId === selectedVendorId}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function TechnicalComparisonPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card border border-border rounded-xl px-6 py-10 text-center">
          <Loader2 className="w-6 h-6 text-text-secondary animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Loading…</p>
        </div>
      }
    >
      <TechnicalComparisonContent />
    </Suspense>
  );
}
