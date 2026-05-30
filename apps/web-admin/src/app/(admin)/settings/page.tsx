'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post, patch, del } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { ShieldCheck, Mail, MessageSquare, Bell, Building2, Users, Plus, Pencil, Trash2 } from 'lucide-react';

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

interface Department {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
}

interface UserRoleSummary {
  id: string;
  name: string;
}

interface UserDepartmentSummary {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

interface InternalUser {
  id: string;
  email: string;
  displayName: string;
  adUsername?: string | null;
  authType: 'AD' | 'LOCAL';
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastLoginAt?: string | null;
  createdAt: string;
  roles: UserRoleSummary[];
  departments: UserDepartmentSummary[];
}

type Tab = 'ROLES' | 'TEMPLATES' | 'PLATFORM' | 'DEPARTMENTS' | 'USERS';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ROLES');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Platform Settings &amp; Control</h1>
      </div>

      <div className="flex gap-6 border-b border-border">
        {([
          { key: 'ROLES', label: 'Roles & Permissions' },
          { key: 'USERS', label: 'Users' },
          { key: 'DEPARTMENTS', label: 'Departments' },
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
      {tab === 'USERS' && <UsersTab />}
      {tab === 'DEPARTMENTS' && <DepartmentsTab />}
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
  // WALK-035: minimal create-role form state.
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({ code: '', name: '', description: '' });
  const [creating, setCreating] = useState(false);

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

  // WALK-035: admin-driven role creation. Backend already supports
  // POST /roles with `{ code, name, description }`. New roles start with
  // zero permissions and can be configured via the right-pane checkboxes.
  async function handleCreate() {
    const code = createDraft.code.trim().toUpperCase();
    const name = createDraft.name.trim();
    if (!code || !name) {
      setError('Role code and name are required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const token = getAccessToken();
      const created = await post<{ id: string }>(
        '/roles',
        { code, name, description: createDraft.description.trim() || null },
        token,
      );
      setShowCreate(false);
      setCreateDraft({ code: '', name: '', description: '' });
      await loadAll();
      if (created?.id) setSelectedRoleId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setCreating(false);
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
        {/* WALK-035: admin-driven role creation. Inline form keeps the
            workflow on this page rather than a modal. */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Roles & permissions
          </p>
          {!showCreate ? (
            <button
              onClick={() => { setShowCreate(true); setError(null); }}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-bold hover:opacity-90"
            >
              + Create Role
            </button>
          ) : (
            <button
              onClick={() => { setShowCreate(false); setCreateDraft({ code: '', name: '', description: '' }); setError(null); }}
              className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg"
            >
              Cancel
            </button>
          )}
        </div>
        {showCreate && (
          <div className="px-5 py-4 border-b border-border bg-bg/30 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-1">Code</label>
                <input
                  type="text"
                  value={createDraft.code}
                  onChange={e => setCreateDraft(d => ({ ...d, code: e.target.value }))}
                  placeholder="e.g. PROCUREMENT_ASSISTANT"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-1">Display name</label>
                <input
                  type="text"
                  value={createDraft.name}
                  onChange={e => setCreateDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Procurement Assistant"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-1">Description (optional)</label>
              <input
                type="text"
                value={createDraft.description}
                onChange={e => setCreateDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="What this role is for"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !createDraft.code.trim() || !createDraft.name.trim()}
                className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40"
              >
                {creating ? 'Creating…' : 'Create role'}
              </button>
            </div>
            <p className="text-[11px] text-text-secondary italic">
              New role starts with zero permissions. Tick the boxes on the right pane after creation and click Save.
            </p>
          </div>
        )}
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
          <ShieldCheck className="w-5 h-5 text-accent" />
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
                          /* WALK-039: previously disabled when selectedRole.isSystem;
                             admin must be able to edit grants on system roles too. */
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
                disabled={!dirty || saving}
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
                    {t.channel === 'EMAIL' ? (
                      <Mail className="w-5 h-5 text-accent" />
                    ) : t.channel === 'SMS' ? (
                      <MessageSquare className="w-5 h-5 text-accent" />
                    ) : (
                      <Bell className="w-5 h-5 text-accent" />
                    )}
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

// ─── Departments tab ──────────────────────────────────────────────────────────

function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [draft, setDraft] = useState<{ code: string; name: string; parentId: string | null }>({ code: '', name: '', parentId: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<{ data: Department[] }>(
        `/departments?includeInactive=${showInactive}&pageSize=500`,
        token,
      ).catch(() => ({ data: [] }));
      setDepartments(res.data ?? []);
    } finally { setLoading(false); }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setDraft({ code: '', name: '', parentId: null });
    setError(null);
    setEditing('new');
  }
  function startEdit(d: Department) {
    setDraft({ code: d.code, name: d.name, parentId: d.parentId });
    setError(null);
    setEditing(d);
  }
  function cancel() {
    setEditing(null);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (editing === 'new') {
        await post('/departments', {
          code: draft.code.trim(),
          name: draft.name.trim(),
          parentId: draft.parentId || undefined,
        }, token);
      } else if (editing) {
        await patch(`/departments/${editing.id}`, {
          name: draft.name.trim(),
          parentId: draft.parentId,
        }, token);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDisable(d: Department) {
    if (!confirm(`Disable department "${d.name}"? Users assigned to it keep their assignment, but the department is hidden from new selections.`)) return;
    try {
      const token = getAccessToken();
      await del(`/departments/${d.id}`, token);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disable');
    }
  }

  async function handleReactivate(d: Department) {
    try {
      const token = getAccessToken();
      await patch(`/departments/${d.id}`, { isActive: true }, token);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate');
    }
  }

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  const eligibleParents = departments.filter(
    d => d.isActive && (editing === 'new' ? true : editing && d.id !== editing.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-4 h-4 rounded text-accent"
          />
          Show inactive
        </label>
        <button
          onClick={startNew}
          disabled={editing !== null}
          className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New Department
        </button>
      </div>

      {editing && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-bold text-text-primary">
              {editing === 'new' ? 'Create Department' : `Edit ${editing.code}`}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">
                Code <span className="text-danger">*</span>
              </label>
              <input
                value={draft.code}
                onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                disabled={editing !== 'new'}
                placeholder="e.g. PROC"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-border/30 disabled:cursor-not-allowed"
              />
              {editing !== 'new' && <p className="text-[10px] text-text-secondary mt-0.5">Code is immutable after creation.</p>}
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">
                Name <span className="text-danger">*</span>
              </label>
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Procurement"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">Parent Department</label>
              <select
                value={draft.parentId ?? ''}
                onChange={e => setDraft({ ...draft, parentId: e.target.value || null })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">— None (top-level) —</option>
                {eligibleParents.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={cancel}
              className="px-4 py-1.5 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.code.trim() || !draft.name.trim()}
              className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Code</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Name</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Parent</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {departments.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-text-secondary">No departments configured.</td></tr>
            ) : departments.map(d => {
              const parent = d.parentId ? departments.find(p => p.id === d.parentId) : null;
              return (
                <tr key={d.id} className={d.isActive ? '' : 'opacity-60'}>
                  <td className="px-5 py-3 font-mono text-text-primary">{d.code}</td>
                  <td className="px-5 py-3 font-semibold text-text-primary">{d.name}</td>
                  <td className="px-5 py-3 text-text-secondary">{parent ? `${parent.name} (${parent.code})` : '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      d.isActive ? 'bg-success/10 text-success' : 'bg-border text-text-secondary'
                    }`}>{d.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => startEdit(d)}
                      disabled={editing !== null}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded disabled:opacity-40"
                    ><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    {d.isActive ? (
                      <button
                        onClick={() => handleDisable(d)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10 rounded ml-1"
                      ><Trash2 className="w-3.5 h-3.5" /> Disable</button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(d)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-success hover:bg-success/10 rounded ml-1"
                      >Reactivate</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<InternalUser | 'new' | null>(null);
  const [draft, setDraft] = useState<{
    email: string;
    displayName: string;
    authType: 'AD' | 'LOCAL';
    adUsername: string;
    password: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
    roleId: string;
    departmentIds: string[];
    primaryDepartmentId: string;
  }>({
    email: '', displayName: '', authType: 'AD', adUsername: '', password: '',
    status: 'ACTIVE', roleId: '', departmentIds: [], primaryDepartmentId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const [usersRes, rolesRes, deptRes] = await Promise.all([
        get<{ data: InternalUser[] }>('/users', token).catch(() => ({ data: [] })),
        get<{ items: Role[] }>('/roles', token).catch(() => ({ items: [] })),
        get<{ data: Department[] }>('/departments?pageSize=500', token).catch(() => ({ data: [] })),
      ]);
      setUsers(usersRes.data ?? []);
      setRoles(rolesRes.items ?? []);
      setDepartments(deptRes.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setDraft({
      email: '', displayName: '', authType: 'AD', adUsername: '', password: '',
      status: 'ACTIVE', roleId: '', departmentIds: [], primaryDepartmentId: '',
    });
    setError(null);
    setEditing('new');
  }

  function startEdit(u: InternalUser) {
    setDraft({
      email: u.email,
      displayName: u.displayName,
      authType: u.authType,
      adUsername: u.adUsername ?? '',
      password: '',
      status: u.status,
      roleId: u.roles[0]?.id ?? '',
      departmentIds: u.departments.map(d => d.id),
      primaryDepartmentId: u.departments.find(d => d.isPrimary)?.id ?? '',
    });
    setError(null);
    setEditing(u);
  }

  function cancel() { setEditing(null); setError(null); }

  function toggleDept(id: string) {
    setDraft(d => {
      const has = d.departmentIds.includes(id);
      const departmentIds = has ? d.departmentIds.filter(x => x !== id) : [...d.departmentIds, id];
      const primaryDepartmentId = departmentIds.includes(d.primaryDepartmentId)
        ? d.primaryDepartmentId
        : (departmentIds[0] ?? '');
      return { ...d, departmentIds, primaryDepartmentId };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      const payload: Record<string, unknown> = {
        email: draft.email.trim(),
        displayName: draft.displayName.trim(),
      };
      if (draft.password) payload.password = draft.password;
      if (draft.roleId) payload.roleId = draft.roleId;
      if (draft.departmentIds.length > 0) {
        payload.departmentIds = draft.departmentIds;
        payload.primaryDepartmentId = draft.primaryDepartmentId || undefined;
      }
      if (editing === 'new') {
        // authType is set at creation only — immutable post-create per backend rule.
        payload.authType = draft.authType;
        if (draft.authType === 'AD') payload.adUsername = draft.adUsername.trim() || undefined;
        await post('/users', payload, token);
      } else if (editing) {
        payload.status = draft.status;
        // PATCH replaces role/depts only when provided; we always send so user can clear by un-checking
        payload.departmentIds = draft.departmentIds;
        await patch(`/users/${editing.id}`, payload, token);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDisable(u: InternalUser) {
    if (!confirm(`Disable user "${u.displayName}"? They will lose access immediately.`)) return;
    try {
      const token = getAccessToken();
      await del(`/users/${u.id}`, token);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disable');
    }
  }

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  const activeDepartments = departments.filter(d => d.isActive || draft.departmentIds.includes(d.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{users.length} user{users.length === 1 ? '' : 's'}</p>
        <button
          onClick={startNew}
          disabled={editing !== null}
          className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New User
        </button>
      </div>

      {editing && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-bold text-text-primary">
              {editing === 'new' ? 'Create User' : `Edit ${editing.displayName}`}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Display Name" required>
              <input value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Email" required>
              <input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Auth Type">
              <select
                value={draft.authType}
                onChange={e => setDraft({ ...draft, authType: e.target.value as 'AD' | 'LOCAL' })}
                disabled={editing !== 'new'}
                className={inputCls + ' disabled:bg-border/30'}
              >
                <option value="AD">Active Directory</option>
                <option value="LOCAL">Local password</option>
              </select>
              {editing !== 'new' && <p className="text-[10px] text-text-secondary mt-0.5">Auth type is immutable after creation.</p>}
            </Field>
            {draft.authType === 'AD' && (
              <Field label="AD Username" required>
                <input value={draft.adUsername} onChange={e => setDraft({ ...draft, adUsername: e.target.value })} className={inputCls + ' font-mono'} />
              </Field>
            )}
            {draft.authType === 'LOCAL' && (
              <Field label={editing === 'new' ? 'Password' : 'Reset Password (leave blank to keep)'} required={editing === 'new'}>
                <input
                  type="password"
                  value={draft.password}
                  onChange={e => setDraft({ ...draft, password: e.target.value })}
                  placeholder={editing === 'new' ? 'Min 8 characters' : '••••••••'}
                  className={inputCls + ' font-mono'}
                />
              </Field>
            )}
            <Field label="Role">
              <select value={draft.roleId} onChange={e => setDraft({ ...draft, roleId: e.target.value })} className={inputCls}>
                <option value="">— None —</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            {editing !== 'new' && (
              <Field label="Status">
                <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as 'ACTIVE' | 'SUSPENDED' | 'DISABLED' })} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </Field>
            )}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-2">Departments</label>
            {activeDepartments.length === 0 ? (
              <p className="text-xs text-text-secondary italic">No departments configured.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {activeDepartments.map(d => {
                  const checked = draft.departmentIds.includes(d.id);
                  const isPrimary = draft.primaryDepartmentId === d.id;
                  return (
                    <div key={d.id} className={`border rounded-lg p-2.5 ${checked ? 'border-accent bg-accent/5' : 'border-border'}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => toggleDept(d.id)} className="mt-0.5 w-4 h-4 rounded text-accent" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{d.name}</p>
                          <p className="text-[10px] font-mono text-text-secondary">{d.code}</p>
                        </div>
                      </label>
                      {checked && (
                        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-[11px] text-text-secondary">
                          <input
                            type="radio"
                            name="primaryDept"
                            checked={isPrimary}
                            onChange={() => setDraft({ ...draft, primaryDepartmentId: d.id })}
                            className="w-3 h-3 text-accent"
                          />
                          Primary
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={cancel} className="px-4 py-1.5 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.email.trim() || !draft.displayName.trim()}
              className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">User</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Auth</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Role</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Departments</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-text-secondary">No users configured.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={u.status === 'DISABLED' ? 'opacity-60' : ''}>
                <td className="px-5 py-3">
                  <p className="font-semibold text-text-primary">{u.displayName}</p>
                  <p className="text-[11px] text-text-secondary">{u.email}</p>
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    u.authType === 'LOCAL' ? 'bg-amber-50 text-amber-700' : 'bg-accent/10 text-accent'
                  }`}>{u.authType}</span>
                  {u.adUsername && <p className="text-[11px] font-mono text-text-secondary mt-0.5">{u.adUsername}</p>}
                </td>
                <td className="px-5 py-3 text-text-secondary">{u.roles[0]?.name ?? '—'}</td>
                <td className="px-5 py-3">
                  {u.departments.length === 0 ? (
                    <span className="text-text-secondary">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.departments.map(d => (
                        <span
                          key={d.id}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            d.isPrimary ? 'bg-accent/15 text-accent font-bold' : 'bg-bg text-text-secondary'
                          }`}
                          title={d.name}
                        >{d.code}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    u.status === 'ACTIVE' ? 'bg-success/10 text-success'
                      : u.status === 'SUSPENDED' ? 'bg-amber-50 text-amber-700'
                      : 'bg-border text-text-secondary'
                  }`}>{u.status}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => startEdit(u)}
                    disabled={editing !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/10 rounded disabled:opacity-40"
                  ><Pencil className="w-3.5 h-3.5" /> Edit</button>
                  {u.status !== 'DISABLED' && (
                    <button
                      onClick={() => handleDisable(u)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger/10 rounded ml-1"
                    ><Trash2 className="w-3.5 h-3.5" /> Disable</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
