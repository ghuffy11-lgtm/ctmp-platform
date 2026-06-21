-- =============================================================================
-- Migration 037 — BUG-127 (2026-06-11): TENDER_NEGOTIATION_LAUNCHED template
-- =============================================================================
-- Owner asked for an optional "send email" checkbox when procurement
-- launches a negotiation round. Same BCC mechanism as the invitation
-- email (vendor users + ad-hoc extras), with a dedicated template so the
-- subject reads "Negotiation invitation" and the body explains the next
-- step (revise commercial via the vendor portal).
-- =============================================================================

BEGIN;

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'TENDER_NEGOTIATION_LAUNCHED',
    'Negotiation invitation — vendor invited to revise commercial',
    '[{{systemName}}] Negotiation invitation — {{tenderReference}} (round {{roundNumber}})',
    E'Dear {{vendorName}} team,\n\nThe procurement team has invited you to participate in a negotiation round for the following tender:\n\n  Reference : {{tenderReference}}\n  Title     : {{tenderTitle}}\n  Round     : {{roundNumber}}\n\nThe reason given for this negotiation round:\n\n  {{launchReason}}\n\nPlease log in to the vendor portal, open this bid, and submit a revised commercial proposal (per-line BoQ prices + supporting PDF). Your original submission remains on record — the negotiation submission is a new entry.\n\n  {{tenderUrl}}\n\nThere is no deadline for this negotiation round — please submit at your earliest convenience. For any questions please use the Clarifications feature on the tender page.\n\nKind regards,\n{{systemName}} procurement team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
