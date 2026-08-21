'use client';

// Executive department profile (English). Implementation lives in
// components/executive/DepartmentProfile.tsx so /executive-ar/departments/[id]
// renders the same component with an Arabic label set — a route file may only
// export the page itself, so the component cannot live here.

import { DepartmentProfile } from '@/components/executive/DepartmentProfile';
import { DEPT_PROFILE_EN } from '@/components/executive/labels';

export default function ExecutiveDepartmentDetailPage() {
  return <DepartmentProfile labels={DEPT_PROFILE_EN} dir="ltr" interactive />;
}
