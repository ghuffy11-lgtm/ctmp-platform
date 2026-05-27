'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Award,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  FileText,
  Shield,
  TrendingDown,
} from 'lucide-react';
import { CommercialDocumentsList } from '@/components/CommercialDocumentsList';

export interface CardCommercialDoc {
  id: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
}

export interface CardVendor {
  bidId: string;
  vendorId: string;
  vendorName: string;
  vendor: {
    companyName: string;
    status: string;
    country: string | null;
  };
  technicalResult: 'PASS' | 'FAIL' | 'PENDING';
  technicalScore: number | null;
  technicalMaxScore: number | null;
  commercialEnvelopeStatus: string | null;
  commercialTotal: number | null;
  currency: string;
  commercialDocuments: CardCommercialDoc[];
  commentsByEvaluator: Array<{ evaluatorUserId: string; comments: string }>;
}

interface Props {
  vendor: CardVendor;
  tenderId: string;
  isLowestPass: boolean;
  initialExpanded?: boolean;
  selected?: boolean;
  onRecommend: (bidId: string, isLowestPass: boolean) => void;
}

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

function resultPill(result: 'PASS' | 'FAIL' | 'PENDING') {
  switch (result) {
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-success/10 text-success">
          <CheckCircle2 className="w-3 h-3" /> PASS
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-danger/10 text-danger">
          <AlertTriangle className="w-3 h-3" /> FAIL
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-bg text-text-secondary border border-border">
          <Clock className="w-3 h-3" /> Pending
        </span>
      );
  }
}

/**
 * Phase C (BUG-035) — per-vendor expandable card with the 5 blocks from
 * master plan A5: line items, technical detail, commercial documents,
 * vendor profile, award action. FAIL bids dim but stay expandable for audit.
 * The "Recommend" button surfaces on PASS bids only; clicking it bubbles
 * up to the page which will (once Phase D ships) open the AwardConfirmDialog.
 */
export function VendorComparisonCard({
  vendor,
  tenderId,
  isLowestPass,
  initialExpanded,
  selected,
  onRecommend,
}: Props) {
  const [expanded, setExpanded] = useState(!!initialExpanded);
  const isFail = vendor.technicalResult === 'FAIL';

  return (
    <div
      id={`commercial-vendor-${vendor.vendorId}`}
      className={`bg-card border rounded-xl overflow-hidden transition-shadow ${
        selected
          ? 'border-accent shadow-lg shadow-accent/10'
          : isLowestPass
            ? 'border-success/60'
            : isFail
              ? 'border-border opacity-70'
              : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-bg/40 transition-colors text-left"
      >
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" />}
          <div className="min-w-0 flex items-center gap-2">
            <p className="font-semibold text-text-primary truncate">{vendor.vendorName}</p>
            {isLowestPass && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-success/15 text-success flex-shrink-0">
                <Award className="w-3 h-3" /> Lowest PASS
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {resultPill(vendor.technicalResult)}
          <span className="font-mono text-sm font-semibold text-text-primary">
            {fmtCurrency(vendor.commercialTotal, vendor.currency)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-bg/30">
          {/* Block 1: Line items (Phase F placeholder) */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Line items
            </h4>
            <div className="text-sm text-text-secondary bg-card border border-dashed border-border rounded-lg p-4">
              <p>
                Per-line-item breakdown appears here once the tender has a BOQ template
                (Phase F). For now, only the bid total is captured.
              </p>
              <p className="mt-2">
                <span className="font-mono font-semibold text-text-primary">
                  Total: {fmtCurrency(vendor.commercialTotal, vendor.currency)}
                </span>
              </p>
            </div>
          </section>

          {/* Block 2: Technical detail (read-only) */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Technical score (read-only)
            </h4>
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-text-primary font-semibold">
                  {fmtScore(vendor.technicalScore, vendor.technicalMaxScore)}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Result: {vendor.technicalResult}
                </p>
              </div>
              <Link
                href={`/technical-comparison?tenderId=${tenderId}`}
                className="text-xs font-semibold text-accent hover:underline"
              >
                View Technical Comparison →
              </Link>
            </div>
          </section>

          {/* Block 3: Commercial documents (inline viewer) */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Commercial documents
            </h4>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <CommercialDocumentsList
                bidId={vendor.bidId}
                envelopeStatus={vendor.commercialEnvelopeStatus ?? 'SEALED'}
              />
            </div>
          </section>

          {/* Block 4: Vendor profile */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Vendor profile
            </h4>
            <div className="bg-card border border-border rounded-lg px-4 py-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Company</p>
                <p className="font-semibold text-text-primary">{vendor.vendor.companyName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Status</p>
                <p className="text-text-primary">{vendor.vendor.status}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-secondary">Country</p>
                <p className="text-text-primary">{vendor.vendor.country ?? '—'}</p>
              </div>
              <div className="text-right">
                <Link
                  href={`/vendors?vendorId=${vendor.vendorId}`}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Vendor record →
                </Link>
              </div>
            </div>
            {vendor.commentsByEvaluator.length > 0 && (
              <div className="mt-3 space-y-2">
                {vendor.commentsByEvaluator.map((c, i) => (
                  <div key={i} className="text-xs text-text-secondary bg-card border border-border rounded p-2.5">
                    <p className="font-semibold uppercase text-[10px] tracking-wider mb-1">Evaluator notes</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{c.comments}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Block 5: Award action */}
          <section className="px-5 py-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Award action</h4>
            {isFail ? (
              <div className="bg-danger/5 border border-danger/20 rounded-lg px-4 py-3 text-sm text-danger">
                This vendor failed technical evaluation and cannot be awarded.
              </div>
            ) : vendor.technicalResult === 'PENDING' ? (
              <div className="bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-secondary">
                Technical evaluation pending. Award becomes available once a PASS result is recorded.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRecommend(vendor.bidId, isLowestPass)}
                className={`w-full px-5 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                  isLowestPass
                    ? 'bg-success text-white hover:opacity-90'
                    : 'bg-card text-text-primary border border-border hover:bg-bg'
                }`}
              >
                <Award className="w-4 h-4" />
                {isLowestPass ? 'Recommend (lowest PASS)' : 'Recommend with override'}
              </button>
            )}
            {!isFail && !isLowestPass && vendor.technicalResult === 'PASS' && (
              <p className="text-[11px] text-text-secondary mt-2 italic">
                Override needs written justification + an attached PDF (Phase D enforces this in the dialog).
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
