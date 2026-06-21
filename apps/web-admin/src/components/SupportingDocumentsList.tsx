'use client';

import { useEffect, useState } from 'react';
import { Download, Eye, Lock } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePdfViewer } from '@/components/viewer/PdfViewerProvider';

interface SupportingDocument {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: string;
}

interface Props {
  bidId: string;
  commercialEnvelopeStatus: 'SEALED' | 'OPENED' | 'LOCKED' | 'SUBMITTED' | 'DRAFT' | string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * BUG-142 (2026-06-19): bid supporting documents rendered inside the
 * Commercial Comparison per-vendor card (was previously in the Bids tab
 * per BUG-139, owner relocated). Same visibility model as the existing
 * `CommercialDocumentsList`: placeholder until the commercial envelope
 * is OPENED, then a per-file row with View + Download. Audit-before-stream
 * happens server-side, this surface is purely presentational.
 */
export function SupportingDocumentsList({ bidId, commercialEnvelopeStatus }: Props) {
  const { openPdfViewer } = usePdfViewer();
  const [docs, setDocs] = useState<SupportingDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (commercialEnvelopeStatus !== 'OPENED') {
      setDocs(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<{ items: SupportingDocument[] }>(
          `/bids/${bidId}/supporting-documents`,
          token,
        );
        if (!cancelled) setDocs(res.items ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [bidId, commercialEnvelopeStatus]);

  if (commercialEnvelopeStatus !== 'OPENED') {
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
    return <span className="text-xs text-text-secondary">No supporting documents</span>;
  }

  async function handleView(docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${API_BASE}/api/v1/bids/${bidId}/supporting-documents/${docId}/view`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.status === 403) {
        alert('Your role lacks supporting-document access.');
        return;
      }
      if (!res.ok) throw new Error(`Open failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      openPdfViewer({ src: url, title: filename, onClose: () => URL.revokeObjectURL(url) });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open document');
    }
  }

  async function handleDownload(docId: string, filename: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(
        `${API_BASE}/api/v1/bids/${bidId}/supporting-documents/${docId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.status === 403) {
        alert('Your role lacks supporting-document access.');
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
    <div className="space-y-2">
      {docs.map(d => (
        <div key={d.id} className="flex items-center gap-3">
          <span
            className="text-xs text-text-secondary truncate max-w-[260px]"
            title={`${d.filename} · ${(d.fileSize / 1024).toFixed(1)} KB`}
          >
            {d.filename}
          </span>
          <button
            onClick={() => handleView(d.id, d.filename)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
            title="Open in viewer"
          >
            <Eye className="w-3.5 h-3.5" />
            View
          </button>
          <button
            onClick={() => handleDownload(d.id, d.filename)}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      ))}
    </div>
  );
}
