-- BUG-090 (2026-06-02) — awarded:view permission + role grants.
--
-- Owner asked for a dedicated read-only Awarded Tenders archive
-- (/awarded-tenders) with all tender artefacts (technical, commercial,
-- BoQ, documents, audit). This permission gates both the sidebar entry
-- and the page itself.
--
-- Granted to:
--   EXECUTIVE          — senior management archive review (owner directive)
--   AUDITOR            — audit role's natural use case (locked rule)
--   PROCUREMENT_ADMIN  — org-wide procurement oversight
--   SYSTEM_ADMIN       — keeps full visibility (separation of duties does
--                        not apply to a read-only archive surface)
--
-- Permission code namespaced under `tender:` so it groups with related
-- existing perms (tender:view, tender:audit:view).

INSERT INTO permissions (code, name, category, description)
VALUES (
  'awarded:view',
  'awarded:view',
  'tender',
  'View the Awarded Tenders archive — read-only details of past procurement decisions (technical, commercial, BoQ, documents, audit).'
)
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
  VALUES
    ('EXECUTIVE',         'awarded:view'),
    ('AUDITOR',           'awarded:view'),
    ('PROCUREMENT_ADMIN', 'awarded:view'),
    ('SYSTEM_ADMIN',      'awarded:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;
