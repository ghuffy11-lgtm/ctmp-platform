import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenderStatus, VendorStatus, BidStatus, TechnicalResult } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// BUG-133 (2026-06-14): canonical DB-enum → API-label mapping. Mirrors the
// definition in comparison.service.ts. Used by listExecutiveTenders to render
// status as the same label the frontend already uses elsewhere.
const STATUS_DB_TO_API: Record<TenderStatus, string> = {
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal Review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CLARIFICATION_PERIOD: 'Clarification Period',
  SUBMISSION_CLOSED: 'Submission Closed',
  TECHNICAL_OPENING: 'Technical Opening',
  TECHNICAL_EVALUATION: 'Technical Evaluation',
  COMMERCIAL_SEALED: 'Commercial Sealed',
  COMMITTEE_COMMERCIAL_OPENING: 'Committee Commercial Opening',
  COMMERCIAL_EVALUATION: 'Commercial Evaluation / Comparison',
  NEGOTIATION: 'Negotiation',
  AWARD_RECOMMENDATION: 'Award Recommendation',
  AWARDED: 'Awarded',
  TENDER_CLOSED: 'Tender Closed',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

// BUG-086 Phase 1: executive analytics service.
//
// Aggregates over the existing tender / award fields. Everything is computed
// on-demand from raw rows — no materialised views, no cache. Staging volumes
// are small (tens of tenders); revisit caching in Phase 2 if the call gets hot.
//
// Currency: schema supports per-tender currency but staging is single-currency
// (KWD). Values are summed as-is; UI labels them KWD until multi-currency
// reporting is needed.

export interface KpiCard {
  label: string;
  // BUG-133 (2026-06-14): allow null so "Avg Days to Award" can render "—"
  // instead of "0 days" when no awarded tenders match.
  value: number | null;
  unit: 'count' | 'KWD' | 'days' | 'percent';
  /** Optional delta vs same period in the prior year (signed). */
  yoyDelta?: number | null;
  /** When the metric is a percentage, the absolute counts that compose it. */
  numerator?: number;
  denominator?: number;
}

export interface MonthlyTrendPoint {
  /** ISO yyyy-MM. */
  month: string;
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}

export interface DepartmentBreakdown {
  departmentId: string;
  departmentName: string;
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}

export interface CategoryBreakdown {
  category: string; // 'Uncategorised' for nulls
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}

export interface VendorBreakdown {
  vendorId: string;
  vendorName: string;
  awardCount: number;
  totalAwarded: number;
  /** Percentage of total awarded value in the period. */
  shareOfTotal: number;
}

export interface PipelineByStatus {
  status: string;
  count: number;
  estimatedValue: number;
}

// ─── Department-scoped dashboard types (BUG-101) ──────────────────────────────
//
// Per-department overview: tender count, estimated, awarded (with BUG-088
// fallback), savings, savings rate, active pipeline value, top-3 vendors by
// awarded spend within the department. Year-scoped to match the executive
// dashboard.

export interface DepartmentTopVendor {
  vendorId: string;
  vendorName: string;
  awardCount: number;
  totalAwarded: number;
}

export interface DepartmentRow {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  tenderCount: number;
  awardedCount: number;
  activeCount: number;
  estimatedValue: number;
  awardedValue: number;
  estimateOfAwarded: number;
  savings: number;
  savingsRate: number;
  activePipelineValue: number;
  topVendors: DepartmentTopVendor[];
}

export interface DepartmentTenderRow {
  tenderId: string;
  reference: string;
  title: string;
  status: string;
  category: string | null;
  estimatedBudget: number | null;
  awardedAmount: number | null;
  awardedAt: string | null;
  awardedVendorId: string | null;
  awardedVendorName: string | null;
  createdAt: string;
}

export interface DepartmentSpendByYear {
  year: number;
  tenderCount: number;
  awardedCount: number;
  estimatedValue: number;
  awardedValue: number;
}

export interface DepartmentProfileResponse {
  profile: {
    id: string;
    code: string;
    name: string;
  };
  year: number | null; // null = all-time
  metrics: {
    tenderCount: number;
    awardedCount: number;
    activeCount: number;
    estimatedValue: number;
    awardedValue: number;
    savings: number;
    savingsRate: number;
    activePipelineValue: number;
    distinctVendors: number;
  };
  tenders: DepartmentTenderRow[];
  topVendors: DepartmentTopVendor[];
  spendByYear: DepartmentSpendByYear[];
  spendByCategory: CategoryBreakdown[];
  currency: string;
  generatedAt: string;
}

export interface DepartmentOverviewResponse {
  year: number;
  generatedAt: string;
  currency: string;
  totals: {
    tenderCount: number;
    awardedCount: number;
    estimatedValue: number;
    awardedValue: number;
    savings: number;
    savingsRate: number;
    activePipelineValue: number;
    departmentCount: number;
  };
  rows: DepartmentRow[];
}

// ─── Vendor-scoped dashboard types (BUG-100) ──────────────────────────────────
//
// The /executive/vendors directory + per-vendor detail page consume these.
// Same BUG-088 fallback applies everywhere money is summed: prefer
// Tender.awardedAmount, else the awarded vendor's bid's CommercialEvaluation
// total. See `_loadAwardedTendersForVendors` for the resolution.

export interface VendorDirectoryRow {
  vendorId: string;
  companyName: string;
  status: VendorStatus;
  country: string | null;
  awardCount: number;
  totalAwarded: number;
  lastAwardedAt: string | null;
  bidsSubmitted: number;
  winRate: number; // 0..100, awards / submitted bids (excludes WITHDRAWN)
}

export interface VendorDirectoryKpis {
  totalApprovedVendors: number;
  vendorsWithAwards: number;
  lifetimeSpend: number;
  top5SharePct: number;
}

export interface VendorDirectoryResponse {
  rows: VendorDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  kpis: VendorDirectoryKpis;
  currency: string;
  generatedAt: string;
}

export interface NegotiationSavingsRow {
  originalPrice: number;
  finalPrice: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface NegotiationSavingsSummary {
  totalAmount: number;
  awardCountWithNegotiation: number;
  avgPercent: number;
}

export interface VendorAwardHistoryRow {
  tenderId: string;
  tenderReference: string;
  tenderTitle: string;
  departmentName: string | null;
  category: string | null;
  awardedAt: string;
  awardedAmount: number;
  awardId: string | null;
  awardStatus: 'Active' | 'Superseded' | 'Amended';
  justificationPdfStorageKey: string | null;
  justificationPdfFilename: string | null;
  // BUG-115 (2026-06-09): null when this tender wasn't negotiated.
  negotiationSavings: NegotiationSavingsRow | null;
}

export interface VendorSpendByYear {
  year: number;
  awardCount: number;
  totalAwarded: number;
}

export interface VendorBidParticipationRow {
  bidId: string;
  tenderId: string;
  tenderReference: string;
  tenderTitle: string;
  submittedAt: string | null;
  status: BidStatus;
  technicalResult: TechnicalResult;
  commercialTotal: number | null;
  tenderStatus: string;
}

export interface VendorProfileResponse {
  profile: {
    id: string;
    companyName: string;
    registrationNumber: string | null;
    taxNumber: string | null;
    country: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    status: VendorStatus;
    blacklistReason: string | null;
    suspensionReason: string | null;
    approvedAt: string | null;
    createdAt: string;
    primaryContact: { fullName: string; email: string; phone: string | null } | null;
  };
  metrics: {
    lifetimeAwardCount: number;
    lifetimeAwardedValue: number;
    averageAwardSize: number;
    bidsSubmitted: number;
    winRate: number;
    technicalPassRate: number;
  };
  awardHistory: VendorAwardHistoryRow[];
  spendByYear: VendorSpendByYear[];
  spendByDepartment: DepartmentBreakdown[];
  spendByCategory: CategoryBreakdown[];
  bidParticipation: VendorBidParticipationRow[];
  // BUG-115 (2026-06-09): null when this vendor has no negotiated awards.
  negotiationSavings: NegotiationSavingsSummary | null;
  currency: string;
  generatedAt: string;
}

export interface ExecutiveSummary {
  year: number;
  generatedAt: string;
  currency: string;
  kpis: KpiCard[];
  monthlyTrend: MonthlyTrendPoint[];
  byDepartment: DepartmentBreakdown[];
  byCategory: CategoryBreakdown[];
  topVendors: VendorBreakdown[];
  vendorConcentration: {
    top3Share: number;
    top5Share: number;
    totalVendors: number;
  };
  pipeline: PipelineByStatus[];
  cycleTime: {
    avgDaysCreatedToAwarded: number | null;
    avgDaysSubmissionClosedToAwarded: number | null;
    awardedTenderCount: number;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async executiveSummary(year: number): Promise<ExecutiveSummary> {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const priorYearStart = new Date(Date.UTC(year - 1, 0, 1));
    const priorYearEnd = yearStart;

    // BUG-133 (2026-06-14): see plan for the full breakdown of locked
    // decisions. Summary:
    //  - The CREATED set (Tenders Created, Estimated Value, Monthly Trend's
    //    estimated bars, "estimatedValue" column of by-dept / by-cat) is
    //    scoped by createdAt-year and excludes CANCELLED.
    //  - The AWARDED set (Awarded Value, Realised Savings, Savings Rate,
    //    Awarded Tenders, Avg Days to Award, Top Vendors, Concentration,
    //    Monthly Trend's awarded bars, "awardedValue" column of by-dept /
    //    by-cat, Negotiation Savings) is scoped by awardedAt-year and
    //    excludes CANCELLED.
    //  - Prices are resolved via _loadAwardedTendersForVendors → 4-source
    //    chain (negotiation latest → BoQ total → tender.awardedAmount →
    //    CommercialEvaluation). The raw tender.awardedAmount column is no
    //    longer read directly.
    const [thisYearCreated, priorYearCreated, allActive, allVendors, awardedTendersAll] = await Promise.all([
      this.prisma.tender.findMany({
        where: {
          createdAt: { gte: yearStart, lt: yearEnd },
          status: { not: TenderStatus.CANCELLED },
        },
        select: {
          id: true,
          status: true,
          category: true,
          departmentId: true,
          estimatedBudget: true,
          createdAt: true,
          submissionCloseAt: true,
          department: { select: { name: true } },
        },
      }),
      this.prisma.tender.findMany({
        where: {
          createdAt: { gte: priorYearStart, lt: priorYearEnd },
          status: { not: TenderStatus.CANCELLED },
        },
        select: { id: true, status: true, estimatedBudget: true },
      }),
      // Active pipeline: tenders that are NOT terminal (not Awarded, Closed,
      // or Cancelled). Computed across all years — pipeline value is
      // intentionally not bound to the year filter; frontend labels this
      // tile "(all years)".
      this.prisma.tender.findMany({
        where: {
          status: {
            notIn: [TenderStatus.AWARDED, TenderStatus.TENDER_CLOSED, TenderStatus.CANCELLED],
          },
        },
        select: { id: true, status: true, estimatedBudget: true },
      }),
      this.prisma.vendor.count({ where: { status: 'APPROVED' } }),
      // BUG-133: resolver-priced awarded tenders across all time. Filtered
      // down to the year + cancellation excluded below.
      this._loadAwardedTendersForVendors(),
    ]);

    // Vendor names for awarded set — _loadAwardedTendersForVendors doesn't
    // return them, fetch separately for the Top Vendors block.
    const awardedVendorIds = Array.from(
      new Set(awardedTendersAll.map(t => t.awardedVendorId).filter(Boolean)),
    ) as string[];
    const vendorNames = awardedVendorIds.length > 0
      ? await this.prisma.vendor.findMany({
          where: { id: { in: awardedVendorIds } },
          select: { id: true, companyName: true },
        })
      : [];
    const vendorNameById = new Map(vendorNames.map(v => [v.id, v.companyName]));

    // Year-scoped & cancellation-excluded awarded subsets.
    const inYearAwarded = (rows: typeof awardedTendersAll, y: number) =>
      rows.filter(
        t =>
          t.awardedAt.getUTCFullYear() === y &&
          t.tenderStatus !== TenderStatus.CANCELLED,
      );
    const awardedThisYear = inYearAwarded(awardedTendersAll, year);
    const awardedPriorYear = inYearAwarded(awardedTendersAll, year - 1);

    const sumField = (rows: Array<{ estimatedBudget?: any }>, key: 'estimatedBudget') =>
      rows.reduce((s, r) => s + (r[key] != null ? Number(r[key]) : 0), 0);

    // BUG-135 (2026-06-15): loader now returns createdAt/submissionCloseAt/
    // estimatedBudget directly so no side query needed.

    // ─── KPI cards ───────────────────────────────────────────────────────
    const tenderCount = thisYearCreated.length;
    const tenderCountPrior = priorYearCreated.length;
    const estTotal = sumField(thisYearCreated, 'estimatedBudget');
    const estTotalPrior = sumField(priorYearCreated, 'estimatedBudget');

    const awardedTotal = awardedThisYear.reduce((s, t) => s + t.awardedAmount, 0);
    const awardedTotalPrior = awardedPriorYear.reduce((s, t) => s + t.awardedAmount, 0);

    // Realised Savings = Σ (estimated_budget − awarded_amount) for this year's
    // awarded set. NO clamp (BUG-133 locked decision #4): cost overruns appear
    // as negative savings so executives see the real picture.
    const estOfAwarded = awardedThisYear.reduce(
      (s, t) => s + (t.estimatedBudget ?? 0),
      0,
    );
    const savingsTotal = estOfAwarded - awardedTotal;
    const savingsPct = estOfAwarded > 0 ? (savingsTotal / estOfAwarded) * 100 : 0;

    const activePipelineTotal = sumField(allActive, 'estimatedBudget');

    // BUG-133: Negotiation Savings — Σ savingsAmount across awarded tenders
    // that went through negotiation. Per-tender block already computed by
    // _resolveNegotiationSavings inside the loader.
    const negotiatedAwards = awardedThisYear.filter(t => t.negotiationSavings != null);
    const negotiationSavingsTotal = negotiatedAwards.reduce(
      (s, t) => s + (t.negotiationSavings!.savingsAmount ?? 0),
      0,
    );
    const negotiationSavingsAvgPct = negotiatedAwards.length > 0
      ? negotiatedAwards.reduce((s, t) => s + (t.negotiationSavings!.savingsPercent ?? 0), 0)
          / negotiatedAwards.length
      : 0;

    // Avg cycle time: createdAt → awardedAt across awarded tenders this year.
    // Returns null (rendered as "—" on the frontend) when no awards.
    let avgCreatedToAwarded: number | null = null;
    let avgSubmissionToAwarded: number | null = null;
    if (awardedThisYear.length > 0) {
      const dCreated = awardedThisYear.reduce(
        (s, t) => s + (new Date(t.awardedAt).getTime() - new Date(t.createdAt).getTime()),
        0,
      );
      avgCreatedToAwarded = dCreated / awardedThisYear.length / 86_400_000;
      const withSubmission = awardedThisYear.filter(t => t.submissionCloseAt != null);
      if (withSubmission.length > 0) {
        const dSub = withSubmission.reduce(
          (s, t) => s + (new Date(t.awardedAt).getTime() - new Date(t.submissionCloseAt!).getTime()),
          0,
        );
        avgSubmissionToAwarded = dSub / withSubmission.length / 86_400_000;
      }
    }

    const kpis: KpiCard[] = [
      {
        label: 'Tenders Created',
        value: tenderCount,
        unit: 'count',
        yoyDelta: tenderCountPrior === 0 ? null : tenderCount - tenderCountPrior,
      },
      {
        label: 'Estimated Value',
        value: estTotal,
        unit: 'KWD',
        yoyDelta: estTotalPrior === 0 ? null : estTotal - estTotalPrior,
      },
      {
        label: 'Awarded Value',
        value: awardedTotal,
        unit: 'KWD',
        yoyDelta: awardedTotalPrior === 0 ? null : awardedTotal - awardedTotalPrior,
      },
      {
        label: 'Realised Savings',
        value: savingsTotal,
        unit: 'KWD',
        numerator: savingsTotal,
        denominator: estOfAwarded,
      },
      {
        label: 'Savings Rate',
        value: savingsPct,
        unit: 'percent',
      },
      // BUG-133: new Negotiation Savings tile. Sits next to Realised Savings.
      {
        label: 'Negotiation Savings',
        value: negotiationSavingsTotal,
        unit: 'KWD',
        numerator: negotiatedAwards.length,
        denominator: negotiationSavingsAvgPct,
      },
      {
        label: 'Active Pipeline',
        value: activePipelineTotal,
        unit: 'KWD',
      },
      {
        label: 'Avg Days to Award',
        value: avgCreatedToAwarded != null ? Math.round(avgCreatedToAwarded) : null,
        unit: 'days',
      },
      {
        label: 'Awarded Tenders',
        value: awardedThisYear.length,
        unit: 'count',
      },
    ];

    // ─── Monthly trend ───────────────────────────────────────────────────
    const monthly = new Map<string, MonthlyTrendPoint>();
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      monthly.set(key, { month: key, tenderCount: 0, estimatedValue: 0, awardedValue: 0 });
    }
    // Estimated side: tenders created in each month of `year`.
    for (const t of thisYearCreated) {
      const k = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const p = monthly.get(k);
      if (p) {
        p.tenderCount += 1;
        p.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
      }
    }
    // Awarded side: tenders whose award date falls in `year`'s months.
    for (const t of awardedThisYear) {
      const d = new Date(t.awardedAt);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const p = monthly.get(k);
      if (p) p.awardedValue += t.awardedAmount;
    }
    const monthlyTrend = Array.from(monthly.values());

    // ─── Department breakdown ────────────────────────────────────────────
    // Combined view: tenderCount + estimatedValue from thisYearCreated;
    // awardedValue from awardedThisYear. Keyed by departmentId.
    const byDeptMap = new Map<string, DepartmentBreakdown>();
    const ensureDept = (id: string, name: string | null) => {
      let b = byDeptMap.get(id);
      if (!b) {
        b = {
          departmentId: id,
          departmentName: name ?? '—',
          tenderCount: 0,
          estimatedValue: 0,
          awardedValue: 0,
        };
        byDeptMap.set(id, b);
      } else if (b.departmentName === '—' && name) {
        b.departmentName = name;
      }
      return b;
    };
    for (const t of thisYearCreated) {
      const b = ensureDept(t.departmentId, t.department?.name ?? null);
      b.tenderCount += 1;
      b.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }
    for (const t of awardedThisYear) {
      const b = ensureDept(t.departmentId, t.departmentName);
      b.awardedValue += t.awardedAmount;
    }
    const byDepartment = Array.from(byDeptMap.values()).sort(
      (a, b) => b.estimatedValue - a.estimatedValue,
    );

    // ─── Category breakdown ──────────────────────────────────────────────
    const byCatMap = new Map<string, CategoryBreakdown>();
    const ensureCat = (cat: string) => {
      let b = byCatMap.get(cat);
      if (!b) {
        b = { category: cat, tenderCount: 0, estimatedValue: 0, awardedValue: 0 };
        byCatMap.set(cat, b);
      }
      return b;
    };
    for (const t of thisYearCreated) {
      const b = ensureCat(t.category ?? 'Uncategorised');
      b.tenderCount += 1;
      b.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }
    for (const t of awardedThisYear) {
      const b = ensureCat(t.category ?? 'Uncategorised');
      b.awardedValue += t.awardedAmount;
    }
    const byCategory = Array.from(byCatMap.values()).sort(
      (a, b) => b.estimatedValue - a.estimatedValue,
    );

    // ─── Top vendors by award value (this year, resolver-priced) ─────────
    const vendorMap = new Map<string, VendorBreakdown>();
    for (const t of awardedThisYear) {
      if (!t.awardedVendorId) continue;
      let v = vendorMap.get(t.awardedVendorId);
      if (!v) {
        v = {
          vendorId: t.awardedVendorId,
          vendorName: vendorNameById.get(t.awardedVendorId) ?? '—',
          awardCount: 0,
          totalAwarded: 0,
          shareOfTotal: 0,
        };
        vendorMap.set(t.awardedVendorId, v);
      }
      v.awardCount += 1;
      v.totalAwarded += t.awardedAmount;
    }
    const vendorListSorted = Array.from(vendorMap.values()).sort(
      (a, b) => b.totalAwarded - a.totalAwarded,
    );
    for (const v of vendorListSorted) {
      v.shareOfTotal = awardedTotal > 0 ? (v.totalAwarded / awardedTotal) * 100 : 0;
    }
    const topVendors = vendorListSorted.slice(0, 10);
    const top3Share = vendorListSorted.slice(0, 3).reduce((s, v) => s + v.shareOfTotal, 0);
    const top5Share = vendorListSorted.slice(0, 5).reduce((s, v) => s + v.shareOfTotal, 0);

    // ─── Pipeline by status ──────────────────────────────────────────────
    const pipelineMap = new Map<string, PipelineByStatus>();
    for (const t of allActive) {
      let p = pipelineMap.get(t.status);
      if (!p) {
        p = { status: t.status, count: 0, estimatedValue: 0 };
        pipelineMap.set(t.status, p);
      }
      p.count += 1;
      p.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }
    const pipeline = Array.from(pipelineMap.values()).sort(
      (a, b) => b.estimatedValue - a.estimatedValue,
    );

    return {
      year,
      generatedAt: new Date().toISOString(),
      currency: 'KWD',
      kpis,
      monthlyTrend,
      byDepartment,
      byCategory,
      topVendors,
      vendorConcentration: {
        top3Share,
        top5Share,
        totalVendors: allVendors,
      },
      pipeline,
      cycleTime: {
        avgDaysCreatedToAwarded: avgCreatedToAwarded,
        avgDaysSubmissionClosedToAwarded: avgSubmissionToAwarded,
        awardedTenderCount: awardedThisYear.length,
      },
    };
  }

  // ─── Department overview (BUG-101, rewritten by BUG-135) ────────────────
  //
  // Per-department year-scoped roll-up. BUG-135 (2026-06-15): aligned with
  // the main dashboard:
  //  - Awarded set scoped by awardedAt-year + excludes CANCELLED.
  //  - Estimated set scoped by createdAt-year + excludes CANCELLED.
  //  - Awarded prices come from _loadAwardedTendersForVendors (resolver-priced,
  //    BoQ-aware).
  //  - Savings clamp removed (cost overruns appear as negative values).
  //  - Active pipeline is across-all-years to match the main dashboard's
  //    "(all years)" Active Pipeline tile.
  async departmentOverview(year: number): Promise<DepartmentOverviewResponse> {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [thisYearCreated, allActive, departments, awardedTendersAll, awardedVendorNames] = await Promise.all([
      // Estimated side: tenders created this year + not cancelled.
      this.prisma.tender.findMany({
        where: {
          createdAt: { gte: yearStart, lt: yearEnd },
          status: { not: TenderStatus.CANCELLED },
        },
        select: {
          id: true,
          status: true,
          departmentId: true,
          estimatedBudget: true,
          department: { select: { id: true, code: true, name: true } },
        },
      }),
      // Active pipeline: across all years, not terminal — mirrors main dashboard.
      this.prisma.tender.findMany({
        where: {
          status: {
            notIn: [TenderStatus.AWARDED, TenderStatus.TENDER_CLOSED, TenderStatus.CANCELLED],
          },
        },
        select: { id: true, status: true, departmentId: true, estimatedBudget: true },
      }),
      this.prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      // Awarded side: resolver-priced loader (BoQ-aware, BUG-133 / BUG-135).
      this._loadAwardedTendersForVendors(),
      // Vendor names for the top-3 block.
      this.prisma.vendor.findMany({ select: { id: true, companyName: true } }),
    ]);
    const vendorNameById = new Map(awardedVendorNames.map(v => [v.id, v.companyName]));

    interface Acc extends DepartmentRow {
      vendorMap: Map<string, DepartmentTopVendor>;
    }
    const accByDept = new Map<string, Acc>();
    const ensureAcc = (deptId: string, code: string, name: string): Acc => {
      let acc = accByDept.get(deptId);
      if (!acc) {
        acc = {
          departmentId: deptId,
          departmentCode: code,
          departmentName: name,
          tenderCount: 0,
          awardedCount: 0,
          activeCount: 0,
          estimatedValue: 0,
          awardedValue: 0,
          estimateOfAwarded: 0,
          savings: 0,
          savingsRate: 0,
          activePipelineValue: 0,
          topVendors: [],
          vendorMap: new Map(),
        };
        accByDept.set(deptId, acc);
      } else if ((!acc.departmentCode || acc.departmentCode === '—') && code) {
        acc.departmentCode = code;
      } else if ((!acc.departmentName || acc.departmentName === '—') && name) {
        acc.departmentName = name;
      }
      return acc;
    };
    for (const d of departments) {
      ensureAcc(d.id, d.code, d.name);
    }

    // Estimated side: tenderCount + estimatedValue for tenders created this year.
    for (const t of thisYearCreated) {
      const acc = ensureAcc(t.departmentId, t.department?.code ?? '—', t.department?.name ?? '—');
      acc.tenderCount += 1;
      acc.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }

    // Active pipeline (all years, not terminal).
    for (const t of allActive) {
      const acc = ensureAcc(t.departmentId, '—', '—');
      acc.activeCount += 1;
      acc.activePipelineValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }

    // Awarded side: filter resolver-priced rows to awardedAt-year + not cancelled.
    const awardedThisYear = awardedTendersAll.filter(
      t =>
        t.awardedAt.getUTCFullYear() === year &&
        t.tenderStatus !== TenderStatus.CANCELLED,
    );
    for (const t of awardedThisYear) {
      const acc = ensureAcc(t.departmentId, '—', t.departmentName ?? '—');
      acc.awardedCount += 1;
      acc.estimateOfAwarded += t.estimatedBudget ?? 0;
      acc.awardedValue += t.awardedAmount;
      if (t.awardedVendorId) {
        const cur = acc.vendorMap.get(t.awardedVendorId) ?? {
          vendorId: t.awardedVendorId,
          vendorName: vendorNameById.get(t.awardedVendorId) ?? '—',
          awardCount: 0,
          totalAwarded: 0,
        };
        cur.awardCount += 1;
        cur.totalAwarded += t.awardedAmount;
        acc.vendorMap.set(t.awardedVendorId, cur);
      }
    }

    // Finalise rows: compute savings (NO clamp), top-3 vendors, drop zero-activity depts.
    const rows: DepartmentRow[] = Array.from(accByDept.values())
      .filter(acc => acc.tenderCount > 0 || acc.activeCount > 0 || acc.awardedCount > 0)
      .map(acc => {
        const savings = acc.estimateOfAwarded - acc.awardedValue;
        const savingsRate = acc.estimateOfAwarded > 0 ? (savings / acc.estimateOfAwarded) * 100 : 0;
        const topVendors = Array.from(acc.vendorMap.values())
          .sort((a, b) => b.totalAwarded - a.totalAwarded)
          .slice(0, 3);
        const { vendorMap: _v, ...rest } = acc;
        void _v;
        return { ...rest, savings, savingsRate, topVendors };
      })
      .sort((a, b) => b.estimatedValue - a.estimatedValue);

    const totalsTender = rows.reduce(
      (acc, r) => {
        acc.tenderCount += r.tenderCount;
        acc.awardedCount += r.awardedCount;
        acc.estimatedValue += r.estimatedValue;
        acc.awardedValue += r.awardedValue;
        acc.savings += r.savings;
        acc.estimateOfAwarded += r.estimateOfAwarded;
        acc.activePipelineValue += r.activePipelineValue;
        return acc;
      },
      { tenderCount: 0, awardedCount: 0, estimatedValue: 0, awardedValue: 0, savings: 0, estimateOfAwarded: 0, activePipelineValue: 0 },
    );

    return {
      year,
      generatedAt: new Date().toISOString(),
      currency: 'KWD',
      totals: {
        tenderCount: totalsTender.tenderCount,
        awardedCount: totalsTender.awardedCount,
        estimatedValue: totalsTender.estimatedValue,
        awardedValue: totalsTender.awardedValue,
        savings: totalsTender.savings,
        savingsRate: totalsTender.estimateOfAwarded > 0 ? (totalsTender.savings / totalsTender.estimateOfAwarded) * 100 : 0,
        activePipelineValue: totalsTender.activePipelineValue,
        departmentCount: rows.length,
      },
      rows,
    };
  }

  // ─── Department drill-down profile (BUG-102) ────────────────────────────
  //
  // Per-department deep dive. Optional year scoping (null = all-time). Returns
  // metrics + every tender in the department + top vendors who won here +
  // multi-year spend trend + per-category breakdown. Mirrors the structure of
  // `getVendorProfile` so the frontend detail page can use the same tab
  // layout (Overview / Tenders / Spend Trend / Vendors).
  async getDepartmentProfile(
    departmentId: string,
    year: number | null,
  ): Promise<DepartmentProfileResponse> {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, code: true, name: true },
    });
    if (!department) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }

    // BUG-135 (2026-06-15): rewritten to mirror executiveSummary's behaviour.
    //  - Awarded side: resolver-priced via _loadAwardedTendersForVendors,
    //    scoped by awardedAt-year (or all-time when year=null), CANCELLED
    //    excluded.
    //  - Estimated side: tender.findMany scoped by createdAt-year, CANCELLED
    //    excluded.
    //  - Active set: across all years (matches main dashboard).
    //  - Savings clamp removed (overruns appear as negative).
    const yearStart = year != null ? new Date(Date.UTC(year, 0, 1)) : null;
    const yearEnd = year != null ? new Date(Date.UTC(year + 1, 0, 1)) : null;

    const [allDeptTenders, activeDeptTenders, awardedTendersAll, awardedVendorNames] = await Promise.all([
      // The "tenders" tab needs every tender in the department (current year
      // when filtered, all-time when year=null). Includes cancelled because the
      // owner may want to see them in the per-tender list — they're just not
      // counted in the rolled-up KPIs.
      this.prisma.tender.findMany({
        where: yearStart && yearEnd
          ? { departmentId, createdAt: { gte: yearStart, lt: yearEnd } }
          : { departmentId },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          category: true,
          estimatedBudget: true,
          awardedAmount: true,
          awardedAt: true,
          awardedVendorId: true,
          awardedVendor: { select: { id: true, companyName: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Active pipeline rows for this department, across all years.
      this.prisma.tender.findMany({
        where: {
          departmentId,
          status: {
            notIn: [TenderStatus.AWARDED, TenderStatus.TENDER_CLOSED, TenderStatus.CANCELLED],
          },
        },
        select: { id: true, status: true, estimatedBudget: true },
      }),
      // Resolver-priced awarded tenders (BoQ-aware), all time. We filter to
      // departmentId + year below.
      this._loadAwardedTendersForVendors(),
      this.prisma.vendor.findMany({ select: { id: true, companyName: true } }),
    ]);
    const vendorNameById = new Map(awardedVendorNames.map(v => [v.id, v.companyName]));

    // Per-tender row list (for the Tenders tab). We resolve each tender's
    // amount via the loader output when present; otherwise null.
    const loaderByTenderId = new Map(awardedTendersAll.map(t => [t.tenderId, t]));
    const tenderRows: DepartmentTenderRow[] = allDeptTenders.map(t => {
      const loaded = loaderByTenderId.get(t.id);
      return {
        tenderId: t.id,
        reference: t.reference,
        title: t.title,
        status: t.status,
        category: t.category,
        estimatedBudget: t.estimatedBudget != null ? Number(t.estimatedBudget) : null,
        awardedAmount: loaded ? loaded.awardedAmount : null,
        awardedAt: t.awardedAt ? t.awardedAt.toISOString() : null,
        awardedVendorId: t.awardedVendorId,
        awardedVendorName: t.awardedVendor?.companyName ?? null,
        createdAt: t.createdAt.toISOString(),
      };
    });

    // KPI metrics — apply the locked filters consistently with main dashboard.
    // Estimated side: createdAt-year + not cancelled.
    const estimatedScopedTenders = allDeptTenders.filter(t => t.status !== TenderStatus.CANCELLED);
    const tenderCount = estimatedScopedTenders.length;
    const estimatedValue = estimatedScopedTenders.reduce(
      (s, t) => s + (t.estimatedBudget != null ? Number(t.estimatedBudget) : 0),
      0,
    );

    // Active pipeline: this dept, across all years, not terminal.
    const activeCount = activeDeptTenders.length;
    const activePipelineValue = activeDeptTenders.reduce(
      (s, t) => s + (t.estimatedBudget != null ? Number(t.estimatedBudget) : 0),
      0,
    );

    // Awarded side: filter loader output to this dept + awardedAt-year (or
    // all-time when year=null) + not cancelled.
    const awardedDept = awardedTendersAll.filter(
      t =>
        t.departmentId === departmentId &&
        t.tenderStatus !== TenderStatus.CANCELLED &&
        (year == null || t.awardedAt.getUTCFullYear() === year),
    );
    const awardedCount = awardedDept.length;
    const awardedValue = awardedDept.reduce((s, t) => s + t.awardedAmount, 0);
    const estimateOfAwarded = awardedDept.reduce(
      (s, t) => s + (t.estimatedBudget ?? 0),
      0,
    );
    const distinctVendorSet = new Set(awardedDept.map(t => t.awardedVendorId));

    // Top vendors per department (awarded-this-year set).
    const vendorMap = new Map<string, DepartmentTopVendor>();
    for (const t of awardedDept) {
      if (!t.awardedVendorId) continue;
      const cur = vendorMap.get(t.awardedVendorId) ?? {
        vendorId: t.awardedVendorId,
        vendorName: vendorNameById.get(t.awardedVendorId) ?? '—',
        awardCount: 0,
        totalAwarded: 0,
      };
      cur.awardCount += 1;
      cur.totalAwarded += t.awardedAmount;
      vendorMap.set(t.awardedVendorId, cur);
    }

    // Category breakdown (combines estimated side + awarded side, consistent
    // with the main dashboard).
    const catMap = new Map<string, CategoryBreakdown>();
    const ensureCat = (cat: string) => {
      let ce = catMap.get(cat);
      if (!ce) {
        ce = { category: cat, tenderCount: 0, estimatedValue: 0, awardedValue: 0 };
        catMap.set(cat, ce);
      }
      return ce;
    };
    for (const t of estimatedScopedTenders) {
      const ce = ensureCat(t.category ?? 'Uncategorised');
      ce.tenderCount += 1;
      ce.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
    }
    for (const t of awardedDept) {
      const ce = ensureCat(t.category ?? 'Uncategorised');
      ce.awardedValue += t.awardedAmount;
    }

    // Savings — no clamp.
    const savings = estimateOfAwarded - awardedValue;
    const savingsRate = estimateOfAwarded > 0 ? (savings / estimateOfAwarded) * 100 : 0;

    // Multi-year trend (full dept history). Use the loader for awarded side
    // + a separate small query for estimated side across all years.
    const allDeptForTrend = year == null
      ? allDeptTenders // already covers everything
      : await this.prisma.tender.findMany({
          where: { departmentId },
          select: { id: true, status: true, estimatedBudget: true, createdAt: true },
        });
    const awardedAllForDept = awardedTendersAll.filter(
      t => t.departmentId === departmentId && t.tenderStatus !== TenderStatus.CANCELLED,
    );
    const yearMap = new Map<number, DepartmentSpendByYear>();
    for (const t of allDeptForTrend) {
      if (t.status === TenderStatus.CANCELLED) continue;
      const yr = t.createdAt.getUTCFullYear();
      const ye = yearMap.get(yr) ?? {
        year: yr,
        tenderCount: 0,
        awardedCount: 0,
        estimatedValue: 0,
        awardedValue: 0,
      };
      ye.tenderCount += 1;
      ye.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
      yearMap.set(yr, ye);
    }
    for (const t of awardedAllForDept) {
      const yr = t.awardedAt.getUTCFullYear();
      const ye = yearMap.get(yr) ?? {
        year: yr,
        tenderCount: 0,
        awardedCount: 0,
        estimatedValue: 0,
        awardedValue: 0,
      };
      ye.awardedCount += 1;
      ye.awardedValue += t.awardedAmount;
      yearMap.set(yr, ye);
    }

    return {
      profile: { id: department.id, code: department.code, name: department.name },
      year,
      metrics: {
        tenderCount,
        awardedCount,
        activeCount,
        estimatedValue,
        awardedValue,
        savings,
        savingsRate,
        activePipelineValue,
        distinctVendors: distinctVendorSet.size,
      },
      tenders: tenderRows,
      topVendors: Array.from(vendorMap.values()).sort((a, b) => b.totalAwarded - a.totalAwarded),
      spendByYear: Array.from(yearMap.values()).sort((a, b) => a.year - b.year),
      spendByCategory: Array.from(catMap.values()).sort((a, b) => b.awardedValue - a.awardedValue),
      currency: 'KWD',
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Vendor directory + profile (BUG-100) ───────────────────────────────
  //
  // Owner asked for a per-vendor executive drill-down off the existing Top
  // Vendors table. Pure read aggregations over Vendor / Tender / Bid / Award.
  // Staging volumes are small (tens of vendors, hundreds of bids) — everything
  // computed in memory, no caching, no materialised views.

  /**
   * Resolves the effective awarded amount for a tender. Priority chain mirrors
   * award.service.resolveBidWinningPrice — the canonical "what did we award
   * this bid at?" function. Falls through to fallbacks for historical rows
   * where Tender.awardedAmount was never populated (BUG-088, fixed in
   * BUG-133 for new awards + backfilled by migration 039).
   *
   * Priority (highest first):
   *   1. Latest negotiation submission's totalPrice
   *   2. BoQ-derived total = Σ(unit_price × qty) over BIDDING rows on the awarded bid
   *   3. tender.awardedAmount (canonical post-BUG-133)
   *   4. Awarded bid's latest CommercialEvaluation.totalPrice
   */
  private _resolveAwardedAmount(t: {
    awardedAmount: Prisma.Decimal | null;
    bids?: Array<{
      commercialEvaluations: Array<{ totalPrice: Prisma.Decimal | null }>;
      bidBoqItems?: Array<{
        status: string;
        unitPrice: Prisma.Decimal | null;
        tenderBoqItem: { qty: Prisma.Decimal };
      }>;
      negotiationInvitations?: Array<{
        submission: { totalPrice: Prisma.Decimal | null; submittedAt: Date } | null;
        round: { roundNumber: number };
      }>;
    }>;
  }): number {
    const bid = t.bids?.[0];
    // 1. Negotiation latest non-null totalPrice (newest round first).
    const submitted = (bid?.negotiationInvitations ?? [])
      .filter(i => i.submission?.totalPrice != null)
      .sort((a, b) => b.round.roundNumber - a.round.roundNumber);
    if (submitted.length > 0) {
      return Number(submitted[0].submission!.totalPrice);
    }
    // 2. BUG-133 (2026-06-14): BoQ-derived total. Modern (post-BUG-068)
    // tenders price each line item; with no manual CommercialEvaluation row
    // and no negotiation, this is the only price source available — was
    // missing here pre-BUG-133, hence the "Vendor1: 3 of 4 awarded tenders
    // show blank" symptom.
    const biddingLines = (bid?.bidBoqItems ?? []).filter(
      l => l.status === 'BIDDING' && l.unitPrice != null,
    );
    if (biddingLines.length > 0) {
      return biddingLines.reduce(
        (s, l) => s + Number(l.unitPrice) * Number(l.tenderBoqItem.qty),
        0,
      );
    }
    // 3. Tender.awardedAmount (canonical post-BUG-133).
    if (t.awardedAmount != null) return Number(t.awardedAmount);
    // 4. Awarded bid's latest CommercialEvaluation.
    const ce = bid?.commercialEvaluations?.[0];
    if (ce?.totalPrice != null) return Number(ce.totalPrice);
    return 0;
  }

  /**
   * BUG-115 (2026-06-09): returns the negotiation savings block for a single
   * awarded tender, or null when the awarded bid had no negotiation. Computed
   * from the original CommercialEvaluation total vs the latest negotiation
   * submission total. Tender.awardedAmount is NOT used as a baseline because
   * BUG-088 leaves it null on staging.
   */
  private _resolveNegotiationSavings(t: {
    bids?: Array<{
      commercialEvaluations: Array<{ totalPrice: Prisma.Decimal | null }>;
      negotiationInvitations?: Array<{
        submission: { totalPrice: Prisma.Decimal | null } | null;
        round: { roundNumber: number };
      }>;
    }>;
  }): { originalPrice: number; finalPrice: number; savingsAmount: number; savingsPercent: number } | null {
    const bid = t.bids?.[0];
    if (!bid) return null;
    const submitted = (bid.negotiationInvitations ?? [])
      .filter(i => i.submission?.totalPrice != null)
      .sort((a, b) => b.round.roundNumber - a.round.roundNumber);
    if (submitted.length === 0) return null;
    const finalPrice = Number(submitted[0].submission!.totalPrice);
    const ce = bid.commercialEvaluations?.[0];
    const originalPrice = ce?.totalPrice != null ? Number(ce.totalPrice) : 0;
    if (originalPrice <= 0) return null;
    const savingsAmount = originalPrice - finalPrice;
    const savingsPercent = (savingsAmount / originalPrice) * 100;
    return { originalPrice, finalPrice, savingsAmount, savingsPercent };
  }

  /**
   * Load every awarded tender (Tender.awardedAt set), optionally filtered to a
   * vendor set, with just enough columns to compute amounts (incl. BUG-088
   * fallback). Returns normalised rows ready for aggregation.
   */
  private async _loadAwardedTendersForVendors(vendorIds?: string[]) {
    const where: Prisma.TenderWhereInput = {
      awardedAt: { not: null },
      awardedVendorId: { not: null },
    };
    if (vendorIds && vendorIds.length > 0) {
      where.awardedVendorId = { in: vendorIds };
    }
    const tenders = await this.prisma.tender.findMany({
      where,
      select: {
        id: true,
        reference: true,
        title: true,
        category: true,
        departmentId: true,
        status: true,
        awardedAt: true,
        awardedAmount: true,
        awardedVendorId: true,
        // BUG-135 (2026-06-15): estimatedBudget + createdAt + submissionCloseAt
        // are needed by callers computing savings or cycle time off the same
        // resolver-priced set. Tiny columns; one less query for the callers.
        estimatedBudget: true,
        createdAt: true,
        submissionCloseAt: true,
        department: { select: { id: true, name: true } },
        // BUG-088 fallback: load the awarded vendor's bid + its latest
        // CommercialEvaluation total. We only need it when awardedAmount is
        // NULL but we eagerly load it to keep this in a single query.
        bids: {
          where: {
            // Filtered later via per-row check; can't filter by tender's own
            // awardedVendorId from within a relation `where` cleanly.
            isAlternative: false,
          },
          select: {
            id: true,
            vendorId: true,
            commercialEvaluations: {
              select: { totalPrice: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            // BUG-133 (2026-06-14): BoQ line items feed the resolver's BoQ
            // priority. Without this, modern BoQ-priced tenders read as 0
            // when no CommercialEvaluation row exists.
            bidBoqItems: {
              select: {
                status: true,
                unitPrice: true,
                tenderBoqItem: { select: { qty: true } },
              },
            },
            // BUG-115 (2026-06-09): negotiation submissions feed the resolver
            // chain (highest priority) + the negotiationSavings computation.
            negotiationInvitations: {
              select: {
                round: { select: { roundNumber: true } },
                submission: { select: { totalPrice: true, submittedAt: true } },
              },
            },
          },
        },
      },
    });

    return tenders.map((t) => {
      const awardedBid = t.bids.find((b) => b.vendorId === t.awardedVendorId);
      const resolverInput = {
        awardedAmount: t.awardedAmount as Prisma.Decimal | null,
        bids: awardedBid ? [awardedBid as any] : [],
      };
      const amount = this._resolveAwardedAmount(resolverInput);
      // BUG-115 (2026-06-09): per-row negotiation savings block (null when
      // the awarded bid had no negotiation submission). Used by the vendor
      // profile additive fields + the report renderer.
      const negotiationSavings = this._resolveNegotiationSavings(resolverInput);
      return {
        tenderId: t.id,
        reference: t.reference,
        title: t.title,
        category: t.category,
        departmentId: t.departmentId,
        departmentName: t.department?.name ?? null,
        tenderStatus: t.status as TenderStatus,
        awardedAt: t.awardedAt!,
        awardedVendorId: t.awardedVendorId!,
        awardedAmount: amount,
        negotiationSavings,
        // BUG-135 (2026-06-15): exposed for dept endpoints + exec summary.
        estimatedBudget: t.estimatedBudget != null ? Number(t.estimatedBudget) : null,
        createdAt: t.createdAt,
        submissionCloseAt: t.submissionCloseAt,
      };
    });
  }

  async listVendorDirectory(params: {
    q?: string;
    status?: VendorStatus | 'ALL';
    country?: string;
    year?: number;
    page?: number;
    pageSize?: number;
    sort?: string;
  }): Promise<VendorDirectoryResponse> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const sort = params.sort ?? 'totalAwarded:desc';

    // ─── Vendor filter ───────────────────────────────────────────────────
    const vendorWhere: Prisma.VendorWhereInput = {};
    if (params.status && params.status !== 'ALL') {
      vendorWhere.status = params.status;
    }
    if (params.country) {
      vendorWhere.country = params.country.toUpperCase();
    }
    if (params.q && params.q.trim().length > 0) {
      const q = params.q.trim();
      vendorWhere.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { registrationNumber: { contains: q, mode: 'insensitive' } },
        { taxNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [vendors, awardedTenders, approvedVendorCount] = await Promise.all([
      this.prisma.vendor.findMany({
        where: vendorWhere,
        select: {
          id: true,
          companyName: true,
          status: true,
          country: true,
          _count: { select: { bids: { where: { status: { not: BidStatus.WITHDRAWN } } } } },
          bids: {
            where: { status: { not: BidStatus.WITHDRAWN } },
            select: { id: true, status: true, submittedAt: true },
          },
        },
      }),
      this._loadAwardedTendersForVendors(),
      this.prisma.vendor.count({ where: { status: VendorStatus.APPROVED } }),
    ]);

    // Group spend by vendor, applying optional year-of-last-award filter.
    const yearFilter = params.year;
    const spendByVendor = new Map<string, { awardCount: number; totalAwarded: number; lastAwardedAt: Date | null }>();
    for (const t of awardedTenders) {
      if (yearFilter && t.awardedAt.getUTCFullYear() !== yearFilter) continue;
      const cur = spendByVendor.get(t.awardedVendorId) ?? {
        awardCount: 0,
        totalAwarded: 0,
        lastAwardedAt: null as Date | null,
      };
      cur.awardCount += 1;
      cur.totalAwarded += t.awardedAmount;
      if (!cur.lastAwardedAt || t.awardedAt > cur.lastAwardedAt) {
        cur.lastAwardedAt = t.awardedAt;
      }
      spendByVendor.set(t.awardedVendorId, cur);
    }

    // Build rows. When year filter is set, drop vendors with no awards in
    // that year.
    let rows: VendorDirectoryRow[] = vendors.map((v) => {
      const sp = spendByVendor.get(v.id);
      const bidsSubmitted = v.bids.filter((b) => b.submittedAt != null).length;
      const awardCount = sp?.awardCount ?? 0;
      const winRate = bidsSubmitted > 0 ? (awardCount / bidsSubmitted) * 100 : 0;
      return {
        vendorId: v.id,
        companyName: v.companyName,
        status: v.status,
        country: v.country,
        awardCount,
        totalAwarded: sp?.totalAwarded ?? 0,
        lastAwardedAt: sp?.lastAwardedAt ? sp.lastAwardedAt.toISOString() : null,
        bidsSubmitted,
        winRate,
      };
    });

    if (yearFilter) {
      rows = rows.filter((r) => r.awardCount > 0);
    }

    // Sort.
    const [sortKey, sortDir] = sort.split(':');
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });

    const total = rows.length;
    const paged = rows.slice((page - 1) * pageSize, page * pageSize);

    // ─── Directory KPIs (computed over filtered set, not just current page) ─
    const totalSpendAcrossAll = rows.reduce((s, r) => s + r.totalAwarded, 0);
    const vendorsWithAwards = rows.filter((r) => r.awardCount > 0).length;
    const top5Spend = [...rows]
      .sort((a, b) => b.totalAwarded - a.totalAwarded)
      .slice(0, 5)
      .reduce((s, r) => s + r.totalAwarded, 0);
    const top5SharePct = totalSpendAcrossAll > 0 ? (top5Spend / totalSpendAcrossAll) * 100 : 0;

    return {
      rows: paged,
      total,
      page,
      pageSize,
      kpis: {
        totalApprovedVendors: approvedVendorCount,
        vendorsWithAwards,
        lifetimeSpend: totalSpendAcrossAll,
        top5SharePct,
      },
      currency: 'KWD',
      generatedAt: new Date().toISOString(),
    };
  }

  async getVendorProfile(vendorId: string): Promise<VendorProfileResponse> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        vendorUsers: {
          where: { isPrimaryContact: true },
          select: { fullName: true, email: true, phone: true },
          take: 1,
        },
      },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${vendorId} not found`);
    }

    // Award history needs Award rows too (for amendment chain). Pull the
    // tender-side awards plus the Award rows for this vendor in parallel.
    const [awardedTenders, awardRows, allBids] = await Promise.all([
      this._loadAwardedTendersForVendors([vendorId]),
      this.prisma.award.findMany({
        where: { recommendedVendorId: vendorId },
        select: {
          id: true,
          tenderId: true,
          confirmedAt: true,
          supersededByAwardId: true,
          supersededAt: true,
          justificationPdfStorageKey: true,
          justificationPdfFilename: true,
        },
      }),
      this.prisma.bid.findMany({
        where: { vendorId },
        select: {
          id: true,
          tenderId: true,
          status: true,
          submittedAt: true,
          technicalResult: true,
          tender: {
            select: { reference: true, title: true, status: true },
          },
          commercialEvaluations: {
            select: { totalPrice: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build award status map: an Award row is "Active" when not superseded,
    // "Superseded" when it is, "Amended" when this is the latest in a chain
    // where prior rows exist. Simplification for v1: distinguish Active vs
    // Superseded only; "Amended" badge applied when a tender has >1 Award
    // row by this vendor and this one is non-superseded.
    const awardsByTender = new Map<string, typeof awardRows>();
    for (const a of awardRows) {
      const arr = awardsByTender.get(a.tenderId) ?? [];
      arr.push(a);
      awardsByTender.set(a.tenderId, arr);
    }

    const awardHistory: VendorAwardHistoryRow[] = awardedTenders
      .map((t) => {
        const awardsForTender = awardsByTender.get(t.tenderId) ?? [];
        const active = awardsForTender.find((a) => a.supersededByAwardId == null);
        const isAmendment = awardsForTender.length > 1 && active != null;
        return {
          tenderId: t.tenderId,
          tenderReference: t.reference,
          tenderTitle: t.title,
          departmentName: t.departmentName,
          category: t.category,
          awardedAt: t.awardedAt.toISOString(),
          awardedAmount: t.awardedAmount,
          awardId: active?.id ?? null,
          awardStatus: (isAmendment ? 'Amended' : 'Active') as 'Active' | 'Amended' | 'Superseded',
          justificationPdfStorageKey: active?.justificationPdfStorageKey ?? null,
          justificationPdfFilename: active?.justificationPdfFilename ?? null,
          // BUG-115 (2026-06-09): per-row negotiation savings block. Null
          // when this awarded tender did not go through negotiation.
          negotiationSavings: (t as any).negotiationSavings ?? null,
        };
      })
      .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime());

    // BUG-115 (2026-06-09): top-level additive `negotiationSavings` summary
    // for this vendor. Aggregates across awards that went through negotiation.
    const negotiatedAwards = (awardedTenders as any[]).filter(t => t.negotiationSavings != null);
    const vendorNegotiationSavings = negotiatedAwards.length === 0
      ? null
      : {
          totalAmount: negotiatedAwards.reduce((s, t) => s + (t.negotiationSavings.savingsAmount ?? 0), 0),
          awardCountWithNegotiation: negotiatedAwards.length,
          avgPercent:
            negotiatedAwards.reduce((s, t) => s + (t.negotiationSavings.savingsPercent ?? 0), 0)
            / negotiatedAwards.length,
        };

    // ─── Metrics ─────────────────────────────────────────────────────────
    const lifetimeAwardCount = awardHistory.length;
    const lifetimeAwardedValue = awardHistory.reduce((s, a) => s + a.awardedAmount, 0);
    const averageAwardSize = lifetimeAwardCount > 0 ? lifetimeAwardedValue / lifetimeAwardCount : 0;
    const submitted = allBids.filter(
      (b) => b.submittedAt != null && b.status !== BidStatus.WITHDRAWN,
    );
    const bidsSubmitted = submitted.length;
    const awardedBids = submitted.filter((b) => b.status === BidStatus.AWARDED).length;
    const winRate = bidsSubmitted > 0 ? (awardedBids / bidsSubmitted) * 100 : 0;
    const techEvaluated = submitted.filter((b) => b.technicalResult !== TechnicalResult.PENDING);
    const techPassed = techEvaluated.filter((b) => b.technicalResult === TechnicalResult.PASS).length;
    const technicalPassRate = techEvaluated.length > 0 ? (techPassed / techEvaluated.length) * 100 : 0;

    // ─── Spend by year / department / category ───────────────────────────
    const yearMap = new Map<number, VendorSpendByYear>();
    const deptMap = new Map<string, DepartmentBreakdown>();
    const catMap = new Map<string, CategoryBreakdown>();
    for (const t of awardedTenders) {
      const y = t.awardedAt.getUTCFullYear();
      const ye = yearMap.get(y) ?? { year: y, awardCount: 0, totalAwarded: 0 };
      ye.awardCount += 1;
      ye.totalAwarded += t.awardedAmount;
      yearMap.set(y, ye);

      const de = deptMap.get(t.departmentId) ?? {
        departmentId: t.departmentId,
        departmentName: t.departmentName ?? '—',
        tenderCount: 0,
        estimatedValue: 0,
        awardedValue: 0,
      };
      de.tenderCount += 1;
      de.awardedValue += t.awardedAmount;
      deptMap.set(t.departmentId, de);

      const cat = t.category ?? 'Uncategorised';
      const ce = catMap.get(cat) ?? {
        category: cat,
        tenderCount: 0,
        estimatedValue: 0,
        awardedValue: 0,
      };
      ce.tenderCount += 1;
      ce.awardedValue += t.awardedAmount;
      catMap.set(cat, ce);
    }
    const spendByYear = Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
    const spendByDepartment = Array.from(deptMap.values()).sort(
      (a, b) => b.awardedValue - a.awardedValue,
    );
    const spendByCategory = Array.from(catMap.values()).sort(
      (a, b) => b.awardedValue - a.awardedValue,
    );

    // ─── Bid participation ───────────────────────────────────────────────
    const bidParticipation: VendorBidParticipationRow[] = allBids.map((b) => ({
      bidId: b.id,
      tenderId: b.tenderId,
      tenderReference: b.tender.reference,
      tenderTitle: b.tender.title,
      submittedAt: b.submittedAt ? b.submittedAt.toISOString() : null,
      status: b.status,
      technicalResult: b.technicalResult,
      commercialTotal: b.commercialEvaluations[0]?.totalPrice != null
        ? Number(b.commercialEvaluations[0].totalPrice)
        : null,
      tenderStatus: b.tender.status,
    }));

    return {
      profile: {
        id: vendor.id,
        companyName: vendor.companyName,
        registrationNumber: vendor.registrationNumber,
        taxNumber: vendor.taxNumber,
        country: vendor.country,
        address: vendor.address,
        phone: vendor.phone,
        website: vendor.website,
        status: vendor.status,
        blacklistReason: vendor.blacklistReason,
        suspensionReason: vendor.suspensionReason,
        approvedAt: vendor.approvedAt ? vendor.approvedAt.toISOString() : null,
        createdAt: vendor.createdAt.toISOString(),
        primaryContact: vendor.vendorUsers[0]
          ? {
              fullName: vendor.vendorUsers[0].fullName,
              email: vendor.vendorUsers[0].email,
              phone: vendor.vendorUsers[0].phone,
            }
          : null,
      },
      metrics: {
        lifetimeAwardCount,
        lifetimeAwardedValue,
        averageAwardSize,
        bidsSubmitted,
        winRate,
        technicalPassRate,
      },
      awardHistory,
      spendByYear,
      spendByDepartment,
      spendByCategory,
      bidParticipation,
      // BUG-115 (2026-06-09): additive summary; null when this vendor has
      // never been negotiated with. Frontend can render lazily.
      negotiationSavings: vendorNegotiationSavings,
      currency: 'KWD',
      generatedAt: new Date().toISOString(),
    };
  }

  // BUG-133 (2026-06-14): filtered tender list backing the /executive/tenders
  // drill-down page. Resolver-priced awarded amounts.
  async listExecutiveTenders(params: {
    createdYear?: number;
    awardedYear?: number;
    hasAward?: boolean;
    hasNegotiation?: boolean;
    activeOnly?: boolean;
    status?: string;
    statusNot?: string;
    category?: string;
    departmentId?: string;
    vendorId?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

    const where: Prisma.TenderWhereInput = {};
    if (params.createdYear) {
      const ys = new Date(Date.UTC(params.createdYear, 0, 1));
      const ye = new Date(Date.UTC(params.createdYear + 1, 0, 1));
      where.createdAt = { gte: ys, lt: ye };
    }
    if (params.hasAward) {
      where.awardedAt = { not: null };
    }
    if (params.awardedYear) {
      const ys = new Date(Date.UTC(params.awardedYear, 0, 1));
      const ye = new Date(Date.UTC(params.awardedYear + 1, 0, 1));
      where.awardedAt = { gte: ys, lt: ye };
    }
    // BUG-135 (2026-06-15): compose status filters with AND so multiple
    // constraints can coexist (e.g. "active only" + "not cancelled" + an
    // explicit status from the caller). Any awarded-set drill-down implies
    // CANCELLED-exclusion so the list matches the dashboard tile.
    const apiToDb = (label: string): TenderStatus | null => {
      const match = (Object.entries(STATUS_DB_TO_API) as Array<[TenderStatus, string]>)
        .find(([, v]) => v === label);
      return match ? match[0] : null;
    };
    const statusConds: Prisma.TenderWhereInput[] = [];
    if (params.activeOnly) {
      statusConds.push({
        status: { notIn: [TenderStatus.AWARDED, TenderStatus.TENDER_CLOSED, TenderStatus.CANCELLED] },
      });
    }
    if (params.hasAward || params.awardedYear) {
      statusConds.push({ status: { not: TenderStatus.CANCELLED } });
    }
    if (params.status) {
      const s = apiToDb(params.status);
      if (s) statusConds.push({ status: s });
    }
    if (params.statusNot) {
      const s = apiToDb(params.statusNot);
      if (s) statusConds.push({ status: { not: s } });
    }
    if (statusConds.length === 1) {
      Object.assign(where, statusConds[0]);
    } else if (statusConds.length > 1) {
      where.AND = statusConds;
    }
    if (params.category) {
      where.category = params.category;
    }
    if (params.departmentId) {
      where.departmentId = params.departmentId;
    }
    if (params.vendorId) {
      where.awardedVendorId = params.vendorId;
    }

    const [total, rawTenders] = await this.prisma.$transaction([
      this.prisma.tender.count({ where }),
      this.prisma.tender.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          category: true,
          createdAt: true,
          awardedAt: true,
          submissionCloseAt: true,
          estimatedBudget: true,
          awardedAmount: true,
          awardedVendorId: true,
          department: { select: { id: true, name: true } },
          awardedVendor: { select: { id: true, companyName: true } },
          bids: {
            where: { isAlternative: false },
            select: {
              vendorId: true,
              commercialEvaluations: {
                select: { totalPrice: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              bidBoqItems: {
                select: {
                  status: true,
                  unitPrice: true,
                  tenderBoqItem: { select: { qty: true } },
                },
              },
              negotiationInvitations: {
                select: {
                  round: { select: { roundNumber: true } },
                  submission: { select: { totalPrice: true, submittedAt: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    // Resolve per-row amount + negotiation savings via the same chain.
    const rows = rawTenders.map(t => {
      const awardedBid = t.awardedVendorId
        ? t.bids.find(b => b.vendorId === t.awardedVendorId)
        : undefined;
      const resolverInput = {
        awardedAmount: t.awardedAmount as Prisma.Decimal | null,
        bids: awardedBid ? [awardedBid as any] : [],
      };
      const resolvedAmount = t.awardedAt ? this._resolveAwardedAmount(resolverInput) : null;
      const negotiationSavings = t.awardedAt ? this._resolveNegotiationSavings(resolverInput) : null;
      const cycleDays = t.awardedAt
        ? Math.round((new Date(t.awardedAt).getTime() - new Date(t.createdAt).getTime()) / 86_400_000)
        : null;
      return {
        id: t.id,
        reference: t.reference,
        title: t.title,
        status: STATUS_DB_TO_API[t.status as TenderStatus],
        category: t.category,
        departmentId: t.department?.id ?? null,
        departmentName: t.department?.name ?? null,
        createdAt: t.createdAt.toISOString(),
        awardedAt: t.awardedAt ? t.awardedAt.toISOString() : null,
        awardedVendorId: t.awardedVendor?.id ?? null,
        awardedVendorName: t.awardedVendor?.companyName ?? null,
        estimatedBudget: t.estimatedBudget != null ? Number(t.estimatedBudget) : null,
        awardedAmount: resolvedAmount,
        cycleDays,
        negotiationSavings: negotiationSavings,
      };
    });

    // hasNegotiation filter is applied post-query (resolver-derived).
    let filtered = rows;
    if (params.hasNegotiation) {
      filtered = filtered.filter(r => r.negotiationSavings != null);
    }

    // Apply sort post-query (small dataset; year-scoped pagination already
    // bounded by Prisma above). Keys: createdAt | awardedAt | estimatedBudget
    // | awardedAmount | cycleDays | savings.
    if (params.sort) {
      const [key, dir] = params.sort.split(':');
      const sign = dir === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        const av: any = key === 'savings'
          ? ((a.estimatedBudget ?? 0) - (a.awardedAmount ?? 0))
          : (a as any)[key];
        const bv: any = key === 'savings'
          ? ((b.estimatedBudget ?? 0) - (b.awardedAmount ?? 0))
          : (b as any)[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string') return sign * av.localeCompare(bv);
        return sign * (av - bv);
      });
    }

    return {
      total: params.hasNegotiation ? filtered.length : total,
      page,
      pageSize,
      rows: filtered,
      currency: 'KWD',
      generatedAt: new Date().toISOString(),
    };
  }
}
