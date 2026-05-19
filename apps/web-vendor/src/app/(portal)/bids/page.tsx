'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface MyBidSummary {
  id: string;
  tenderId: string;
  tenderReference: string;
  tenderTitle: string;
  tenderStatus: string;
  submissionDeadline: string | null;
  status: string;
  submittedAt: string | null;
  technicalResult?: 'PASS' | 'FAIL';
  technicalEnvelopeStatus: string;
  commercialEnvelopeStatus: string;
  receiptNumber?: string;
}

export default function VendorBidsPage() {
  const [bids, setBids] = useState<MyBidSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const res = await get<{ items: MyBidSummary[]; total: number }>(
          '/vendor-auth/me/bids?pageSize=100',
          token,
        );
        setBids(res.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bids');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const drafts = bids.filter(b => b.status === 'DRAFT').length;
  const submitted = bids.filter(b => b.status === 'SUBMITTED' || b.status === 'LATE_SUBMITTED').length;
  const evaluated = bids.filter(b => b.status === 'EVALUATED').length;
  const awarded = bids.filter(b => b.status === 'AWARDED').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">My Bids</h1>
        <p className="text-sm text-text-secondary mt-0.5">Draft, submitted, and historical bids across all tenders.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Drafts" value={drafts} icon="edit_note" color="text-warning" />
        <Stat label="Submitted" value={submitted} icon="send" color="text-accent" />
        <Stat label="Evaluated" value={evaluated} icon="fact_check" color="text-text-primary" />
        <Stat label="Won" value={awarded} icon="workspace_premium" color="text-success" />
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>
        ) : bids.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[48px] text-text-secondary/20 block mb-2">inventory_2</span>
            <p className="text-sm text-text-secondary mb-3">You have no bids yet.</p>
            <Link href="/tenders" className="inline-block px-4 py-2 bg-accent text-white rounded-lg font-bold text-sm">
              Browse tenders
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Tender</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Bid Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Technical</th>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Deadline</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bids.map(b => (
                <tr key={b.id} className="hover:bg-bg/40">
                  <td className="px-5 py-3">
                    <Link href={`/bids/${b.id}`} className="font-mono text-xs font-bold text-accent hover:underline">
                      {b.tenderReference}
                    </Link>
                    <p className="text-sm font-semibold text-text-primary mt-0.5">{b.tenderTitle}</p>
                    <div className="mt-1">
                      <StatusBadge status={b.tenderStatus} />
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={b.status} />
                    {b.receiptNumber && (
                      <p className="text-[10px] font-mono text-text-secondary mt-1">{b.receiptNumber}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold ${
                      b.technicalResult === 'PASS' ? 'text-success' :
                      b.technicalResult === 'FAIL' ? 'text-danger' : 'text-text-secondary'
                    }`}>
                      {b.technicalResult ?? 'PENDING'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-secondary text-xs">
                    {b.submissionDeadline
                      ? new Date(b.submissionDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {b.status === 'DRAFT' ? (
                      <Link
                        href={`/bids/wizard/${b.tenderId}`}
                        className="px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg hover:opacity-90"
                      >
                        Continue
                      </Link>
                    ) : (
                      <Link
                        href={`/bids/${b.id}`}
                        className="px-3 py-1.5 border border-border text-xs font-bold rounded-lg hover:bg-bg"
                      >
                        View
                      </Link>
                    )}
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

function Stat({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase text-text-secondary">{label}</span>
        <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
