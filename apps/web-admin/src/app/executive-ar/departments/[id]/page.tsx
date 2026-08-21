'use client';

// Arabic department profile. Same component, Arabic labels, RTL.
// Tender links inside still point at English tender screens, so interactive
// is false — names render as text rather than leading out of the Arabic area.

import { DepartmentProfile } from '@/components/executive/DepartmentProfile';
import { ArabicShell, ArabicNav } from '@/components/executive/ArabicShell';
import { DEPT_PROFILE_AR } from '@/components/executive/labels';

export default function ArabicDepartmentProfilePage() {
  return (
    <ArabicShell englishHref="/executive/departments" nav={<ArabicNav active="/executive-ar/departments" />}>
      <DepartmentProfile labels={DEPT_PROFILE_AR} dir="rtl" interactive={false} />
    </ArabicShell>
  );
}
