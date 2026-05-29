-- =============================================================================
-- Migration 017 — WALK-052: tender:close permission for Awarded → Tender Closed
-- =============================================================================
-- Owner walkthrough surfaced: the Workflow Progress widget shows Tender Closed
-- as the next stage after Awarded, but there is no transition that drives it.
-- The existing `tender:close_submission` perm closes the bid-submission window
-- (PUBLISHED → SUBMISSION_CLOSED), not the final tender closure.
--
-- Owner directive 2026-05-29: manual button on tender detail, PROCUREMENT_ADMIN.
-- "Confirm is final. No higher-authority approval layer" rule preserved —
-- closing is a downstream record-keeping step, not a second-stage approval.
--
-- Idempotent.
-- =============================================================================

BEGIN;

INSERT INTO permissions (code, name, category, description)
VALUES (
    'tender:close',
    'tender:close',
    'tender',
    'Close an awarded tender (transitions AWARDED → TENDER_CLOSED). PROCUREMENT_ADMIN only.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'PROCUREMENT_ADMIN'
  AND p.code = 'tender:close'
ON CONFLICT DO NOTHING;

UPDATE users
SET token_version = token_version + 1
WHERE id IN (
    SELECT DISTINCT ur.user_id
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code = 'PROCUREMENT_ADMIN'
);

COMMIT;
