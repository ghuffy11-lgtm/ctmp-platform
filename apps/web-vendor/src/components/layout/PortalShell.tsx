'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/tenders', label: 'Tenders', icon: 'gavel' },
  { href: '/bids', label: 'My Bids', icon: 'inventory_2' },
  { href: '/clarifications', label: 'Clarifications', icon: 'forum' },
  { href: '/profile', label: 'Company Profile', icon: 'business' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearTokens();
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex bg-bg">
      <aside className="w-60 flex-shrink-0 bg-brand text-white flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">CTMP</p>
          <p className="text-sm font-semibold mt-0.5">Vendor Portal</p>
        </div>
        <nav className="flex-1 py-3 px-2">
          {navItems.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                  active ? 'bg-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 py-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
