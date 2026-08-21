'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NegotiationSection } from '@/components/bids/NegotiationSection';
import { CommercialTermsSummary } from '@/components/bids/CommercialTermsCard';
import type { CommercialTerms } from '@ctmp/shared-types';

// BUG-082 (2026-06-01): read-only BoQ view for vendors' submitted bids.
interface BoqTemplateRow { id: string; itemNo: string; description: string; qty: number; unit: string }
interface BidBoqLine { tenderBoqItemId: string; status: 'BIDDING' | 'NOT_BIDDING'; unitPrice: number | null }
const BOQ_PLACEHOLDER_ITEM_NO = '0';
const BOQ_PLACEHOLDER_DESCRIPTION = 'Legacy tender — no BOQ defined';

interface MyBidSummary {
  id: string;
  tenderId: string;
  tenderReference: string;
  tenderTitle: string;
  tenderStatus: string;
  submissionDeadline: string | null;
  status: string;
  submittedAt: string | null;
  technicalResult?: 'PASS' | 'FAIL';
  technicalEnvelopeStatus: string;
  commercialEnvelopeStatus: string;
  receiptNumber?: string;
}

interface Receipt {
  id: string;
  bidId: string;
  receiptNumber: string;
  receiptHash: string;
  submittedAt: string;
  snapshot: any;
}

