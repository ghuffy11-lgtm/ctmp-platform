'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { get } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

export interface QuorumState {
  sessionId?: string;
  hasQuorum: boolean;
  reason: string | null;
  requiredCount: number | null;
  presentCount: number;
  totalMembers: number;
  chairPresent: boolean;
  requiredRoleCode: string;
  requiredRolePresent: boolean;
}

interface Props {
  tenderId: string;
  onLoaded?: (state: QuorumState) => void;
}

/**
 * Phase D (BUG-040). Compact chip that shows whether the latest committee
 * session has a quorum + the required role (default CHAIR) marked PRESENT.
 * Surfaces a clear disabled-reason per master plan G5 ("Need 2 more members
 * + Chair must be present").
 */
export function QuorumStatus({ tenderId, onLoaded }: Props) {
  const [state, setState] = useState<QuorumState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = getAccessToken();
        const res = await get<QuorumState>(`/tenders/${tenderId}/quorum`, token);
        if (cancelled) return;
        setState(res);
        onLoaded?.(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load quorum');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenderId]);

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="w-3.5 h-3.5" />
        Quorum check failed
      </span>
    );
  }
  if (!state) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-bg text-text-secondary border border-border">
        <Users className="w-3.5 h-3.5" />
        Checking quorum…
      </span>
    );
  }

  if (state.hasQuorum) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full bg-success/10 text-success"
        title={`${state.presentCount} of ${state.totalMembers} present · ${state.requiredRoleCode} present`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        Quorum met
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-900 border border-amber-200"
      title={state.reason ?? undefined}
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      Quorum: {state.reason ?? 'not met'}
    </span>
  );
}
