'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Award,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Shield,
  TrendingDown,
} from 'lucide-react';
import {
  type CommercialTerms,
  EMPTY_TERM,
  formatDeliveryPeriod,
  formatPaymentTerms,
  formatTermText,
  formatWarranty,
} from '@ctmp/shared-types';
import { CommercialDocumentsList } from '@/components/CommercialDocumentsList';
import { SupportingDocumentsList } from '@/components/SupportingDocumentsList';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// BUG-129 (2026-06-11): API base for direct fetch of streamed PDFs (the
// generic api.ts client doesn't handle binary streams).
const NEGOTIATION_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
import { type ComparisonVendor, type ComparisonCriterion } from '@/components/comparison/VendorTechnicalCard';
// BUG-098: TechnicalMatrix import removed — per-vendor inline breakdown is now
// a simple single-vendor table, no matrix.

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
  // BUG-068 / Phase F BOQ: per-line entries the vendor submitted.
  boqLines?: Array<{
    tenderBoqItemId: string;
    status: 'BIDDING' | 'NOT_BIDDING';
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
  // BUG-115 (2026-06-09): negotiation history. commercialTotal above is the
  // resolved CURRENT price (latest non-superseded). originalCommercialTotal
  // is the pre-negotiation baseline. negotiationHistory stacks per-round.
  // BUG-129 (2026-06-11): submissionId added so the per-round PDF buttons
  // can build the download URL.
  // BUG-130 (2026-06-12): boqLines per round so BoqBreakdownBlock can show
  // per-line Original vs Negotiated unit prices.
  // Migration 052 (2026-08-06): bid-level commercial terms (brand, origin,
  // warranty, delivery period, payment terms). Every field is optional.
  commercialTerms?: CommercialTerms | null;
  originalCommercialTotal?: number | null;
  negotiationHistory?: Array<{
    submissionId: string;
    roundNumber: number;
    submittedAt: string;
    totalPrice: number | null;
    currency: string;
    percentReductionVsPrevious: number | null;
    percentReductionVsOriginal: number | null;
    commercialPdfFilename: string | null;
    remarks: string | null;
    boqLines?: Array<{
      tenderBoqItemId: string;
      status: 'BIDDING' | 'NOT_BIDDING';
      unitPrice: number | null;
    }>;
    // Migration 052: terms as revised in this round. A null field means the
    // vendor did not revise it — callers fall back to the bid's own terms.
    commercialTerms?: CommercialTerms | null;
  }>;
  hasOpenNegotiationInvitation?: boolean;
  openNegotiationRoundNumber?: number | null;
}

export interface CardBoqRow {
  id: string;
  itemNo: string;
  description: string;
  qty: number;
  unit: string;
}

interface Props {
  vendor: CardVendor;
  tenderId: string;
  tenderCurrency: string;
  isLowestPass: boolean;
  initialExpanded?: boolean;
  selected?: boolean;
  canEvaluate?: boolean;
  onRecommend: (bidId: string, isLowestPass: boolean) => void;
  onPriceSaved?: () => void;
  // BUG-068 / Phase F BOQ: template rows so the card can show a per-line
  // breakdown when the bid has boqLines. Empty for legacy / no-BOQ tenders.
  boqTemplate?: CardBoqRow[];
}

function fmtCurrency(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(amount);
}

