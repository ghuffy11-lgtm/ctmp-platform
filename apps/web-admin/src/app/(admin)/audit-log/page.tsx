'use client';

import { useState, useEffect, useCallback } from 'react';
import { get } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  eventType: string;
  actorUserId?: string;
  actorVendorUserId?: string;
  actorRole?: string;
  actorName?: string;
  entityType: string;
  entityId?: string;
  tenderId?: string;
  vendorId?: string;
  bidId?: string;
  ipAddress?: string;
  userAgent?: string;
  eventTime: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  reason?: string;
  metadata?: Record<string, unknown>;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  hashChainValue: string;
}

interface AuditLogListResponse {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

const RISK_STYLES: Record<NonNullable<AuditLog['riskLevel']>, string> = {
  LOW:      'bg-success/10 text-success',
  MEDIUM:   'bg-amber-100 text-amber-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-danger/15 text-danger',
};

const PAGE_SIZE = 50;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [permChecked, setPermChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    setCanView(!!token && hasPermission(token, 'audit:view'));
    setPermChecked(true);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (eventType) params.set('eventType', eventType);
      if (entityType) params.set('entityType', entityType);
      const res = await get<AuditLogListResponse>(`/audit-logs?${params}`, token);
      setLogs(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [canView, page, eventType, entityType]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (!permChecked) return null;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4 text-center max-w-md mx-auto">
        <span className="material-symbols-outlined text-[72px] text-text-secondary/30">policy</span>
        <h1 className="text-xl font-bold text-text-primary">Audit Access Required</h1>
        <p className="text-sm text-text-secondary">
          Viewing audit logs requires the <code className="bg-bg px-1.5 py-0.5 rounded text-xs">audit:view</code> permission.
        </p>
      </div>
    );
  }

  const visible = search
    ? logs.filter(l => {
        const q = search.toLowerCase();
        return l.eventType.toLowerCase().includes(q)
          || l.entityType.toLowerCase().includes(q)
          || (l.actorName ?? '').toLowerCase().includes(q)
          || (l.reason ?? '').toLowerCase().includes(q);
      })
    : logs;
  const filtered = riskFilter ? visible.filter(l => l.riskLevel === riskFilter) : visible;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Audit Log Viewer</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Append-only event log. Hash-chained, immutable. Every entry was written by the database, not the application.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-secondary">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search event / entity / actor / reason"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg"
          />
        </div>
        <input
          value={eventType}
          onChange={e => { setEventType(e.target.value); setPage(1); }}
          placeholder="Event type (e.g. TENDER_PUBLISHED)"
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg w-[220px]"
        />
        <input
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1); }}
          placeholder="Entity type"
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg w-[160px]"
        />
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Risk Levels</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      {/* Log table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-44">Time</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Event</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Actor</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Entity</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Risk</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">No matching audit events.</td></tr>
            ) : (
              filtered.map(log => (
                <FragmentRow
                  key={log.id}
                  log={log}
                  isExpanded={expanded === log.id}
                  onToggle={() => setExpanded(prev => prev === log.id ? null : log.id)}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg">
            <p className="text-xs text-text-secondary">
              Page {page} of {totalPages} • {total} total events
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-text-secondary italic">
        Audit log is append-only and hash-chained. Each entry's <code>hashChainValue</code> binds it to the previous entry; tampering breaks the chain and is detectable.
      </p>
    </div>
  );
}

function FragmentRow({ log, isExpanded, onToggle }: { log: AuditLog; isExpanded: boolean; onToggle: () => void }) {
  const time = new Date(log.eventTime);
  const risk = log.riskLevel;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-bg/60">
        <td className="px-4 py-3 text-text-secondary text-xs font-mono">
          {time.toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </td>
        <td className="px-4 py-3">
          <p className="font-mono text-xs font-bold text-text-primary">{log.eventType}</p>
          {log.reason && <p className="text-[11px] text-text-secondary mt-0.5 italic">{log.reason}</p>}
        </td>
        <td className="px-4 py-3 text-text-primary text-sm">
          {log.actorName ?? log.actorUserId?.slice(0, 8) ?? log.actorVendorUserId?.slice(0, 8) ?? 'system'}
          {log.actorRole && <p className="text-[10px] uppercase text-text-secondary tracking-wider">{log.actorRole}</p>}
        </td>
        <td className="px-4 py-3 text-sm">
          <p className="font-semibold text-text-primary">{log.entityType}</p>
          {log.entityId && <p className="text-[11px] text-text-secondary font-mono">{log.entityId.slice(0, 8)}…</p>}
        </td>
        <td className="px-4 py-3">
          {risk ? (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${RISK_STYLES[risk]}`}>{risk}</span>
          ) : (
            <span className="text-text-secondary text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`material-symbols-outlined text-[18px] text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-bg">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <DetailGroup label="IP Address" value={log.ipAddress ?? '—'} mono />
              <DetailGroup label="User Agent" value={log.userAgent ?? '—'} />
              {log.tenderId && <DetailGroup label="Tender" value={log.tenderId} mono />}
              {log.vendorId && <DetailGroup label="Vendor" value={log.vendorId} mono />}
              {log.bidId && <DetailGroup label="Bid" value={log.bidId} mono />}
              <DetailGroup label="Hash Chain" value={log.hashChainValue.slice(0, 32) + '…'} mono />
            </div>
            {(log.beforeValue || log.afterValue) && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {log.beforeValue && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Before</p>
                    <pre className="bg-card rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48 border border-border">
                      {JSON.stringify(log.beforeValue, null, 2)}
                    </pre>
                  </div>
                )}
                {log.afterValue && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">After</p>
                    <pre className="bg-card rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48 border border-border">
                      {JSON.stringify(log.afterValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function DetailGroup({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-0.5">{label}</p>
      <p className={`text-xs text-text-primary ${mono ? 'font-mono' : ''} break-all`}>{value}</p>
    </div>
  );
}
