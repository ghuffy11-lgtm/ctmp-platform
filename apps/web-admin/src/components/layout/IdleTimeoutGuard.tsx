'use client';

// BUG-112 (2026-06-07) Piece 4: tiny client wrapper that mounts the
// useIdleTimeout hook on every admin page. Lives in the (admin) layout
// (which is a server component), so it needs its own 'use client' island.

import { useIdleTimeout } from '@/lib/use-idle-timeout';

export function IdleTimeoutGuard() {
  useIdleTimeout();
  return null;
}
