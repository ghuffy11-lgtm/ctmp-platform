-- BUG-087 (2026-06-02) — EXECUTIVE role + executive:dashboard permission.
--
-- Owner request: "Executive Menu is only for Executive user, create separate
-- role for this do not provide this option to any one other than executive."
-- They also want this role to: (a) view a cumulative cross-department
-- executive dashboard, and (b) Confirm Award once others have finished the
-- technical + commercial comparisons.
--
-- This migration:
--   1. Adds a new permission `executive:dashboard` that gates the new
--      /executive page (sidebar entry + backend /analytics/executive-summary).
--   2. Creates a new role EXECUTIVE (is_system=TRUE — baseline role).
--   3. Grants EXECUTIVE the minimum permissions to complete its workflow:
--        - executive:dashboard       (the new dashboard surface)
--        - system:view_all_departments (cumulative cross-dept view, owner's
--          phrase: "permission to all department to view cumulative dashboard")
--        - tender:view                  (navigate to the tender list / detail)
--        - comparison:commercial:view   (see the Commercial Comparison page)
--        - comparison:commercial:confirm (final Confirm award click — Phase D)
--   4. Also grants `executive:dashboard` to SYSTEM_ADMIN so they retain access
--      (separation-of-duties does not apply to the dashboard view itself).
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING) so the migration can
-- replay safely.

-- 1) New permission.
INSERT INTO permissions (code, name, category, description)
VALUES (
  'executive:dashboard',
  'executive:dashboard',
  'executive',
  'View the Executive Dashboard (KPIs, financial trends, vendor concentration).'
)
ON CONFLICT (code) DO NOTHING;

-- 2) New role.
INSERT INTO roles (code, name, description, is_system)
VALUES (
  'EXECUTIVE',
  'Executive',
  'Senior management — sees the cumulative cross-department dashboard and confirms award decisions after evaluations are complete.',
  TRUE
)
ON CONFLICT (code) DO NOTHING;

-- 3) Role-permission grants.
WITH grants(role_code, permission_code) AS (
  VALUES
    ('EXECUTIVE',    'executive:dashboard'),
    ('EXECUTIVE',    'system:view_all_departments'),
    ('EXECUTIVE',    'tender:view'),
    ('EXECUTIVE',    'comparison:commercial:view'),
    ('EXECUTIVE',    'comparison:commercial:confirm'),
    -- SYSTEM_ADMIN keeps access to the dashboard alongside its other perms.
    ('SYSTEM_ADMIN', 'executive:dashboard')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;
