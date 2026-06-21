'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { get } from '@/lib/api';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  /** Wider container (e.g. for the registration form). */
  wide?: boolean;
}

// BUG-108 (2026-06-05): vendor login/register/reset-password/verify-email
// pages render the uploaded vendor logo + the configurable Vendor Portal
// Name (falls back to system_name when unset). Anonymous /public-branding
// fetch — no auth needed.
interface BrandingResponse {
  systemName: string;
  vendorPortalName: string;
  hasVendorLogo: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export function AuthShell({ title, subtitle, children, className, wide }: AuthShellProps) {
  const [branding, setBranding] = useState<BrandingResponse>({
    systemName: 'CTMP',
    vendorPortalName: 'CTMP',
    hasVendorLogo: false,
  });

  useEffect(() => {
    get<BrandingResponse>('/public-branding').then(setBranding).catch(() => {});
  }, []);

  const portalName = branding.vendorPortalName || branding.systemName || 'CTMP';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className={cn('w-full', wide ? 'max-w-3xl' : 'max-w-md')}>
        <Link href="/login" className="flex items-center gap-3 mb-8 justify-center">
          {branding.hasVendorLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_BASE}/api/v1/branding/vendor_logo`}
              alt={portalName}
              className="h-12 max-w-[200px] object-contain"
            />
          ) : (
            <div className="w-10 h-10 bg-electric-500 rounded-2xl flex items-center justify-center text-[#0A1428] font-bold text-2xl leading-none">
              V
            </div>
          )}
          <div className="heading-font tracking-tighter leading-none">
            <div className="text-2xl font-semibold">{portalName.toUpperCase()}</div>
            <div className="text-electric-500 text-[10px] tracking-[4px] font-medium mt-0.5">VENDOR PORTAL</div>
          </div>
        </Link>
        <div className={cn('glass rounded-3xl p-10', className)}>
          <div className="text-center mb-8">
            <h1 className="heading-font text-3xl font-semibold tracking-tighter">{title}</h1>
            {subtitle && <p className="text-slate-900/60 text-sm mt-2">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
