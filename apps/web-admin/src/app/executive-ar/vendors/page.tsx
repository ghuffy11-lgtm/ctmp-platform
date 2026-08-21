'use client';

// Arabic Vendor Directory — same implementation as /executive/vendors with an
// Arabic label set and dir="rtl". Owner request 2026-08-13.
//
// Rows are not clickable: the per-vendor profile page is English-only for now.
// Company names use the vendor's Arabic trade name where one exists (migration
// 054), falling back per row to the Latin name.

import { VendorDirectory } from '@/components/executive/VendorDirectory';
import { ArabicShell, ArabicNav } from '@/components/executive/ArabicShell';
import { VENDOR_DIR_AR } from '@/components/executive/labels';

export default function ArabicVendorDirectoryPage() {
  return (
    <ArabicShell englishHref="/executive/vendors" nav={<ArabicNav active="/executive-ar/vendors" />}>
      <VendorDirectory labels={VENDOR_DIR_AR} dir="rtl" interactive={false} />
    </ArabicShell>
  );
}
