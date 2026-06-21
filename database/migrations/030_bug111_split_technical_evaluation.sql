-- BUG-111 (2026-06-06): split technical evaluation between two evaluator
-- roles. Each criterion declares which role scores it; the scorecard UI
-- and the submission API gate per-criterion on the caller's role.
--
-- - TECHNICAL    → scored only by users with `technical:evaluate`
-- - PROCUREMENT  → scored only by users with `technical:evaluate:procurement`
-- - EITHER       → either role may score (default for back-compat with
--                  every pre-BUG-111 criterion row)

BEGIN;

-- 1. Schema: per-criterion role tag (default EITHER preserves existing behaviour).
ALTER TABLE tender_technical_criteria
  ADD COLUMN IF NOT EXISTS evaluator_role VARCHAR(32) NOT NULL DEFAULT 'EITHER';

-- 2. New permission for procurement-side technical evaluation.
INSERT INTO permissions (code, name, category, description)
VALUES (
  'technical:evaluate:procurement',
  'technical:evaluate:procurement',
  'technical',
  'Submit technical evaluation scores for criteria assigned to the Procurement role (BUG-111).'
)
ON CONFLICT (code) DO NOTHING;

-- 3. Grant the new permission to procurement-side roles. Both PROCUREMENT_ADMIN
--    and PROCUREMENT_OFFICER are eligible — admin's choice which users actually
--    participate in evaluation. SYSTEM_ADMIN gets it for completeness.
WITH grants(role_code, permission_code) AS (
  VALUES
    ('PROCUREMENT_ADMIN',   'technical:evaluate:procurement'),
    ('PROCUREMENT_OFFICER', 'technical:evaluate:procurement'),
    ('SYSTEM_ADMIN',        'technical:evaluate:procurement')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- 4. Bump token_version for users holding any role that just gained perms so
--    their next request reissues a JWT with the new permission claim.
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code IN ('PROCUREMENT_ADMIN', 'PROCUREMENT_OFFICER', 'SYSTEM_ADMIN')
);

COMMIT;
