'use client';

// Executive Vendor Directory (English). The implementation lives in
// components/executive/VendorDirectory.tsx so the Arabic RTL page under
// /executive-ar renders the SAME component with an Arabic label set.
//
// Next.js only allows a route file to export the page itself, which is why the
// component cannot simply be a named export here.

import { VendorDirectory } from '@/components/executive/VendorDirectory';
import { VENDOR_DIR_EN } from '@/components/executive/labels';

export default function VendorDirectoryPage() {
  return <VendorDirectory labels={VENDOR_DIR_EN} dir="ltr" interactive />;
}
