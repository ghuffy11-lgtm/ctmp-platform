'use client';

// Executive Department Directory (English). The implementation lives in
// components/executive/DepartmentOverview.tsx so the Arabic RTL page under
// /executive-ar renders the SAME component with an Arabic label set.
//
// Next.js only allows a route file to export the page itself, which is why the
// component cannot simply be a named export here.

import { DepartmentOverview } from '@/components/executive/DepartmentOverview';
import { DEPT_OVERVIEW_EN } from '@/components/executive/labels';

export default function DepartmentOverviewPage() {
  return <DepartmentOverview labels={DEPT_OVERVIEW_EN} dir="ltr" interactive />;
}
