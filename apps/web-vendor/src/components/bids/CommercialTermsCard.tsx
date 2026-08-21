'use client';

import {
  type CommercialTerms,
  type DeliveryPeriodUnit,
  formatDeliveryPeriod,
  formatPaymentTerms,
  formatTermText,
  formatWarranty,
} from '@ctmp/shared-types';

// Migration 052 (2026-08-06): the five bid-level commercial terms a vendor
// records with an offer. Used on the bid wizard's Commercial Pricing step and
// on the negotiation re-pricing form, so the field set, the validation and the
// payload shape stay identical on both.
//
// Every field is optional — nothing here may ever block a bid submission.

export interface CommercialTermsDraft {
  brandManufacturer: string;
  countryOfOrigin: string;
  warrantyYears: string;
  deliveryFrom: string;
  deliveryTo: string;
  deliveryUnit: DeliveryPeriodUnit;
  paymentTerms: string;
}

/** Stringly-typed form state, matching the BoqLineDraft convention. */
export const EMPTY_COMMERCIAL_TERMS_DRAFT: CommercialTermsDraft = {
  brandManufacturer: '',
  countryOfOrigin: '',
  warrantyYears: '',
  deliveryFrom: '',
  deliveryTo: '',
  deliveryUnit: 'WEEKS',
  paymentTerms: '',
};

/** Hydrates the form from a stored set of terms. */
export function toCommercialTermsDraft(
  terms: Partial<CommercialTerms> | null | undefined,
): CommercialTermsDraft {
  return {
    brandManufacturer: terms?.brandManufacturer ?? '',
    countryOfOrigin: terms?.countryOfOrigin ?? '',
    warrantyYears: terms?.warrantyYears != null ? String(terms.warrantyYears) : '',
    deliveryFrom: terms?.deliveryFrom != null ? String(terms.deliveryFrom) : '',
    deliveryTo: terms?.deliveryTo != null ? String(terms.deliveryTo) : '',
    deliveryUnit: terms?.deliveryUnit ?? 'WEEKS',
    paymentTerms: terms?.paymentTerms ?? '',
  };
}

/** '' → null, numerics coerced. The API replaces the whole set on every save. */
export function toCommercialTermsPayload(draft: CommercialTermsDraft) {
  const from = draft.deliveryFrom.trim() === '' ? null : Number(draft.deliveryFrom);
  const to = draft.deliveryTo.trim() === '' ? null : Number(draft.deliveryTo);
  const warranty = draft.warrantyYears.trim() === '' ? null : Number(draft.warrantyYears);
  return {
    brandManufacturer: draft.brandManufacturer.trim() === '' ? null : draft.brandManufacturer.trim(),
    countryOfOrigin: draft.countryOfOrigin.trim() === '' ? null : draft.countryOfOrigin.trim(),
    warrantyYears: warranty,
    deliveryFrom: from,
    // "to" and the unit carry no meaning without "from" — the API rejects them.
    deliveryTo: from == null ? null : to,
    deliveryUnit: from == null ? null : draft.deliveryUnit,
    paymentTerms: draft.paymentTerms.trim() === '' ? null : draft.paymentTerms,
  };
}

/** Draft → the stored shape, for previewing the terms with the formatters. */
export function draftToCommercialTerms(draft: CommercialTermsDraft): CommercialTerms {
  const payload = toCommercialTermsPayload(draft);
  return {
    ...payload,
    deliveryUnit: payload.deliveryUnit ?? null,
  };
}

/**
 * Mirrors the server rules so the vendor sees the problem inline instead of a
 * 400. Returns null when the draft is fine.
 */
export function validateCommercialTermsDraft(draft: CommercialTermsDraft): string | null {
  const from = draft.deliveryFrom.trim();
  const to = draft.deliveryTo.trim();
  const warranty = draft.warrantyYears.trim();

  if (warranty !== '') {
    const n = Number(warranty);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      return 'Warranty must be a number of years between 0 and 99.';
    }
  }
  if (from !== '') {
    const n = Number(from);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      return 'Delivery period must be a whole number of weeks or months (1–999).';
    }
  }
  if (to !== '') {
    if (from === '') return 'Enter the start of the delivery period before the end.';
    const nTo = Number(to);
    if (!Number.isInteger(nTo) || nTo < 1 || nTo > 999) {
      return 'Delivery period must be a whole number of weeks or months (1–999).';
    }
    if (nTo < Number(from)) {
      return '"To" must be the same as or later than "From".';
    }
  }
  return null;
}

// Width is deliberately NOT in the base: Tailwind emits `w-full` after the
// fixed widths, so appending `w-24` to a class string that already contains
// `w-full` loses — which is what made the delivery "From" box swallow the row.
// Anything narrower than full width composes from INPUT_BASE instead.
const INPUT_BASE =
  'px-3 py-2 text-sm border border-border rounded-lg bg-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent';
const INPUT_CLASS = `w-full ${INPUT_BASE}`;

/**
 * Whole years, 1–10 (owner decision 2026-08-06 — decimals were more precision
 * than anyone offers). A stored value outside that range — an earlier 0.5, or
 * anything a future admin tool writes — is kept as an extra option so opening
 * the form never silently rewrites what the vendor already saved.
 */
const WARRANTY_YEARS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

