'use client';

// BUG-100 (2026-06-04): Executive vendor directory.
//
// Sibling to /executive — same permission gate (executive:dashboard) — but
// vendor-centric instead of tender-centric. Lists every vendor with lifetime
// award count, total spend, last-award date, win rate. Row click → vendor
// drill-down at /executive/vendors/[id].
//
// One backend call: GET /analytics/vendors with filters, pagination, sort.
// All aggregation lives server-side in AnalyticsService.listVendorDirectory.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronRight,
  Loader2,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import type { VendorDirLabels } from './labels';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface DirectoryRow {
  vendorId: string;
  companyName: string;
  companyNameAr?: string | null;
  status: string;
  country: string | null;
  awardCount: number;
  totalAwarded: number;
  lastAwardedAt: string | null;
  bidsSubmitted: number;
  winRate: number;
}

interface DirectoryResponse {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  kpis: {
    totalApprovedVendors: number;
    vendorsWithAwards: number;
    lifetimeSpend: number;
    top5SharePct: number;
  };
  currency: string;
  generatedAt: string;
}

type SortKey = 'companyName' | 'awardCount' | 'totalAwarded' | 'lastAwardedAt' | 'winRate';

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  PENDING: 'Internal Review',
  REJECTED: 'Cancelled',
  SUSPENDED: 'Suspended',
  BLACKLISTED: 'Cancelled',
};

const STATUS_OPTIONS = ['ALL', 'APPROVED', 'PENDING', 'SUSPENDED', 'BLACKLISTED', 'REJECTED'] as const;

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

