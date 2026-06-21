'use client';

// BUG-100 (2026-06-04): Per-vendor executive profile + history.
//
// One fetch (GET /analytics/vendors/:id) returns profile, lifetime metrics,
// award history, spend trend, department/category breakdown, full bid
// participation list. Read-only — approve/suspend lives on /vendors.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award as AwardIcon,
  Building2,
  Calendar,
  ClipboardList,
  Globe,
  Hash,
  Loader2,
  Mail,
  Phone,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface VendorProfileResponse {
  profile: {
    id: string;
    companyName: string;
    registrationNumber: string | null;
    taxNumber: string | null;
    country: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    status: string;
    blacklistReason: string | null;
    suspensionReason: string | null;
    approvedAt: string | null;
    createdAt: string;
    primaryContact: { fullName: string; email: string; phone: string | null } | null;
  };
  metrics: {
    lifetimeAwardCount: number;
    lifetimeAwardedValue: number;
    averageAwardSize: number;
    bidsSubmitted: number;
    winRate: number;
    technicalPassRate: number;
  };
  awardHistory: Array<{
    tenderId: string;
    tenderReference: string;
    tenderTitle: string;
    departmentName: string | null;
    category: string | null;
    awardedAt: string;
    awardedAmount: number;
    awardId: string | null;
    awardStatus: 'Active' | 'Superseded' | 'Amended';
    justificationPdfStorageKey: string | null;
    justificationPdfFilename: string | null;
  }>;
  spendByYear: Array<{ year: number; awardCount: number; totalAwarded: number }>;
  spendByDepartment: Array<{
    departmentId: string;
    departmentName: string;
    tenderCount: number;
    estimatedValue: number;
    awardedValue: number;
  }>;
  spendByCategory: Array<{
    category: string;
    tenderCount: number;
    estimatedValue: number;
    awardedValue: number;
  }>;
  bidParticipation: Array<{
    bidId: string;
    tenderId: string;
    tenderReference: string;
    tenderTitle: string;
    submittedAt: string | null;
    status: string;
    technicalResult: string;
    commercialTotal: number | null;
    tenderStatus: string;
  }>;
  currency: string;
  generatedAt: string;
}

type TabId = 'overview' | 'awards' | 'spend' | 'participation';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'awards', label: 'Award History', icon: AwardIcon },
  { id: 'spend', label: 'Spend Trend', icon: Wallet },
  { id: 'participation', label: 'Participation', icon: ClipboardList },
];

const VENDOR_STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  PENDING: 'Internal Review',
  REJECTED: 'Cancelled',
  SUSPENDED: 'Suspended',
  BLACKLISTED: 'Cancelled',
};