function warrantyOptions(current: string): string[] {
  const value = current.trim();
  if (value === '' || WARRANTY_YEARS.includes(value)) return WARRANTY_YEARS;
  return [...WARRANTY_YEARS, value];
}

/**
 * Delivery periods are whole units, at most two digits (owner decision
 * 2026-08-06 — "12 or 13 weeks/months", nobody quotes 100+). Strips anything a
 * number input would otherwise let through, plus leading zeros: "08" reaches
 * the API as 8 anyway, and "0" would trip the >= 1 rule with a confusing error.
 */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2);
}

export function CommercialTermsCard({
  draft,
  setDraft,
  error,
  disabled,
}: {
  draft: CommercialTermsDraft;
  setDraft: (next: CommercialTermsDraft) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  function patch(next: Partial<CommercialTermsDraft>) {
    setDraft({ ...draft, ...next });
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-bg/60 border-b border-border flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-text-primary">Commercial Terms</h3>
        <span className="text-xs text-text-secondary">
          All fields optional — leaving them blank will not block your submission
        </span>
      </div>

      <div className="p-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ct-brand" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Brand / Manufacturer
          </label>
          <input
            id="ct-brand"
            type="text"
            maxLength={255}
            value={draft.brandManufacturer}
            disabled={disabled}
            onChange={e => patch({ brandManufacturer: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ct-origin" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Country of Origin
          </label>
          <input
            id="ct-origin"
            type="text"
            maxLength={120}
            value={draft.countryOfOrigin}
            disabled={disabled}
            onChange={e => patch({ countryOfOrigin: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ct-warranty" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Warranty (years)
          </label>
          <select
            id="ct-warranty"
            value={draft.warrantyYears}
            disabled={disabled}
            onChange={e => patch({ warrantyYears: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="">—</option>
            {warrantyOptions(draft.warrantyYears).map(years => (
              <option key={years} value={years}>
                {years} {years === '1' ? 'year' : 'years'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ct-delivery-from" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Delivery Period
          </label>
          <div className="flex items-center gap-2">
            <input
              id="ct-delivery-from"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              placeholder="From"
              value={draft.deliveryFrom}
              disabled={disabled}
              onChange={e => patch({ deliveryFrom: digitsOnly(e.target.value) })}
              className={`${INPUT_BASE} w-16 shrink-0 font-mono`}
              aria-label="Delivery period from"
            />
            <span className="text-xs text-text-secondary shrink-0">to</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              placeholder="To"
              value={draft.deliveryTo}
              disabled={disabled || draft.deliveryFrom.trim() === ''}
              onChange={e => patch({ deliveryTo: digitsOnly(e.target.value) })}
              className={`${INPUT_BASE} w-16 shrink-0 font-mono disabled:opacity-50`}
              aria-label="Delivery period to (optional)"
            />
            <select
              value={draft.deliveryUnit}
              disabled={disabled}
              onChange={e => patch({ deliveryUnit: e.target.value as DeliveryPeriodUnit })}
              className={`${INPUT_BASE} w-auto shrink-0`}
              aria-label="Delivery period unit"
            >
              <option value="WEEKS">Weeks</option>
              <option value="MONTHS">Months</option>
            </select>
          </div>
          <span className="text-xs text-text-secondary">
            Leave “To” empty for a fixed period — 8 with no “To” shows as “8 Weeks”
          </span>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ct-payment" className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Payment Terms
          </label>
          <textarea
            id="ct-payment"
            rows={6}
            maxLength={4000}
            value={draft.paymentTerms}
            disabled={disabled}
            onChange={e => patch({ paymentTerms: e.target.value })}
            placeholder={'25% upon signing the contract\n25% upon delivery and installation\n25% 3 months after the Acceptance Certificate\n25% 6 months after the Acceptance Certificate'}
            className={`${INPUT_CLASS} font-sans leading-relaxed`}
          />
          <span className="text-xs text-text-secondary">
            One milestone per line — your line breaks are kept everywhere this is shown
          </span>
        </div>

        {error && (
          <p role="alert" className="sm:col-span-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Read-only rendering used by the wizard review step and the bid detail page. */
export function CommercialTermsSummary({
  terms,
  className,
}: {
  terms: Partial<CommercialTerms> | null | undefined;
  className?: string;
}) {
  const rows = commercialTermsRows(terms);
  return (
    <dl className={`grid gap-x-4 gap-y-2 sm:grid-cols-[190px_1fr] ${className ?? ''}`}>
      {rows.map(row => (
        <div key={row.label} className="contents">
          <dt className="text-xs font-semibold text-text-secondary">{row.label}</dt>
          <dd className={`text-sm text-text-primary ${row.preLine ? 'whitespace-pre-line' : ''}`}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function commercialTermsRows(terms: Partial<CommercialTerms> | null | undefined) {
  return [
    { label: 'Brand / Manufacturer', value: formatTermText(terms?.brandManufacturer) },
    { label: 'Country of Origin', value: formatTermText(terms?.countryOfOrigin) },
    { label: 'Warranty', value: formatWarranty(terms?.warrantyYears ?? null) },
    { label: 'Delivery Period', value: formatDeliveryPeriod(terms) },
    { label: 'Payment Terms', value: formatPaymentTerms(terms?.paymentTerms), preLine: true },
  ];
}
