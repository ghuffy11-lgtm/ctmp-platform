-- BUG-115 (2026-06-09): Negotiation workflow.
--
-- After the initial Commercial Comparison, procurement can launch a
-- multi-round negotiation phase with selected PASS vendors. Original bids
-- and all prior negotiation submissions are preserved forever; comparison
-- + analytics surfaces resolve "current price" to the latest non-superseded
-- submission. No deadline — the phase ends when procurement awards or
-- explicitly closes the round.
--
-- This migration is idempotent: enum value uses IF NOT EXISTS, every CREATE
-- TABLE / INSERT uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
-- See plan: C:\Users\Administrator\.claude\plans\i-want-to-enhance-rustling-cerf.md
-- See locked-rule amendment: docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md §10.

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tender lifecycle: new state NEGOTIATION
-- --------------------------------------------------------------------------
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- some Postgres builds. We use IF NOT EXISTS so the migration is re-runnable.
-- If a deployment fails this step, the rest of the migration is no-op-safe.

ALTER TYPE tender_status ADD VALUE IF NOT EXISTS 'NEGOTIATION' AFTER 'COMMERCIAL_EVALUATION';

-- --------------------------------------------------------------------------
-- 2. New enum: negotiation_invitation_status
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'negotiation_invitation_status') THEN
    CREATE TYPE negotiation_invitation_status AS ENUM ('INVITED', 'SUBMITTED');
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3. negotiation_rounds — one row per round per tender
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negotiation_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  round_number    INTEGER NOT NULL,
  launched_by     UUID NOT NULL REFERENCES users(id),
  launched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  launch_reason   TEXT NOT NULL,
  closed_at       TIMESTAMPTZ NULL,
  closed_by       UUID NULL REFERENCES users(id),
  close_reason    TEXT NULL,
  CONSTRAINT negotiation_rounds_unique_round UNIQUE (tender_id, round_number),
  CONSTRAINT negotiation_rounds_reason_min_length CHECK (length(launch_reason) >= 20)
);

CREATE INDEX IF NOT EXISTS idx_negotiation_rounds_tender
  ON negotiation_rounds (tender_id, round_number);

CREATE INDEX IF NOT EXISTS idx_negotiation_rounds_open
  ON negotiation_rounds (tender_id) WHERE closed_at IS NULL;

-- --------------------------------------------------------------------------
-- 4. negotiation_invitations — which bids are invited in each round
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negotiation_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID NOT NULL REFERENCES negotiation_rounds(id) ON DELETE CASCADE,
  bid_id      UUID NOT NULL REFERENCES bids(id) ON DELETE RESTRICT,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      negotiation_invitation_status NOT NULL DEFAULT 'INVITED',
  CONSTRAINT negotiation_invitations_unique_per_round UNIQUE (round_id, bid_id)
);

CREATE INDEX IF NOT EXISTS idx_negotiation_invitations_bid
  ON negotiation_invitations (bid_id);

CREATE INDEX IF NOT EXISTS idx_negotiation_invitations_round
  ON negotiation_invitations (round_id);

-- --------------------------------------------------------------------------
-- 5. bid_negotiation_submissions — the vendor's revised commercial
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bid_negotiation_submissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id               UUID NOT NULL UNIQUE REFERENCES negotiation_invitations(id) ON DELETE CASCADE,
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by_vendor_user_id UUID NULL REFERENCES vendor_users(id),
  total_price                 NUMERIC(15,3) NULL,
  currency                    CHAR(3) NOT NULL DEFAULT 'KWD',
  commercial_pdf_storage_key  TEXT NOT NULL,
  commercial_pdf_sha256       CHAR(64) NOT NULL,
  commercial_pdf_filename     VARCHAR(255) NOT NULL,
  remarks                     TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_bid_negotiation_submissions_invitation
  ON bid_negotiation_submissions (invitation_id);

-- --------------------------------------------------------------------------
-- 6. bid_negotiation_boq_items — per-line revised prices
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bid_negotiation_boq_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID NOT NULL REFERENCES bid_negotiation_submissions(id) ON DELETE CASCADE,
  tender_boq_item_id  UUID NOT NULL REFERENCES tender_boq_items(id) ON DELETE RESTRICT,
  status              bid_boq_status NOT NULL DEFAULT 'BIDDING',
  unit_price          NUMERIC(15,3) NULL,
  remarks             TEXT NULL,
  CONSTRAINT bid_negotiation_boq_items_unique_line UNIQUE (submission_id, tender_boq_item_id),
  CONSTRAINT bid_negotiation_boq_items_status_price_consistent
    CHECK (
      (status = 'BIDDING' AND unit_price IS NOT NULL AND unit_price >= 0)
      OR
      (status = 'NOT_BIDDING' AND unit_price IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_bid_negotiation_boq_items_submission
  ON bid_negotiation_boq_items (submission_id);

CREATE INDEX IF NOT EXISTS idx_bid_negotiation_boq_items_template
  ON bid_negotiation_boq_items (tender_boq_item_id);

-- --------------------------------------------------------------------------
-- 7. Permissions
-- --------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description)
VALUES
  ('negotiation:launch', 'negotiation:launch', 'negotiation',
   'Launch a negotiation round on a tender and close existing rounds.'),
  ('negotiation:view',   'negotiation:view',   'negotiation',
   'View negotiation rounds, invitations, and submitted prices on a tender.')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------------
-- 8. Role grants
-- --------------------------------------------------------------------------
WITH grants(role_code, permission_code) AS (
  VALUES
    -- launch: PROCUREMENT_ADMIN only (matches award:amend ownership)
    ('PROCUREMENT_ADMIN',          'negotiation:launch'),
    -- view: every role that already sees commercial comparison + the
    -- archive-only roles (AUDITOR, EXECUTIVE) per BUG-113 precedent.
    ('PROCUREMENT_ADMIN',          'negotiation:view'),
    ('COMMERCIAL_COMMITTEE_MEMBER','negotiation:view'),
    ('COMMERCIAL_EVALUATOR',       'negotiation:view'),
    ('EXECUTIVE',                  'negotiation:view'),
    ('AUDITOR',                    'negotiation:view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r       ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 9. Token-version bump on holders so JWTs refresh with the new perms.
-- --------------------------------------------------------------------------
UPDATE users
SET token_version = token_version + 1
WHERE id IN (
  SELECT DISTINCT ur.user_id
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code IN (
    'PROCUREMENT_ADMIN',
    'COMMERCIAL_COMMITTEE_MEMBER',
    'COMMERCIAL_EVALUATOR',
    'EXECUTIVE',
    'AUDITOR'
  )
);

COMMIT;
