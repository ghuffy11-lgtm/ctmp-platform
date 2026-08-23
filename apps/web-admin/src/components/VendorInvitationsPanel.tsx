'use client';

// 2026-08-24: invite a prospective supplier to join the registry.
//
// Lives on the Vendors page as a tab rather than a new route — this is vendor
// registry work, and the approval queue it feeds is right next to it.
//
// The invitation is NOT tender-scoped. Sending one grants nothing: the invitee
// still completes the ordinary registration, with hCaptcha, email verification
// and admin approval.

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, Send, Ban, AlertTriangle } from 'lucide-react';
import { get, post } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm, useNotify } from '@/components/dialog/DialogProvider';
import { isValidEmail } from '@/lib/email';

interface Invitation {
  id: string;
  email: string;
  companyName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedByName: string | null;
  invitedAt: string;
  lastSentAt: string;
  sendCount: number;
  expiresAt: string;
  acceptedVendorId: string | null;
  revokeReason: string | null;
  emailStatus?: 'SENT' | 'FAILED';
}

const STATUS_STYLE: Record<Invitation['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-success/10 text-success',
  EXPIRED: 'bg-border text-text-secondary',
  REVOKED: 'bg-danger/10 text-danger',
};

const STATUS_LABEL: Record<Invitation['status'], string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Registered',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function VendorInvitationsPanel({ onOpenVendor }: { onOpenVendor?: (vendorId: string) => void }) {
  const confirm = useConfirm();
  const notify = useNotify();

  const [rows, setRows] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<{ items: Invitation[] }>('/vendor-invitations?pageSize=100', token);
      setRows(res.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load invitations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const canSend = companyName.trim().length >= 2 && isValidEmail(email.trim()) && !sending;

  async function send() {
    if (!canSend) return;
    const ok = await confirm({
      title: 'Send invitation',
      body: `Send a registration invitation to ${email.trim()} (${companyName.trim()})? They will receive one email with a personal link.`,
      confirmLabel: 'Send invitation',
    });
    if (!ok) return;

    setSending(true);
    setError(null);
    try {
      const token = getAccessToken();
      const created = await post<Invitation>(
        '/vendor-invitations',
        { email: email.trim(), companyName: companyName.trim() },
        token,
      );
      setCompanyName('');
      setEmail('');
      await load();
      // The API reports delivery separately from creation: sendEmail throws on
      // SMTP failure and we downgrade it, so an invitation can exist with no
      // mail sent. Say so rather than implying it is on its way.
      if (created?.emailStatus === 'FAILED') {
        notify({
          title: 'Invitation saved, email failed',
          body: 'The invitation was created but the email could not be sent. Use Resend once mail is working.',
        });
      } else {
        notify({ title: 'Invitation sent', body: `${created.companyName} has been invited to register.` });
      }
    } catch (e) {
      // 409s carry a readable reason; show that rather than raw API text.
      const msg = e instanceof Error ? e.message : 'Could not send the invitation.';
      setError(
        /already has a supplier account/i.test(msg)
          ? 'That email address already has a supplier account.'
          : /already pending|ALREADY_PENDING/i.test(msg)
            ? 'An invitation to that address is already pending — resend it from the list below.'
            : /limit reached|Too Many|429/i.test(msg)
              ? 'Invitation limit reached. Try again shortly.'
              : msg,
      );
    } finally {
      setSending(false);
    }
  }

  async function resend(inv: Invitation) {
    const ok = await confirm({
      title: 'Resend invitation',
      body: `Send a fresh invitation to ${inv.email}? The previous link will stop working immediately.`,
      confirmLabel: 'Resend',
    });
    if (!ok) return;
    setBusyId(inv.id);
    try {
      await post(`/vendor-invitations/${inv.id}/resend`, {}, getAccessToken());
      await load();
      notify({ title: 'Invitation resent', body: `A new link has been sent to ${inv.email}.` });
    } catch (e) {
      notify({ title: 'Could not resend', body: e instanceof Error ? e.message : 'Unknown error.' });
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(inv: Invitation) {
    const ok = await confirm({
      title: 'Revoke invitation',
      body: `Withdraw the invitation to ${inv.email}? Their link will stop working immediately.`,
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(inv.id);
    try {
      await post(`/vendor-invitations/${inv.id}/revoke`, {}, getAccessToken());
      await load();
      notify({ title: 'Invitation revoked', body: `${inv.email} can no longer use that link.` });
    } catch (e) {
      notify({ title: 'Could not revoke', body: e instanceof Error ? e.message : 'Unknown error.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Invite form ─────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <h3 className="text-sm font-bold text-text-primary mb-1">Invite a supplier</h3>
        <p className="text-xs text-text-secondary mb-4">
          They receive an email explaining the portal and a link to register. Registration still
          needs your approval before they can bid.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Company name"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            placeholder="Email address"
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={send}
            disabled={!canSend}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send invite
          </button>
        </div>
        <p className="text-[11px] text-text-secondary mt-2">
          The company name is used only in the email greeting. It does not create a vendor record.
        </p>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Invitations list ────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-text-primary">Invitations</h3>
          <button
            onClick={() => void load()}
            className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-text-secondary" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Mail className="w-8 h-8 mx-auto text-text-secondary/40 mb-2" />
            <p className="text-sm text-text-secondary">No invitations yet. Invite a supplier above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-secondary border-b border-border">
                  <th className="px-5 py-2 font-semibold">Company</th>
                  <th className="px-5 py-2 font-semibold">Email</th>
                  <th className="px-5 py-2 font-semibold">Invited by</th>
                  <th className="px-5 py-2 font-semibold">Sent</th>
                  <th className="px-5 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(inv => (
                  <tr key={inv.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-text-primary">{inv.companyName}</td>
                    <td className="px-5 py-3 text-text-secondary">{inv.email}</td>
                    <td className="px-5 py-3 text-text-secondary">{inv.invitedByName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-secondary whitespace-nowrap">
                      {fmt(inv.lastSentAt)}
                      {inv.sendCount > 1 && (
                        <span className="text-[11px] text-text-secondary/70"> ·{inv.sendCount}×</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status]}
                      </span>
                      {inv.status === 'ACCEPTED' && inv.acceptedVendorId && onOpenVendor && (
                        <button
                          onClick={() => onOpenVendor(inv.acceptedVendorId!)}
                          className="ml-2 text-[11px] text-accent underline underline-offset-2"
                        >
                          view vendor
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {busyId === inv.id ? (
                        <Loader2 className="w-4 h-4 animate-spin inline text-text-secondary" />
                      ) : (
                        <>
                          {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                            <button
                              onClick={() => void resend(inv)}
                              className="text-xs font-semibold text-accent hover:underline mr-3"
                            >
                              {inv.status === 'EXPIRED' ? 'Invite again' : 'Resend'}
                            </button>
                          )}
                          {inv.status === 'PENDING' && (
                            <button
                              onClick={() => void revoke(inv)}
                              className="text-xs font-semibold text-danger hover:underline inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" /> Revoke
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
