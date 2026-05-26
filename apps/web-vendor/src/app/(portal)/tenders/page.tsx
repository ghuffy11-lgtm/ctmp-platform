'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Gavel, Search } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Loading, Empty } from '@/components/ui/Empty';
import { StatusBadge, Chip } from '@/components/ui/StatusBadge';

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  departmentName?: string;
  category?: string;
  estimatedBudget?: string | number | null;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenders;
    return tenders.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.referenceNumber.toLowerCase().includes(q) ||
      (t.departmentName?.toLowerCase().includes(q) ?? false),
    );
  }, [tenders, search]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Public Tenders"
        subtitle={`${tenders.length} ${tenders.length === 1 ? 'opportunity' : 'opportunities'} available`}
        actions={
          <div className="relative w-full md:w-96">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900/50 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenders..."
              className="input-field w-full rounded-3xl pl-12 pr-6 py-4 text-sm"
            />
          </div>
        }
      />

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <Empty
          icon={Gavel}
          title={search ? 'No matching tenders' : 'No tenders available'}
          description={
            search
              ? 'Try a different search term or clear the filter.'
              : 'There are no open tenders right now. Check back soon.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map(t => (
            <Link key={t.id} href={`/tenders/${t.id}`}>
              <GlassCard hover className="cursor-pointer h-full flex flex-col">
                <div className="font-mono text-xs text-slate-900/55">{t.referenceNumber}</div>
                <h3 className="heading-font text-2xl font-medium mt-3 leading-tight line-clamp-2">
                  {t.title}
                </h3>
                <div className="flex flex-wrap gap-2 mt-6">
                  {t.departmentName && <Chip tone="neutral">{t.departmentName}</Chip>}
                  {t.category && <Chip tone="electric">{t.category}</Chip>}
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-auto pt-8 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-slate-900/65">
                      {t.submissionDeadline ? 'Closes in' : 'Deadline'}
                    </div>
                    {t.submissionDeadline ? (
                      <CountdownLarge iso={t.submissionDeadline} />
                    ) : (
                      <div className="text-lg font-semibold text-slate-900/65">Not set</div>
                    )}
                  </div>
                  <span className="px-6 py-3 btn-electric rounded-3xl text-xs">VIEW DETAILS</span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CountdownLarge({ iso }: { iso: string }) {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return <div className="text-2xl font-semibold text-slate-900/50">Closed</div>;
  if (days === 0) return <div className="text-2xl font-semibold text-rose-600">Today</div>;
  const tone = days <= 3 ? 'text-rose-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600';
  return <div className={`text-2xl font-semibold ${tone}`}>{days} day{days !== 1 && 's'}</div>;
}
