-- =============================================================================
-- Migration 034 — BUG-121 (2026-06-11): notifications.email_override
-- =============================================================================
-- During staging / end-to-end testing the owner often needs every outbound
-- email to land in a single inbox so they can verify content + delivery
-- without spamming real vendors or polluting the production SMTP queue.
--
-- When notifications.email_override is set to a non-empty address, the
-- NotificationsService swaps the TO + BCC fields to that single address
-- before handing off to SMTP. The original recipients are preserved in
-- the body header + the notification_logs rows so the audit trail keeps
-- working.
--
-- Default value is empty — the override is OFF unless explicitly set.
-- Disable later: UPDATE system_settings SET value='' WHERE key='notifications.email_override';
-- =============================================================================

BEGIN;

INSERT INTO system_settings (key, value, description, category, value_type, read_only)
VALUES (
    'notifications.email_override',
    '',
    'TEST MODE: when set to a non-empty email address, every outgoing email is redirected to this single address. Original recipients are preserved in the body header + notification_logs. Set to empty to disable.',
    'notifications',
    'string',
    FALSE
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
