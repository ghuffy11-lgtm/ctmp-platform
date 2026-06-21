'use client';

import { useEffect, useState } from 'react';
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, FileText, Award, Lock } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { post } from '@/lib/api';
import type { QuorumState } from './QuorumStatus';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface VendorRecap {
  bidId: string;
  vendorId: string;
  vendorName: string;
  commercialTotal: number | null;
  currency: string;
}

interface Props {
  open: boolean;
  tenderId: string;
  vendor: VendorRecap | null;
  isLowestPass: boolean;
  quorum: QuorumState | null;
  onClose: () => void;
  onConfirmed: () => void;
}

interface JustificationUploadResponse {
  documentId: string;
  filename: string;
  sha256: string;
  expiresInSeconds: number;
}

function fmtCurrency(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, maximumFractionDigits: 3,
  }).format(amount);
}

/**
 * Phase D (BUG-039 + BUG-040). The single source of truth for the Recommend →
 * Confirm flow:
 *   • Lowest-PASS pick = zero-friction Confirm (no text, no PDF) per F3.
 *   • Override = required text (min 20 chars per BUG-149) + optional PDF.
 *   • Notify-winner / notify-losers toggles default OFF per F6.
 *   • Confirm button disabled if quorum + Chair check failing per G4.
 *   • Override path uploads the PDF FIRST (returns documentId), then references
 *     it in POST /tenders/:id/award/confirm.
 */
export function AwardConfirmDialog({ open, tenderId, vendor, isLowestPass, quorum, onClose, onConfirmed }: Props) {
  const [justification, setJustification] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfDocumentId, setPdfDocumentId] = useState<string | null>(null);
  const [notifyWinner, setNotifyWinner] = useState(false);
  const [notifyLosers, setNotifyLosers] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens with a different vendor.
  useEffect(() => {
    if (!open) return;
    setJustification('');
    setFile(null);
    setPdfDocumentId(null);
    setNotifyWinner(false);
    setNotifyLosers(false);
    setError(null);
  }, [open, vendor?.bidId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirming && !uploading) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, confirming, uploading, onClose]);

  if (!open || !vendor) return null;

  const quorumBlocking = !!quorum && !quorum.hasQuorum;
  // BUG-149 (2026-06-21): owner reduced minimum override justification length
  // from 100 (DTO) / 50 (frontend mismatch) → 20 across the board. Now the
  // UI text + the DTO enforcement match.
  const overrideMissingText = !isLowestPass && justification.trim().length < 20;
  // BUG-095 (2026-06-02): PDF justification is now OPTIONAL per owner directive.
  // Text rationale is still required for override / FAIL awards.
  const canConfirm = !quorumBlocking && !overrideMissingText && !confirming && !uploading;

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
      const j = (await res.json()) as JustificationUploadResponse;
      setPdfDocumentId(j.documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!vendor) return;
    setConfirming(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${tenderId}/award/confirm`,
        {
          bidId: vendor.bidId,
          isLowest: isLowestPass,
          justificationText: isLowestPass ? undefined : justification.trim(),
          justificationDocumentId: isLowestPass ? undefined : pdfDocumentId,
          notifyWinner,
          notifyLosers,
        },
        token,
      );
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Award className={`w-5 h-5 ${isLowestPass ? 'text-success' : 'text-amber-500'} flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-base font-bold text-text-primary truncate">
                {isLowestPass ? 'Confirm award (lowest-PASS default)' : 'Confirm award (override)'}
              </p>
              <p className="text-xs text-text-secondary truncate">{vendor.vendorName} · {fmtCurrency(vendor.commercialTotal, vendor.currency)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={confirming || uploading}
            className="p-1.5 text-text-secondary hover:bg-bg rounded-lg disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-6 py-5 space-y-5">
          {/* Quorum status */}
          {quorum && !quorum.hasQuorum && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5 text-sm">
              <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900">Quorum not met — Confirm disabled</p>
                <p className="text-amber-800 text-xs mt-0.5">{quorum.reason}</p>
              </div>
            </div>
          )}

          {isLowestPass ? (
            <div className="bg-success/5 border border-success/20 rounded-lg px-4 py-3 flex items-start gap-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <p className="text-text-primary">
                This is the lowest commercial price among technically-PASS vendors. Click Confirm to
                award. No written justification or PDF required.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <p className="text-amber-900">
                  This vendor is NOT the lowest-PASS pick. Override requires written justification (min 20 chars). Attaching a supporting PDF is optional.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                  Written justification <span className="text-danger">*</span>
                </label>
                <textarea
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Explain why this vendor is being recommended over the lowest-PASS bid. Minimum 20 characters."
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                />
                <p className={`text-xs mt-1 ${justification.trim().length < 20 ? 'text-text-secondary' : 'text-success'}`}>
                  {justification.trim().length} / 20 characters minimum
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                  Justification PDF <span className="text-text-secondary">(optional)</span>
                </label>
                <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-bg/40 transition-colors">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploading || confirming}
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
                        <p className="text-xs text-text-secondary">Uploaded. Reference will expire in 15 minutes — Confirm soon.</p>
                      </>
                    ) : (
                      <p className="text-sm text-text-primary">Click to select a PDF</p>
                    )}
                  </div>
                </label>
              </div>
            </>
          )}

          {/* Notification opt-ins (master plan F6 — default OFF). */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
              Optional vendor notifications
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyWinner}
                  onChange={e => setNotifyWinner(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                  disabled={confirming || uploading}
                />
                Notify winning vendor ("You have been awarded")
              </label>
              <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyLosers}
                  onChange={e => setNotifyLosers(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                  disabled={confirming || uploading}
                />
                Notify losing vendors ("Awarded to another vendor")
              </label>
            </div>
            <p className="text-[11px] text-text-secondary mt-2 italic">
              Email dispatch happens in Phase E. Flags are recorded on the Award row now for replay.
            </p>
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
            disabled={confirming || uploading}
            className="px-4 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-card disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isLowestPass ? 'bg-success text-white hover:opacity-90' : 'bg-amber-600 text-white hover:opacity-90'
            }`}
          >
            {confirming
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
              : <><Award className="w-4 h-4" /> Confirm award</>}
          </button>
        </footer>
      </div>
    </div>
  );
}
