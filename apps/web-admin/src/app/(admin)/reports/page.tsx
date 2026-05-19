'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportDefinition {
  code: string;
  name: string;
  description?: string;
  category?: string;
  requiresCommercialExportPermission?: boolean;
}

interface ReportExportJob {
  id: string;
  reportCode?: string;
  reportName?: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  format?: 'XLSX' | 'PDF';
  enqueuedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  fileSize?: number;
}

type ExportFormat = 'XLSX' | 'PDF';

const STATUS_STYLES: Record<ReportExportJob['status'], { label: string; cls: string; icon: string }> = {
  QUEUED:    { label: 'Queued',   cls: 'bg-border text-text-secondary', icon: 'schedule' },
  RUNNING:   { label: 'Running',  cls: 'bg-amber-100 text-amber-800', icon: 'sync' },
  COMPLETED: { label: 'Ready',    cls: 'bg-success/10 text-success', icon: 'check_circle' },
  FAILED:    { label: 'Failed',   cls: 'bg-danger/10 text-danger', icon: 'error' },
};

const CATEGORY_ICONS: Record<string, string> = {
  Tender: 'gavel',
  Vendor: 'storefront',
  Financial: 'payments',
  Audit: 'policy',
  Operations: 'analytics',
  Default: 'description',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [jobs, setJobs] = useState<ReportExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCommercialExport, setCanCommercialExport] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('XLSX');
  const [enqueueing, setEnqueueing] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (token) setCanCommercialExport(hasPermission(token, 'commercial:export'));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const [defsRes, jobsRes] = await Promise.all([
        get<{ items: ReportDefinition[] }>('/reports', token),
        // GAP: GET /reports/jobs (history) not contracted. Speculative.
        get<{ items: ReportExportJob[] }>('/reports/jobs?pageSize=20', token).catch(() => ({ items: [] })),
      ]);
      setReports(defsRes.items ?? []);
      setJobs(jobsRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Poll running jobs
  useEffect(() => {
    const running = jobs.filter(j => j.status === 'QUEUED' || j.status === 'RUNNING');
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      const token = getAccessToken();
      const updated = await Promise.all(
        running.map(j =>
          get<ReportExportJob>(`/reports/jobs/${j.id}`, token).catch(() => null),
        ),
      );
      setJobs(prev => prev.map(j => {
        const fresh = updated.find(u => u?.id === j.id);
        return fresh ? { ...j, ...fresh } : j;
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  async function handleEnqueue(report: ReportDefinition) {
    if (report.requiresCommercialExportPermission && !canCommercialExport) {
      alert('This report requires commercial:export permission.');
      return;
    }
    setEnqueueing(report.code);
    setError(null);
    try {
      const token = getAccessToken();
      const job = await post<ReportExportJob>(
        `/reports/${report.code}/export`,
        { format },
        token,
      );
      setJobs(prev => [{
        ...job,
        reportCode: report.code,
        reportName: report.name,
        format,
        enqueuedAt: new Date().toISOString(),
      }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enqueue export');
    } finally {
      setEnqueueing(null);
    }
  }

  function downloadJob(job: ReportExportJob) {
    const token = getAccessToken();
    // Streaming download — open in new tab with Authorization header is awkward;
    // here we use fetch + blob to preserve auth.
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/reports/jobs/${job.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${job.reportName ?? job.reportCode ?? 'report'}.${(job.format ?? 'xlsx').toLowerCase()}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => alert(err instanceof Error ? err.message : 'Download failed'));
  }

  // Group reports by category
  const grouped = reports.reduce<Record<string, ReportDefinition[]>>((acc, r) => {
    const cat = r.category ?? 'Reports';
    (acc[cat] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Reports &amp; Analytics</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Async export jobs. Downloads audit-logged. Commercial reports gated by <code>commercial:export</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
            {(['XLSX', 'PDF'] as ExportFormat[]).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  format === f ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAll}
            className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      {/* Report catalog */}
      <div className="space-y-5">
        {loading ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-text-secondary">Loading…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-text-secondary">No reports configured.</div>
        ) : (
          Object.entries(grouped).map(([category, defs]) => (
            <div key={category}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">{category}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {defs.map(r => {
                  const gated = r.requiresCommercialExportPermission && !canCommercialExport;
                  return (
                    <div
                      key={r.code}
                      className={`bg-card rounded-xl border border-border p-5 shadow-sm flex flex-col ${gated ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[22px] text-accent">
                            {CATEGORY_ICONS[category] ?? CATEGORY_ICONS.Default}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-text-primary leading-snug">{r.name}</p>
                          <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-0.5 font-mono">{r.code}</p>
                        </div>
                      </div>
                      {r.description && (
                        <p className="text-xs text-text-secondary mb-4 flex-1">{r.description}</p>
                      )}
                      {r.requiresCommercialExportPermission && (
                        <div className="mb-3 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 self-start">
                          <span className="material-symbols-outlined text-[12px]">lock</span>
                          commercial:export
                        </div>
                      )}
                      <button
                        onClick={() => handleEnqueue(r)}
                        disabled={gated || enqueueing === r.code}
                        className="w-full px-4 py-2 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title={gated ? 'Requires commercial:export permission' : undefined}
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                        {enqueueing === r.code ? 'Enqueueing…' : `Export ${format}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Job history */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Recent Export Jobs</h2>
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {jobs.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-secondary">No export jobs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Report</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Format</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Enqueued</th>
                  <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-text-secondary">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map(j => {
                  const meta = STATUS_STYLES[j.status];
                  return (
                    <tr key={j.id} className="hover:bg-bg/60">
                      <td className="px-4 py-3 font-semibold text-text-primary">
                        {j.reportName ?? j.reportCode ?? j.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{j.format ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${meta.cls}`}>
                          <span className={`material-symbols-outlined text-[14px] ${j.status === 'RUNNING' ? 'animate-spin' : ''}`}>
                            {meta.icon}
                          </span>
                          {meta.label}
                        </span>
                        {j.status === 'FAILED' && j.errorMessage && (
                          <p className="text-[11px] text-danger mt-1">{j.errorMessage}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {j.enqueuedAt ? new Date(j.enqueuedAt).toLocaleString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {j.status === 'COMPLETED' ? (
                          <button
                            onClick={() => downloadJob(j)}
                            className="px-3 py-1.5 bg-success/10 text-success rounded-lg text-xs font-bold hover:bg-success/20"
                          >
                            Download
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
