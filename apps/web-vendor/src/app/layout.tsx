import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CTMP Vendor Portal',
  description: 'Submit bids, view tenders, manage your vendor profile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
