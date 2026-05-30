-- =============================================================================
-- Migration 019 — WALK-040: Committee session invitation email template
-- =============================================================================
-- Owner directive 2026-05-29: when manager creates a committee session and
-- selects members, the system should automatically email each invited member
-- with the date/time/location of the session. createSession previously only
-- wrote DB rows + audit log; no mail dispatch existed.
--
-- Adds the COMMITTEE_SESSION_INVITATION template so CommitteeService can
-- fan out invitations using the existing NotificationsService.sendEmail().
--
-- Idempotent.
-- =============================================================================

BEGIN;

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
    'COMMITTEE_SESSION_INVITATION',
    'Committee session invitation',
    '[CTMP] Committee session for {{tenderReference}}',
    E'Dear {{recipientName}},\n\nYou have been invited to participate in the committee session for the following tender:\n\n  Tender:    {{tenderReference}} — {{tenderTitle}}\n  Scheduled: {{scheduledAt}}\n  Location:  {{location}}\n\nRequired quorum: {{requiredQuorumCount}} members present (with {{requiredRoleCode}} present)\n\nPlease confirm your availability via the CTMP admin portal.\n\nCTMP Procurement Team\n',
    'EMAIL',
    'en',
    TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
