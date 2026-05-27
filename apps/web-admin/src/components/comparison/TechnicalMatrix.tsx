'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Shield, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export interface MatrixCriterion {
  id: string;
  name: string;
  maxScore: number;
  weight: number | null;
  mandatory: boolean;
}

export interface MatrixVendor {
  bidId: string;
  vendorId: string;
  vendorName: string;
  consensusResult: 'PASS' | 'FAIL' | 'PENDING';
  consensusScore: number | null;
  consensusByCriterion: Array<{
    criterionId: string;
    consensusScore: number | null;
    evaluatorCount: number;
  }>;
}

interface Props {
  criteria: MatrixCriterion[];
  vendors: MatrixVendor[];
  totalMaxScore: number;
  passThreshold: number | null;
  selectedVendorId: string | null;
  onSelectVendor: (vendorId: string) => void;
}

type Layout = 'vendor-rows' | 'criterion-rows';

function fmtScore(v: number | null, max?: number) {
  if (v == null) return '—';
  const fmt = Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
  return max != null ? `${fmt} / ${max}` : fmt;
}

function resultBadge(result: 'PASS' | 'FAIL' | 'PENDING') {
  switch (result) {
    case 'PASS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-success/10 text-success">
          <CheckCircle2 className="w-3 h-3" />
          PASS
        </span>
      );
    case 'FAIL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-danger/10 text-danger">
          <AlertTriangle className="w-3 h-3" />
          FAIL
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-bg text-text-secondary border border-border">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      );
  }
}

/**
 * Phase B (BUG-036) — read-only matrix top section. Two layouts toggleable:
 *   vendor-rows    : vendors on Y, criteria on X (default)
 *   criterion-rows : criteria on Y, vendors on X
 * Each cell shows the consensus (average) per-criterion score. Click a row
 * header to bubble selection up so the per-vendor card below scrolls to view.
 */
export function TechnicalMatrix({
  criteria,
  vendors,
  totalMaxScore,
  passThreshold,
  selectedVendorId,
  onSelectVendor,
}: Props) {
  const [layout, setLayout] = useState<Layout>('vendor-rows');

  const scoreByPair = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const v of vendors) {
      for (const c of v.consensusByCriterion) {
        m.set(`${v.vendorId}|${c.criterionId}`, c.consensusScore);
      }
    }
    return m;
  }, [vendors]);

  if (criteria.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <p className="text-sm text-text-secondary">
          No technical criteria configured for this tender. Add criteria on the tender
          edit page before evaluations can be compared.
        </p>
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <p className="text-sm text-text-secondary">No bids submitted for this tender.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-bg">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Technical Comparison Matrix</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {vendors.length} bids · {criteria.length} criteria · consensus = average across evaluators
            {passThreshold != null && ` · pass threshold = ${passThreshold}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLayout(l => (l === 'vendor-rows' ? 'criterion-rows' : 'vendor-rows'))}
          className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
          title="Toggle layout"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          {layout === 'vendor-rows' ? 'Vendors as rows' : 'Criteria as rows'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg border-b border-border">
            {layout === 'vendor-rows' ? (
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary sticky left-0 bg-bg">
                  Vendor
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Result</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">
                  Total
                </th>
                {criteria.map(c => (
                  <th
                    key={c.id}
                    className="px-3 py-3 text-xs font-semibold text-text-secondary text-center min-w-[100px]"
                    title={`Max ${c.maxScore}${c.weight != null ? ` · weight ${c.weight}%` : ''}${c.mandatory ? ' · gated' : ''}`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {c.mandatory && <Shield className="w-3 h-3 text-amber-500" />}
                      <span className="truncate">{c.name}</span>
                    </div>
                    <span className="block text-[10px] text-text-secondary/60 font-medium mt-0.5">
                      max {c.maxScore}
                    </span>
                  </th>
                ))}
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary sticky left-0 bg-bg">
                  Criterion
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">
                  Max
                </th>
                {vendors.map(v => (
                  <th
                    key={v.vendorId}
                    className="px-3 py-3 text-xs font-semibold text-text-secondary text-center min-w-[120px]"
                  >
                    <button
                      onClick={() => onSelectVendor(v.vendorId)}
                      className={`truncate block w-full text-center hover:text-accent ${
                        selectedVendorId === v.vendorId ? 'text-accent' : ''
                      }`}
                      title={v.vendorName}
                    >
                      {v.vendorName}
                    </button>
                    <span className="block mt-0.5">{resultBadge(v.consensusResult)}</span>
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {layout === 'vendor-rows'
              ? vendors.map(v => {
                  const active = v.vendorId === selectedVendorId;
                  return (
                    <tr
                      key={v.vendorId}
                      className={`transition-colors ${active ? 'bg-accent/5' : 'hover:bg-bg/40'}`}
                    >
                      <td className="px-4 py-3 sticky left-0 bg-card">
                        <button
                          onClick={() => onSelectVendor(v.vendorId)}
                          className={`text-left font-semibold ${active ? 'text-accent' : 'text-text-primary hover:text-accent'}`}
                        >
                          {v.vendorName}
                        </button>
                      </td>
                      <td className="px-4 py-3">{resultBadge(v.consensusResult)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-text-primary">
                        {fmtScore(v.consensusScore, totalMaxScore || undefined)}
                      </td>
                      {criteria.map(c => {
                        const score = scoreByPair.get(`${v.vendorId}|${c.id}`) ?? null;
                        return (
                          <td
                            key={c.id}
                            className="px-3 py-3 text-center font-mono text-sm text-text-primary"
                          >
                            {fmtScore(score, c.maxScore)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              : criteria.map(c => (
                  <tr key={c.id} className="hover:bg-bg/40">
                    <td className="px-4 py-3 sticky left-0 bg-card">
                      <div className="flex items-center gap-1.5">
                        {c.mandatory && <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        <span className="font-semibold text-text-primary">{c.name}</span>
                      </div>
                      {c.weight != null && (
                        <p className="text-[10px] text-text-secondary mt-0.5">weight {c.weight}%</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-text-secondary">
                      {c.maxScore}
                    </td>
                    {vendors.map(v => {
                      const score = scoreByPair.get(`${v.vendorId}|${c.id}`) ?? null;
                      return (
                        <td
                          key={v.vendorId}
                          className="px-3 py-3 text-center font-mono text-sm text-text-primary"
                        >
                          {fmtScore(score, c.maxScore)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
