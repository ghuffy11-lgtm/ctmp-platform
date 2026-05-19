import { Sidebar } from '@/components/layout/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F1F5F9]">
      <Sidebar />
      <main className="ml-[260px] flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