function fmtKwd(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
function fmtFullKwd(v: number): string {
  return v.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export default function ExecutiveVendorDetailPage() {
  const params = useParams<{ id: string }>();
  const vendorId = params?.id;
  const [data, setData] = useState<VendorProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await get<VendorProfileResponse>(`/analytics/vendors/${vendorId}`, token);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load vendor profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (loading && !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading vendor profile…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/executive/vendors" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const maxYearSpend = Math.max(1, ...data.spendByYear.map((y) => y.totalAwarded));
  const maxDept = Math.max(1, ...data.spendByDepartment.map((d) => d.awardedValue));
  const maxCat = Math.max(1, ...data.spendByCategory.map((c) => c.awardedValue));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link href="/executive/vendors" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-accent" />
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">{data.profile.companyName}</h1>
              <StatusBadge status={VENDOR_STATUS_LABEL[data.profile.status] ?? data.profile.status} />
            </div>
            <p className="text-xs text-text-secondary font-mono">{data.profile.id}</p>
          </div>
          {(data.profile.suspensionReason || data.profile.blacklistReason) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 max-w-md">
              <p className="font-semibold uppercase tracking-wider text-[10px] mb-0.5">
                {data.profile.blacklistReason ? 'Blacklist reason' : 'Suspension reason'}
              </p>
              {data.profile.blacklistReason ?? data.profile.suspensionReason}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <ProfileField icon={Hash} label="Registration #" value={data.profile.registrationNumber} />
          <ProfileField icon={Hash} label="Tax #" value={data.profile.taxNumber} />
          <ProfileField icon={Globe} label="Country" value={data.profile.country?.toUpperCase() ?? null} />
          <ProfileField icon={Phone} label="Phone" value={data.profile.phone} />
          <ProfileField icon={Globe} label="Website" value={data.profile.website} link />
          <ProfileField icon={Calendar} label="Registered" value={fmtDate(data.profile.createdAt)} />
          <ProfileField icon={Calendar} label="Approved" value={data.profile.approvedAt ? fmtDate(data.profile.approvedAt) : '—'} />
          {data.profile.primaryContact && (
            <>
              <ProfileField icon={Mail} label="Primary Contact" value={`${data.profile.primaryContact.fullName} · ${data.profile.primaryContact.email}`} />
              <ProfileField icon={Phone} label="Contact Phone" value={data.profile.primaryContact.phone} />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border flex items-center gap-1 px-3 bg-bg/30 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  active ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === 'overview' && <OverviewTab metrics={data.metrics} />}

          {tab === 'awards' && <AwardsTab awards={data.awardHistory} />}

          {tab === 'spend' && (
            <SpendTab
              spendByYear={data.spendByYear}
              spendByDepartment={data.spendByDepartment}
              spendByCategory={data.spendByCategory}
              maxYear={maxYearSpend}
              maxDept={maxDept}
              maxCat={maxCat}
            />
          )}

          {tab === 'participation' && <ParticipationTab bids={data.bidParticipation} />}
        </div>
      </div>
    </div>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value,
  link,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  link?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="mt-0.5 text-text-primary">
        {value == null || value === '' ? (
          <span className="text-text-secondary">—</span>
        ) : link && /^https?:\/\//i.test(value) ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function OverviewTab({ metrics }: { metrics: VendorProfileResponse['metrics'] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Stat label="Lifetime Awards" value={String(metrics.lifetimeAwardCount)} />
      <Stat label="Lifetime Value" value={`${fmtKwd(metrics.lifetimeAwardedValue)} KWD`} sub={`${fmtFullKwd(metrics.lifetimeAwardedValue)} total`} />
      <Stat label="Average Award Size" value={metrics.lifetimeAwardCount > 0 ? `${fmtKwd(metrics.averageAwardSize)} KWD` : '—'} />
      <Stat label="Bids Submitted" value={String(metrics.bidsSubmitted)} />
      <Stat label="Win Rate" value={metrics.bidsSubmitted > 0 ? fmtPct(metrics.winRate) : '—'} />
      <Stat label="Technical PASS Rate" value={metrics.technicalPassRate >= 0 && metrics.technicalPassRate > 0 ? fmtPct(metrics.technicalPassRate) : '—'} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg/30 border border-border rounded-xl p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="text-2xl font-bold text-text-primary tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-text-secondary">{sub}</p>}
    </div>
  );
}

function AwardsTab({ awards }: { awards: VendorProfileResponse['awardHistory'] }) {
  if (awards.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-10">No awards on record for this vendor.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
            <th className="px-4 py-2.5 text-left">Reference</th>
            <th className="px-4 py-2.5 text-left">Title</th>
            <th className="px-4 py-2.5 text-left">Department</th>
            <th className="px-4 py-2.5 text-left">Category</th>
            <th className="px-4 py-2.5 text-right">Awarded</th>
            <th className="px-4 py-2.5 text-right">Amount (KWD)</th>
            <th className="px-4 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {awards.map((a) => (
            <tr key={a.tenderId} className="hover:bg-bg/40">
              <td className="px-4 py-2.5 font-mono text-text-secondary">
                <Link href={`/awarded-tenders?tenderId=${a.tenderId}`} className="hover:text-accent">
                  {a.tenderReference}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-text-primary">{a.tenderTitle}</td>
              <td className="px-4 py-2.5 text-text-secondary">{a.departmentName ?? '—'}</td>
              <td className="px-4 py-2.5 text-text-secondary">{a.category ?? '—'}</td>
              <td className="px-4 py-2.5 text-right text-text-secondary">{fmtDate(a.awardedAt)}</td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtFullKwd(a.awardedAmount)}</td>
              <td className="px-4 py-2.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    a.awardStatus === 'Active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : a.awardStatus === 'Amended'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {a.awardStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpendTab({
  spendByYear,
  spendByDepartment,
  spendByCategory,
  maxYear,
  maxDept,
  maxCat,
}: {
  spendByYear: VendorProfileResponse['spendByYear'];
  spendByDepartment: VendorProfileResponse['spendByDepartment'];
  spendByCategory: VendorProfileResponse['spendByCategory'];
  maxYear: number;
  maxDept: number;
  maxCat: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">Year over year</h3>
        {spendByYear.length === 0 ? (
          <p className="text-sm text-text-secondary">No award history yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-1 items-end h-40">
            {spendByYear.map((y) => {
              const pct = (y.totalAwarded / maxYear) * 100;
              return (
                <div key={y.year} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full flex items-end h-full" title={`${y.totalAwarded.toLocaleString('en-GB')} KWD`}>
                    <div
                      className="flex-1 bg-emerald-500/80 rounded-t hover:bg-emerald-500 transition-colors"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-text-secondary font-mono">{y.year}</p>
                  <p className="text-[10px] text-text-primary font-semibold">{fmtKwd(y.totalAwarded)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarList
          title="By Department"
          items={spendByDepartment.map((d) => ({
            key: d.departmentId,
            label: d.departmentName,
            count: d.tenderCount,
            value: d.awardedValue,
          }))}
          max={maxDept}
        />
        <BarList
          title="By Category"
          items={spendByCategory.map((c) => ({
            key: c.category,
            label: c.category,
            count: c.tenderCount,
            value: c.awardedValue,
          }))}
          max={maxCat}
        />
      </div>
    </div>
  );
}

function BarList({
  title,
  items,
  max,
}: {
  title: string;
  items: Array<{ key: string; label: string; count: number; value: number }>;
  max: number;
}) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-bg/30">
        <h4 className="text-sm font-bold text-text-primary">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-secondary text-center">No data.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const pct = (it.value / max) * 100;
            return (
              <li key={it.key} className="px-4 py-2.5 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-primary font-semibold truncate">{it.label}</span>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {it.count} award{it.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-emerald-700 text-xs font-mono">{fmtKwd(it.value)} KWD</p>
                </div>
                <div className="h-1.5 bg-bg rounded">
                  <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ParticipationTab({ bids }: { bids: VendorProfileResponse['bidParticipation'] }) {
  if (bids.length === 0) {
    return <p className="text-sm text-text-secondary text-center py-10">No bid history for this vendor.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
            <th className="px-4 py-2.5 text-left">Reference</th>
            <th className="px-4 py-2.5 text-left">Title</th>
            <th className="px-4 py-2.5 text-right">Submitted</th>
            <th className="px-4 py-2.5 text-left">Technical</th>
            <th className="px-4 py-2.5 text-right">Commercial (KWD)</th>
            <th className="px-4 py-2.5 text-left">Outcome</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {bids.map((b) => (
            <tr key={b.bidId} className="hover:bg-bg/40">
              <td className="px-4 py-2.5 font-mono text-text-secondary">
                <Link href={`/tenders/${b.tenderId}`} className="hover:text-accent">
                  {b.tenderReference}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-text-primary">{b.tenderTitle}</td>
              <td className="px-4 py-2.5 text-right text-text-secondary">{fmtDate(b.submittedAt)}</td>
              <td className="px-4 py-2.5">
                <TechBadge result={b.technicalResult} />
              </td>
              <td className="px-4 py-2.5 text-right font-mono">{b.commercialTotal != null ? fmtFullKwd(b.commercialTotal) : '—'}</td>
              <td className="px-4 py-2.5">
                <OutcomeBadge status={b.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechBadge({ result }: { result: string }) {
  const cfg =
    result === 'PASS'
      ? { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'PASS' }
      : result === 'FAIL'
      ? { bg: 'bg-red-50', text: 'text-red-700', label: 'FAIL' }
      : { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Pending' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function OutcomeBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    AWARDED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Awarded' },
    NOT_AWARDED: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Not Awarded' },
    SUBMITTED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Submitted' },
    EVALUATED: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Evaluated' },
    LATE_SUBMITTED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Late' },
    LATE_ACCEPTED: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Late accepted' },
    WITHDRAWN: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Withdrawn' },
    DISQUALIFIED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Disqualified' },
    DRAFT: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Draft' },
  };
  const cfg = map[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
