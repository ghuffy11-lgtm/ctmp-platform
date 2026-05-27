'use client';

import { useEffect, useState } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, FileText, RefreshCw } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { get, post } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface EligibleBid {
  bidId: string;
  vendorId: string;
  vendorName: string;
  commercialTotal: number | null;
  currency: string;
  technicalResult: 'PASS' | 'FAIL' | 'PENDING';
}

interface Props {
  open: boolean;
  tenderId: string;
  currentVendorName?: string;
  onClose: () => void;
  onAmended: () => void;
}

interface CommercialComparisonResponse {
  vendors: EligibleBid[];
}

/**
 * Phase D (BUG-041). Post-Confirm correction. Creates a new Award row that
 * supersedes the active one via superseded_by_award_id (master plan F7).
 * Amendments are by definition an override — text + PDF always required.
 * Both rows remain visible forever in the audit trail.
 */
export function AmendAwardDialog({ open, tenderId, currentVendorName, onClose, onAmended }: Props) {
  const [eligible, setEligible] = useState<EligibleBid[]>([]);
  const [newBidId, setNewBidId] = useState<string>('');
  const [justification, setJustification] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocumentId, setPdfDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [amending, setAmending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewBidId('');
    setJustification('');
    setFile(null);
    setPdfDocumentId(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<CommercialComparisonResponse>(`/tenders/${tenderId}/comparison/commercial`, token);
        setEligible((res.vendors ?? []).filter(v => v.technicalResult === 'PASS'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load eligible bids');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tenderId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !amending && !uploading) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, amending, uploading, onClose]);

  if (!open) return null;

  const overrideMissingText = justification.trim().length < 100;
  const overrideMissingPdf = !pdfDocumentId;
  const canSubmit = !!newBidId && !overrideMissingText && !overrideMissingPdf && !amending && !uploading;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!next) return;
    if (next.type !== 'application/pdf') {
      setError('Justification must be a PDF.');
      return;
    }
    setFile(next);
    setPdfDocumentId(null);
    setError(null);
    setUploading(true);
    try {
      const token = getAccessToken();
      const fd = new FormData();
      fd.append('file', next, next.name);
      const res = await fetch(`${API_BASE}/api/v1/tenders/${tenderId}/award/justification-document`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? res.statusText);
      }
      const j = await res.json();
      setPdfDocumentId(j.documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleAmend() {
    setAmending(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${tenderId}/award/amend`,
        { newBidId, justificationText: justification.trim(), justificationDocumentId: pdfDocumentId },
        token,
      );
      onAmended();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Amend failed');
    } finally {
      setAmending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-base font-bold text-text-primary">Amend confirmed award</p>
              <p className="text-xs text-text-secondary">
                Current: {currentVendorName ?? '—'} · A new Award row will supersede the active one.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={amending || uploading}
            className="p-1.5 text-text-secondary hover:bg-bg rounded-lg disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-6 py-5 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-amber-900">
              Amending a confirmed award is HIGH-RISK and audit-logged at CRITICAL severity.
              The original award stays visible forever. Both written justification AND a PDF are required.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
              New awarded bid <span className="text-danger">*</span>
            </label>
            {loading ? (
              <p className="text-sm text-text-secondary flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading eligible bids…
              </p>
            ) : eligible.length === 0 ? (
              <p className="text-sm text-text-secondary">No PASS bids available for this tender.</p>
            ) : (
              <select
                value={newBidId}
                onChange={e => setNewBidId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Pick a PASS bid to award…</option>
                {eligible.map(b => (
                  <option key={b.bidId} value={b.bidId}>
                    {b.vendorName} · {b.commercialTotal != null
                      ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: b.currency, maximumFractionDigits: 3 }).format(b.commercialTotal)
                      : '—'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
              Reason for amendment <span className="text-danger">*</span>
            </label>
            <textarea
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Explain why the original award is being changed. Minimum 100 characters."
              rows={5}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
            <p className={`text-xs mt-1 ${justification.trim().length < 100 ? 'text-text-secondary' : 'text-success'}`}>
              {justification.trim().length} / 100 characters minimum
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
              Supporting PDF <span className="text-danger">*</span>
            </label>
            <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-bg/40 transition-colors">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading || amending}
              />
              {uploading ? (
                <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />
              ) : pdfDocumentId ? (
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              ) : (
                <Upload className="w-5 h-5 text-text-secondary flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                {uploading ? (
                  <p className="text-sm text-text-primary">Uploading…</p>
                ) : pdfDocumentId && file ? (
                  <>
                    <p className="text-sm font-semibold text-text-primary truncate flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-text-secondary" />
                      {file.name}
                    </p>
                    <p className="text-xs text-text-secondary">Uploaded — reference expires in 15 minutes.</p>
                  </>
                ) : (
                  <p className="text-sm text-text-primary">Click to select a PDF</p>
                )}
              </div>
            </label>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/30 rounded-lg px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-bg flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={amending || uploading}
            className="px-4 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-card disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAmend}
            disabled={!canSubmit}
            className="px-5 py-2 text-sm font-bold bg-amber-600 text-white rounded-lg hover:opacity-90 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {amending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              : <><RefreshCw className="w-4 h-4" /> Submit amendment</>}
          </button>
        </footer>
      </div>
    </div>
  );
}
