'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';
import { RefreshCw, Store, Clock, BadgeCheck, Ban, Search, CheckCircle2, PauseCircle, FileText, Eye, Download } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// BUG-137 (2026-06-19): vendor registration document type labels.
// BUG-138 (2026-06-19): slot list trimmed to 3. Older rows with the
// dropped codes still display via the label map for historical clarity.
const DOC_TYPE_LABELS: Record<string, string> = {
  COMMERCIAL_LICENSE: 'Commercial License',
  AUTHORISATION_LETTER: 'Authorisation Letter',
  OTHER: 'Other',
  // Legacy codes — keep labels in case any vendor uploaded under the old
  // BUG-137 catalogue before BUG-138 trimmed it.
  AUTHORISED_REPRESENTATIVE_ID: 'Authorised Representative ID',
  TAX_CERTIFICATE: 'Tax Certificate',
};

interface VendorDocumentRow {
  id: string;
  documentType: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string;
  company: string;
  email: string;
  contactName: string;
  contactPhone?: string;
  country?: string;
  category?: string;
  taxId?: string;
  registrationStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'BLACKLISTED';
  emailVerified: boolean;
  registeredAt: string;
  approvedAt?: string;
  lastLoginAt?: string;
  documentCount?: number;
}

interface VendorListResponse {
  items: Vendor[];
  total: number;
}

type StatusFilter = 'ALL' | Vendor['registrationStatus'];

