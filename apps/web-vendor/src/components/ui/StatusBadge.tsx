type StatusConfig = { bg: string; text: string; dot: string };

const STATUS_MAP: Record<string, StatusConfig> = {
  'Draft':                               { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8' },
  'Internal Review':                     { bg: '#EFF6FF', text: '#1D4ED8', dot: '#60A5FA' },
  'Approved':                            { bg: '#F0FDF4', text: '#15803D', dot: '#4ADE80' },
  'Published':                           { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  'Clarification Period':                { bg: '#FFFBEB', text: '#B45309', dot: '#FBBF24' },
  'Submission Closed':                   { bg: '#FFF7ED', text: '#C2410C', dot: '#FB923C' },
  'Technical Opening':                   { bg: '#F5F3FF', text: '#7C3AED', dot: '#A78BFA' },
  'Technical Evaluation':                { bg: '#EDE9FE', text: '#6D28D9', dot: '#8B5CF6' },
  'Commercial Sealed':                   { bg: '#F1F5F9', text: '#334155', dot: '#64748B' },
  'Committee Commercial Opening':        { bg: '#EEF2FF', text: '#3730A3', dot: '#818CF8' },
  'Commercial Evaluation / Comparison':  { bg: '#EEF2FF', text: '#4338CA', dot: '#6366F1' },
  'Award Recommendation':                { bg: '#FFFBEB', text: '#92400E', dot: '#D97706' },
  'Awarded':                             { bg: '#F0FDF4', text: '#166534', dot: '#22C55E' },
  'Tender Closed':                       { bg: '#F8FAFC', text: '#475569', dot: '#94A3B8' },
  'Cancelled':                           { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
  'Suspended':                           { bg: '#FFF7ED', text: '#9A3412', dot: '#F97316' },
  'Archived':                            { bg: '#F8FAFC', text: '#94A3B8', dot: '#CBD5E1' },

  // Bid statuses
  'DRAFT':                               { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8' },
  'SUBMITTED':                           { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
  'LATE_SUBMITTED':                      { bg: '#FFF7ED', text: '#C2410C', dot: '#FB923C' },
  'LATE_ACCEPTED':                       { bg: '#FFFBEB', text: '#92400E', dot: '#D97706' },
  'WITHDRAWN':                           { bg: '#F8FAFC', text: '#475569', dot: '#94A3B8' },
  'DISQUALIFIED':                        { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
  'EVALUATED':                           { bg: '#EDE9FE', text: '#6D28D9', dot: '#8B5CF6' },
  'AWARDED':                             { bg: '#F0FDF4', text: '#166534', dot: '#22C55E' },
};

const FALLBACK: StatusConfig = { bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8' };

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? FALLBACK;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {status}
    </span>
  );
}
