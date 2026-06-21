'use client';

import { useState } from 'react';
import { Award, CheckCircle2, FileDown, Mail, ShieldAlert } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';

export interface AwardSummary {
  awardId: string;
  winnerVendorId: string;
  winnerVendorName: string;
  winnerBidId: string;
  winnerPrice: number | null;
  winnerCurrency: string;
  isLowest: boolean;
  justificationText: string | null;
  justificationPdfFilename: string | null;
  notifyWinner: boolean;
  notifyLosers: boolean;
  confirmedByName: string;
  confirmedAt: string;
  minutesGeneratedAt: string | null;
  // BUG-115 (2026-06-09): null when the awarded bid was not negotiated.
  negotiationSavings?: {
    originalPrice: number;
    finalPrice: number;
    savingsAmount: number;
    savingsPercent: number;
    roundCount: number;
  } | null;
}

function fmtCurrency(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(amount);
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  award: AwardSummary;
  tenderId: string;
  tenderReference: string;
  /** Caller can generate Minutes (already in BUG-053 perms; passed for the button gate). */
  canGenerateMinutes: boolean;
}

/**
 * BUG-054 / WALK-050. Surfaces the active Award row at the top of the
 * Commercial Comparison page once a tender is Awarded so the page tells
 * the reader "this tender is decided" instead of re-rendering the same
 * comparison surface. Per-vendor cards collapse below into an
 * audit-reference expander.
 *
 * Minutes PDF generation remains manual per owner decision 2026-05-29 —
 * the button links to the existing /tenders/:id/award/minutes.pdf
 * endpoint and the user can re-click to regenerate.
 */
export function AwardSummaryCard({ award, tenderId, tenderReference, canGenerateMinutes }: Props) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [minutesError, setMinutesError] = useState<string | null>(null);

  // Bearer token lives in js-cookie / localStorage, not in HTTP cookies, so a
  // plain <a href> hits the API without Authorization and 401s. Fetch as a
  // blob and open. Mirrors CommercialDocumentsList.handleDownload.
  async function handleOpenMinutes() {
    setMinutesLoading(true);
    setMinutesError(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/tenders/${tenderId}/award/minutes.pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error('Not authorised to generate Award Minutes.');
      }
      if (!res.ok) {
        throw new Error(`Minutes request failed (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setMinutesError(err instanceof Error ? err.message : 'Minutes request failed');
    } finally {
      setMinutesLoading(false);
    }
  }

  return (
    <div className="bg-card border border-success/40 rounded-xl overflow-hidden shadow-md shadow-success/5">
      {/* Header band */}
      <div className="bg-success/10 px-6 py-4 border-b border-success/20 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
          <Award className="w-5 h-5 text-success" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-success font-bold">Awarded</p>
          <h2 className="text-lg font-bold text-text-primary mt-0.5 truncate">
            {tenderReference} · Award decided
          </h2>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Winner block — most prominent */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-1">
            Winner
          </p>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span className="text-2xl font-bold text-text-primary">
              {award.winnerVendorName}
            </span>
            <span className="text-xl font-mono font-semibold text-success">
              {fmtCurrency(award.winnerPrice, award.winnerCurrency)}
            </span>
            {award.isLowest ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-success/15 text-success">
                <CheckCircle2 className="w-3 h-3" /> Lowest PASS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-amber-100 text-amber-900">
                <ShieldAlert className="w-3 h-3" /> Override
              </span>
            )}
          </div>
          {/* BUG-115 (2026-06-09): negotiation savings sub-line. */}
          {award.negotiationSavings && (
            <p className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Awarded after <strong>{award.negotiationSavings.roundCount}</strong> negotiation round
              {award.negotiationSavings.roundCount === 1 ? '' : 's'} — saved{' '}
              <strong>{fmtCurrency(award.negotiationSavings.savingsAmount, award.winnerCurrency)}</strong>{' '}
              ({award.negotiationSavings.savingsPercent.toFixed(1)}% off the original{' '}
              {fmtCurrency(award.negotiationSavings.originalPrice, award.winnerCurrency)}).
            </p>
          )}
        </div>

        {/* Confirmer + date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-0.5">
              Confirmed by
            </p>
            <p className="text-text-primary">{award.confirmedByName}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold mb-0.5">
              Confirmed at
            </p>
            <p className="text-text-primary">{fmtDateTime(award.confirmedAt)}</p>
          </div>
        </div>

        {/* Override justification (only when isLowest = false) */}
        {!award.isLowest && (award.justificationText || award.justificationPdfFilename) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-amber-900 font-bold mb-1">
              Override justification
            </p>
            {award.justificationText && (
              <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                {award.justificationText}
              </p>
            )}
            {award.justificationPdfFilename && (
              <p className="text-xs text-amber-900 mt-2 italic">
                Supporting PDF: <span className="font-mono">{award.justificationPdfFilename}</span>
              </p>
            )}
          </div>
        )}

        {/* Notification flags */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <p className="text-[11px] uppercase tracking-wider text-text-secondary font-semibold">
            Notifications
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Mail className={`w-3.5 h-3.5 ${award.notifyWinner ? 'text-success' : 'text-text-secondary/40'}`} />
            Winner {award.notifyWinner ? 'notified' : 'not sent'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Mail className={`w-3.5 h-3.5 ${award.notifyLosers ? 'text-success' : 'text-text-secondary/40'}`} />
            Losers {award.notifyLosers ? 'notified' : 'not sent'}
          </span>
        </div>

        {/* Actions row */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            {canGenerateMinutes && (
              <button
                type="button"
                onClick={handleOpenMinutes}
                disabled={minutesLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                <FileDown className="w-4 h-4" />
                {minutesLoading
                  ? 'Preparing PDF…'
                  : award.minutesGeneratedAt
                    ? 'Regenerate Award Minutes'
                    : 'Generate Award Minutes'}
              </button>
            )}
            {award.minutesGeneratedAt && (
              <p className="text-xs text-text-secondary">
                Last generated {fmtDateTime(award.minutesGeneratedAt)}
              </p>
            )}
          </div>
          {minutesError && <p className="text-xs text-danger">{minutesError}</p>}
        </div>
      </div>
    </div>
  );
}
