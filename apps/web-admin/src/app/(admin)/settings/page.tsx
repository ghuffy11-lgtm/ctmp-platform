'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post, patch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  description?: string;
  permissionCount: number;
  userCount?: number;
  isSystem?: boolean;
}

interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
  group?: string;
}

interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: 'EMAIL' | 'IN_APP' | 'SMS';
  subject?: string;
  bodyTemplate: string;
  enabled: boolean;
}

interface PlatformSetting {
  key: string;
  value: string;
  description?: string;
  category?: string;
  type?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
}

type Tab = 'ROLES' | 'TEMPLATES' | 'PLATFORM';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ROLES');
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-text-secondary mb-1">System → Configuration</p>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Platform Settings &amp; Control</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure enterprise-wide rules, security policies, role permissions, and notification templates.
        </p>
      </div>

      <div className="flex gap-6 border-b border-border">
        {([
          { key: 'ROLES', label: 'Roles & Permissions' },
          { key: 'TEMPLATES', label: 'Notification Templates' },
          { key: 'PLATFORM', label: 'Platform Settings' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ROLES' && <RolesTab />}
      {tab === 'TEMPLATES' && <TemplatesTab />}
      {tab === 'PLATFORM' && <PlatformTab />}
    </div>
  );
}

// ─── Roles tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const [rolesRes, permsRes] = await Promise.all([
        get<{ items: Role[] }>('/roles', token).catch(() => ({ items: [] })),
        get<{ items: Permission[] }>('/permissions', token).catch(() => ({ items: [] })),
      ]);
      setRoles(rolesRes.items ?? []);
      setPermissions(permsRes.items ?? []);
      if (rolesRes.items?.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesRes.items[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    async function loadRolePerms() {
      if (!selectedRoleId) return;
      setDirty(false);
      try {
        const token = getAccessToken();
        const res = await get<{ permissionIds: string[] }>(
          `/roles/${selectedRoleId}/permissions`,
          token,
        ).catch(() => ({ permissionIds: [] }));
        setRolePerms(new Set(res.permissionIds));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load role permissions');
      }
    }
    loadRolePerms();
  }, [selectedRoleId]);

  function togglePerm(permId: string) {
    setRolePerms(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId); else next.add(permId);
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!selectedRoleId) return;
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      await patch(
        `/roles/${selectedRoleId}/permissions`,
        { permissionIds: Array.from(rolePerms) },
        token,
      );
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null;
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const g = p.group ?? 'General';
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  return (
    <div className="grid grid-cols-12 gap-5">
      <div className="col-span-12 lg:col-span-7 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Role</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Description</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Permissions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roles.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-text-secondary">No roles configured.</td></tr>
            ) : (
              roles.map(r => {
                const isSel = r.id === selectedRoleId;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRoleId(r.id)}
                    className={`cursor-pointer transition-colors ${isSel ? 'bg-accent/5' : 'hover:bg-bg/60'}`}
                  >
                    <td className="px-5 py-3 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-accent' : 'bg-border'}`} />
                      <span className="font-semibold text-text-primary">{r.name}</span>
                      {r.isSystem && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-50 text-amber-700">System</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-text-secondary text-xs">{r.description ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
                        {r.permissionCount} active
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="col-span-12 lg:col-span-5 bg-card rounded-xl border border-border shadow-sm p-5 flex flex-col sticky top-4 h-fit max-h-[calc(100vh-180px)]">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <h3 className="text-sm font-bold text-text-primary">
            {selectedRole ? `${selectedRole.name} Permissions` : 'Select a role'}
          </h3>
          <span className="material-symbols-outlined text-[20px] text-accent">shield_person</span>
        </div>
        {!selectedRole ? (
          <p className="text-sm text-text-secondary text-center py-6">Select a role to edit permissions.</p>
        ) : permissions.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-6 italic">
            No permissions catalogue loaded. Endpoint <code>GET /permissions</code> pending.
          </p>
        ) : (
          <>
            <div className="overflow-y-auto pr-1 space-y-5 flex-1">
              {Object.entries(grouped).map(([group, perms]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-2">{group}</p>
                  <div className="space-y-1.5">
                    {perms.map(p => (
                      <label
                        key={p.id}
                        className="flex items-start gap-2.5 cursor-pointer hover:bg-bg p-1.5 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={rolePerms.has(p.id)}
                          onChange={() => togglePerm(p.id)}
                          disabled={selectedRole.isSystem}
                          className="mt-0.5 w-4 h-4 rounded text-accent border-border focus:ring-1 focus:ring-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary leading-tight">{p.name}</p>
                          <p className="text-[11px] text-text-secondary font-mono">{p.code}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <p className="text-xs text-danger mt-3">{error}</p>
            )}
            <div className="border-t border-border pt-4 mt-4 flex items-center justify-between">
              <p className="text-xs text-text-secondary">
                {rolePerms.size} of {permissions.length} permissions
              </p>
              <button
                onClick={handleSave}
                disabled={!dirty || saving || selectedRole.isSystem}
                className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<NotificationTemplate>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const res = await get<{ items: NotificationTemplate[] }>(
          '/notification-templates',
          token,
        ).catch(() => ({ items: [] }));
        setTemplates(res.items ?? []);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  function startEdit(t: NotificationTemplate) {
    setEditingId(t.id);
    setDraft({ subject: t.subject, bodyTemplate: t.bodyTemplate, enabled: t.enabled });
  }

  async function handleSave(t: NotificationTemplate) {
    try {
      const token = getAccessToken();
      await patch(`/notification-templates/${t.id}`, draft, token);
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, ...draft } as NotificationTemplate : x));
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-text-secondary">
          No notification templates configured.
        </div>
      ) : (
        templates.map(t => {
          const isEditing = editingId === t.id;
          return (
            <div key={t.id} className="bg-card rounded-xl border border-border shadow-sm">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px] text-accent">
                      {t.channel === 'EMAIL' ? 'mail' : t.channel === 'SMS' ? 'sms' : 'notifications'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{t.name}</p>
                    <p className="text-[11px] font-mono text-text-secondary">{t.code} · {t.channel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    t.enabled ? 'bg-success/10 text-success' : 'bg-border text-text-secondary'
                  }`}>
                    {t.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(t)}
                      className="px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {isEditing ? (
                <div className="p-4 space-y-3">
                  {t.channel === 'EMAIL' && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">Subject</label>
                      <input
                        value={draft.subject ?? ''}
                        onChange={e => setDraft({ ...draft, subject: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">Body Template</label>
                    <textarea
                      value={draft.bodyTemplate ?? ''}
                      onChange={e => setDraft({ ...draft, bodyTemplate: e.target.value })}
                      rows={8}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <p className="text-[11px] text-text-secondary mt-1 italic">
                      Variables: {'{{vendorName}}'}, {'{{tenderReference}}'}, {'{{actionUrl}}'}.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={draft.enabled ?? false}
                      onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
                      className="w-4 h-4 rounded text-accent"
                    />
                    Enabled
                  </label>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSave(t)}
                      className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  {t.subject && <p className="text-xs text-text-secondary mb-1"><strong>Subject:</strong> {t.subject}</p>}
                  <pre className="text-xs font-mono text-text-secondary bg-bg p-3 rounded-lg overflow-x-auto whitespace-pre-wrap line-clamp-4">
                    {t.bodyTemplate}
                  </pre>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Platform tab ─────────────────────────────────────────────────────────────

function PlatformTab() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const res = await get<{ items: PlatformSetting[] }>('/system-settings', token).catch(() => ({ items: [] }));
        setSettings(res.items ?? []);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  function changed(key: string): boolean {
    return key in edits && edits[key] !== settings.find(s => s.key === key)?.value;
  }

  const dirty = Object.keys(edits).some(changed);

  async function handleSave() {
    setSaving(true);
    try {
      const token = getAccessToken();
      const updates = Object.entries(edits)
        .filter(([k]) => changed(k))
        .map(([key, value]) => ({ key, value }));
      await post('/system-settings/batch', { updates }, token);
      setSettings(prev => prev.map(s => key2Updated(s, edits)));
      setEdits({});
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  const grouped = settings.reduce<Record<string, PlatformSetting[]>>((acc, s) => {
    const c = s.category ?? 'General';
    (acc[c] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {settings.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-text-secondary">
          No platform settings exposed. Endpoint <code>GET /system-settings</code> pending.
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="bg-card rounded-xl border border-border shadow-sm">
            <div className="px-5 py-3 border-b border-border bg-bg">
              <h3 className="text-sm font-bold text-text-primary">{cat}</h3>
            </div>
            <div className="divide-y divide-border">
              {items.map(s => (
                <div key={s.key} className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div>
                    <p className="text-sm font-semibold text-text-primary font-mono">{s.key}</p>
                    {s.description && <p className="text-xs text-text-secondary mt-0.5">{s.description}</p>}
                  </div>
                  <div className="md:col-span-2">
                    {s.type === 'BOOLEAN' ? (
                      <select
                        value={edits[s.key] ?? s.value}
                        onChange={e => setEdits({ ...edits, [s.key]: e.target.value })}
                        className="px-3 py-2 border border-border rounded-lg text-sm bg-bg w-full md:w-40 focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type={s.type === 'NUMBER' ? 'number' : 'text'}
                        value={edits[s.key] ?? s.value}
                        onChange={e => setEdits({ ...edits, [s.key]: e.target.value })}
                        className="px-3 py-2 border border-border rounded-lg text-sm bg-bg w-full font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {settings.length > 0 && (
        <div className="flex justify-end gap-2 sticky bottom-0 bg-bg/80 backdrop-blur-sm py-3">
          <button
            onClick={() => setEdits({})}
            disabled={!dirty}
            className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-card disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

function key2Updated(s: PlatformSetting, edits: Record<string, string>): PlatformSetting {
  return s.key in edits ? { ...s, value: edits[s.key] } : s;
}
