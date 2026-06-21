-- =============================================================================
-- Migration 035 — BUG-123 (2026-06-11): TENDER_INVITATION_REMINDER template
-- =============================================================================
-- Owner needs a manual "send reminder" action per invited vendor. Uses a
-- dedicated template so the subject reads as a reminder ("[Reminder]
-- closes …") instead of a duplicate of the initial invitation.
--
-- Same token set as TENDER_INVITATION_SENT: {{systemName}}, {{vendorName}},
-- {{tenderReference}}, {{tenderTitle}}, {{tenderCategory}},
-- {{submissionDeadline}}, {{vendorPortalUrl}}, {{tenderUrl}}.
-- =============================================================================

BEGIN;

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'TENDER_INVITATION_REMINDER',
    'Tender invitation reminder',
    '[{{systemName}}] Reminder — bid invitation for {{tenderReference}} (deadline {{submissionDeadline}})',
    E'Dear {{vendorName}} team,\n\nThis is a reminder that you have been invited to submit a bid for the following tender. The bid window is still open — please submit before the deadline if you intend to participate.\n\n  Reference : {{tenderReference}}\n  Title     : {{tenderTitle}}\n  Category  : {{tenderCategory}}\n  Deadline  : {{submissionDeadline}}\n\nReview the tender documents and submit your bid through the vendor portal:\n\n  {{tenderUrl}}\n\nIf you have already submitted, please disregard this reminder. For any questions please use the Clarifications feature on the tender page.\n\nKind regards,\n{{systemName}} procurement team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
