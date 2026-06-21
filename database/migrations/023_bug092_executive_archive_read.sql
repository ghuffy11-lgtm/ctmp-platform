-- BUG-092 (2026-06-02) — grant EXECUTIVE the read perms needed to fully
-- consume the Awarded Tenders archive.
--
-- Background: BUG-087 created EXECUTIVE with the minimum perms owner asked for
-- (executive:dashboard + comparison:commercial:view + comparison:commercial:confirm
-- + tender:view + system:view_all_departments). When BUG-090 shipped the new
-- archive, owner found that as EXECUTIVE the Technical tab and the Audit Trail
-- tab were empty because the underlying endpoints require:
--   * comparison:technical:view  — for /tenders/:id/comparison/technical
--   * tender:audit:view          — for /tenders/:id/audit-logs
-- These are pure read perms — they don't violate the existing separation of
-- duties (EXECUTIVE still doesn't evaluate, just reviews completed decisions).

WITH grants(role_code, permission_code) AS (
  VALUES
    ('EXECUTIVE', 'comparison:technical:view'),
    ('EXECUTIVE', 'tender:audit:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;
