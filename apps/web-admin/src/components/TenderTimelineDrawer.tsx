'use client';

import { useEffect, useState } from 'react';
import { X, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface AuditLogEntry {
  id: string;
  eventType: string;
  eventTime: string;
  actorName?: string;
  actorRole?: string;
  reason?: string;
  riskLevel?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}

interface Props {
  tenderId: string | null;
  open: boolean;
  onClose: () => void;
  tenderReference?: string;
}

/**
 * BUG-019: side drawer showing the tender's chronological audit-log
 * history. Reuses the existing GET /tenders/:id/audit-logs endpoint.
 */
export function TenderTimelineDrawer({ tenderId, open, onClose, tenderReference }: Props) {
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !tenderId) {
      setItems(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<{ items: AuditLogEntry[] }>(
          `/tenders/${tenderId}/audit-logs?pageSize=200`,
          token,
        );
        if (!cancelled) setItems(res.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [open, tenderId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex print:hidden">
      <div className="flex-1 bg-black/40" onClick={onClose} aria-label="Close timeline" />
      <aside className="w-[440px] h-full bg-card border-l border-border shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">Tender Timeline</p>
            <p className="text-xs text-text-secondary truncate">
              {tenderReference ?? tenderId} · Chronological audit history
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:bg-bg rounded-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-danger mx-auto mb-2" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : items === null ? (
            <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="w-10 h-10 text-text-secondary/30 mx-auto mb-2" />
              <p className="text-sm text-text-secondary">No audit events for this tender yet.</p>
            </div>
          ) : (
            <ol className="divide-y divide-border">
              {items.slice().reverse().map(ev => {
                const isOpen = expanded.has(ev.id);
                const hasDetail = !!(ev.beforeValue || ev.afterValue || ev.reason);
                return (
                  <li key={ev.id} className="p-4">
                    <button
                      onClick={() => {
                        if (!hasDetail) return;
                        const next = new Set(expanded);
                        if (next.has(ev.id)) next.delete(ev.id); else next.add(ev.id);
                        setExpanded(next);
                      }}
                      className={`w-full text-left flex items-start gap-2 ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {hasDetail ? (
                        isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-text-secondary flex-shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-text-secondary flex-shrink-0" />
                      ) : (
                        <span className="w-4 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary truncate">{ev.eventType}</p>
                        <p className="text-xs text-text-secondary">
                          {new Date(ev.eventTime).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {ev.actorName ? ` · ${ev.actorName}` : ''}
                          {ev.actorRole ? ` (${ev.actorRole})` : ''}
                        </p>
                        {ev.reason && !isOpen && (
                          <p className="text-xs text-text-secondary mt-1 italic line-clamp-1">{ev.reason}</p>
                        )}
                      </div>
                    </button>
                    {isOpen && hasDetail && (
                      <pre className="mt-2 ml-6 text-[11px] font-mono bg-bg border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                        {JSON.stringify({ reason: ev.reason, before: ev.beforeValue, after: ev.afterValue, riskLevel: ev.riskLevel }, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