export default function VendorBidDetailPage({ params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = use(params);

  const [bid, setBid] = useState<MyBidSummary | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [boqTemplate, setBoqTemplate] = useState<BoqTemplateRow[]>([]);
  const [boqLines, setBoqLines] = useState<BidBoqLine[]>([]);
  const [terms, setTerms] = useState<CommercialTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const myBids = await get<{ items: MyBidSummary[] }>('/vendor-auth/me/bids?pageSize=200', token);
        const found = myBids.items.find(b => b.id === bidId);
        if (!found) {
          setError('Bid not found in your account');
          return;
        }
        setBid(found);
        if (found.status !== 'DRAFT') {
          const r = await get<Receipt>(`/bids/${bidId}/receipt`, token).catch(() => null);
          if (r) setReceipt(r);
        }
        // BUG-082: pull BoQ + the vendor's saved line entries. Both are best-effort —
        // legacy tenders without a real BoQ just won't render this block.
        const [tpl, ownLines] = await Promise.all([
          get<{ items: BoqTemplateRow[] }>(`/tenders/${found.tenderId}/boq`, token).catch(() => ({ items: [] })),
          get<{ items: BidBoqLine[] }>(`/bids/${bidId}/boq-items`, token).catch(() => ({ items: [] })),
        ]);
        const realRows = (tpl.items ?? []).filter(
          r => !(r.itemNo === BOQ_PLACEHOLDER_ITEM_NO && r.description === BOQ_PLACEHOLDER_DESCRIPTION),
        );
        setBoqTemplate(realRows);
        setBoqLines(ownLines.items ?? []);
        // Migration 052 (2026-08-06): bid-level commercial terms. Best-effort —
        // bids placed before the migration simply have none.
        const storedTerms = await get<CommercialTerms>(`/bids/${bidId}/commercial-terms`, token).catch(() => null);
        setTerms(storedTerms);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bid');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bidId]);

  if (loading) return <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>;
  if (error || !bid) {
    return (
      <div className="p-8 max-w-md mx-auto bg-card border border-danger/30 rounded-xl text-center">
        <p className="text-sm text-danger">{error ?? 'Bid not found'}</p>
        <Link href="/bids" className="inline-block mt-3 text-sm text-accent hover:underline">Back to my bids</Link>
      </div>
    );
  }

  const docs = (receipt?.snapshot?.documents ?? []) as Array<{
    documentId: string;
    filename: string;
    checksumSha256: string;
    envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  }>;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <nav className="text-xs text-text-secondary flex items-center gap-1">
        <Link href="/bids" className="hover:text-accent">My Bids</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-text-primary font-medium">{bid.tenderReference}</span>
      </nav>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{bid.tenderTitle}</h1>
          <p className="text-sm text-text-secondary mt-0.5 font-mono">{bid.tenderReference}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={bid.status} />
          <StatusBadge status={bid.tenderStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card label="Technical Envelope" value={bid.technicalEnvelopeStatus} />
        <Card label="Commercial Envelope" value={bid.commercialEnvelopeStatus} />
        <Card
          label="Technical Result"
          value={bid.technicalResult ?? 'Pending'}
          tone={bid.technicalResult === 'PASS' ? 'success' : bid.technicalResult === 'FAIL' ? 'danger' : undefined}
        />
      </div>

      {bid.status === 'DRAFT' && (
        <Link
          href={`/bids/wizard/${bid.tenderId}`}
          className="block bg-card border border-accent rounded-xl p-5 hover:bg-accent/5 transition-colors"
        >
          <p className="text-sm font-bold text-accent">Continue editing bid →</p>
          <p className="text-xs text-text-secondary mt-1">Bid still in DRAFT. Open wizard to upload documents and submit.</p>
        </Link>
      )}

      {/* Phase E (BUG-042): award outcome — visible only after the tender has been awarded. */}
      {bid.status === 'AWARDED' && (
        <div className="rounded-3xl bg-emerald-50 border border-emerald-200 px-6 py-5 flex items-start gap-4">
          <div className="text-3xl">🏆</div>
          <div>
            <p className="text-base font-bold text-emerald-900">You have been awarded</p>
            <p className="text-sm text-emerald-900/80 mt-1 leading-relaxed">
              Congratulations — your bid for <strong>{bid.tenderReference}</strong> has been awarded. The procurement
              team will be in touch about contract execution.
            </p>
          </div>
        </div>
      )}
      {bid.status !== 'AWARDED' && bid.status !== 'DRAFT' && (bid.tenderStatus === 'Awarded' || bid.tenderStatus === 'Tender Closed') && (
        <div className="rounded-3xl bg-slate-50 border border-slate-200 px-6 py-5 flex items-start gap-4">
          <div className="text-2xl">📄</div>
          <div>
            <p className="text-base font-bold text-slate-900">Awarded to another vendor</p>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">
              Thank you for participating in <strong>{bid.tenderReference}</strong>. After technical and commercial
              evaluation, the award was made to another vendor. We hope to see your bid on future opportunities.
            </p>
          </div>
        </div>
      )}

      {/* BUG-082 (2026-06-01): vendor's BoQ view-only — shows what they priced
            against each line of the tender BoQ. Hidden for legacy tenders without
            a real BoQ template or DRAFT bids that haven't priced yet. */}
      {boqTemplate.length > 0 && boqLines.length > 0 && (() => {
        const linesByItem = new Map(boqLines.map(l => [l.tenderBoqItemId, l]));
        let grandTotal = 0;
        const rendered = boqTemplate.map(t => {
          const line = linesByItem.get(t.id);
          const bidding = line?.status === 'BIDDING' && line.unitPrice != null;
          const lineTotal = bidding ? Number(line!.unitPrice) * Number(t.qty) : 0;
          if (bidding) grandTotal += lineTotal;
          return { t, line, bidding, lineTotal };
        });
        return (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-text-primary">Bill of Quantities</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
                    <th className="px-2 py-2 text-left w-20">Item</th>
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-right w-20">Qty</th>
                    <th className="px-2 py-2 text-left w-16">Unit</th>
                    <th className="px-2 py-2 text-center w-28">Status</th>
                    <th className="px-2 py-2 text-right w-28">Unit Price</th>
                    <th className="px-2 py-2 text-right w-28">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rendered.map(({ t, line, bidding, lineTotal }) => (
                    <tr key={t.id}>
                      <td className="px-2 py-2 font-mono text-xs">{t.itemNo}</td>
                      <td className="px-2 py-2">{t.description}</td>
                      <td className="px-2 py-2 font-mono text-right">{t.qty}</td>
                      <td className="px-2 py-2">{t.unit}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={
                          'inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ' +
                          (bidding
                            ? 'bg-success/10 text-success'
                            : line?.status === 'NOT_BIDDING'
                              ? 'bg-text-secondary/10 text-text-secondary'
                              : 'bg-danger/10 text-danger')
                        }>
                          {line?.status === 'BIDDING' ? 'Bidding' : line?.status === 'NOT_BIDDING' ? 'Not bidding' : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {bidding ? Number(line!.unitPrice).toFixed(3) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {bidding ? lineTotal.toFixed(3) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={6} className="px-2 py-2 text-right text-xs font-bold uppercase text-text-secondary">Grand total</td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-base text-text-primary">
                      {grandTotal.toFixed(3)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Migration 052 (2026-08-06): the commercial terms recorded with this
          bid. Always rendered once loaded — blank fields read as "—", which is
          itself information for the bidder. */}
      {terms && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-text-primary">Commercial Terms</h2>
          <CommercialTermsSummary terms={terms} />
        </div>
      )}

      {/* BUG-115 (2026-06-09): negotiation rounds — visible when this bid has
          at least one INVITED or SUBMITTED invitation. Returns null otherwise. */}
      {boqTemplate.length > 0 && (
        <NegotiationSection
          bidId={bid.id}
          tenderId={bid.tenderId}
          boqTemplate={boqTemplate}
          previousBoqLines={boqLines}
          previousTerms={terms}
        />
      )}

      {receipt && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-text-primary">Submission Receipt</h2>
          <ReceiptRow label="Receipt Number" value={receipt.receiptNumber} mono />
          <ReceiptRow label="Receipt Hash" value={receipt.receiptHash} mono />
          <ReceiptRow label="Submitted At" value={new Date(receipt.submittedAt).toLocaleString('en-GB')} />
          {docs.length > 0 && (
            <div className="border-t border-border pt-3 mt-2">
              <p className="text-[10px] font-bold uppercase text-text-secondary mb-2">Documents</p>
              <ul className="space-y-1 text-sm">
                {docs.map(d => (
                  <li key={d.documentId} className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary uppercase font-bold w-24">{d.envelopeType}</span>
                    <span className="text-text-primary">{d.filename}</span>
                    <code className="ml-auto text-[10px] text-text-secondary">{d.checksumSha256.slice(0, 16)}…</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const color =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-text-primary';
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className={`text-base font-bold mt-1 ${color}`}>{value}</p>
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
