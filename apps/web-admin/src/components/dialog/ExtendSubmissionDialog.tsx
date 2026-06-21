'use client';

// BUG-141 (2026-06-19): re-open a Submission Closed tender with a new
// future deadline. Mirrors the RevertTenderDialog shape — reason ≥20 chars,
// HIGH-risk warning banner. Tender moves Submission Closed → Published.

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  currentSubmissionDeadline: string | null;
  onClose: () => void;
  onExtended: () => void;
}

const MIN_REASON = 20;

function defaultDeadlineDate(): string {
  // Default = 7 days from today.
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function ExtendSubmissionDialog({
  open,
  tenderId,
  tenderReference,
  currentSubmissionDeadline,
  onClose,
  onExtended,
}: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('23:59');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDeadlineDate());
    setTime('23:59');
    setReason('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const newIso = date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
  const future = newIso ? new Date(newIso).getTime() > Date.now() : false;
  const canSubmit = reasonOk && !!newIso && future && !submitting;

  async function handleSubmit() {
    if (!newIso) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${tenderId}/extend-submission`,
        { newSubmissionDeadline: newIso, reason: reason.trim() },
        token,
      );
      onExtended();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extension failed');
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
            <h2 className="text-lg font-semibold">Extend submission</h2>
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
                Re-open <span className="font-mono">{tenderReference}</span>?
              </p>
              <p className="mt-1">
                The tender moves from <strong>Submission Closed</strong> back to <strong>Published</strong>{' '}
                with a new submission deadline. Vendors who haven't yet submitted can now do so; existing
                submitted bids remain immutable. Audit-logged at HIGH severity.
              </p>
              {currentSubmissionDeadline && (
                <p className="mt-2 text-[11px]">
                  Previous deadline:{' '}
                  <span className="font-semibold">
                    {new Date(currentSubmissionDeadline).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'Asia/Kuwait',
                    })}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1">
              New submission deadline
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
                className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={submitting}
                className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
              />
            </div>
            {!future && date && (
              <p className="text-[11px] text-danger mt-1">New deadline must be in the future.</p>
            )}
            <p className="text-[11px] text-text-secondary mt-1 italic">Closing time uses GMT+3 (Kuwait time).</p>
          </div>

          <div>
            <label
              htmlFor="extend-reason"
              className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1"
            >
              Reason (min {MIN_REASON} characters)
            </label>
            <textarea
              id="extend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={submitting}
              placeholder="Explain why this tender is being re-opened. Recorded in the audit trail."
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
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {submitting ? 'Extending…' : 'Extend submission'}
          </button>
        </div>
      </div>
    </div>
  );
}
