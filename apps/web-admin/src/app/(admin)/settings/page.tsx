'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post, patch, del } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';
import { ShieldCheck, Mail, MessageSquare, Bell, Building2, Users, Plus, Pencil, Trash2, Image as ImageIcon, Server, Lock, Clock, Upload as UploadIcon, Settings as SettingsIcon } from 'lucide-react';

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
  // BUG-107 Piece 5: encrypted rows display as a sentinel value; admin updates
  // via the dedicated secure-set endpoint, not the batch update path.
  isEncrypted?: boolean;
  readOnly?: boolean;
}

interface Department {
  id: string;
  code: string;
  name: string;
  // Migration 054 (2026-08-13): Arabic name for /executive-ar. Null = use name.
  nameAr?: string | null;
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

type Tab = 'ROLES' | 'TEMPLATES' | 'PLATFORM' | 'DEPARTMENTS' | 'CATEGORIES' | 'USERS';

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
          { key: 'CATEGORIES', label: 'Tender Categories' },
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
      {tab === 'CATEGORIES' && <CategoriesTab />}
      {tab === 'TEMPLATES' && <TemplatesTab />}
      {tab === 'PLATFORM' && <PlatformTab />}
    </div>
  );
}

// ─── Roles tab ────────────────────────────────────────────────────────────────

