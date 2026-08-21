'use client';

// Executive vendor profile (English). Implementation lives in
// components/executive/VendorProfile.tsx so /executive-ar/vendors/[id] renders
// the same component with an Arabic label set.

import { VendorProfile } from '@/components/executive/VendorProfile';
import { VENDOR_PROFILE_EN } from '@/components/executive/labels';

export default function ExecutiveVendorDetailPage() {
  return <VendorProfile labels={VENDOR_PROFILE_EN} dir="ltr" interactive />;
}
