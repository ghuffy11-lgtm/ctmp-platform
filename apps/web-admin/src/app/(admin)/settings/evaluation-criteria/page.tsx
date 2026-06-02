'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronRight,
  Library,
  Loader2,
  Plus,
  Save,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { get, post, put, del } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useConfirm } from '@/components/dialog/DialogProvider';

interface LibraryEntry {
  id: string;
  name: string;
  description: string | null;
  defaultWeight: number | null;
  defaultMaxScore: number;
  defaultIsGate: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DraftEntry {
  id?: string;
  name: string;
  description: string;
  defaultWeight: string;
  defaultMaxScore: string;
  defaultIsGate: boolean;
  isActive: boolean;
}

const EMPTY_DRAFT: DraftEntry = {
  name: '',
  description: '',
  defaultWeight: '',
  defaultMaxScore: '100',
  defaultIsGate: false,
  isActive: true,
};

function toDraft(e: LibraryEntry): DraftEntry {
  return {
    id: e.id,
    name: e.name,
    description: e.description ?? '',
    defaultWeight: e.defaultWeight != null ? String(e.defaultWeight) : '',
    defaultMaxScore: String(e.defaultMaxScore),
    defaultIsGate: e.defaultIsGate,
    isActive: e.isActive,
  };
}

export default function EvaluationCriteriaLibraryPage() {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [draft, setDraft] = useState<DraftEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const token = getAccessToken();
      const res = await get<LibraryEntry[]>(
        `/evaluation-criteria/library${includeInactive ? '?includeInactive=true' : ''}`,
        token,
      );
      setEntries(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  async function handleSave() {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        defaultWeight: draft.defaultWeight ? Number(draft.defaultWeight) : undefined,
        defaultMaxScore: draft.defaultMaxScore ? Number(draft.defaultMaxScore) : undefined,
        defaultIsGate: draft.defaultIsGate,
        isActive: draft.isActive,
      };
      if (draft.id) {
        await put(`/evaluation-criteria/library/${draft.id}`, payload, token);
      } else {
        await post(`/evaluation-criteria/library`, payload, token);
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string, name: string) {
    const ok = await confirm({
      title: 'Deactivate library entry',
      body: `Deactivate library entry "${name}"? It will stop appearing in the per-tender picker.`,
      destructive: true,
      confirmLabel: 'Deactivate',
    });
    if (!ok) return;
    try {
      const token = getAccessToken();
      await del(`/evaluation-criteria/library/${id}`, token);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Deactivate failed');
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link href="/settings" className="hover:text-accent">Settings</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text-primary font-semibold">Evaluation Criteria Library</span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <Library className="w-6 h-6 text-accent" />
            Evaluation Criteria Library
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Master library of evaluation criteria. Per-tender editor lets procurement add/remove/customise from this list.
            Edits here do NOT retroactively change existing tenders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="accent-accent"
            />
            Show inactive
          </label>
          <button
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add criterion
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {entries === null ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Loader2 className="w-6 h-6 text-text-secondary animate-spin mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Loading…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Library className="w-10 h-10 text-text-secondary/30 mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No criteria in the library. Add one to get started.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg border-b border-border">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Name</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Default weight</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Max score</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Gate?</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary">Status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-secondary text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map(e => (
                <tr key={e.id} className={`hover:bg-bg/40 ${!e.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-text-primary">{e.name}</p>
                    {e.description && <p className="text-xs text-text-secondary mt-0.5">{e.description}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono">{e.defaultWeight != null ? `${e.defaultWeight}%` : '—'}</td>
                  <td className="px-4 py-3 font-mono">{e.defaultMaxScore}</td>
                  <td className="px-4 py-3">
                    {e.defaultIsGate ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
                        <Shield className="w-3 h-3" /> Gate
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">no</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${e.isActive ? 'text-success' : 'text-text-secondary'}`}>
                      {e.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDraft(toDraft(e))}
                        className="px-3 py-1 text-xs font-semibold text-accent border border-border rounded-lg hover:bg-bg"
                      >
                        Edit
                      </button>
                      {e.isActive && (
                        <button
                          onClick={() => handleDeactivate(e.id, e.name)}
                          className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg"
                          title="Deactivate"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/edit dialog */}
      {draft && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full">
            <header className="px-6 py-4 border-b border-border flex items-center justify-between">
              <p className="text-base font-bold text-text-primary">
                {draft.id ? 'Edit library entry' : 'Add library entry'}
              </p>
              <button onClick={() => setDraft(null)} className="p-1.5 text-text-secondary hover:bg-bg rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Compliance with Technical Specifications"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                  Description
                </label>
                <textarea
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  placeholder="What this criterion is meant to evaluate."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                    Default weight (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draft.defaultWeight}
                    onChange={e => setDraft({ ...draft, defaultWeight: e.target.value })}
                    placeholder="e.g. 30"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                    Default max score <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={draft.defaultMaxScore}
                    onChange={e => setDraft({ ...draft, defaultMaxScore: e.target.value })}
                    placeholder="100"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.defaultIsGate}
                  onChange={e => setDraft({ ...draft, defaultIsGate: e.target.checked })}
                  className="w-4 h-4 accent-accent"
                />
                <span className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-amber-500" />
                  Mandatory gate (failing this criterion fails the whole bid)
                </span>
              </label>
              {draft.id && (
                <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
                    className="w-4 h-4 accent-accent"
                  />
                  Active (visible in per-tender picker)
                </label>
              )}
            </div>
            <footer className="px-6 py-4 border-t border-border bg-bg flex items-center justify-between">
              <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-card">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-bold bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
