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
import { AwardSummaryCard, type AwardSummary } from '@/components/comparison/AwardSummaryCard';
import { QuorumStatus, type QuorumState } from '@/components/comparison/QuorumStatus';
import { LaunchNegotiationDialog } from '@/components/comparison/LaunchNegotiationDialog';

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
  award: AwardSummary | null;
  // BUG-068 / Phase F BOQ: real template rows (placeholder filtered server-side).
  // Empty when tender has no BOQ — Itemized view + per-vendor BOQ block are
  // hidden, manual-entry CommercialTotalBlock (BUG-053) stays as the fallback.
  boqTemplate: Array<{
    id: string;
    itemNo: string;
    description: string;
    qty: number;
    unit: string;
  }>;
}

// BUG-090 (2026-06-02): WALK-051's "Active / Completed" optgroup split is
// retired. Awarded / Tender Closed tenders now live in the dedicated
// /awarded-tenders archive page; this picker only shows tenders that still
// have live commercial work to do. Owner reported the Completed group as
// clutter during routine evaluation work.
const ELIGIBLE_STATUSES = [
  'Committee Commercial Opening',
  'Commercial Evaluation / Comparison',
  // BUG-115 (2026-06-09): Negotiation phase keeps tenders visible on this page.
  'Negotiation',
  'Award Recommendation',
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
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [canGenerateMinutes, setCanGenerateMinutes] = useState(false);
  // BUG-115 (2026-06-09): negotiation:launch perm gates the Negotiate button.
  const [canLaunchNegotiation, setCanLaunchNegotiation] = useState(false);
  const [negotiationDialogOpen, setNegotiationDialogOpen] = useState(false);
  // WALK-056: text filter so the Completed group stays navigable.
  const [tenderFilter, setTenderFilter] = useState('');

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
    // BUG-053: surfaces inline price-entry on each VendorComparisonCard when true.
    setCanEvaluate(!!token && hasPermission(token, 'commercial:evaluate'));
    // BUG-054: surfaces the AwardSummaryCard's Generate/Regenerate Minutes button.
    setCanGenerateMinutes(!!token && hasPermission(token, 'award:minutes:generate'));
    // BUG-115 (2026-06-09): negotiation launch.
    setCanLaunchNegotiation(!!token && hasPermission(token, 'negotiation:launch'));
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

  // BUG-130 (2026-06-12): build N+1 matrix sections — one "Original" + one
  // per submitted negotiation round. Each section has its own vendor list,
  // its own lowest-PASS, and its own boqLines for the Itemized view. The
  // PROJECT spec is "exclude non-participants from a round's matrix" so
  // round sections only show vendors that actually submitted that round.
  //
  // Each vendor's `boqLines` for the round is materialised from the negotiation
  // submission's per-line entries; lineTotal is recomputed from the BOQ
  // template qty (the response only carries unitPrice — line totals are
  // intentionally derived to avoid double-storage).
  const matrixSections = useMemo<Array<{
    key: string;
    kind: 'original' | 'round';
    roundNumber?: number;
    submittedAt?: string;
    label: string;
    subtitle: string | null;
    vendors: CommercialMatrixVendor[];
    lowestPassBidId: string | null;
  }>>(() => {
    if (!comparison) return [];
    const allVendors = comparison.vendors ?? [];
    const boqTemplate = comparison.boqTemplate ?? [];
    const qtyByItemId = new Map(boqTemplate.map(t => [t.id, Number(t.qty)]));

    function computeLowestPass(vendors: CommercialMatrixVendor[]): string | null {
      const pass = vendors
        .filter(v => v.technicalResult === 'PASS' && v.commercialTotal != null)
        .sort((a, b) => (a.commercialTotal ?? Infinity) - (b.commercialTotal ?? Infinity));
      return pass.length > 0 ? pass[0].bidId : null;
    }

    // Original section — always present. Uses originalCommercialTotal +
    // the original boqLines (pre-negotiation).
    const originalVendors: CommercialMatrixVendor[] = allVendors.map(v => ({
      bidId: v.bidId,
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      technicalResult: v.technicalResult,
      technicalScore: v.technicalScore,
      technicalMaxScore: v.technicalMaxScore,
      commercialTotal: (v as any).originalCommercialTotal ?? v.commercialTotal,
      currency: v.currency,
      commercialEnvelopeStatus: v.commercialEnvelopeStatus,
      boqLines: v.boqLines,
    }));

    const sections: Array<{
      key: string;
      kind: 'original' | 'round';
      roundNumber?: number;
      submittedAt?: string;
      label: string;
      subtitle: string | null;
      vendors: CommercialMatrixVendor[];
      lowestPassBidId: string | null;
    }> = [
      {
        key: 'original',
        kind: 'original',
        label: 'Original Commercial Comparison',
        subtitle: 'Pre-negotiation prices as submitted.',
        vendors: originalVendors,
        lowestPassBidId: computeLowestPass(originalVendors),
      },
    ];

    // Per-round sections — derive distinct round numbers across all vendors.
    const allRoundNumbers = Array.from(
      new Set(
        allVendors.flatMap(v =>
          (v.negotiationHistory ?? []).map(h => h.roundNumber),
        ),
      ),
    ).sort((a, b) => a - b);

    for (const roundNumber of allRoundNumbers) {
      // Each round shows ONLY vendors who submitted that round.
      const roundVendors: CommercialMatrixVendor[] = [];
      let submittedAt: string | undefined;
      for (const v of allVendors) {
        const entry = (v.negotiationHistory ?? []).find(h => h.roundNumber === roundNumber);
        if (!entry) continue; // exclude non-participants (owner directive)
        if (!submittedAt) submittedAt = entry.submittedAt;
        // Materialise boqLines for the round with derived lineTotal.
        const lines = (entry.boqLines ?? []).map(l => ({
          tenderBoqItemId: l.tenderBoqItemId,
          status: l.status,
          unitPrice: l.unitPrice,
          lineTotal:
            l.status === 'BIDDING' && l.unitPrice != null
              ? Number(l.unitPrice) * (qtyByItemId.get(l.tenderBoqItemId) ?? 0)
              : null,
        }));
        roundVendors.push({
          bidId: v.bidId,
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          technicalResult: v.technicalResult,
          technicalScore: v.technicalScore,
          technicalMaxScore: v.technicalMaxScore,
          commercialTotal: entry.totalPrice,
          currency: entry.currency ?? v.currency,
          commercialEnvelopeStatus: v.commercialEnvelopeStatus,
          boqLines: lines,
        });
      }
      if (roundVendors.length === 0) continue;
      sections.push({
        key: `round-${roundNumber}`,
        kind: 'round',
        roundNumber,
        submittedAt,
        label: `Negotiated Commercial Comparison — Round ${roundNumber}`,
        subtitle: submittedAt
          ? `${roundVendors.length} vendor${roundVendors.length === 1 ? '' : 's'} submitted from ${new Date(submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : `${roundVendors.length} vendor${roundVendors.length === 1 ? '' : 's'} submitted`,
        vendors: roundVendors,
        lowestPassBidId: computeLowestPass(roundVendors),
      });
    }

    return sections;
  }, [comparison]);

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
          <>
          {/* WALK-056: filter input above the picker. */}
          <input
            type="text"
            value={tenderFilter}
            onChange={e => setTenderFilter(e.target.value)}
            placeholder="Filter by reference or title…"
            className="w-full mb-2 px-3 py-2 text-xs border border-border rounded-md bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <select
            value={selectedTenderId ?? ''}
            onChange={e => setSelectedTenderId(e.target.value || null)}
            className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select a tender…</option>
            {(() => {
              const q = tenderFilter.trim().toLowerCase();
              const matches = q
                ? tenders.filter(t =>
                    t.referenceNumber.toLowerCase().includes(q) ||
                    t.title.toLowerCase().includes(q),
                  )
                : tenders;
              return (
                <>
                  {matches.length > 0 && (
                    <optgroup label="Active">
                      {matches.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.referenceNumber} — {t.title} ({t.status})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
          </>
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

          {/* BUG-054 / WALK-050: Award Summary surfaces at top when the tender
              is Awarded. Per-vendor comparison collapses below into an
              audit-reference expander so the page reads "this tender is
              decided" instead of looking like a live comparison. */}
          {comparison.award && (
            <AwardSummaryCard
              award={comparison.award}
              tenderId={comparison.tender.id}
              tenderReference={comparison.tender.referenceNumber}
              canGenerateMinutes={canGenerateMinutes}
            />
          )}

          {/* BUG-115 (2026-06-09): negotiation banner + Negotiate launch button. */}
          {!comparison.award && canLaunchNegotiation && (
            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <div className="text-sm text-amber-900">
                {comparison.tender.status === 'Negotiation' ? (
                  <>
                    <span className="font-semibold">Negotiation in progress.</span>{' '}
                    {comparison.vendors.some((v: any) => v.hasOpenNegotiationInvitation) ? (
                      <>
                        Vendors with an open invitation will appear with a "Negotiation pending" tag.
                        Launch another round when you want to push selected vendors further.
                      </>
                    ) : (
                      <>All invited vendors have submitted. Review their stacked prices below, then launch another round or confirm an award.</>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Negotiate</span> to invite selected PASS vendors for a revised price. Original prices are preserved forever.
                  </>
                )}
              </div>
              <button
                onClick={() => setNegotiationDialogOpen(true)}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:opacity-90 whitespace-nowrap"
              >
                {comparison.tender.status === 'Negotiation' ? 'Launch another round' : 'Negotiate'}
              </button>
            </div>
          )}

          {/* BUG-098 (2026-06-03, supersedes BUG-097 standalone tech matrix):
               Commercial matrix stays, standalone Technical matrix removed.
               Per-vendor tech breakdown lives inside each vendor card and
               shows only that vendor's criterion scores.

               BUG-130 (2026-06-12): single matrix split into N+1 sections —
               always-present Original + one per submitted negotiation round.
               Each section has its own lowest-PASS scoped to participants. */}
          <div className="space-y-6">
            {matrixSections.map(section => (
              <div key={section.key} className="space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h2
                    className={
                      section.kind === 'original'
                        ? 'text-sm font-bold uppercase tracking-wide text-text-secondary'
                        : 'text-sm font-bold uppercase tracking-wide text-amber-700'
                    }
                  >
                    {section.label}
                  </h2>
                  {section.subtitle && (
                    <span className="text-xs text-text-secondary">{section.subtitle}</span>
                  )}
                </div>
                <CommercialMatrix
                  vendors={section.vendors}
                  lowestPassBidId={section.lowestPassBidId}
                  selectedBidId={selectedBidId}
                  onSelect={handleSelectBid}
                  boqTemplate={comparison.boqTemplate}
                />
              </div>
            ))}
          </div>

          {comparison.award ? (
            <details className="bg-card border border-border rounded-xl" open>
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-text-primary hover:bg-bg/40 select-none">
                Per-vendor detail (audit reference)
              </summary>
              <div className="px-5 py-4 border-t border-border space-y-4">
                {comparison.vendors.length > 0 && (
                  <section className="space-y-3">
                    {comparison.vendors.map(v => (
                      <VendorComparisonCard
                        key={v.bidId}
                        vendor={v}
                        tenderId={comparison.tender.id}
                        tenderCurrency={comparison.tender.currency}
                        isLowestPass={v.bidId === comparison.lowestPassBidId}
                        initialExpanded={false}
                        selected={false}
                        canEvaluate={false}
                        onRecommend={handleRecommend}
                        boqTemplate={comparison.boqTemplate}
                      />
                    ))}
                  </section>
                )}
              </div>
            </details>
          ) : (
            <>
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
                      tenderCurrency={comparison.tender.currency}
                      isLowestPass={v.bidId === comparison.lowestPassBidId}
                      initialExpanded={v.bidId === selectedBidId}
                      selected={v.bidId === selectedBidId}
                      canEvaluate={canEvaluate}
                      onRecommend={handleRecommend}
                      onPriceSaved={() => selectedTenderId && loadComparison(selectedTenderId)}
                      boqTemplate={comparison.boqTemplate}
                    />
                  ))}
                </section>
              )}
            </>
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

          {/* BUG-115 (2026-06-09): launch a negotiation round. */}
          <LaunchNegotiationDialog
            open={negotiationDialogOpen}
            tenderId={comparison.tender.id}
            tenderReference={comparison.tender.referenceNumber}
            passVendors={comparison.vendors
              .filter((v: any) => v.technicalResult === 'PASS')
              .map((v: any) => ({
                bidId: v.bidId,
                vendorName: v.vendorName,
                commercialTotal: v.commercialTotal,
                currency: v.currency,
                lowestPass: v.bidId === comparison.lowestPassBidId,
              }))}
            onClose={() => setNegotiationDialogOpen(false)}
            onLaunched={() => {
              setNegotiationDialogOpen(false);
              if (selectedTenderId) loadComparison(selectedTenderId);
            }}
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
