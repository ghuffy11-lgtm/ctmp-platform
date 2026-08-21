'use client';

// Executive Dashboard (English). The implementation lives in
// components/executive/ExecutiveDashboard.tsx so the Arabic RTL page at
// /executive-ar renders the SAME component with a different label set —
// see that file and components/executive/labels.ts.
//
// Nothing about this page's appearance or behaviour changed when the body was
// extracted on 2026-08-13: the English label set repeats the previous strings
// verbatim, and drill-down links stay enabled.

import { ExecutiveDashboard } from '@/components/executive/ExecutiveDashboard';
import { EXECUTIVE_LABELS_EN } from '@/components/executive/labels';

export default function ExecutiveDashboardPage() {
  return <ExecutiveDashboard labels={EXECUTIVE_LABELS_EN} dir="ltr" interactive />;
}
