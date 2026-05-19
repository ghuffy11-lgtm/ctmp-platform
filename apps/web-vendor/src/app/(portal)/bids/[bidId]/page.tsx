'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

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
