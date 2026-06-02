'use client';

// BUG-071 (2026-06-01): PDFs now open in a new browser tab instead of an in-page
// modal. Owner directive — the modal could be accidentally dismissed by ESC or
// backdrop click, losing the document mid-review. New tab persists until the user
// closes it. Call-site API (`openPdfViewer({ src, title, onClose })`) preserved
// so every existing caller works unchanged.
//
// Auth note: src is always a blob: URL built by the caller after fetching the
// PDF with the Bearer token. Blob URLs are same-origin so the new tab can render
// them directly with the browser's built-in PDF viewer.

import { createContext, useCallback, useContext, useRef } from 'react';

export interface OpenViewerOptions {
  src: string;
  title?: string;
  downloadUrl?: string;
  /** Called when the viewer is no longer needed — caller revokes blob URLs here. */
  onClose?: () => void;
}

interface PdfViewerContextValue {
  openPdfViewer: (opts: OpenViewerOptions) => void;
  closePdfViewer: () => void;
}

const PdfViewerContext = createContext<PdfViewerContextValue | null>(null);

export function usePdfViewer(): PdfViewerContextValue {
  const ctx = useContext(PdfViewerContext);
  if (!ctx) {
    throw new Error('usePdfViewer must be used inside <PdfViewerProvider>');
  }
  return ctx;
}

// Delay before revoking the blob URL — the new tab needs the URL to load the PDF
// into the browser's PDF viewer. 60s is comfortably more than any normal load.
const REVOKE_DELAY_MS = 60_000;

export function PdfViewerProvider({ children }: { children: React.ReactNode }) {
  const pendingRevokes = useRef<number[]>([]);

  const closePdfViewer = useCallback(() => {
    // No-op for new-tab pattern; kept for API compatibility with old callers.
  }, []);

  const openPdfViewer = useCallback((opts: OpenViewerOptions) => {
    if (typeof window === 'undefined') return;
    const w = window.open(opts.src, '_blank');
    if (!w) {
      // Pop-up blocked — fall back to same-tab navigation so the user still sees
      // the document (browser back button returns them).
      window.location.href = opts.src;
      return;
    }
    if (opts.title) {
      try { w.document.title = opts.title; } catch { /* cross-origin in some cases */ }
    }
    if (opts.onClose) {
      const handle = window.setTimeout(opts.onClose, REVOKE_DELAY_MS);
      pendingRevokes.current.push(handle);
    }
  }, []);

  return (
    <PdfViewerContext.Provider value={{ openPdfViewer, closePdfViewer }}>
      {children}
    </PdfViewerContext.Provider>
  );
}