// BUG-093 (2026-06-02): catalogue of sidebar entries an admin can hide per
// role. Kept in sync with apps/web-admin/src/components/layout/Sidebar.tsx.
// `href` is the stable key written to roles.hidden_sidebar_items.
const SIDEBAR_CATALOGUE: { href: string; label: string }[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/executive', label: 'Executive' },
  { href: '/tenders', label: 'Tenders' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/clarifications', label: 'Clarifications' },
  { href: '/technical-evaluation', label: 'Technical Evaluation' },
  { href: '/technical-comparison', label: 'Technical Comparison' },
  { href: '/committee-opening', label: 'Committee & Commercial' },
  { href: '/commercial-comparison', label: 'Commercial Comparison' },
  { href: '/awarded-tenders', label: 'Awarded Tenders' },
  { href: '/vendors', label: 'Vendor Management' },
  { href: '/reports', label: 'Reports' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/security-alerts', label: 'Security Alerts' },
  { href: '/settings/evaluation-criteria', label: 'Evaluation Criteria' },
  { href: '/settings', label: 'System Configuration' },
];

function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-093: per-role sidebar hide list. Loaded from `/roles/:id` and edited
  // with the checkboxes in the new "Hidden sidebar entries" section.
  const [hiddenSidebar, setHiddenSidebar] = useState<Set<string>>(new Set());
  const [hiddenDirty, setHiddenDirty] = useState(false);
  const [savingHidden, setSavingHidden] = useState(false);
  // BUG-107 Piece 4: per-role custom labels for sidebar entries. Keyed by href.
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [labelDirty, setLabelDirty] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);
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
      setHiddenDirty(false);
      try {
        const token = getAccessToken();
        const [permsRes, roleRes] = await Promise.all([
          get<{ permissionIds: string[] }>(`/roles/${selectedRoleId}/permissions`, token).catch(() => ({ permissionIds: [] })),
          // BUG-093 + BUG-107 Piece 4: roles detail returns hiddenSidebarItems + sidebarLabelOverrides.
          get<{ hiddenSidebarItems?: string[]; sidebarLabelOverrides?: Record<string, string> }>(`/roles/${selectedRoleId}`, token)
            .catch(() => ({ hiddenSidebarItems: [], sidebarLabelOverrides: {} })),
        ]);
        setRolePerms(new Set(permsRes.permissionIds));
        setHiddenSidebar(new Set(roleRes.hiddenSidebarItems ?? []));
        setLabelOverrides(roleRes.sidebarLabelOverrides ?? {});
        setLabelDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load role permissions');
      }
    }
    loadRolePerms();
  }, [selectedRoleId]);

  function toggleHidden(href: string) {
    setHiddenSidebar(prev => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href); else next.add(href);
      return next;
    });
    setHiddenDirty(true);
  }

  async function handleSaveHidden() {
    if (!selectedRoleId) return;
    setSavingHidden(true);
    setError(null);
    try {
      const token = getAccessToken();
      await patch(
        `/roles/${selectedRoleId}/hidden-sidebar`,
        { items: Array.from(hiddenSidebar) },
        token,
      );
      setHiddenDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sidebar hide list');
    } finally {
      setSavingHidden(false);
    }
  }

  // BUG-107 Piece 4: save sidebar label overrides for the selected role.
  async function handleSaveLabels() {
    if (!selectedRoleId) return;
    setSavingLabels(true);
    setError(null);
    try {
      const token = getAccessToken();
      // Strip empty values — sending empty string for an href means "clear override".
      const clean: Record<string, string> = {};
      for (const [h, l] of Object.entries(labelOverrides)) {
        if (typeof l === 'string' && l.trim() !== '') clean[h] = l.trim();
      }
      await patch(
        `/roles/${selectedRoleId}/sidebar-labels`,
        { overrides: clean },
        token,
      );
      setLabelOverrides(clean);
      setLabelDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save label overrides');
    } finally {
      setSavingLabels(false);
    }
  }

  function setLabelOverride(href: string, label: string) {
    setLabelOverrides(prev => ({ ...prev, [href]: label }));
    setLabelDirty(true);
  }

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
              {/* BUG-093: Hidden sidebar entries — independent of permissions.
                   Owner explicitly wanted a way to hide menu items without
                   stripping data perms. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Hidden sidebar entries</p>
                  <button
                    onClick={handleSaveHidden}
                    disabled={!hiddenDirty || savingHidden}
                    className="px-3 py-1 bg-accent text-white rounded text-[11px] font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingHidden ? 'Saving…' : 'Save hide list'}
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary mb-2 italic">
                  Tick to hide that sidebar entry for users in this role. Data permissions stay intact — the user can still reach those screens through other surfaces (e.g. Awarded Tenders archive).
                </p>
                <div className="space-y-1 bg-bg/30 border border-border rounded-lg p-2">
                  {SIDEBAR_CATALOGUE.map(item => (
                    <label
                      key={item.href}
                      className="flex items-center gap-2.5 cursor-pointer hover:bg-bg p-1.5 rounded transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={hiddenSidebar.has(item.href)}
                        onChange={() => toggleHidden(item.href)}
                        className="w-4 h-4 rounded text-accent border-border focus:ring-1 focus:ring-accent"
                      />
                      <span className="text-sm text-text-primary flex-1">{item.label}</span>
                      <span className="text-[10px] text-text-secondary font-mono">{item.href}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* BUG-107 Piece 4: per-role sidebar label rename.
                   Empty label = use the default hardcoded text. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Sidebar labels (rename per role)</p>
                  <button
                    onClick={handleSaveLabels}
                    disabled={!labelDirty || savingLabels}
                    className="text-xs font-semibold text-accent hover:opacity-80 disabled:opacity-40"
                  >
                    {savingLabels ? 'Saving…' : 'Save labels'}
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary mb-2">
                  Override the displayed text for sidebar entries when a user holds this role. Leave blank to keep the default.
                </p>
                <div className="space-y-1 bg-bg/30 border border-border rounded-lg p-2">
                  {SIDEBAR_CATALOGUE.map(item => (
                    <div
                      key={item.href}
                      className="flex items-center gap-2.5 p-1.5"
                    >
                      <span className="text-sm text-text-primary flex-1 truncate">{item.label}</span>
                      <input
                        type="text"
                        value={labelOverrides[item.href] ?? ''}
                        onChange={e => setLabelOverride(item.href, e.target.value)}
                        placeholder="(default)"
                        maxLength={64}
                        className="w-48 px-2 py-1 text-xs border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <span className="text-[10px] text-text-secondary font-mono w-44 text-right">{item.href}</span>
                    </div>
                  ))}
                </div>
              </div>
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

// BUG-108 (2026-06-05): Platform tab redesigned as sectioned enterprise
// settings form. Each section has friendly field labels (raw setting keys
// shown small + monospace under the label for transparency), inline help,
// and its own per-section Save button.

function PlatformTab() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const token = getAccessToken();
    const res = await get<{ items: PlatformSetting[] }>('/system-settings', token).catch(() => ({ items: [] }));
    setSettings(res.items ?? []);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try { await reload(); } finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;
  if (settings.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-text-secondary">
        No platform settings available. Endpoint <code>GET /system-settings</code> may be unreachable.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <GeneralSection settings={settings} onSaved={reload} />
      <BrandingSection settings={settings} onSaved={reload} />
      <EmailSection settings={settings} onSaved={reload} />
      <ActiveDirectorySection settings={settings} onSaved={reload} />
      <VendorPortalSection settings={settings} onSaved={reload} />
      <SecuritySection settings={settings} onSaved={reload} />
      <UploadsSection settings={settings} onSaved={reload} />
    </div>
  );
}

// ─── Shared section primitives ───────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <header className="px-5 py-4 border-b border-border bg-bg flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent shrink-0 mt-0.5">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
        </div>
      </header>
      <div className="p-5 space-y-5">{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-border bg-bg/30 flex justify-end items-center gap-2">
          {footer}
        </div>
      )}
    </section>
  );
}

function LabeledField({
  label,
  hint,
  settingKey,
  children,
}: {
  label: string;
  hint?: string;
  settingKey?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      <div className="space-y-1">
        <label className="text-sm font-semibold text-text-primary block">{label}</label>
        {hint && <p className="text-xs text-text-secondary leading-snug">{hint}</p>}
        {settingKey && <p className="text-[10px] text-text-secondary/60 font-mono">{settingKey}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  );
}

function SaveButton({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty || saving}
      className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-40"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

// Hook: tracks edits + dirty + save against a subset of settings keys.
function useSectionEdits(settings: PlatformSetting[]) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function getValue(key: string): string {
    if (key in edits) return edits[key];
    return settings.find(s => s.key === key)?.value ?? '';
  }
  function setValue(key: string, value: string) {
    setEdits(prev => ({ ...prev, [key]: value }));
  }
  const dirty = Object.entries(edits).some(
    ([k, v]) => v !== (settings.find(s => s.key === k)?.value ?? ''),
  );

  async function save(onSaved?: () => void | Promise<void>) {
    setSaving(true);
    try {
      const token = getAccessToken();
      const updates = Object.entries(edits)
        .filter(([k, v]) => v !== (settings.find(s => s.key === k)?.value ?? ''))
        .map(([key, value]) => ({ key, value }));
      if (updates.length > 0) {
        await post('/system-settings/batch', { updates }, token);
      }
      setEdits({});
      await onSaved?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }
  return { getValue, setValue, dirty, saving, save };
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={
        'w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent '
        + (props.className ?? '')
      }
    />
  );
}

// ─── General section ─────────────────────────────────────────────────────────

function GeneralSection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={SettingsIcon}
      title="General"
      description="Top-level platform brand strings used by the admin and vendor portals."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField
        label="System Name"
        hint="Shown in the admin sidebar header, admin login page, and as the creator metadata on exported reports."
        settingKey="branding.system_name"
      >
        <TextInput
          value={ed.getValue('branding.system_name')}
          onChange={e => ed.setValue('branding.system_name', e.target.value)}
          placeholder="CTMP"
        />
      </LabeledField>
      <LabeledField
        label="Vendor Portal Name"
        hint="Shown in the vendor portal top nav and on vendor login / registration pages. Leave empty to fall back to System Name."
        settingKey="branding.vendor_portal_name"
      >
        <TextInput
          value={ed.getValue('branding.vendor_portal_name')}
          onChange={e => ed.setValue('branding.vendor_portal_name', e.target.value)}
          placeholder="(falls back to System Name)"
        />
      </LabeledField>
    </SectionCard>
  );
}

// ─── Branding section ────────────────────────────────────────────────────────

function BrandingSection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const find = (k: string) => settings.find(s => s.key === k)?.value ?? '';
  return (
    <SectionCard
      icon={ImageIcon}
      title="Branding · Logos"
      description="Upload logos used on admin and vendor surfaces and embedded in report PDF/XLSX headers."
    >
      <LogoUploadRow type="admin_logo" label="Admin Portal Logo" hint={find('branding.hint_admin_logo')} onUploaded={onSaved} />
      <LogoUploadRow type="vendor_logo" label="Vendor Portal Logo" hint={find('branding.hint_vendor_logo')} onUploaded={onSaved} />
      <LogoUploadRow type="report_logo" label="Report Header Logo" hint={find('branding.hint_report_logo')} onUploaded={onSaved} />
    </SectionCard>
  );
}

// ─── Email (SMTP) section ────────────────────────────────────────────────────

function EmailSection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={Mail}
      title="Email (SMTP)"
      description="Outbound mail server settings. Falls back to environment variables when a field is left empty. Password is encrypted at rest."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField label="Host" hint="SMTP server hostname (e.g. smtp.office365.com)." settingKey="smtp.host">
        <TextInput value={ed.getValue('smtp.host')} onChange={e => ed.setValue('smtp.host', e.target.value)} placeholder="smtp.example.com" />
      </LabeledField>
      <LabeledField label="Port" hint="Standard ports: 25 (plain), 465 (TLS), 587 (STARTTLS)." settingKey="smtp.port">
        <TextInput type="number" value={ed.getValue('smtp.port')} onChange={e => ed.setValue('smtp.port', e.target.value)} placeholder="587" />
      </LabeledField>
      <LabeledField label="Username" hint="SMTP auth username (often the full From address)." settingKey="smtp.user">
        <TextInput value={ed.getValue('smtp.user')} onChange={e => ed.setValue('smtp.user', e.target.value)} placeholder="noreply@example.com" />
      </LabeledField>
      <LabeledField label="From Address" hint="Default sender address for outbound mail. Must be authorised by your SMTP provider." settingKey="smtp.from">
        <TextInput type="email" value={ed.getValue('smtp.from')} onChange={e => ed.setValue('smtp.from', e.target.value)} placeholder="noreply@example.com" />
      </LabeledField>
      <SecureSetterRow keyName="smtp.password" label="Password" placeholder="enter new SMTP password" onSaved={onSaved} />
      <SmtpTestRow />
    </SectionCard>
  );
}

// ─── Active Directory section ───────────────────────────────────────────────

function ActiveDirectorySection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={Server}
      title="Active Directory"
      description="LDAP / AD authentication target for internal user logins. Bind uses the user's own credentials at sign-in."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField label="LDAP URL" hint="Full URL including scheme + port, e.g. ldap://dc.example.com:389 or ldaps://dc.example.com:636." settingKey="ad.url">
        <TextInput value={ed.getValue('ad.url')} onChange={e => ed.setValue('ad.url', e.target.value)} placeholder="ldap://dc.example.com:389" />
      </LabeledField>
      <LabeledField label="Domain" hint="Domain suffix appended to usernames at bind time (e.g. corp.example.com → user@corp.example.com)." settingKey="ad.domain">
        <TextInput value={ed.getValue('ad.domain')} onChange={e => ed.setValue('ad.domain', e.target.value)} placeholder="corp.example.com" />
      </LabeledField>
      <SecureSetterRow keyName="ad.bind_password" label="Service-Account Password (optional)" placeholder="enter bind password" onSaved={onSaved} />
      <AdTestRow />
    </SectionCard>
  );
}

// ─── Vendor Portal section ──────────────────────────────────────────────────

function VendorPortalSection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={Users}
      title="Vendor Portal"
      description="Self-service vendor portal policies."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField label="CAPTCHA Enabled" hint="Require CAPTCHA on vendor public endpoints (registration, password reset)." settingKey="vendor.captcha.enabled">
        <select
          value={ed.getValue('vendor.captcha.enabled')}
          onChange={e => ed.setValue('vendor.captcha.enabled', e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-bg w-full md:w-40 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </LabeledField>
      <LabeledField label="Minimum Password Length" hint="Enforced on vendor self-registration and password resets." settingKey="vendor.password.min_length">
        <TextInput type="number" value={ed.getValue('vendor.password.min_length')} onChange={e => ed.setValue('vendor.password.min_length', e.target.value)} placeholder="12" />
      </LabeledField>
    </SectionCard>
  );
}

// ─── Security & Audit section ───────────────────────────────────────────────

function SecuritySection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={Lock}
      title="Security & Audit"
      description="Session lifetime, audit retention, and late-submission policy."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField label="Session Idle Timeout (minutes)" hint="Inactive users are signed out after this many minutes." settingKey="session.idle_timeout_minutes">
        <TextInput type="number" value={ed.getValue('session.idle_timeout_minutes')} onChange={e => ed.setValue('session.idle_timeout_minutes', e.target.value)} placeholder="30" />
      </LabeledField>
      <LabeledField label="Audit Retention (days)" hint="How long audit log entries are retained before archival. Default ~7 years (2555 days)." settingKey="audit.retention_days">
        <TextInput type="number" value={ed.getValue('audit.retention_days')} onChange={e => ed.setValue('audit.retention_days', e.target.value)} placeholder="2555" />
      </LabeledField>
      <LabeledField label="Late Submission After Technical Opening" hint="Whether late-submission exceptions may be granted once the technical envelope has been opened." settingKey="late_submission.allow_after_technical_opening">
        <select
          value={ed.getValue('late_submission.allow_after_technical_opening')}
          onChange={e => ed.setValue('late_submission.allow_after_technical_opening', e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm bg-bg w-full md:w-40 focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="true">Allowed</option>
          <option value="false">Blocked</option>
        </select>
      </LabeledField>
    </SectionCard>
  );
}

// ─── Uploads section ────────────────────────────────────────────────────────

function UploadsSection({ settings, onSaved }: { settings: PlatformSetting[]; onSaved: () => void }) {
  const ed = useSectionEdits(settings);
  return (
    <SectionCard
      icon={UploadIcon}
      title="Uploads"
      description="File upload limits."
      footer={<SaveButton dirty={ed.dirty} saving={ed.saving} onSave={() => ed.save(onSaved)} />}
    >
      <LabeledField label="Maximum File Size (bytes)" hint="Maximum size per uploaded file across all surfaces. Default 50 MB (52,428,800)." settingKey="upload.max_file_size_bytes">
        <TextInput type="number" value={ed.getValue('upload.max_file_size_bytes')} onChange={e => ed.setValue('upload.max_file_size_bytes', e.target.value)} placeholder="52428800" />
      </LabeledField>
    </SectionCard>
  );
}

// BUG-108: LogoUploadRow now also handles admin_logo.
function LogoUploadRow({ type, label, hint, onUploaded }: {
  type: 'admin_logo' | 'vendor_logo' | 'report_logo';
  label: string;
  hint: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<number>(Date.now()); // cache-busting

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const token = getAccessToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      const res = await fetch(`${apiBase}/api/v1/system-settings/branding/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(typeof body.message === 'string' ? body.message : res.statusText);
      }
      setMsg({ kind: 'ok', text: `Uploaded ${(file.size / 1024).toFixed(0)} KB` });
      setPreview(Date.now());
      await onUploaded();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally { setBusy(false); }
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      <div>
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-secondary mt-0.5">{hint}</p>}
      </div>
      <div className="md:col-span-2 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${apiBase}/api/v1/branding/${type}?t=${preview}`}
          alt="current"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          className="w-24 h-12 object-contain bg-bg rounded border border-border"
        />
        <label className="px-3 py-2 bg-accent text-white text-xs font-semibold rounded-lg cursor-pointer hover:opacity-90">
          {busy ? 'Uploading…' : 'Choose file'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            disabled={busy}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
          />
        </label>
        {msg && (
          <span className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-danger'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// BUG-108: SecureSetterRow + Test rows are composed by EmailSection /
// ActiveDirectorySection in the new sectioned PlatformTab.
function SecureSetterRow({ keyName, label, placeholder, onSaved }: {
  keyName: string;
  label: string;
  placeholder: string;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const token = getAccessToken();
      await post('/system-settings/secure', { key: keyName, value }, token);
      setMsg({ kind: 'ok', text: 'Saved (encrypted)' });
      setValue('');
      await onSaved();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed' });
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
      <div>
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="text-[10px] text-text-secondary font-mono mt-0.5">{keyName}</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-bg font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={save}
          disabled={!value || busy}
          className="px-4 py-2 bg-accent text-white text-xs font-semibold rounded-lg disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Set'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-danger'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function SmtpTestRow() {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const token = getAccessToken();
      const res = await post<{ ok: boolean; message: string }>('/system-settings/test-smtp', { to }, token);
      setMsg({ kind: res.ok ? 'ok' : 'err', text: res.message });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Test failed' });
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-bg/30">
      <div>
        <p className="text-sm font-semibold text-text-primary">Test SMTP</p>
        <p className="text-xs text-text-secondary mt-0.5">Sends a one-shot mail through the current SMTP config.</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-2">
        <input
          type="email"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={send}
          disabled={!to || busy}
          className="px-4 py-2 bg-text-primary text-white text-xs font-semibold rounded-lg disabled:opacity-40"
        >
          {busy ? 'Sending…' : 'Send Test'}
        </button>
        {msg && (
          <span className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-danger'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function AdTestRow() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function probe() {
    setBusy(true);
    setMsg(null);
    try {
      const token = getAccessToken();
      const res = await post<{ ok: boolean; message: string }>('/system-settings/test-ad', { username, password }, token);
      setMsg({ kind: res.ok ? 'ok' : 'err', text: res.message });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Test failed' });
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-bg/30">
      <div>
        <p className="text-sm font-semibold text-text-primary">Test AD Bind</p>
        <p className="text-xs text-text-secondary mt-0.5">Probes LDAP bind against the current AD config with provided credentials.</p>
      </div>
      <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="ad-username"
          className="flex-1 min-w-[140px] px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="password"
          className="flex-1 min-w-[140px] px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={probe}
          disabled={!username || !password || busy}
          className="px-4 py-2 bg-text-primary text-white text-xs font-semibold rounded-lg disabled:opacity-40"
        >
          {busy ? 'Binding…' : 'Probe'}
        </button>
        {msg && (
          <span className={`text-xs w-full ${msg.kind === 'ok' ? 'text-emerald-700' : 'text-danger'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Departments tab ──────────────────────────────────────────────────────────

function DepartmentsTab() {
  const confirm = useConfirm();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  // Migration 054 (2026-08-13): nameAr feeds the Arabic management dashboard.
  const [draft, setDraft] = useState<{ code: string; name: string; nameAr: string; parentId: string | null }>({ code: '', name: '', nameAr: '', parentId: null });
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
    setDraft({ code: '', name: '', nameAr: '', parentId: null });
    setError(null);
    setEditing('new');
  }
  function startEdit(d: Department) {
    setDraft({ code: d.code, name: d.name, nameAr: d.nameAr ?? '', parentId: d.parentId });
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
          nameAr: draft.nameAr.trim() || undefined,
          parentId: draft.parentId || undefined,
        }, token);
      } else if (editing) {
        await patch(`/departments/${editing.id}`, {
          name: draft.name.trim(),
          // Empty string clears it; the dashboard then falls back to name.
          nameAr: draft.nameAr.trim(),
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
    const ok = await confirm({
      title: 'Disable department',
      body: `Disable department "${d.name}"? Users assigned to it keep their assignment, but the department is hidden from new selections.`,
      destructive: true,
      confirmLabel: 'Disable',
    });
    if (!ok) return;
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">
                Arabic Name
              </label>
              <input
                value={draft.nameAr}
                onChange={e => setDraft({ ...draft, nameAr: e.target.value })}
                dir="rtl"
                lang="ar"
                placeholder="مثال: المشتريات"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[10px] text-text-secondary mt-0.5">Optional — shown on the Arabic dashboard. Blank falls back to Name.</p>
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
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Arabic Name</th>
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
                  <td className="px-5 py-3 text-text-primary" dir="rtl" lang="ar">
                    {d.nameAr || <span className="text-text-secondary" dir="ltr">—</span>}
                  </td>
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
  const confirm = useConfirm();
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
    sendWelcomeEmail: boolean;
  }>({
    email: '', displayName: '', authType: 'AD', adUsername: '', password: '',
    status: 'ACTIVE', roleId: '', departmentIds: [], primaryDepartmentId: '', sendWelcomeEmail: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeBusyId, setWelcomeBusyId] = useState<string | null>(null);
  const [welcomeMsg, setWelcomeMsg] = useState<string | null>(null);

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
      status: 'ACTIVE', roleId: '', departmentIds: [], primaryDepartmentId: '', sendWelcomeEmail: false,
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
      sendWelcomeEmail: false,
    });
    setError(null);
    setEditing(u);
  }

  async function handleResendWelcome(u: InternalUser) {
    setWelcomeBusyId(u.id);
    setWelcomeMsg(null);
    try {
      const token = getAccessToken();
      await post(`/users/${u.id}/welcome-email`, {}, token);
      setWelcomeMsg(`Welcome email sent to ${u.email}.`);
    } catch (err) {
      setWelcomeMsg(err instanceof Error ? err.message : 'Failed to send welcome email');
    } finally {
      setWelcomeBusyId(null);
    }
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
        if (draft.sendWelcomeEmail) payload.sendWelcomeEmail = true;
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
    const ok = await confirm({
      title: 'Disable user',
      body: `Disable user "${u.displayName}"? They will lose access immediately.`,
      destructive: true,
      confirmLabel: 'Disable',
    });
    if (!ok) return;
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

          {editing === 'new' && (
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.sendWelcomeEmail}
                onChange={e => setDraft({ ...draft, sendWelcomeEmail: e.target.checked })}
              />
              <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Send welcome email with role guide</span>
            </label>
          )}
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

      {welcomeMsg && <p className="text-xs text-text-secondary px-1 mb-2">{welcomeMsg}</p>}

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
                      onClick={() => handleResendWelcome(u)}
                      disabled={welcomeBusyId === u.id || editing !== null}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-bg rounded ml-1 disabled:opacity-40"
                      title="Send (or resend) the welcome email with the role guide"
                    ><Mail className="w-3.5 h-3.5" /> {welcomeBusyId === u.id ? 'Sending…' : 'Welcome'}</button>
                  )}
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

// ─── Tender Categories tab ────────────────────────────────────────────────────
//
// Migration 054 (2026-08-13). Until now the category list was a hardcoded array
// duplicated in tenders/new/page.tsx and tenders/[id]/edit/page.tsx, so nobody
// could add a category without a code change and there was nowhere to hang an
// Arabic name.
//
// Categories are deactivated, never deleted: tenders store the category NAME,
// so removing a row would strand historical tenders. Renaming is safe — the API
// updates the tenders carrying the old name in the same transaction.

interface TenderCategory {
  id: string;
  name: string;
  nameAr?: string | null;
  isActive: boolean;
  sortOrder: number;
}

function CategoriesTab() {
  const confirm = useConfirm();
  const [items, setItems] = useState<TenderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TenderCategory | 'new' | null>(null);
  const [draft, setDraft] = useState<{ name: string; nameAr: string; sortOrder: string }>({ name: '', nameAr: '', sortOrder: '0' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await get<{ items: TenderCategory[] }>('/tender-categories?includeInactive=true', token)
        .catch(() => ({ items: [] }));
      setItems(res.items ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startNew() {
    setDraft({ name: '', nameAr: '', sortOrder: String((items.at(-1)?.sortOrder ?? 0) + 10) });
    setError(null);
    setEditing('new');
  }
  function startEdit(c: TenderCategory) {
    setDraft({ name: c.name, nameAr: c.nameAr ?? '', sortOrder: String(c.sortOrder) });
    setError(null);
    setEditing(c);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      const body = {
        name: draft.name.trim(),
        nameAr: draft.nameAr.trim(),
        sortOrder: Number(draft.sortOrder) || 0,
      };
      if (editing === 'new') {
        await post('/tender-categories', body, token);
      } else if (editing) {
        await patch(`/tender-categories/${editing.id}`, body, token);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function handleDeactivate(c: TenderCategory) {
    const ok = await confirm({
      title: 'Deactivate category',
      body: `Hide "${c.name}" from the tender category dropdown? Tenders already using it keep it — nothing is deleted.`,
      destructive: true,
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
    try {
      await del(`/tender-categories/${c.id}`, getAccessToken());
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate');
    }
  }

  async function handleReactivate(c: TenderCategory) {
    try {
      await patch(`/tender-categories/${c.id}`, { isActive: true }, getAccessToken());
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reactivate');
    }
  }

  if (loading) return <div className="text-sm text-text-secondary p-6 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Categories offered when creating or editing a tender. The Arabic name appears on the Arabic
          management dashboard.
        </p>
        <button
          onClick={startNew}
          disabled={editing !== null}
          className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      {editing && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-text-primary">
            {editing === 'new' ? 'Create Category' : `Edit ${editing.name}`}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">
                Name <span className="text-danger">*</span>
              </label>
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Medical Equipment"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {editing !== 'new' && (
                <p className="text-[10px] text-text-secondary mt-0.5">
                  Renaming also updates every tender using this category.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">Arabic Name</label>
              <input
                value={draft.nameAr}
                onChange={e => setDraft({ ...draft, nameAr: e.target.value })}
                dir="rtl"
                lang="ar"
                placeholder="مثال: أجهزة طبية"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[10px] text-text-secondary mt-0.5">Optional — blank falls back to Name.</p>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary block mb-1">Sort Order</label>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={e => setDraft({ ...draft, sortOrder: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setEditing(null); setError(null); }}
              className="px-4 py-1.5 border border-border rounded-lg text-sm font-semibold text-text-secondary hover:bg-bg"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.name.trim()}
              className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Name</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Arabic Name</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-secondary">Sort</th>
              <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
              <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-text-secondary">No categories yet.</td></tr>
            )}
            {items.map(c => (
              <tr key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                <td className="px-5 py-3 font-semibold text-text-primary">{c.name}</td>
                <td className="px-5 py-3 text-text-primary" dir="rtl" lang="ar">
                  {c.nameAr || <span className="text-text-secondary" dir="ltr">—</span>}
                </td>
                <td className="px-5 py-3 text-right font-mono text-text-secondary">{c.sortOrder}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    c.isActive ? 'bg-success/10 text-success' : 'bg-border text-text-secondary'
                  }`}>{c.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => startEdit(c)} className="text-accent hover:underline text-xs font-semibold">Edit</button>
                  {c.isActive ? (
                    <button onClick={() => handleDeactivate(c)} className="text-danger hover:underline text-xs font-semibold">Deactivate</button>
                  ) : (
                    <button onClick={() => handleReactivate(c)} className="text-success hover:underline text-xs font-semibold">Reactivate</button>
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
