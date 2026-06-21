'use client';

// BUG-090 (2026-06-02) — Awarded Tenders archive (read-only).
//
// Modeled on /commercial-comparison. Owner asked for a dedicated surface for
// senior reviewers (Executive, Auditor, Procurement Admin) to browse past
// procurement decisions with all artefacts (overview / award / technical /
// commercial / BoQ / documents / audit). Zero edit affordances anywhere on
// this page.
//
// All endpoints are existing — no backend additions beyond the list-tenders
// filter extension in this same bundle.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award as AwardIcon,
  AlertCircle,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileText,
  History,
  Info,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Wallet,
} from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AwardSummaryCard, type AwardSummary } from '@/components/comparison/AwardSummaryCard';
import { TechnicalMatrix, type MatrixCriterion, type MatrixVendor } from '@/components/comparison/TechnicalMatrix';
import { VendorTechnicalCard, type ComparisonCriterion, type ComparisonVendor } from '@/components/comparison/VendorTechnicalCard';
import { CommercialMatrix } from '@/components/comparison/CommercialMatrix';
import { VendorComparisonCard } from '@/components/comparison/VendorComparisonCard';
import { TenderBoqEditor } from '@/components/TenderBoqEditor';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';

const ARCHIVE_STATUSES = ['Awarded', 'Tender Closed'] as const;
type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

interface TenderListItem {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  departmentName?: string;
  departmentId?: string;
  category?: string | null;
  awardedAt?: string | null;
  awardedAmount?: number | null;
}

interface PaginatedTenders {
  data: TenderListItem[];
}

interface Department {
  id: string;
  name: string;
  code: string;
}

// Same shape we already pull on /commercial-comparison.
interface CommercialComparisonResponse {
  tender: {
    id: string;
    referenceNumber: string;
    title: string;
    status: string;
    departmentName: string | null;
    departmentCode: string | null;
    currency: string;
    estimatedBudget: number | null;
  };
  summary: {
    bidCount: number;
    passCount: number;
    failCount: number;
    pendingCount: number;
    priceCount: number;
    auditViewCount: number;
  };
  lowestPassBidId: string | null;
  vendors: unknown[];
  award: AwardSummary | null;
  boqTemplate: Array<{ id: string; itemNo: string; description: string; qty: number; unit: string }>;
}

interface TechnicalComparisonResponse {
  tender: { technicalPassThreshold: number | null };
  criteria: ComparisonCriterion[];
  totalMaxScore: number;
  vendors: ComparisonVendor[];
}

interface TenderDetail {
  id: string;
  referenceNumber: string;
  title: string;
  description?: string;
  category?: string | null;
  procurementType?: string | null;
  estimatedBudget?: number | null;
  awardedAmount?: number | null;
  awardedAt?: string | null;
  awardedVendorName?: string | null;
  submissionDeadline?: string | null;
  clarificationDeadline?: string | null;
  departmentName?: string | null;
  status: string;
  currency?: string;
  documents?: Array<{ id: string; filename: string; mimeType: string; fileSize: number; uploadedAt: string }>;
}

interface BidLite {
  id: string;
  vendorId: string;
  vendorName: string;
  status: string;
  technicalResult?: string;
}

// BUG-094 (2026-06-02): backend returns `eventTime` and `actorName` — earlier
// shape used `occurredAt` + `actorDisplayName` so the timeline showed em-dashes.
interface AuditEntry {
  id: string;
  eventType: string;
  eventTime: string;
  actorName?: string;
  actorUserId?: string;
  riskLevel?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}

type TabId = 'overview' | 'award' | 'technical' | 'commercial' | 'boq' | 'documents' | 'audit';

