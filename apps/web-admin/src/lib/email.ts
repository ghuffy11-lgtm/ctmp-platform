// 2026-08-24: one email rule for the admin app.
//
// Extracted from ManageInvitedVendors.tsx's parseEmails() so the invitation
// panel and the tender extra-recipients box agree on what counts as valid —
// two different regexes drifting apart is how "it worked in the other screen"
// bugs start.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Split a free-text blob on whitespace/comma/semicolon into valid, lowercased addresses. */
export function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 0 && EMAIL_RE.test(s)),
    ),
  );
}
