'use client';

// BUG-115 (2026-06-09): launch a new negotiation round on a tender.
// Procurement picks the PASS vendors to invite, types a min-20-char reason,
// and submits. Backend closes any open prior round automatically and flips
// tender.status → NEGOTIATION.

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';

interface PassVendorOption {
  bidId: string;
  vendorName: string;
  commercialTotal: number | null;
  currency: string;
  lowestPass: boolean;
}

interface Props {
  open: boolean;
  tenderId: string;
  tenderReference: string;
  passVendors: PassVendorOption[];
  onClose: () => void;
  onLaunched: () => void;
}

const MIN_REASON_CHARS = 20;

function fmtCur(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(amount);
}

export function LaunchNegotiationDialog({
  open,
  tenderId,
  tenderReference,
  passVendors,
  onClose,
  onLaunched,
}: Props) {
  const [selectedBidIds, setSelectedBidIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  // BUG-127 (2026-06-11): optional email checkbox. Default off — owner can
  // opt in per round so the email isn't fired silently.
  const [sendEmail, setSendEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Pre-check the lowest-PASS vendor as a sensible default.
    const defaults = new Set(passVendors.filter(v => v.lowestPass).map(v => v.bidId));
    setSelectedBidIds(defaults);
    setReason('');
    setSendEmail(false);
    setError(null);
  }, [open, passVendors]);

  if (!open) return null;

  const reasonOk = reason.trim().length >= MIN_REASON_CHARS;
  const canSubmit = selectedBidIds.size > 0 && reasonOk && !submitting;

  function toggleBid(bidId: string) {
    setSelectedBidIds(prev => {
      const next = new Set(prev);
      if (next.has(bidId)) next.delete(bidId);
      else next.add(bidId);
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${tenderId}/negotiation/rounds`,
        {
          bidIds: Array.from(selectedBidIds),
          reason: reason.trim(),
          sendEmail,
        },
        token,
      );
      onLaunched();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch negotiation round');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-base font-bold text-text-primary">Launch negotiation round</p>
              <p className="text-xs text-text-secondary">
                {tenderReference} · selected vendors will be invited to submit a revised commercial.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-text-secondary hover:bg-bg rounded-lg disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-6 py-5 space-y-5">
          <div className="text-xs text-text-secondary leading-relaxed">
            Tender state moves to <strong>Negotiation</strong>. Original prices are preserved
            forever. There is no deadline — close the round (or confirm an award) when ready.
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
              Invite vendors <span className="text-danger">*</span>
            </label>
            {passVendors.length === 0 ? (
              <p className="text-sm text-text-secondary italic">No PASS vendors available to invite.</p>
            ) : (
              <ul className="space-y-1.5">
                {passVendors.map(v => (
                  <li key={v.bidId} className="flex items-center gap-3 px-3 py-2 bg-bg/40 rounded-lg">
                    <input
                      type="checkbox"
                      id={`vendor-${v.bidId}`}
                      checked={selectedBidIds.has(v.bidId)}
                      onChange={() => toggleBid(v.bidId)}
                      className="w-4 h-4"
                    />
                    <label htmlFor={`vendor-${v.bidId}`} className="flex-1 text-sm text-text-primary flex items-center justify-between gap-3 cursor-pointer">
                      <span>
                        {v.vendorName}
                        {v.lowestPass && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            Lowest-PASS
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-text-secondary">
                        {fmtCur(v.commercialTotal, v.currency)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
              Reason for this round <span className="text-danger">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={`Audit-logged. Minimum ${MIN_REASON_CHARS} characters.`}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
            <p className={`text-xs mt-1 ${reasonOk ? 'text-success' : 'text-text-secondary'}`}>
              {reason.trim().length} / {MIN_REASON_CHARS} characters minimum
            </p>
          </div>

          {/* BUG-127 (2026-06-11): optional launch-email checkbox. */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 w-4 h-4 accent-amber-600"
            />
            <span className="text-sm text-text-primary">
              Send invitation email to each selected vendor
              <span className="block text-xs text-text-secondary mt-0.5">
                Off by default. When on, each invited vendor's registered users + the per-invitation extras receive a "Negotiation invitation" email (BCC). Audit-logged per recipient.
              </span>
            </span>
          </label>

          {error && (
            <div className="bg-danger/5 border border-danger/30 rounded-lg px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-bg flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-card disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2 text-sm font-bold bg-amber-600 text-white rounded-lg hover:opacity-90 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching…</>
              : <><RefreshCw className="w-4 h-4" /> Launch round</>}
          </button>
        </footer>
      </div>
    </div>
  );
}
