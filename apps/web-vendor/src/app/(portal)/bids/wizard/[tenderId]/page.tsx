'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, post, patch, ApiError } from '@/lib/api';
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

const STEPS = ['Tender', 'Technical Envelope', 'Commercial Envelope', 'Review & Submit'] as const;

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
            setStep(3);
          } catch {
            setStep(3);
          }
        }

        const [tech, comm] = await Promise.all([
          get<EnvelopeContents>(`/bids/${bidRes.id}/envelopes/TECHNICAL/documents`, token).catch(
            () => ({ envelopeId: '', envelopeType: 'TECHNICAL' as const, status: 'DRAFT', documents: [] }),
          ),
          get<EnvelopeContents>(`/bids/${bidRes.id}/envelopes/COMMERCIAL/documents`, token).catch(
            () => ({ envelopeId: '', envelopeType: 'COMMERCIAL' as const, status: 'DRAFT', documents: [] }),
          ),
        ]);
        setTechnicalDocs(tech.documents);
        setCommercialDocs(comm.documents);
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

  async function handleSubmit() {
    if (!bid) return;
    if (technicalDocs.length === 0 || commercialDocs.length === 0) {
      setError('Both envelopes must contain at least one document');
      return;
    }
    if (!confirm('Submit bid? Submitted bids are immutable.')) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      const result = await post<SubmitReceipt>(`/bids/${bid.id}/submit`, {}, token);
      setReceipt(result);
      setStep(3);
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
        />
      )}
      {step === 2 && (
        <Step1Envelope
          title="Commercial Envelope"
          description="Upload pricing documents. These remain sealed until the committee opens commercial envelopes."
          bidId={bid.id}
          envelopeType="COMMERCIAL"
          docs={commercialDocs}
          onUploaded={doc => setCommercialDocs(prev => [...prev, doc])}
          onDelete={id => handleDeleteDoc('COMMERCIAL', id)}
          onPrev={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3Review
          tender={tender}
          bid={bid}
          technicalDocs={technicalDocs}
          commercialDocs={commercialDocs}
          receipt={receipt}
          submitting={submitting}
          onPrev={() => !receipt && setStep(2)}
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
          disabled={docs.length === 0}
          className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Review + Submit / Receipt ─────────────────────────────────────────

function Step3Review({
  tender,
  bid,
  technicalDocs,
  commercialDocs,
  receipt,
  submitting,
  onPrev,
  onSubmit,
}: {
  tender: Tender;
  bid: Bid;
  technicalDocs: BidDocument[];
  commercialDocs: BidDocument[];
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
      <ReviewBlock title="Commercial Envelope" docs={commercialDocs} />

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
          disabled={submitting || technicalDocs.length === 0 || commercialDocs.length === 0}
          className="px-6 py-2 bg-success text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit Bid'}
        </button>
      </div>
    </div>
  );
}

function ReviewBlock({ title, docs }: { title: string; docs: BidDocument[] }) {
  return (
    <div className="border border-border rounded-lg p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">{title}</p>
      {docs.length === 0 ? (
        <p className="text-sm text-danger italic">No documents — required.</p>
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
