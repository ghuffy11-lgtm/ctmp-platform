-- =============================================================================
-- Migration 011 — Phase B/C/D: comparison module RBAC permissions
-- =============================================================================
-- Per master plan §I default RBAC matrix. SYSTEM_ADMIN deliberately omitted
-- from commercial permissions to preserve separation-of-duties (migration
-- 007 set the precedent — Admin gets configuration access, not commercial
-- visibility).
--
-- Permissions seeded here:
--   comparison:technical:view     — Phase B (Technical Comparison page)
--   comparison:commercial:view    — Phase C (Commercial Comparison page)
--   comparison:commercial:recommend — Phase D (Recommend action)
--   comparison:commercial:confirm — Phase D (final Confirm action)
-- =============================================================================

BEGIN;

INSERT INTO permissions (code, name, category, description) VALUES
    ('comparison:technical:view',     'comparison:technical:view',     'comparison', 'View the read-only Technical Comparison page.'),
    ('comparison:commercial:view',    'comparison:commercial:view',    'comparison', 'View the Commercial Comparison page (after committee opening).'),
    ('comparison:commercial:recommend', 'comparison:commercial:recommend', 'comparison', 'Recommend a vendor for award on the Commercial Comparison page.'),
    ('comparison:commercial:confirm', 'comparison:commercial:confirm', 'comparison', 'Final Confirm action that moves tender → Awarded.')
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
    VALUES
    -- comparison:technical:view — anyone who can read tenders + bids meta
    ('PROCUREMENT_ADMIN',           'comparison:technical:view'),
    ('PROCUREMENT_OFFICER',         'comparison:technical:view'),
    ('TECHNICAL_EVALUATOR',         'comparison:technical:view'),
    ('COMMERCIAL_EVALUATOR',        'comparison:technical:view'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'comparison:technical:view'),
    ('AUDITOR',                     'comparison:technical:view'),

    -- comparison:commercial:view — only after committee opening; commercial-side roles
    ('PROCUREMENT_ADMIN',           'comparison:commercial:view'),
    ('COMMERCIAL_EVALUATOR',        'comparison:commercial:view'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'comparison:commercial:view'),

    -- comparison:commercial:recommend — Procurement Manager / Admin
    ('PROCUREMENT_ADMIN',           'comparison:commercial:recommend'),

    -- comparison:commercial:confirm — Procurement Manager / Admin only
    ('PROCUREMENT_ADMIN',           'comparison:commercial:confirm')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

COMMIT;
