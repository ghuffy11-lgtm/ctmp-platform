'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, FileText, Download } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Loading, ErrorBanner } from '@/components/ui/Empty';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MessageBanner } from '@/components/ui/MessageBanner';
import { blockedStateForTender, vendorMessage } from '@/lib/vendor-messages';

interface TenderDetail {
  id: string;
  referenceNumber: string;
  title: string;
  description?: string;
  status: string;
  submissionDeadline: string | null;
  clarificationDeadline?: string | null;
  departmentName?: string;
  category?: string;
  estimatedBudget?: string | number | null;
  requirements?: string[];
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

  if (loading) return <Loading />;
  if (error || !tender) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <ErrorBanner message={error ?? 'Tender not found'} />
        <Link href="/tenders" className="inline-flex items-center gap-2 text-electric-500 hover:underline text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Tenders
        </Link>
      </div>
    );
  }

  const canBid = BID_ELIGIBLE_STATUSES.has(tender.status);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link
        href="/tenders"
        className="inline-flex items-center gap-2 text-electric-500 hover:text-electric-600 hover:underline text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tenders
      </Link>

      <GlassCard padding="xl">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm text-slate-900/55">{tender.referenceNumber}</div>
            <h1 className="heading-font text-3xl md:text-4xl font-semibold mt-2 tracking-tighter">
              {tender.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusBadge status={tender.status} />
              {tender.departmentName && (
                <span className="text-sm text-slate-900/65">{tender.departmentName}</span>
              )}
              {tender.category && (
                <span className="text-sm text-electric-600">· {tender.category}</span>
              )}
            </div>
          </div>
          {tender.estimatedBudget != null && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-900/55">Estimated Budget</div>
              <div className="text-3xl md:text-4xl font-semibold text-emerald-600 mt-1">
                {formatBudget(tender.estimatedBudget)}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-12">
          <div className="lg:col-span-2 space-y-10">
            {tender.description && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-3">Description</h3>
                <p className="text-slate-900/80 leading-relaxed whitespace-pre-wrap">{tender.description}</p>
              </section>
            )}

            {tender.requirements && tender.requirements.length > 0 && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-4">Key Requirements</h3>
                <ul className="space-y-3">
                  {tender.requirements.map((req, i) => (
                    <li key={i} className="flex gap-3 text-slate-900/80">
                      <Check className="w-5 h-5 text-electric-500 shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tender.documents && tender.documents.length > 0 && (
              <section>
                <h3 className="heading-font text-lg font-semibold mb-4">Tender Documents</h3>
                <div className="space-y-2">
                  {tender.documents.map(d => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/5 border border-slate-900/10 px-5 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-electric-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{d.filename}</div>
                          <div className="text-xs text-slate-900/55">
                            {(d.fileSize / 1024).toFixed(0)} KB · Uploaded {formatDate(d.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      <button className="btn-ghost px-4 py-2 rounded-2xl text-xs flex items-center gap-2">
                        <Download className="w-4 h-4" /> Download
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            {tender.submissionDeadline && (
              <DeadlineCard label="Submission Deadline" iso={tender.submissionDeadline} />
            )}
            {tender.clarificationDeadline && (
              <DeadlineCard label="Clarification Deadline" iso={tender.clarificationDeadline} />
            )}

            {canBid ? (
              <Link
                href={`/bids/wizard/${tender.id}`}
                className="btn-electric block text-center rounded-3xl py-5 text-base font-semibold tracking-wide"
              >
                START BID
              </Link>
            ) : (
              (() => {
                const state = blockedStateForTender(tender.status);
                return state ? (
                  <MessageBanner
                    message={vendorMessage(state, {
                      deadline: tender.submissionDeadline ?? undefined,
                      tenderRef: tender.referenceNumber,
                    })}
                  />
                ) : null;
              })()
            )}
            {tender.documents && tender.documents.length > 0 && (
              <button className="btn-ghost w-full rounded-3xl py-4 text-sm">
                Download All Documents
              </button>
            )}
          </aside>
        </div>
      </GlassCard>
    </div>
  );
}

function DeadlineCard({ label, iso }: { label: string; iso: string }) {
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const tone = days <= 3 ? 'text-rose-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="glass rounded-3xl p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-900/55">{label}</div>
      <div className="heading-font text-2xl font-semibold mt-2 tracking-tighter">
        {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className={`text-sm mt-1 ${tone}`}>
        {days > 0 ? `${days} day${days !== 1 ? 's' : ''} remaining` : days === 0 ? 'Today' : 'Passed'}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBudget(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'KWD',
    maximumFractionDigits: 0,
  }).format(n);
}
