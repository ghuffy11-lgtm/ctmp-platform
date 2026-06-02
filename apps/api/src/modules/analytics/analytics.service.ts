import { Injectable } from '@nestjs/common';
import { TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

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
  value: number;
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

    // ─── Raw rows for the year + prior year. Small enough to pull whole. ──
    const [thisYear, priorYear, allActive, allVendors] = await Promise.all([
      this.prisma.tender.findMany({
        where: { createdAt: { gte: yearStart, lt: yearEnd } },
        select: {
          id: true,
          status: true,
          category: true,
          departmentId: true,
          estimatedBudget: true,
          awardedAmount: true,
          awardedAt: true,
          awardedVendorId: true,
          createdAt: true,
          submissionCloseAt: true,
          department: { select: { name: true } },
          awardedVendor: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.tender.findMany({
        where: { createdAt: { gte: priorYearStart, lt: priorYearEnd } },
        select: {
          id: true,
          status: true,
          estimatedBudget: true,
          awardedAmount: true,
        },
      }),
      // Active pipeline: tenders that are NOT terminal (not Awarded, Closed,
      // or Cancelled). Computed across all years — pipeline value isn't bound
      // to the year filter.
      this.prisma.tender.findMany({
        where: {
          status: {
            notIn: [TenderStatus.AWARDED, TenderStatus.TENDER_CLOSED, TenderStatus.CANCELLED],
          },
        },
        select: { id: true, status: true, estimatedBudget: true },
      }),
      this.prisma.vendor.count({ where: { status: 'APPROVED' } }),
    ]);

    const sum = (rows: Array<{ estimatedBudget?: any; awardedAmount?: any }>, key: 'estimatedBudget' | 'awardedAmount') =>
      rows.reduce((s, r) => s + (r[key] != null ? Number(r[key]) : 0), 0);

    // ─── KPI cards ───────────────────────────────────────────────────────
    const tenderCount = thisYear.length;
    const tenderCountPrior = priorYear.length;
    const estTotal = sum(thisYear, 'estimatedBudget');
    const estTotalPrior = sum(priorYear, 'estimatedBudget');
    // BUG-088 (2026-06-02): owner reported Top Vendors empty + Awarded Value 0.
    // Root cause on staging: tenders.awarded_amount is never populated by the
    // existing award flow (only awarded_at + awarded_vendor_id are set). Until
    // that's fixed (separate workstream — needs award.service.confirmAward to
    // copy the bid's commercial total to tender.awarded_amount), we count any
    // tender with awardedAt as an award and treat null amounts as 0 in the
    // sum. Top vendors will still appear, ranked by count when amounts are
    // missing.
    const awardedRows = thisYear.filter(t => t.awardedAt != null);
    const awardedTotal = sum(awardedRows, 'awardedAmount');
    const awardedTotalPrior = sum(
      priorYear.filter(t => t.awardedAmount != null),
      'awardedAmount',
    );
    // Savings = (sum of estimatedBudget for awarded tenders) - awardedTotal.
    const estOfAwarded = sum(awardedRows, 'estimatedBudget');
    const savingsTotal = Math.max(0, estOfAwarded - awardedTotal);
    const savingsPct = estOfAwarded > 0 ? (savingsTotal / estOfAwarded) * 100 : 0;
    const activePipelineTotal = sum(allActive, 'estimatedBudget');

    // Avg cycle time: createdAt → awardedAt across awarded tenders this year.
    let avgCreatedToAwarded: number | null = null;
    let avgSubmissionToAwarded: number | null = null;
    if (awardedRows.length > 0) {
      const dCreated = awardedRows.reduce((s, t) => {
        return s + (new Date(t.awardedAt!).getTime() - new Date(t.createdAt).getTime());
      }, 0);
      avgCreatedToAwarded = dCreated / awardedRows.length / 86_400_000;
      const withSubmission = awardedRows.filter(t => t.submissionCloseAt != null);
      if (withSubmission.length > 0) {
        const dSub = withSubmission.reduce((s, t) => {
          return s + (new Date(t.awardedAt!).getTime() - new Date(t.submissionCloseAt!).getTime());
        }, 0);
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
      {
        label: 'Active Pipeline',
        value: activePipelineTotal,
        unit: 'KWD',
      },
      {
        label: 'Avg Days to Award',
        value: avgCreatedToAwarded != null ? Math.round(avgCreatedToAwarded) : 0,
        unit: 'days',
      },
      {
        label: 'Awarded Tenders',
        value: awardedRows.length,
        unit: 'count',
      },
    ];

    // ─── Monthly trend ───────────────────────────────────────────────────
    const monthly = new Map<string, MonthlyTrendPoint>();
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      monthly.set(key, { month: key, tenderCount: 0, estimatedValue: 0, awardedValue: 0 });
    }
    for (const t of thisYear) {
      const k = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const p = monthly.get(k);
      if (p) {
        p.tenderCount += 1;
        p.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
      }
    }
    for (const t of thisYear) {
      if (t.awardedAt && t.awardedAmount != null) {
        const k = `${t.awardedAt.getUTCFullYear()}-${String(t.awardedAt.getUTCMonth() + 1).padStart(2, '0')}`;
        const p = monthly.get(k);
        if (p) p.awardedValue += Number(t.awardedAmount);
      }
    }
    const monthlyTrend = Array.from(monthly.values());

    // ─── Department breakdown ────────────────────────────────────────────
    const byDeptMap = new Map<string, DepartmentBreakdown>();
    for (const t of thisYear) {
      const id = t.departmentId;
      let b = byDeptMap.get(id);
      if (!b) {
        b = {
          departmentId: id,
          departmentName: t.department?.name ?? '—',
          tenderCount: 0,
          estimatedValue: 0,
          awardedValue: 0,
        };
        byDeptMap.set(id, b);
      }
      b.tenderCount += 1;
      b.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
      b.awardedValue += t.awardedAmount != null ? Number(t.awardedAmount) : 0;
    }
    const byDepartment = Array.from(byDeptMap.values()).sort(
      (a, b) => b.estimatedValue - a.estimatedValue,
    );

    // ─── Category breakdown ──────────────────────────────────────────────
    const byCatMap = new Map<string, CategoryBreakdown>();
    for (const t of thisYear) {
      const c = t.category ?? 'Uncategorised';
      let b = byCatMap.get(c);
      if (!b) {
        b = { category: c, tenderCount: 0, estimatedValue: 0, awardedValue: 0 };
        byCatMap.set(c, b);
      }
      b.tenderCount += 1;
      b.estimatedValue += t.estimatedBudget != null ? Number(t.estimatedBudget) : 0;
      b.awardedValue += t.awardedAmount != null ? Number(t.awardedAmount) : 0;
    }
    const byCategory = Array.from(byCatMap.values()).sort(
      (a, b) => b.estimatedValue - a.estimatedValue,
    );

    // ─── Top vendors by award value ──────────────────────────────────────
    const vendorMap = new Map<string, VendorBreakdown>();
    for (const t of awardedRows) {
      if (!t.awardedVendorId || !t.awardedVendor) continue;
      let v = vendorMap.get(t.awardedVendorId);
      if (!v) {
        v = {
          vendorId: t.awardedVendorId,
          vendorName: t.awardedVendor.companyName,
          awardCount: 0,
          totalAwarded: 0,
          shareOfTotal: 0,
        };
        vendorMap.set(t.awardedVendorId, v);
      }
      v.awardCount += 1;
      v.totalAwarded += t.awardedAmount != null ? Number(t.awardedAmount) : 0;
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
        awardedTenderCount: awardedRows.length,
      },
    };
  }
}
