'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Clock, Eye, FileText, User } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';

export interface CardCriterion {
  id: string;
  name: string;
  maxScore: number;
  weight: number | null;
  mandatory: boolean;
}

export interface CardEvaluator {
  evaluationId: string;
  evaluatorName: string;
  result: 'PASS' | 'FAIL' | 'PENDING';
  overallScore: number | null;
  finalizedAt: string | null;
  comments: string | null;
  perCriterion: Array<{
    criterion: string;
    score: number;
    weight: number | null;
    maxScore: number | null;
    comments: string | null;
    inDefinedCriteria: boolean;
  }>;
}

export interface CardVendor {
  bidId: string;
  vendorId: string;
  vendorName: string;
  consensusResult: 'PASS' | 'FAIL' | 'PENDING';
  consensusFinalised: boolean;
  consensusScore: number | null;
  consensusByCriterion: Array<{
    criterionId: string;
    criterionName: string;
    maxScore: number;
    weight: number | null;
    mandatory: boolean;
    consensusScore: number | null;
    evaluatorCount: number;
  }>;
  evaluators: CardEvaluator[];
}

interface Props {
  vendor: CardVendor;
  criteria: CardCriterion[];
  totalMaxScore: number;
  initialExpanded?: boolean;
  highlight?: boolean;
}

function fmtScore(v: number | null, max?: number) {
  if (v == null) return '—';
  const fmt = Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
  return max != null ? `${fmt} / ${max}` : fmt;
}

// BUG-061 / WALK-032: scores in the DB are stored on a 0–100 (percentage)
// scale. The display historically passed those numbers as if they were
// absolute units, producing things like "83.3 / 30" when criteria summed to
// a smaller maxScore. Scale to absolute units against the supplied max.
function toAbsolute(normalised: number | null, max: number): number | null {
  if (normalised == null || max <= 0) return null;
  return (normalised / 100) * max;
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
 * Phase B (BUG-036) — per-vendor expandable card. Top row shows consensus +
 * official result; expanded view drills down per criterion and per evaluator.
 * Gated criteria (mandatory) are marked with a shield + amber accent when an
 * evaluator failed them.
 */
export function VendorTechnicalCard({ vendor, criteria, totalMaxScore, initialExpanded, highlight }: Props) {
  const [expanded, setExpanded] = useState(!!initialExpanded);
  const failed = vendor.consensusResult === 'FAIL';
  void criteria; // matrix uses the criteria list directly; card no longer needs it after WALK-029.

  // BUG-061 / WALK-031: surface every technical-envelope document for the
  // selected bid with a one-click open in the shared PDF viewer.
  type TechDoc = { id: string; filename: string; mimeType?: string };
  const [docs, setDocs] = useState<TechDoc[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const { openPdfViewer } = usePdfViewer();

  useEffect(() => {
    if (!expanded || docs !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<{ documents: TechDoc[] }>(
          `/bids/${vendor.bidId}/envelopes/TECHNICAL/documents`,
          token,
        );
        if (!cancelled) setDocs(res.documents ?? []);
      } catch (err) {
        if (!cancelled) setDocsError(err instanceof Error ? err.message : 'Failed to load documents');
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, docs, vendor.bidId]);

  async function handleViewDoc(doc: TechDoc) {
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(
        `${apiBase}/api/v1/bids/${vendor.bidId}/envelopes/TECHNICAL/documents/${doc.id}/view`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      openPdfViewer({ src: url, title: doc.filename, onClose: () => URL.revokeObjectURL(url) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open document');
    }
  }

  return (
    <div
      id={`vendor-${vendor.vendorId}`}
      className={`bg-card border rounded-xl overflow-hidden transition-shadow ${
        highlight
          ? 'border-accent shadow-lg shadow-accent/10'
          : failed
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
          <div className="min-w-0">
            <p className="font-semibold text-text-primary truncate">{vendor.vendorName}</p>
            <p className="text-xs text-text-secondary">
              {vendor.evaluators.length} evaluator{vendor.evaluators.length === 1 ? '' : 's'}
              {vendor.consensusFinalised ? ' · finalised' : ' · in progress'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {resultPill(vendor.consensusResult)}
          <span className="font-mono text-sm font-semibold text-text-primary">
            {fmtScore(toAbsolute(vendor.consensusScore, totalMaxScore), totalMaxScore || undefined)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-bg/40">
          {/* BUG-061 / WALK-031: technical envelope documents, one-click open in modal viewer. */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
              Technical proposal documents
            </h4>
            {docs === null && !docsError ? (
              <p className="text-xs text-text-secondary italic">Loading documents…</p>
            ) : docsError ? (
              <p className="text-xs text-danger">{docsError}</p>
            ) : (docs ?? []).length === 0 ? (
              <p className="text-xs text-text-secondary italic">No technical documents uploaded for this bid.</p>
            ) : (
              <ul className="space-y-2">
                {(docs ?? []).map(d => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-card rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                      <span className="text-sm text-text-primary truncate" title={d.filename}>{d.filename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewDoc(d)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded transition-colors flex-shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* BUG-061 / WALK-029: "Consensus per criterion" block removed entirely.
              The Technical Matrix (above this card) already carries that data. */}

          {/* BUG-061 / WALK-030: Evaluator breakdown slimmed — keep only the
              evaluator's recommendation (PASS/FAIL pill + overall score) and
              their notes. Per-criterion scores were redundant with the matrix. */}
          {vendor.evaluators.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-text-secondary border-t border-border">
              No evaluator has scored this bid yet.
            </div>
          ) : (
            <div className="px-5 py-4 border-t border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
                Evaluator breakdown
              </h4>
              <div className="space-y-3">
                {vendor.evaluators.map(ev => (
                  <div key={ev.evaluationId} className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                        <span className="text-sm font-semibold text-text-primary truncate">{ev.evaluatorName}</span>
                        {ev.finalizedAt && (
                          <span className="text-[10px] text-text-secondary">
                            · finalised {new Date(ev.finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {resultPill(ev.result)}
                        <span className="font-mono text-sm text-text-primary">
                          {fmtScore(toAbsolute(ev.overallScore, totalMaxScore), totalMaxScore || undefined)}
                        </span>
                      </div>
                    </div>
                    {ev.comments ? (
                      <div className="px-4 py-3 bg-bg/30">
                        <p className="font-semibold uppercase text-[10px] tracking-wider text-text-secondary mb-1">Notes</p>
                        <p className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">{ev.comments}</p>
                      </div>
                    ) : (
                      <p className="px-4 py-3 bg-bg/30 text-xs text-text-secondary italic">No notes recorded.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export the criterion shape so the matrix and the page share a single type.
export type { CardCriterion as ComparisonCriterion, CardVendor as ComparisonVendor, CardEvaluator as ComparisonEvaluator };
