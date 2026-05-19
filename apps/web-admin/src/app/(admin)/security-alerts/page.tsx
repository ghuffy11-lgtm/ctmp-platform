'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { get, patch } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  metadata?: Record<string, unknown>;
  sourceIp?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  acknowledged: boolean;
  createdAt: string;
}

interface SecurityAlertListResponse {
  items: SecurityAlert[];
  total: number;
  page: number;
  pageSize: number;
}

const SEVERITY_STYLES: Record<SecurityAlert['severity'], string> = {
  LOW:      'bg-success/10 text-success',
  MEDIUM:   'bg-amber-100 text-amber-800',
  HIGH:     'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-danger/15 text-danger font-bold',
};

const PAGE_SIZE = 50;

export default function SecurityAlertsPage() {
  const [permChecked, setPermChecked] = useState(false);
  const [canView, setCanView] = useState(false);

  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ackLoading, setAckLoading] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    setCanView(!!token && hasPermission(token, 'audit:view'));
    setPermChecked(true);
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (unacknowledgedOnly) params.set('unacknowledgedOnly', 'true');
      const res = await get<SecurityAlertListResponse>(`/security-alerts?${params}`, token);
      setAlerts(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security alerts');
    } finally {
      setLoading(false);
    }
  }, [canView, page, unacknowledgedOnly]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function acknowledge(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setAckLoading(id);
    try {
      await patch(`/security-alerts/${id}/acknowledge`, {}, token);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() } : a));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed');
    } finally {
      setAckLoading(null);
    }
  }

  if (!permChecked) return null;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4 text-center max-w-md mx-auto">
        <span className="material-symbols-outlined text-[72px] text-text-secondary/30">security</span>
        <h1 className="text-xl font-bold text-text-primary">Audit Access Required</h1>
        <p className="text-sm text-text-secondary">
          Viewing security alerts requires the <code className="bg-bg px-1.5 py-0.5 rounded text-xs">audit:view</code> permission.
        </p>
      </div>
    );
  }

  const unacked = alerts.filter(a => !a.acknowledged).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Security Alerts</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            System integrity events — audit chain breaks and other critical signals.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unacked > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-danger/15 text-danger text-xs font-bold">
              {unacked} unacknowledged
            </span>
          )}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={unacknowledgedOnly}
              onChange={e => { setUnacknowledgedOnly(e.target.checked); setPage(1); }}
              className="rounded border-border"
            />
            Unacknowledged only
          </label>
          <button
            onClick={fetchAlerts}
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

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-40">Time</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Severity</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Message</th>
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary w-36">Status</th>
              <th className="px-4 py-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">Loading…</td></tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <span className="material-symbols-outlined text-[40px] text-text-secondary/30 block mb-2">verified_user</span>
                  <p className="text-sm text-text-secondary">No security alerts. System integrity is intact.</p>
                </td>
              </tr>
            ) : (
              alerts.map(alert => (
                <React.Fragment key={alert.id}>
                  <tr
                    onClick={() => setExpanded(prev => prev === alert.id ? null : alert.id)}
                    className={`cursor-pointer hover:bg-bg/60 ${!alert.acknowledged ? 'bg-danger/5' : ''}`}
                  >
                    <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                      {new Date(alert.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-text-primary">{alert.alertType}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_STYLES[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary max-w-sm truncate">{alert.message}</td>
                    <td className="px-4 py-3">
                      {alert.acknowledged ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Acknowledged
                        </span>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); acknowledge(alert.id); }}
                          disabled={ackLoading === alert.id}
                          className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-semibold hover:bg-danger/90 disabled:opacity-50"
                        >
                          {ackLoading === alert.id ? 'Saving…' : 'Acknowledge'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`material-symbols-outlined text-[18px] text-text-secondary transition-transform ${expanded === alert.id ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </td>
                  </tr>
                  {expanded === alert.id && (
                    <tr key={`${alert.id}-detail`} className="bg-bg">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {alert.sourceIp && <DetailGroup label="Source IP" value={alert.sourceIp} mono />}
                          {alert.targetEntityType && <DetailGroup label="Target Entity Type" value={alert.targetEntityType} />}
                          {alert.targetEntityId && <DetailGroup label="Target Entity ID" value={alert.targetEntityId} mono />}
                          {alert.acknowledgedBy && <DetailGroup label="Acknowledged By" value={alert.acknowledgedBy} mono />}
                          {alert.acknowledgedAt && (
                            <DetailGroup
                              label="Acknowledged At"
                              value={new Date(alert.acknowledgedAt).toLocaleString('en-GB')}
                            />
                          )}
                        </div>
                        {alert.metadata && (
                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Metadata</p>
                            <pre className="bg-card rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48 border border-border">
                              {JSON.stringify(alert.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>

        {total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg">
            <p className="text-xs text-text-secondary">Page {page} of {totalPages} • {total} total alerts</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >Previous</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-40 hover:bg-card"
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
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
