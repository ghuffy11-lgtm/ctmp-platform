import { Sidebar } from '@/components/layout/Sidebar';
import { TopNavBar } from '@/components/layout/TopNavBar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-on-background">
      <Sidebar />
      <div className="flex-1 ml-[260px] flex flex-col">
        <TopNavBar />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
