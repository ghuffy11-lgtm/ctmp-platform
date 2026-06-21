'use client';

// BUG-115 (2026-06-09): vendor-side negotiation surface. Lives under the BoQ
// view on /bids/[bidId]. Loads the vendor's open invitations + lists all
// rounds for this tender (read-only for SUBMITTED rounds; editable form for
// any open INVITED round on this bid).

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Upload, CheckCircle2, FileText, Eye, Download } from 'lucide-react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface BoqTemplateRow {
  id: string;
  itemNo: string;
  description: string;
  qty: number;
  unit: string;
}

interface PreviousBoqLine {
  tenderBoqItemId: string;
  status: 'BIDDING' | 'NOT_BIDDING';
  unitPrice: number | null;
}

// BUG-128 (2026-06-11): extended invitation DTO — now includes round close
// state + full submission data so we can render past rounds without
// hitting the admin-gated /tenders/:id/negotiation route.
interface SubmissionDto {
  id: string;
  submittedAt: string;
  totalPrice: number | null;
  currency: string;
  commercialPdfFilename: string;
  remarks: string | null;
  boqLines: Array<{
    tenderBoqItemId: string;
    status: 'BIDDING' | 'NOT_BIDDING';
    unitPrice: number | null;
  }>;
}

interface InvitationDto {
  id: string;
  status: 'INVITED' | 'SUBMITTED';
  invitedAt: string;
  bidId: string;
  tenderId: string;
  tenderReference: string;
  tenderTitle: string;
  roundNumber: number;
  roundLaunchedAt: string;
  roundLaunchReason: string;
  roundClosedAt: string | null;
  submission: SubmissionDto | null;
}

interface Props {
  bidId: string;
  tenderId: string;
  boqTemplate: BoqTemplateRow[];
  previousBoqLines: PreviousBoqLine[];
}

export function NegotiationSection({ bidId, tenderId, boqTemplate, previousBoqLines }: Props) {
  const [openInvitation, setOpenInvitation] = useState<InvitationDto | null>(null);
  // BUG-128 (2026-06-11): submittedInvitations replaces the prior rounds map.
  // Sourced from the vendor's own /vendor/negotiation/invitations response
  // (now extended to include closed rounds + submission data). No more
  // admin-gated /tenders/:id/negotiation call — it was returning 401 for
  // vendor JWTs and the 401 interceptor was force-logging-out the user
  // before this component's .catch could swallow the error.
  const [submittedInvitations, setSubmittedInvitations] = useState<InvitationDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const inv = await get<{ invitations: InvitationDto[] }>('/vendor/negotiation/invitations', token)
        .catch(() => ({ invitations: [] }));
      const mine = inv.invitations.filter(i => i.bidId === bidId);
      const open = mine.find(i => i.status === 'INVITED' && !i.roundClosedAt) ?? null;
      const submitted = mine
        .filter(i => i.submission != null)
        .sort((a, b) => a.roundNumber - b.roundNumber);
      setOpenInvitation(open);
      setSubmittedInvitations(submitted);
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm text-text-secondary flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading negotiation rounds…
        </p>
      </div>
    );
  }
  if (!openInvitation && submittedInvitations.length === 0) return null;

  return (
    <div className="bg-card border border-amber-200 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-amber-700" />
        Negotiation Rounds
      </h2>
      <p className="text-xs text-text-secondary">
        Procurement has invited you to revise your commercial offer. Your original bid is preserved
        forever and remains visible. Submit a new round below — there is no deadline.
      </p>

      {submittedInvitations.map(inv => (
        <SubmittedRoundCard key={inv.id} invitation={inv} boqTemplate={boqTemplate} />
      ))}

      {openInvitation && (
        <OpenInvitationForm
          invitation={openInvitation}
          tenderId={tenderId}
          boqTemplate={boqTemplate}
          previousBoqLines={previousBoqLines}
          onSubmitted={load}
        />
      )}
    </div>
  );
}