// BUG-096 (2026-06-03): owner wants Technical to sit right after Commercial
// ("Technical score I asked you to move it up just below commercial
// comparison"). Tab order now: Overview · Award · Commercial · Technical · BoQ
// · Documents · Audit.
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'award', label: 'Award', icon: AwardIcon },
  { id: 'commercial', label: 'Commercial', icon: Wallet },
  { id: 'technical', label: 'Technical', icon: ClipboardList },
  { id: 'boq', label: 'BoQ', icon: Package },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'audit', label: 'Audit Trail', icon: History },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB');
}
function fmtKwd(v?: number | null): string {
  if (v == null) return '—';
  return `${v.toLocaleString('en-GB', { maximumFractionDigits: 3 })} KWD`;
}

// BUG-094 (2026-06-02): the archive page renders existing components
// (VendorComparisonCard, CommercialMatrix) that assume several array fields
// always exist. When the backend's bid has no evaluations / no BoQ entries the
// response can omit some — null-safely fill so the components don't crash with
// "Cannot read properties of undefined (reading 'map')".
function safeVendor(v: any) {
  return {
    ...v,
    vendor: v?.vendor ?? { companyName: v?.vendorName ?? '—', status: 'UNKNOWN', country: null },
    commentsByEvaluator: Array.isArray(v?.commentsByEvaluator) ? v.commentsByEvaluator : [],
    boqLines: Array.isArray(v?.boqLines) ? v.boqLines : [],
    commercialDocuments: Array.isArray(v?.commercialDocuments) ? v.commercialDocuments : [],
    currency: v?.currency ?? 'KWD',
    technicalResult: v?.technicalResult ?? 'PENDING',
  };
}

