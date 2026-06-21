'use client';

// BUG-133 (2026-06-14): drill-down target for every KPI tile + breakdown row
// on /executive. Reads from /analytics/tenders-list (executive:dashboard).
// Each row links back to /tenders/[id] for the regular detail view.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface TenderRow {
  id: string;
  reference: string;
  title: string;
  status: string;
  category: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
  awardedAt: string | null;
  awardedVendorId: string | null;
  awardedVendorName: string | null;
  estimatedBudget: number | null;
  awardedAmount: number | null;
  cycleDays: number | null;
  negotiationSavings: {
    originalPrice: number;
    finalPrice: number;
    savingsAmount: number;
    savingsPercent: number;
  } | null;
}

interface TendersListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: TenderRow[];
  currency: string;
  generatedAt: string;
}

function fmtKwd(v: number | null): string {
  if (v == null) return '—';
  return v.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ExecutiveTendersContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const params = useMemo(
    () => ({
      createdYear: sp.get('createdYear') ?? undefined,
      awardedYear: sp.get('awardedYear') ?? undefined,
      hasAward: sp.get('hasAward') ?? undefined,
      hasNegotiation: sp.get('hasNegotiation') ?? undefined,
      activeOnly: sp.get('activeOnly') ?? undefined,
      status: sp.get('status') ?? undefined,
      statusNot: sp.get('statusNot') ?? undefined,
      category: sp.get('category') ?? undefined,
      departmentId: sp.get('departmentId') ?? undefined,
      vendorId: sp.get('vendorId') ?? undefined,
      sort: sp.get('sort') ?? 'createdAt:desc',
    }),
    [sp],
  );

  const [data, setData] = useState<TendersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== '') qs.set(k, String(v));
        }
        qs.set('page', String(page));
        qs.set('pageSize', '50');
        const res = await get<TendersListResponse>(`/analytics/tenders-list?${qs.toString()}`, token);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, page]);

  // Build a human-readable title from the active filters.
  const filterTitle = useMemo(() => {
    const bits: string[] = [];
    if (params.activeOnly === 'true') bits.push('Active pipeline');
    if (params.hasAward === 'true') bits.push('Awarded');
    if (params.hasNegotiation === 'true') bits.push('with negotiation');
    if (params.awardedYear) bits.push(`awarded in ${params.awardedYear}`);
    else if (params.createdYear) bits.push(`created in ${params.createdYear}`);
    if (params.status) bits.push(`status: ${params.status}`);
    if (params.category) bits.push(`category: ${params.category}`);
    return bits.length === 0 ? 'All tenders' : bits.join(' · ');
  }, [params]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h1 className="text-xl font-bold text-text-primary">Tenders — {filterTitle}</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {data ? `${data.total} match${data.total === 1 ? '' : 'es'} · sorted by ${params.sort.replace(':', ' ')}` : ''}
          </p>
        </div>
        <Link
          href="/executive"
          className="text-xs text-accent hover:underline"
        >
          ← Back to Executive Dashboard
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg/50 border-b border-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-secondary">
                <th className="px-4 py-3 font-bold">Reference</th>
                <th className="px-4 py-3 font-bold">Title</th>
                <th className="px-4 py-3 font-bold">Department</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold text-right">Estimated</th>
                <th className="px-4 py-3 font-bold text-right">Awarded</th>
                <th className="px-4 py-3 font-bold text-right">Cycle</th>
                <th className="px-4 py-3 font-bold">Awarded At</th>
                <th className="px-4 py-3 font-bold w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-text-secondary">No tenders match these filters.</td></tr>
              ) : data.rows.map(r => (
                <tr key={r.id} className="hover:bg-bg/40">
                  <td className="px-4 py-3 font-mono text-xs text-text-primary">
                    <Link href={`/tenders/${r.id}`} className="hover:underline">{r.reference}</Link>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{r.title}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{r.departmentName ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKwd(r.estimatedBudget)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtKwd(r.awardedAmount)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary text-xs">
                    {r.cycleDays != null ? `${r.cycleDays}d` : '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{fmtDate(r.awardedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tenders/${r.id}`} className="inline-flex items-center text-accent hover:text-accent/80">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg/30">
              <p className="text-xs text-text-secondary">
                Page {page} of {totalPages} · {data.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 border border-border rounded text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 border border-border rounded text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExecutiveTendersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-secondary">Loading…</div>}>
      <ExecutiveTendersContent />
    </Suspense>
  );
}
