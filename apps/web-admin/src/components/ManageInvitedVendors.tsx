'use client';

import { useEffect, useState } from 'react';
import { Plus, X, AlertCircle, Loader2 } from 'lucide-react';
import { get, post, del } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';

interface InvitedVendor {
  vendorId: string;
  vendorName: string;
  vendorStatus: string;
  invitedAt: string;
}

interface VendorPickerItem {
  id: string;
  companyName: string;
  status: string;
}

interface Props {
  tenderId: string;
  tenderStatus: string;
}

/**
 * BUG-015: per-tender invited-vendors panel. Renders only when the parent
 * page knows the tender is INVITATION_ONLY. Add-yes / remove-no after Publish,
 * until Submission Closed (server enforces; UI also disables Remove when
 * status ∉ {Draft, Internal Review, Approved}).
 */
const ADD_STATUSES = new Set(['Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period']);
const REMOVE_STATUSES = new Set(['Draft', 'Internal Review', 'Approved']);

export function ManageInvitedVendors({ tenderId, tenderStatus }: Props) {
  const confirm = useConfirm();
  const [invited, setInvited] = useState<InvitedVendor[] | null>(null);
  const [vendors, setVendors] = useState<VendorPickerItem[]>([]);
  const [picker, setPicker] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = ADD_STATUSES.has(tenderStatus);
  const canRemove = REMOVE_STATUSES.has(tenderStatus);

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
          get<{ data: VendorPickerItem[] }>(`/vendors?pageSize=200&status=APPROVED`, token).catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setInvited(inv);
          setVendors(all.data ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [tenderId]);

  async function handleAdd() {
    if (!picker) return;
    setAdding(true);
    setError(null);
    try {
      const token = getAccessToken();
      await post(`/tenders/${tenderId}/invited-vendors`, { vendorId: picker }, token);
      setPicker('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setAdding(false);
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
          {canAdd && !canRemove && ' · post-publish: invitees can be added but not removed'}
        </p>
      </div>

      {error && (
        <div className="px-6 py-2 bg-danger/5 border-b border-danger/20 text-xs text-danger flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {canAdd && (
        <div className="px-6 py-4 border-b border-border bg-bg flex items-center gap-2">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            disabled={adding}
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Pick a vendor to invite…</option>
            {availableVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.companyName}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!picker || adding}
            className="px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Invite
          </button>
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
          {invited.map((iv) => (
            <li key={iv.vendorId} className="px-6 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{iv.vendorName}</p>
                <p className="text-xs text-text-secondary">
                  Invited {new Date(iv.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {iv.vendorStatus !== 'APPROVED' && ` · ${iv.vendorStatus}`}
                </p>
              </div>
              {canRemove && (
                <button
                  onClick={() => handleRemove(iv.vendorId, iv.vendorName)}
                  className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg transition-colors"
                  title="Remove invitation"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
