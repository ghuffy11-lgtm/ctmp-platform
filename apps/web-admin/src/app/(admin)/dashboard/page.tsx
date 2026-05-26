'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  FileText,
  CheckCircle2,
  Users,
  MessageSquare,
  TrendingUp,
  Plus,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';

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
  registeredVendors: number;
  openClarifications: number;
}

interface PipelineCounts {
  draft: number;
  review: number;
  approved: number;
  published: number;
  evaluation: number;
  award: number;
}

const STATUS_PILL: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  'Internal Review': 'bg-blue-100 text-blue-700',
  Approved: 'bg-blue-100 text-blue-700',
  Published: 'bg-emerald-100 text-emerald-700',
  'Clarification Period': 'bg-blue-100 text-blue-700',
  'Submission Closed': 'bg-blue-100 text-blue-700',
  'Technical Opening': 'bg-blue-100 text-blue-700',
  'Technical Evaluation': 'bg-amber-100 text-amber-700',
  'Commercial Sealed': 'bg-blue-100 text-blue-700',
  'Committee Commercial Opening': 'bg-amber-100 text-amber-700',
  'Commercial Evaluation / Comparison': 'bg-amber-100 text-amber-700',
  'Award Recommendation': 'bg-amber-100 text-amber-700',
  Awarded: 'bg-emerald-100 text-emerald-700',
  'Tender Closed': 'bg-slate-100 text-slate-600',
  Cancelled: 'bg-rose-100 text-rose-700',
  Suspended: 'bg-rose-100 text-rose-700',
  Archived: 'bg-slate-100 text-slate-600',
};

function relativeTime(iso: string | undefined): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts>({
    totalActiveTenders: 0,
    pendingApprovals: 0,
    registeredVendors: 0,
    openClarifications: 0,
  });
  const [pipeline, setPipeline] = useState<PipelineCounts>({
    draft: 0, review: 0, approved: 0, published: 0, evaluation: 0, award: 0,
  });
  const [recentTenders, setRecentTenders] = useState<TenderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const token = getAccessToken();
      const fetchByStatus = (status: string) =>
        get<PaginatedTenders>(`/tenders?status=${encodeURIComponent(status)}&pageSize=100`, token)
          .catch(() => ({ data: [], total: 0, page: 1, pageSize: 100 }));

      try {
        const [allActive, draft, internalReview, approved, published, techEval, commercialEval, awardRec, clarification, recent] =
          await Promise.all([
            get<PaginatedTenders>('/tenders?pageSize=100', token).catch(() => ({ data: [], total: 0, page: 1, pageSize: 100 })),
            fetchByStatus('Draft'),
            fetchByStatus('Internal Review'),
            fetchByStatus('Approved'),
            fetchByStatus('Published'),
            fetchByStatus('Technical Evaluation'),
            fetchByStatus('Commercial Evaluation / Comparison'),
            fetchByStatus('Award Recommendation'),
            fetchByStatus('Clarification Period'),
            get<PaginatedTenders>('/tenders?pageSize=5', token).catch(() => ({ data: [], total: 0, page: 1, pageSize: 5 })),
          ]);

        const vendors = await get<{ total: number }>('/vendors?pageSize=1', token).catch(() => ({ total: 0 }));

        setCounts({
          totalActiveTenders: allActive.total,
          pendingApprovals: internalReview.total + awardRec.total,
          registeredVendors: vendors.total ?? 0,
          openClarifications: clarification.total,
        });
        setPipeline({
          draft: draft.total,
          review: internalReview.total,
          approved: approved.total,
          published: published.total,
          evaluation: techEval.total + commercialEval.total,
          award: awardRec.total,
        });
        setRecentTenders(recent.data ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Active Tenders', value: counts.totalActiveTenders, icon: FileText, color: 'bg-blue-600', change: 'Across all stages' },
    { label: 'Pending Approvals', value: counts.pendingApprovals, icon: CheckCircle2, color: 'bg-amber-500', change: 'Requiring action' },
    { label: 'Registered Vendors', value: counts.registeredVendors, icon: Users, color: 'bg-blue-600', change: 'Enterprise partners' },
    { label: 'Open Clarifications', value: counts.openClarifications, icon: MessageSquare, color: 'bg-emerald-600', change: 'Pending vendor response' },
  ];

  const pipelineStages = [
    { label: 'Draft', value: pipeline.draft },
    { label: 'Review', value: pipeline.review },
    { label: 'Approved', value: pipeline.approved },
    { label: 'Published', value: pipeline.published },
    { label: 'Evaluation', value: pipeline.evaluation },
    { label: 'Award', value: pipeline.award },
  ];

  const maxPipeline = Math.max(...pipelineStages.map((s) => s.value), 1);

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${s.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                {s.label === 'Pending Approvals' && counts.pendingApprovals > 0 && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Action
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-slate-500">{s.label}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{loading ? '—' : s.value}</h3>
              <p className="text-xs text-slate-400 mt-1">{s.change}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline chart */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-6">Tender Distribution by Stage</h3>
        <div className="h-48 flex items-end justify-between gap-2 px-2">
          {pipelineStages.map((stage) => (
            <div key={stage.label} className="flex flex-col items-center gap-2 flex-1">
              <span className="text-xs font-bold text-slate-900">{loading ? '·' : stage.value}</span>
              <div
                className="w-full bg-blue-600 rounded-t-lg opacity-80 hover:opacity-100 transition-opacity min-h-[4px]"
                style={{ height: `${Math.max((stage.value / maxPipeline) * 160, 4)}px` }}
              />
              <span className="text-[10px] text-slate-500 font-medium text-center leading-tight">{stage.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Tender Activity</h3>
            <Link href="/tenders" className="text-sm font-medium text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
            ) : recentTenders.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No recent tenders.</div>
            ) : (
              recentTenders.map((t) => (
                <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs">
                      {t.referenceNumber.slice(-2)}
                    </div>
                    <div>
                      <Link href={`/tenders/${t.id}`} className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors font-mono">
                        {t.referenceNumber}
                      </Link>
                      <p className="text-xs text-slate-500">{t.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {t.status}
                    </span>
                    <span className="text-xs text-slate-400">{relativeTime(t.updatedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl">
            <h3 className="font-bold mb-4 text-sm">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/tenders/new"
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create New Tender
              </Link>
              <Link
                href="/approvals"
                className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <ClipboardList className="w-4 h-4" />
                Review Approvals {counts.pendingApprovals > 0 ? `(${counts.pendingApprovals})` : ''}
              </Link>
              <Link
                href="/vendors"
                className="w-full bg-white/10 hover:bg-white/20 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" /> Vendor Database
              </Link>
            </div>
          </div>

          {/* System health */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-500" /> System Health
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Core Services</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Operational</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Vendor Portal</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Operational</span>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Platform</p>
                <p className="text-xs text-slate-600">CTMP v1.0 · On-Premises</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
