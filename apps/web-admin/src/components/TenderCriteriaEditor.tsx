'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, Save, Shield, Trash2 } from 'lucide-react';
import { get, put } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface LibraryEntry {
  id: string;
  name: string;
  description: string | null;
  defaultWeight: number | null;
  defaultMaxScore: number;
  defaultIsGate: boolean;
}

interface CriterionRow {
  id?: string; // existing criteria carry their server id
  code: string;
  name: string;
  description: string;
  maxScore: string;
  weight: string;
  mandatory: boolean;
}

interface Props {
  tenderId: string;
  editable: boolean;
}

function makeCode(name: string, existingCodes: Set<string>): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!base) return `CRIT_${Date.now()}`;
  if (!existingCodes.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

/**
 * Phase F (BUG-044). Per-tender criteria editor: list current criteria, add
 * from library or custom, set weight + mandatory-gate per row. Live weight
 * sum total displayed; the server rejects PUT if the sum != 100.
 */
export function TenderCriteriaEditor({ tenderId, editable }: Props) {
  const [rows, setRows] = useState<CriterionRow[] | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [picker, setPicker] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successAt, setSuccessAt] = useState<number | null>(null);

  async function load() {
    try {
      const token = getAccessToken();
      const [crits, lib] = await Promise.all([
        get<Array<{ id: string; code: string; name: string; description: string | null; maxScore: number; weight: number | null; mandatory: boolean }>>(`/tenders/${tenderId}/criteria`, token),
        get<LibraryEntry[]>(`/evaluation-criteria/library`, token).catch(() => []),
      ]);
      setRows(crits.map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description ?? '',
        maxScore: String(c.maxScore),
        weight: c.weight != null ? String(c.weight) : '0',
        mandatory: c.mandatory,
      })));
      setLibrary(lib);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load criteria');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  const weightSum = (rows ?? []).reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const weightOk = Math.abs(weightSum - 100) < 0.05;

  function addFromLibrary(libId: string) {
    const entry = library.find(l => l.id === libId);
    if (!entry || !rows) return;
    const existingCodes = new Set(rows.map(r => r.code));
    setRows([
      ...rows,
      {
        code: makeCode(entry.name, existingCodes),
        name: entry.name,
        description: entry.description ?? '',
        maxScore: String(entry.defaultMaxScore),
        weight: entry.defaultWeight != null ? String(entry.defaultWeight) : '0',
        mandatory: entry.defaultIsGate,
      },
    ]);
    setPicker('');
  }

  function addCustom() {
    if (!rows) return;
    const existingCodes = new Set(rows.map(r => r.code));
    setRows([
      ...rows,
      {
        code: makeCode('CUSTOM', existingCodes),
        name: '',
        description: '',
        maxScore: '100',
        weight: '0',
        mandatory: false,
      },
    ]);
  }

  function updateRow(idx: number, patch: Partial<CriterionRow>) {
    if (!rows) return;
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    if (!rows) return;
    setRows(rows.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!rows) return;
    if (!weightOk) {
      setError(`Weights must sum to 100. Current: ${weightSum.toFixed(2)}.`);
      return;
    }
    for (const r of rows) {
      if (!r.name.trim()) { setError('Every criterion needs a name.'); return; }
      if (!r.code.trim()) { setError('Every criterion needs a code.'); return; }
      if (!r.maxScore || Number(r.maxScore) <= 0) { setError('Max score must be positive.'); return; }
    }
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      await put(`/tenders/${tenderId}/criteria`, {
        criteria: rows.map((r, i) => ({
          id: r.id,
          code: r.code.trim(),
          name: r.name.trim(),
          description: r.description.trim() || undefined,
          maxScore: Number(r.maxScore),
          weight: Number(r.weight),
          mandatory: r.mandatory,
          sortOrder: i,
        })),
      }, token);
      setSuccessAt(Date.now());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (rows === null) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <Loader2 className="w-5 h-5 text-text-secondary animate-spin mx-auto mb-2" />
        <p className="text-sm text-text-secondary">Loading criteria…</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Technical evaluation criteria</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {rows.length} criteria · weights{' '}
            <span className={`font-mono font-bold ${weightOk ? 'text-success' : 'text-danger'}`}>
              {weightSum.toFixed(2)} / 100
            </span>
            {!editable && ' · locked at this tender status'}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <select
              value={picker}
              onChange={e => { if (e.target.value) addFromLibrary(e.target.value); }}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Add from library…</option>
              {library
                .filter(l => !rows.some(r => r.name === l.name))
                .map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.defaultIsGate ? ' (gate)' : ''}
                  </option>
                ))}
            </select>
            <button
              onClick={addCustom}
              className="px-3 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Custom
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 py-2.5 bg-danger/5 border-b border-danger/20 text-xs text-danger flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {successAt && Date.now() - successAt < 5000 && (
        <div className="px-5 py-2.5 bg-success/5 border-b border-success/20 text-xs text-success">
          Criteria saved.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No criteria configured. Add at least one from the library or create a custom one.
          </p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-bg/50 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary">Name</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-24">Code</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary text-right w-24">Max</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary text-right w-24">Weight%</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary text-center w-20">Gate</th>
              {editable && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`}>
                <td className="px-3 py-2">
                  <input
                    value={r.name}
                    onChange={e => updateRow(i, { name: e.target.value })}
                    placeholder="Criterion name"
                    disabled={!editable}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {editable && (
                    <input
                      value={r.description}
                      onChange={e => updateRow(i, { description: e.target.value })}
                      placeholder="(optional description)"
                      className="w-full px-2 py-1 text-xs border-0 border-b border-transparent focus:border-border focus:outline-none bg-transparent mt-1 text-text-secondary"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    value={r.code}
                    onChange={e => updateRow(i, { code: e.target.value })}
                    placeholder="CODE"
                    disabled={!editable}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="1"
                    value={r.maxScore}
                    onChange={e => updateRow(i, { maxScore: e.target.value })}
                    disabled={!editable}
                    className="w-20 px-2 py-1.5 text-sm font-mono text-right border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={r.weight}
                    onChange={e => updateRow(i, { weight: e.target.value })}
                    disabled={!editable}
                    className="w-20 px-2 py-1.5 text-sm font-mono text-right border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <label className={`inline-flex items-center justify-center gap-1 ${editable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input
                      type="checkbox"
                      checked={r.mandatory}
                      onChange={e => updateRow(i, { mandatory: e.target.checked })}
                      disabled={!editable}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <Shield className={`w-3.5 h-3.5 ${r.mandatory ? 'text-amber-500' : 'text-text-secondary/40'}`} />
                  </label>
                </td>
                {editable && (
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="p-1 text-text-secondary hover:text-danger hover:bg-danger/5 rounded"
                      title="Remove criterion"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && (
        <div className="px-5 py-3 border-t border-border bg-bg flex items-center justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !weightOk || rows.length === 0}
            className="px-5 py-2 text-sm font-bold bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save criteria
          </button>
        </div>
      )}
    </div>
  );
}
