'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface TenderDetail {
  id: string;
  referenceNumber: string;
  title: string;
  description?: string;
  status: string;
  submissionDeadline: string | null;
  clarificationDeadline?: string | null;
  departmentName?: string;
  documents?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    uploadedAt: string;
  }>;
}

const BID_ELIGIBLE_STATUSES = new Set(['Published', 'Clarification Period']);

export default function VendorTenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const res = await get<TenderDetail>(`/tenders/${id}`, token);
        setTender(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tender');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-sm text-text-secondary">Loading…</div>;
  if (error || !tender) {
    return (
      <div className="p-8 max-w-md mx-auto bg-card border border-danger/30 rounded-xl text-center">
        <p className="text-sm text-danger">{error ?? 'Tender not found'}</p>
        <Link href="/tenders" className="inline-block mt-3 text-sm text-accent hover:underline">Back to tenders</Link>
      </div>
    );
  }

  const canBid = BID_ELIGIBLE_STATUSES.has(tender.status);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <nav className="text-xs text-text-secondary flex items-center gap-1">
        <Link href="/tenders" className="hover:text-accent">Tenders</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-text-primary font-medium">{tender.referenceNumber}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{tender.title}</h1>
          <p className="text-sm text-text-secondary mt-0.5 font-mono">{tender.referenceNumber}</p>
        </div>
        <StatusBadge status={tender.status} />
      </div>

      {tender.description && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-bold text-text-primary mb-2">Description</h2>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{tender.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tender.submissionDeadline && (
          <DeadlineCard label="Submission Deadline" iso={tender.submissionDeadline} />
        )}
        {tender.clarificationDeadline && (
          <DeadlineCard label="Clarification Deadline" iso={tender.clarificationDeadline} />
        )}
        {tender.departmentName && (
          <Card label="Department" value={tender.departmentName} />
        )}
      </div>

      {tender.documents && tender.documents.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-bg">
            <p className="text-sm font-bold text-text-primary">Tender Documents</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-bg/40">
              <tr>
                <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Filename</th>
                <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Size</th>
                <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-text-secondary">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tender.documents.map(d => (
                <tr key={d.id} className="hover:bg-bg/40">
                  <td className="px-5 py-2.5 text-text-primary font-semibold">{d.filename}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{Math.round(d.fileSize / 1024)} KB</td>
                  <td className="px-5 py-2.5 text-text-secondary text-xs">
                    {new Date(d.uploadedAt).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canBid && (
        <div className="bg-accent/5 border border-accent rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-accent">Ready to bid?</p>
            <p className="text-xs text-text-secondary mt-1">
              Start the bid wizard to upload your technical and commercial envelopes.
            </p>
          </div>
          <Link
            href={`/bids/wizard/${tender.id}`}
            className="px-5 py-2 bg-accent text-white rounded-lg font-bold hover:opacity-90"
          >
            Start Bid →
          </Link>
        </div>
      )}
      {!canBid && (
        <div className="bg-bg border border-border rounded-xl p-4 text-sm text-text-secondary">
          Bidding is only available while the tender is in <code>Published</code> or <code>Clarification Period</code>.
          Current status: <strong>{tender.status}</strong>.
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="text-sm font-bold text-text-primary mt-1">{value}</p>
    </div>
  );
}

function DeadlineCard({ label, iso }: { label: string; iso: string }) {
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="text-sm font-bold text-text-primary mt-1">
        {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      <p className={`text-xs mt-0.5 ${days <= 3 ? 'text-danger' : 'text-text-secondary'}`}>
        {days > 0 ? `${days} day${days !== 1 ? 's' : ''} remaining` : days === 0 ? 'Today' : 'Passed'}
      </p>
    </div>
  );
}
