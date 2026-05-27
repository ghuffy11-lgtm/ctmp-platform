-- =============================================================================
-- Migration 014 — Phase F: Evaluation criteria library + permissions
-- =============================================================================
-- Per master plan §3.3 + §C1 (hybrid criteria source: admin maintains a master
-- library; per-tender override allows add/remove/rename with weights summing
-- to 100% and a mandatory-gate flag per criterion).
--
-- Note: tender_technical_criteria already has `weight` and `mandatory` columns
-- from migration 005, so we don't need to ALTER that table — only add the new
-- library table + permissions.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. evaluation_criteria_library — the master "starter pack" admin maintains
-- -----------------------------------------------------------------------------
CREATE TABLE evaluation_criteria_library (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    default_weight  DECIMAL(5, 2),
    default_max_score DECIMAL(8, 2) NOT NULL DEFAULT 100.00,
    default_is_gate BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluation_criteria_library_active ON evaluation_criteria_library(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_evaluation_criteria_library_name_active
    ON evaluation_criteria_library(lower(name))
    WHERE is_active = TRUE;

COMMENT ON TABLE evaluation_criteria_library IS
    'Admin-maintained master library of evaluation criteria. Per-tender editor copies entries into tender_technical_criteria; library edits do not retroactively change existing tenders.';

-- -----------------------------------------------------------------------------
-- 2. Permissions
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description) VALUES
    ('criteria:library:manage', 'criteria:library:manage', 'criteria', 'Create / edit / deactivate evaluation-criteria library entries.'),
    ('criteria:tender:edit',    'criteria:tender:edit',    'criteria', 'Add / remove / rename per-tender evaluation criteria before Publish.')
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
    VALUES
    ('SYSTEM_ADMIN',        'criteria:library:manage'),
    ('PROCUREMENT_ADMIN',   'criteria:library:manage'),
    ('PROCUREMENT_ADMIN',   'criteria:tender:edit'),
    ('PROCUREMENT_OFFICER', 'criteria:tender:edit')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Seed a useful starter library so first-run admins see something
-- -----------------------------------------------------------------------------
INSERT INTO evaluation_criteria_library (name, description, default_weight, default_max_score, default_is_gate, is_active)
VALUES
    ('Compliance with Technical Specifications', 'Full adherence to the tender''s technical specification document.', 30.0, 30.0, TRUE, TRUE),
    ('Team Experience & Qualifications', 'Years of relevant experience for the Project Manager and senior engineers.', 25.0, 25.0, FALSE, TRUE),
    ('Project Methodology & Timeline', 'Phase milestones, risk mitigation, dependency management.', 25.0, 25.0, FALSE, TRUE),
    ('Support & Maintenance SLA', 'Post-implementation support coverage and response times.', 20.0, 20.0, FALSE, TRUE),
    ('Past Performance', 'Documented past projects of similar scope and outcome.', 0.0, 100.0, FALSE, TRUE),
    ('Local Content / Vendor Localisation', 'Use of local workforce, local content commitment.', 0.0, 100.0, FALSE, TRUE)
ON CONFLICT DO NOTHING;

COMMIT;
