'use client';

// BUG-117 (2026-06-09): cancellation needs a reason. Replaces the bare
// useConfirm() + POST {} pattern that sent no reason — backend's cancel()
// rejects with 400 "Cancellation reason required". This dialog mirrors
// RevertTenderDialog (same destructive-action shape).

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X, XCircle } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  tenderStatus: string;
  onClose: () => void;
  onCancelled: () => void;
}

const MIN_REASON = 20;

export function CancelTenderDialog({
  open,
  tenderId,
  tenderReference,
  tenderStatus,
  onClose,
  onCancelled,
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
  const canSubmit = reasonOk && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/cancel`, { reason: reason.trim() }, token);
      onCancelled();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-danger" />
            <h2 className="text-lg font-semibold">Cancel tender</h2>
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
          <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">This action cannot be undone.</p>
              <p className="mt-1">
                Cancelling{' '}
                <span className="font-mono font-semibold">{tenderReference}</span>{' '}
                (currently <strong>{tenderStatus}</strong>) marks the tender as Cancelled.
                It will be visible in audit trails forever but cannot be reopened.
              </p>
              <p className="mt-2">
                Any open negotiation rounds are auto-closed and all bid envelopes are locked.
                Vendors are <strong>not</strong> auto-notified — notify out-of-band if needed.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="cancel-reason"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1"
            >
              Reason (min {MIN_REASON} characters)
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              placeholder="Explain why this tender is being cancelled. Recorded in the audit trail."
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger disabled:opacity-50"
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
            Keep tender
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-danger text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            {submitting ? 'Cancelling…' : 'Cancel tender'}
          </button>
        </div>
      </div>
    </div>
  );
}