const STATUS_LABELS: Record<Vendor['registrationStatus'], { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  APPROVED:         { label: 'Approved', cls: 'bg-success/10 text-success' },
  REJECTED:         { label: 'Rejected', cls: 'bg-danger/10 text-danger' },
  SUSPENDED:        { label: 'Suspended', cls: 'bg-border text-text-secondary' },
  BLACKLISTED:      { label: 'Blacklisted', cls: 'bg-danger/15 text-danger' },
};

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VendorsPage() {
  const confirm = useConfirm();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<VendorListResponse>('/vendors?pageSize=200', token);
      setVendors(res.items ?? []);
      if (res.items?.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  // BUG-137 (2026-06-19): load registration documents for the selected vendor.
  const [vendorDocs, setVendorDocs] = useState<VendorDocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  useEffect(() => {
    if (!selectedId) {
      setVendorDocs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDocsLoading(true);
      try {
        const token = getAccessToken();
        const res = await get<{ items: VendorDocumentRow[] }>(`/vendors/${selectedId}/documents`, token);
        if (!cancelled) setVendorDocs(res.items ?? []);
      } catch {
        if (!cancelled) setVendorDocs([]);
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  async function viewVendorDoc(vendorId: string, docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/vendors/${vendorId}/documents/${docId}/view`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open failed');
    }
  }

  async function downloadVendorDoc(vendorId: string, docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/vendors/${vendorId}/documents/${docId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  const filtered = vendors.filter(v => {
    if (statusFilter !== 'ALL' && v.registrationStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return v.company.toLowerCase().includes(q)
        || v.email.toLowerCase().includes(q)
        || v.contactName.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = vendors.find(v => v.id === selectedId) ?? null;
  const pendingCount = vendors.filter(v => v.registrationStatus === 'PENDING_APPROVAL').length;
  const approvedCount = vendors.filter(v => v.registrationStatus === 'APPROVED').length;
  const rejectedCount = vendors.filter(v => v.registrationStatus === 'REJECTED').length;

  async function handleApprove() {
    if (!selected) return;
    const ok = await confirm({
      title: 'Approve vendor',
      body: `Approve ${selected.company}? Vendor will be able to log in and bid.`,
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setActionInFlight(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/vendors/${selected.id}/approve`, {}, token);
      await fetchVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionInFlight(false);
    }
  }

  async function handleReject() {
    if (!selected) return;
    const reason = prompt('Rejection reason (required for audit):');
    if (!reason?.trim()) return;
    setActionInFlight(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/vendors/${selected.id}/reject`, { reason }, token);
      await fetchVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionInFlight(false);
    }
  }

  async function handleSuspend() {
    if (!selected) return;
    const reason = prompt('Suspension reason (required for audit):');
    if (!reason?.trim()) return;
    setActionInFlight(true);
    try {
      const token = getAccessToken();
      await post(`/vendors/${selected.id}/suspend`, { reason }, token);
      await fetchVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend');
    } finally {
      setActionInFlight(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Vendor Management</h1>
        </div>
        <button
          onClick={fetchVendors}
          className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: 'Total Vendors', value: vendors.length, color: 'text-text-primary', Icon: Store },
          { label: 'Pending Approval', value: pendingCount, color: 'text-amber-600', Icon: Clock },
          { label: 'Approved', value: approvedCount, color: 'text-success', Icon: BadgeCheck },
          { label: 'Rejected', value: rejectedCount, color: 'text-danger', Icon: Ban },
        ] as { label: string; value: number; color: string; Icon: React.ComponentType<LucideProps> }[]).map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-bold uppercase text-text-secondary">{s.label}</span>
              <s.Icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">{error}</div>
      )}

      <div className="flex gap-5 h-[calc(100vh-340px)] min-h-[500px]">
        {/* List */}
        <div className="flex-1 bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search company, email, contact…"
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent bg-bg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BLACKLISTED">Blacklisted</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-text-secondary">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Store className="w-12 h-12 text-text-secondary/20 mx-auto mb-2" />
                <p className="text-sm text-text-secondary">No vendors match the filter.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-bg sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Company</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Contact</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(v => {
                    const isSel = v.id === selectedId;
                    const meta = STATUS_LABELS[v.registrationStatus];
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedId(v.id)}
                        className={`cursor-pointer transition-colors ${isSel ? 'bg-accent/5' : 'hover:bg-bg/60'}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-text-primary">{v.company}</p>
                          <p className="text-xs text-text-secondary">{v.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-text-primary">{v.contactName}</p>
                          {v.country && <p className="text-xs text-text-secondary">{v.country}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                          {!v.emailVerified && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700">
                              Email unverified
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatDate(v.registeredAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-[380px] flex-shrink-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
          {!selected ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
              <Store className="w-12 h-12 text-text-secondary/20 mb-2" />
              <p className="text-sm text-text-secondary">Select a vendor.</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-border bg-bg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold text-text-primary">{selected.company}</h2>
                    <p className="text-xs text-text-secondary mt-0.5">ID {selected.id.slice(0, 8)}…</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_LABELS[selected.registrationStatus].cls}`}>
                    {STATUS_LABELS[selected.registrationStatus].label}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
                <FieldRow label="Email" value={selected.email} verified={selected.emailVerified} />
                <FieldRow label="Contact Name" value={selected.contactName} />
                {selected.contactPhone && <FieldRow label="Phone" value={selected.contactPhone} />}
                {selected.country && <FieldRow label="Country" value={selected.country} />}
                {selected.category && <FieldRow label="Category" value={selected.category} />}
                {selected.taxId && <FieldRow label="Tax ID" value={selected.taxId} />}
                <FieldRow label="Registered" value={formatDate(selected.registeredAt)} />
                {selected.approvedAt && <FieldRow label="Approved" value={formatDate(selected.approvedAt)} />}
                {selected.lastLoginAt && <FieldRow label="Last Login" value={formatDate(selected.lastLoginAt)} />}
                {typeof selected.documentCount === 'number' && <FieldRow label="Documents" value={String(selected.documentCount)} />}

                {/* BUG-137 (2026-06-19): registration documents — list with
                    View + Download. Approver should review before approving. */}
                <div className="pt-2 border-t border-border">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-2">
                    Registration Documents
                  </p>
                  {docsLoading ? (
                    <p className="text-xs italic text-text-secondary">Loading documents…</p>
                  ) : vendorDocs.length === 0 ? (
                    <p className="text-xs italic text-text-secondary">No documents uploaded.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {vendorDocs.map(d => (
                        <li key={d.id} className="flex items-center justify-between text-xs bg-bg/40 border border-border rounded px-2.5 py-1.5">
                          <span className="flex items-center gap-2 truncate min-w-0">
                            <FileText className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                            <span className="truncate">
                              <span className="font-semibold text-text-primary">
                                {DOC_TYPE_LABELS[d.documentType] ?? d.documentType}
                              </span>
                              <span className="text-text-secondary ml-2 truncate">{d.filename}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => viewVendorDoc(selected.id, d.id, d.filename)}
                              className="inline-flex items-center gap-1 text-accent hover:underline px-1"
                              title="View in browser"
                            >
                              <Eye className="w-3.5 h-3.5" /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadVendorDoc(selected.id, d.id, d.filename)}
                              className="inline-flex items-center gap-1 text-accent hover:underline px-1"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-border bg-bg space-y-2">
                {selected.registrationStatus === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      onClick={handleApprove}
                      disabled={actionInFlight || !selected.emailVerified}
                      className="w-full px-4 py-2.5 bg-success text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve Vendor
                    </button>
                    {!selected.emailVerified && (
                      <p className="text-[11px] text-amber-700 text-center italic">Vendor must verify email first.</p>
                    )}
                    <button
                      onClick={handleReject}
                      disabled={actionInFlight}
                      className="w-full px-4 py-2.5 bg-danger text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Ban className="w-4 h-4" />
                      Reject
                    </button>
                  </>
                )}
                {selected.registrationStatus === 'APPROVED' && (
                  <button
                    onClick={handleSuspend}
                    disabled={actionInFlight}
                    className="w-full px-4 py-2.5 border border-danger text-danger rounded-lg text-sm font-bold hover:bg-danger/5 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <PauseCircle className="w-4 h-4" />
                    Suspend
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-0.5">{label}</p>
      <p className="text-sm text-text-primary flex items-center gap-1.5">
        {value}
        {verified !== undefined && (
          verified
            ? <BadgeCheck className="w-3.5 h-3.5 text-success" aria-label="Verified" />
            : <Clock className="w-3.5 h-3.5 text-amber-600" aria-label="Unverified" />
        )}
      </p>
    </div>
  );
}
