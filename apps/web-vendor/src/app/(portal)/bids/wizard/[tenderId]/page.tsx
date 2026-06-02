'use client';

import { useState, useEffect, useCallback, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, post, put, patch, ApiError } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileDropZone } from '@/components/forms/FileDropZone';

interface Tender {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  description?: string;
}

interface Envelope {
  id: string;
  bidId: string;
  envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  status: string;
}

interface Bid {
  id: string;
  tenderId: string;
  vendorId: string;
  status: string;
  bidEnvelopes: Envelope[];
}

interface BidDocument {
  id: string;
  filename: string;
  mimeType?: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: string;
}

interface EnvelopeContents {
  envelopeId: string;
  envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  status: string;
  documents: BidDocument[];
}

interface SubmitReceipt {
  bidId: string;
  receiptNumber: string;
  receiptHash: string;
  submittedAt: string;
  documentChecksums: Array<{
    documentId: string;
    filename: string;
    checksumSha256: string;
    envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  }>;
}

// BUG-068 / Phase F BOQ. Procurement defines BOQ rows; vendor enters a unit
// price or marks NOT_BIDDING per row. Sum drives the commercial total used
// for comparison. PDF on the commercial envelope is now OPTIONAL.
interface BoqTemplateRow {
  id: string;
  itemNo: string;
  description: string;
  qty: number;
  unit: string;
}
type BoqLineStatus = 'BIDDING' | 'NOT_BIDDING';
interface BoqLineDraft {
  tenderBoqItemId: string;
  status: BoqLineStatus;
  unitPrice: string; // form state — stringly typed for the input
}
const PLACEHOLDER_ITEM_NO = '0';
const PLACEHOLDER_DESCRIPTION = 'Legacy tender — no BOQ defined';

const STEPS = ['Tender', 'Technical Envelope', 'Commercial Pricing', 'Commercial PDF (optional)', 'Review & Submit'] as const;

