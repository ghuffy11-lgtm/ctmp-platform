-- ============================================================================
-- Migration 007: Revert testing-only commercial grants on SYSTEM_ADMIN
--
-- During Phase 9 manual testing, SYSTEM_ADMIN was temporarily granted
--   commercial:view
--   commercial:evaluate
--   commercial:export
-- so a single test user could walk the full lifecycle without setting up a
-- dedicated COMMERCIAL_EVALUATOR. Spec §3.4 / seed comment is explicit:
-- "System Admin MUST NOT receive any commercial:* permissions other than
--  commercial:view_status." Separation of duties is non-negotiable.
--
-- This migration removes those grants. SYSTEM_ADMIN retains
-- commercial:view_status (envelope state visibility) which is spec-compliant.
--
-- For ongoing commercial evaluation, assign the COMMERCIAL_EVALUATOR role
-- (already seeded by 001_baseline_roles_permissions.sql) to the appropriate
-- internal user(s). The new admin Settings → Users tab supports this.
--
-- Idempotent: re-running deletes nothing extra.
-- ============================================================================

-- Per spec / seed comment, the ONLY commercial:* permission SYSTEM_ADMIN may
-- hold is commercial:view_status. Anything else is a separation-of-duties
-- violation regardless of how it got there.
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN')
  AND permission_id IN (
    SELECT id FROM permissions
    WHERE code LIKE 'commercial:%'
      AND code <> 'commercial:view_status'
  );
