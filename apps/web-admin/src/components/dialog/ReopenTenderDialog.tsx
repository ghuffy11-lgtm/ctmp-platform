'use client';

// BUG-125 (2026-06-11): reverse of Close Tender. Reopens a Tender Closed
// tender back to Awarded so the award can be amended, minutes regenerated,
// or further admin work performed. Requires a 20-char reason — HIGH-risk
// audit event since it un-finalises an archived record.

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  onClose: () => void;
  onReopened: () => void;
}

const MIN_REASON = 20;

export function ReopenTenderDialog({
  open,
  tenderId,
  tenderReference,
  onClose,
  onReopened,
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

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/reopen`, { reason: reason.trim() }, token);
      onReopened();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reopen failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Reopen tender</h2>
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
                Reopen <span className="font-mono">{tenderReference}</span>?
              </p>
              <p className="mt-1">
                The tender state moves from <strong>Tender Closed</strong> back to <strong>Awarded</strong>.
                The award decision is preserved. This action is audit-logged at HIGH severity.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="reopen-reason"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1"
            >
              Reason (min {MIN_REASON} characters)
            </label>
            <textarea
              id="reopen-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              placeholder="Explain why this tender is being re-opened. Recorded in the audit trail."
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
            />
            <div className="mt-1 flex justify-between text-xs text-text-secondary">
              <span>
                {reason.trim().length} / {MIN_REASON}+ chars
              </span>
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
            disabled={!reasonOk || submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {submitting ? 'Reopening…' : 'Reopen tender'}
          </button>
        </div>
      </div>
    </div>
  );
}
