-- BUG-112 (2026-06-07) Piece 1: tender:revert permission.
--
-- New permission lets SYSTEM_ADMIN + PROCUREMENT_ADMIN roll a Published
-- tender back to an earlier editable state (Approved / Internal Review /
-- Draft). Blocked at the service layer if any bid is in a binding submitted
-- status — admin must Cancel + create a new tender in that case.

BEGIN;

INSERT INTO permissions (code, name, category, description)
VALUES (
  'tender:revert',
  'tender:revert',
  'tender',
  'Revert a Published tender back to an earlier editable state. Blocked when any vendor has already submitted a bid (use Cancel instead).'
)
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('SYSTEM_ADMIN',       'tender:revert'),
    ('PROCUREMENT_ADMIN',  'tender:revert')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- Token-version bump on holders so their JWT picks up the new perm.
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code IN ('SYSTEM_ADMIN', 'PROCUREMENT_ADMIN')
);

COMMIT;
