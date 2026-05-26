'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken, hasPermission } from '@/lib/auth';
import {
  Lock,
  Unlock,
  ArrowLeftRight,
  ChevronRight,
  Download,
  CheckCircle2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface ComparisonRow {
  bidId: string;
  vendorId: string;
  vendorCompany?: string;
  technicalResult: 'PASS';
  commercialEnvelopeStatus: 'SEALED' | 'OPENED' | 'LOCKED' | 'SUBMITTED' | 'DRAFT';
  commercialDetailsVisible: boolean;
  totalAmount?: number;
  currency?: string;
  rank?: number;
  technicalScore?: number;
}

interface CommercialAccess {
  canView: boolean;
  canDownload: boolean;
  canEvaluate: boolean;
  canExport: boolean;
}

interface CommercialComparisonResponse {
  tenderId: string;
  callerCommercialAccess: CommercialAccess;
  rows: ComparisonRow[];
}

const COMPARISON_STATUSES = ['Commercial Evaluation / Comparison', 'Award Recommendation'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount?: number, currency = 'USD') {
  if (typeof amount !== 'number') return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Permission gate ──────────────────────────────────────────────────────────

function NoAccessScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-4 text-center max-w-md mx-auto">
      <Lock className="w-[72px] h-[72px] text-text-secondary/30" />
      <h1 className="text-xl font-bold text-text-primary">Commercial Access Required</h1>
      <p className="text-sm text-text-secondary">
        Commercial Comparison requires the <code className="bg-bg px-1.5 py-0.5 rounded text-xs">commercial:view</code> permission.
        Separation of duties: System Administrators do not receive this automatically.
        Request access from your department head.
      </p>
      <Link href="/dashboard" className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90">
        Back to Dashboard
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommercialComparisonPage() {
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [hasViewPermission, setHasViewPermission] = useState(false);

  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const [comparison, setComparison] = useState<CommercialComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    const ok = !!token && hasPermission(token, 'commercial:view');
    setHasViewPermission(ok);
    setPermissionChecked(true);
  }, []);

  useEffect(() => {
    if (!hasViewPermission) return;
    async function fetchTenders() {
      setTendersLoading(true);
      try {
        const token = getAccessToken();
        const results = await Promise.all(
          COMPARISON_STATUSES.map(s =>
            get<PaginatedTenders>(
              `/tenders?status=${encodeURIComponent(s)}&pageSize=50`,
              token,
            ).catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
          ),
        );
        const merged = results.flatMap(r => r.data);
        setTenders(merged);
        if (merged.length > 0) setSelectedTenderId(merged[0].id);
      } finally {
        setTendersLoading(false);
      }
    }
    fetchTenders();
  }, [hasViewPermission]);

  const fetchComparison = useCallback(async (tenderId: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await get<CommercialComparisonResponse>(
        `/tenders/${tenderId}/commercial-comparison`,
        token,
      );
      setComparison(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) fetchComparison(selectedTenderId);
  }, [selectedTenderId, fetchComparison]);

  async function handleSavePrice(bidId: string) {
    const raw = priceInputs[bidId];
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price < 0) {
      setError('Enter a valid positive price.');
      return;
    }
    setSavingPrice(bidId);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/bids/${bidId}/commercial-evaluations`, { totalPrice: price }, token);
      if (selectedTenderId) await fetchComparison(selectedTenderId);
      setPriceInputs((prev) => ({ ...prev, [bidId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save price');
    } finally {
      setSavingPrice(null);
    }
  }

  async function handleRecommendAward(bidId: string, _vendorId: string) {
    if (!selectedTenderId) return;
    const justification = prompt('Justification for award recommendation:');
    if (!justification) return;
    try {
      const token = getAccessToken();
      await post(
        `/tenders/${selectedTenderId}/award-recommendation`,
        { recommendedBidId: bidId, justification },
        token,
      );
      alert('Award recommendation submitted. Approval task added to Approvals queue.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to recommend');
    }
  }

  async function handleExport() {
    if (!selectedTenderId) return;
    setExporting(true);
    try {
      const token = getAccessToken();
      await post(`/reports/commercial_comparison/export`, { format: 'XLSX', tenderId: selectedTenderId }, token);
      alert('Export job enqueued. Track progress in Reports.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  }

  if (!permissionChecked) return null;
  if (!hasViewPermission) return <NoAccessScreen />;

  const selectedTender = tenders.find(t => t.id === selectedTenderId) ?? null;
  const access = comparison?.callerCommercialAccess;
  const sortedRows = [...(comparison?.rows ?? [])].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    return (a.totalAmount ?? Infinity) - (b.totalAmount ?? Infinity);
  });

  return (
    <div className="flex h-full overflow-hidden -m-8">
      {/* Tender list */}
      <div className="w-72 flex-shrink-0 border-r border-border bg-bg flex flex-col">
        <div className="p-4 border-b border-border bg-card">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Comparison Ready
          </p>
          <p className="text-xs text-text-secondary mt-0.5">{tenders.length} tenders</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tendersLoading ? (
            <div className="p-4 text-xs text-text-secondary">Loading…</div>
          ) : tenders.length === 0 ? (
            <div className="p-6 text-center">
              <ArrowLeftRight className="w-10 h-10 text-text-secondary/20 mx-auto mb-2" />
              <p className="text-xs text-text-secondary">No tenders in commercial comparison.</p>
            </div>
          ) : (
            tenders.map(t => {
              const isSel = t.id === selectedTenderId;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTenderId(t.id)}
                  className={`p-4 border-b border-border cursor-pointer transition-all ${
                    isSel ? 'bg-card border-l-4 border-l-accent' : 'border-l-4 border-l-transparent hover:bg-card/70'
                  }`}
                >
                  <p className={`text-xs font-bold mb-1 ${isSel ? 'text-accent' : 'text-text-secondary'}`}>
                    {t.referenceNumber}
                  </p>
                  <p className={`text-sm font-semibold leading-snug ${isSel ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {t.title}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedTender ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <ArrowLeftRight className="w-14 h-14 text-text-secondary/20" />
            <p className="text-sm text-text-secondary">Select a tender to compare commercial offers.</p>
          </div>
        ) : (
          <div className="p-6 max-w-6xl mx-auto space-y-5">
            <nav className="flex items-center gap-1 text-xs text-text-secondary">
              <Link href="/tenders" className="hover:text-accent">Tenders</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link href={`/tenders/${selectedTender.id}`} className="hover:text-accent">{selectedTender.referenceNumber}</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-text-primary font-medium">Commercial Comparison</span>
            </nav>

            <div className="flex items-end justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight">Commercial Comparison</h1>
                <p className="text-sm text-text-secondary mt-1">{selectedTender.title}</p>
              </div>
              <div className="flex gap-2">
                {access?.canExport && (
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card flex items-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {exporting ? 'Exporting…' : 'Export Comparison'}
                  </button>
                )}
              </div>
            </div>

            {/* Permission chips */}
            {access && (
              <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap gap-2">
                {([
                  ['canView', 'commercial:view'],
                  ['canDownload', 'commercial:download'],
                  ['canEvaluate', 'commercial:evaluate'],
                  ['canExport', 'commercial:export'],
                ] as [keyof CommercialAccess, string][]).map(([key, label]) => (
                  <span
                    key={key}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide flex items-center gap-1 ${
                      access[key] ? 'bg-success/10 text-success' : 'bg-border text-text-secondary/60'
                    }`}
                  >
                    {access[key]
                      ? <CheckCircle2 className="w-3 h-3" />
                      : <Lock className="w-3 h-3" />}
                    {label}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
            )}

            {/* Comparison table */}
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-bg border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary w-16">Rank</th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Vendor</th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Technical</th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Envelope</th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">Total Bid</th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr><td colSpan={6} className="px-5 py-8 text-center text-text-secondary">Loading…</td></tr>
                    ) : sortedRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-8 text-center text-text-secondary">No qualified bids.</td></tr>
                    ) : (
                      sortedRows.map((row, idx) => {
                        const rank = row.rank ?? idx + 1;
                        return (
                          <tr key={row.bidId} className="hover:bg-bg/60">
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${
                                rank === 1 ? 'bg-accent text-white' : 'bg-bg text-text-primary border border-border'
                              }`}>
                                {rank}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-semibold text-text-primary">
                              {row.vendorCompany ?? row.vendorId.slice(0, 8)}
                            </td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-success/10 text-success">
                                {row.technicalResult}
                              </span>
                            </td>
                            <td className="px-5 py-4 flex items-center gap-1.5 text-text-secondary">
                              {row.commercialEnvelopeStatus === 'OPENED'
                                ? <Unlock className="w-4 h-4" />
                                : <Lock className="w-4 h-4" />}
                              {row.commercialEnvelopeStatus}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-text-primary">
                              {row.totalAmount !== undefined && row.totalAmount !== null
                                ? (row.commercialDetailsVisible
                                    ? formatCurrency(row.totalAmount, row.currency)
                                    : <span className="text-text-secondary/50 italic font-sans font-normal">hidden</span>)
                                : row.commercialEnvelopeStatus === 'OPENED' && row.commercialDetailsVisible
                                  ? (
                                    <div className="flex items-center gap-2 justify-end">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={priceInputs[row.bidId] ?? ''}
                                        onChange={(e) => setPriceInputs((prev) => ({ ...prev, [row.bidId]: e.target.value }))}
                                        placeholder="0.00"
                                        className="w-28 px-2 py-1 border border-border rounded text-sm font-mono text-right"
                                      />
                                      <button
                                        onClick={() => handleSavePrice(row.bidId)}
                                        disabled={savingPrice === row.bidId}
                                        className="px-2 py-1 bg-accent text-white text-xs font-bold rounded disabled:opacity-50"
                                      >
                                        {savingPrice === row.bidId ? '…' : 'Save'}
                                      </button>
                                    </div>
                                  )
                                  : <span className="text-text-secondary/50 italic font-sans font-normal">pending</span>}
                            </td>
                            <td className="px-5 py-4 text-center">
                              {rank === 1 && (
                                <button
                                  onClick={() => handleRecommendAward(row.bidId, row.vendorId)}
                                  className="px-3 py-1.5 bg-success/10 text-success rounded-lg text-xs font-bold hover:bg-success/20 transition-colors"
                                >
                                  Recommend Award
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900">
              <p className="font-bold mb-1">⚠ Sensitive commercial data</p>
              <p>
                All views, downloads, and exports are audit-logged. Commercial details remain hidden for any row where you lack <code>commercial:view</code> at the per-bid level.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
