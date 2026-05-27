'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PdfViewerModal } from './PdfViewerModal';

export interface OpenViewerOptions {
  src: string;
  title?: string;
  downloadUrl?: string;
  /** Called when the viewer closes — use to revoke blob URLs etc. */
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

export function PdfViewerProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<OpenViewerOptions | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const closePdfViewer = useCallback(() => {
    onCloseRef.current?.();
    onCloseRef.current = undefined;
    setOpts(null);
  }, []);

  const openPdfViewer = useCallback((next: OpenViewerOptions) => {
    onCloseRef.current?.();
    onCloseRef.current = next.onClose;
    setOpts(next);
  }, []);

  useEffect(() => {
    if (!opts) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePdfViewer();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [opts, closePdfViewer]);

  useEffect(() => {
    if (!opts) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [opts]);

  return (
    <PdfViewerContext.Provider value={{ openPdfViewer, closePdfViewer }}>
      {children}
      {opts && <PdfViewerModal opts={opts} onClose={closePdfViewer} />}
    </PdfViewerContext.Provider>
  );
}
