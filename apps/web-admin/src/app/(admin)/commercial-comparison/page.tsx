'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeftRight,
  Award,
  ChevronRight,
  Eye,
  Loader2,
  Lock,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CommercialMatrix, type CommercialMatrixVendor } from '@/components/comparison/CommercialMatrix';
import { VendorComparisonCard, type CardVendor } from '@/components/comparison/VendorComparisonCard';
import { AwardConfirmDialog } from '@/components/comparison/AwardConfirmDialog';
import { QuorumStatus, type QuorumState } from '@/components/comparison/QuorumStatus';

interface TenderListItem {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
}

interface PaginatedTenders {
  data: TenderListItem[];
}

interface CommercialComparisonResponse {
  tender: {
    id: string;
    referenceNumber: string;
    title: string;
    status: string;
    departmentName: string | null;
    departmentCode: string | null;
    currency: string;
    estimatedBudget: number | null;
  };
  summary: {
    bidCount: number;
    passCount: number;
    failCount: number;
    pendingCount: number;
    priceCount: number;
    auditViewCount: number;
  };
  lowestPassBidId: string | null;
  vendors: CardVendor[];
}

const ELIGIBLE_STATUSES = [
  'Committee Commercial Opening',
  'Commercial Evaluation / Comparison',
  'Award Recommendation',
  'Awarded',
  'Tender Closed',
];

function NoAccessScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 gap-4 text-center max-w-md mx-auto">
      <Lock className="w-[72px] h-[72px] text-text-secondary/30" />
      <h1 className="text-xl font-bold text-text-primary">Commercial Access Required</h1>
      <p className="text-sm text-text-secondary">
        Commercial Comparison requires the{' '}
        <code className="bg-bg px-1.5 py-0.5 rounded text-xs">comparison:commercial:view</code>{' '}
        permission. System Administrators do not receive this automatically (separation of duties).
        Request access from your department head.
      </p>
      <Link href="/dashboard" className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
        Back to Dashboard
      </Link>
    </div>
  );
}

function CommercialComparisonContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenderIdFromUrl = searchParams.get('tenderId');

  const [permissionChecked, setPermissionChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  const [tenders, setTenders] = useState<TenderListItem[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(tenderIdFromUrl);
  const [comparison, setComparison] = useState<CommercialComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ bidId: string; isLowestPass: boolean } | null>(null);
  const [quorum, setQuorum] = useState<QuorumState | null>(null);

  // Permission check up front. Component also gates server-side via the
  // endpoint's `comparison:commercial:view` guard — defense in depth.
  useEffect(() => {
    const token = getAccessToken();
    // Accept both the new permission and the legacy `commercial:view`
    // until all roles are migrated; the endpoint enforces the canonical one.
    const ok = !!token && (
      hasPermission(token, 'comparison:commercial:view') ||
      hasPermission(token, 'commercial:view')
    );
    setCanView(ok);
    setPermissionChecked(true);
  }, []);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    (async () => {
      setTendersLoading(true);
      const token = getAccessToken();
      try {
        const results = await Promise.all(
          ELIGIBLE_STATUSES.map(status =>
            get<PaginatedTenders>(`/tenders?status=${encodeURIComponent(status)}&pageSize=50`, token)
              .catch(() => ({ data: [] }) as PaginatedTenders),
          ),
        );
        if (cancelled) return;
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (!selectedTenderId && merged.length > 0) setSelectedTenderId(merged[0].id);
      } finally {
        if (!cancelled) setTendersLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const loadComparison = useCallback(async (tenderId: string) => {
    setLoading(true);
    setError(null);
    setComparison(null);
    try {
      const token = getAccessToken();
      const res = await get<CommercialComparisonResponse>(
        `/tenders/${tenderId}/comparison/commercial`,
        token,
      );
      setComparison(res);
      // Pre-select lowest PASS per master-plan F1.
      if (res.lowestPassBidId) {
        setSelectedBidId(res.lowestPassBidId);
      } else if (res.vendors.length > 0) {
        setSelectedBidId(res.vendors[0].bidId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commercial comparison');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTenderId) return;
    loadComparison(selectedTenderId);
    const url = new URL(window.location.href);
    url.searchParams.set('tenderId', selectedTenderId);
    router.replace(`?${url.searchParams.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenderId]);

  function handleSelectBid(bidId: string) {
    setSelectedBidId(bidId);
    setTimeout(() => {
      const el = document.getElementById(`commercial-vendor-${comparison?.vendors.find(v => v.bidId === bidId)?.vendorId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  // Phase D: the Recommend button on each card opens the AwardConfirmDialog
  // — that dialog handles quorum gating, PDF upload, notification opt-ins.
  function handleRecommend(bidId: string, isLowestPass: boolean) {
    setConfirmTarget({ bidId, isLowestPass });
  }

  function handleConfirmed() {
    setConfirmTarget(null);
    if (selectedTenderId) loadComparison(selectedTenderId);
  }

  const matrixVendors = useMemo<CommercialMatrixVendor[]>(
    () =>
      comparison?.vendors.map(v => ({
        bidId: v.bidId,
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        technicalResult: v.technicalResult,
        technicalScore: v.technicalScore,
        technicalMaxScore: v.technicalMaxScore,
        commercialTotal: v.commercialTotal,
        currency: v.currency,
        commercialEnvelopeStatus: v.commercialEnvelopeStatus,
      })) ?? [],
    [comparison],
  );

  if (!permissionChecked) return null;
  if (!canView) return <NoAccessScreen />;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Link href="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">Commercial Comparison</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-accent" />
            Commercial Comparison
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            In-app comparison surface. Lowest-PASS vendor auto-selected. Override requires written
            justification (and, from Phase D, an attached PDF).
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
            No tenders are in Committee Commercial Opening or later yet. Open commercial envelopes
            from the Committee &amp; Commercial page first.
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
              The endpoint refuses access until the committee has opened at least one commercial
              envelope.
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-card border border-border rounded-xl px-6 py-10 text-center">
          <Loader2 className="w-6 h-6 text-text-secondary animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Aggregating commercial offers…</p>
        </div>
      )}

      {comparison && !loading && (
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
                {' '}{comparison.summary.priceCount} with price
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <QuorumStatus tenderId={comparison.tender.id} onLoaded={setQuorum} />
              <Link
                href={`/audit-log?tenderId=${comparison.tender.id}`}
                className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
                title="View full audit trail for this tender"
              >
                <Eye className="w-3.5 h-3.5" />
                {comparison.summary.auditViewCount} views logged
              </Link>
              <Link
                href={`/technical-comparison?tenderId=${comparison.tender.id}`}
                className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5" />
                Technical Comparison
              </Link>
            </div>
          </div>

          {/* Matrix top */}
          <CommercialMatrix
            vendors={matrixVendors}
            lowestPassBidId={comparison.lowestPassBidId}
            selectedBidId={selectedBidId}
            onSelect={handleSelectBid}
          />

          {/* Per-vendor cards */}
          {comparison.vendors.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary">
                Per-vendor detail
              </h3>
              {comparison.vendors.map(v => (
                <VendorComparisonCard
                  key={v.bidId}
                  vendor={v}
                  tenderId={comparison.tender.id}
                  isLowestPass={v.bidId === comparison.lowestPassBidId}
                  initialExpanded={v.bidId === selectedBidId}
                  selected={v.bidId === selectedBidId}
                  onRecommend={handleRecommend}
                />
              ))}
            </section>
          )}

          {/* Audit notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-xs text-amber-900">
            <p className="font-bold mb-1">Sensitive commercial data</p>
            <p>
              Every page view, document open and award action is audit-logged. Commercial details
              are visible only because your role has{' '}
              <code className="bg-amber-100 px-1 rounded">comparison:commercial:view</code>{' '}
              AND the committee has opened the envelopes. System Administrators do not receive
              this access automatically.
            </p>
          </div>

          <AwardConfirmDialog
            open={!!confirmTarget}
            tenderId={comparison.tender.id}
            vendor={
              confirmTarget
                ? (() => {
                    const v = comparison.vendors.find(x => x.bidId === confirmTarget.bidId);
                    return v
                      ? {
                          bidId: v.bidId,
                          vendorId: v.vendorId,
                          vendorName: v.vendorName,
                          commercialTotal: v.commercialTotal,
                          currency: v.currency,
                        }
                      : null;
                  })()
                : null
            }
            isLowestPass={confirmTarget?.isLowestPass ?? false}
            quorum={quorum}
            onClose={() => setConfirmTarget(null)}
            onConfirmed={handleConfirmed}
          />
        </div>
      )}
    </div>
  );
}

export default function CommercialComparisonPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card border border-border rounded-xl px-6 py-10 text-center">
          <Loader2 className="w-6 h-6 text-text-secondary animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Loading…</p>
        </div>
      }
    >
      <CommercialComparisonContent />
    </Suspense>
  );
}
