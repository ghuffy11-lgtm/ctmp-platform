'use client';

// BUG-110 (2026-06-05): public vendor portal landing page. Anonymous visitors
// hit the root URL and immediately see the list of currently-open public
// tenders — no login required to browse, just to see details. Logged-in
// vendors are auto-redirected to /dashboard so they don't get bounced into
// the public marketing view.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gavel, Search, LogIn, UserPlus, Lock } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
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

interface BrandingResponse {
  systemName: string;
  vendorPortalName: string;
  hasVendorLogo: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const UNCATEGORISED = 'Uncategorised';

function categoryOf(t: TenderSummary): string {
  return t.category && t.category.trim() !== '' ? t.category : UNCATEGORISED;
}

export default function PublicHome() {
  const router = useRouter();
  // null = checking cookies; false = anonymous; true = logged in (redirecting)
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('');
  const [branding, setBranding] = useState<BrandingResponse>({
    systemName: 'CTMP',
    vendorPortalName: 'CTMP',
    hasVendorLogo: false,
  });

  useEffect(() => {
    // BUG-110: logged-in vendor visiting / goes straight to /dashboard.
    if (getAccessToken()) {
      setAuthed(true);
      router.replace('/dashboard');
      return;
    }
    setAuthed(false);
    Promise.all([
      get<BrandingResponse>('/public-branding').catch(() => null),
      get<PaginatedTenders>('/public/tenders?pageSize=100').catch(() => null),
    ]).then(([b, t]) => {
      if (b) setBranding(b);
      setTenders(t?.data ?? []);
      setLoading(false);
    });
  }, [router]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tenders) {
      const c = categoryOf(t);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const list = Array.from(counts.entries()).map(([cat, count]) => ({ cat, count }));
    list.sort((a, b) => {
      if (a.cat === UNCATEGORISED) return 1;
      if (b.cat === UNCATEGORISED) return -1;
      return a.cat.localeCompare(b.cat);
    });
    return list;
  }, [tenders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter(t => {
      if (q) {
        const matchesSearch =
          t.title.toLowerCase().includes(q) ||
          t.referenceNumber.toLowerCase().includes(q) ||
          (t.departmentName?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (category && categoryOf(t) !== category) return false;
      return true;
    });
  }, [tenders, search, category]);

  // While authenticating-check is in flight, render nothing (avoids flashing
  // the public list to a logged-in vendor before the redirect fires).
  if (authed === null || authed === true) {
    return <div className="min-h-screen" />;
  }

  const portalName = branding.vendorPortalName || branding.systemName || 'CTMP';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Public top bar — distinct from PortalShell (no profile chip, no nav). */}
      <header className="border-b border-slate-900/10 bg-white/90 backdrop-blur-2xl sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {branding.hasVendorLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${API_BASE}/api/v1/branding/vendor_logo`}
                alt={portalName}
                className="h-9 max-w-[160px] object-contain"
              />
            ) : (
              <div className="w-9 h-9 bg-electric-500 rounded-2xl flex items-center justify-center text-[#0A1428] font-bold text-2xl leading-none">
                V
              </div>
            )}
            <div className="heading-font tracking-tighter leading-none hidden sm:block">
              <div className="text-2xl font-semibold">{portalName.toUpperCase()}</div>
              <div className="text-electric-500 text-[10px] tracking-[4px] font-medium mt-0.5">VENDOR PORTAL</div>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-2xl text-sm font-medium text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 btn-electric rounded-2xl text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Register
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="heading-font text-4xl md:text-5xl font-semibold tracking-tighter">Public Tenders</h1>
            <p className="text-slate-900/65 text-sm mt-2 max-w-xl">
              Browse open procurement opportunities. {' '}
              <Link href="/login" className="text-electric-600 hover:underline font-medium">
                Sign in
              </Link>{' '}
              to view details and submit bids.
            </p>
          </div>
          <div className="flex items-stretch gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-900/50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tenders..."
                className="input-field w-full rounded-3xl pl-12 pr-6 py-4 text-sm"
              />
            </div>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input-field rounded-3xl px-5 py-4 text-sm shrink-0 w-full md:w-56"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categoryOptions.map(({ cat, count }) => (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty
            icon={Gavel}
            title={search || category ? 'No matching tenders' : 'No open tenders'}
            description={
              search || category
                ? 'Try a different search term or category.'
                : 'There are no open tenders right now. Check back soon.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => router.push(`/login?next=/tenders/${t.id}`)}
                className="text-left"
              >
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
                    <span className="inline-flex items-center gap-1.5 px-6 py-3 btn-electric rounded-3xl text-xs">
                      <Lock className="w-3 h-3" />
                      SIGN IN TO VIEW
                    </span>
                  </div>
                </GlassCard>
              </button>
            ))}
          </div>
        )}
      </main>
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
