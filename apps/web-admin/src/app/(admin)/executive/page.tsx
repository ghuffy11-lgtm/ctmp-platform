'use client';

// BUG-086 Phase 1 (2026-06-02): Executive Dashboard MVP.
//
// Single-page financial / management view. One API call to
// `/analytics/executive-summary?year=YYYY` returns everything. Pure CSS bar
// charts (Tailwind widths) so we don't add a chart library dep for v1.
//
// Phase-2 roadmap (not built yet):
//   - Drill-down: clicking a KPI / dept row → filtered tender list
//   - Time-range picker beyond year (quarter / fiscal year / custom range)
//   - Export to PDF (window.print is in place via the Print button; richer
//     export is a follow-up)
//   - Forecast widget based on Draft/Internal Review pipeline value
//   - Stage velocity heatmap (days per state transition)
//   - Scheduled email digest to executives

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Clock,
  Loader2,
  Minus,
  Printer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface KpiCard {
  label: string;
  // BUG-133 (2026-06-14): nullable so "Avg Days to Award" can render "—"
  // when no awarded tenders match.
  value: number | null;
  unit: 'count' | 'KWD' | 'days' | 'percent';
  yoyDelta?: number | null;
  numerator?: number;
  denominator?: number;
}
interface MonthlyTrendPoint {
  month: string;
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}
interface DepartmentBreakdown {
  departmentId: string;
  departmentName: string;
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}
interface CategoryBreakdown {
  category: string;
  tenderCount: number;
  estimatedValue: number;
  awardedValue: number;
}
interface VendorBreakdown {
  vendorId: string;
  vendorName: string;
  awardCount: number;
  totalAwarded: number;
  shareOfTotal: number;
}
interface PipelineByStatus {
  status: string;
  count: number;
  estimatedValue: number;
}
interface ExecutiveSummary {
  year: number;
  generatedAt: string;
  currency: string;
  kpis: KpiCard[];
  monthlyTrend: MonthlyTrendPoint[];
  byDepartment: DepartmentBreakdown[];
  byCategory: CategoryBreakdown[];
  topVendors: VendorBreakdown[];
  vendorConcentration: { top3Share: number; top5Share: number; totalVendors: number };
  pipeline: PipelineByStatus[];
  cycleTime: { avgDaysCreatedToAwarded: number | null; avgDaysSubmissionClosedToAwarded: number | null; awardedTenderCount: number };
}

function fmtKwd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtFullKwd(v: number): string {
  return v.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

// BUG-133 (2026-06-14): each KPI tile drills into a filtered tender list.
function drillDownHrefForKpi(label: string, year: number): string {
  const base = '/executive/tenders';
  switch (label) {
    case 'Tenders Created':
      return `${base}?createdYear=${year}`;
    case 'Estimated Value':
      return `${base}?createdYear=${year}&statusNot=Cancelled&sort=estimatedBudget:desc`;
    case 'Awarded Value':
      return `${base}?awardedYear=${year}&hasAward=true&sort=awardedAmount:desc`;
    case 'Realised Savings':
    case 'Savings Rate':
      return `${base}?awardedYear=${year}&hasAward=true&sort=savings:desc`;
    case 'Negotiation Savings':
      return `${base}?awardedYear=${year}&hasAward=true&hasNegotiation=true&sort=savings:desc`;
    case 'Active Pipeline':
      return `${base}?activeOnly=true&sort=estimatedBudget:desc`;
    case 'Avg Days to Award':
      return `${base}?awardedYear=${year}&hasAward=true&sort=cycleDays:desc`;
    case 'Awarded Tenders':
      return `${base}?awardedYear=${year}&hasAward=true&sort=awardedAt:desc`;
    default:
      return base;
  }
}

function fmtKpi(value: number | null, unit: KpiCard['unit']): string {
  if (value == null) return '—';
  switch (unit) {
    case 'KWD':
      return `${fmtKwd(value)} KWD`;
    case 'percent':
      return fmtPct(value);
    case 'days':
      return `${Math.round(value)}d`;
    case 'count':
    default:
      return value.toLocaleString('en-GB');
  }
}

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Tenders Created': TrendingUp,
  'Estimated Value': Wallet,
  'Awarded Value': Wallet,
  'Realised Savings': TrendingDown,
  'Savings Rate': TrendingDown,
  // BUG-133 (2026-06-14): new Negotiation Savings tile.
  'Negotiation Savings': TrendingDown,
  'Active Pipeline': TrendingUp,
  'Avg Days to Award': Clock,
  'Awarded Tenders': Building2,
};

