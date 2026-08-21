'use client';

// Arabic (RTL) Management Dashboard — owner request 2026-08-13.
//
// The RTL frame, the login redirect and the `executive:dashboard` permission
// gate all live in ArabicShell, shared with the Arabic department overview and
// vendor directory so the guard cannot drift between them.
//
// `sectionLinks` re-opens the two drill-downs that now have Arabic equivalents;
// KPI tiles and pipeline rows stay static because their targets
// (/executive/tenders, the per-item profiles) are still English-only.

import { ExecutiveDashboard } from '@/components/executive/ExecutiveDashboard';
import { ArabicShell, ArabicNav } from '@/components/executive/ArabicShell';
import { EXECUTIVE_LABELS_AR } from '@/components/executive/labels';

export default function ExecutiveDashboardArabicPage() {
  return (
    <ArabicShell englishHref="/executive" nav={<ArabicNav active="/executive-ar" />}>
      <ExecutiveDashboard
        labels={EXECUTIVE_LABELS_AR}
        dir="rtl"
        interactive={false}
        sectionLinks={{
          departments: '/executive-ar/departments',
          vendors: '/executive-ar/vendors',
        }}
      />
    </ArabicShell>
  );
}
