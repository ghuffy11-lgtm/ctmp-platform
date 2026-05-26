import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple' | 'electric';

type StatusEntry = { tone: Tone };

const STATUS_MAP: Record<string, StatusEntry> = {
  // Tender lifecycle
  'Draft':                              { tone: 'neutral' },
  'Internal Review':                    { tone: 'info' },
  'Approved':                           { tone: 'success' },
  'Published':                          { tone: 'electric' },
  'Clarification Period':               { tone: 'warning' },
  'Submission Closed':                  { tone: 'warning' },
  'Technical Opening':                  { tone: 'purple' },
  'Technical Evaluation':               { tone: 'purple' },
  'Commercial Sealed':                  { tone: 'neutral' },
  'Committee Commercial Opening':       { tone: 'info' },
  'Commercial Evaluation / Comparison': { tone: 'info' },
  'Award Recommendation':               { tone: 'warning' },
  'Awarded':                            { tone: 'success' },
  'Tender Closed':                      { tone: 'neutral' },
  'Cancelled':                          { tone: 'danger' },
  'Suspended':                          { tone: 'warning' },
  'Archived':                           { tone: 'neutral' },

  // Bid statuses
  'DRAFT':                              { tone: 'neutral' },
  'SUBMITTED':                          { tone: 'electric' },
  'LATE_SUBMITTED':                     { tone: 'warning' },
  'LATE_ACCEPTED':                      { tone: 'warning' },
  'WITHDRAWN':                          { tone: 'neutral' },
  'DISQUALIFIED':                       { tone: 'danger' },
  'EVALUATED':                          { tone: 'purple' },
  'AWARDED':                            { tone: 'success' },

  // Clarification statuses
  'OPEN':                               { tone: 'warning' },
  'ANSWERED':                           { tone: 'success' },
  'CLOSED':                             { tone: 'neutral' },

  // Bid result
  'PASS':                               { tone: 'success' },
  'FAIL':                               { tone: 'danger' },
  'PENDING':                            { tone: 'neutral' },
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral:  'bg-slate-900/8 text-slate-700',
  info:     'bg-sky-100 text-sky-700',
  electric: 'bg-electric-500/15 text-electric-600',
  success:  'bg-emerald-100 text-emerald-700',
  warning:  'bg-amber-100 text-amber-700',
  danger:   'bg-rose-100 text-rose-700',
  purple:   'bg-violet-100 text-violet-700',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const cfg = STATUS_MAP[status] ?? { tone: 'neutral' as Tone };
  return (
    <span
      className={cn(
        'inline-flex items-center px-4 py-1 rounded-3xl text-[11px] font-semibold tracking-wide whitespace-nowrap',
        TONE_CLASSES[cfg.tone],
        className,
      )}
    >
      {status}
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-4 py-1 rounded-3xl text-[11px] font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
