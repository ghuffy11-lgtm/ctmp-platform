/**
 * BUG-032 — central registry of vendor-facing blocked/transient states.
 * Single source of truth for the friendly copy that replaces generic
 * "Action not available" toasts and silent no-ops.
 *
 * Add new states cleanly here; pages render via `<MessageBanner>` using
 * `vendorMessage(state, ctx)`.
 */

export type VendorBlockedState =
  | 'TENDER_SUBMISSION_CLOSED'
  | 'TENDER_CANCELLED'
  | 'TENDER_AWARDED_ELSEWHERE'
  | 'TENDER_NOT_INVITED'
  | 'TENDER_NOT_PUBLISHED'
  | 'VENDOR_NOT_APPROVED'
  | 'VENDOR_SUSPENDED'
  | 'MFA_REQUIRED'
  | 'ALREADY_SUBMITTED'
  | 'BID_WINDOW_NOT_OPEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'PASSWORD_RESET_TOKEN_INVALID';

export type VendorMessageSeverity = 'info' | 'warning' | 'danger';

export interface VendorMessage {
  title: string;
  body: string;
  action?: { label: string; href: string };
  severity: VendorMessageSeverity;
}

export interface VendorMessageContext {
  deadline?: string;
  tenderRef?: string;
  awardedAt?: string;
}

function formatDeadline(iso?: string): string {
  if (!iso) return 'the published deadline';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function vendorMessage(state: VendorBlockedState, ctx: VendorMessageContext = {}): VendorMessage {
  switch (state) {
    case 'TENDER_SUBMISSION_CLOSED':
      return {
        title: 'Submission window closed',
        body: `The submission deadline (${formatDeadline(ctx.deadline)}) has passed. This tender is no longer accepting bids.`,
        action: { label: 'Browse other tenders', href: '/tenders' },
        severity: 'warning',
      };
    case 'TENDER_CANCELLED':
      return {
        title: 'Tender cancelled',
        body: 'This tender has been cancelled by the procurement team and is no longer accepting bids.',
        action: { label: 'Browse other tenders', href: '/tenders' },
        severity: 'warning',
      };
    case 'TENDER_AWARDED_ELSEWHERE':
      return {
        title: 'Awarded to another vendor',
        body: 'This tender has been awarded. Thank you for participating.',
        action: { label: 'Browse other tenders', href: '/tenders' },
        severity: 'info',
      };
    case 'TENDER_NOT_INVITED':
      return {
        title: 'Invitation only',
        body: 'This tender is restricted to invited vendors. If you believe you should be invited, contact the procurement team.',
        severity: 'info',
      };
    case 'TENDER_NOT_PUBLISHED':
      return {
        title: 'Not yet open for bidding',
        body: 'This tender is not yet open for vendor submissions. Check back after it has been published.',
        action: { label: 'Browse tenders', href: '/tenders' },
        severity: 'info',
      };
    case 'VENDOR_NOT_APPROVED':
      return {
        title: 'Account pending approval',
        body: 'Your account is awaiting administrator approval. You will be notified by email when it is approved.',
        severity: 'info',
      };
    case 'VENDOR_SUSPENDED':
      return {
        title: 'Account suspended',
        body: 'Your account has been suspended. Please contact procurement support for assistance.',
        severity: 'danger',
      };
    case 'MFA_REQUIRED':
      return {
        title: 'Multi-factor authentication required',
        body: 'You must complete multi-factor authentication setup before continuing.',
        action: { label: 'Set up MFA', href: '/profile' },
        severity: 'warning',
      };
    case 'ALREADY_SUBMITTED':
      return {
        title: 'Bid already submitted',
        body: `You have already submitted a bid for ${ctx.tenderRef ?? 'this tender'}. Submitted bids are immutable.`,
        action: { label: 'View my bids', href: '/bids' },
        severity: 'info',
      };
    case 'BID_WINDOW_NOT_OPEN':
      return {
        title: 'Bidding not yet open',
        body: 'This tender is not yet in a bidding state. Check back after publication.',
        severity: 'info',
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        title: 'Verify your email',
        body: 'Please verify your email address before continuing. Check your inbox for the verification link.',
        action: { label: 'Resend verification', href: '/login' },
        severity: 'warning',
      };
    case 'PASSWORD_RESET_TOKEN_INVALID':
      return {
        title: 'Reset link invalid',
        body: 'This password reset link is invalid, expired, or has already been used. Please request a new one.',
        action: { label: 'Request a new link', href: '/forgot-password' },
        severity: 'warning',
      };
  }
}

/**
 * Tender lifecycle status → most appropriate blocked state for the
 * vendor's "Can I bid?" decision. Returns null when bidding IS allowed.
 */
export function blockedStateForTender(status: string): VendorBlockedState | null {
  switch (status) {
    case 'Published':
    case 'Clarification Period':
      return null;
    case 'Draft':
    case 'Internal Review':
    case 'Approved':
      return 'TENDER_NOT_PUBLISHED';
    case 'Submission Closed':
    case 'Technical Opening':
    case 'Technical Evaluation':
    case 'Commercial Sealed':
    case 'Committee Commercial Opening':
    case 'Commercial Evaluation / Comparison':
    case 'Award Recommendation':
      return 'TENDER_SUBMISSION_CLOSED';
    case 'Awarded':
    case 'Tender Closed':
      return 'TENDER_AWARDED_ELSEWHERE';
    case 'Cancelled':
      return 'TENDER_CANCELLED';
    default:
      return 'TENDER_NOT_PUBLISHED';
  }
}
