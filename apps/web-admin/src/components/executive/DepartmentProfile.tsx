'use client';

// BUG-102 (2026-06-04): Per-department drill-down profile. Mirrors the
// vendor detail page structure: header card + 4 tabs (Overview, Tenders,
// Spend Trend, Vendors). Year filter scopes tenders + metrics; spend trend
// always shows multi-year history.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Building2,
  ClipboardList,
  Hash,
  Layers,
  Loader2,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import type { DeptProfileLabels } from './labels';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface DepartmentProfileResponse {
  profile: { id: string; code: string; name: string; nameAr?: string | null };
  year: number | null;
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
  tenders: Array<{
    tenderId: string;
    reference: string;
    title: string;
    status: string;
    category: string | null;
    categoryAr?: string | null;
    estimatedBudget: number | null;
    awardedAmount: number | null;
    awardedAt: string | null;
    awardedVendorId: string | null;
    awardedVendorName: string | null;
    awardedVendorNameAr?: string | null;
    createdAt: string;
  }>;
  topVendors: Array<{ vendorId: string; vendorName: string; vendorNameAr?: string | null; awardCount: number; totalAwarded: number }>;
  spendByYear: Array<{ year: number; tenderCount: number; awardedCount: number; estimatedValue: number; awardedValue: number }>;
  spendByCategory: Array<{ category: string; categoryAr?: string | null; tenderCount: number; estimatedValue: number; awardedValue: number }>;
  currency: string;
  generatedAt: string;
}

type TabId = 'overview' | 'tenders' | 'spend' | 'vendors';
// Tab captions come from the label set so the Arabic profile reads properly.
const TABS: { id: TabId; labelKey: keyof Pick<DeptProfileLabels, 'overview' | 'tenders' | 'spendTrend' | 'vendors'>; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', labelKey: 'overview', icon: TrendingUp },
  { id: 'tenders', labelKey: 'tenders', icon: ClipboardList },
  { id: 'spend', labelKey: 'spendTrend', icon: Wallet },
  { id: 'vendors', labelKey: 'vendors', icon: Users },
];

const SUMMARY_TONES = {
  blue:    { card: 'bg-blue-50/60 border-blue-200',       iconWrap: 'bg-blue-100',    iconColor: 'text-blue-600',    text: 'text-blue-700',    topBar: 'bg-blue-500' },
  indigo:  { card: 'bg-indigo-50/60 border-indigo-200',   iconWrap: 'bg-indigo-100',  iconColor: 'text-indigo-600',  text: 'text-indigo-700',  topBar: 'bg-indigo-500' },
  emerald: { card: 'bg-emerald-50/60 border-emerald-200', iconWrap: 'bg-emerald-100', iconColor: 'text-emerald-600', text: 'text-emerald-700', topBar: 'bg-emerald-500' },
  teal:    { card: 'bg-teal-50/60 border-teal-200',       iconWrap: 'bg-teal-100',    iconColor: 'text-teal-600',    text: 'text-teal-700',    topBar: 'bg-teal-500' },
  amber:   { card: 'bg-amber-50/60 border-amber-200',     iconWrap: 'bg-amber-100',   iconColor: 'text-amber-600',   text: 'text-amber-700',   topBar: 'bg-amber-500' },
  purple:  { card: 'bg-purple-50/60 border-purple-200',   iconWrap: 'bg-purple-100',  iconColor: 'text-purple-600',  text: 'text-purple-700',  topBar: 'bg-purple-500' },
  rose:    { card: 'bg-rose-50/60 border-rose-200',       iconWrap: 'bg-rose-100',    iconColor: 'text-rose-600',    text: 'text-rose-700',    topBar: 'bg-rose-500' },
} as const;

function fmtKwd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
function fmtFullKwd(v: number): string {
  return v.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}
