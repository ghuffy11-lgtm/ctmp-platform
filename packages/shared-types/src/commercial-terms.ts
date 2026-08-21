// Bid-level commercial terms (migration 052, 2026-08-06).
//
// A vendor's offer carries five terms that describe the WHOLE offer rather than
// a BOQ line: brand/manufacturer, country of origin, warranty, delivery period
// and payment terms. They are rendered in five places — the vendor bid wizard,
// the wizard review step, the vendor bid detail page, the admin Commercial
// Comparison and the Award Minutes PDF — so the formatters live here and every
// surface prints the identical string.

export type DeliveryPeriodUnit = 'WEEKS' | 'MONTHS';

export interface CommercialTerms {
  brandManufacturer: string | null;
  countryOfOrigin: string | null;
  /** Years; decimals allowed (0.5 = 6 months). */
  warrantyYears: number | null;
  deliveryFrom: number | null;
  /** Optional upper bound. Null = a fixed period, not a range. */
  deliveryTo: number | null;
  deliveryUnit: DeliveryPeriodUnit | null;
  /** Free text, one milestone per line. Line breaks are significant. */
  paymentTerms: string | null;
}

/** What every surface prints for a term the vendor left blank. */
export const EMPTY_TERM = '—';

function unitLabel(unit: DeliveryPeriodUnit, plural: boolean): string {
  if (unit === 'MONTHS') return plural ? 'Months' : 'Month';
  return plural ? 'Weeks' : 'Week';
}

/**
 * "4 – 8 Weeks" for a range, "8 Weeks" when the upper bound is blank,
 * "1 Month" when the rendered value is exactly 1, "—" when unset.
 */
export function formatDeliveryPeriod(
  terms: Partial<Pick<CommercialTerms, 'deliveryFrom' | 'deliveryTo' | 'deliveryUnit'>> | null | undefined,
): string {
  const from = terms?.deliveryFrom ?? null;
  if (from == null) return EMPTY_TERM;

  // The DB guarantees a unit whenever "from" is set; default defensively so a
  // legacy or hand-edited row can never render "4 – 8 undefined".
  const unit = terms?.deliveryUnit ?? 'WEEKS';
  const to = terms?.deliveryTo ?? null;

  // A range collapses to a single value when both ends match.
  if (to == null || to === from) {
    return `${from} ${unitLabel(unit, from !== 1)}`;
  }
  return `${from} – ${to} ${unitLabel(unit, to !== 1)}`;
}

/** "3 years" / "1 year" / "0.5 years" / "—". */
export function formatWarranty(years: number | null | undefined): string {
  if (years == null || !Number.isFinite(years)) return EMPTY_TERM;
  // NUMERIC(5,2) arrives as 3 or 3.00 depending on the driver — print the
  // shortest exact form so "3.00 years" never reaches a buyer.
  const value = Number(years.toFixed(2));
  return `${value} ${value === 1 ? 'year' : 'years'}`;
}

/**
 * Trims, normalises CRLF and collapses runs of blank lines to one, keeping the
 * vendor's own line breaks intact for a `white-space: pre-line` cell.
 */
export function formatPaymentTerms(value: string | null | undefined): string {
  if (value == null) return EMPTY_TERM;
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned === '' ? EMPTY_TERM : cleaned;
}

/** Free-text terms print as typed; blank ones print the em dash. */
export function formatTermText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? EMPTY_TERM : trimmed;
}

/**
 * Per-field overlay used by the negotiation rounds: a round only overrides the
 * terms the vendor actually revised, so anything left alone keeps showing the
 * original bid's value. Delivery is overlaid as a unit (from/to/unit together)
 * because a revised range must never mix with the old one.
 *
 * Mirrors mergeCommercialTerms in apps/api/src/modules/bids/commercial-terms.util.ts,
 * which the Award Minutes PDF uses — keep the two in step.
 */
export function mergeCommercialTerms(
  base: Partial<CommercialTerms> | null | undefined,
  override: Partial<CommercialTerms> | null | undefined,
): CommercialTerms {
  const merged: CommercialTerms = {
    brandManufacturer: base?.brandManufacturer ?? null,
    countryOfOrigin: base?.countryOfOrigin ?? null,
    warrantyYears: base?.warrantyYears ?? null,
    deliveryFrom: base?.deliveryFrom ?? null,
    deliveryTo: base?.deliveryTo ?? null,
    deliveryUnit: base?.deliveryUnit ?? null,
    paymentTerms: base?.paymentTerms ?? null,
  };
  if (!override) return merged;
  return {
    brandManufacturer: override.brandManufacturer ?? merged.brandManufacturer,
    countryOfOrigin: override.countryOfOrigin ?? merged.countryOfOrigin,
    warrantyYears: override.warrantyYears ?? merged.warrantyYears,
    deliveryFrom: override.deliveryFrom != null ? override.deliveryFrom : merged.deliveryFrom,
    deliveryTo: override.deliveryFrom != null ? (override.deliveryTo ?? null) : merged.deliveryTo,
    deliveryUnit: override.deliveryFrom != null ? (override.deliveryUnit ?? null) : merged.deliveryUnit,
    paymentTerms: override.paymentTerms ?? merged.paymentTerms,
  };
}

/** True when the vendor filled in nothing at all — used to hide empty blocks. */
export function hasAnyCommercialTerm(terms: Partial<CommercialTerms> | null | undefined): boolean {
  if (!terms) return false;
  return (
    (terms.brandManufacturer?.trim() ?? '') !== '' ||
    (terms.countryOfOrigin?.trim() ?? '') !== '' ||
    terms.warrantyYears != null ||
    terms.deliveryFrom != null ||
    (terms.paymentTerms?.trim() ?? '') !== ''
  );
}
