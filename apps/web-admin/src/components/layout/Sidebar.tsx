'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAccessToken, hasPermission } from '@/lib/auth';
import { get } from '@/lib/api';
import {
  LayoutDashboard,
  Gavel,
  CheckCircle2,
  MessageSquare,
  BarChart3,
  Scale,
  ArrowLeftRight,
  Building2,
  FileText,
  History,
  ShieldCheck,
  Settings,
} from 'lucide-react';

const POLL_MS = 60_000;

// BUG-028: every nav item except Dashboard is permission-gated. The `permission`
// field is matched against the JWT's permission list — SYSTEM_ADMIN has all
// permissions by role definition so they see everything. `anyPermission` is
// an OR-list for items reachable by multiple roles.
const navItems: Array<{
  href: string;
  label: string;
  icon: any;
  permission?: string;
  anyPermission?: string[];
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenders', label: 'Tenders', icon: Gavel, permission: 'tender:view' },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2, anyPermission: ['tender:approve', 'award:approve'] },
  { href: '/clarifications', label: 'Clarifications', icon: MessageSquare, anyPermission: ['clarification:view_internal', 'clarification:reply'] },
  { href: '/technical-evaluation', label: 'Technical Evaluation', icon: BarChart3, permission: 'technical:evaluate' },
  { href: '/technical-comparison', label: 'Technical Comparison', icon: BarChart3, permission: 'comparison:technical:view' },
  { href: '/committee-opening', label: 'Committee & Commercial', icon: Scale, anyPermission: ['committee:open_commercial', 'committee:record_attendance', 'commercial:view'] },
  { href: '/commercial-comparison', label: 'Commercial Comparison', icon: ArrowLeftRight, permission: 'commercial:view' },
  { href: '/vendors', label: 'Vendor Management', icon: Building2, permission: 'vendor:view' },
  { href: '/reports', label: 'Reports', icon: FileText, permission: 'reports:view' },
  { href: '/audit-log', label: 'Audit Log', icon: History, permission: 'audit:view' },
  { href: '/security-alerts', label: 'Security Alerts', icon: ShieldCheck, permission: 'audit:view' },
  { href: '/settings/evaluation-criteria', label: 'Evaluation Criteria', icon: Settings, permission: 'criteria:library:manage' },
  { href: '/settings', label: 'System Configuration', icon: Settings, permission: 'system:configure' },
];

export function Sidebar() {
  const pathname = usePathname();
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
        // silent
      }
    }
    poll();
    const handle = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [token, canViewAudit]);

  const visibleItems = navItems.filter((item) => {
    if (!token) return !item.permission && !item.anyPermission;
    if (item.permission && !hasPermission(token, item.permission)) return false;
    if (item.anyPermission && !item.anyPermission.some((p) => hasPermission(token, p))) return false;
    return true;
  });

  return (
    <aside className="w-[260px] h-screen fixed left-0 top-0 bg-white border-r border-slate-200 flex flex-col z-50">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          C
        </div>
        <div>
          <h1 className="font-bold text-slate-900 text-sm leading-none">CTMP Admin</h1>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Procurement Authority</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const showBadge = item.href === '/security-alerts' && unackCount > 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 text-sm ${
                active
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600' : ''}`} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">
                  {unackCount > 99 ? '99+' : unackCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 text-center uppercase tracking-wider">CTMP v1.0 · Enterprise</p>
      </div>
    </aside>
  );
}
