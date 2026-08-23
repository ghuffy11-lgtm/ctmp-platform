'use client';

import { useEffect, useState } from 'react';
import { Plus, X, AlertCircle, Loader2, Mail, Send, Pencil } from 'lucide-react';
import { get, post, del, patch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';
import { parseEmails } from '@/lib/email';

interface InvitedVendor {
  vendorId: string;
  vendorName: string;
  vendorStatus: string;
  invitedAt: string;
  // BUG-120 (2026-06-10): per-invitation ad-hoc extras + dispatch state.
  extraEmails?: string[];
  notifiedAt?: string | null;
}

// BUG-119 (2026-06-10): /vendors serializer returns `company` (not
// companyName) and `registrationStatus` (not status).
interface VendorPickerItem {
  id: string;
  company: string;
  registrationStatus: string;
}

interface Props {
  tenderId: string;
  tenderStatus: string;
}

/**
 * BUG-015 + BUG-120: per-tender invited-vendors panel. INVITATION_ONLY tenders
 * only. Add-yes / remove-no after Publish, until Submission Closed.
 *
 * BUG-120 invitation-email flow:
 *   - Clicking a vendor in the picker opens an inline confirm row (vendor
 *     name + ad-hoc extra-emails textarea + Send Invitation button) rather
 *     than POSTing immediately. Admin can paste extra contacts (BCC'd
 *     alongside the vendor's registered users).
 *   - Tender Draft / Internal Review / Approved → POST queues the invite;
 *     the email actually fires when the admin Publishes the tender.
 *   - Tender Published / Clarification Period → POST queues AND the email
 *     fires immediately (mid-flight invite).
 *   - Each invited row in the list shows "+ N extras" + a pencil edit chip
 *     so extras can be tweaked between invite and publish.
 */
const ADD_STATUSES = new Set(['Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period']);
// BUG-124 (2026-06-11): removal allowed post-publish too — backend gates on
// "no submitted bid". UI doesn't need to know about bids; if the user clicks
// remove on a vendor who's bid, the server returns 400 with a clear reason.
const REMOVE_STATUSES = new Set(['Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period']);
const IMMEDIATE_DISPATCH = new Set(['Published', 'Clarification Period']);

// 2026-08-24: parseEmails moved to @/lib/email so the vendor-invitation panel
// and this box share one definition of a valid address. Two regexes drifting
// apart is how "but it worked on the other screen" bugs start.

export function ManageInvitedVendors({ tenderId, tenderStatus }: Props) {
  const confirm = useConfirm();
  const [invited, setInvited] = useState<InvitedVendor[] | null>(null);
  const [vendors, setVendors] = useState<VendorPickerItem[]>([]);
  const [picker, setPicker] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendorLoadError, setVendorLoadError] = useState<string | null>(null);

  // BUG-120 (2026-06-10): inline confirm state — replaces the old direct
  // click-to-POST with a confirm pane where the admin can add extras.
  const [pending, setPending] = useState<{ vendor: VendorPickerItem; extrasText: string } | null>(null);

  // BUG-120 (2026-06-10): edit-extras state for an already-invited row.
  const [editingExtras, setEditingExtras] = useState<{ vendorId: string; vendorName: string; extrasText: string } | null>(null);
  const [savingExtras, setSavingExtras] = useState(false);

  // BUG-123 (2026-06-11): per-row resend ("send reminder") state.
  const [resendingId, setResendingId] = useState<string | null>(null);

  const canAdd = ADD_STATUSES.has(tenderStatus);
  const canRemove = REMOVE_STATUSES.has(tenderStatus);
  const willDispatchNow = IMMEDIATE_DISPATCH.has(tenderStatus);

  async function refresh() {
    try {
      const token = getAccessToken();
      const list = await get<InvitedVendor[]>(`/tenders/${tenderId}/invited-vendors`, token);
      setInvited(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getAccessToken();
      try {
        const [inv, all] = await Promise.all([
          get<InvitedVendor[]>(`/tenders/${tenderId}/invited-vendors`, token),
          get<{ items: VendorPickerItem[] }>(`/vendors?pageSize=200&status=APPROVED`, token)
            .catch(err => {
              if (!cancelled) setVendorLoadError(err instanceof Error ? err.message : 'Failed to load vendor list');
              return { items: [] };
            }),
        ]);
        if (!cancelled) {
          setInvited(inv);
          setVendors(all.items ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [tenderId]);

  async function handleConfirmInvite() {
    if (!pending) return;
    setAdding(true);
    setError(null);
    try {
      const token = getAccessToken();
      const extraEmails = parseEmails(pending.extrasText);
      await post(
        `/tenders/${tenderId}/invited-vendors`,
        { vendorId: pending.vendor.id, extraEmails },
        token,
      );
      setPending(null);
      setPicker('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setAdding(false);
    }
  }

  async function handleSaveExtras() {
    if (!editingExtras) return;
    setSavingExtras(true);
    setError(null);
    try {
      const token = getAccessToken();
      const extraEmails = parseEmails(editingExtras.extrasText);
      await patch(
        `/tenders/${tenderId}/invited-vendors/${editingExtras.vendorId}/extra-emails`,
        { extraEmails },
        token,
      );
      setEditingExtras(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save extras');
    } finally {
      setSavingExtras(false);
    }
  }

  // BUG-123 (2026-06-11): fire a reminder email to a vendor that's already
  // been notified at least once. Backend uses the TENDER_INVITATION_REMINDER
  // template so the subject reads as a reminder, not a duplicate invite.
  async function handleResend(vendorId: string, vendorName: string) {
    const ok = await confirm({
      title: 'Send reminder',
      body: `Send a reminder invitation email to "${vendorName}"? They'll receive a fresh email with the tender link and deadline.`,
      confirmLabel: 'Send reminder',
    });
    if (!ok) return;
    setResendingId(vendorId);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/invited-vendors/${vendorId}/resend-invitation`, {}, token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setResendingId(null);
    }
  }

  async function handleRemove(vendorId: string, vendorName: string) {
    const ok = await confirm({
      title: 'Remove invitation',
      body: `Remove invitation for "${vendorName}"?`,
      destructive: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setError(null);
    try {
      const token = getAccessToken();
      await del(`/tenders/${tenderId}/invited-vendors/${vendorId}`, token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  const invitedIds = new Set((invited ?? []).map(i => i.vendorId));
  const availableVendors = vendors.filter(v => !invitedIds.has(v.id));

  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-text-primary">Invited Vendors</h3>
        <p className="text-xs text-text-secondary mt-1">
          INVITATION_ONLY tender · {invited?.length ?? '—'} invited
          {!canAdd && ' · invitations frozen at this status'}
          {canAdd && !canRemove && ' · invitees can be added but not removed at this status'}
        </p>
        {/* BUG-120 (2026-06-10): tell the admin when emails will actually go out. */}
        {canAdd && (
          <p className="text-xs text-text-secondary mt-1 italic">
            {willDispatchNow
              ? 'Invitation email fires immediately on add (tender is already Published).'
              : 'Invitation emails go out automatically when you Publish the tender.'}
          </p>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-xs text-danger flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {canAdd && (
        <div className="px-6 py-4 border-b border-border bg-bg space-y-3">
          <input
            type="text"
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            disabled={adding || !!pending}
            placeholder="Search vendors to invite…"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />

          {pending ? (
            /* BUG-120 (2026-06-10): inline confirm pane. */
            <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900 truncate">
                    Invite {pending.vendor.company}
                  </p>
                  <p className="text-xs text-amber-900/70">
                    Email goes to all registered users of this vendor + any extras below (BCC).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={adding}
                  className="text-text-secondary hover:text-text-primary p-1 rounded"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  <Mail className="inline w-3 h-3 mr-1" /> Extra recipients (optional)
                </span>
                <textarea
                  value={pending.extrasText}
                  onChange={(e) => setPending({ ...pending, extrasText: e.target.value })}
                  disabled={adding}
                  rows={2}
                  placeholder="email1@example.com, email2@example.com"
                  className="mt-1 w-full px-3 py-2 text-sm border border-amber-300 rounded bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
                <span className="block mt-1 text-[10px] text-text-secondary">
                  Comma, space, or newline separated. Each address is validated; invalid entries are dropped.
                </span>
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleConfirmInvite}
                  disabled={adding}
                  className="px-4 py-1.5 text-sm font-bold bg-amber-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
                >
                  {adding
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> {willDispatchNow ? 'Send invitation' : 'Add to invitation list'}</>}
                </button>
              </div>
            </div>
          ) : availableVendors.length > 0 ? (() => {
            const needle = picker.trim().toLowerCase();
            const matches = availableVendors.filter(v =>
              (v.company ?? '').toLowerCase().includes(needle),
            );
            return (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-white divide-y divide-border">
                {matches.map(v => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setPending({ vendor: v, extrasText: '' })}
                      disabled={adding}
                      className="w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                    >
                      <span>{v.company ?? '(unnamed vendor)'}</span>
                      <Plus className="w-4 h-4 text-accent" />
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2 text-xs text-text-secondary italic">No match for "{picker.trim()}"</li>
                )}
              </ul>
            );
          })() : (
            <p className="text-xs text-text-secondary leading-relaxed">
              {vendorLoadError ? (
                <>Cannot load vendors: <span className="text-danger">{vendorLoadError}</span>. The picker requires the <code className="bg-bg px-1 rounded">vendor:view</code> permission.</>
              ) : vendors.length === 0 ? (
                <>No APPROVED vendors found. Approve at least one vendor under <strong>Vendors → Pending Approval</strong> before inviting.</>
              ) : (
                <>Every APPROVED vendor ({vendors.length}) is already invited. Remove someone first if you need to swap.</>
              )}
            </p>
          )}
        </div>
      )}

      {invited === null ? (
        <div className="py-8 text-center text-sm text-text-secondary">Loading…</div>
      ) : invited.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-secondary">No vendors invited yet.</p>
          <p className="text-xs text-text-secondary mt-1">At least 3 invitees required before Publish.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {invited.map((iv) => {
            const extras = iv.extraEmails ?? [];
            const editingThis = editingExtras?.vendorId === iv.vendorId;
            return (
              <li key={iv.vendorId} className="px-6 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{iv.vendorName}</p>
                    <p className="text-xs text-text-secondary">
                      Invited {new Date(iv.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {iv.vendorStatus !== 'APPROVED' && ` · ${iv.vendorStatus}`}
                      {iv.notifiedAt && (
                        <span className="ml-2 text-emerald-700">
                          · email sent {new Date(iv.notifiedAt).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </p>
                    {extras.length > 0 && !editingThis && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        + {extras.length} extra recipient{extras.length === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* BUG-123 (2026-06-11): send reminder. Only available
                        when the tender is Published / Clarification Period
                        (i.e. there's something to remind about) AND the
                        vendor has already been notified at least once. */}
                    {iv.notifiedAt && willDispatchNow && !editingThis && (
                      <button
                        onClick={() => handleResend(iv.vendorId, iv.vendorName)}
                        disabled={resendingId === iv.vendorId}
                        className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-wait"
                        title="Send reminder email"
                      >
                        {resendingId === iv.vendorId
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Send className="w-4 h-4" />}
                      </button>
                    )}
                    {/* BUG-120 (2026-06-10): edit-extras chip. Allowed at any
                        status where adding is allowed (extras still useful
                        post-publish for the next dispatch cycle). */}
                    {canAdd && !editingThis && (
                      <button
                        onClick={() => setEditingExtras({
                          vendorId: iv.vendorId,
                          vendorName: iv.vendorName,
                          extrasText: extras.join(', '),
                        })}
                        className="p-1.5 text-text-secondary hover:text-accent hover:bg-accent/5 rounded-lg transition-colors"
                        title="Edit extra recipients"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canRemove && !editingThis && (
                      <button
                        onClick={() => handleRemove(iv.vendorId, iv.vendorName)}
                        className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg transition-colors"
                        title="Remove invitation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {editingThis && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-2">
                    <p className="text-xs text-amber-900">
                      Edit ad-hoc recipients (BCC'd alongside the vendor's registered users). Saving doesn't re-send the email — extras apply to the next dispatch.
                    </p>
                    <textarea
                      value={editingExtras.extrasText}
                      onChange={(e) => setEditingExtras({ ...editingExtras, extrasText: e.target.value })}
                      disabled={savingExtras}
                      rows={2}
                      placeholder="email1@example.com, email2@example.com"
                      className="w-full px-3 py-2 text-sm border border-amber-300 rounded bg-white text-slate-900 placeholder:text-slate-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingExtras(null)}
                        disabled={savingExtras}
                        className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveExtras}
                        disabled={savingExtras}
                        className="px-3 py-1.5 text-sm font-bold bg-amber-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
                      >
                        {savingExtras ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
