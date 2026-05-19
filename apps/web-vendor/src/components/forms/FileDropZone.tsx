'use client';

import { useRef, useState } from 'react';
import { getAccessToken } from '@/lib/auth';

interface UploadResponse {
  id: string;
  bidEnvelopeId: string;
  envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  filename: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: string;
}

interface FileDropZoneProps {
  bidId: string;
  envelopeType: 'TECHNICAL' | 'COMMERCIAL';
  onUploaded: (doc: UploadResponse) => void;
  disabled?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function FileDropZone({ bidId, envelopeType, onUploaded, disabled }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch(`${API_BASE}/api/bids/${bidId}/envelopes/${envelopeType}/documents`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message ?? res.statusText);
      }
      const doc = (await res.json()) as UploadResponse;
      onUploaded(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          disabled || uploading
            ? 'border-border bg-bg/40 opacity-50 cursor-not-allowed'
            : dragOver
              ? 'border-accent bg-accent/5'
              : 'border-border bg-card hover:bg-bg/50 hover:border-accent/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
        />
        <span className="material-symbols-outlined text-[40px] text-text-secondary/40 block mb-2">
          {uploading ? 'hourglass_top' : 'upload_file'}
        </span>
        <p className="text-sm font-semibold text-text-primary">
          {uploading ? 'Uploading…' : 'Drop file here or click to browse'}
        </p>
        <p className="text-[11px] text-text-secondary mt-1">
          Max 50 MB. SHA-256 checksum computed server-side.
        </p>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
