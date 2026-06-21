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
  // BUG-068 / Phase F BOQ: per-line entries the vendor submitted. Empty for
  // legacy tenders (no BOQ template) — Itemized view falls back to placeholder.
  boqLines?: Array<{
    tenderBoqItemId: string;
    status: 'BIDDING' | 'NOT_BIDDING';
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
}

export interface CommercialMatrixBoqRow {
  id: string;
  itemNo: string;
  description: string;
  qty: number;
  unit: string;
}

interface Props {
  vendors: CommercialMatrixVendor[];
  lowestPassBidId: string | null;
  selectedBidId: string | null;
  onSelect: (bidId: string) => void;
  // BUG-068 / Phase F BOQ: real template (placeholder rows already filtered
  // out server-side). Empty array = legacy / no-BOQ tender; Itemized view
  // renders a placeholder note.
  boqTemplate?: CommercialMatrixBoqRow[];
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

// BUG-101 (2026-06-04): owner reported "Max 30, Score 93" — the backend
// stores technicalScore as a percentage (0..100, clamped in
// technical-evaluation.service). Previously we printed "93 / 30" which mixes
// units. Mirror the BUG-061 toAbsolute() pattern already used in
// TechnicalMatrix: scale percent back to absolute against the criteria max
// before display. "93 / 30" → "28 / 30".
function fmtScore(percent: number | null, max: number | null) {
  if (percent == null) return '—';
  if (max == null || max <= 0) return String(Math.round(percent));
  const absolute = Math.round((percent / 100) * max);
  return `${absolute} / ${max}`;
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
export function CommercialMatrix({ vendors, lowestPassBidId, selectedBidId, onSelect, boqTemplate }: Props) {
  const [layout, setLayout] = useState<Layout>('summary');
  const hasBoq = (boqTemplate?.length ?? 0) > 0;

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
        hasBoq ? (
          /* BUG-068 / Phase F BOQ: rows = template lines, columns = vendors.
             Cells show line total (unit_price * qty) when the vendor is
             BIDDING that line; "—" when NOT_BIDDING or no row submitted.
             BUG-104 (2026-06-05): scale to 5-6+ vendors. Item No + Description
             columns are sticky-left so they stay visible while scrolling
             horizontally through vendor columns; vendor columns get
             min-w-[140px] so they don't squeeze below readable width. */
          <div className="overflow-x-auto relative">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-20 sticky left-0 z-10 bg-bg">Item</th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-64 sticky left-20 z-10 bg-bg border-r border-border">Description</th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary text-right w-24">Qty</th>
                  <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-20">Unit</th>
                  {sortedVendors.map(v => (
                    <th
                      key={v.bidId}
                      className={`px-3 py-2 text-xs font-bold uppercase tracking-wider text-right min-w-[140px] ${
                        v.bidId === lowestPassBidId ? 'text-success' : 'text-text-secondary'
                      }`}
                    >
                      {v.vendorName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(boqTemplate ?? []).map(row => (
                  <tr key={row.id} className="group hover:bg-bg/40">
                    <td className="px-3 py-2 font-mono text-xs text-text-secondary sticky left-0 z-10 bg-card group-hover:bg-bg/40">{row.itemNo}</td>
                    <td className="px-3 py-2 text-text-primary w-64 sticky left-20 z-10 bg-card group-hover:bg-bg/40 border-r border-border">{row.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{row.qty}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary">{row.unit}</td>
                    {sortedVendors.map(v => {
                      const line = (v.boqLines ?? []).find(l => l.tenderBoqItemId === row.id);
                      if (!line || line.status === 'NOT_BIDDING') {
                        return (
                          <td key={v.bidId} className="px-3 py-2 text-right text-xs text-text-secondary/60 italic min-w-[140px]">
                            Not bidding
                          </td>
                        );
                      }
                      return (
                        <td key={v.bidId} className="px-3 py-2 text-right font-mono text-sm text-text-primary min-w-[140px]">
                          {fmtCurrency(line.lineTotal, v.currency)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-bg/60 font-semibold">
                  <td className="px-3 py-2 sticky left-0 z-10 bg-bg/60">Total</td>
                  <td className="px-3 py-2 w-64 sticky left-20 z-10 bg-bg/60 border-r border-border"></td>
                  <td className="px-3 py-2 w-24"></td>
                  <td className="px-3 py-2 w-20"></td>
                  {sortedVendors.map(v => (
                    <td
                      key={v.bidId}
                      className={`px-3 py-2 text-right font-mono text-sm min-w-[140px] ${
                        v.bidId === lowestPassBidId ? 'text-success' : 'text-text-primary'
                      }`}
                    >
                      {fmtCurrency(v.commercialTotal, v.currency)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center bg-bg/40">
            <p className="text-sm text-text-secondary">
              This tender has no BOQ template configured (legacy / pre-Phase F).
            </p>
            <p className="text-xs text-text-secondary mt-2">
              Switch back to Summary view to compare totals.
            </p>
          </div>
        )
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
                    <td className="px-4 py-3 text-xs">
                      {v.commercialEnvelopeStatus === 'LOCKED' ? (
                        // BUG-095 (2026-06-02): explain WHY commercial is locked.
                        // The Finalize Technical Results action auto-locks the
                        // commercial envelope for FAIL bids (separation of
                        // duties — fail vendors shouldn't have commercial info
                        // exposed). Owner needed this visible without DB lookup.
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200"
                          title="Auto-locked at Finalize Technical Results because the bid failed technical evaluation. Commercial envelope cannot be opened or its contents viewed."
                        >
                          LOCKED · Technical FAIL
                        </span>
                      ) : v.commercialEnvelopeStatus === 'OPENED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 text-success font-bold border border-success/30">OPENED</span>
                      ) : v.commercialEnvelopeStatus === 'SEALED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg text-text-secondary font-semibold border border-border">SEALED</span>
                      ) : (
                        <span className="text-text-secondary">{v.commercialEnvelopeStatus ?? '—'}</span>
                      )}
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
