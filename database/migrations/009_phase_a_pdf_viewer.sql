-- =============================================================================
-- Migration 009 — Phase A: In-app PDF viewer audit + permissions
-- =============================================================================
-- Supports BUG-037 (shared full-screen modal PDF viewer):
--   1. document_view_log — queryable view-history table (the cryptographic
--      hash chain still lives in audit_logs; this table is the index used
--      by the "12 views logged" badge planned for Phases B and C)
--   2. viewer:pdf:open / viewer:pdf:download permissions per master-plan §I
--      default RBAC matrix (System Admin deliberately NOT granted — separation
--      of duties on commercial-side viewing)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. document_view_log
-- -----------------------------------------------------------------------------
-- v1 viewer is only used to render bid documents (technical proposal "View
-- Full Proposal", commercial documents on Phase C). FK to bid_documents
-- specifically; if a future phase opens tender documents through the same
-- viewer we will add a nullable tender_document_id sibling column.

CREATE TABLE document_view_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    bid_document_id UUID NOT NULL REFERENCES bid_documents(id) ON DELETE CASCADE,
    tender_id       UUID REFERENCES tenders(id) ON DELETE SET NULL,
    bid_id          UUID REFERENCES bids(id) ON DELETE SET NULL,
    view_context    VARCHAR(64) NOT NULL,
    viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),
    user_agent      TEXT
);

CREATE INDEX idx_document_view_log_bid_document ON document_view_log(bid_document_id);
CREATE INDEX idx_document_view_log_tender ON document_view_log(tender_id);
CREATE INDEX idx_document_view_log_viewed_at ON document_view_log(viewed_at DESC);

COMMENT ON TABLE document_view_log IS
    'Queryable per-document view history. Cryptographic chain still in audit_logs.';
COMMENT ON COLUMN document_view_log.view_context IS
    'Surface that opened the viewer: technical-evaluation | technical-comparison | commercial-comparison';

-- -----------------------------------------------------------------------------
-- 2. New permissions for the in-app viewer (master plan §I)
-- -----------------------------------------------------------------------------

INSERT INTO permissions (code, name, category, description) VALUES
    ('viewer:pdf:open',     'viewer:pdf:open',     'viewer', 'Open a bid PDF in the in-app modal viewer (audit-logged).'),
    ('viewer:pdf:download', 'viewer:pdf:download', 'viewer', 'Download a viewed PDF (audit-logged).')
ON CONFLICT (code) DO NOTHING;

-- Default grants per master plan §I matrix. SYSTEM_ADMIN deliberately omitted
-- to preserve the separation-of-duties rule from migration 007.
WITH grants(role_code, permission_code) AS (
    VALUES
    ('PROCUREMENT_ADMIN',           'viewer:pdf:open'),
    ('PROCUREMENT_ADMIN',           'viewer:pdf:download'),
    ('PROCUREMENT_OFFICER',         'viewer:pdf:open'),
    ('TECHNICAL_EVALUATOR',         'viewer:pdf:open'),
    ('TECHNICAL_EVALUATOR',         'viewer:pdf:download'),
    ('COMMERCIAL_EVALUATOR',        'viewer:pdf:open'),
    ('COMMERCIAL_EVALUATOR',        'viewer:pdf:download'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'viewer:pdf:open'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'viewer:pdf:download'),
    ('AUDITOR',                     'viewer:pdf:open')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

COMMIT;