// BUG-097-fix (2026-06-03): round integer only.
// BUG-101 (2026-06-04): owner reported the displayed score reads as a
// percentage. Convert backend percentage (0..100, clamped in
// technical-evaluation.service) to absolute units against the criteria max
// so the figure matches the standalone Technical Comparison page —
// "93" → "28 / 30".
function fmtScore(percent: number | null, max: number | null) {
  if (percent == null) return '—';
  if (max == null || max <= 0) return String(Math.round(percent));
  const absolute = Math.round((percent / 100) * max);
  return `${absolute} / ${max}`;
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
  tenderCurrency,
  isLowestPass,
  initialExpanded,
  selected,
  canEvaluate,
  onRecommend,
  onPriceSaved,
  boqTemplate,
}: Props) {
  const [expanded, setExpanded] = useState(!!initialExpanded);
  const isFail = vendor.technicalResult === 'FAIL';
  // BUG-069: open this vendor's technical detail in an in-page modal instead
  // of navigating to /technical-comparison. Stays on Commercial Comparison.
  const [techOpen, setTechOpen] = useState(false);
  // BUG-068 / Phase F BOQ: when the bid has per-line entries, render a real
  // line breakdown. Otherwise the existing CommercialTotalBlock (BUG-053)
  // continues to handle manual price entry / display for legacy tenders.
  const hasBoq = (boqTemplate?.length ?? 0) > 0 && (vendor.boqLines?.length ?? 0) > 0;

  // BUG-129 (2026-06-11): negotiation PDF view/download.
  const { openPdfViewer } = usePdfViewer();
  async function viewNegotiationPdf(submissionId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${NEGOTIATION_API_BASE}/api/v1/tenders/${tenderId}/negotiation-submissions/${submissionId}/commercial-pdf/view`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.status === 403) { alert('Your role cannot view this PDF (comparison:commercial:view required).'); return; }
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      openPdfViewer({ src: url, title: filename, onClose: () => URL.revokeObjectURL(url) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Open failed');
    }
  }
  async function downloadNegotiationPdf(submissionId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${NEGOTIATION_API_BASE}/api/v1/tenders/${tenderId}/negotiation-submissions/${submissionId}/commercial-pdf`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.status === 403) { alert('Your role cannot download this PDF.'); return; }
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  }

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
          {/* BUG-115 (2026-06-09): negotiation-history block.
              BUG-129 (2026-06-11): restructured into a side-by-side headline
              (Original | Latest Negotiation) with a savings chip, plus a
              collapsed expander for the per-round detail when N > 0. Each
              round entry exposes View/Download buttons for that submission's
              commercial PDF. */}
          {((vendor.negotiationHistory?.length ?? 0) > 0 || vendor.hasOpenNegotiationInvitation) && (() => {
            const history = vendor.negotiationHistory ?? [];
            const latest = history.length > 0 ? history[history.length - 1] : null;
            const orig = vendor.originalCommercialTotal ?? null;
            return (
              <section className="px-5 py-4 border-b border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-1.5">
                  Negotiation rounds
                  {history.length > 0 && (
                    <span className="text-[10px] text-text-secondary font-normal normal-case">
                      ({history.length} submission{history.length === 1 ? '' : 's'})
                    </span>
                  )}
                </h4>

                {/* Side-by-side headline (only when at least 1 round submitted). */}
                {latest ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-card border border-border rounded-lg px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                        Original
                      </p>
                      <p className="font-mono font-semibold text-text-primary text-lg mt-1">
                        {fmtCurrency(orig, vendor.currency)}
                      </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-amber-900 font-semibold flex items-center justify-between gap-2">
                        <span>Negotiated · R{latest.roundNumber}</span>
                        {latest.percentReductionVsOriginal != null && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            latest.percentReductionVsOriginal >= 0
                              ? 'bg-emerald-200 text-emerald-900'
                              : 'bg-rose-200 text-rose-900'
                          }`}>
                            {latest.percentReductionVsOriginal >= 0 ? '−' : '+'}
                            {Math.abs(latest.percentReductionVsOriginal).toFixed(1)}%
                          </span>
                        )}
                      </p>
                      <p className="font-mono font-semibold text-amber-900 text-lg mt-1">
                        {fmtCurrency(latest.totalPrice, latest.currency)}
                      </p>
                      {latest.commercialPdfFilename && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => viewNegotiationPdf(latest.submissionId, latest.commercialPdfFilename!)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-card text-text-primary border border-border rounded hover:bg-amber-100"
                            title={`View ${latest.commercialPdfFilename}`}
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadNegotiationPdf(latest.submissionId, latest.commercialPdfFilename!)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-card text-text-primary border border-border rounded hover:bg-amber-100"
                            title={`Download ${latest.commercialPdfFilename}`}
                          >
                            <Download className="w-3 h-3" /> Download
                          </button>
                          <span className="text-[10px] text-amber-800 truncate" title={latest.commercialPdfFilename}>
                            {latest.commercialPdfFilename}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Open invitation but no submission yet — show original only + pending note. */
                  orig != null && (
                    <div className="bg-card border border-border rounded-lg px-3 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">
                        Original
                      </p>
                      <p className="font-mono font-semibold text-text-primary text-lg mt-1">
                        {fmtCurrency(orig, vendor.currency)}
                      </p>
                    </div>
                  )
                )}

                {vendor.hasOpenNegotiationInvitation && (
                  <div className="mt-3 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900">
                    Round {vendor.openNegotiationRoundNumber ?? '?'} pending — vendor has been invited
                    but has not yet submitted.
                  </div>
                )}

                {/* Per-round detail expander — only useful when ≥ 2 rounds. */}
                {history.length > 1 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-text-secondary hover:text-text-primary font-semibold">
                      All rounds ({history.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {history.map((r) => (
                        <div
                          key={r.submissionId}
                          className="bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-amber-900">
                              <span className="font-semibold">Round {r.roundNumber}</span>
                              <span className="text-xs text-amber-700 ml-2">
                                {new Date(r.submittedAt).toLocaleDateString('en-GB')}
                                {r.percentReductionVsOriginal != null && ` · ${r.percentReductionVsOriginal.toFixed(1)}% vs original`}
                                {r.percentReductionVsPrevious != null && ` · ${r.percentReductionVsPrevious.toFixed(1)}% vs previous`}
                              </span>
                            </p>
                            {r.commercialPdfFilename && (
                              <p className="text-[10px] text-amber-800 truncate mt-0.5" title={r.commercialPdfFilename}>
                                <FileText className="inline w-3 h-3 mr-1" />{r.commercialPdfFilename}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-semibold text-amber-900 text-sm">
                              {fmtCurrency(r.totalPrice, r.currency)}
                            </span>
                            {r.commercialPdfFilename && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => viewNegotiationPdf(r.submissionId, r.commercialPdfFilename!)}
                                  className="p-1 text-amber-900 hover:bg-amber-200 rounded"
                                  title="View PDF"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadNegotiationPdf(r.submissionId, r.commercialPdfFilename!)}
                                  className="p-1 text-amber-900 hover:bg-amber-200 rounded"
                                  title="Download PDF"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })()}

          {/* Block 1: Commercial total. When the bid carries per-line BOQ
              entries (Phase F / BUG-068), render the structured breakdown.
              Otherwise fall back to BUG-053's manual-entry block. */}
          {hasBoq ? (
            <BoqBreakdownBlock vendor={vendor} boqTemplate={boqTemplate!} />
          ) : (
            <CommercialTotalBlock
              vendor={vendor}
              canEvaluate={!!canEvaluate}
              tenderCurrency={tenderCurrency}
              onSaved={onPriceSaved}
            />
          )}

          {/* Block 2: Technical score (BUG-095 (2026-06-02) — relabeled). */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Technical score
            </h4>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm text-text-primary font-semibold">
                    {fmtScore(vendor.technicalScore, vendor.technicalMaxScore)}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Result: {vendor.technicalResult}
                  </p>
                </div>
                {/* BUG-094 (2026-06-02): owner wanted the tech breakdown inline
                     (like commercial breakdown above) instead of popping a
                     modal. Replaces the BUG-069/BUG-070 TechDetailModal trigger
                     with an in-place expander that fetches once and shows the
                     same TechnicalMatrix below this row. */}
                <button
                  type="button"
                  onClick={() => setTechOpen(o => !o)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {techOpen ? 'Hide technical breakdown ▲' : 'Show technical breakdown ▼'}
                </button>
              </div>
              {techOpen && (
                <div className="border-t border-border bg-bg/30 p-4">
                  <InlineTechBreakdown tenderId={tenderId} highlightVendorId={vendor.vendorId} />
                </div>
              )}
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

          {/* Block 3b: Supporting documents (BUG-142). Relocated here from
              the tender Bids tab so commercial-side evidence lives next to
              the priced offer. Same OPENED-envelope gate as block 3. */}
          <section className="px-5 py-4 border-b border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Supporting documents
            </h4>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <SupportingDocumentsList
                bidId={vendor.bidId}
                commercialEnvelopeStatus={vendor.commercialEnvelopeStatus ?? 'SEALED'}
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
            {vendor.technicalResult === 'PENDING' ? (
              <div className="bg-bg border border-border rounded-lg px-4 py-3 text-sm text-text-secondary">
                Technical evaluation pending. Award becomes available once a result is recorded.
              </div>
            ) : (
              <>
                {/* BUG-094 (2026-06-02): owner directive — allow awarding a
                    technically-FAIL vendor with approver justification (text +
                    PDF). Same override flow as a non-lowest PASS pick, just a
                    more pointed warning. */}
                {isFail && (
                  <div className="bg-danger/5 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger mb-2">
                    <p className="font-bold mb-0.5">This vendor failed technical evaluation.</p>
                    <p className="text-xs">
                      Awarding to a FAIL vendor is an override decision. The Confirm dialog will require written justification (min 20 chars) AND an attached PDF.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRecommend(vendor.bidId, isLowestPass)}
                  className={`w-full px-5 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                    isLowestPass
                      ? 'bg-success text-white hover:opacity-90'
                      : isFail
                        ? 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15'
                        : 'bg-card text-text-primary border border-border hover:bg-bg'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  {isLowestPass
                    ? 'Recommend (lowest PASS)'
                    : isFail
                      ? 'Recommend FAIL vendor (override)'
                      : 'Recommend with override'}
                </button>
                {!isLowestPass && !isFail && (
                  <p className="text-[11px] text-text-secondary mt-2 italic">
                    Override needs written justification + an attached PDF (Phase D enforces this in the dialog).
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* BUG-094 (2026-06-02): TechDetailModal removed — tech breakdown is now
          inline above (InlineTechBreakdown) per owner directive. */}
    </div>
  );
}

// BUG-053: inline commercial-total entry. Authorised users (PROCUREMENT_ADMIN
// + COMMERCIAL_COMMITTEE_MEMBER + COMMERCIAL_EVALUATOR per the BUG-052 matrix)
// see an editable amount input + Save. Everyone else sees the current value.
// Future: auto-extract from PDF on submission so this becomes a review step
// rather than a re-keying step.
function CommercialTotalBlock({
  vendor,
  canEvaluate,
  tenderCurrency,
  onSaved,
}: {
  vendor: CardVendor;
  canEvaluate: boolean;
  tenderCurrency: string;
  onSaved?: () => void;
}) {
  const opened = vendor.commercialEnvelopeStatus === 'OPENED';
  const hasPrice = vendor.commercialTotal != null;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<string>(
    vendor.commercialTotal != null ? String(vendor.commercialTotal) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0) {
      setError('Enter a valid non-negative amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/bids/${vendor.bidId}/commercial-evaluations`, { totalPrice: num }, token);
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setAmount(vendor.commercialTotal != null ? String(vendor.commercialTotal) : '');
    setError(null);
  }

  const showForm = canEvaluate && opened && (editing || !hasPrice);

  return (
    <section className="px-5 py-4 border-b border-border">
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
        <TrendingDown className="w-3.5 h-3.5" /> Commercial total
      </h4>

      {!opened ? (
        <div className="text-sm text-text-secondary bg-card border border-dashed border-border rounded-lg p-4">
          Awaiting committee opening of the commercial envelope. Total cannot be recorded until the envelope is OPENED.
        </div>
      ) : showForm ? (
        <div className="bg-card border border-border rounded-lg px-4 py-3 space-y-2">
          <label className="text-xs font-semibold text-text-secondary">
            Enter total from the commercial PDF
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.001"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={saving}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-bg text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="0.000"
            />
            <span className="text-sm font-semibold text-text-secondary">{tenderCurrency}</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || amount === ''}
              className="px-4 py-2 rounded-md bg-accent text-white text-sm font-bold disabled:opacity-50 hover:opacity-90"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {hasPrice && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-2 rounded-md border border-border text-sm text-text-secondary hover:bg-bg"
              >
                Cancel
              </button>
            )}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <p className="text-[11px] text-text-secondary italic">
            Recorded by procurement / finance. Audit-logged. Vendors cannot edit this value.
          </p>
        </div>
      ) : hasPrice ? (
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span className="font-mono font-semibold text-text-primary text-base">
            {fmtCurrency(vendor.commercialTotal, vendor.currency)}
          </span>
          {canEvaluate && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
          Awaiting price entry by procurement / finance. The comparison cannot be finalised until a total is recorded for this vendor.
        </div>
      )}

      {/* Migration 052: on a legacy tender there is no BOQ table to continue,
          so the terms get their own compact table under the total. */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mt-3">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            <CommercialTermRows
              terms={vendor.commercialTerms}
              labelColSpan={1}
              spacerCells={0}
              valueColSpan={1}
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// BUG-068 / Phase F BOQ: per-line breakdown rendered on the per-vendor card
// when the bid carries boqLines + the tender has a real BOQ template. Mirrors
// the Itemized view in CommercialMatrix but for a single vendor.
//
// BUG-130 (2026-06-12, owner-walkthrough 2026-06-13): when this vendor has at
// least one negotiation round, the table grows: Original Price | Negotiated
// Price (latest round) | -X%. Per-line totals (LT orig / LT neg) were dropped
// from the row layout — the footer carries the grand totals, which is what
// the committee actually compares. Original-only mode is preserved for
// vendors without negotiation history so legacy display is untouched.
// Migration 052 (2026-08-06): the five bid-level commercial terms, emitted as
// bare <tr>s so they continue the vendor's own commercial table under its total
// row (owner feedback 2026-08-06 — "under each vendor's Commercial Breakdown").
// `labelColSpan` + `valueColSpan` adapt to the 5- or 7-column BOQ layout.
const CARD_TERM_ROWS: Array<{
  key: string;
  label: string;
  render: (terms: CommercialTerms | null | undefined) => string;
  preLine?: boolean;
}> = [
  { key: 'brandManufacturer', label: 'Brand / Manufacturer', render: t => formatTermText(t?.brandManufacturer) },
  { key: 'countryOfOrigin', label: 'Country of Origin', render: t => formatTermText(t?.countryOfOrigin) },
  { key: 'warrantyYears', label: 'Warranty', render: t => formatWarranty(t?.warrantyYears ?? null) },
  { key: 'delivery', label: 'Delivery Period', render: t => formatDeliveryPeriod(t) },
  { key: 'paymentTerms', label: 'Payment Terms', render: t => formatPaymentTerms(t?.paymentTerms), preLine: true },
];

function CommercialTermRows({
  terms,
  labelColSpan,
  spacerCells,
  valueColSpan,
}: {
  terms: CommercialTerms | null | undefined;
  labelColSpan: number;
  spacerCells: number;
  valueColSpan: number;
}) {
  return (
    <>
      {CARD_TERM_ROWS.map((row, i) => {
        const value = row.render(terms);
        return (
          <tr key={row.key} className={`align-top ${i === 0 ? 'border-t-2 border-border' : ''}`}>
            <td
              colSpan={labelColSpan}
              className={`px-3 text-xs font-semibold text-text-secondary ${i === 0 ? 'pt-3 pb-2' : 'py-2'}`}
            >
              {row.label}
            </td>
            {Array.from({ length: spacerCells }, (_, n) => (
              <td key={`spacer-${n}`} className={i === 0 ? 'pt-3 pb-2' : 'py-2'} />
            ))}
            <td
              colSpan={valueColSpan}
              className={`px-3 text-sm text-right ${i === 0 ? 'pt-3 pb-2' : 'py-2'} ${
                row.preLine ? 'whitespace-pre-line' : ''
              } ${value === EMPTY_TERM ? 'text-text-secondary' : 'text-text-primary'}`}
            >
              {value}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function BoqBreakdownBlock({
  vendor,
  boqTemplate,
}: {
  vendor: CardVendor;
  boqTemplate: CardBoqRow[];
}) {
  const linesByItem = new Map(
    (vendor.boqLines ?? []).map(l => [l.tenderBoqItemId, l]),
  );

  // BUG-130: latest negotiation round's per-line submissions (if any). Drives
  // the wider table layout below.
  const history = vendor.negotiationHistory ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const negLineByItem = new Map(
    (latest?.boqLines ?? []).map(l => [l.tenderBoqItemId, l]),
  );
  const hasNegotiation = !!latest;

  // Grand-total computations across the table for the footer row.
  let totalOriginal = 0;
  let totalNegotiated = 0;
  let negSeenAtLeastOne = false;

  return (
    <section className="px-5 py-4 border-b border-border">
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
        <TrendingDown className="w-3.5 h-3.5" /> Commercial breakdown (BOQ)
        {hasNegotiation && (
          <span className="text-[10px] text-text-secondary font-normal normal-case">
            · Original vs Negotiated R{latest.roundNumber}
          </span>
        )}
      </h4>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg/40 border-b border-border">
            <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
              <th className="px-3 py-2 text-left font-bold w-14">Item</th>
              <th className="px-3 py-2 text-left font-bold">Description</th>
              <th className="px-3 py-2 text-right font-bold w-16">Qty</th>
              <th className="px-3 py-2 text-left font-bold w-12">Unit</th>
              <th className="px-3 py-2 text-right font-bold w-32">
                {hasNegotiation ? 'Original Price' : 'Unit price'}
              </th>
              {hasNegotiation && (
                <>
                  <th className="px-3 py-2 text-right font-bold w-32 bg-amber-50/40">
                    Negotiated Price
                  </th>
                  <th className="px-3 py-2 text-right font-bold w-16 bg-amber-50/40">%</th>
                </>
              )}
              {!hasNegotiation && (
                <th className="px-3 py-2 text-right font-bold w-28">Line total</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {boqTemplate.map(row => {
              const line = linesByItem.get(row.id);
              const notBidding = !line || line.status === 'NOT_BIDDING';
              const origUnit = !notBidding && line!.unitPrice != null ? Number(line!.unitPrice) : null;
              const origLine = !notBidding && line!.lineTotal != null ? Number(line!.lineTotal) : (origUnit != null ? origUnit * Number(row.qty) : null);

              const negLine = negLineByItem.get(row.id);
              const negNotBidding = !negLine || negLine.status === 'NOT_BIDDING';
              const negUnit = !negNotBidding && negLine!.unitPrice != null ? Number(negLine!.unitPrice) : null;
              const negLineTotal = negUnit != null ? negUnit * Number(row.qty) : null;

              if (origLine != null) totalOriginal += origLine;
              if (negLineTotal != null) { totalNegotiated += negLineTotal; negSeenAtLeastOne = true; }

              const pct = origUnit != null && origUnit > 0 && negUnit != null
                ? ((origUnit - negUnit) / origUnit) * 100
                : null;

              return (
                <tr key={row.id} className={notBidding ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">{row.itemNo}</td>
                  <td className="px-3 py-2 text-text-primary">{row.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{row.qty}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{row.unit}</td>
                  {notBidding ? (
                    <td className="px-3 py-2 text-right text-xs italic text-text-secondary/70" colSpan={hasNegotiation ? 3 : 2}>
                      Not bidding
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">
                        {fmtCurrency(origUnit, vendor.currency)}
                      </td>
                      {hasNegotiation ? (
                        <>
                          <td className="px-3 py-2 text-right font-mono bg-amber-50/40 text-amber-900">
                            {negUnit == null ? <span className="italic text-amber-700/70">—</span> : fmtCurrency(negUnit, vendor.currency)}
                          </td>
                          <td className="px-3 py-2 text-right bg-amber-50/40">
                            {pct != null ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                pct >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                              }`}>
                                {pct >= 0 ? '−' : '+'}{Math.abs(pct).toFixed(1)}%
                              </span>
                            ) : <span className="text-xs text-text-secondary/60">—</span>}
                          </td>
                        </>
                      ) : (
                        <td className="px-3 py-2 text-right font-mono text-text-primary">
                          {fmtCurrency(origLine, vendor.currency)}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
            {/* Migration 052 (2026-08-06): bid-level terms continue this table.
                The label spans Item/Description/Qty/Unit and the value spans the
                price columns, so both line up with the grid above. Owner
                feedback: the Bid total row follows them, closing the block. */}
            <CommercialTermRows
              terms={vendor.commercialTerms}
              labelColSpan={2}
              spacerCells={2}
              valueColSpan={hasNegotiation ? 3 : 2}
            />
            {/* Footer with grand totals. With LT columns removed (BUG-130
                walkthrough 2026-06-13), the footer now carries the only
                line-totals on the table: Bid total label + Original total +
                Negotiated total + overall % chip. */}
            {hasNegotiation ? (
              <tr className="bg-bg/50 font-bold">
                <td className="px-3 py-2" colSpan={4}>Bid total</td>
                <td className="px-3 py-2 text-right font-mono text-text-primary">
                  {fmtCurrency(totalOriginal, vendor.currency)}
                </td>
                <td className="px-3 py-2 text-right font-mono bg-amber-100/60 text-amber-900">
                  {negSeenAtLeastOne ? fmtCurrency(totalNegotiated, vendor.currency) : '—'}
                </td>
                <td className="px-3 py-2 text-right bg-amber-100/60">
                  {negSeenAtLeastOne && totalOriginal > 0 ? (() => {
                    const pct = ((totalOriginal - totalNegotiated) / totalOriginal) * 100;
                    return (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        pct >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                      }`}>
                        {pct >= 0 ? '−' : '+'}{Math.abs(pct).toFixed(1)}%
                      </span>
                    );
                  })() : <span className="text-xs text-text-secondary/60">—</span>}
                </td>
              </tr>
            ) : (
              <tr className="bg-bg/50 font-bold">
                <td className="px-3 py-2" colSpan={5}>Bid total</td>
                <td className="px-3 py-2 text-right font-mono text-text-primary">
                  {fmtCurrency(vendor.commercialTotal, vendor.currency)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-secondary italic mt-2">
        {hasNegotiation
          ? `Amber columns show the vendor's latest negotiation (Round ${latest!.roundNumber}) submitted on ${new Date(latest!.submittedAt).toLocaleDateString('en-GB')}. Original columns are the locked-on-submit bid.`
          : 'Submitted by the vendor at bid time. Read-only here; values are locked once the bid is SUBMITTED.'}
      </p>
    </section>
  );
}

// BUG-098 (2026-06-03, supersedes BUG-094): single-vendor breakdown only.
// Owner directive: "when you click on Show Technical breakdown it extends
// below technical for all vendors instead it should only show only 1 vendor
// the one selected." Renders a small 3-column table: Criterion / Max / This
// vendor's score. No matrix, no other vendors.
function InlineTechBreakdown({ tenderId, highlightVendorId }: { tenderId: string; highlightVendorId: string }) {
  interface TechResponse {
    tender: { technicalPassThreshold: number | null };
    criteria: ComparisonCriterion[];
    totalMaxScore: number;
    vendors: ComparisonVendor[];
  }
  const [data, setData] = useState<TechResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<TechResponse>(`/tenders/${tenderId}/comparison/technical`, token);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load technical comparison');
      }
    })();
    return () => { cancelled = true; };
  }, [tenderId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) {
    return (
      <p className="text-sm text-text-secondary flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading technical breakdown…
      </p>
    );
  }
  const me = data.vendors.find(v => v.vendorId === highlightVendorId);
  if (!me) {
    return <p className="text-sm text-text-secondary italic">No technical evaluation data for this vendor.</p>;
  }
  // Map criterion scores by id for quick lookup.
  const scoreByCriterion = new Map<string, number | null>();
  for (const c of me.consensusByCriterion ?? []) {
    scoreByCriterion.set(c.criterionId, c.consensusScore);
  }
  // BUG-103 (2026-06-05): owner reported "Max 30 Score 93" still showing as a
  // percentage in this breakdown. Per-criterion `score` is stored 0..100 in
  // `technical_evaluation_scores` (see technical-evaluation.service.ts:134),
  // and `consensusScore` here is the average of those per-evaluator percents
  // — also 0..100. Convert to absolute against the criterion's `maxScore`
  // for the per-criterion rows, and against `totalMaxScore` for the total
  // row, matching the `toAbsolute()` pattern in TechnicalMatrix (BUG-061).
  // "93 / 30" → "28 / 30" so the column reads "Score 28" with "Max 30".
  const fmtAbs = (percent: number | null, max: number) => {
    if (percent == null) return '—';
    if (max <= 0) return String(Math.round(percent));
    return String(Math.round((percent / 100) * max));
  };
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
          <th className="px-3 py-2 text-left">Criterion</th>
          <th className="px-3 py-2 text-right w-20">Max</th>
          <th className="px-3 py-2 text-right w-32">Score</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {data.criteria.map(c => (
          <tr key={c.id} className="hover:bg-bg/40">
            <td className="px-3 py-2 text-text-primary">
              {c.name}
              {c.mandatory && (
                <span className="ml-1.5 text-[10px] font-bold text-amber-700 uppercase">Mandatory</span>
              )}
            </td>
            <td className="px-3 py-2 text-right font-mono text-text-secondary">{c.maxScore}</td>
            <td className="px-3 py-2 text-right font-mono font-semibold text-text-primary">
              {fmtAbs(scoreByCriterion.get(c.id) ?? null, Number(c.maxScore))}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-border bg-bg/50">
          <td className="px-3 py-2 font-bold text-text-primary">Total</td>
          <td className="px-3 py-2 text-right font-mono font-bold">{data.totalMaxScore}</td>
          <td className="px-3 py-2 text-right font-mono font-bold">
            {fmtAbs(me.consensusScore, data.totalMaxScore)}
            <span className={`ml-2 text-[10px] font-bold uppercase ${
              me.consensusResult === 'PASS' ? 'text-success'
                : me.consensusResult === 'FAIL' ? 'text-danger'
                : 'text-text-secondary'
            }`}>
              {me.consensusResult}
            </span>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
