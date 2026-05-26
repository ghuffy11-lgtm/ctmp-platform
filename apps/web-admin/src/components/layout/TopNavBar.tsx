'use client';

import { useRouter, usePathname } from 'next/navigation';
import { getAccessToken, decodeToken, clearTokens } from '@/lib/auth';
import { Bell, LogOut } from 'lucide-react';

const TITLE_BY_PATH: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tenders': 'Tender Management',
  '/tenders/new': 'Create New Tender',
  '/approvals': 'Approval Queue',
  '/clarifications': 'Clarifications',
  '/technical-evaluation': 'Technical Evaluation',
  '/committee-opening': 'Committee & Commercial Opening',
  '/commercial-comparison': 'Commercial Comparison',
  '/vendors': 'Vendor Management',
  '/reports': 'Reports',
  '/audit-log': 'Audit Log',
  '/security-alerts': 'Security Alerts',
  '/settings': 'System Configuration',
};

function titleForPath(pathname: string): string {
  if (TITLE_BY_PATH[pathname]) return TITLE_BY_PATH[pathname];
  if (pathname.startsWith('/tenders/') && pathname.endsWith('/edit')) return 'Edit Tender';
  if (pathname.startsWith('/tenders/')) return 'Tender Detail';
  return 'CTMP Admin';
}

export function TopNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const token = getAccessToken();
  const payload = token ? decodeToken(token) : null;
  const username = payload?.username ?? '';
  const displayName = username
    ? username.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'User';
  const role = (payload as { roles?: string[] } | null)?.roles?.[0] ?? 'Admin';
  const initials = displayName.charAt(0).toUpperCase();

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
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-40">
      <h2 className="text-xl font-semibold text-slate-900">{titleForPath(pathname)}</h2>

      <div className="flex items-center gap-4">
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold text-slate-900 leading-none">{displayName}</p>
          <p className="text-[10px] text-slate-500 mt-1">{role}</p>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <button
          type="button"
          className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
          {initials}
        </div>
      </div>
    </header>
  );
}