// BUG-101 (2026-06-04): owner asked for a more colourful Executive Dashboard
// matching "standard colors of expenses" — blue/indigo for counts + estimates,
// emerald/teal for money awarded + savings (positive), amber for in-flight,
// purple for time. Each KPI gets a distinct accent so the strip reads at a
// glance instead of being a wall of neutral cards. Tailwind classes are
// inlined (not interpolated) so the JIT compiler retains them at build.
interface KpiStyle {
  card: string;
  iconWrap: string;
  iconColor: string;
  value: string;
  topBar: string;
}
const KPI_STYLES: Record<string, KpiStyle> = {
  'Tenders Created':     { card: 'bg-blue-50/60 border-blue-200',     iconWrap: 'bg-blue-100',     iconColor: 'text-blue-600',     value: 'text-blue-700',     topBar: 'bg-blue-500' },
  'Estimated Value':     { card: 'bg-indigo-50/60 border-indigo-200', iconWrap: 'bg-indigo-100',   iconColor: 'text-indigo-600',   value: 'text-indigo-700',   topBar: 'bg-indigo-500' },
  'Awarded Value':       { card: 'bg-emerald-50/60 border-emerald-200', iconWrap: 'bg-emerald-100', iconColor: 'text-emerald-600', value: 'text-emerald-700', topBar: 'bg-emerald-500' },
  'Realised Savings':    { card: 'bg-teal-50/60 border-teal-200',     iconWrap: 'bg-teal-100',     iconColor: 'text-teal-600',     value: 'text-teal-700',     topBar: 'bg-teal-500' },
  'Savings Rate':        { card: 'bg-green-50/60 border-green-200',   iconWrap: 'bg-green-100',    iconColor: 'text-green-600',    value: 'text-green-700',    topBar: 'bg-green-500' },
  // BUG-133 (2026-06-14): Negotiation Savings — sky to distinguish from green
  // (estimate-vs-award) Realised Savings.
  'Negotiation Savings': { card: 'bg-sky-50/60 border-sky-200',       iconWrap: 'bg-sky-100',      iconColor: 'text-sky-600',      value: 'text-sky-700',      topBar: 'bg-sky-500' },
  'Active Pipeline':     { card: 'bg-amber-50/60 border-amber-200',   iconWrap: 'bg-amber-100',    iconColor: 'text-amber-600',    value: 'text-amber-700',    topBar: 'bg-amber-500' },
  'Avg Days to Award':   { card: 'bg-purple-50/60 border-purple-200', iconWrap: 'bg-purple-100',   iconColor: 'text-purple-600',   value: 'text-purple-700',   topBar: 'bg-purple-500' },
  'Awarded Tenders':     { card: 'bg-cyan-50/60 border-cyan-200',     iconWrap: 'bg-cyan-100',     iconColor: 'text-cyan-600',     value: 'text-cyan-700',     topBar: 'bg-cyan-500' },
};
const KPI_FALLBACK: KpiStyle = { card: 'bg-slate-50/60 border-slate-200', iconWrap: 'bg-slate-100', iconColor: 'text-slate-600', value: 'text-slate-700', topBar: 'bg-slate-400' };

