'use client';

import { useEffect, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface CommercialDocument {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: string;
}

interface Props {
  bidId: string;
  envelopeStatus: 'SEALED' | 'OPENED' | 'LOCKED' | 'SUBMITTED' | 'DRAFT' | string;
  /** Compact mode trims paddings + hides metadata; suits inline use inside tables. */
  compact?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * BUG-023 / BUG-025: shared commercial-documents surface. Renders nothing
 * (or an "Awaiting committee opening" placeholder) until the envelope is
 * OPENED. Per master plan: visibility of commercial details still requires
 * `commercial:view`; the server enforces the download permission and will
 * 403 the per-file fetch when the caller lacks `commercial:download`.
 */
export function CommercialDocumentsList({ bidId, envelopeStatus, compact }: Props) {
  const [docs, setDocs] = useState<CommercialDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (envelopeStatus !== 'OPENED') {
      setDocs(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<{ documents: CommercialDocument[] }>(
          `/bids/${bidId}/envelopes/COMMERCIAL/documents`,
          token,
        );
        if (!cancelled) setDocs(res.documents ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [bidId, envelopeStatus]);

  if (envelopeStatus !== 'OPENED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
        <Lock className="w-3 h-3" />
        Awaiting committee opening
      </span>
    );
  }

  if (error) {
    return <span className="text-xs text-danger">{error}</span>;
  }
  if (docs === null) {
    return <span className="text-xs text-text-secondary">Loading…</span>;
  }
  if (docs.length === 0) {
    return <span className="text-xs text-text-secondary">No documents</span>;
  }

  async function handleDownload(docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/bids/${bidId}/documents/${docId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        alert('Your role lacks commercial:download permission.');
        return;
      }
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {docs.map(d => (
        <button
          key={d.id}
          onClick={() => handleDownload(d.id, d.filename)}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline truncate max-w-full"
          title={`${d.filename} · ${(d.fileSize / 1024).toFixed(1)} KB`}
        >
          <Download className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{d.filename}</span>
        </button>
      ))}
    </div>
  );
}
