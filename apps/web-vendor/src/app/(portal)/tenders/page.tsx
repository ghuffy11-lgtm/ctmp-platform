'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  departmentName?: string;
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
}

export default function VendorTendersPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken();
        const res = await get<PaginatedTenders>('/tenders?pageSize=100', token).catch(
          () => ({ data: [], total: 0 } as PaginatedTenders),
        );
        setTenders(res.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = search
    ? tenders.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.referenceNumber.toLowerCase().includes(search.toLowerCase()),
      )
    : tenders;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Available Tenders</h1>
        <p className="text-sm text-text-secondary mt-0.5">Browse open tenders and submit bids.</p>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by reference or title…"
        className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent bg-card max-w-md"
      />

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[48px] text-text-secondary/20 block mb-2">gavel</span>
            <p className="text-sm text-text-secondary">No matching tenders.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Reference</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Title</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Department</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-bg/60">
                  <td className="px-5 py-3">
                    <Link href={`/tenders/${t.id}`} className="font-mono text-xs font-bold text-accent hover:underline">
                      {t.referenceNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/tenders/${t.id}`} className="font-semibold text-text-primary hover:text-accent">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{t.departmentName ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-success/10 text-success">
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-secondary text-xs">
                    {t.submissionDeadline
                      ? new Date(t.submissionDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
