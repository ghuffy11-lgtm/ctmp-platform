'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';
import { get, put } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface BoqRow {
  id?: string;
  itemNo: string;
  description: string;
  qty: string;
  unit: string;
}

interface Props {
  tenderId: string;
  editable: boolean;
}

const UNIT_OPTIONS = ['EA', 'M', 'KG', 'LS', 'set', 'hour', 'day', 'L', 'm²', 'm³'];
const PLACEHOLDER_ITEM_NO = '0';
const PLACEHOLDER_DESCRIPTION = 'Legacy tender — no BOQ defined';

/**
 * BUG-068 / Phase F BOQ. Per-tender Bill of Quantities editor: list current
 * rows, add / remove rows, save. Clone of TenderCriteriaEditor pattern from
 * BUG-044. No library lookup (BOQ is bespoke per tender), no weight rule.
 * The backend gates writes by tender status (Draft / Internal Review /
 * Approved only); editable prop mirrors that here for the UI.
 */
// BUG-072 (2026-06-01): minimal RFC-4180-lite CSV parser. No quoted-cell-with-
// newline support — fine for BOQ where descriptions don't span lines. Returns
// either parsed rows or a list of error messages (per row).
function parseBoqCsv(text: string): { rows?: Omit<BoqRow, 'id'>[]; errors?: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { errors: ['File is empty.'] };
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const requiredCols = ['item_no', 'description', 'qty', 'unit'];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    return { errors: [`Missing required column(s): ${missing.join(', ')}. Header must be: ${requiredCols.join(',')}.`] };
  }
  const idx = {
    itemNo: header.indexOf('item_no'),
    description: header.indexOf('description'),
    qty: header.indexOf('qty'),
    unit: header.indexOf('unit'),
  };
  const rows: Omit<BoqRow, 'id'>[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    const lineNum = i + 1;
    const itemNo = cells[idx.itemNo] ?? '';
    const description = cells[idx.description] ?? '';
    const qtyRaw = cells[idx.qty] ?? '';
    const unit = cells[idx.unit] ?? '';
    if (!itemNo) { errors.push(`Line ${lineNum}: missing item_no.`); continue; }
    if (seen.has(itemNo)) { errors.push(`Line ${lineNum}: duplicate item_no "${itemNo}".`); continue; }
    seen.add(itemNo);
    if (!description) { errors.push(`Line ${lineNum}: missing description.`); continue; }
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) { errors.push(`Line ${lineNum}: qty must be a positive number (got "${qtyRaw}").`); continue; }
    if (!unit) { errors.push(`Line ${lineNum}: missing unit.`); continue; }
    rows.push({ itemNo, description, qty: String(qty), unit });
  }
  if (errors.length > 0) return { errors };
  return { rows };
}

