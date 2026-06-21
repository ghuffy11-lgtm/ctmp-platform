-- =============================================================================
-- Migration 036 — BUG-126 (2026-06-11): COMMITTEE_SESSION_INVITATION fix
-- =============================================================================
-- Owner reported the committee-session invitation email asked recipients to
-- "Please confirm your availability via the CTMP admin portal." — but no such
-- portal feature exists. CommitteeAttendance is set by the chair during the
-- session, not pre-confirmed by the member.
--
-- Updated body removes the misleading line. If we ever ship pre-session RSVP
-- as a real feature, we'll switch the template back via a follow-up migration.
-- =============================================================================

BEGIN;

UPDATE notification_templates
SET body_template = E'Dear {{recipientName}},\n\nYou have been invited to participate in the committee session for the following tender:\n\n  Tender:    {{tenderReference}} — {{tenderTitle}}\n  Scheduled: {{scheduledAt}}\n  Location:  {{location}}\n\nRequired quorum: {{requiredQuorumCount}} members present (with {{requiredRoleCode}} present)\n\nYour attendance will be recorded by the committee chair during the session. If you need to reschedule or cannot attend, please contact the procurement team directly so they can adjust the session.\n\nCTMP Procurement Team\n'
WHERE code = 'COMMITTEE_SESSION_INVITATION';

COMMIT;