function AwardedTendersContent() {
  // BUG-092 (2026-06-02): no URL persistence + no auto-select. Owner walked the
  // first version and reported the page kept showing the last-viewed tender
  // even after changing filters; flow should be "set filters → press Search →
  // pick a result → see detail." Filter state is plain component state; the
  // picker stays empty until the user clicks Search.

  // Draft filter state (what the form holds before Search is pressed).
  const [statusFilter, setStatusFilter] = useState<'Both' | ArchiveStatus>('Both');
  const [deptFilter, setDeptFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [awardedFrom, setAwardedFrom] = useState('');
  const [awardedTo, setAwardedTo] = useState('');
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);

  // Applied filter state (snapshot taken when Search is pressed — what
  // actually drives the fetch). null until the first Search click.
  interface AppliedFilters {
    statusFilter: 'Both' | ArchiveStatus;
    deptFilter: string;
    categoryFilter: string;
    awardedFrom: string;
    awardedTo: string;
    search: string;
  }
  const [applied, setApplied] = useState<AppliedFilters | null>(null);

  // Picker.
  const [tenders, setTenders] = useState<TenderListItem[]>([]);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  // Selected-tender data.
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [commercial, setCommercial] = useState<CommercialComparisonResponse | null>(null);
  const [technical, setTechnical] = useState<TechnicalComparisonResponse | null>(null);
  const [bids, setBids] = useState<BidLite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  // BUG-096 (2026-06-03): surface per-tab fetch errors so blank tabs explain
  // themselves (e.g. 403 from missing permission).
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openPdfViewer } = usePdfViewer();

  // Load departments once for the dropdown.
  useEffect(() => {
    const token = getAccessToken();
    get<{ data: Department[] }>('/departments?pageSize=100', token)
      .then(r => setDepartments(r.data ?? []))
      .catch(() => setDepartments([]));
  }, []);

  // Fetch awarded tender list — uses APPLIED filters, not draft, so only the
  // Search click triggers a network call.
  const fetchTenders = useCallback(async (filters: AppliedFilters) => {
    setTendersLoading(true);
    const token = getAccessToken();
    const statuses: ArchiveStatus[] =
      filters.statusFilter === 'Both' ? [...ARCHIVE_STATUSES] : [filters.statusFilter];
    try {
      const buildQuery = (status: ArchiveStatus) => {
        const params = new URLSearchParams();
        params.set('status', status);
        params.set('pageSize', '200');
        if (filters.deptFilter) params.set('departmentId', filters.deptFilter);
        if (filters.categoryFilter) params.set('category', filters.categoryFilter);
        if (filters.awardedFrom) params.set('awardedFrom', filters.awardedFrom);
        if (filters.awardedTo) params.set('awardedTo', filters.awardedTo);
        if (filters.search.trim()) params.set('search', filters.search.trim());
        return params.toString();
      };
      const results = await Promise.all(
        statuses.map(s =>
          get<PaginatedTenders>(`/tenders?${buildQuery(s)}`, token).catch(
            () => ({ data: [] }) as PaginatedTenders,
          ),
        ),
      );
      const merged = results
        .flatMap(r => r.data)
        .sort((a, b) => (b.awardedAt ?? '').localeCompare(a.awardedAt ?? ''));
      setTenders(merged);
    } finally {
      setTendersLoading(false);
    }
  }, []);

  // Re-fetch only when the user explicitly applies filters.
  useEffect(() => {
    if (applied) fetchTenders(applied);
  }, [applied, fetchTenders]);

  function handleSearch() {
    // Clear any prior selection so the panel doesn't keep an outdated tender
    // visible after the result set changes.
    setSelectedTenderId(null);
    setApplied({
      statusFilter, deptFilter, categoryFilter,
      awardedFrom, awardedTo, search,
    });
  }
  function handleReset() {
    setStatusFilter('Both');
    setDeptFilter('');
    setCategoryFilter('');
    setAwardedFrom('');
    setAwardedTo('');
    setSearch('');
    setApplied(null);
    setSelectedTenderId(null);
    setTenders([]);
  }

  // When user picks a tender → fetch all surfaces. No URL persistence (BUG-092):
  // owner wanted the page to start blank every visit, not carry a stale
  // selection across navigations.
  useEffect(() => {
    if (!selectedTenderId) {
      setDetail(null); setCommercial(null); setTechnical(null); setBids([]); setAuditLogs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setError(null);
      setCommercialError(null);
      setTechnicalError(null);
      const token = getAccessToken();
      try {
        const [tenderRes, commRes, techRes, bidsRes, auditRes] = await Promise.all([
          get<TenderDetail>(`/tenders/${selectedTenderId}`, token),
          // BUG-113 (2026-06-08): switched from the LEGACY
          // `/tenders/:id/commercial-comparison` (CommercialEvaluationController,
          // returns `{ tenderId, callerCommercialAccess, rows }`) to the
          // ComparisonController endpoint that returns the full shape with
          // `award`, `vendors`, `boqTemplate`, `lowestPassBidId` — the fields
          // this page's Award + Commercial tabs render. The old endpoint
          // also gated on `commercial:view`, while the new one requires
          // `comparison:commercial:view` — PROCUREMENT_ADMIN / EXECUTIVE /
          // COMMERCIAL_* roles already have it (verified via DB grants).
          get<CommercialComparisonResponse>(`/tenders/${selectedTenderId}/comparison/commercial`, token).catch(err => {
            if (!cancelled) setCommercialError(err instanceof Error ? err.message : 'Commercial comparison fetch failed');
            return null;
          }),
          get<TechnicalComparisonResponse>(`/tenders/${selectedTenderId}/comparison/technical`, token).catch(err => {
            if (!cancelled) setTechnicalError(err instanceof Error ? err.message : 'Technical comparison fetch failed');
            return null;
          }),
          get<{ items: BidLite[] }>(`/tenders/${selectedTenderId}/bids?pageSize=100`, token).catch(() => ({ items: [] })),
          get<{ items: AuditEntry[] }>(`/tenders/${selectedTenderId}/audit-logs?pageSize=200`, token).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setDetail(tenderRes);
        setCommercial(commRes);
        setTechnical(techRes);
        setBids(bidsRes.items ?? []);
        setAuditLogs(auditRes.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tender');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenderId]);

  // Categories — derive from the picker results (the union of categories
  // present in awarded tenders so the dropdown stays relevant to the surface).
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    tenders.forEach(t => { if (t.category) set.add(t.category); });
    return Array.from(set).sort();
  }, [tenders]);

  async function handleViewPdf(url: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      openPdfViewer({ src: blobUrl, title: filename, onClose: () => URL.revokeObjectURL(blobUrl) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open document');
    }
  }
  async function handleDownloadPdf(url: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  const techMatrixCriteria: MatrixCriterion[] = (technical?.criteria ?? []).map(c => ({
    id: c.id, name: c.name, maxScore: c.maxScore, weight: c.weight, mandatory: c.mandatory,
  }));
  const techMatrixVendors: MatrixVendor[] = (technical?.vendors ?? []).map(v => ({
    bidId: v.bidId, vendorId: v.vendorId, vendorName: v.vendorName,
    consensusResult: v.consensusResult, consensusScore: v.consensusScore,
    consensusByCriterion: v.consensusByCriterion.map(c => ({
      criterionId: c.criterionId, consensusScore: c.consensusScore, evaluatorCount: c.evaluatorCount,
    })),
  }));
  const winnerVendorId = commercial?.award?.winnerVendorId ?? null;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Link href="/dashboard" className="hover:text-accent transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">Awarded Tenders</span>
      </nav>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <AwardIcon className="w-6 h-6 text-accent" />
            Awarded Tenders
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Read-only archive of past procurement decisions. Every artefact stays available for review and audit.
          </p>
        </div>
      </div>

      {/* Filter bar — owner directive (BUG-092): no auto-fetch. Set filters,
           click Search to apply. Reset clears everything. */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <form
          onSubmit={e => { e.preventDefault(); handleSearch(); }}
          className="grid grid-cols-1 md:grid-cols-6 gap-3 text-sm"
        >
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'Both' | ArchiveStatus)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="Both">Both</option>
              {ARCHIVE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Department</label>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">All categories</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Awarded from</label>
            <input
              type="date"
              value={awardedFrom}
              onChange={e => setAwardedFrom(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Awarded to</label>
            <input
              type="date"
              value={awardedTo}
              onChange={e => setAwardedTo(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Reference or title"
              className="w-full px-3 py-2 border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </form>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleSearch}
            className="px-5 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-accent-hover flex items-center gap-1.5 shadow-sm"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
      </div>

      {/* Picker — only renders after the user has clicked Search at least once. */}
      {applied && (
        <div className="bg-card border border-border rounded-xl px-5 py-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            Tender ({tenders.length} match{tenders.length === 1 ? '' : 'es'})
          </label>
          {tendersLoading ? (
            <p className="text-sm text-text-secondary flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </p>
          ) : tenders.length === 0 ? (
            <p className="text-sm text-text-secondary">No awarded tenders match the filters you set. Adjust the filters and click Search again.</p>
          ) : (
            <select
              value={selectedTenderId ?? ''}
              onChange={e => setSelectedTenderId(e.target.value || null)}
              className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select a tender…</option>
              {tenders.map(t => (
                <option key={t.id} value={t.id}>
                  {t.referenceNumber} — {t.title} ({t.status})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {!applied && (
        <div className="bg-bg/40 border border-dashed border-border rounded-xl px-5 py-8 text-center text-sm text-text-secondary">
          Set filters above and click <strong>Search</strong> to browse the archive.
        </div>
      )}

      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-5 py-3 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Detail */}
      {detailLoading && !detail && (
        <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading tender artefacts…
        </div>
      )}

      {detail && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl px-5 py-4 flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <p className="text-xs font-mono text-text-secondary">{detail.referenceNumber}</p>
              <h2 className="text-lg font-bold text-text-primary truncate flex items-center gap-3 mt-0.5">
                {detail.title}
                <StatusBadge status={detail.status} />
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                {detail.departmentName ?? 'Department —'}
                {detail.category ? ` · ${detail.category}` : ''}
                {detail.awardedAt ? ` · Awarded ${fmtDate(detail.awardedAt)}` : ''}
                {detail.awardedAmount != null ? ` · ${fmtKwd(detail.awardedAmount)}` : ''}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="border-b border-border flex flex-wrap">
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                      active
                        ? 'border-accent text-accent bg-accent/5'
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {tab === 'overview' && <OverviewTab detail={detail} commercial={commercial} />}
              {tab === 'award' && (
                commercial?.award ? (
                  <AwardSummaryCard
                    award={commercial.award}
                    tenderId={detail.id}
                    tenderReference={detail.referenceNumber}
                    canGenerateMinutes={false}
                  />
                ) : (
                  <p className="text-sm text-text-secondary italic">No active award row on this tender.</p>
                )
              )}
              {tab === 'technical' && (
                technicalError ? (
                  <div className="bg-danger/5 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
                    <p className="font-bold">Technical comparison fetch failed</p>
                    <p className="text-xs mt-1">{technicalError}</p>
                  </div>
                ) : technical ? (
                  <div className="space-y-5">
                    <TechnicalMatrix
                      criteria={techMatrixCriteria}
                      vendors={techMatrixVendors}
                      totalMaxScore={technical.totalMaxScore}
                      passThreshold={technical.tender?.technicalPassThreshold ?? null}
                      selectedVendorId={winnerVendorId}
                      onSelectVendor={() => { /* no-op */ }}
                      defaultLayout="criterion-rows"
                    />
                    <div className="space-y-3">
                      {(technical.vendors ?? []).map(v => (
                        <VendorTechnicalCard
                          key={v.bidId}
                          vendor={v}
                          criteria={technical.criteria ?? []}
                          totalMaxScore={technical.totalMaxScore ?? 0}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary italic">No technical evaluation data.</p>
                )
              )}
              {tab === 'commercial' && (() => {
                if (commercialError) {
                  return (
                    <div className="bg-danger/5 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
                      <p className="font-bold">Commercial comparison fetch failed</p>
                      <p className="text-xs mt-1">{commercialError}</p>
                    </div>
                  );
                }
                // BUG-095 (2026-06-02): even when the endpoint returns a 200,
                // certain shapes (legacy tenders, missing BoQ template, no
                // vendors) caused crashes. Treat every array field defensively.
                if (!commercial) {
                  return <p className="text-sm text-text-secondary italic">No commercial comparison data.</p>;
                }
                const vendors = Array.isArray(commercial.vendors) ? commercial.vendors : [];
                const boqTemplate = Array.isArray(commercial.boqTemplate) ? commercial.boqTemplate : [];
                if (vendors.length === 0) {
                  return <p className="text-sm text-text-secondary italic">No bids on this tender.</p>;
                }
                return (
                  <div className="space-y-5">
                    <CommercialMatrix
                      vendors={vendors.map(safeVendor)}
                      lowestPassBidId={commercial.lowestPassBidId ?? null}
                      selectedBidId={null}
                      onSelect={() => { /* read-only archive — no selection */ }}
                      boqTemplate={boqTemplate}
                    />
                    <div className="space-y-3">
                      {vendors.map((v: any) => (
                        <VendorComparisonCard
                          key={v.bidId}
                          vendor={safeVendor(v)}
                          tenderId={detail.id}
                          tenderCurrency={commercial.tender?.currency ?? 'KWD'}
                          canEvaluate={false}
                          isLowestPass={v.bidId === commercial.lowestPassBidId}
                          boqTemplate={boqTemplate}
                          onRecommend={() => { /* read-only — never invoked */ }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
              {tab === 'boq' && <TenderBoqEditor tenderId={detail.id} editable={false} />}
              {tab === 'documents' && (
                <DocumentsTab
                  detail={detail}
                  bids={bids}
                  award={commercial?.award ?? null}
                  onView={handleViewPdf}
                  onDownload={handleDownloadPdf}
                />
              )}
              {tab === 'audit' && <AuditTab entries={auditLogs} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ detail, commercial }: { detail: TenderDetail; commercial: CommercialComparisonResponse | null }) {
  const winner = commercial?.award;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Reference">{detail.referenceNumber}</Field>
        <Field label="Department">{detail.departmentName ?? '—'}</Field>
        <Field label="Category">{detail.category ?? '—'}</Field>
        <Field label="Procurement Type">{detail.procurementType ?? '—'}</Field>
        <Field label="Estimated Budget">{fmtKwd(detail.estimatedBudget)}</Field>
        <Field label="Awarded Amount">{fmtKwd(detail.awardedAmount)}</Field>
        <Field label="Submission Deadline">{fmtDateTime(detail.submissionDeadline)}</Field>
        <Field label="Clarification Deadline">{fmtDateTime(detail.clarificationDeadline)}</Field>
        <Field label="Awarded At">{fmtDateTime(detail.awardedAt)}</Field>
        <Field label="Winner Vendor">{winner?.winnerVendorName ?? detail.awardedVendorName ?? '—'}</Field>
        <Field label="Lowest-PASS">{winner ? (winner.isLowest ? 'Yes' : 'No (override)') : '—'}</Field>
        <Field label="Confirmed By">{winner?.confirmedByName ?? '—'}</Field>
      </div>
      {detail.description && (
        <div className="bg-bg/40 border border-border rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">Description</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{detail.description}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg/40 border border-border rounded-lg p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">{label}</p>
      <p className="text-sm text-text-primary font-medium break-words">{children}</p>
    </div>
  );
}

function DocumentsTab({
  detail,
  bids,
  award,
  onView,
  onDownload,
}: {
  detail: TenderDetail;
  bids: BidLite[];
  award: AwardSummary | null;
  onView: (url: string, filename: string) => void;
  onDownload: (url: string, filename: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Tender RFQ docs */}
      <DocSection title="Tender Documents (RFQ + Addenda)">
        {detail.documents && detail.documents.length > 0 ? (
          detail.documents.map(d => (
            <DocRow
              key={d.id}
              filename={d.filename}
              onView={() => onView(`/api/v1/tenders/${detail.id}/documents/${d.id}`, d.filename)}
              onDownload={() => onDownload(`/api/v1/tenders/${detail.id}/documents/${d.id}`, d.filename)}
            />
          ))
        ) : (
          <p className="text-xs text-text-secondary italic">No tender documents on record.</p>
        )}
      </DocSection>

      {/* Award decision artefacts */}
      <DocSection title="Award Decision">
        {award?.justificationPdfFilename && (
          <DocRow
            filename={award.justificationPdfFilename}
            label="Justification PDF"
            onView={() => onView(`/api/v1/tenders/${detail.id}/award/justification.pdf`, award.justificationPdfFilename!)}
            onDownload={() => onDownload(`/api/v1/tenders/${detail.id}/award/justification.pdf`, award.justificationPdfFilename!)}
          />
        )}
        <DocRow
          filename="Award Minutes"
          label="PDF (generated on demand)"
          onView={() => onView(`/api/v1/tenders/${detail.id}/award/minutes.pdf`, `${detail.referenceNumber}-award-minutes.pdf`)}
          onDownload={() => onDownload(`/api/v1/tenders/${detail.id}/award/minutes.pdf`, `${detail.referenceNumber}-award-minutes.pdf`)}
        />
      </DocSection>

      {/* Bid envelope docs */}
      <DocSection title="Bid Documents (per vendor)">
        {bids.length === 0 ? (
          <p className="text-xs text-text-secondary italic">No bid records on this tender.</p>
        ) : (
          <div className="space-y-3">
            {bids.map(b => (
              <BidDocBlock key={b.id} bid={b} onView={onView} onDownload={onDownload} />
            ))}
          </div>
        )}
      </DocSection>
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DocRow({
  filename,
  label,
  onView,
  onDownload,
}: {
  filename: string;
  label?: string;
  onView: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-bg/40 border border-border rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-text-secondary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-text-primary truncate">{filename}</p>
          {label && <p className="text-[10px] text-text-secondary">{label}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onView} className="px-2 py-1 text-xs font-semibold text-accent hover:underline flex items-center gap-1">
          <Eye className="w-3.5 h-3.5" /> View
        </button>
        <button onClick={onDownload} className="px-2 py-1 text-xs font-semibold text-accent hover:underline flex items-center gap-1">
          <Download className="w-3.5 h-3.5" /> Download
        </button>
      </div>
    </div>
  );
}

function BidDocBlock({
  bid,
  onView,
  onDownload,
}: {
  bid: BidLite;
  onView: (url: string, filename: string) => void;
  onDownload: (url: string, filename: string) => void;
}) {
  const [docs, setDocs] = useState<{ technical: any[]; commercial: any[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      try {
        const [t, c] = await Promise.all([
          get<{ documents: any[] }>(`/bids/${bid.id}/envelopes/TECHNICAL/documents`, token).catch(() => ({ documents: [] })),
          get<{ documents: any[] }>(`/bids/${bid.id}/envelopes/COMMERCIAL/documents`, token).catch(() => ({ documents: [] })),
        ]);
        if (!cancelled) setDocs({ technical: t.documents ?? [], commercial: c.documents ?? [] });
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [bid.id]);

  return (
    <div className="border border-border rounded-lg p-3 bg-bg/20">
      <p className="text-sm font-semibold text-text-primary mb-2">{bid.vendorName}</p>
      <div className="space-y-2">
        <EnvelopeBlock title="Technical envelope" docs={docs?.technical ?? []} bidId={bid.id} onView={onView} onDownload={onDownload} />
        <EnvelopeBlock title="Commercial envelope" docs={docs?.commercial ?? []} bidId={bid.id} onView={onView} onDownload={onDownload} />
      </div>
    </div>
  );
}

function EnvelopeBlock({
  title, docs, bidId, onView, onDownload,
}: {
  title: string; docs: any[]; bidId: string;
  onView: (url: string, filename: string) => void;
  onDownload: (url: string, filename: string) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1">{title}</p>
      {docs.length === 0 ? (
        <p className="text-xs text-text-secondary italic">—</p>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            <DocRow
              key={d.id}
              filename={d.filename}
              onView={() => onView(`/api/v1/bids/${bidId}/documents/${d.id}`, d.filename)}
              onDownload={() => onDownload(`/api/v1/bids/${bidId}/documents/${d.id}`, d.filename)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditTab({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-secondary italic">No audit events on record.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-secondary">
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Event</th>
            <th className="px-3 py-2 text-left">Actor</th>
            <th className="px-3 py-2 text-left w-24">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map(e => (
            <tr key={e.id} className="hover:bg-bg/40">
              <td className="px-3 py-2 text-xs text-text-secondary font-mono whitespace-nowrap">{fmtDateTime(e.eventTime)}</td>
              <td className="px-3 py-2 text-text-primary">{e.eventType}</td>
              <td className="px-3 py-2 text-text-secondary">{e.actorName ?? '—'}</td>
              <td className="px-3 py-2">
                {e.riskLevel && (
                  <span className={
                    'inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ' +
                    (e.riskLevel === 'HIGH' ? 'bg-danger/10 text-danger'
                      : e.riskLevel === 'MEDIUM' ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-text-secondary/10 text-text-secondary')
                  }>{e.riskLevel}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AwardedTendersPage() {
  return (
    <Suspense fallback={
      <div className="p-10 text-text-secondary text-sm flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    }>
      <AwardedTendersContent />
    </Suspense>
  );
}
