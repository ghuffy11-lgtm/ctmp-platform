'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAccessToken, clearTokens, hasPermission } from '@/lib/auth';
import { get } from '@/lib/api';

const POLL_MS = 60_000;

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/tenders', label: 'Tenders', icon: 'gavel' },
  { href: '/approvals', label: 'Approval Queue', icon: 'approval' },
  { href: '/clarifications', label: 'Clarifications', icon: 'forum' },
  { href: '/technical-evaluation', label: 'Technical Evaluation', icon: 'fact_check' },
  { href: '/committee-opening', label: 'Commercial Opening', icon: 'lock_open' },
  // commercial:view permission required — gate applied in the page itself
  { href: '/commercial-comparison', label: 'Commercial Comparison', icon: 'compare', permission: 'commercial:view' },
  { href: '/vendors', label: 'Vendors', icon: 'storefront' },
  { href: '/reports', label: 'Reports', icon: 'assessment' },
  { href: '/audit-log', label: 'Audit Log', icon: 'policy' },
  { href: '/security-alerts', label: 'Security Alerts', icon: 'security', permission: 'audit:view' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const token = getAccessToken();
  const [unackCount, setUnackCount] = useState(0);

  const canViewAudit = !!token && hasPermission(token, 'audit:view');

  useEffect(() => {
    if (!canViewAudit || !token) return;

    let cancelled = false;
    async function poll() {
      try {
        const res = await get<{ total: number }>(
          '/security-alerts?unacknowledgedOnly=true&pageSize=1',
          token,
        );
        if (!cancelled) setUnackCount(res.total ?? 0);
      } catch {
        // Silent: badge is non-critical UX.
      }
    }
    poll();
    const handle = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [token, canViewAudit]);

  const visibleItems = navItems.filter(
    (item) => !item.permission || (token && hasPermission(token, item.permission)),
  );

  async function handleLogout() {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } finally {
      clearTokens();
      router.push('/login');
    }
  }

  return (
    <aside className="fixed top-0 left-0 h-full w-[260px] bg-[#0F172A] text-white flex flex-col z-40">
      <div className="px-6 py-5 border-b border-white/10">
        <p className="text-xs font-medium tracking-widest text-blue-300 uppercase">CTMP</p>
        <p className="text-sm text-white/70 mt-0.5">Admin Portal</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const showBadge = item.href === '/security-alerts' && unackCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center"
                  aria-label={`${unackCount} unacknowledged security alerts`}
                >
                  {unackCount > 99 ? '99+' : unackCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
