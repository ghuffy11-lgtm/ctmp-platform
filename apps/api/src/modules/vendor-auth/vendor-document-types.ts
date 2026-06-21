// BUG-137 (2026-06-19): canonical list of document types that a vendor
// uploads during self-registration. V1 ships with a hard-coded catalogue —
// owner can move this to system settings later if they want admin-editable
// types. Frontend imports the same list to render the upload slots.

export interface VendorDocType {
  code: string;
  label: string;
  /** When true, registration cannot complete until this slot has a file. */
  required: boolean;
  /** When true, the slot accepts multiple files (up to maxFiles). */
  multi: boolean;
  maxFiles?: number;
}

// BUG-138 (2026-06-19, owner walk-through): trimmed to 3 slots.
// AUTHORISED_REPRESENTATIVE_ID + TAX_CERTIFICATE dropped per owner directive.
// Existing rows with those documentType values stay in the DB for audit
// (the column is just a VARCHAR — no enum constraint), they're just no
// longer presented as slots on the register form or admin view.
export const VENDOR_DOC_TYPES: VendorDocType[] = [
  { code: 'COMMERCIAL_LICENSE',   label: 'Commercial License',         required: true,  multi: false },
  { code: 'AUTHORISATION_LETTER', label: 'Authorisation Letter',       required: false, multi: false },
  { code: 'OTHER',                label: 'Other supporting documents', required: false, multi: true, maxFiles: 5 },
];

export const VENDOR_DOC_TYPE_CODES = VENDOR_DOC_TYPES.map(t => t.code);

export function vendorDocTypeByCode(code: string): VendorDocType | undefined {
  return VENDOR_DOC_TYPES.find(t => t.code === code);
}
