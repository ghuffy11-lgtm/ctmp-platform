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
  FileText,
  Loader2,
  Pencil,
  Shield,
  TrendingDown,
  X,
} from 'lucide-react';
import { CommercialDocumentsList } from '@/components/CommercialDocumentsList';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { VendorTechnicalCard, type ComparisonVendor, type ComparisonCriterion } from '@/components/comparison/VendorTechnicalCard';

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
              {/* BUG-069: open this vendor's tech detail in a modal — no
                  navigation. Owner explicitly wants to stay on Commercial
                  Comparison; the previous Link navigated to /technical-comparison. */}
              <button
                type="button"
                onClick={() => setTechOpen(true)}
                className="text-xs font-semibold text-accent hover:underline"
              >
                View Technical Comparison →
              </button>
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

      {/* BUG-069: tech-detail modal — only this vendor, no navigation. */}
      {techOpen && (
        <TechDetailModal
          tenderId={tenderId}
          vendorId={vendor.vendorId}
          vendorName={vendor.vendorName}
          onClose={() => setTechOpen(false)}
        />
      )}
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
    </section>
  );
}

// BUG-068 / Phase F BOQ: per-line breakdown rendered on the per-vendor card
// when the bid carries boqLines + the tender has a real BOQ template. Mirrors
// the Itemized view in CommercialMatrix but for a single vendor.
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

  return (
    <section className="px-5 py-4 border-b border-border">
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
        <TrendingDown className="w-3.5 h-3.5" /> Commercial breakdown (BOQ)
      </h4>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg/40 border-b border-border">
            <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
              <th className="px-3 py-2 text-left font-bold w-16">Item</th>
              <th className="px-3 py-2 text-left font-bold">Description</th>
              <th className="px-3 py-2 text-right font-bold w-20">Qty</th>
              <th className="px-3 py-2 text-left font-bold w-14">Unit</th>
              <th className="px-3 py-2 text-right font-bold w-32">Unit price</th>
              <th className="px-3 py-2 text-right font-bold w-32">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {boqTemplate.map(row => {
              const line = linesByItem.get(row.id);
              const notBidding = !line || line.status === 'NOT_BIDDING';
              return (
                <tr key={row.id} className={notBidding ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">{row.itemNo}</td>
                  <td className="px-3 py-2 text-text-primary">{row.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{row.qty}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{row.unit}</td>
                  {notBidding ? (
                    <>
                      <td className="px-3 py-2 text-right text-xs italic text-text-secondary/70" colSpan={2}>
                        Not bidding
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">
                        {fmtCurrency(line!.unitPrice, vendor.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">
                        {fmtCurrency(line!.lineTotal, vendor.currency)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="bg-bg/50 font-bold">
              <td className="px-3 py-2" colSpan={5}>Bid total</td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">
                {fmtCurrency(vendor.commercialTotal, vendor.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-text-secondary italic mt-2">
        Submitted by the vendor at bid time. Read-only here; values are locked once the bid is SUBMITTED.
      </p>
    </section>
  );
}

// BUG-069: in-page modal showing this vendor's technical detail. Reuses the
// existing /tenders/:id/comparison/technical endpoint and the existing
// VendorTechnicalCard component — drop-in, no new shared scaffold needed.
// ESC closes; backdrop click closes. Renders one VendorTechnicalCard only
// (matching the clicked vendor) with initialExpanded=true so the criterion
// scores + evaluator notes are visible immediately.
function TechDetailModal({
  tenderId,
  vendorId,
  vendorName,
  onClose,
}: {
  tenderId: string;
  vendorId: string;
  vendorName: string;
  onClose: () => void;
}) {
  interface TechResponse {
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const target = data?.vendors.find(v => v.vendorId === vendorId) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Technical detail for ${vendorName}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Technical detail</p>
            <h3 className="text-base font-bold text-text-primary">{vendorName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-card text-text-secondary"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !data ? (
            <p className="text-sm text-text-secondary flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          ) : !target ? (
            <p className="text-sm text-text-secondary italic">No technical evaluation data for this vendor yet.</p>
          ) : (
            <VendorTechnicalCard
              vendor={target}
              criteria={data.criteria}
              totalMaxScore={data.totalMaxScore}
              initialExpanded
            />
          )}
        </div>
      </div>
    </div>
  );
}
