'use client';

// BUG-101 / BUG-102 (2026-06-04): Department directory view.
//
// Owner asked to restructure: directory list + click-to-drill, mirroring the
// vendor dashboard. This page is now just KPI strip + comparison bar +
// sortable clickable table. Per-department detail (tenders, top vendors,
// trend) lives at /executive/departments/[id].

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Award,
  Building2,
  ChevronRight,
  Layers,
  Loader2,
  PieChart,
  Printer,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface TopVendor {
  vendorId: string;
  vendorName: string;
  awardCount: number;
  totalAwarded: number;
}

interface DepartmentRow {
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
  topVendors: TopVendor[];
}

interface OverviewResponse {
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

// Rotating department tones — applied as the leading dot + comparison-bar
// awarded-fill colour. Same palette as vendor dashboard for cross-surface
// consistency.
const DEPT_TONES = [
  { bar: 'bg-blue-500',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  { bar: 'bg-emerald-500', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bar: 'bg-indigo-500',  text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  { bar: 'bg-amber-500',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  { bar: 'bg-purple-500',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  { bar: 'bg-rose-500',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  { bar: 'bg-cyan-500',    text: 'text-cyan-700',    dot: 'bg-cyan-500' },
  { bar: 'bg-teal-500',    text: 'text-teal-700',    dot: 'bg-teal-500' },
];

const SUMMARY_TONES = {
  blue:    { card: 'bg-blue-50/60 border-blue-200',       iconWrap: 'bg-blue-100',    iconColor: 'text-blue-600',    text: 'text-blue-700',    topBar: 'bg-blue-500' },
  indigo:  { card: 'bg-indigo-50/60 border-indigo-200',   iconWrap: 'bg-indigo-100',  iconColor: 'text-indigo-600',  text: 'text-indigo-700',  topBar: 'bg-indigo-500' },
  emerald: { card: 'bg-emerald-50/60 border-emerald-200', iconWrap: 'bg-emerald-100', iconColor: 'text-emerald-600', text: 'text-emerald-700', topBar: 'bg-emerald-500' },
  teal:    { card: 'bg-teal-50/60 border-teal-200',       iconWrap: 'bg-teal-100',    iconColor: 'text-teal-600',    text: 'text-teal-700',    topBar: 'bg-teal-500' },
} as const;

type SortKey = 'departmentName' | 'tenderCount' | 'awardedCount' | 'estimatedValue' | 'awardedValue' | 'savingsRate';

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

export default function ExecutiveDepartmentDirectoryPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('awardedValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await get<OverviewResponse>(`/analytics/departments?year=${year}`, token);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load department overview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const yearOptions: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

  const sortedRows = data
    ? [...data.rows].sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        const dir = sortDir === 'asc' ? 1 : -1;
        if (typeof av === 'string') return dir * av.localeCompare(bv);
        return dir * ((av ?? 0) - (bv ?? 0));
      })
    : [];

  const maxCompareValue = sortedRows.length > 0
    ? Math.max(1, ...sortedRows.map((r) => Math.max(r.estimatedValue, r.awardedValue)))
    : 1;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setSortDir(k === 'departmentName' ? 'asc' : 'desc');
    }
  };

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th
      className={`px-4 py-2.5 text-${align ?? 'left'} cursor-pointer select-none hover:bg-bg/40`}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Department Directory</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Per-department procurement activity. Click any row for the full department profile.
            {data ? ` Year-to-date as of ${new Date(data.generatedAt).toLocaleDateString('en-GB')}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary font-semibold uppercase tracking-wider">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {yearOptions.map((y) => (
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
      {loading && !data && (
        <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading department overview…
        </div>
      )}

      {data && (
        <>
          {/* Totals strip — BUG-135 (2026-06-15): tiles now drill into the
              org-wide tender list filtered by intent. Realised Savings goes
              red when negative + uses the BUG-134 sub-line copy. */}
          {(() => {
            const totals = data.totals;
            const estimateOfAwarded = totals.savings + totals.awardedValue;
            const isNegativeSavings = totals.savings < 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard
                  label="Departments Active"
                  value={String(totals.departmentCount)}
                  sub={`${totals.tenderCount} tender${totals.tenderCount === 1 ? '' : 's'} created`}
                  icon={Building2}
                  tone="blue"
                  href={`/executive/tenders?createdYear=${year}&statusNot=Cancelled`}
                />
                <SummaryCard
                  label="Total Estimated"
                  value={`${fmtKwd(totals.estimatedValue)} KWD`}
                  sub={fmtFullKwd(totals.estimatedValue) + ' KWD'}
                  icon={Wallet}
                  tone="indigo"
                  href={`/executive/tenders?createdYear=${year}&statusNot=Cancelled&sort=estimatedBudget:desc`}
                />
                <SummaryCard
                  label="Total Awarded"
                  value={`${fmtKwd(totals.awardedValue)} KWD`}
                  sub={`${totals.awardedCount} award${totals.awardedCount === 1 ? '' : 's'}`}
                  icon={Award}
                  tone="emerald"
                  href={`/executive/tenders?awardedYear=${year}&hasAward=true&sort=awardedAmount:desc`}
                />
                <SummaryCard
                  label="Realised Savings"
                  value={`${fmtKwd(totals.savings)} KWD`}
                  sub={
                    totals.awardedCount > 0
                      ? `Awarded ${fmtKwd(totals.awardedValue)} of ${fmtKwd(estimateOfAwarded)} KWD budgeted`
                      : '—'
                  }
                  icon={TrendingDown}
                  tone="teal"
                  href={`/executive/tenders?awardedYear=${year}&hasAward=true&sort=savings:desc`}
                  negative={isNegativeSavings}
                />
              </div>
            );
          })()}

          {/* Comparison bar */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-text-secondary" />
                  Department comparison — {year}
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Estimated value (lighter) vs Awarded value (darker), side by side. Click a row to drill into the department.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300" />Estimated
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500" />Awarded
                </span>
              </div>
            </div>
            {sortedRows.length === 0 ? (
              <p className="text-sm text-text-secondary text-center py-8">No tender activity in {year}.</p>
            ) : (
              <ul className="space-y-3">
                {sortedRows.map((row, i) => {
                  const tone = DEPT_TONES[i % DEPT_TONES.length];
                  const estPct = (row.estimatedValue / maxCompareValue) * 100;
                  const awdPct = (row.awardedValue / maxCompareValue) * 100;
                  return (
                    <li key={row.departmentId}>
                      <Link
                        href={`/executive/departments/${row.departmentId}?year=${year}`}
                        className="block hover:bg-bg/30 rounded-lg px-2 -mx-2 py-1 transition-colors"
                      >
                        <div className="flex items-center justify-between text-sm flex-wrap gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${tone.dot}`} />
                            <span className="font-semibold text-text-primary truncate">{row.departmentName}</span>
                            <span className="text-[10px] font-mono text-text-secondary uppercase">{row.departmentCode}</span>
                            <span className="text-[10px] text-text-secondary">
                              {row.tenderCount} tender{row.tenderCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="text-right font-mono text-xs">
                            <p className="text-text-primary">Est: {fmtKwd(row.estimatedValue)}</p>
                            <p className={tone.text}>Awd: {fmtKwd(row.awardedValue)}</p>
                          </div>
                        </div>
                        <div className="space-y-0.5 mt-1.5">
                          <div className="h-2 bg-bg rounded overflow-hidden">
                            <div className="h-full bg-slate-300 rounded" style={{ width: `${estPct}%` }} />
                          </div>
                          <div className="h-2 bg-bg rounded overflow-hidden">
                            <div className={`h-full ${tone.bar} rounded`} style={{ width: `${awdPct}%` }} />
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail table — clickable rows for drill-down */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-bg/30">
              <h2 className="text-base font-bold text-text-primary">All departments — {year}</h2>
              <p className="text-xs text-text-secondary mt-0.5">Click a row to open the department profile.</p>
            </div>
            {sortedRows.length === 0 ? (
              <p className="px-5 py-10 text-sm text-text-secondary text-center">No tender activity in {year}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
                      <SortHeader k="departmentName" label="Department" />
                      <SortHeader k="tenderCount" label="Tenders" align="right" />
                      <SortHeader k="awardedCount" label="Awarded" align="right" />
                      <SortHeader k="estimatedValue" label="Estimated (KWD)" align="right" />
                      <SortHeader k="awardedValue" label="Awarded (KWD)" align="right" />
                      <SortHeader k="savingsRate" label="Savings %" align="right" />
                      <th className="px-4 py-2.5 text-right w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedRows.map((row, i) => {
                      const tone = DEPT_TONES[i % DEPT_TONES.length];
                      return (
                        <tr key={row.departmentId} className="hover:bg-bg/40">
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/executive/departments/${row.departmentId}?year=${year}`}
                              className="inline-flex items-center gap-2 hover:text-accent"
                            >
                              <span className={`inline-block w-2 h-2 rounded-full ${tone.dot}`} />
                              <span className="text-text-primary font-medium">{row.departmentName}</span>
                              <span className="text-[10px] font-mono text-text-secondary uppercase">
                                {row.departmentCode}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.tenderCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.awardedCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmtFullKwd(row.estimatedValue)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{fmtFullKwd(row.awardedValue)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                            {row.estimateOfAwarded > 0 ? fmtPct(row.savingsRate) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/executive/departments/${row.departmentId}?year=${year}`}
                              className="inline-flex items-center text-accent hover:text-accent/80"
                              title="Open department profile"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-bg/40 font-semibold">
                    <tr>
                      <td className="px-4 py-2.5">Totals</td>
                      <td className="px-4 py-2.5 text-right font-mono">{data.totals.tenderCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{data.totals.awardedCount}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtFullKwd(data.totals.estimatedValue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtFullKwd(data.totals.awardedValue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtPct(data.totals.savingsRate)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  href,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof SUMMARY_TONES;
  // BUG-135 (2026-06-15): optional drill-down href + negative-value styling.
  href?: string;
  negative?: boolean;
}) {
  const style = SUMMARY_TONES[tone];
  const valueColor = negative ? 'text-danger' : style.text;
  const content = (
    <>
      <span className={`absolute inset-x-0 top-0 h-1 ${style.topBar}`} />
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${style.iconWrap}`}>
          <Icon className={`w-4 h-4 ${style.iconColor}`} />
        </span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-text-secondary">{sub}</p>}
    </>
  );
  const baseClass = `relative ${style.card} border rounded-xl p-5 space-y-2 overflow-hidden`;
  if (href) {
    return (
      <Link href={href} className={`${baseClass} block hover:shadow-md hover:-translate-y-0.5 transition`}>
        {content}
      </Link>
    );
  }
  return <div className={baseClass}>{content}</div>;
}
