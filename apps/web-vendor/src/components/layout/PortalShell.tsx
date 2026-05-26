'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { clearTokens, getAccessToken } from '@/lib/auth';
import { get } from '@/lib/api';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard',      label: 'Dashboard' },
  { href: '/tenders',        label: 'Tenders' },
  { href: '/bids',           label: 'My Bids' },
  { href: '/clarifications', label: 'Clarifications' },
  { href: '/profile',        label: 'Profile' },
];

interface MeResponse {
  vendor: { companyName: string; status: string };
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  APPROVED:   { label: 'Verified',   tone: 'text-emerald-700 bg-emerald-100' },
  PENDING:    { label: 'Pending',    tone: 'text-amber-700 bg-amber-100' },
  REJECTED:   { label: 'Rejected',   tone: 'text-rose-700 bg-rose-100' },
  SUSPENDED:  { label: 'Suspended',  tone: 'text-rose-700 bg-rose-100' },
  BLACKLISTED:{ label: 'Blocked',    tone: 'text-rose-700 bg-rose-100' },
};

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [company, setCompany] = useState<{ name: string; status: string } | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    get<MeResponse>('/vendor-auth/me', token)
      .then(res => setCompany({ name: res.vendor.companyName, status: res.vendor.status }))
      .catch(() => { /* shell still renders without vendor chip */ });
  }, []);

  function handleLogout() {
    clearTokens();
    router.push('/login');
  }

  const initials = company?.name
    ? company.name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'V';
  const statusInfo = company ? (STATUS_LABEL[company.status] ?? STATUS_LABEL.PENDING) : null;

  return (
    <div className="min-h-screen">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-900/10 bg-white/90 backdrop-blur-2xl">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 bg-electric-500 rounded-2xl flex items-center justify-center text-[#0A1428] font-bold text-2xl leading-none">
              V
            </div>
            <div className="heading-font tracking-tighter leading-none hidden sm:block">
              <div className="text-2xl font-semibold">VENDOR</div>
              <div className="text-electric-500 text-[10px] tracking-[4px] font-medium mt-0.5">CONNECT</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-x-8 text-sm font-medium">
            {NAV.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('nav-link', active && 'active')}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {company && (
              <div className="hidden md:flex items-center gap-3 bg-slate-900/5 px-4 py-2 rounded-3xl border border-slate-900/10">
                <div className="w-8 h-8 bg-emerald-400 rounded-2xl flex items-center justify-center text-[#0A1428] text-xs font-bold">
                  {initials}
                </div>
                <div className="leading-tight">
                  <div className="text-xs font-medium max-w-[160px] truncate">{company.name}</div>
                  {statusInfo && (
                    <div className={cn('text-[10px] font-medium', statusInfo.tone.split(' ')[0])}>
                      {statusInfo.label}
                    </div>
                  )}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="px-4 py-3 rounded-2xl border border-slate-900/15 hover:bg-slate-900/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav row */}
        <div className="md:hidden border-t border-slate-900/10 px-6 py-3 flex gap-x-6 overflow-x-auto text-sm font-medium">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('nav-link whitespace-nowrap', active && 'active')}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="pt-28 md:pt-24 pb-16 max-w-screen-2xl mx-auto px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
