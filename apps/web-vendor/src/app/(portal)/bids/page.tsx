'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loading, Empty, ErrorBanner } from '@/components/ui/Empty';
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

  const drafts    = bids.filter(b => b.status === 'DRAFT').length;
  const submitted = bids.filter(b => b.status === 'SUBMITTED' || b.status === 'LATE_SUBMITTED').length;
  const evaluated = bids.filter(b => b.status === 'EVALUATED').length;
  const awarded   = bids.filter(b => b.status === 'AWARDED').length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="My Bids"
        subtitle="Draft, submitted, and historical bids across all tenders."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <BidStat label="Drafts"     value={drafts}    accent="text-amber-600"   loading={loading} />
        <BidStat label="Submitted"  value={submitted} accent="text-electric-500" loading={loading} />
        <BidStat label="Evaluated"  value={evaluated} accent="text-violet-600"   loading={loading} />
        <BidStat label="Awarded"    value={awarded}   accent="text-emerald-600"  loading={loading} />
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading />
      ) : bids.length === 0 ? (
        <Empty
          icon={Package}
          title="You have no bids yet"
          description="Browse available tenders and start your first bid."
          action={
            <Link href="/tenders" className="btn-electric inline-block px-8 py-4 rounded-3xl text-sm">
              Browse Tenders
            </Link>
          }
        />
      ) : (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-slate-900/55 text-[11px] uppercase tracking-[0.15em] border-b border-slate-900/10">
                  <th className="py-5 px-8 text-left font-medium">Tender</th>
                  <th className="py-5 px-8 text-left font-medium">Status</th>
                  <th className="py-5 px-8 text-left font-medium">Technical</th>
                  <th className="py-5 px-8 text-left font-medium">Deadline</th>
                  <th className="py-5 px-8 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {bids.map(b => (
                  <tr key={b.id} className="border-b border-slate-900/5 hover:bg-slate-900/5 transition-colors">
                    <td className="py-5 px-8">
                      <Link href={`/bids/${b.id}`} className="font-mono text-xs text-electric-500 hover:underline">
                        {b.tenderReference}
                      </Link>
                      <div className="text-sm font-medium mt-1 line-clamp-1">{b.tenderTitle}</div>
                      <div className="mt-2">
                        <StatusBadge status={b.tenderStatus} />
                      </div>
                    </td>
                    <td className="py-5 px-8 align-top">
                      <StatusBadge status={b.status} />
                      {b.receiptNumber && (
                        <div className="text-[10px] font-mono text-slate-900/50 mt-2">{b.receiptNumber}</div>
                      )}
                    </td>
                    <td className="py-5 px-8 align-top">
                      <StatusBadge status={b.technicalResult ?? 'PENDING'} />
                    </td>
                    <td className="py-5 px-8 align-top text-slate-900/65">
                      {b.submissionDeadline
                        ? new Date(b.submissionDeadline).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="py-5 px-8 align-top text-right">
                      {b.status === 'DRAFT' ? (
                        <Link
                          href={`/bids/wizard/${b.tenderId}`}
                          className="btn-electric inline-block px-5 py-2.5 rounded-2xl text-xs"
                        >
                          Continue
                        </Link>
                      ) : (
                        <Link
                          href={`/bids/${b.id}`}
                          className="btn-ghost inline-block px-5 py-2.5 rounded-2xl text-xs"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function BidStat({
  label, value, accent, loading,
}: {
  label: string; value: number; accent: string; loading: boolean;
}) {
  return (
    <GlassCard hover padding="lg">
      <div className={`text-xs font-semibold tracking-[0.18em] uppercase mb-2 ${accent}`}>
        {label}
      </div>
      <div className="text-5xl heading-font font-semibold tracking-tighter">
        {loading ? '—' : value}
      </div>
    </GlassCard>
  );
}