export function TenderBoqEditor({ tenderId, editable }: Props) {
  const [rows, setRows] = useState<BoqRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [successAt, setSuccessAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const token = getAccessToken();
      const res = await get<{ items: Array<{ id: string; itemNo: string; description: string; qty: number; unit: string; sortOrder: number }> }>(
        `/tenders/${tenderId}/boq`,
        token,
      );
      // Hide the auto-backfilled placeholder row from migration 020 — owner
      // doesn't need to see/edit it, the rest of the system already ignores
      // it. Officer adding real rows replaces it on save.
      const real = (res.items ?? []).filter(
        i => !(i.itemNo === PLACEHOLDER_ITEM_NO && i.description === PLACEHOLDER_DESCRIPTION),
      );
      setRows(real.map(i => ({
        id: i.id,
        itemNo: i.itemNo,
        description: i.description,
        qty: String(i.qty),
        unit: i.unit,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load BOQ');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  function addRow() {
    if (!rows) return;
    const nextItemNo = String(rows.length + 1);
    setRows([
      ...rows,
      { itemNo: nextItemNo, description: '', qty: '1', unit: 'EA' },
    ]);
  }

  function updateRow(idx: number, patch: Partial<BoqRow>) {
    if (!rows) return;
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    if (!rows) return;
    setRows(rows.filter((_, i) => i !== idx));
  }

  // BUG-072 (2026-06-01): CSV import for BOQ template. Owner asked for an
  // import affordance + template download so they don't have to add every row
  // manually. Parsed rows land in the editor and stay editable; user clicks
  // Save BOQ to commit.
  async function handleImportClick() {
    setImportErrors(null);
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const { rows: parsed, errors } = parseBoqCsv(text);
      if (errors && errors.length > 0) {
        setImportErrors(errors);
        return;
      }
      if (!parsed || parsed.length === 0) {
        setImportErrors(['No data rows found in the file.']);
        return;
      }
      // Merge: replace current rows wholesale. Users can still edit/remove
      // imported rows individually before Save.
      setRows(parsed);
      setImportErrors(null);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : 'Failed to read file.']);
    }
  }

  async function handleSave() {
    if (!rows) return;
    if (rows.length === 0) {
      setError('Add at least one BOQ line before saving.');
      return;
    }
    const seen = new Set<string>();
    for (const r of rows) {
      const item = r.itemNo.trim();
      if (!item) { setError('Every line needs an Item No.'); return; }
      if (seen.has(item)) { setError(`Duplicate Item No "${item}".`); return; }
      seen.add(item);
      if (!r.description.trim()) { setError(`Line ${item} needs a description.`); return; }
      if (!r.qty || Number(r.qty) <= 0) { setError(`Line ${item} qty must be > 0.`); return; }
      if (!r.unit.trim()) { setError(`Line ${item} needs a unit.`); return; }
    }
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      await put(`/tenders/${tenderId}/boq`, {
        items: rows.map((r, i) => ({
          id: r.id,
          itemNo: r.itemNo.trim(),
          description: r.description.trim(),
          qty: Number(r.qty),
          unit: r.unit.trim(),
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
        <p className="text-sm text-text-secondary">Loading Bill of Quantities…</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Bill of Quantities (BOQ)</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {rows.length} line{rows.length === 1 ? '' : 's'} · vendors enter unit prices per line at bid time
            {!editable && ' · locked at this tender status'}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href="/templates/boq-template.csv"
              download
              className="px-3 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
              title="Download blank CSV template"
            >
              <Download className="w-4 h-4" />
              Template
            </a>
            <button
              onClick={handleImportClick}
              className="px-3 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
              title="Import a filled CSV — replaces the current rows"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChosen}
              className="hidden"
            />
            <button
              onClick={addRow}
              className="px-3 py-2 text-sm font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add line
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
      {importErrors && importErrors.length > 0 && (
        <div className="px-5 py-3 bg-danger/5 border-b border-danger/20 text-xs text-danger">
          <p className="font-bold mb-1">CSV import failed:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {importErrors.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
            {importErrors.length > 8 && <li>… and {importErrors.length - 8} more.</li>}
          </ul>
        </div>
      )}
      {successAt && Date.now() - successAt < 5000 && (
        <div className="px-5 py-2.5 bg-success/5 border-b border-success/20 text-xs text-success">
          BOQ saved.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No BOQ lines configured yet. Click <strong>Add line</strong> to define what vendors will price.
          </p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-bg/50 border-b border-border">
            <tr>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-24">Item No</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary">Description</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary text-right w-28">Qty</th>
              <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary w-28">Unit</th>
              {editable && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`}>
                <td className="px-3 py-2">
                  <input
                    value={r.itemNo}
                    onChange={e => updateRow(i, { itemNo: e.target.value })}
                    placeholder="1"
                    disabled={!editable}
                    className="w-full px-2 py-1.5 text-sm font-mono border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={r.description}
                    onChange={e => updateRow(i, { description: e.target.value })}
                    placeholder="e.g. Network Switch"
                    disabled={!editable}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={r.qty}
                    onChange={e => updateRow(i, { qty: e.target.value })}
                    disabled={!editable}
                    className="w-24 px-2 py-1.5 text-sm font-mono text-right border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={r.unit}
                    onChange={e => updateRow(i, { unit: e.target.value })}
                    disabled={!editable}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded bg-bg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                  >
                    {UNIT_OPTIONS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    {!UNIT_OPTIONS.includes(r.unit) && <option value={r.unit}>{r.unit}</option>}
                  </select>
                </td>
                {editable && (
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="p-1 text-text-secondary hover:text-danger hover:bg-danger/5 rounded"
                      title="Remove line"
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
            disabled={saving || rows.length === 0}
            className="px-5 py-2 text-sm font-bold bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save BOQ
          </button>
        </div>
      )}
    </div>
  );
}
