-- =============================================================================
-- Migration 015 — BUG-052: Commercial-flow permission matrix lockdown
-- =============================================================================
-- Locks the role-permission grants for the commercial-evaluation +
-- commercial-comparison flow per master plan §I and the CLAUDE.md locked rule
-- "System Admin does NOT automatically receive commercial bid visibility."
--
-- Triggered by owner walkthrough WALK-044..049: finance@ (COMMERCIAL_COMMITTEE_MEMBER)
-- could land on /commercial-comparison but every action failed with perm errors,
-- no user held COMMERCIAL_EVALUATOR (so no prices were enterable), and
-- SYSTEM_ADMIN still carried commercial perms despite migration 007.
--
-- Outcome:
--   - SYSTEM_ADMIN: REVOKE commercial:view, commercial:download,
--     commercial:evaluate, award:minutes:generate (re-applies + extends 007)
--   - COMMERCIAL_EVALUATOR: ADD commercial:download,
--     comparison:commercial:recommend, award:minutes:generate
--   - COMMERCIAL_COMMITTEE_MEMBER: ADD commercial:view, commercial:download,
--     commercial:evaluate, comparison:commercial:recommend
--   - token_version bumped on every user carrying an affected role so stale
--     JWTs cannot bypass the new gates
--
-- PROCUREMENT_ADMIN is unchanged: it remains the sole Confirm authority per
-- the locked rule "Confirm is final. No higher-authority approval layer."
-- PROCUREMENT_OFFICER is unchanged: officers have no commercial perms
-- (separation of duties).
--
-- Idempotent: re-running yields the same end state (DELETEs are no-ops the
-- second time; INSERTs use ON CONFLICT DO NOTHING; the token_version bump is
-- additive but harmless on a second pass).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SYSTEM_ADMIN REVOKEs
--    Extends migration 007 to also cover award:minutes:generate, which the
--    Phase E grants pulled in but is procurement-team scope, not admin.
-- ---------------------------------------------------------------------------
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN')
  AND permission_id IN (
    SELECT id FROM permissions
    WHERE code IN (
      'commercial:view',
      'commercial:download',
      'commercial:evaluate',
      'award:minutes:generate'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. COMMERCIAL_EVALUATOR GRANTs
--    Already holds commercial:view, commercial:evaluate, comparison:commercial:view,
--    comparison:technical:view from baseline + migration 011. We add the
--    download capability and the ability to recommend a winner. Minutes
--    generation lets a specialist evaluator regenerate the audit PDF.
-- ---------------------------------------------------------------------------
WITH ev_grants(role_code, permission_code) AS (
    VALUES
    ('COMMERCIAL_EVALUATOR', 'commercial:download'),
    ('COMMERCIAL_EVALUATOR', 'comparison:commercial:recommend'),
    ('COMMERCIAL_EVALUATOR', 'award:minutes:generate')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM ev_grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. COMMERCIAL_COMMITTEE_MEMBER GRANTs
--    Already holds comparison:commercial:view, comparison:technical:view,
--    commercial:open_committee, commercial:view_status, committee:record_attendance,
--    committee:view_minutes, award:minutes:generate. Master plan §I + WALK-048
--    direct that committee members are full participants in commercial review;
--    we add the four perms that turn the page from spectator-mode into a
--    working surface (view docs, download, enter prices, recommend a winner).
-- ---------------------------------------------------------------------------
WITH cm_grants(role_code, permission_code) AS (
    VALUES
    ('COMMERCIAL_COMMITTEE_MEMBER', 'commercial:view'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'commercial:download'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'commercial:evaluate'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'comparison:commercial:recommend')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM cm_grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Bump token_version on every user carrying an affected role so cached
--    JWTs reflect the new grants/revocations on the next request.
-- ---------------------------------------------------------------------------
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code IN ('SYSTEM_ADMIN', 'COMMERCIAL_EVALUATOR', 'COMMERCIAL_COMMITTEE_MEMBER')
);

COMMIT;
