'use client';

// BUG-076 (2026-06-01): dedicated printable agenda document. WALK-037 wired
// `window.print()` on the operator UI itself — which printed the live operator
// panel with side-nav and unrelated controls. Owner reported that's useless.
// This page renders a clean agenda: meeting metadata, tender info, member list
// with PRESENT/ABSENT, opening order placeholders, and signature lines.
// Auto-triggers `window.print()` on mount; @media print hides admin chrome.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface Member {
  userId: string;
  displayName: string;
  roleCode: string | null;
  attended: boolean | null;
}

interface Session {
  id: string;
  status: string;
  scheduledAt?: string;
  location?: string | null;
  chairName?: string | null;
  requiredQuorumCount?: number | null;
  requiredRoleCode?: string | null;
  remarks?: string;
  members?: Member[];
}

interface TenderSummary {
  id: string;
  referenceNumber: string;
  title: string;
  status: string;
  departmentName?: string | null;
}

export default function AgendaPrintPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId;
  const tenderId = searchParams.get('tenderId') ?? '';

  const [session, setSession] = useState<Session | null>(null);
  const [tender, setTender] = useState<TenderSummary | null>(null);
  const [bidCount, setBidCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !tenderId) return;
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      try {
        const [sessionsRes, tenderRes, bidsRes] = await Promise.all([
          get<{ items: Session[] }>(`/tenders/${tenderId}/committee-sessions`, token).catch(() => ({ items: [] })),
          get<TenderSummary>(`/tenders/${tenderId}`, token).catch(() => null),
          get<{ items: Array<{ id: string }> } | { total: number }>(`/tenders/${tenderId}/bids?pageSize=1`, token).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const s = sessionsRes.items?.find(x => x.id === sessionId) ?? null;
        setSession(s);
        setTender(tenderRes);
        const c = (bidsRes as { total?: number }).total ?? (bidsRes as { items?: unknown[] }).items?.length ?? 0;
        setBidCount(c);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, tenderId]);

  useEffect(() => {
    if (loading || !session) return;
    // Defer to next tick so layout settles before print dialog appears.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [loading, session]);

  if (loading) {
    return <p className="p-8 text-sm text-text-secondary">Loading agenda…</p>;
  }
  if (!session) {
    return <p className="p-8 text-sm text-danger">Session not found.</p>;
  }

  return (
    <div className="agenda-doc bg-white text-black p-10 print:p-0">
      <style jsx global>{`
        @media print {
          aside, nav, .sidebar, header { display: none !important; }
          body, html, main { background: white !important; }
          .agenda-doc { max-width: 100% !important; }
        }
      `}</style>

      <header className="border-b-2 border-black pb-4 mb-6">
        <p className="text-xs uppercase tracking-widest text-gray-600">Hadi Clinic — Procurement Committee</p>
        <h1 className="text-2xl font-bold mt-1">Commercial Opening — Agenda</h1>
      </header>

      <section className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-8">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Tender Reference</p>
          <p className="font-bold">{tender?.referenceNumber ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Department</p>
          <p className="font-bold">{tender?.departmentName ?? '—'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs uppercase tracking-wider text-gray-600">Tender Title</p>
          <p className="font-bold">{tender?.title ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Meeting Date / Time</p>
          <p className="font-bold">{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString() : '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Location</p>
          <p className="font-bold">{session.location ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Chair</p>
          <p className="font-bold">{session.chairName ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-600">Quorum Required</p>
          <p className="font-bold">
            {session.requiredQuorumCount ?? '—'}
            {session.requiredRoleCode ? ` (+ ${session.requiredRoleCode})` : ''}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-black pb-1 mb-3">Committee Members</h2>
        <table className="w-full text-sm border border-black border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black px-3 py-2 text-left">Member</th>
              <th className="border border-black px-3 py-2 text-left w-32">Role</th>
              <th className="border border-black px-3 py-2 w-24 text-center">Present</th>
              <th className="border border-black px-3 py-2 w-32 text-center">Signature</th>
            </tr>
          </thead>
          <tbody>
            {(session.members ?? []).map(m => (
              <tr key={m.userId}>
                <td className="border border-black px-3 py-2">{m.displayName}</td>
                <td className="border border-black px-3 py-2">{m.roleCode ?? '—'}</td>
                <td className="border border-black px-3 py-2 text-center">{m.attended === true ? '☑' : '☐'}</td>
                <td className="border border-black px-3 py-2 text-center">&nbsp;</td>
              </tr>
            ))}
            {(session.members ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="border border-black px-3 py-2 text-center text-gray-500 italic">No members on record</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-black pb-1 mb-3">Agenda</h2>
        <ol className="list-decimal pl-6 text-sm space-y-2">
          <li>Call to order &amp; quorum verification.</li>
          <li>Confirmation of attendance and chair role.</li>
          <li>
            Opening of commercial envelopes for tender <strong>{tender?.referenceNumber ?? ''}</strong>
            {bidCount !== null ? <> — <strong>{bidCount}</strong> technically-qualified bid(s) on record.</> : null}
          </li>
          <li>Record SHA-256 checksum verification per envelope.</li>
          <li>Opening remarks &amp; minutes captured for audit.</li>
          <li>Hand-off to Commercial Evaluation / Comparison.</li>
        </ol>
      </section>

      {session.remarks && (
        <section className="mb-8">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-black pb-1 mb-3">Opening Remarks</h2>
          <p className="text-sm whitespace-pre-wrap">{session.remarks}</p>
        </section>
      )}

      <section className="mt-12 pt-8 border-t border-black">
        <h2 className="text-base font-bold uppercase tracking-wide mb-6">Signatures</h2>
        <div className="grid grid-cols-2 gap-x-12 gap-y-10">
          <div>
            <div className="h-12 border-b border-black" />
            <p className="text-xs text-gray-600 mt-1">Chair</p>
          </div>
          <div>
            <div className="h-12 border-b border-black" />
            <p className="text-xs text-gray-600 mt-1">Secretary</p>
          </div>
          <div>
            <div className="h-12 border-b border-black" />
            <p className="text-xs text-gray-600 mt-1">Member</p>
          </div>
          <div>
            <div className="h-12 border-b border-black" />
            <p className="text-xs text-gray-600 mt-1">Member</p>
          </div>
        </div>
      </section>
    </div>
  );
}
