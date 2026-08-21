-- 046 (2026-06-26): sync PROCUREMENT_ADMIN permissions to match the validated
-- dev set, and add the system:view_all_departments permission that was created
-- manually in dev (2026-05-29) and never captured in a migration — so prod's
-- catalog lacked it. Idempotent; safe to re-run.

INSERT INTO permissions (code, name, category, description)
VALUES ('system:view_all_departments', 'View All Departments', 'system',
        'Bypass department-scoped data filtering (see every department).')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('award:amend','awarded:view','award:minutes:generate','commercial:download','commercial:evaluate','commercial:view','committee:open_commercial','comparison:commercial:confirm','comparison:commercial:recommend','comparison:commercial:view','comparison:technical:view','criteria:library:manage','criteria:tender:edit','negotiation:launch','negotiation:view','notification:vendor:trigger','system:view_all_departments','technical:evaluate','technical:evaluate:procurement','technical:finalize','technical:open','technical:view','tender:approve','tender:audit:view','tender:close','tender:revert','tender:suspend','users:list','users:read','viewer:pdf:download','viewer:pdf:open')
WHERE r.code = 'PROCUREMENT_ADMIN'
ON CONFLICT DO NOTHING;
