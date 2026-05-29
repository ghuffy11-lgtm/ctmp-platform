'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { Plus, Search, AlertCircle, SearchX, Calendar, Eye, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';

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

const STATUS_PILL: Record<string, string> = {
  Draft: 'bg-surface-container-high text-on-surface-variant',
  'Internal Review': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  Approved: 'bg-secondary-container/10 text-secondary',
  Published: 'bg-secondary-container/10 text-secondary',
  'Clarification Period': 'bg-secondary-container/10 text-secondary',
  'Submission Closed': 'bg-secondary-container/10 text-secondary',
  'Technical Opening': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  'Technical Evaluation': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  'Commercial Sealed': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  'Committee Commercial Opening': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  'Commercial Evaluation / Comparison': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  'Award Recommendation': 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant',
  Awarded: 'bg-green-100 text-green-700',
  'Tender Closed': 'bg-surface-container-high text-on-surface-variant',
  Cancelled: 'bg-error-container text-on-error-container',
  Suspended: 'bg-error-container text-on-error-container',
  Archived: 'bg-surface-container-high text-on-surface-variant',
};

function getPaginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range: (number | '...')[] = [1];
  if (current > 3) range.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
  if (current < total - 2) range.push('...');
  range.push(total);
  return range;
}

export default function TendersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedTenders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Defer token-derived UI to after mount so SSR + first client render match
  // (BUG-046 hydration pattern).
  const [canCreate, setCanCreate] = useState(false);
  useEffect(() => {
    const t = getAccessToken();
    setCanCreate(!!t && hasPermission(t, 'tender:create'));
  }, []);

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
    <>
      {/* Page header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-md text-primary mb-1 font-semibold">All Tenders</h2>
          <p className="text-body-md text-on-surface-variant">Manage and monitor institutional procurement workflows.</p>
        </div>
        {canCreate && (
          <Link
            href="/tenders/new"
            className="bg-secondary text-on-secondary px-6 py-2.5 rounded-lg text-title-sm flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 duration-75"
          >
            <Plus className="w-5 h-5" />
            Create New Tender
          </Link>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[280px]">
          <label className="block text-label-md text-on-surface-variant mb-1.5 ml-1">Search Tender</label>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID, Name or Category..."
              className="w-full bg-white border border-outline-variant rounded-lg py-2 pl-10 pr-4 text-body-md focus:ring-2 focus:ring-secondary focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="w-56">
          <label className="block text-label-md text-on-surface-variant mb-1.5 ml-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-white border border-outline-variant rounded-lg py-2 px-3 text-body-md focus:ring-2 focus:ring-secondary focus:border-transparent outline-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            {TENDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {(search || status) && (
          <button
            onClick={() => { setSearch(''); setStatus(''); }}
            className="bg-surface-container-high text-on-surface-variant px-4 py-2 rounded-lg text-label-md hover:bg-surface-variant transition-colors border border-outline-variant"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-12 h-12 text-error" />
            <p className="text-body-sm text-on-surface-variant">{error}</p>
            <button onClick={fetchTenders} className="text-body-sm text-secondary hover:underline font-semibold">Retry</button>
          </div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider">Tender ID</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider">Tender Name</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider">Stage</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider">Closing Date</th>
                  <th className="px-6 py-4 text-label-md text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="border-b border-outline-variant/40">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="h-3.5 bg-surface-container rounded animate-pulse w-3/4" />
                      </td>
                    </tr>
                  ))
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <SearchX className="w-12 h-12 text-outline/40" />
                        <p className="text-body-sm text-on-surface-variant">No tenders found matching your criteria.</p>
                        {(search || status) && (
                          <button
                            onClick={() => { setSearch(''); setStatus(''); }}
                            className="text-body-sm text-secondary hover:underline font-medium"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.data.map((tender) => (
                    <tr key={tender.id} className="hover:bg-surface-container-lowest transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-label-md text-primary font-bold font-mono">{tender.referenceNumber}</span>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <Link href={`/tenders/${tender.id}`} className="text-body-md text-on-surface group-hover:text-secondary transition-colors font-medium truncate block">
                          {tender.title}
                        </Link>
                        <p className="text-body-sm text-on-surface-variant mt-0.5">{tender.departmentName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-body-sm text-on-surface-variant">{tender.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${STATUS_PILL[tender.status] ?? 'bg-surface-container-high text-on-surface-variant'}`}>
                          {tender.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {tender.submissionDeadline ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-outline" />
                            <span className="text-body-sm text-on-surface-variant">
                              {new Date(tender.submissionDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-body-sm text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/tenders/${tender.id}`} className="p-2 hover:bg-surface-container text-primary rounded transition-colors" title="View">
                            <Eye className="w-5 h-5" />
                          </Link>
                          <Link href={`/tenders/${tender.id}/edit`} className="p-2 hover:bg-surface-container text-primary rounded transition-colors" title="Edit">
                            <Pencil className="w-5 h-5" />
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
              <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-between">
                <p className="text-body-sm text-on-surface-variant">
                  Showing <span className="font-semibold text-on-surface">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total ?? 0)}</span> of <span className="font-semibold text-on-surface">{data?.total ?? 0}</span> tenders
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-on-surface-variant hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {getPaginationRange(page, totalPages).map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-body-sm text-on-surface-variant">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-body-sm font-semibold transition-colors ${
                          page === p ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant hover:bg-white'
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-on-surface-variant hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