export default function BidWizardPage({ params }: { params: Promise<{ tenderId: string }> }) {
  const { tenderId } = use(params);
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [tender, setTender] = useState<Tender | null>(null);
  const [bid, setBid] = useState<Bid | null>(null);
  const [technicalDocs, setTechnicalDocs] = useState<BidDocument[]>([]);
  const [commercialDocs, setCommercialDocs] = useState<BidDocument[]>([]);
  const [receipt, setReceipt] = useState<SubmitReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-068 / Phase F BOQ — template + per-line vendor entry draft state.
  const [boqTemplate, setBoqTemplate] = useState<BoqTemplateRow[]>([]);
  const [boqLines, setBoqLines] = useState<BoqLineDraft[]>([]);
  const [boqSaving, setBoqSaving] = useState(false);
  const hasRealBoq = useMemo(
    () => boqTemplate.some(r => !(r.itemNo === PLACEHOLDER_ITEM_NO && r.description === PLACEHOLDER_DESCRIPTION)),
    [boqTemplate],
  );

  // ─── Initial load: tender + draft-or-resume bid + envelope contents ─────────
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const token = getAccessToken();
        const tenderRes = await get<Tender>(`/tenders/${tenderId}`, token);
        setTender(tenderRes);

        const bidRes = await post<Bid>(`/tenders/${tenderId}/bids/draft`, {}, token);
        setBid(bidRes);

        if (bidRes.status !== 'DRAFT') {
          // Already submitted — jump to receipt.
          try {
            const r = await get<any>(`/bids/${bidRes.id}/receipt`, token);
            const synthetic: SubmitReceipt = {
              bidId: bidRes.id,
              receiptNumber: r.receiptNumber,
              receiptHash: r.receiptHash,
              submittedAt: r.submittedAt,
              documentChecksums: (r.snapshot?.documents ?? []) as SubmitReceipt['documentChecksums'],
            };
            setReceipt(synthetic);
            setStep(4);
          } catch {
            setStep(4);
          }
        }

        const [tech, comm, boqTpl, boqOwn] = await Promise.all([
          get<EnvelopeContents>(`/bids/${bidRes.id}/envelopes/TECHNICAL/documents`, token).catch(
            () => ({ envelopeId: '', envelopeType: 'TECHNICAL' as const, status: 'DRAFT', documents: [] }),
          ),
          get<EnvelopeContents>(`/bids/${bidRes.id}/envelopes/COMMERCIAL/documents`, token).catch(
            () => ({ envelopeId: '', envelopeType: 'COMMERCIAL' as const, status: 'DRAFT', documents: [] }),
          ),
          // BUG-068: tender BOQ template (real rows only — placeholder filtered below).
          get<{ items: BoqTemplateRow[] }>(`/tenders/${tenderId}/boq`, token).catch(
            () => ({ items: [] as BoqTemplateRow[] }),
          ),
          // BUG-068: vendor's existing BOQ draft on this bid (empty for a fresh draft).
          get<{ items: Array<{ tenderBoqItemId: string; status: BoqLineStatus; unitPrice: number | null }> }>(
            `/bids/${bidRes.id}/boq-items`,
            token,
          ).catch(() => ({ items: [] })),
        ]);
        setTechnicalDocs(tech.documents);
        setCommercialDocs(comm.documents);

        const realRows = (boqTpl.items ?? []).filter(
          r => !(r.itemNo === PLACEHOLDER_ITEM_NO && r.description === PLACEHOLDER_DESCRIPTION),
        );
        setBoqTemplate(realRows);
        // Hydrate the form: prefer the vendor's saved draft per row, otherwise default to BIDDING with empty price.
        const draftByTenderItem = new Map(
          (boqOwn.items ?? []).map(l => [l.tenderBoqItemId, l]),
        );
        setBoqLines(realRows.map(r => {
          const d = draftByTenderItem.get(r.id);
          return {
            tenderBoqItemId: r.id,
            status: d?.status ?? 'BIDDING',
            unitPrice: d?.unitPrice != null ? String(d.unitPrice) : '',
          };
        }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError('You already submitted this bid. Redirecting to your bid list…');
          setTimeout(() => router.push('/bids'), 2000);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to start bid wizard');
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [tenderId, router]);

  async function handleDeleteDoc(envelopeType: 'TECHNICAL' | 'COMMERCIAL', docId: string) {
    if (!bid) return;
    if (!confirm('Remove this document?')) return;
    const token = getAccessToken();
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/bids/${bid.id}/documents/${docId}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        },
      );
      if (envelopeType === 'TECHNICAL') {
        setTechnicalDocs(prev => prev.filter(d => d.id !== docId));
      } else {
        setCommercialDocs(prev => prev.filter(d => d.id !== docId));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  // BUG-068: validate + PUT vendor's BOQ entries. Allowed any time pre-submit.
  async function handleSaveBoq() {
    if (!bid || !hasRealBoq) return;
    for (const line of boqLines) {
      if (line.status === 'BIDDING') {
        const n = Number(line.unitPrice);
        if (line.unitPrice === '' || !Number.isFinite(n) || n < 0) {
          setError('Every BIDDING line needs a non-negative unit price. NOT_BIDDING lines opt out instead.');
          return;
        }
      }
    }
    setBoqSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      await put(`/bids/${bid.id}/boq-items`, {
        items: boqLines.map(l => ({
          tenderBoqItemId: l.tenderBoqItemId,
          status: l.status,
          unitPrice: l.status === 'BIDDING' ? Number(l.unitPrice) : undefined,
        })),
      }, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BOQ save failed');
      throw err;
    } finally {
      setBoqSaving(false);
    }
  }

  async function handleSubmit() {
    if (!bid) return;
    if (technicalDocs.length === 0) {
      setError('Technical envelope must contain at least one document');
      return;
    }
    // Commercial PDF is OPTIONAL when the tender has a real BOQ template; the
    // BOQ is the legal price record. For legacy tenders (no BOQ) it remains
    // mandatory per the backend submit gate.
    if (!hasRealBoq && commercialDocs.length === 0) {
      setError('Commercial envelope must contain at least one document');
      return;
    }
    if (!confirm('Submit bid? Submitted bids are immutable.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      // Persist BOQ first (best-effort — if it succeeded earlier, this is a no-op overwrite).
      if (hasRealBoq) {
        try { await handleSaveBoq(); } catch { setSubmitting(false); return; }
      }
      const result = await post<SubmitReceipt>(`/bids/${bid.id}/submit`, {}, token);
      setReceipt(result);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>;
  }
  if (error && !bid) {
    return (
      <div className="p-8 max-w-md mx-auto bg-card border border-danger/30 rounded-xl text-center">
        <p className="text-sm text-danger">{error}</p>
        <Link href="/tenders" className="inline-block mt-3 text-sm text-accent hover:underline">
          Back to tenders
        </Link>
      </div>
    );
  }
  if (!tender || !bid) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <nav className="text-xs text-text-secondary mb-1 flex items-center gap-1">
          <Link href="/bids" className="hover:text-accent">My Bids</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-text-primary font-medium">Bid Wizard</span>
        </nav>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Bid for {tender.referenceNumber}
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">{tender.title}</p>
      </div>

      {/* Step indicator */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => {
            const done = i < step || receipt;
            const active = i === step;
            return (
              <div key={label} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? 'bg-success text-white'
                      : active
                        ? 'bg-accent text-white'
                        : 'bg-bg border border-border text-text-secondary'
                  }`}
                >
                  {done && !active ? '✓' : i + 1}
                </div>
                <span
                  className={`ml-2 text-xs font-semibold ${
                    active ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-3" />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      {/* Step content */}
      {step === 0 && (
        <Step0Tender
          tender={tender}
          bid={bid}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <Step1Envelope
          title="Technical Envelope"
          description="Upload technical proposal documents. These become readable only after the tender's technical opening phase."
          bidId={bid.id}
          envelopeType="TECHNICAL"
          docs={technicalDocs}
          onUploaded={doc => setTechnicalDocs(prev => [...prev, doc])}
          onDelete={id => handleDeleteDoc('TECHNICAL', id)}
          onPrev={() => setStep(0)}
          onNext={() => setStep(2)}
          required
        />
      )}
      {step === 2 && (
        <Step2BoqPricing
          hasRealBoq={hasRealBoq}
          boqTemplate={boqTemplate}
          boqLines={boqLines}
          setBoqLines={setBoqLines}
          tenderReferenceNumber={tender?.referenceNumber}
          saving={boqSaving}
          onSaveDraft={async () => { try { await handleSaveBoq(); } catch { /* error already in state */ } }}
          onPrev={() => setStep(1)}
          onNext={async () => {
            if (hasRealBoq) {
              try { await handleSaveBoq(); } catch { return; }
            }
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <Step1Envelope
          title={hasRealBoq ? 'Commercial PDF (optional reference)' : 'Commercial Envelope'}
          description={
            hasRealBoq
              ? 'Optional supporting document. Per-line prices in the previous step are the legal record. Upload only if you want to attach a supplementary brochure or quotation letter.'
              : 'Upload pricing documents. These remain sealed until the committee opens commercial envelopes.'
          }
          bidId={bid.id}
          envelopeType="COMMERCIAL"
          docs={commercialDocs}
          onUploaded={doc => setCommercialDocs(prev => [...prev, doc])}
          onDelete={id => handleDeleteDoc('COMMERCIAL', id)}
          onPrev={() => setStep(2)}
          onNext={() => setStep(4)}
          required={!hasRealBoq}
        />
      )}
      {step === 4 && (
        <Step4Review
          tender={tender}
          bid={bid}
          technicalDocs={technicalDocs}
          commercialDocs={commercialDocs}
          hasRealBoq={hasRealBoq}
          boqTemplate={boqTemplate}
          boqLines={boqLines}
          receipt={receipt}
          submitting={submitting}
          onPrev={() => !receipt && setStep(3)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// ─── Step 0: Tender summary ────────────────────────────────────────────────────

function Step0Tender({ tender, bid, onNext }: { tender: Tender; bid: Bid; onNext: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">Tender</p>
          <p className="text-lg font-bold text-text-primary mt-0.5">{tender.title}</p>
          <p className="text-xs text-text-secondary font-mono mt-0.5">{tender.referenceNumber}</p>
        </div>
        <StatusBadge status={tender.status} />
      </div>
      {tender.description && (
        <p className="text-sm text-text-secondary leading-relaxed">{tender.description}</p>
      )}
      {tender.submissionDeadline && (
        <div className="flex items-center gap-2 text-sm">
          <span className="material-symbols-outlined text-[18px] text-amber-600">schedule</span>
          <span className="font-semibold text-text-primary">
            Submission deadline: {new Date(tender.submissionDeadline).toLocaleString('en-GB')}
          </span>
        </div>
      )}
      <div className="bg-bg rounded-lg p-3 border border-border text-xs text-text-secondary">
        <p className="font-bold text-text-primary mb-1">Bid #{bid.id.slice(0, 8)}…</p>
        <p>Status: <StatusBadge status={bid.status} /></p>
        <p className="mt-1 italic">Submitted bids are immutable. Documents are SHA-256 checksummed at submit.</p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Step 1 / 2: Envelope ──────────────────────────────────────────────────────

function Step1Envelope({
  title,
  description,
  bidId,
  envelopeType,
  docs,
  onUploaded,
  onDelete,
  onPrev,
  onNext,
  required = true,
}: {
  title: string;
  description: string;
  bidId: string;
  envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  docs: BidDocument[];
  onUploaded: (d: BidDocument) => void;
  onDelete: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  required?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        <p className="text-sm text-text-secondary mt-1">{description}</p>
      </div>

      <FileDropZone
        bidId={bidId}
        envelopeType={envelopeType}
        onUploaded={d => onUploaded({
          id: d.id,
          filename: d.filename,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          checksumSha256: d.checksumSha256,
          uploadedAt: d.uploadedAt,
        })}
      />

      {docs.length === 0 ? (
        <p className="text-sm text-text-secondary italic text-center py-4">No documents yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-bg/50 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Filename</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Size</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">SHA-256</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-text-secondary"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {docs.map(d => (
              <tr key={d.id} className="hover:bg-bg/40">
                <td className="px-3 py-2.5 text-text-primary font-semibold">{d.filename}</td>
                <td className="px-3 py-2.5 text-text-secondary">{Math.round(d.fileSize / 1024)} KB</td>
                <td className="px-3 py-2.5 text-text-secondary font-mono text-[11px]">
                  {d.checksumSha256.slice(0, 16)}…
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-xs text-danger hover:underline font-semibold"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex justify-between border-t border-border pt-4">
        <button
          onClick={onPrev}
          className="px-4 py-2 border border-border text-text-secondary rounded-lg font-semibold hover:bg-bg"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={required && docs.length === 0}
          className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {required || docs.length > 0 ? 'Continue →' : 'Skip (no upload) →'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Commercial Pricing (BOQ) ───────────────────────────────────────────
// BUG-068 / Phase F BOQ. Vendor fills unit price per template line, or marks
// NOT_BIDDING to opt out of that line. Live grand-total at the bottom. Save
// Draft persists progress; Continue persists then advances.
// BUG-084 (2026-06-02): parse vendor-side BoQ CSV. Format is the same six-column
// shape the admin BoQ editor uses (BUG-072) extended with two vendor columns:
//   item_no,description,qty,unit,status,unit_price
// Description / qty / unit are informational on import — the in-DB template is
// authoritative for qty (used in line-total math). Vendor cannot fudge the
// procurement-defined structure via an offline CSV edit.
//
// Returns either { lines } (parsed rows keyed by item_no) or { errors } with
// human-readable row-numbered messages.
function parseVendorBoqCsv(text: string, templateByItemNo: Map<string, BoqTemplateRow>):
  { lines?: Map<string, { status: BoqLineStatus; unitPrice: string }>; errors?: string[] }
{
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { errors: ['File is empty.'] };
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const requiredCols = ['item_no', 'status', 'unit_price'];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    return { errors: [`Missing required column(s): ${missing.join(', ')}. Header must include at least: ${requiredCols.join(',')}.`] };
  }
  const idxItem = header.indexOf('item_no');
  const idxStatus = header.indexOf('status');
  const idxPrice = header.indexOf('unit_price');

  const out = new Map<string, { status: BoqLineStatus; unitPrice: string }>();
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const lineNum = i + 1;
    const itemNo = cells[idxItem] ?? '';
    if (!itemNo) { errors.push(`Line ${lineNum}: missing item_no.`); continue; }
    if (!templateByItemNo.has(itemNo)) {
      errors.push(`Line ${lineNum}: item_no "${itemNo}" does not match any BoQ row in this tender.`);
      continue;
    }
    if (seen.has(itemNo)) { errors.push(`Line ${lineNum}: duplicate item_no "${itemNo}".`); continue; }
    seen.add(itemNo);

    // Status: case-insensitive. Accept canonical + UI labels. Blank → BIDDING.
    const rawStatus = (cells[idxStatus] ?? '').toLowerCase().replace(/[_\s]/g, '');
    let status: BoqLineStatus;
    if (rawStatus === '' || rawStatus === 'bidding') {
      status = 'BIDDING';
    } else if (rawStatus === 'notbidding') {
      status = 'NOT_BIDDING';
    } else {
      errors.push(`Line ${lineNum}: status "${cells[idxStatus]}" must be Bidding or Not bidding.`);
      continue;
    }

    const rawPrice = (cells[idxPrice] ?? '').trim();
    if (status === 'BIDDING') {
      if (rawPrice === '') {
        errors.push(`Line ${lineNum}: unit_price required when status is Bidding.`);
        continue;
      }
      const n = Number(rawPrice);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`Line ${lineNum}: unit_price must be a non-negative number (got "${rawPrice}").`);
        continue;
      }
      out.set(itemNo, { status, unitPrice: String(n) });
    } else {
      out.set(itemNo, { status, unitPrice: '' });
    }
  }
  if (errors.length > 0) return { errors };
  return { lines: out };
}

// BUG-084: escape a single CSV field. Wrap in quotes if it contains comma /
// quote / newline. Doubles internal quotes per RFC4180. Procurement-defined
// descriptions can contain commas so this matters even though our parser is
// comma-split-only on import.
function csvEscape(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function Step2BoqPricing({
  hasRealBoq,
  boqTemplate,
  boqLines,
  setBoqLines,
  tenderReferenceNumber,
  saving,
  onSaveDraft,
  onPrev,
  onNext,
}: {
  hasRealBoq: boolean;
  boqTemplate: BoqTemplateRow[];
  boqLines: BoqLineDraft[];
  setBoqLines: (next: BoqLineDraft[]) => void;
  tenderReferenceNumber?: string;
  saving: boolean;
  onSaveDraft: () => Promise<void>;
  onPrev: () => void;
  onNext: () => Promise<void>;
}) {
  // BUG-084: hooks must be declared unconditionally — keep them above the
  // legacy-tender early return below so React's hook order doesn't shift
  // between renders when hasRealBoq flips.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);

  if (!hasRealBoq) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-text-primary">Commercial Pricing</h2>
        <p className="text-sm text-text-secondary">
          This tender has no structured Bill of Quantities. The commercial PDF you upload in the next step is the price record. Click Continue.
        </p>
        <div className="flex justify-between border-t border-border pt-4">
          <button onClick={onPrev} className="px-4 py-2 border border-border text-text-secondary rounded-lg font-semibold hover:bg-bg">← Back</button>
          <button onClick={() => onNext()} className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90">Continue →</button>
        </div>
      </div>
    );
  }

  function updateLine(idx: number, patch: Partial<BoqLineDraft>) {
    setBoqLines(boqLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // BUG-084 (2026-06-02): vendor BoQ CSV round-trip.
  function handleDownloadCsv() {
    const header = ['item_no', 'description', 'qty', 'unit', 'status', 'unit_price'];
    const rows = boqTemplate.map((row, i) => {
      const line = boqLines[i];
      const status = line?.status ?? 'BIDDING';
      const price = line?.status === 'BIDDING' ? (line.unitPrice ?? '') : '';
      return [row.itemNo, row.description, String(row.qty), row.unit, status, price];
    });
    const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeRef = (tenderReferenceNumber ?? 'bid').replace(/[^A-Za-z0-9._-]/g, '_');
    a.href = url;
    a.download = `boq-${safeRef}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function handleImportClick() {
    setImportErrors(null);
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const templateByItemNo = new Map(boqTemplate.map(r => [r.itemNo, r]));
      const { lines: parsed, errors } = parseVendorBoqCsv(text, templateByItemNo);
      if (errors && errors.length > 0) {
        setImportErrors(errors);
        return;
      }
      if (!parsed || parsed.size === 0) {
        setImportErrors(['No data rows found in the file.']);
        return;
      }
      // Merge: for every template row, prefer the parsed entry; otherwise keep
      // the current form state. Owner directive: rows missing from CSV stay
      // untouched so a vendor can upload a partial CSV.
      const merged = boqTemplate.map((row, i) => {
        const incoming = parsed.get(row.itemNo);
        if (incoming) {
          return {
            tenderBoqItemId: row.id,
            status: incoming.status,
            unitPrice: incoming.unitPrice,
          };
        }
        return boqLines[i] ?? { tenderBoqItemId: row.id, status: 'BIDDING' as BoqLineStatus, unitPrice: '' };
      });
      setBoqLines(merged);
      setImportErrors(null);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : 'Failed to read file.']);
    }
  }

  // Live grand total — sums only BIDDING lines with parseable prices.
  const grandTotal = boqLines.reduce((sum, l, i) => {
    if (l.status !== 'BIDDING') return sum;
    const row = boqTemplate[i];
    const n = Number(l.unitPrice);
    if (!Number.isFinite(n) || n < 0 || !row) return sum;
    return sum + n * row.qty;
  }, 0);

  const allValid = boqLines.every(l => {
    if (l.status === 'NOT_BIDDING') return true;
    const n = Number(l.unitPrice);
    return l.unitPrice !== '' && Number.isFinite(n) && n >= 0;
  });

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Commercial Pricing — Bill of Quantities</h2>
          <p className="text-sm text-text-secondary mt-1">
            Enter your <strong>unit price</strong> for each line in <strong>KWD</strong>, or switch a line to <strong>Not bidding</strong> if you do not want to bid on it. The system multiplies unit price × quantity for each line and rolls up to your bid total.
          </p>
          <p className="text-xs text-text-secondary mt-2">
            Prefer Excel? <strong>Download CSV</strong> to get the BoQ, fill prices offline, then <strong>Import CSV</strong> to bring it back. You can still edit rows in this form after import.
          </p>
        </div>
        {/* BUG-084: CSV round-trip toolbar. */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="px-3 py-2 text-xs font-semibold border border-border rounded-lg text-text-secondary hover:bg-bg"
            title="Download the BoQ with your current prices"
          >
            ⬇ Download CSV
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            className="px-3 py-2 text-xs font-semibold border border-border rounded-lg text-text-secondary hover:bg-bg"
            title="Import a filled CSV — matches rows by item_no"
          >
            ⬆ Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChosen}
            className="hidden"
          />
        </div>
      </div>

      {importErrors && importErrors.length > 0 && (
        <div className="px-4 py-3 bg-danger/5 border border-danger/30 rounded-lg text-xs text-danger">
          <p className="font-bold mb-1">CSV import failed:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {importErrors.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
            {importErrors.length > 8 && <li>… and {importErrors.length - 8} more.</li>}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary w-20">Item</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary">Description</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-text-secondary w-20">Qty</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary w-16">Unit</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary w-32">Bidding?</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-text-secondary w-32">Unit price (KWD)</th>
              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-text-secondary w-32">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {boqTemplate.map((row, i) => {
              const line = boqLines[i];
              if (!line) return null;
              const notBidding = line.status === 'NOT_BIDDING';
              const priceNum = Number(line.unitPrice);
              const priceValid = !notBidding && line.unitPrice !== '' && Number.isFinite(priceNum) && priceNum >= 0;
              const lineTotal = priceValid ? priceNum * row.qty : null;
              return (
                <tr key={row.id} className={notBidding ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">{row.itemNo}</td>
                  <td className="px-3 py-2 text-text-primary">{row.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{row.qty}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{row.unit}</td>
                  <td className="px-3 py-2">
                    <select
                      value={line.status}
                      onChange={e => updateLine(i, { status: e.target.value as BoqLineStatus, unitPrice: e.target.value === 'NOT_BIDDING' ? '' : line.unitPrice })}
                      className="w-full px-2 py-1.5 text-xs border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="BIDDING">Bidding</option>
                      <option value="NOT_BIDDING">Not bidding</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={notBidding ? '' : line.unitPrice}
                      onChange={e => updateLine(i, { unitPrice: e.target.value })}
                      disabled={notBidding}
                      placeholder={notBidding ? '—' : '0.000'}
                      className={`w-28 px-2 py-1.5 text-sm font-mono text-right border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 ${
                        !notBidding && line.unitPrice !== '' && !priceValid ? 'border-danger' : 'border-border'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-text-primary">
                    {notBidding ? <span className="italic text-text-secondary text-xs">Not bidding</span> : (lineTotal != null ? lineTotal.toFixed(3) : '—')}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-bg/60 font-bold">
              <td className="px-3 py-2" colSpan={6}>Grand total (KWD)</td>
              <td className="px-3 py-2 text-right font-mono">{grandTotal.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-between border-t border-border pt-4 gap-2 flex-wrap">
        <button
          onClick={onPrev}
          className="px-4 py-2 border border-border text-text-secondary rounded-lg font-semibold hover:bg-bg"
        >
          ← Back
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onSaveDraft()}
            disabled={saving || !allValid}
            className="px-4 py-2 border border-border text-text-secondary rounded-lg font-semibold hover:bg-bg disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            onClick={() => onNext()}
            disabled={saving || !allValid}
            className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Review + Submit / Receipt ─────────────────────────────────────────

function Step4Review({
  tender,
  bid,
  technicalDocs,
  commercialDocs,
  hasRealBoq,
  boqTemplate,
  boqLines,
  receipt,
  submitting,
  onPrev,
  onSubmit,
}: {
  tender: Tender;
  bid: Bid;
  technicalDocs: BidDocument[];
  commercialDocs: BidDocument[];
  hasRealBoq: boolean;
  boqTemplate: BoqTemplateRow[];
  boqLines: BoqLineDraft[];
  receipt: SubmitReceipt | null;
  submitting: boolean;
  onPrev: () => void;
  onSubmit: () => void;
}) {
  if (receipt) {
    return (
      <div className="space-y-5">
        <div className="bg-success/10 border border-success/30 rounded-xl p-5 text-center">
          <span className="material-symbols-outlined text-[40px] text-success block mb-2">verified</span>
          <p className="text-base font-bold text-text-primary">Bid submitted successfully</p>
          <p className="text-xs text-text-secondary mt-1">Receipt is your proof of submission.</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <ReceiptRow label="Receipt Number" value={receipt.receiptNumber} mono />
          <ReceiptRow label="Receipt Hash (SHA-256)" value={receipt.receiptHash} mono />
          <ReceiptRow label="Submitted At" value={new Date(receipt.submittedAt).toLocaleString('en-GB')} />
          <ReceiptRow label="Tender" value={tender.referenceNumber} />
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-text-primary mb-3">Document Checksums</h3>
          <table className="w-full text-sm">
            <thead className="bg-bg/50 border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary">Envelope</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary">Filename</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-text-secondary">SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipt.documentChecksums.map(d => (
                <tr key={d.documentId}>
                  <td className="px-3 py-2 text-xs text-text-secondary">{d.envelopeType}</td>
                  <td className="px-3 py-2 text-text-primary font-semibold">{d.filename}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-text-secondary break-all">{d.checksumSha256}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Link href={`/bids/${bid.id}`} className="px-4 py-2 border border-border rounded-lg font-semibold text-sm hover:bg-bg">
            View bid detail
          </Link>
          <Link href="/bids" className="px-5 py-2 bg-accent text-white rounded-lg font-bold text-sm">
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Review &amp; Submit</h2>
        <p className="text-sm text-text-secondary mt-1">
          Verify everything below. <strong>Submitted bids are immutable.</strong> Documents lock + checksums generated.
        </p>
      </div>

      <ReviewBlock title="Technical Envelope" docs={technicalDocs} />
      {/* BUG-068: BOQ summary block when the tender uses structured pricing. */}
      {hasRealBoq && (
        <div className="border border-border rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Commercial pricing (BOQ)</p>
          <table className="w-full text-xs">
            <thead className="border-b border-border">
              <tr className="text-left text-text-secondary">
                <th className="py-1 pr-3">Item</th>
                <th className="py-1 pr-3">Description</th>
                <th className="py-1 pr-3 text-right">Qty</th>
                <th className="py-1 pr-3">Unit</th>
                <th className="py-1 pr-3 text-right">Unit price</th>
                <th className="py-1 pr-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boqTemplate.map((row, i) => {
                const line = boqLines[i];
                const notBidding = !line || line.status === 'NOT_BIDDING';
                const price = Number(line?.unitPrice);
                const lt = !notBidding && Number.isFinite(price) ? price * row.qty : null;
                return (
                  <tr key={row.id} className={notBidding ? 'opacity-60' : ''}>
                    <td className="py-1 pr-3 font-mono">{row.itemNo}</td>
                    <td className="py-1 pr-3">{row.description}</td>
                    <td className="py-1 pr-3 text-right font-mono">{row.qty}</td>
                    <td className="py-1 pr-3">{row.unit}</td>
                    <td className="py-1 pr-3 text-right font-mono">{notBidding ? '—' : price.toFixed(3)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{notBidding ? <em className="text-text-secondary">Not bidding</em> : lt?.toFixed(3)}</td>
                  </tr>
                );
              })}
              <tr className="bg-bg/40 font-bold">
                <td className="py-1 pr-3" colSpan={5}>Total (KWD)</td>
                <td className="py-1 pr-3 text-right font-mono">
                  {boqLines.reduce((s, l, i) => {
                    if (l.status !== 'BIDDING') return s;
                    const p = Number(l.unitPrice);
                    const q = boqTemplate[i]?.qty ?? 0;
                    return Number.isFinite(p) ? s + p * q : s;
                  }, 0).toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <ReviewBlock title={hasRealBoq ? 'Commercial PDF (optional reference)' : 'Commercial Envelope'} docs={commercialDocs} optional={hasRealBoq} />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex gap-2">
        <span className="material-symbols-outlined text-[18px]">warning</span>
        <p>By submitting you certify the contents are final. Receipt is generated immediately.</p>
      </div>

      <div className="flex justify-between border-t border-border pt-4">
        <button
          onClick={onPrev}
          className="px-4 py-2 border border-border text-text-secondary rounded-lg font-semibold hover:bg-bg"
        >
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={
            submitting
            || technicalDocs.length === 0
            || (!hasRealBoq && commercialDocs.length === 0)
          }
          className="px-6 py-2 bg-success text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit Bid'}
        </button>
      </div>
    </div>
  );
}

function ReviewBlock({ title, docs, optional }: { title: string; docs: BidDocument[]; optional?: boolean }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">{title}</p>
      {docs.length === 0 ? (
        optional
          ? <p className="text-sm text-text-secondary italic">No documents attached (optional).</p>
          : <p className="text-sm text-danger italic">No documents — required.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-2 text-text-primary">
              <span className="material-symbols-outlined text-[14px] text-text-secondary">description</span>
              <span className="font-semibold">{d.filename}</span>
              <span className="text-xs text-text-secondary">({Math.round(d.fileSize / 1024)} KB)</span>
              <code className="ml-auto text-[10px] text-text-secondary">{d.checksumSha256.slice(0, 16)}…</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReceiptRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className={`text-sm text-text-primary ${mono ? 'font-mono break-all' : ''}`}>{value}</p>
    </div>
  );
}
