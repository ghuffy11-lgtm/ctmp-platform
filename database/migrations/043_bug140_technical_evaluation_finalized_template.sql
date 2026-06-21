-- =============================================================================
-- Migration 043 — BUG-140 (2026-06-19): TECHNICAL_EVALUATION_FINALIZED template
-- =============================================================================
-- Owner asked: when the technical evaluation phase is finalised on a tender,
-- send a confirmation email to the tender's owning user (typically the
-- procurement manager). Mirrors the dispatch shape used by BUG-127's
-- TENDER_NEGOTIATION_LAUNCHED template — token-based interpolation, EMAIL
-- channel, English locale (Arabic localisation deferred via BUG-136 plumbing).
-- =============================================================================

BEGIN;

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'TECHNICAL_EVALUATION_FINALIZED',
    'Technical evaluation phase completed — manager notification',
    '[{{systemName}}] Technical evaluation complete — {{tenderReference}}',
    E'Hello {{managerName}},\n\nThe technical evaluation phase for tender {{tenderReference}} — {{tenderTitle}} — has been completed and finalised.\n\nSummary:\n  Total bids        : {{totalBids}}\n  Technically PASS  : {{passCount}}\n  Technically FAIL  : {{failCount}}\n  Evaluators        : {{evaluatorList}}\n\nThe tender has moved to {{newStatus}}. Commercial envelopes for the PASS bids are now sealed pending the committee commercial opening session.\n\n  {{tenderUrl}}\n\nThis is an automated confirmation that the engineering / evaluator team have completed their technical evaluation work. No reply needed.\n\nKind regards,\n{{systemName}} procurement team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
