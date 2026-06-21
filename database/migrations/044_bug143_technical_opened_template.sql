-- =============================================================================
-- Migration 044 — BUG-143 (2026-06-19): TECHNICAL_ENVELOPES_OPENED_EVALUATOR
-- =============================================================================
-- Owner walkthrough question: when technical envelopes open, do engineers
-- receive an email? Answer was no — partially closed by BUG-057 (per-evaluator
-- queue in the admin UI) but the actual push notification was deferred as
-- BUG-020. This migration seeds the template + back-end dispatch lands in the
-- same change. Mirrors BUG-140's TECHNICAL_EVALUATION_FINALIZED shape — token-
-- based interpolation, EMAIL channel, English locale (Arabic deferred).
-- Recipients are resolved at dispatch time as: ACTIVE users holding the
-- TECHNICAL_EVALUATOR role who are members of the tender's department.
-- =============================================================================

BEGIN;

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'TECHNICAL_ENVELOPES_OPENED_EVALUATOR',
    'Technical envelopes opened — evaluator notification',
    '[{{systemName}}] Technical envelopes opened — {{tenderReference}}',
    E'Hello {{evaluatorName}},\n\nThe technical envelopes for tender {{tenderReference}} — {{tenderTitle}} — have been opened. You can now view the submissions and begin your technical evaluation.\n\nSummary:\n  Submissions       : {{submissionCount}}\n  Tender status     : {{newStatus}}\n  Department        : {{departmentName}}\n\nStart your evaluation here:\n  {{tenderUrl}}\n\nThis is an automated notification — no reply needed.\n\nKind regards,\n{{systemName}} procurement team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