export default function ExecutiveDashboardPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const res = await get<ExecutiveSummary>(`/analytics/executive-summary?year=${year}`, token);
        if (!cancelled) setSummary(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load summary');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  const yearOptions: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

  // Bar-chart max for monthly trend so all bars share a denominator.
  const maxMonthly = summary
    ? Math.max(
        1,
        ...summary.monthlyTrend.map(p => Math.max(p.estimatedValue, p.awardedValue)),
      )
    : 1;
  const maxDept = summary
    ? Math.max(1, ...summary.byDepartment.map(d => Math.max(d.estimatedValue, d.awardedValue)))
    : 1;
  const maxCat = summary
    ? Math.max(1, ...summary.byCategory.map(c => Math.max(c.estimatedValue, c.awardedValue)))
    : 1;
  const concentrationTone = (pct: number) =>
    pct >= 75 ? 'text-danger' : pct >= 50 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Executive Dashboard</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Financial &amp; operational summary across procurement. Year-to-date as of{' '}
            {summary ? new Date(summary.generatedAt).toLocaleDateString('en-GB') : '—'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary font-semibold uppercase tracking-wider">Year</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card hover:bg-bg flex items-center gap-1.5 text-text-secondary"
            title="Print or save as PDF"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && !summary && (
        <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading executive summary…
        </div>
      )}

      {summary && (
        <>
          {/* KPI Strip — BUG-101 colourised; BUG-133 drill-down links. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summary.kpis.map(kpi => {
              const Icon = KPI_ICONS[kpi.label] ?? TrendingUp;
              const style = KPI_STYLES[kpi.label] ?? KPI_FALLBACK;
              const delta = kpi.yoyDelta;
              // BUG-133: each tile drills into a focused tender list.
              const drillHref = drillDownHrefForKpi(kpi.label, year);
              // BUG-133: Realised Savings + Savings Rate render red when
              // the value is negative (overruns exceeded gains).
              const isNegative =
                (kpi.label === 'Realised Savings' || kpi.label === 'Savings Rate') &&
                typeof kpi.value === 'number' && kpi.value < 0;
              const valueColor = isNegative ? 'text-danger' : style.value;
              return (
                <Link
                  key={kpi.label}
                  href={drillHref}
                  className={`relative ${style.card} border rounded-xl p-5 space-y-2 overflow-hidden block hover:shadow-md hover:-translate-y-0.5 transition`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${style.topBar}`} />
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                      {kpi.label}
                      {kpi.label === 'Active Pipeline' && (
                        <span className="ml-1 font-normal normal-case text-text-secondary/80">(all years)</span>
                      )}
                    </p>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${style.iconWrap}`}>
                      <Icon className={`w-4 h-4 ${style.iconColor}`} />
                    </span>
                  </div>
                  <p className={`text-2xl font-bold tracking-tight ${valueColor} flex items-center gap-1`}>
                    {isNegative && <ArrowDownRight className="w-5 h-5" />}
                    {fmtKpi(kpi.value, kpi.unit)}
                  </p>
                  {delta != null && (
                    <div className={`flex items-center gap-1 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                      {delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : delta < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      {kpi.unit === 'KWD' ? `${fmtKwd(Math.abs(delta))} KWD` : Math.abs(delta).toLocaleString('en-GB')}
                      <span className="text-text-secondary font-normal">vs {year - 1}</span>
                    </div>
                  )}
                  {/* Realised Savings: show ratio. Negotiation Savings:
                      show award count + avg %. */}
                  {kpi.label === 'Negotiation Savings' && kpi.numerator != null && kpi.denominator != null && (
                    <p className="text-[11px] text-text-secondary">
                      {kpi.numerator.toLocaleString('en-GB')} awards · avg {kpi.denominator.toFixed(1)}%
                    </p>
                  )}
                  {kpi.label === 'Realised Savings' && kpi.numerator != null && kpi.denominator != null && kpi.denominator > 0 && (
                    // BUG-134 (2026-06-15): clearer sub-line. Owner read the
                    // old "2.7K of 150K KWD estimated" as a progress fraction.
                    // Show what was actually awarded vs what was budgeted —
                    // the savings = budgeted − awarded is the main tile value.
                    <p className="text-[11px] text-text-secondary">
                      Awarded {fmtKwd(kpi.denominator - kpi.numerator)} of {fmtKwd(kpi.denominator)} KWD budgeted
                    </p>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Monthly Trend */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-text-primary">Monthly Trend — {year}</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Estimated value (blue) vs Awarded value (emerald), per month.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-accent" />Estimated</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" />Awarded</span>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-1 items-end h-48">
              {summary.monthlyTrend.map(p => {
                const estPct = (p.estimatedValue / maxMonthly) * 100;
                const awdPct = (p.awardedValue / maxMonthly) * 100;
                const monthLabel = new Date(`${p.month}-01`).toLocaleDateString('en-GB', { month: 'short' });
                return (
                  <div key={p.month} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex items-end gap-0.5 h-full">
                      <div
                        className="flex-1 bg-accent/80 rounded-t hover:bg-accent transition-colors"
                        style={{ height: `${Math.max(2, estPct)}%` }}
                        title={`Estimated: ${fmtFullKwd(p.estimatedValue)} KWD`}
                      />
                      <div
                        className="flex-1 bg-emerald-500/80 rounded-t hover:bg-emerald-500 transition-colors"
                        style={{ height: `${Math.max(awdPct === 0 ? 0 : 2, awdPct)}%` }}
                        title={`Awarded: ${fmtFullKwd(p.awardedValue)} KWD`}
                      />
                    </div>
                    <p className="text-[10px] text-text-secondary font-mono">{monthLabel}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Department + Category Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownCard
              title="By Department"
              subtitle="Estimated + Awarded value per department"
              items={summary.byDepartment.map(d => ({
                key: d.departmentId,
                label: d.departmentName,
                count: d.tenderCount,
                estimatedValue: d.estimatedValue,
                awardedValue: d.awardedValue,
              }))}
              max={maxDept}
              // BUG-133 (2026-06-14): drill into per-department executive view.
              linkTarget={(deptId) => `/executive/departments/${deptId}?year=${year}`}
            />
            <BreakdownCard
              title="By Category"
              subtitle="Procurement spend by tender category"
              items={summary.byCategory.map(c => ({
                key: c.category,
                label: c.category,
                count: c.tenderCount,
                estimatedValue: c.estimatedValue,
                awardedValue: c.awardedValue,
              }))}
              max={maxCat}
              // BUG-133: drill into a filtered tender list scoped to the category.
              linkTarget={(_key, label) => `/executive/tenders?awardedYear=${year}&category=${encodeURIComponent(label)}&hasAward=true&sort=awardedAmount:desc`}
            />
          </div>

          {/* Top Vendors + Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Top Vendors */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-bg/30 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-text-secondary" /> Top Vendors by Award Value
                  </h2>
                  <p className="text-xs text-text-secondary mt-0.5">Ranked by total awarded amount in {year}.</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">Concentration</p>
                  <p className={`text-sm font-bold ${concentrationTone(summary.vendorConcentration.top3Share)}`}>
                    Top 3: {fmtPct(summary.vendorConcentration.top3Share)}
                  </p>
                  <p className="text-[11px] text-text-secondary">
                    Top 5: {fmtPct(summary.vendorConcentration.top5Share)} · Active: {summary.vendorConcentration.totalVendors}
                  </p>
                </div>
              </div>
              {summary.topVendors.length === 0 ? (
                <p className="px-5 py-8 text-sm text-text-secondary text-center">No awards in {year} yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
                      <th className="px-5 py-2.5 text-left w-10">#</th>
                      <th className="px-5 py-2.5 text-left">Vendor</th>
                      <th className="px-5 py-2.5 text-right w-20">Awards</th>
                      <th className="px-5 py-2.5 text-right w-32">Total (KWD)</th>
                      <th className="px-5 py-2.5 text-right w-24">Share</th>
                      <th className="px-5 py-2.5 text-right w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* BUG-100 (2026-06-04): rows are now clickable — link to
                        the per-vendor executive profile drill-down. */}
                    {summary.topVendors.map((v, i) => (
                      <tr key={v.vendorId} className="hover:bg-bg/40">
                        <td className="px-5 py-2.5 text-text-secondary font-mono">{i + 1}</td>
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/executive/vendors/${v.vendorId}`}
                            className="text-text-primary hover:text-accent"
                          >
                            {v.vendorName}
                          </Link>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono">{v.awardCount}</td>
                        <td className="px-5 py-2.5 text-right font-mono">{fmtFullKwd(v.totalAwarded)}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-text-secondary">{fmtPct(v.shareOfTotal)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <Link
                            href={`/executive/vendors/${v.vendorId}`}
                            className="inline-flex items-center text-accent hover:text-accent/80"
                            title="View vendor profile"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Active Pipeline */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-bg/30">
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Users className="w-4 h-4 text-text-secondary" /> Active Pipeline
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">All in-flight tenders, by status.</p>
              </div>
              {summary.pipeline.length === 0 ? (
                <p className="px-5 py-8 text-sm text-text-secondary text-center">No active tenders.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {summary.pipeline.map(p => (
                    <li key={p.status} className="hover:bg-bg/40 transition">
                      {/* BUG-133 (2026-06-14): drill into tenders in this state. */}
                      <Link
                        href={`/executive/tenders?activeOnly=true&status=${encodeURIComponent(p.status)}&sort=estimatedBudget:desc`}
                        className="px-5 py-2.5 flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="text-text-primary font-medium">{p.status}</p>
                          <p className="text-xs text-text-secondary">{p.count} tender{p.count === 1 ? '' : 's'}</p>
                        </div>
                        <p className="text-text-primary font-mono font-semibold">{fmtKwd(p.estimatedValue)} KWD</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Cycle time footer */}
          <div className="bg-card border border-border rounded-xl px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Avg Cycle (Created → Awarded)</p>
              <p className="text-lg font-bold text-text-primary mt-1">
                {summary.cycleTime.avgDaysCreatedToAwarded != null
                  ? `${Math.round(summary.cycleTime.avgDaysCreatedToAwarded)} days`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Avg Cycle (Submission Closed → Awarded)</p>
              <p className="text-lg font-bold text-text-primary mt-1">
                {summary.cycleTime.avgDaysSubmissionClosedToAwarded != null
                  ? `${Math.round(summary.cycleTime.avgDaysSubmissionClosedToAwarded)} days`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Sample Size</p>
              <p className="text-lg font-bold text-text-primary mt-1">{summary.cycleTime.awardedTenderCount} awarded</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  items,
  max,
  // BUG-133 (2026-06-14): optional row→href so each breakdown row drills in.
  linkTarget,
}: {
  title: string;
  subtitle: string;
  items: Array<{ key: string; label: string; count: number; estimatedValue: number; awardedValue: number }>;
  max: number;
  linkTarget?: (key: string, label: string) => string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-bg/30">
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-text-secondary text-center">No data for the selected year.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(it => {
            const estPct = (it.estimatedValue / max) * 100;
            const awdPct = (it.awardedValue / max) * 100;
            const content = (
              <>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-primary font-semibold truncate">{it.label}</span>
                    <span className="text-[10px] text-text-secondary font-mono">{it.count} tender{it.count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <p className="text-text-primary text-xs">Est: {fmtKwd(it.estimatedValue)}</p>
                    <p className="text-emerald-700 text-xs">Awd: {fmtKwd(it.awardedValue)}</p>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="h-1.5 bg-bg rounded">
                    <div className="h-full bg-accent rounded" style={{ width: `${estPct}%` }} />
                  </div>
                  <div className="h-1.5 bg-bg rounded">
                    <div className="h-full bg-emerald-500 rounded" style={{ width: `${awdPct}%` }} />
                  </div>
                </div>
              </>
            );
            return (
              <li key={it.key} className="px-5 py-3 space-y-1.5 hover:bg-bg/40 transition">
                {linkTarget ? (
                  <Link href={linkTarget(it.key, it.label)} className="block space-y-1.5">
                    {content}
                  </Link>
                ) : content}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
