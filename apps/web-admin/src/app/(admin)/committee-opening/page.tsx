'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  submissionDeadline: string | null;
  departmentName: string;
}

interface PaginatedTenders {
  data: TenderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface CommitteeSession {
  id: string;
  tenderId: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledAt?: string;
  openedAt?: string;
  remarks?: string;
  chairName?: string;
  members?: CommitteeMember[];
}

interface CommitteeMember {
  userId: string;
  name: string;
  role: string;
  attended?: boolean;
}

interface CommercialOpeningRecord {
  id: string;
  bidId: string;
  vendorId: string;
  vendorCompany?: string;
  envelopeStatus: 'SEALED' | 'OPENED' | 'LOCKED' | 'SUBMITTED' | 'DRAFT';
  checksumVerified: boolean;
  technicalResult?: 'PASS' | 'FAIL';
  openedAt?: string;
}

const COMMITTEE_STATUSES = ['Commercial Sealed', 'Committee Commercial Opening'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommitteeOpeningPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const [session, setSession] = useState<CommitteeSession | null>(null);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [records, setRecords] = useState<CommercialOpeningRecord[]>([]);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [openingEnvelopes, setOpeningEnvelopes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Fetch tenders ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTenders() {
      setTendersLoading(true);
      try {
        const token = getAccessToken();
        const results = await Promise.all(
          COMMITTEE_STATUSES.map(s =>
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
  }, []);

  // ─── Fetch session + records ────────────────────────────────────────────────
  const fetchSessionData = useCallback(async (tenderId: string) => {
    setLoading(true);
    setError(null);
    setSession(null);
    setMembers([]);
    setRecords([]);
    try {
      const token = getAccessToken();
      // GAP: GET /tenders/{tenderId}/committee-sessions (latest) not contracted.
      const sessions = await get<{ items: CommitteeSession[] }>(
        `/tenders/${tenderId}/committee-sessions`,
        token,
      ).catch(() => ({ items: [] }));
      const latest = sessions.items?.[0];
      if (latest) {
        setSession(latest);
        setRemarks(latest.remarks ?? '');
        setMembers(latest.members ?? []);
        // Opening records (only available once session open)
        const recRes = await get<{ items: CommercialOpeningRecord[] }>(
          `/committee-sessions/${latest.id}/opening-records`,
          token,
        ).catch(() => ({ items: [] }));
        setRecords(recRes.items ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) fetchSessionData(selectedTenderId);
  }, [selectedTenderId, fetchSessionData]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const selectedTender = tenders.find(t => t.id === selectedTenderId) ?? null;
  const presentCount = members.filter(m => m.attended === true).length;
  const quorumMet = members.length > 0 && presentCount >= Math.ceil(members.length / 2);
  const canOpenEnvelopes = !!session && session.status !== 'COMPLETED' && quorumMet && remarks.trim().length > 0;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  function toggleAttendance(userId: string, attended: boolean) {
    setMembers(prev => prev.map(m => m.userId === userId ? { ...m, attended } : m));
  }

  async function handleSaveAttendance() {
    if (!session) return;
    try {
      const token = getAccessToken();
      await post(
        `/committee-sessions/${session.id}/attendance`,
        {
          attendance: members.map(m => ({
            userId: m.userId,
            attended: m.attended === true,
          })),
        },
        token,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    }
  }

  async function handleOpenEnvelopes() {
    if (!session) return;
    if (!confirm(
      'Open commercial envelopes for all technically qualified vendors? '
      + 'This is irreversible and writes to the audit log. Visibility of commercial details still requires explicit permission.',
    )) return;
    setOpeningEnvelopes(true);
    setError(null);
    try {
      const token = getAccessToken();
      const result = await post<{ openedEnvelopeCount: number; records: CommercialOpeningRecord[] }>(
        `/committee-sessions/${session.id}/open-commercial-envelopes`,
        { remarks },
        token,
      );
      setRecords(result.records ?? []);
      if (selectedTenderId) await fetchSessionData(selectedTenderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open envelopes');
    } finally {
      setOpeningEnvelopes(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden -m-8">
      {/* Tender list */}
      <div className="w-72 flex-shrink-0 border-r border-border bg-bg flex flex-col">
        <div className="p-4 border-b border-border bg-card">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Awaiting Commercial Opening
          </p>
          <p className="text-xs text-text-secondary mt-0.5">{tenders.length} tenders</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tendersLoading ? (
            <div className="p-4 text-xs text-text-secondary">Loading…</div>
          ) : tenders.length === 0 ? (
            <div className="p-6 text-center">
              <span className="material-symbols-outlined text-[40px] text-text-secondary/20 block mb-2">
                groups
              </span>
              <p className="text-xs text-text-secondary">No tenders awaiting commercial opening.</p>
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
                  <p className={`text-sm font-semibold leading-snug ${
                    isSel ? 'text-text-primary' : 'text-text-secondary'
                  }`}>
                    {t.title}
                  </p>
                  <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                    {t.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedTender ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <span className="material-symbols-outlined text-[56px] text-text-secondary/20">groups</span>
            <p className="text-sm font-semibold text-text-secondary">Select a tender to view committee session.</p>
          </div>
        ) : (
          <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Session header */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm flex flex-wrap justify-between items-end gap-4">
              <div className="space-y-2">
                <nav className="flex items-center gap-1 text-xs text-text-secondary mb-1">
                  <Link href="/tenders" className="hover:text-accent">Tenders</Link>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  <Link href={`/tenders/${selectedTender.id}`} className="hover:text-accent">{selectedTender.referenceNumber}</Link>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  <span className="text-text-primary font-medium">Committee Opening</span>
                </nav>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded">
                    {selectedTender.referenceNumber}
                  </span>
                  {session ? (
                    <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      session.status === 'COMPLETED'
                        ? 'bg-success/10 text-success'
                        : session.status === 'IN_PROGRESS'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-border text-text-secondary'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        session.status === 'COMPLETED' ? 'bg-success'
                          : session.status === 'IN_PROGRESS' ? 'bg-amber-500 animate-pulse'
                          : 'bg-text-secondary'
                      }`} />
                      {session.status}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-border text-text-secondary">
                      NO SESSION
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                  Committee Commercial Opening
                </h1>
                <p className="text-sm text-text-secondary">{selectedTender.title}</p>
                {session && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary mt-2">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                      {formatDateTime(session.scheduledAt)}
                    </span>
                    {session.chairName && (
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                        Chair: {session.chairName}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  Print Agenda
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* Missing-session warning */}
            {!loading && !session && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
                <span className="material-symbols-outlined text-[24px] text-amber-700">info</span>
                <div>
                  <p className="text-sm font-bold text-amber-900 mb-1">No committee session scheduled</p>
                  <p className="text-xs text-amber-900/80">
                    A committee session must be created before commercial envelopes can be opened.
                    Schedule a session via the tender detail page first.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Attendance + remarks */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-bg flex justify-between items-center">
                    <h3 className="text-sm font-bold text-text-primary">Committee Attendance</h3>
                    <span className="text-xs text-text-secondary">{members.length} members</span>
                  </div>
                  <div className="p-4 space-y-2">
                    {members.length === 0 ? (
                      <p className="text-xs text-text-secondary italic p-3 text-center">
                        No members assigned to this session.
                      </p>
                    ) : (
                      members.map(m => (
                        <div key={m.userId} className="flex items-center justify-between p-2.5 bg-bg rounded-lg border border-border">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-accent/10 text-accent font-bold text-xs flex items-center justify-center">
                              {initials(m.name)}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-primary">{m.name}</p>
                              <p className="text-[10px] uppercase tracking-wider text-text-secondary">{m.role}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 bg-card rounded-full p-0.5 border border-border">
                            <button
                              onClick={() => toggleAttendance(m.userId, true)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                                m.attended === true ? 'bg-success/15 text-success' : 'text-text-secondary/50 hover:text-text-secondary'
                              }`}
                            >
                              PRESENT
                            </button>
                            <button
                              onClick={() => toggleAttendance(m.userId, false)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                                m.attended === false ? 'bg-danger/15 text-danger' : 'text-text-secondary/50 hover:text-text-secondary'
                              }`}
                            >
                              ABSENT
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="px-5 py-3 bg-bg border-t border-border flex justify-between items-center">
                    <p className={`text-xs font-bold flex items-center gap-1.5 ${quorumMet ? 'text-success' : 'text-danger'}`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {quorumMet ? 'check_circle' : 'warning'}
                      </span>
                      {quorumMet
                        ? `Quorum met (${presentCount}/${members.length})`
                        : `Quorum not met (${presentCount}/${members.length})`}
                    </p>
                    {members.length > 0 && (
                      <button
                        onClick={handleSaveAttendance}
                        className="px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded transition-colors"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border shadow-sm p-5">
                  <h3 className="text-sm font-bold text-text-primary mb-2">Opening Remarks</h3>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    rows={5}
                    placeholder="Enter session notes, formal declarations, or observed discrepancies..."
                    className="w-full p-3 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent bg-bg resize-none"
                  />
                  <p className="text-[11px] text-text-secondary italic mt-2">
                    Notes are time-stamped in the audit log.
                  </p>
                </div>
              </div>

              {/* Vendors + open action */}
              <div className="lg:col-span-7">
                <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                  <div className="px-5 py-3 border-b border-border bg-bg flex justify-between items-center">
                    <h3 className="text-sm font-bold text-text-primary">Technically Qualified Vendors</h3>
                    <span className="text-xs text-text-secondary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]">lock</span>
                      Commercial Envelopes
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-bg border-b border-border">
                        <tr>
                          <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Vendor</th>
                          <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Technical</th>
                          <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Envelope</th>
                          <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Checksum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {records.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-text-secondary">
                              No envelope records yet. Opening will populate this list.
                            </td>
                          </tr>
                        ) : (
                          records.map(r => (
                            <tr key={r.id} className="hover:bg-bg/60">
                              <td className="px-5 py-3 font-semibold text-text-primary">
                                {r.vendorCompany ?? r.vendorId.slice(0, 8)}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  r.technicalResult === 'PASS'
                                    ? 'bg-success/10 text-success'
                                    : 'bg-danger/10 text-danger'
                                }`}>
                                  {r.technicalResult ?? 'PASS'}
                                </span>
                              </td>
                              <td className="px-5 py-3 flex items-center gap-1.5 text-text-secondary">
                                <span className="material-symbols-outlined text-[16px]">
                                  {r.envelopeStatus === 'OPENED' ? 'lock_open' : 'lock'}
                                </span>
                                {r.envelopeStatus}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`flex items-center gap-1 text-xs font-medium ${
                                  r.checksumVerified ? 'text-success' : 'text-text-secondary'
                                }`}>
                                  <span className="material-symbols-outlined text-[16px]">
                                    {r.checksumVerified ? 'check_circle' : 'schedule'}
                                  </span>
                                  {r.checksumVerified ? 'VERIFIED' : 'PENDING'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-6 bg-bg border-t border-border">
                    <div className="text-center max-w-md mx-auto space-y-3">
                      <button
                        onClick={handleOpenEnvelopes}
                        disabled={!canOpenEnvelopes || openingEnvelopes}
                        className={`px-8 py-3.5 rounded-lg font-bold text-base inline-flex items-center gap-3 transition-all ${
                          canOpenEnvelopes && !openingEnvelopes
                            ? 'bg-accent text-white shadow-md hover:opacity-90'
                            : 'bg-border text-text-secondary/60 cursor-not-allowed'
                        }`}
                      >
                        <span className="material-symbols-outlined">lock_open</span>
                        {openingEnvelopes ? 'Opening…' : 'Open Commercial Envelopes'}
                      </button>
                      <p className="text-xs text-text-secondary">
                        Only path to open commercial envelopes. Requires quorum and remarks.
                        Visibility of commercial details still gated by <code>commercial:view</code>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
