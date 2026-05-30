-- =============================================================================
-- Migration 018 — BUG-056: tender:audit:view permission for per-tender audit
-- =============================================================================
-- The /tenders/:id/audit-logs endpoint was gated on the broad `audit:view`
-- permission, which is held only by SYSTEM_ADMIN + AUDITOR — meaning
-- procurement / technical / committee staff could not see the audit history
-- of the tender they were working on. New tender-scoped permission lets the
-- per-tender endpoint open to all internal participants while the system-wide
-- search stays restricted.
--
-- Idempotent.
-- =============================================================================

BEGIN;

INSERT INTO permissions (code, name, category, description)
VALUES (
    'tender:audit:view',
    'tender:audit:view',
    'tender',
    'View the audit-log trail of a single tender from the tender detail page. Narrower than audit:view.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code IN (
    'SYSTEM_ADMIN',
    'AUDITOR',
    'PROCUREMENT_ADMIN',
    'PROCUREMENT_OFFICER',
    'TECHNICAL_EVALUATOR',
    'APPROVER',
    'COMMERCIAL_EVALUATOR',
    'COMMERCIAL_COMMITTEE_MEMBER'
)
  AND p.code = 'tender:audit:view'
ON CONFLICT DO NOTHING;

UPDATE users
SET token_version = token_version + 1
WHERE id IN (
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code IN (
        'SYSTEM_ADMIN','AUDITOR','PROCUREMENT_ADMIN','PROCUREMENT_OFFICER',
        'TECHNICAL_EVALUATOR','APPROVER','COMMERCIAL_EVALUATOR','COMMERCIAL_COMMITTEE_MEMBER'
    )
);

COMMIT;
