import { BadRequestException } from '@nestjs/common';
import { DeliveryPeriodUnit, Prisma } from '@prisma/client';
import { CommercialTermsDto } from './dto/commercial-terms.dto';

/**
 * Bid-level commercial terms (migration 052). Two write paths persist them —
 * `BidsService.updateCommercialTerms` (the original offer) and
 * `NegotiationService.submitNegotiation` (a revised offer per round) — so the
 * cross-field rules and the string trimming live here and both agree.
 *
 * The rules mirror the DB CHECK constraints; raising them here just produces a
 * clearer message than a constraint violation.
 */

/** Columns written to `bids` / `bid_negotiation_submissions`. */
export interface CommercialTermsColumns {
  brandManufacturer: string | null;
  countryOfOrigin: string | null;
  warrantyYears: Prisma.Decimal | null;
  deliveryFrom: number | null;
  deliveryTo: number | null;
  deliveryUnit: DeliveryPeriodUnit | null;
  paymentTerms: string | null;
}

/** Shape returned to clients — plain JSON numbers, never a Decimal. */
export interface CommercialTermsView {
  brandManufacturer: string | null;
  countryOfOrigin: string | null;
  warrantyYears: number | null;
  deliveryFrom: number | null;
  deliveryTo: number | null;
  deliveryUnit: DeliveryPeriodUnit | null;
  paymentTerms: string | null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * Validates the cross-field rules and returns the exact column values to write.
 * Throws BadRequestException on a rule the DTO decorators cannot express.
 */
export function normalizeCommercialTerms(
  dto: CommercialTermsDto | undefined | null,
): CommercialTermsColumns {
  const from = dto?.deliveryFrom ?? null;
  const to = dto?.deliveryTo ?? null;

  if (to != null && from == null) {
    throw new BadRequestException(
      'deliveryTo requires deliveryFrom — enter the start of the delivery period first',
    );
  }
  if (from != null && to != null && to < from) {
    throw new BadRequestException('deliveryTo must be the same as or later than deliveryFrom');
  }

  // A unit alone means nothing; the UI always sends one alongside "from", so
  // default rather than reject (the DB requires a unit whenever "from" is set).
  const unit = from == null ? null : ((dto?.deliveryUnit as DeliveryPeriodUnit | null) ?? DeliveryPeriodUnit.WEEKS);

  const warranty = dto?.warrantyYears;
  return {
    brandManufacturer: blankToNull(dto?.brandManufacturer),
    countryOfOrigin: blankToNull(dto?.countryOfOrigin),
    warrantyYears: warranty == null ? null : new Prisma.Decimal(warranty),
    deliveryFrom: from,
    // "to" is only meaningful as a range; a repeat of "from" collapses to a
    // fixed period so every surface renders "8 Weeks" rather than "8 – 8 Weeks".
    deliveryTo: to == null || to === from ? null : to,
    deliveryUnit: unit,
    paymentTerms: blankToNull(dto?.paymentTerms),
  };
}

/** Maps a persisted row (bid or negotiation submission) to the client shape. */
export function toCommercialTermsView(row: {
  brandManufacturer?: string | null;
  countryOfOrigin?: string | null;
  warrantyYears?: Prisma.Decimal | number | null;
  deliveryFrom?: number | null;
  deliveryTo?: number | null;
  deliveryUnit?: DeliveryPeriodUnit | null;
  paymentTerms?: string | null;
} | null | undefined): CommercialTermsView {
  return {
    brandManufacturer: row?.brandManufacturer ?? null,
    countryOfOrigin: row?.countryOfOrigin ?? null,
    warrantyYears: row?.warrantyYears == null ? null : Number(row.warrantyYears),
    deliveryFrom: row?.deliveryFrom ?? null,
    deliveryTo: row?.deliveryTo ?? null,
    deliveryUnit: row?.deliveryUnit ?? null,
    paymentTerms: row?.paymentTerms ?? null,
  };
}

// ─────────────── Display formatters (Award Minutes PDF) ───────────────
//
// Mirror of packages/shared-types/src/commercial-terms.ts, which the two Next
// apps use. The API deliberately does NOT depend on that workspace package:
// api.Dockerfile installs with --frozen-lockfile and apps/api/package.json
// does not declare it, so adding the dependency would need a lockfile
// regeneration that the air-gapped build box cannot do. Keep the two in sync —
// the PDF and the screen must print identical strings.

export const EMPTY_TERM = '—';

function unitLabel(unit: DeliveryPeriodUnit, plural: boolean): string {
  if (unit === DeliveryPeriodUnit.MONTHS) return plural ? 'Months' : 'Month';
  return plural ? 'Weeks' : 'Week';
}

/** "4 – 8 Weeks" | "8 Weeks" | "1 Month" | "—". */
export function formatDeliveryPeriod(terms: Partial<CommercialTermsView> | null | undefined): string {
  const from = terms?.deliveryFrom ?? null;
  if (from == null) return EMPTY_TERM;
  const unit = terms?.deliveryUnit ?? DeliveryPeriodUnit.WEEKS;
  const to = terms?.deliveryTo ?? null;
  if (to == null || to === from) return `${from} ${unitLabel(unit, from !== 1)}`;
  return `${from} – ${to} ${unitLabel(unit, to !== 1)}`;
}

/** "3 years" | "1 year" | "0.5 years" | "—". */
export function formatWarranty(years: number | null | undefined): string {
  if (years == null || !Number.isFinite(years)) return EMPTY_TERM;
  const value = Number(years.toFixed(2));
  return `${value} ${value === 1 ? 'year' : 'years'}`;
}

/** Free-text term as typed, em dash when blank. */
export function formatTermText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? EMPTY_TERM : trimmed;
}

/**
 * Per-field overlay: a negotiation round only overrides the terms it actually
 * revised, so an unrevised field keeps showing the original bid's value.
 */
export function mergeCommercialTerms(
  base: CommercialTermsView,
  override: CommercialTermsView | null | undefined,
): CommercialTermsView {
  if (!override) return base;
  const deliveryRevised = override.deliveryFrom != null;
  return {
    brandManufacturer: override.brandManufacturer ?? base.brandManufacturer,
    countryOfOrigin: override.countryOfOrigin ?? base.countryOfOrigin,
    warrantyYears: override.warrantyYears ?? base.warrantyYears,
    deliveryFrom: deliveryRevised ? override.deliveryFrom : base.deliveryFrom,
    deliveryTo: deliveryRevised ? override.deliveryTo : base.deliveryTo,
    deliveryUnit: deliveryRevised ? override.deliveryUnit : base.deliveryUnit,
    paymentTerms: override.paymentTerms ?? base.paymentTerms,
  };
}

/** True when nothing at all was filled in — used to skip an empty PDF table. */
export function hasAnyCommercialTerm(terms: CommercialTermsView | null | undefined): boolean {
  if (!terms) return false;
  return (
    terms.brandManufacturer != null ||
    terms.countryOfOrigin != null ||
    terms.warrantyYears != null ||
    terms.deliveryFrom != null ||
    terms.paymentTerms != null
  );
}

/** The columns Prisma must select to build a CommercialTermsView. */
export const COMMERCIAL_TERMS_SELECT = {
  brandManufacturer: true,
  countryOfOrigin: true,
  warrantyYears: true,
  deliveryFrom: true,
  deliveryTo: true,
  deliveryUnit: true,
  paymentTerms: true,
} as const;
