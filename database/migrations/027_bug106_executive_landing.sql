-- BUG-106 (2026-06-05): hide /dashboard from the EXECUTIVE role so the
-- executive's landing experience is the Executive Dashboard (/executive).
--
-- Mechanism: reuses BUG-093's roles.hidden_sidebar_items array. The login
-- page's redirect logic (web-admin/src/app/login/page.tsx) inspects this
-- list from the JWT and sends executive users to /executive instead of
-- /dashboard. The /dashboard route itself remains accessible (no perm gate
-- added) for SYSTEM_ADMIN and as a safety net if any executive bookmarks it.

BEGIN;

-- 1. Add /dashboard to the EXECUTIVE role's hide list. Idempotent: only
--    append when not already present.
UPDATE roles
SET hidden_sidebar_items = array_append(hidden_sidebar_items, '/dashboard')
WHERE code = 'EXECUTIVE'
  AND NOT ('/dashboard' = ANY(hidden_sidebar_items));

-- 2. Bump token_version for every user holding the EXECUTIVE role so their
--    next request re-issues a JWT with the updated hiddenSidebarItems claim.
--    Sidebar updates and landing redirect take effect on next login (or
--    refresh that hits the auth flow).
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code = 'EXECUTIVE'
);

COMMIT;
