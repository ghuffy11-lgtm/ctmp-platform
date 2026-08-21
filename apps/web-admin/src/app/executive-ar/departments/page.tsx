'use client';

// Arabic Department Overview — the same implementation as /executive/departments
// with an Arabic label set and dir="rtl". Owner request 2026-08-13.
//
// Rows are not clickable here: the per-department profile page is English-only
// for now, and sending a management reader into an English screen mid-flow is
// worse than a static row.

import { DepartmentOverview } from '@/components/executive/DepartmentOverview';
import { ArabicShell, ArabicNav } from '@/components/executive/ArabicShell';
import { DEPT_OVERVIEW_AR } from '@/components/executive/labels';

export default function ArabicDepartmentOverviewPage() {
  return (
    <ArabicShell englishHref="/executive/departments" nav={<ArabicNav active="/executive-ar/departments" />}>
      <DepartmentOverview labels={DEPT_OVERVIEW_AR} dir="rtl" interactive={false} />
    </ArabicShell>
  );
}