function SubmittedRoundCard({
  invitation,
  boqTemplate,
}: {
  invitation: InvitationDto;
  boqTemplate: BoqTemplateRow[];
}) {
  const submission = invitation.submission;
  if (!submission) return null;
  const qtyById = new Map(boqTemplate.map(t => [t.id, t.qty]));
  return (
    <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <CheckCircle2 className="w-4 h-4" />
          Round {invitation.roundNumber} — submitted
        </div>
        <div className="font-mono text-sm font-semibold text-emerald-900">
          {submission.totalPrice != null
            ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: submission.currency, maximumFractionDigits: 3 }).format(submission.totalPrice)
            : '—'}
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        Submitted {new Date(submission.submittedAt).toLocaleString('en-GB')}
      </p>
      {/* BUG-129 (2026-06-11): inline View + Download for the submitted PDF. */}
      <div className="flex items-center gap-2 text-xs">
        <FileText className="w-3 h-3 text-text-secondary" />
        <span className="text-text-secondary truncate flex-1" title={submission.commercialPdfFilename}>
          {submission.commercialPdfFilename}
        </span>
        <a
          href={`${API_BASE}/api/v1/tenders/${invitation.tenderId}/negotiation-submissions/${submission.id}/commercial-pdf/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-card text-text-primary border border-emerald-300 rounded hover:bg-emerald-100"
          title="View PDF"
          onClick={async (e) => {
            // Open with auth header by fetching as blob, since <a target="_blank">
            // alone can't send the Bearer token. Mirrors the admin pattern.
            e.preventDefault();
            try {
              const token = getAccessToken();
              const res = await fetch(
                `${API_BASE}/api/v1/tenders/${invitation.tenderId}/negotiation-submissions/${submission.id}/commercial-pdf/view`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} },
              );
              if (!res.ok) throw new Error(`Open failed: ${res.status}`);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank', 'noopener,noreferrer');
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Open failed');
            }
          }}
        >
          <Eye className="w-3 h-3" /> View
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              const token = getAccessToken();
              const res = await fetch(
                `${API_BASE}/api/v1/tenders/${invitation.tenderId}/negotiation-submissions/${submission.id}/commercial-pdf`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} },
              );
              if (!res.ok) throw new Error(`Download failed: ${res.status}`);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = submission.commercialPdfFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Download failed');
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-card text-text-primary border border-emerald-300 rounded hover:bg-emerald-100"
          title="Download PDF"
        >
          <Download className="w-3 h-3" /> Download
        </button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
          Per-line breakdown
        </summary>
        <table className="w-full mt-2 text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
              <th className="text-left py-1">Item</th>
              <th className="text-left py-1">Description</th>
              <th className="text-right py-1">Status</th>
              <th className="text-right py-1">Unit Price</th>
              <th className="text-right py-1">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {submission.boqLines.map(l => {
              const tpl = boqTemplate.find(t => t.id === l.tenderBoqItemId);
              const qty = qtyById.get(l.tenderBoqItemId) ?? 0;
              const lineTotal = l.status === 'BIDDING' && l.unitPrice != null
                ? Number(l.unitPrice) * Number(qty) : null;
              return (
                <tr key={l.tenderBoqItemId} className="border-t border-emerald-100">
                  <td className="py-1 font-mono">{tpl?.itemNo ?? '—'}</td>
                  <td className="py-1">{tpl?.description ?? '—'}</td>
                  <td className="py-1 text-right">{l.status}</td>
                  <td className="py-1 text-right font-mono">{l.unitPrice == null ? '—' : Number(l.unitPrice).toFixed(3)}</td>
                  <td className="py-1 text-right font-mono">{lineTotal == null ? '—' : lineTotal.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function OpenInvitationForm({
  invitation,
  tenderId,
  boqTemplate,
  previousBoqLines,
  onSubmitted,
}: {
  invitation: InvitationDto;
  tenderId: string;
  boqTemplate: BoqTemplateRow[];
  previousBoqLines: PreviousBoqLine[];
  onSubmitted: () => void;
}) {
  const prevByItem = new Map(previousBoqLines.map(l => [l.tenderBoqItemId, l]));

  const [lines, setLines] = useState(() =>
    boqTemplate.map(t => {
      const prev = prevByItem.get(t.id);
      return {
        tenderBoqItemId: t.id,
        status: (prev?.status ?? 'BIDDING') as 'BIDDING' | 'NOT_BIDDING',
        unitPriceText: prev?.unitPrice != null ? String(prev.unitPrice) : '',
      };
    }),
  );
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocId, setPdfDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((s, l) => {
    if (l.status !== 'BIDDING') return s;
    const p = parseFloat(l.unitPriceText);
    if (!isFinite(p)) return s;
    const qty = boqTemplate.find(t => t.id === l.tenderBoqItemId)?.qty ?? 0;
    return s + p * Number(qty);
  }, 0);

  const canSubmit = pdfDocId != null && !submitting && !uploading && lines.every(l =>
    l.status === 'NOT_BIDDING' || (l.status === 'BIDDING' && /^\d+(\.\d{1,3})?$/.test(l.unitPriceText)),
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!next) return;
    if (next.type !== 'application/pdf') {
      setError('Commercial document must be a PDF.');
      return;
    }
    setFile(next);
    setPdfDocId(null);
    setError(null);
    setUploading(true);
    try {
      const token = getAccessToken();
      const fd = new FormData();
      fd.append('file', next, next.name);
      const res = await fetch(`${API_BASE}/api/v1/tenders/${tenderId}/negotiation/upload-pdf`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? res.statusText);
      }
      const j = await res.json();
      setPdfDocId(j.documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${tenderId}/negotiation/submissions`,
        {
          invitationId: invitation.id,
          commercialPdfDocumentId: pdfDocId,
          remarks: remarks.trim() || undefined,
          boqLines: lines.map(l => ({
            tenderBoqItemId: l.tenderBoqItemId,
            status: l.status,
            unitPrice: l.status === 'BIDDING' ? parseFloat(l.unitPriceText) : undefined,
          })),
        },
        token,
      );
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-amber-300 bg-amber-50/60 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-amber-900">
          Round {invitation.roundNumber} — revise your commercial
        </div>
        <span className="text-[10px] uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-bold">
          Open
        </span>
      </div>
      <p className="text-xs text-amber-900/80 italic">
        {invitation.roundLaunchReason}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text-secondary">
              <th className="text-left py-1.5 w-20">Item</th>
              <th className="text-left py-1.5">Description</th>
              <th className="text-right py-1.5 w-16">Qty</th>
              <th className="text-center py-1.5 w-28">Status</th>
              <th className="text-right py-1.5 w-32">Unit Price</th>
              <th className="text-right py-1.5 w-28">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {boqTemplate.map(t => {
              const line = lines.find(l => l.tenderBoqItemId === t.id)!;
              const p = parseFloat(line.unitPriceText);
              const lineTotal = line.status === 'BIDDING' && isFinite(p) ? p * Number(t.qty) : null;
              return (
                <tr key={t.id}>
                  <td className="py-1.5 font-mono text-xs">{t.itemNo}</td>
                  <td className="py-1.5">{t.description}</td>
                  <td className="py-1.5 font-mono text-right">{t.qty}</td>
                  <td className="py-1.5 text-center">
                    <select
                      value={line.status}
                      onChange={e => {
                        const next = e.target.value as 'BIDDING' | 'NOT_BIDDING';
                        setLines(prev => prev.map(l =>
                          l.tenderBoqItemId === t.id
                            ? { ...l, status: next, unitPriceText: next === 'NOT_BIDDING' ? '' : l.unitPriceText }
                            : l,
                        ));
                      }}
                      // BUG-118 (2026-06-10): explicit text colour avoids
                      // white-on-white in dark/themed contexts.
                      className="text-xs px-2 py-1 border border-amber-300 bg-card text-text-primary rounded"
                    >
                      <option value="BIDDING" className="text-text-primary bg-card">Bidding</option>
                      <option value="NOT_BIDDING" className="text-text-primary bg-card">Not bidding</option>
                    </select>
                  </td>
                  <td className="py-1.5 text-right">
                    {line.status === 'BIDDING' ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.unitPriceText}
                        onChange={e => {
                          const v = e.target.value;
                          setLines(prev => prev.map(l =>
                            l.tenderBoqItemId === t.id ? { ...l, unitPriceText: v } : l,
                          ));
                        }}
                        placeholder="0.000"
                        className="w-28 text-right text-sm font-mono px-2 py-1 border border-amber-300 rounded bg-card"
                      />
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono text-sm">
                    {lineTotal == null ? '—' : lineTotal.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-amber-300">
              <td colSpan={5} className="py-2 text-right text-xs font-bold uppercase text-text-secondary">
                Round total
              </td>
              <td className="py-2 text-right font-mono font-bold text-base text-amber-900">
                {total.toFixed(3)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">
          Commercial PDF <span className="text-danger">*</span>
        </label>
        <label className="flex items-center gap-3 px-3 py-2 border border-dashed border-amber-300 bg-card rounded-lg cursor-pointer hover:bg-amber-50">
          <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} className="hidden" disabled={uploading || submitting} />
          {uploading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : pdfDocId
              ? <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              : <Upload className="w-4 h-4 text-text-secondary" />}
          <span className="text-sm">
            {uploading
              ? 'Uploading…'
              : pdfDocId && file
                ? <><strong>{file.name}</strong> uploaded · re-upload to replace</>
                : 'Click to select a PDF'}
          </span>
        </label>
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">
          Remarks (optional)
        </label>
        <textarea
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded bg-card"
        />
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-2 text-sm font-bold bg-amber-600 text-white rounded-lg hover:opacity-90 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <>Submit round {invitation.roundNumber}</>}
        </button>
      </div>
    </div>
  );
}
