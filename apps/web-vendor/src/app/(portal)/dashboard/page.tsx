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
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
}

export default function VendorDashboardPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = getAccessToken();
        const res = await get<PaginatedTenders>('/tenders?pageSize=10', token).catch(
          () => ({ data: [], total: 0 } as PaginatedTenders),
        );
        setTenders(res.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Welcome</h1>
        <p className="text-sm text-text-secondary mt-0.5">Active tender opportunities + your bid status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Open Tenders', value: tenders.length, icon: 'gavel', color: 'text-accent' },
          { label: 'My Bids (Draft)', value: 0, icon: 'edit_note', color: 'text-warning' },
          { label: 'My Bids (Submitted)', value: 0, icon: 'send', color: 'text-success' },
          { label: 'Awards Won', value: 0, icon: 'workspace_premium', color: 'text-brand' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-text-secondary">{s.label}</span>
              <span className={`material-symbols-outlined text-[20px] ${s.color}`}>{s.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg flex justify-between items-center">
          <h2 className="text-sm font-bold text-text-primary">Available Tenders</h2>
          <Link href="/tenders" className="text-xs font-semibold text-accent hover:underline">View all →</Link>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-text-secondary">Loading…</div>
        ) : tenders.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[40px] text-text-secondary/20 block mb-2">gavel</span>
            <p className="text-sm text-text-secondary">No open tenders right now.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg/50 border-b border-border">
              <tr>
                <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Reference</th>
                <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Title</th>
                <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenders.map(t => (
                <tr key={t.id} className="hover:bg-bg/60">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-accent">
                    <Link href={`/tenders/${t.id}`}>{t.referenceNumber}</Link>
                  </td>
                  <td className="px-5 py-3 font-semibold text-text-primary">{t.title}</td>
                  <td className="px-5 py-3 text-text-secondary">{t.status}</td>
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
