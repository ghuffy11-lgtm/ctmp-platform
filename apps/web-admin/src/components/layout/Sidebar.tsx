'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getAccessToken, clearTokens, hasPermission } from '@/lib/auth';

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

  const visibleItems = navItems.filter(
    (item) => !item.permission || (token && hasPermission(token, item.permission)),
  );

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
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
              {item.label}
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
