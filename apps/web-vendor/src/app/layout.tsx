import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VENDOR • CONNECT — CTMP Vendor Portal',
  description: 'Submit bids, view tenders, manage your vendor profile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-slate-900 min-h-screen overflow-x-hidden">{children}</body>
    </html>
  );
}
