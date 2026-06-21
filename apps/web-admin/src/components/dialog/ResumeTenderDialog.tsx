'use client';

// BUG-132 (2026-06-14): resume a held tender to its snapshotted previous
// status. Reason required ≥20 chars; HIGH audit severity.

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Play, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  previousStatus: string | null;
  onClose: () => void;
  onResumed: () => void;
}

const MIN_REASON = 20;

export function ResumeTenderDialog({
  open,
  tenderId,
  tenderReference,
  previousStatus,
  onClose,
  onResumed,
}: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const canSubmit = reasonOk && !submitting && !!previousStatus;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/resume`, { reason: reason.trim() }, token);
      onResumed();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resume failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Resume tender</h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="p-1 hover:bg-bg rounded disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Resuming <span className="font-mono">{tenderReference}</span>.
              </p>
              <p className="mt-1">
                The tender will return to: <strong>{previousStatus ?? '—'}</strong>. Audit-logged
                at HIGH severity.
              </p>
              {!previousStatus && (
                <p className="mt-2 text-danger">
                  No previous status recorded. Resume is unavailable — close this dialog and use a
                  workflow action to set the state explicitly.
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="resume-reason"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1"
            >
              Reason (min {MIN_REASON} characters)
            </label>
            <textarea
              id="resume-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              placeholder="Explain why this tender is being resumed. Recorded in the audit trail."
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
            />
            <div className="mt-1 flex justify-between text-xs text-text-secondary">
              <span>{reason.trim().length} / {MIN_REASON}+ chars</span>
              {!reasonOk && reason.length > 0 && <span className="text-danger">Too short</span>}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-bg/30">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {submitting ? 'Resuming…' : 'Resume tender'}
          </button>
        </div>
      </div>
    </div>
  );
}
