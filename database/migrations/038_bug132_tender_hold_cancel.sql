-- BUG-132 (2026-06-14): Hold (Suspend) + Cancel from any tender lifecycle state.
--
-- 1. Adds tenders.previous_status (tender_status NULL) so Resume can return
--    a held tender to the exact state it was paused in.
-- 2. Adds permission tender:suspend (grants Hold AND Resume — same authority).
--    Granted to SYSTEM_ADMIN + PROCUREMENT_ADMIN by default.
-- 3. Bumps token_version on holders so their JWT picks up the new perm
--    without an explicit logout.
--
-- This migration is idempotent: every step is guarded.

BEGIN;

-- --------------------------------------------------------------------------
-- 1. tenders.previous_status — snapshot for Resume
-- --------------------------------------------------------------------------
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS previous_status tender_status NULL;

COMMENT ON COLUMN tenders.previous_status IS
  'Set when status = SUSPENDED so Resume returns the tender to this state. Cleared on resume + on cancel.';

-- --------------------------------------------------------------------------
-- 2. tender:suspend permission
-- --------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description)
VALUES (
  'tender:suspend',
  'tender:suspend',
  'tender',
  'Put a tender on Hold (Suspended) and Resume it back to its prior state. Same authority covers both actions; reason is mandatory and audit-logged at HIGH severity.'
)
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('SYSTEM_ADMIN',       'tender:suspend'),
    ('PROCUREMENT_ADMIN',  'tender:suspend')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 3. Token-version bump on holders so their JWT picks up the new perm
-- --------------------------------------------------------------------------
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code IN ('SYSTEM_ADMIN', 'PROCUREMENT_ADMIN')
);

COMMIT;
