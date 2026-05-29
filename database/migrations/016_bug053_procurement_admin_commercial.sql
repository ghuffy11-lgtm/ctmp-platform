-- =============================================================================
-- Migration 016 — BUG-053: PROCUREMENT_ADMIN gains commercial review perms
-- =============================================================================
-- Owner walkthrough revealed a workflow gap left by BUG-052: there is no admin
-- UI to enter commercial prices, and the manager (PROCUREMENT_ADMIN) — who in
-- the real-world procurement flow does the joint pre-comparison work with
-- finance — held zero commercial:* perms after BUG-052's separation-of-duties
-- pass. Owner's directive: "in real life chairman is not going to sit and
-- open the commercial, this is procurement manager and finance" who prepare
-- the comparison before the award meeting.
--
-- The CLAUDE.md separation-of-duties rule applies to SYSTEM_ADMIN ("System
-- Admin does NOT automatically receive commercial bid visibility"), NOT to
-- the procurement-team lead. PROCUREMENT_ADMIN already holds Confirm
-- authority — denying them visibility into the values they are confirming was
-- the wrong reading of the spec.
--
-- This migration grants the three operational commercial perms to
-- PROCUREMENT_ADMIN. The frontend half of BUG-053 ships the inline
-- price-entry control on the Commercial Comparison page.
--
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING.
-- =============================================================================

BEGIN;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'PROCUREMENT_ADMIN'
  AND p.code IN ('commercial:view', 'commercial:download', 'commercial:evaluate')
ON CONFLICT DO NOTHING;

UPDATE users
SET token_version = token_version + 1
WHERE id IN (
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code = 'PROCUREMENT_ADMIN'
);

COMMIT;
