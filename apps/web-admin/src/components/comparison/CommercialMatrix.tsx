'use client';

import { useState } from 'react';
import { ArrowLeftRight, Award, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export interface CommercialMatrixVendor {
  bidId: string;
  vendorId: string;
  vendorName: string;
  technicalResult: 'PASS' | 'FAIL' | 'PENDING';
  technicalScore: number | null;
  technicalMaxScore: number | null;
  commercialTotal: number | null;
  currency: string;
  commercialEnvelopeStatus: string | null;
}

interface Props {
  vendors: CommercialMatrixVendor[];
  lowestPassBidId: string | null;
  selectedBidId: string | null;
  onSelect: (bidId: string) => void;
}

type Layout = 'summary' | 'itemized';

function fmtCurrency(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(amount);
}

function fmtScore(v: number | null, max: number | null) {
  if (v == null) return '—';
  const f = Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
  return max != null ? `${f} / ${max}` : f;
}

function resultBadge(result: 'PASS' | 'FAIL' | 'PENDING') {
  switch (result) {
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-success/10 text-success">
          <CheckCircle2 className="w-3 h-3" /> PASS
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-danger/10 text-danger">
          <AlertTriangle className="w-3 h-3" /> FAIL
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-bg text-text-secondary border border-border">
          <Clock className="w-3 h-3" /> Pending
        </span>
      );
  }
}

/**
 * Phase C (BUG-035). Top section of the redesigned Commercial Comparison page.
 * Summary ↔ Itemized toggle (Itemized stays a Phase-F placeholder until the
 * BOQ template schema lands). FAIL bids are grayed-out + badge per master-plan
 * rule A3, still expandable for audit. Lowest-PASS bid is visually highlighted
 * with the Award icon per F1; clicking the row bubbles selection upward so the
 * detail card below the matrix expands.
 */
export function CommercialMatrix({ vendors, lowestPassBidId, selectedBidId, onSelect }: Props) {
  const [layout, setLayout] = useState<Layout>('summary');

  // Sort: lowest-PASS first, then ascending price among PASS, then FAIL/PENDING at the bottom.
  const sortedVendors = [...vendors].sort((a, b) => {
    if (a.bidId === lowestPassBidId) return -1;
    if (b.bidId === lowestPassBidId) return 1;
    const aPass = a.technicalResult === 'PASS';
    const bPass = b.technicalResult === 'PASS';
    if (aPass !== bPass) return aPass ? -1 : 1;
    return (a.commercialTotal ?? Infinity) - (b.commercialTotal ?? Infinity);
  });

  if (vendors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <p className="text-sm text-text-secondary">No bids to compare.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Commercial Comparison</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {vendors.length} bids · lowest-PASS auto-selected
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLayout(l => (l === 'summary' ? 'itemized' : 'summary'))}
          className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
          title="Toggle Summary / Itemized"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          {layout === 'summary' ? 'Summary view' : 'Itemized view'}
        </button>
      </div>

      {layout === 'itemized' ? (
        <div className="px-6 py-10 text-center bg-bg/40">
          <p className="text-sm text-text-secondary">
            Per-line-item breakdown will appear here once a BOQ template is configured for the tender
            (Phase F).
          </p>
          <p className="text-xs text-text-secondary mt-2">
            Switch back to Summary view to compare totals.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary w-12"></th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Vendor</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Technical</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">Tech score</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">Commercial total</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Envelope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedVendors.map(v => {
                const isLowestPass = v.bidId === lowestPassBidId;
                const isFail = v.technicalResult === 'FAIL';
                const isSelected = v.bidId === selectedBidId;
                return (
                  <tr
                    key={v.bidId}
                    onClick={() => onSelect(v.bidId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/5'
                        : isLowestPass
                          ? 'bg-success/5 hover:bg-success/10'
                          : isFail
                            ? 'opacity-60 hover:opacity-100 hover:bg-bg/40'
                            : 'hover:bg-bg/40'
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      {isLowestPass && (
                        <span title="Lowest commercial price among technically-PASS vendors">
                          <Award className="w-5 h-5 text-success mx-auto" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-text-primary truncate">{v.vendorName}</span>
                        {isLowestPass && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-success/15 text-success flex-shrink-0">
                            Lowest PASS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{resultBadge(v.technicalResult)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-text-primary">
                      {fmtScore(v.technicalScore, v.technicalMaxScore)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-text-primary">
                      {isFail ? (
                        <span className="text-text-secondary/60 italic">
                          {fmtCurrency(v.commercialTotal, v.currency)}
                        </span>
                      ) : (
                        fmtCurrency(v.commercialTotal, v.currency)
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {v.commercialEnvelopeStatus ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