function fmtDate(iso: string | null, months?: string[] | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  // Arabic: build the string by hand from the label set. English keeps using
  // toLocaleDateString so its output cannot drift (en-GB spells September
  // "Sept", which a hand-written list has got wrong here before).
  if (months) return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function DepartmentProfile({
  labels,
  dir = 'ltr',
  interactive = true,
}: {
  labels: DeptProfileLabels;
  dir?: 'ltr' | 'rtl';
  /** false in Arabic: tender links still target English screens. */
  interactive?: boolean;
}) {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const departmentId = params?.id;
  const currentYear = new Date().getFullYear();
  const yearParam = searchParams?.get('year');
  const initialYear =
    yearParam == null
      ? currentYear
      : yearParam === 'all'
        ? ('all' as const)
        : Number.isFinite(Number(yearParam))
          ? Number(yearParam)
          : currentYear;
  const [year, setYear] = useState<number | 'all'>(initialYear);
  const [data, setData] = useState<DepartmentProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!departmentId) return;
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
        const res = await get<DepartmentProfileResponse>(
          `/analytics/departments/${departmentId}?year=${year}`,
          token,
        );
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : labels.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [departmentId, year]);

  const yearOptions: Array<number | 'all'> = ['all'];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

  if (loading && !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" /> {labels.loading}
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <Link href={labels.directoryHref} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" /> {labels.backToDirectory}
        </Link>
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const maxYearSpend = Math.max(1, ...data.spendByYear.map((y) => Math.max(y.estimatedValue, y.awardedValue)));
  const maxCat = Math.max(1, ...data.spendByCategory.map((c) => c.awardedValue));
  const maxVendorSpend = Math.max(1, ...data.topVendors.map((v) => v.totalAwarded));

  return (
    <div className="space-y-6">
      {/* Breadcrumb + year filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href={labels.directoryHref} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" /> {labels.backToDirectory}
        </Link>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary font-semibold uppercase tracking-wider">{labels.scope}</label>
          <select
            value={String(year)}
            onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {yearOptions.map((y) => (
              <option key={String(y)} value={String(y)}>
                {y === 'all' ? labels.allTime : y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100">
                <Layers className="w-5 h-5 text-blue-600" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight">{dir === 'rtl' ? (data.profile.nameAr?.trim() || data.profile.name) : data.profile.name}</h1>
                <p className="text-xs text-text-secondary mt-1 flex items-center gap-2">
                  <Hash className="w-3 h-3" />
                  <span className="font-mono uppercase">{data.profile.code}</span>
                  <span className="text-text-secondary/70">·</span>
                  <span>{year === 'all' ? 'All-time view' : labels.yearScope(year as number)}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-emerald-700">
              {labels.amount(fmtKwd(data.metrics.awardedValue))}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-0.5">{labels.awardedValueShort}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border flex items-center gap-1 px-3 bg-bg/30 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  active ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {labels[t.labelKey]}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <OverviewTab labels={labels}
              metrics={data.metrics}
              departmentId={data.profile.id}
              year={year}
              interactive={interactive}
            />
          )}
          {tab === 'tenders' && <TendersTab labels={labels} tenders={data.tenders} interactive={interactive} />}
          {tab === 'spend' && (
            <SpendTab labels={labels}
              spendByYear={data.spendByYear}
              spendByCategory={data.spendByCategory}
              maxYear={maxYearSpend}
              maxCat={maxCat}
            />
          )}
          {tab === 'vendors' && <VendorsTab labels={labels} vendors={data.topVendors} maxSpend={maxVendorSpend} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  labels,
  metrics,
  departmentId,
  year,
  interactive,
}: {
  labels: DeptProfileLabels;
  metrics: DepartmentProfileResponse['metrics'];
  departmentId: string;
  /** False on the Arabic page — every tile target is an English-only screen. */
  interactive: boolean;
  // BUG-135 (2026-06-15): year filter context for drill-down targets.
  // 'all' = no year scoping; a number = the selected calendar year.
  year: number | 'all';
}) {
  const yearQs = year === 'all' ? '' : `&createdYear=${year}`;
  const awYearQs = year === 'all' ? '' : `&awardedYear=${year}`;
  const base = `/executive/tenders?departmentId=${departmentId}`;
  // BUG-135 (2026-06-15): negative savings → red value; sub-line shows the
  // two numbers behind the calc (BUG-134 pattern, applied per-dept).
  const isNegative = metrics.savings < 0;
  // estimateOfAwarded is derivable from savings + awardedValue.
  const estimateOfAwarded = metrics.savings + metrics.awardedValue;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <Stat
        label={labels.tendersCreated}
        value={String(metrics.tenderCount)}
        icon={Package}
        tone="blue"
        href={interactive ? `${base}${yearQs}&statusNot=Cancelled` : undefined}
      />
      <Stat
        label={labels.awarded}
        value={String(metrics.awardedCount)}
        icon={Award}
        tone="emerald"
        href={interactive ? `${base}${awYearQs}&hasAward=true&sort=awardedAt:desc` : undefined}
      />
      <Stat
        label={labels.active}
        value={String(metrics.activeCount)}
        icon={TrendingUp}
        tone="amber"
        href={interactive ? `${base}&activeOnly=true&sort=estimatedBudget:desc` : undefined}
      />
      <Stat
        label={labels.distinctVendors}
        value={String(metrics.distinctVendors)}
        icon={Users}
        tone="purple"
        href={interactive ? `${base}${awYearQs}&hasAward=true&sort=awardedVendorName:asc` : undefined}
      />
      <Stat
        label={labels.estimatedValue}
        value={`${fmtKwd(metrics.estimatedValue)} ${labels.currency}`}
        sub={labels.amount(fmtFullKwd(metrics.estimatedValue))}
        icon={Wallet}
        tone="indigo"
        href={interactive ? `${base}${yearQs}&statusNot=Cancelled&sort=estimatedBudget:desc` : undefined}
      />
      <Stat
        label={labels.awardedValue}
        value={`${fmtKwd(metrics.awardedValue)} ${labels.currency}`}
        sub={labels.amount(fmtFullKwd(metrics.awardedValue))}
        icon={Award}
        tone="emerald"
        href={interactive ? `${base}${awYearQs}&hasAward=true&sort=awardedAmount:desc` : undefined}
      />
      <Stat
        label={labels.realisedSavings}
        value={`${fmtKwd(metrics.savings)} ${labels.currency}`}
        sub={
          metrics.awardedCount > 0
            ? labels.awardedOfBudget(fmtKwd(metrics.awardedValue), fmtKwd(estimateOfAwarded))
            : '—'
        }
        icon={TrendingDown}
        tone="teal"
        href={interactive ? `${base}${awYearQs}&hasAward=true&sort=savings:desc` : undefined}
        negative={isNegative}
      />
      <Stat
        label={labels.activePipeline}
        value={`${fmtKwd(metrics.activePipelineValue)} ${labels.currency}`}
        sub={labels.allYearsSuffix(fmtFullKwd(metrics.activePipelineValue))}
        icon={TrendingUp}
        tone="rose"
        href={interactive ? `${base}&activeOnly=true&sort=estimatedBudget:desc` : undefined}
      />
    </div>
  );
}

