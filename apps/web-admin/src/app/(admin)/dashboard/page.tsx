'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  departmentName: string;
  updatedAt?: string;
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface DashboardCounts {
  totalActiveTenders: number;
  pendingApprovals: number;
  openClarifications: number;
  inEvaluation: number;
  awaitingCommercialOpening: number;
  pendingVendors: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Draft:                                  'bg-border text-text-secondary',
  'Internal Review':                      'bg-amber-100 text-amber-800',
  Approved:                               'bg-blue-100 text-blue-800',
  Published:                              'bg-success/15 text-success',
  'Clarification Period':                 'bg-purple-100 text-purple-800',
  'Submission Closed':                    'bg-blue-200 text-blue-900',
  'Technical Opening':                    'bg-amber-100 text-amber-800',
  'Technical Evaluation':                 'bg-amber-100 text-amber-800',
  'Commercial Sealed':                    'bg-orange-100 text-orange-800',
  'Committee Commercial Opening':         'bg-orange-200 text-orange-900',
  'Commercial Evaluation / Comparison':   'bg-orange-100 text-orange-800',
  'Award Recommendation':                 'bg-purple-100 text-purple-800',
  Awarded:                                'bg-success/15 text-success',
  'Tender Closed':                        'bg-border text-text-secondary',
  Cancelled:                              'bg-danger/10 text-danger',
  Suspended:                              'bg-danger/10 text-danger',
  Archived:                               'bg-border text-text-secondary',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts>({
    totalActiveTenders: 0,
    pendingApprovals: 0,
    openClarifications: 0,
    inEvaluation: 0,
    awaitingCommercialOpening: 0,
    pendingVendors: 0,
  });
  const [recentTenders, setRecentTenders] = useState<TenderSummary[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<TenderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const token = getAccessToken();
      const fetchByStatus = (status: string) =>
        get<PaginatedTenders>(
          `/tenders?status=${encodeURIComponent(status)}&pageSize=100`,
          token,
        ).catch(() => ({ data: [], total: 0, page: 1, pageSize: 100 }));

      try {
        const [allActive, internalReview, awardRecommendation, clarification, techOpening, techEval, commercialSealed, recent] = await Promise.all([
          get<PaginatedTenders>('/tenders?pageSize=100', token).catch(() => ({ data: [], total: 0, page: 1, pageSize: 100 })),
          fetchByStatus('Internal Review'),
          fetchByStatus('Award Recommendation'),
          fetchByStatus('Clarification Period'),
          fetchByStatus('Technical Opening'),
          fetchByStatus('Technical Evaluation'),
          fetchByStatus('Commercial Sealed'),
          get<PaginatedTenders>('/tenders?pageSize=8&sort=updatedAt:desc', token).catch(() => ({ data: [], total: 0, page: 1, pageSize: 8 })),
        ]);

        // Pending vendor count — speculative
        const pendingVendors = await get<{ total: number }>(
          '/vendors?status=PENDING_APPROVAL&pageSize=1',
          token,
        ).catch(() => ({ total: 0 }));

        setCounts({
          totalActiveTenders: allActive.total,
          pendingApprovals: internalReview.total + awardRecommendation.total,
          openClarifications: clarification.total,
          inEvaluation: techOpening.total + techEval.total,
          awaitingCommercialOpening: commercialSealed.total,
          pendingVendors: pendingVendors.total ?? 0,
        });
        setRecentTenders(recent.data ?? []);

        // Upcoming deadlines: tenders in Clarification Period with deadline soon
        const sorted = (clarification.data ?? [])
          .filter(t => t.submissionDeadline)
          .sort((a, b) => new Date(a.submissionDeadline!).getTime() - new Date(b.submissionDeadline!).getTime())
          .slice(0, 5);
        setUpcomingDeadlines(sorted);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Active Tenders', value: counts.totalActiveTenders, icon: 'gavel', color: 'accent', href: '/tenders' },
    { label: 'Pending Approvals', value: counts.pendingApprovals, icon: 'approval', color: 'amber', href: '/approvals' },
    { label: 'Open Clarifications', value: counts.openClarifications, icon: 'forum', color: 'purple', href: '/clarifications' },
    { label: 'In Evaluation', value: counts.inEvaluation, icon: 'fact_check', color: 'orange', href: '/technical-evaluation' },
    { label: 'Awaiting Opening', value: counts.awaitingCommercialOpening, icon: 'lock', color: 'red', href: '/committee-opening' },
    { label: 'Pending Vendors', value: counts.pendingVendors, icon: 'storefront', color: 'blue', href: '/vendors' },
  ];

  const colorClasses: Record<string, { bg: string; text: string; ring: string }> = {
    accent: { bg: 'bg-accent/10', text: 'text-accent', ring: 'group-hover:ring-accent/30' },
    amber:  { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'group-hover:ring-amber-300' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'group-hover:ring-purple-300' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'group-hover:ring-orange-300' },
    red:    { bg: 'bg-danger/10', text: 'text-danger', ring: 'group-hover:ring-danger/30' },
    blue:   { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'group-hover:ring-blue-300' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Procurement Dashboard</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Live snapshot of tender pipeline, pending actions, and approaching deadlines.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(s => {
          const c = colorClasses[s.color];
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group bg-card rounded-xl border border-border p-4 shadow-sm hover:shadow-md hover:ring-2 ${c.ring} transition-all`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary leading-tight">{s.label}</span>
                <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.text} flex items-center justify-center flex-shrink-0`}>
                  <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                </div>
              </div>
              <p className={`text-3xl font-bold ${c.text}`}>{loading ? '—' : s.value}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-bg flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary">Recent Tenders</h2>
            <Link href="/tenders" className="text-xs font-semibold text-accent hover:underline">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>
          ) : recentTenders.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-secondary">No recent tenders.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg/50 border-b border-border">
                <tr>
                  <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Reference</th>
                  <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Title</th>
                  <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                  <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Department</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTenders.map(t => (
                  <tr key={t.id} className="hover:bg-bg/60">
                    <td className="px-5 py-3">
                      <Link href={`/tenders/${t.id}`} className="font-mono text-xs font-bold text-accent hover:underline">
                        {t.referenceNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/tenders/${t.id}`} className="text-sm font-semibold text-text-primary hover:text-accent">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_COLORS[t.status] ?? 'bg-border text-text-secondary'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-secondary text-xs">{t.departmentName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming deadlines */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-bg">
            <h2 className="text-sm font-bold text-text-primary">Upcoming Deadlines</h2>
            <p className="text-[11px] text-text-secondary mt-0.5">Tenders in Clarification Period</p>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>
          ) : upcomingDeadlines.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-symbols-outlined text-[40px] text-text-secondary/20 block mb-2">event_available</span>
              <p className="text-sm text-text-secondary">No upcoming deadlines.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcomingDeadlines.map(t => {
                const days = daysUntil(t.submissionDeadline);
                const urgent = days !== null && days <= 3;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tenders/${t.id}`}
                      className="block px-5 py-3 hover:bg-bg/60 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-xs font-bold text-accent">{t.referenceNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          urgent ? 'bg-danger/15 text-danger' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {days !== null
                            ? days >= 0 ? `${days}d` : 'OVERDUE'
                            : '—'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-text-primary leading-snug mb-1">{t.title}</p>
                      <p className="text-xs text-text-secondary">Due {formatDate(t.submissionDeadline)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <h2 className="text-sm font-bold text-text-primary mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: '/tenders/new', label: 'New Tender', icon: 'add_circle' },
            { href: '/approvals', label: 'Review Approvals', icon: 'approval' },
            { href: '/clarifications', label: 'Answer Clarifications', icon: 'forum' },
            { href: '/reports', label: 'Generate Report', icon: 'description' },
          ].map(a => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-3 p-3 bg-bg hover:bg-accent/5 border border-border rounded-lg transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[20px]">{a.icon}</span>
              </div>
              <span className="text-sm font-semibold text-text-primary">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
