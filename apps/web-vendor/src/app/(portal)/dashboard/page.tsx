'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Gavel } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loading, Empty } from '@/components/ui/Empty';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

interface MyBidSummary {
  id: string;
  status: string;
  tenderStatus: string;
}

export default function VendorDashboardPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [bids, setBids] = useState<MyBidSummary[]>([]);
  const [vendorName, setVendorName] = useState<string>('there');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = getAccessToken();
      try {
        const [tenderRes, bidRes, me] = await Promise.all([
          get<PaginatedTenders>('/tenders?pageSize=20', token).catch(
            () => ({ data: [], total: 0 } as PaginatedTenders),
          ),
          get<{ items: MyBidSummary[]; total: number }>('/vendor-auth/me/bids?pageSize=100', token).catch(
            () => ({ items: [], total: 0 }),
          ),
          get<{ vendor: { companyName: string } }>('/vendor-auth/me', token).catch(() => null),
        ]);
        setTenders(tenderRes.data ?? []);
        setBids(bidRes.items ?? []);
        if (me?.vendor?.companyName) setVendorName(me.vendor.companyName);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeBids = bids.filter(b => b.status === 'SUBMITTED' || b.status === 'LATE_SUBMITTED').length;
  const openTenders = tenders.length;
  const awarded = bids.filter(b => b.status === 'AWARDED').length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="space-y-12">
      <PageHeader
        title={`${greeting}, ${vendorName}`}
        subtitle="Active tender opportunities and the status of your bids."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Active Bids"     value={activeBids}                                              href="/bids"    accent="text-emerald-600" loading={loading} />
        <Stat label="Open Tenders"    value={openTenders}                                             href="/tenders" accent="text-electric-500" loading={loading} />
        <Stat label="In Evaluation"   value={bids.filter(b => b.status === 'EVALUATED').length}      href="/bids"    accent="text-amber-600"   loading={loading} />
        <Stat label="Awarded"         value={awarded}                                                 href="/bids"    accent="text-violet-600"  loading={loading} />
      </div>

      <section>
        <div className="flex items-end justify-between mb-6">
          <h2 className="heading-font text-3xl font-semibold tracking-tighter">Recent Tenders</h2>
          <Link
            href="/tenders"
            className="text-electric-500 hover:text-electric-600 hover:underline flex items-center gap-2 text-sm"
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <Loading />
        ) : tenders.length === 0 ? (
          <Empty
            icon={Gavel}
            title="No tenders available"
            description="There are no open tenders right now. Check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {tenders.slice(0, 4).map(t => (
              <Link key={t.id} href={`/tenders/${t.id}`}>
                <GlassCard hover className="cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-slate-900/55">{t.referenceNumber}</div>
                      <h3 className="heading-font text-xl font-medium mt-2 leading-tight line-clamp-2">
                        {t.title}
                      </h3>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-6 flex items-center justify-between text-sm">
                    <div className="text-slate-900/65">
                      {t.departmentName && <span>{t.departmentName} · </span>}
                      {t.submissionDeadline ? (
                        <>Closes {formatDate(t.submissionDeadline)}</>
                      ) : (
                        'No deadline set'
                      )}
                    </div>
                    {t.submissionDeadline && (
                      <CountdownBadge iso={t.submissionDeadline} />
                    )}
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label, value, accent, loading, href,
}: {
  label: string; value: number; accent: string; loading: boolean; href: string;
}) {
  return (
    <Link href={href} className="block">
      <GlassCard hover padding="lg" className="cursor-pointer">
        <div className={`text-xs font-semibold tracking-[0.18em] uppercase mb-2 ${accent}`}>
          {label}
        </div>
        <div className="text-5xl md:text-6xl heading-font font-semibold tracking-tighter">
          {loading ? '—' : value}
        </div>
      </GlassCard>
    </Link>
  );
}

function CountdownBadge({ iso }: { iso: string }) {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return <span className="text-xs font-medium text-slate-900/50">Closed</span>;
  if (days === 0) return <span className="text-xs font-medium text-rose-600">Today</span>;
  const tone = days <= 3 ? 'text-rose-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600';
  return <span className={`text-xs font-medium ${tone}`}>{days} day{days !== 1 && 's'} left</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
