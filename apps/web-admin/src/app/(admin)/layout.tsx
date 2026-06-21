import { Sidebar } from '@/components/layout/Sidebar';
import { TopNavBar } from '@/components/layout/TopNavBar';
import { PdfViewerProvider } from '@/components/viewer/PdfViewerProvider';
import { DialogProvider } from '@/components/dialog/DialogProvider';
import { IdleTimeoutGuard } from '@/components/layout/IdleTimeoutGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <PdfViewerProvider>
        {/* BUG-112 (2026-06-07) Piece 4: hook signs out + redirects when
            the configured idle timeout elapses without user activity. */}
        <IdleTimeoutGuard />
        <div className="flex min-h-screen bg-background text-on-background">
          <Sidebar />
          <div className="flex-1 ml-[260px] flex flex-col">
            <TopNavBar />
            <main className="flex-1 p-8 overflow-y-auto">
              <div className="max-w-7xl mx-auto w-full space-y-8">{children}</div>
            </main>
          </div>
        </div>
      </PdfViewerProvider>
    </DialogProvider>
  );
}
