import { TenderStatus, TenderVisibility } from '@prisma/client';

/**
 * Why a vendor cannot open or bid on a tender, in words a supplier can act on.
 *
 * Owner report 2026-08-07: a vendor holding a DRAFT bid opened a tender whose
 * submission window had closed and got "Tender not accessible to vendor" — true,
 * but it reads like a permissions fault and tells them nothing. Every vendor-
 * facing refusal now names the actual reason, the date where one exists, and
 * where their work still lives.
 *
 * Returns null when access is allowed.
 */

/** Statuses in which a vendor may open a tender at all. */
export const VENDOR_VIEWABLE_STATUSES: TenderStatus[] = [
  TenderStatus.PUBLISHED,
  TenderStatus.CLARIFICATION_PERIOD,
  // A negotiation round happens after the original deadline — invited vendors
  // must still reach the tender to submit their revised offer.
  TenderStatus.NEGOTIATION,
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Jun 2026, 20:59" — formatted here rather than via Intl so the output
 *  does not depend on the container's ICU build. */
export function formatDeadline(value: Date | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

const MY_BIDS = 'Any bid you submitted stays visible under My Bids.';

/** Phase-specific wording for a tender that has moved past bidding. */
function statusReason(status: TenderStatus, deadline: string | null): string | null {
  switch (status) {
    case TenderStatus.DRAFT:
    case TenderStatus.INTERNAL_REVIEW:
    case TenderStatus.APPROVED:
      return 'This tender has not been published yet. It will appear under Open Tenders once the procurement team publishes it.';

    case TenderStatus.SUBMISSION_CLOSED:
    case TenderStatus.TECHNICAL_OPENING:
    case TenderStatus.TECHNICAL_EVALUATION:
    case TenderStatus.COMMERCIAL_SEALED:
    case TenderStatus.COMMITTEE_COMMERCIAL_OPENING:
    case TenderStatus.COMMERCIAL_EVALUATION:
    case TenderStatus.AWARD_RECOMMENDATION:
      return deadline
        ? `Submissions for this tender closed on ${deadline} and it is now being evaluated, so it can no longer be opened. ${MY_BIDS}`
        : `Submissions for this tender are closed and it is now being evaluated, so it can no longer be opened. ${MY_BIDS}`;

    case TenderStatus.AWARDED:
      return `This tender has been awarded and is now closed. ${MY_BIDS}`;

    case TenderStatus.TENDER_CLOSED:
    case TenderStatus.ARCHIVED:
      return `This tender is closed. ${MY_BIDS}`;

    case TenderStatus.CANCELLED:
      return 'This tender was cancelled by the procurement team, so it is no longer open to bids.';

    case TenderStatus.SUSPENDED:
      return 'This tender is temporarily suspended by the procurement team. It may reopen — check back, or ask through Clarifications.';

    default:
      return null;
  }
}

/**
 * Can this vendor OPEN the tender? Null = yes.
 * `invited` is whether the vendor appears in tender_vendors.
 */
export function vendorTenderViewDenial(
  tender: { status: TenderStatus; visibility: TenderVisibility; submissionCloseAt?: Date | null },
  invited: boolean,
): string | null {
  if (tender.visibility === TenderVisibility.INVITATION_ONLY && !invited) {
    return 'This tender is by invitation only and your company has not been invited to it. If you believe that is a mistake, contact the procurement team.';
  }
  if (!VENDOR_VIEWABLE_STATUSES.includes(tender.status)) {
    return (
      statusReason(tender.status, formatDeadline(tender.submissionCloseAt)) ??
      'This tender is not open to vendors at the moment.'
    );
  }
  return null;
}

/**
 * Can this vendor START or RESUME a bid? Stricter than viewing: the tender must
 * also still be inside its submission window. Null = yes.
 */
export function vendorTenderBidDenial(
  tender: { status: TenderStatus; visibility: TenderVisibility; submissionCloseAt?: Date | null },
  invited: boolean,
): string | null {
  const viewDenial = vendorTenderViewDenial(tender, invited);
  if (viewDenial) return viewDenial;

  if (tender.status === TenderStatus.NEGOTIATION) {
    return 'This tender is in the negotiation stage. New bids cannot be started — if you were invited to a negotiation round, open your bid under My Bids to submit the revised offer.';
  }

  const deadline = formatDeadline(tender.submissionCloseAt);
  if (tender.submissionCloseAt && new Date(tender.submissionCloseAt).getTime() < Date.now()) {
    return `The submission deadline for this tender passed on ${deadline}, so a bid can no longer be started or submitted. If you have a genuine reason for a late submission, contact the procurement team — only they can grant an exception.`;
  }
  return null;
}
