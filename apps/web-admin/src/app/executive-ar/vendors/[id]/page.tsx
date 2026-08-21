'use client';

// Arabic vendor profile. Same component, Arabic labels, RTL.

import { VendorProfile } from '@/components/executive/VendorProfile';
import { ArabicShell, ArabicNav } from '@/components/executive/ArabicShell';
import { VENDOR_PROFILE_AR } from '@/components/executive/labels';

export default function ArabicVendorProfilePage() {
  return (
    <ArabicShell englishHref="/executive/vendors" nav={<ArabicNav active="/executive-ar/vendors" />}>
      <VendorProfile labels={VENDOR_PROFILE_AR} dir="rtl" interactive={false} />
    </ArabicShell>
  );
}
