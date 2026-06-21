-- =============================================================================
-- Migration 033 — BUG-120 (2026-06-10): Invitation email dispatch
-- =============================================================================
-- Procurement now sends email notifications to invited vendors when:
--   (a) a vendor is added to an INVITATION_ONLY tender that is already
--       Published or in Clarification Period (mid-flight invite); or
--   (b) the tender transitions to Published (one batch send to everyone
--       on the invitation list who hasn't been notified yet).
--
-- Vendors can have multiple registered users (vendor_users) — all of them
-- receive the message via BCC. Admins can also paste additional ad-hoc
-- emails per invitation; those go to BCC alongside the registered users.
-- Each vendor gets a separate email (one-to-many), so vendor A never sees
-- vendor B's contacts.
--
-- Closes the original BUG-016 deferred item ("publish-notification dispatch
-- — needs owner approval before broadcast").
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tender_vendors.extra_notification_emails TEXT[] — ad-hoc per-invitation
-- ---------------------------------------------------------------------------
ALTER TABLE tender_vendors
    ADD COLUMN IF NOT EXISTS extra_notification_emails TEXT[] NULL;

-- ---------------------------------------------------------------------------
-- 2. Track which invitations have been notified, so re-publish or repeated
--    invite-after-publish flows don't double-send. The actual content is
--    already in notification_logs; this is the dedupe flag.
-- ---------------------------------------------------------------------------
ALTER TABLE tender_vendors
    ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ NULL;

-- ---------------------------------------------------------------------------
-- 3. Notification template: TENDER_INVITATION_SENT
-- ---------------------------------------------------------------------------
-- Tokens supported by the dispatcher:
--   {{systemName}}        — branding.system_name setting
--   {{vendorName}}        — invited vendor's company name
--   {{tenderReference}}   — e.g. TDR-2026-0022
--   {{tenderTitle}}       — short title
--   {{tenderCategory}}    — category (may be empty)
--   {{submissionDeadline}}— ISO timestamp; renderer formats for display
--   {{vendorPortalUrl}}   — branding.vendor_portal_url (set via Settings)
--   {{tenderUrl}}         — full deep link to the tender on the vendor portal
INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'TENDER_INVITATION_SENT',
    'Tender invitation — vendor invited to bid',
    '[{{systemName}}] Invitation to bid — {{tenderReference}}: {{tenderTitle}}',
    E'Dear {{vendorName}} team,\n\nYou have been invited to submit a bid for the following tender:\n\n  Reference : {{tenderReference}}\n  Title     : {{tenderTitle}}\n  Category  : {{tenderCategory}}\n  Deadline  : {{submissionDeadline}}\n\nReview the tender documents and submit your bid through the vendor portal:\n\n  {{tenderUrl}}\n\nIf you have any questions, please use the Clarifications feature on the tender page.\n\nKind regards,\n{{systemName}} procurement team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Optional: branding.vendor_portal_url setting (used by template) — only
--    insert if missing. The dispatcher falls back to the API base + the
--    vendor app's well-known path if the setting is empty.
-- ---------------------------------------------------------------------------
INSERT INTO system_settings (key, value, description, category, value_type, read_only)
VALUES (
    'branding.vendor_portal_url',
    '',
    'Public URL prefix for the vendor portal (e.g. https://vn.example.com). Used in tender invitation emails. Leave empty to fall back to the API origin.',
    'branding',
    'string',
    FALSE
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