// 2026-08-13: parameterised so /executive-ar/vendors renders the same
// implementation in Arabic. English defaults reproduce the previous behaviour.
// This component deliberately has NO `interactive` prop, unlike its siblings.
// It used to accept one and never read it — a switch wired to nothing — which is
// the same fault that let Arabic KPI tiles navigate to English pages unnoticed
// for eight days (see HANDOVER 2026-08-21). It is not needed here: all three
// links below are label-driven (`labels.dashboardHref`, `labels.profileHrefBase`)
// and every target has an Arabic equivalent, so Arabic rows correctly open the
// Arabic vendor profile. Gating them would REMOVE working navigation. If a link
// to an English-only screen is ever added here, add the prop back and actually
// read it — do not re-add a prop that does nothing.
export function VendorDirectory({
  labels,
  dir = 'ltr',
}: {
  labels: VendorDirLabels;
  dir?: 'ltr' | 'rtl';
}) {
  const currentYear = new Date().getFullYear();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('ALL');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('totalAwarded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (yearFilter) params.set('year', String(yearFilter));
      params.set('sort', `${sortKey}:${sortDir}`);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await get<DirectoryResponse>(`/analytics/vendors?${params.toString()}`, token);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, yearFilter, sortKey, sortDir, page]);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'companyName' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const yearOptions: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

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
    <div className="space-y-6" dir={dir}>
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">{labels.title}</h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {labels.subtitle}
          </p>
        </div>
        <Link
          href={labels.dashboardHref}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-card hover:bg-bg flex items-center gap-1.5 text-text-secondary"
        >
          <TrendingUp className="w-4 h-4" />
          {labels.backToDashboard}
        </Link>
      </div>

      {/* KPI strip — BUG-101 colourised */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label={labels.totalApproved}
            value={String(data.kpis.totalApprovedVendors)}
            icon={Users}
            tone="blue"
          />
          <KpiCard
            label={labels.withAwards}
            value={String(data.kpis.vendorsWithAwards)}
            icon={Building2}
            tone="emerald"
          />
          <KpiCard
            label={labels.lifetimeSpend}
            value={`${fmtKwd(data.kpis.lifetimeSpend)} ${labels.currency}`}
            icon={Wallet}
            tone="indigo"
          />
          <KpiCard
            label={labels.top5Concentration}
            value={fmtPct(data.kpis.top5SharePct)}
            icon={TrendingUp}
            tone={data.kpis.top5SharePct >= 75 ? 'rose' : data.kpis.top5SharePct >= 50 ? 'amber' : 'teal'}
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl px-5 py-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{labels.search}</label>
          <div className="mt-1 relative">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={labels.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-bg/30 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{labels.status}</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number]);
              setPage(1);
            }}
            className="mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-bg/30 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? labels.allStatuses : labels.statusLabels[s] ?? STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{labels.awardYear}</label>
          <select
            value={yearFilter === '' ? '' : String(yearFilter)}
            onChange={(e) => {
              setYearFilter(e.target.value === '' ? '' : Number(e.target.value));
              setPage(1);
            }}
            className="mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-bg/30 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">{labels.allYears}</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {labels.loading}
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-bg/30 flex items-center justify-between">
            <h2 className="text-base font-bold text-text-primary">
              {labels.vendorCount(data.total)}
              {q.trim() ? ` matching "${q.trim()}"` : ''}
            </h2>
            <p className="text-xs text-text-secondary">
              {labels.pageOf(data.page, totalPages)}
            </p>
          </div>
          {data.rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-text-secondary text-center">{labels.noMatches}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
                  <SortHeader k="companyName" label={labels.colCompany} />
                  <th className="px-4 py-2.5 text-left">{labels.status}</th>
                  <SortHeader k="awardCount" label={labels.colAwards} align="right" />
                  <SortHeader k="totalAwarded" label={labels.colTotal} align="right" />
                  <SortHeader k="lastAwardedAt" label={labels.colLastAward} align="right" />
                  <SortHeader k="winRate" label={labels.colWinRate} align="right" />
                  <th className="px-4 py-2.5 text-right w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.vendorId} className="hover:bg-bg/40">
                    <td className="px-4 py-3">
                      {/* Arabic: plain text — the per-vendor profile is an
                          English screen. Falls back to the Latin name per row. */}
                      {/* The Arabic profile now exists, so rows link there
                          instead of rendering as dead text. */}
                      <Link
                        href={`${labels.profileHrefBase}/${r.vendorId}`}
                        className="text-text-primary font-medium hover:text-accent"
                      >
                        {dir === 'rtl' ? (r.companyNameAr?.trim() || r.companyName) : r.companyName}
                      </Link>
                      {r.country && (
                        <span className="ml-2 text-[10px] text-text-secondary font-mono uppercase">{r.country}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={labels.statusLabels[r.status] ?? STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.awardCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtFullKwd(r.totalAwarded)}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">{labels.date(fmtDate(r.lastAwardedAt, labels.months))}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.bidsSubmitted > 0 ? fmtPct(r.winRate) : '—'}
                      {r.bidsSubmitted > 0 && (
                        <span className="ml-1 text-[10px] text-text-secondary font-normal">
                          ({r.awardCount}/{r.bidsSubmitted})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`${labels.profileHrefBase}/${r.vendorId}`}
                        className="inline-flex items-center text-accent hover:text-accent/80"
                        title={labels.viewProfile}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border bg-bg/20 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs border border-border rounded-lg bg-card hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <p className="text-xs text-text-secondary">
                Showing {(data.page - 1) * data.pageSize + 1}–
                {Math.min(data.page * data.pageSize, data.total)} of {data.total}
              </p>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs border border-border rounded-lg bg-card hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// BUG-101 (2026-06-04): colourised KPI card. Tones picked to match the
// /executive dashboard family — Tailwind classes inlined per tone so the JIT
// keeps them at build.
type KpiTone = 'blue' | 'indigo' | 'emerald' | 'teal' | 'amber' | 'rose';
const KPI_TONE_STYLES: Record<KpiTone, { card: string; iconWrap: string; iconColor: string; value: string; topBar: string }> = {
  blue:    { card: 'bg-blue-50/60 border-blue-200',       iconWrap: 'bg-blue-100',    iconColor: 'text-blue-600',    value: 'text-blue-700',    topBar: 'bg-blue-500' },
  indigo:  { card: 'bg-indigo-50/60 border-indigo-200',   iconWrap: 'bg-indigo-100',  iconColor: 'text-indigo-600',  value: 'text-indigo-700',  topBar: 'bg-indigo-500' },
  emerald: { card: 'bg-emerald-50/60 border-emerald-200', iconWrap: 'bg-emerald-100', iconColor: 'text-emerald-600', value: 'text-emerald-700', topBar: 'bg-emerald-500' },
  teal:    { card: 'bg-teal-50/60 border-teal-200',       iconWrap: 'bg-teal-100',    iconColor: 'text-teal-600',    value: 'text-teal-700',    topBar: 'bg-teal-500' },
  amber:   { card: 'bg-amber-50/60 border-amber-200',     iconWrap: 'bg-amber-100',   iconColor: 'text-amber-600',   value: 'text-amber-700',   topBar: 'bg-amber-500' },
  rose:    { card: 'bg-rose-50/60 border-rose-200',       iconWrap: 'bg-rose-100',    iconColor: 'text-rose-600',    value: 'text-rose-700',    topBar: 'bg-rose-500' },
};

function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
}) {
  const style = KPI_TONE_STYLES[tone];
  return (
    <div className={`relative ${style.card} border rounded-xl p-5 space-y-2 overflow-hidden`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${style.topBar}`} />
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${style.iconWrap}`}>
          <Icon className={`w-4 h-4 ${style.iconColor}`} />
        </span>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${style.value}`}>{value}</p>
    </div>
  );
}
