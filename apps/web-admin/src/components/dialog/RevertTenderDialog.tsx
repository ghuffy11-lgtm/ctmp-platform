'use client';

// BUG-112 (2026-06-07) Piece 1: Revert dialog. Lets an admin roll a
// Published tender back to Approved / Internal Review / Draft so they can
// fix a publishing mistake. Blocked if any vendor has already submitted
// a binding bid — owner must Cancel and re-publish in that case
// (compliance). Reason required, ≥20 chars. Calls
// POST /tenders/:id/revert; backend enforces the bid-count guard too.

import { useEffect, useState } from 'react';
import { X, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { get, post } from '@/lib/api';

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  onClose: () => void;
  onReverted: () => void;
}

interface BidsListResponse {
  data?: Array<{ id: string; status: string }>;
  items?: Array<{ id: string; status: string }>;
}

const TARGETS = [
  { value: 'Approved', label: 'Approved', help: 'Re-publish later with the same approval record.' },
  { value: 'Internal Review', label: 'Internal Review', help: 'Send back to the reviewer for edits before re-approval.' },
  { value: 'Draft', label: 'Draft', help: 'Restart from scratch — approval will be required again.' },
] as const;

const BINDING_BID_STATUSES = new Set([
  'SUBMITTED',
  'LATE_SUBMITTED',
  'LATE_ACCEPTED',
  'EVALUATED',
  'AWARDED',
  'NOT_AWARDED',
  'DISQUALIFIED',
]);

const MIN_REASON = 20;

export function RevertTenderDialog({ open, tenderId, tenderReference, onClose, onReverted }: Props) {
  const [targetStatus, setTargetStatus] = useState<typeof TARGETS[number]['value']>('Approved');
  const [reason, setReason] = useState('');
  const [bindingBidCount, setBindingBidCount] = useState<number | null>(null);
  const [loadingBids, setLoadingBids] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTargetStatus('Approved');
    setReason('');
    setError(null);
    setBindingBidCount(null);
    setLoadingBids(true);
    const token = getAccessToken();
    if (!token) {
      setLoadingBids(false);
      return;
    }
    // Load bid list to surface a binding-bid warning before the user
    // types a reason. The backend will reject too if we get this wrong.
    get<BidsListResponse>(`/tenders/${tenderId}/bids?pageSize=200`, token)
      .then((res) => {
        const bids = res.data ?? res.items ?? [];
        const binding = bids.filter((b) => BINDING_BID_STATUSES.has(b.status)).length;
        setBindingBidCount(binding);
      })
      .catch(() => {
        // Surface a non-blocking warning; let server be the source of truth.
        setBindingBidCount(null);
      })
      .finally(() => setLoadingBids(false));
  }, [open, tenderId]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const blocked = (bindingBidCount ?? 0) > 0;
  const canSubmit = reasonOk && !blocked && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const token = getAccessToken();
    try {
      await post(
        `/tenders/${tenderId}/revert`,
        { targetStatus, reason: reason.trim() },
        token,
      );
      onReverted();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Revert failed');
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
            <h2 className="text-lg font-semibold">Revert tender</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-bg rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-secondary">
            Roll <span className="font-mono font-semibold text-text-primary">{tenderReference}</span>{' '}
            back from <span className="font-semibold">Published</span> so it can be edited.
          </p>

          {loadingBids ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking for submitted bids…
            </div>
          ) : blocked ? (
            <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Cannot revert — binding bids on record.</p>
                <p className="mt-1">
                  {bindingBidCount} vendor{bindingBidCount === 1 ? ' has' : 's have'} already submitted a bid.
                  Use <strong>Cancel Tender</strong> instead so the bid trail is preserved.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-text-secondary">
              No binding bids found — safe to revert.
            </div>
          )}

          <fieldset className="space-y-2" disabled={blocked || submitting}>
            <legend className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
              Roll back to
            </legend>
            {TARGETS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  targetStatus === opt.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:bg-bg'
                } ${blocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="revert-target"
                  value={opt.value}
                  checked={targetStatus === opt.value}
                  onChange={() => setTargetStatus(opt.value)}
                  className="mt-1"
                  disabled={blocked || submitting}
                />
                <div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-text-secondary">{opt.help}</div>
                </div>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="revert-reason" className="text-xs font-semibold uppercase tracking-wider text-text-secondary block mb-1">
              Reason (min {MIN_REASON} characters)
            </label>
            <textarea
              id="revert-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={blocked || submitting}
              placeholder="Explain why this tender is being reverted. Recorded in the audit trail."
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:opacity-50"
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
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            {submitting ? 'Reverting…' : 'Revert tender'}
          </button>
        </div>
      </div>
    </div>
  );
}
