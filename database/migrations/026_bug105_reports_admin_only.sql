-- BUG-105 (2026-06-05): restrict Reports module to SYSTEM_ADMIN only.
--
-- Background: owner reports the Reports section is broken (PDF + XLSX issues
-- on multiple report codes — see BUG-105 in tracker). Pending a proper fix,
-- access is narrowed to SYSTEM_ADMIN only so it disappears from the sidebar
-- of every other role and the API guards 403 on direct calls.
--
-- This migration only touches grants. Permission rows for `reports:view` and
-- `reports:export` remain in `permissions` (they're still referenced by
-- @RequirePermissions decorators and granted to SYSTEM_ADMIN by the original
-- seed) — we just revoke them from all non-admin roles.

BEGIN;

-- 1. Snapshot which users will need a token-version bump BEFORE we revoke
--    (we read user_roles before role_permissions is mutated).
CREATE TEMP TABLE bug105_affected_users AS
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code IN (
    'PROCUREMENT_ADMIN',
    'AUDITOR',
    'EXECUTIVE_VIEWER',
    'FINANCE_REVIEWER',
    'LEGAL_REVIEWER',
    'PROCUREMENT_OFFICER'
  );

-- 2. Revoke reports:view + reports:export from every role except SYSTEM_ADMIN.
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE code IN ('reports:view', 'reports:export')
  )
  AND role_id IN (
    SELECT id FROM roles WHERE code <> 'SYSTEM_ADMIN'
  );

-- 3. Bump token_version on affected users so their next request re-issues a
--    JWT without the revoked perms in the claims (sidebar updates immediately).
UPDATE users
SET token_version = token_version + 1
WHERE id IN (SELECT user_id FROM bug105_affected_users);

DROP TABLE bug105_affected_users;

COMMIT;

-- Re-running this migration is safe: the DELETE is a no-op once the rows are
-- gone, and the token-version bump only fires for users still holding the
-- six target roles (most of whom will have already refreshed by then).
