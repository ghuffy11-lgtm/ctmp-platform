-- =============================================================================
-- Migration 012 — Phase D: Award workflow (Recommend → Confirm → Amend)
-- =============================================================================
-- Implements BUG-039 (Award flow), BUG-040 (Quorum + Chair check), BUG-041
-- (Amendment workflow) per master plan §3.3 + §F + §G.
--
-- Single-winner only (master plan F4). Awards are never deleted — amendments
-- create a new row that supersedes via superseded_by_award_id (master plan F7).
-- The CHECK constraint enforces the lowest-PASS-vs-override rule (master plan
-- F1/F2/F3): if is_lowest=FALSE, both justification_text AND
-- justification_pdf_storage_key must be set.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. awards table — recommend + confirm history (immutable; amendments add rows)
-- -----------------------------------------------------------------------------
CREATE TABLE awards (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id                       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    recommended_vendor_id           UUID NOT NULL REFERENCES vendors(id),
    recommended_bid_id              UUID NOT NULL REFERENCES bids(id),
    is_lowest                       BOOLEAN NOT NULL,
    justification_text              TEXT,
    justification_pdf_storage_key   TEXT,
    justification_pdf_sha256        CHAR(64),
    justification_pdf_filename      VARCHAR(255),
    notify_winner                   BOOLEAN NOT NULL DEFAULT FALSE,
    notify_losers                   BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by                    UUID NOT NULL REFERENCES users(id),
    confirmed_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_by_award_id          UUID REFERENCES awards(id),
    superseded_at                   TIMESTAMPTZ,

    -- Master plan F1/F2/F3: lowest-PASS picks are zero-friction (no text, no PDF
    -- required). Non-lowest (override) requires written justification AND an
    -- attached PDF. Enforce at the schema layer so the application can't drift.
    CONSTRAINT awards_override_requires_justification CHECK (
        (is_lowest = TRUE) OR
        (justification_text IS NOT NULL AND justification_pdf_storage_key IS NOT NULL)
    )
);

CREATE INDEX idx_awards_tender ON awards(tender_id);
CREATE INDEX idx_awards_superseded
    ON awards(superseded_by_award_id)
    WHERE superseded_by_award_id IS NOT NULL;

COMMENT ON TABLE awards IS 'Immutable award history. Confirm creates a row; Amend creates a new row referencing this one via superseded_by_award_id (master plan F7).';

-- -----------------------------------------------------------------------------
-- 2. award_minutes table — Phase E uses (on-demand PDF generation), defined
--    here for forward-compatibility per master plan §3.3
-- -----------------------------------------------------------------------------
CREATE TABLE award_minutes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    award_id        UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
    pdf_storage_key TEXT NOT NULL,
    sha256          CHAR(64) NOT NULL,
    generated_by    UUID NOT NULL REFERENCES users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_award_minutes_award ON award_minutes(award_id);

-- -----------------------------------------------------------------------------
-- 3. committee_sessions: quorum config columns (master plan G4)
-- -----------------------------------------------------------------------------
ALTER TABLE committee_sessions
    ADD COLUMN required_quorum_count INT,
    ADD COLUMN required_role_code    VARCHAR(50) DEFAULT 'CHAIR';

COMMENT ON COLUMN committee_sessions.required_quorum_count IS
    'Minimum number of members who must be PRESENT before Confirm enables. NULL = no quorum check.';
COMMENT ON COLUMN committee_sessions.required_role_code IS
    'Role that MUST be marked PRESENT before Confirm enables. Default CHAIR.';

-- -----------------------------------------------------------------------------
-- 4. Permission: award:amend (recommend + confirm were seeded in migration 011)
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description) VALUES
    ('award:amend', 'award:amend', 'award', 'Amend a confirmed award; creates a superseding record.')
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
    VALUES
    -- Master plan §I lists this as Procurement Manager + System Admin (two-person
    -- rule). For v1 we grant to PROCUREMENT_ADMIN only; the two-person enforcement
    -- can be layered as a runtime check in a later iteration.
    ('PROCUREMENT_ADMIN', 'award:amend')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

COMMIT;
