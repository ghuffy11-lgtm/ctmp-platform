'use client';

import { X, Download } from 'lucide-react';
import type { OpenViewerOptions } from './PdfViewerProvider';

interface Props {
  opts: OpenViewerOptions;
  onClose: () => void;
}

export function PdfViewerModal({ opts, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={opts.title ?? 'PDF viewer'}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">
            {opts.title ?? 'Document'}
          </p>
          <p className="text-xs text-text-secondary">
            View-only · Every view is audit-logged · Press ESC to close
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {opts.downloadUrl && (
            <a
              href={opts.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-semibold text-text-secondary border border-border rounded-lg hover:bg-bg transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:bg-bg rounded-lg transition-colors"
            aria-label="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <iframe
        src={opts.src}
        title={opts.title ?? 'PDF viewer'}
        className="flex-1 w-full bg-white border-0"
      />
    </div>
  );
}