function Stat({
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
  // BUG-135 (2026-06-15): drill-down target. When provided, the tile becomes
  // a clickable Link with hover affordance.
  href?: string;
  // BUG-135 (2026-06-15): render the value in red when it represents a
  // cost overrun (negative savings). Mirrors main dashboard behaviour.
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
      <p className={`text-xl font-bold tracking-tight ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-text-secondary">{sub}</p>}
    </>
  );
  const baseClass = `relative ${style.card} border rounded-xl p-4 space-y-1 overflow-hidden`;
  if (href) {
    return (
      <Link href={href} className={`${baseClass} block hover:shadow-md hover:-translate-y-0.5 transition`}>
        {content}
      </Link>
    );
  }
  return <div className={baseClass}>{content}</div>;
}

function TendersTab({
  labels, tenders, interactive }: {
  labels: DeptProfileLabels; tenders: DepartmentProfileResponse['tenders'];
  /** False on the Arabic page — /tenders/[id] is an English-only screen. */
  interactive: boolean }) {
  if (tenders.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-10">{labels.noTenders}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
            <th className="px-4 py-2.5 text-left">{labels.reference}</th>
            <th className="px-4 py-2.5 text-left">{labels.title}</th>
            <th className="px-4 py-2.5 text-left">{labels.status}</th>
            <th className="px-4 py-2.5 text-left">{labels.category}</th>
            <th className="px-4 py-2.5 text-right">{labels.colEstimatedKwd}</th>
            <th className="px-4 py-2.5 text-right">{labels.colAwardedKwd}</th>
            <th className="px-4 py-2.5 text-left">{labels.winner}</th>
            <th className="px-4 py-2.5 text-right">{labels.created}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tenders.map((t) => (
            <tr key={t.tenderId} className="hover:bg-bg/40">
              <td className="px-4 py-2.5 font-mono text-text-secondary">
                {interactive
                  ? <Link href={`/tenders/${t.tenderId}`} className="hover:text-accent">{t.reference}</Link>
                  : t.reference}
              </td>
              <td className="px-4 py-2.5 text-text-primary">{t.title}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={t.status} label={labels.tenderStatus[t.status]} />
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{t.categoryAr?.trim() || t.category || '—'}</td>
              <td className="px-4 py-2.5 text-right font-mono">{t.estimatedBudget != null ? fmtFullKwd(t.estimatedBudget) : '—'}</td>
              <td className="px-4 py-2.5 text-right font-mono">{t.awardedAmount != null ? fmtFullKwd(t.awardedAmount) : '—'}</td>
              <td className="px-4 py-2.5">
                {t.awardedVendorName ? (
                  <Link href={`${labels.vendorHrefBase}/${t.awardedVendorId}`} className="text-accent hover:underline">
                    {t.awardedVendorNameAr?.trim() || t.awardedVendorName}
                  </Link>
                ) : (
                  <span className="text-text-secondary">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-text-secondary">{labels.date(fmtDate(t.createdAt, labels.months))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendTab({
  labels,
  spendByYear,
  spendByCategory,
  maxYear,
  maxCat,
}: {
  labels: DeptProfileLabels;
  spendByYear: DepartmentProfileResponse['spendByYear'];
  spendByCategory: DepartmentProfileResponse['spendByCategory'];
  maxYear: number;
  maxCat: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">{labels.yearOverYear}</h3>
        {spendByYear.length === 0 ? (
          <p className="text-sm text-text-secondary">{labels.noHistory}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end h-44">
            {spendByYear.map((y) => {
              const estPct = (y.estimatedValue / maxYear) * 100;
              const awdPct = (y.awardedValue / maxYear) * 100;
              return (
                <div key={y.year} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full flex items-end gap-0.5 h-full" title={labels.estAwd(fmtFullKwd(y.estimatedValue), fmtFullKwd(y.awardedValue))}>
                    <div
                      className="flex-1 bg-slate-300 rounded-t"
                      style={{ height: `${Math.max(2, estPct)}%` }}
                    />
                    <div
                      className="flex-1 bg-emerald-500 rounded-t"
                      style={{ height: `${Math.max(awdPct === 0 ? 0 : 2, awdPct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-text-secondary font-mono">{y.year}</p>
                  <p className="text-[10px] text-text-primary font-semibold">{fmtKwd(y.awardedValue)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">{labels.byCategory}</h3>
        {spendByCategory.length === 0 ? (
          <p className="text-sm text-text-secondary">{labels.noTenderActivity}</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {spendByCategory.map((c) => {
              const estPct = (c.estimatedValue / maxCat) * 100;
              const awdPct = (c.awardedValue / maxCat) * 100;
              return (
                <li key={c.category} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text-primary font-semibold truncate">{c.categoryAr?.trim() || c.category}</span>
                      <span className="text-[10px] text-text-secondary font-mono">
                        {c.tenderCount} tender{c.tenderCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="text-right shrink-0 font-mono text-xs">
                      <p className="text-text-primary">Est: {fmtKwd(c.estimatedValue)}</p>
                      <p className="text-emerald-700">Awd: {fmtKwd(c.awardedValue)}</p>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-1.5 bg-bg rounded">
                      <div className="h-full bg-slate-300 rounded" style={{ width: `${estPct}%` }} />
                    </div>
                    <div className="h-1.5 bg-bg rounded">
                      <div className="h-full bg-emerald-500 rounded" style={{ width: `${awdPct}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function VendorsTab({
  labels,
  vendors,
  maxSpend,
}: {
  labels: DeptProfileLabels;
  vendors: DepartmentProfileResponse['topVendors'];
  maxSpend: number;
}) {
  if (vendors.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-10">{labels.noVendorsAwarded}</p>;
  }
  return (
    <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
      {vendors.map((v, i) => {
        const pct = (v.totalAwarded / maxSpend) * 100;
        return (
          <li key={v.vendorId} className="px-4 py-3 space-y-1.5 hover:bg-bg/30">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-text-secondary">#{i + 1}</span>
                <Building2 className="w-3.5 h-3.5 text-text-secondary" />
                <Link href={`${labels.vendorHrefBase}/${v.vendorId}`} className="text-text-primary font-semibold truncate hover:text-accent">
                  {v.vendorNameAr?.trim() || v.vendorName}
                </Link>
                <span className="text-[10px] text-text-secondary font-mono">
                  {labels.awardsCount(v.awardCount)}
                </span>
              </div>
              <p className="text-emerald-700 font-mono text-xs font-semibold">{labels.amount(fmtKwd(v.totalAwarded))}</p>
            </div>
            <div className="h-1.5 bg-bg rounded">
              <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
