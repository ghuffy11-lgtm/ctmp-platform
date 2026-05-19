'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface TenderListItem {
  id: string;
  referenceNumber: string;
  title: string;
  category: string;
  status: string;
  submissionDeadline: string | null;
  departmentName: string;
  createdAt: string;
}

interface PaginatedTenders {
  data: TenderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const TENDER_STATUSES = [
  'Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period',
  'Submission Closed', 'Technical Opening', 'Technical Evaluation', 'Commercial Sealed',
  'Committee Commercial Opening', 'Commercial Evaluation / Comparison', 'Award Recommendation',
  'Awarded', 'Tender Closed', 'Cancelled', 'Suspended', 'Archived',
];

const PAGE_SIZE = 10;

function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range: (number | '...')[] = [1];
  if (current > 3) range.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
  if (current < total - 2) range.push('...');
  range.push(total);
  return range;
}

const SKELETON_WIDTHS = [
  ['w-24', 'w-44', 'w-28', 'w-20', 'w-28', 'w-16'],
  ['w-20', 'w-52', 'w-20', 'w-24', 'w-24', 'w-16'],
  ['w-28', 'w-36', 'w-28', 'w-20', 'w-24', 'w-16'],
  ['w-24', 'w-48', 'w-24', 'w-28', 'w-28', 'w-16'],
  ['w-20', 'w-40', 'w-20', 'w-20', 'w-24', 'w-16'],
  ['w-28', 'w-52', 'w-28', 'w-24', 'w-28', 'w-16'],
  ['w-24', 'w-44', 'w-20', 'w-20', 'w-24', 'w-16'],
  ['w-20', 'w-40', 'w-24', 'w-28', 'w-28', 'w-16'],
];

function SkeletonRow({ widths }: { widths: string[] }) {
  return (
    <tr className="border-b border-border">
      <td className="px-6 py-4"><div className={`h-3.5 bg-bg rounded animate-pulse ${widths[0]}`} /></td>
      <td className="px-6 py-4">
        <div className={`h-3.5 bg-bg rounded animate-pulse ${widths[1]} mb-1.5`} />
        <div className="h-3 bg-bg rounded animate-pulse w-28" />
      </td>
      <td className="px-6 py-4"><div className={`h-3.5 bg-bg rounded animate-pulse ${widths[2]}`} /></td>
      <td className="px-6 py-4"><div className={`h-5 bg-bg rounded-full animate-pulse ${widths[3]}`} /></td>
      <td className="px-6 py-4"><div className={`h-3.5 bg-bg rounded animate-pulse ${widths[4]}`} /></td>
      <td className="px-6 py-4"><div className="h-8 bg-bg rounded animate-pulse w-16 ml-auto" /></td>
    </tr>
  );
}

export default function TendersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedTenders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, status]);

  const fetchTenders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (status) params.set('status', status);
      const result = await get<PaginatedTenders>(`/tenders?${params}`, token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenders');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, page]);

  useEffect(() => { fetchTenders(); }, [fetchTenders]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="p-8 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">All Tenders</h1>
          <p className="text-sm text-text-secondary mt-1">Manage and monitor institutional procurement workflows.</p>
        </div>
        <Link
          href="/tenders/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create New Tender
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-card rounded-xl border border-border p-4 mb-5 flex flex-wrap items-end gap-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Search
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-secondary pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Reference, title, or category..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg placeholder:text-text-secondary/50 transition-shadow"
            />
          </div>
        </div>

        <div className="w-56">
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Status
          </label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full py-2 px-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-bg cursor-pointer transition-shadow"
          >
            <option value="">All Statuses</option>
            {TENDER_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {(search || status) && (
          <button
            onClick={() => { setSearch(''); setStatus(''); }}
            className="flex items-center gap-1.5 py-2 px-3 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-[48px] text-danger">error_outline</span>
            <p className="text-sm text-text-secondary">{error}</p>
            <button
              onClick={fetchTenders}
              className="text-sm text-accent hover:underline font-semibold"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Tender
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Closing Date
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-text-secondary uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  SKELETON_WIDTHS.map((widths, i) => <SkeletonRow key={i} widths={widths} />)
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="material-symbols-outlined text-[48px] text-text-secondary/30">
                          search_off
                        </span>
                        <p className="text-sm text-text-secondary">No tenders found matching your criteria.</p>
                        {(search || status) && (
                          <button
                            onClick={() => { setSearch(''); setStatus(''); }}
                            className="text-sm text-accent hover:underline font-medium"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.data.map(tender => (
                    <tr key={tender.id} className="hover:bg-bg/60 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-text-primary font-mono tracking-wide">
                          {tender.referenceNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                          {tender.title}
                        </p>
                        <p className="text-xs text-text-secondary mt-0.5">{tender.departmentName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{tender.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={tender.status} />
                      </td>
                      <td className="px-6 py-4">
                        {tender.submissionDeadline ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-text-secondary">
                              calendar_today
                            </span>
                            <span className="text-sm text-text-secondary">
                              {new Date(tender.submissionDeadline).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/tenders/${tender.id}`}
                            className="p-2 rounded-lg hover:bg-bg text-text-secondary hover:text-accent transition-colors"
                            title="View"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </Link>
                          <Link
                            href={`/tenders/${tender.id}/edit`}
                            className="p-2 rounded-lg hover:bg-bg text-text-secondary hover:text-accent transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="px-6 py-4 border-t border-border bg-bg flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  Showing{' '}
                  <span className="font-semibold text-text-primary">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total ?? 0)}
                  </span>
                  {' '}of{' '}
                  <span className="font-semibold text-text-primary">{data?.total ?? 0}</span>
                  {' '}tenders
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  {getPaginationRange(page, totalPages).map((p, i) =>
                    p === '...' ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="w-8 h-8 flex items-center justify-center text-xs text-text-secondary"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                          page === p
                            ? 'bg-accent text-white'
                            : 'text-text-secondary hover:bg-card'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
