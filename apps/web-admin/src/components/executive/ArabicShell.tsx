'use client';

// Shared chrome for every Arabic management page (/executive-ar/**).
//
// Extracted 2026-08-13 when the Arabic area grew past a single page: the
// dashboard, the department overview and the vendor directory all need the same
// RTL frame, the same login + permission guard, and the same escape hatch to the
// English portal. Keeping it in one place means the guard can't drift between
// pages — the risk being a new Arabic page that quietly forgets to check.
//
// Access is gated on `executive:dashboard`, exactly what the analytics endpoints
// behind these pages require, so the screen and the API can never disagree.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { AR_RESTRICTED, EXECUTIVE_LABELS_AR } from './labels';
import { getAccessToken, hasPermission } from '@/lib/auth';

type Gate = 'checking' | 'allowed' | 'denied';

export function ArabicShell({
  children,
  /** Where the "English" link goes — the equivalent English screen. */
  englishHref,
  /** Optional in-Arabic navigation shown under the header. */
  nav,
}: {
  children: ReactNode;
  englishHref: string;
  nav?: ReactNode;
}) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>('checking');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setGate(hasPermission(token, 'executive:dashboard') ? 'allowed' : 'denied');
  }, [router]);

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-background text-on-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto w-full px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="leading-tight">
            <div className="text-sm font-bold">نظام المناقصات</div>
            <div className="text-[11px] text-text-secondary">بوابة الإدارة</div>
          </div>
          <Link href={englishHref} dir="ltr" className="text-sm text-accent hover:underline">
            English
          </Link>
        </div>
        {gate === 'allowed' && nav && (
          <div className="max-w-7xl mx-auto w-full px-6 lg:px-8 pb-3 flex items-center gap-5 text-sm">
            {nav}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto w-full px-6 lg:px-8 py-8">
        {gate === 'checking' && (
          <div className="bg-card border border-border rounded-xl p-10 flex items-center justify-center gap-2 text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" /> {EXECUTIVE_LABELS_AR.loading}
          </div>
        )}

        {gate === 'denied' && (
          <div className="bg-card border border-border rounded-xl p-10 text-center max-w-xl mx-auto">
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-lg font-bold mt-3">{AR_RESTRICTED.title}</h1>
            <p className="text-sm text-text-secondary mt-2">{AR_RESTRICTED.body}</p>
            <Link
              href="/dashboard"
              className="inline-block mt-5 px-4 py-2 rounded-lg border border-border text-sm hover:bg-bg"
            >
              {AR_RESTRICTED.back}
            </Link>
          </div>
        )}

        {gate === 'allowed' && children}
      </main>
    </div>
  );
}

/** The three Arabic management screens, for the header nav. */
export const AR_NAV = [
  { href: '/executive-ar', label: 'لوحة المعلومات' },
  { href: '/executive-ar/departments', label: 'دليل الإدارات' },
  { href: '/executive-ar/vendors', label: 'دليل الموردين' },
];

export function ArabicNav({ active }: { active: string }) {
  return (
    <>
      {AR_NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={
            item.href === active
              ? 'font-bold text-accent'
              : 'text-text-secondary hover:text-text-primary'
          }
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
