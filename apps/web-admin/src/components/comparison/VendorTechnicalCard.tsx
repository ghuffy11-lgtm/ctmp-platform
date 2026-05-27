'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Shield, CheckCircle2, AlertTriangle, Clock, User } from 'lucide-react';

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
            {fmtScore(vendor.consensusScore, totalMaxScore || undefined)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-bg/40">
          {vendor.consensusByCriterion.length > 0 && (
            <div className="px-5 py-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
                Consensus per criterion
              </h4>
              <ul className="space-y-2">
                {vendor.consensusByCriterion.map(c => (
                  <li key={c.criterionId} className="flex items-center justify-between gap-3 px-3 py-2 bg-card rounded-lg border border-border">
                    <div className="min-w-0 flex items-center gap-2">
                      {c.mandatory && <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                      <span className="text-sm font-semibold text-text-primary truncate">{c.criterionName}</span>
                      {c.weight != null && (
                        <span className="text-[10px] text-text-secondary">· weight {c.weight}%</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-text-secondary">
                        {c.evaluatorCount} eval{c.evaluatorCount === 1 ? '' : 's'}
                      </span>
                      <span className="font-mono text-sm font-semibold text-text-primary">
                        {fmtScore(c.consensusScore, c.maxScore)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vendor.evaluators.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-text-secondary">
              No evaluator has scored this bid yet.
            </div>
          ) : (
            <div className="px-5 py-4 border-t border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">
                Evaluator breakdown
              </h4>
              <div className="space-y-3">
                {vendor.evaluators.map(ev => (
                  <details key={ev.evaluationId} className="bg-card border border-border rounded-lg overflow-hidden">
                    <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3 hover:bg-bg/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {ev.evaluatorName}
                        </span>
                        {ev.finalizedAt && (
                          <span className="text-[10px] text-text-secondary">
                            · finalised {new Date(ev.finalizedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {resultPill(ev.result)}
                        <span className="font-mono text-sm text-text-primary">
                          {fmtScore(ev.overallScore, totalMaxScore || undefined)}
                        </span>
                      </div>
                    </summary>
                    <div className="px-4 py-3 border-t border-border bg-bg/30 space-y-3">
                      {ev.perCriterion.length === 0 ? (
                        <p className="text-xs text-text-secondary italic">
                          No per-criterion breakdown recorded.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {ev.perCriterion.map((p, i) => (
                            <li
                              key={`${ev.evaluationId}-${i}`}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className={`truncate ${p.inDefinedCriteria ? 'text-text-primary' : 'text-text-secondary italic'}`}>
                                {p.criterion}{!p.inDefinedCriteria && ' (not in current criteria)'}
                              </span>
                              <span className="font-mono text-text-primary flex-shrink-0">
                                {fmtScore(p.score, p.maxScore ?? undefined)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {ev.comments && (
                        <div className="text-xs text-text-secondary bg-card border border-border rounded p-2.5">
                          <p className="font-semibold uppercase text-[10px] tracking-wider mb-1">Notes</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{ev.comments}</p>
                        </div>
                      )}
                    </div>
                  </details>
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
