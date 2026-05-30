-- =============================================================================
-- Migration 020 — BUG-068 / Phase F BOQ unlock
-- =============================================================================
-- Implements the master plan §D1 decision (locked 2026-05-27, deferred until
-- 2026-05-31): "Buyer (procurement) defines a BOQ template when creating the
-- tender. Vendors fill unit prices only against the buyer's items.
-- Apples-to-apples comparison."
--
-- Owner-locked decisions 2026-05-31:
--   1. PDF on commercial envelope is now OPTIONAL — BOQ is the legal price record.
--   2. Existing tenders get an auto-backfill placeholder row so the schema
--      invariant ("every tender has ≥1 BOQ row") holds. Comparison aggregator's
--      BUG-053 manual-entry fallback (commercial_evaluations.totalPrice) still
--      wins on bids that have no bid_boq_items rows.
--   3. Vendor partial bids: explicit NOT_BIDDING per-line selector. No blanks.
--   4. BOQ template editable only in Draft / Internal Review / Approved
--      (enforced at the service layer, not the DB layer, to mirror the
--      Technical Criteria editor's behaviour from BUG-044).
--
-- Two new tables, one enum, indexes, audit-friendly. Idempotent: re-running
-- skips rows that already exist.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Enum for per-line bid status
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bid_boq_status') THEN
        CREATE TYPE bid_boq_status AS ENUM ('BIDDING', 'NOT_BIDDING');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. tender_boq_items — procurement's BOQ template
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tender_boq_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id   UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    item_no     VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    qty         DECIMAL(15, 3) NOT NULL CHECK (qty > 0),
    unit        VARCHAR(50) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_id, item_no)
);

CREATE INDEX IF NOT EXISTS idx_tender_boq_items_tender
    ON tender_boq_items(tender_id, sort_order);

COMMENT ON TABLE tender_boq_items IS
    'Bill of Quantities template defined by procurement at tender creation. Vendors fill unit prices per row via bid_boq_items.';

-- -----------------------------------------------------------------------------
-- 3. bid_boq_items — vendor's per-line submission
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bid_boq_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id              UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    tender_boq_item_id  UUID NOT NULL REFERENCES tender_boq_items(id) ON DELETE RESTRICT,
    status              bid_boq_status NOT NULL DEFAULT 'BIDDING',
    unit_price          DECIMAL(15, 3),
    remarks             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bid_id, tender_boq_item_id),
    CONSTRAINT bid_boq_items_status_price_consistent CHECK (
        (status = 'BIDDING'     AND unit_price IS NOT NULL AND unit_price >= 0) OR
        (status = 'NOT_BIDDING' AND unit_price IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_bid_boq_items_bid
    ON bid_boq_items(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_boq_items_tender_item
    ON bid_boq_items(tender_boq_item_id);

COMMENT ON TABLE bid_boq_items IS
    'Vendor per-line BOQ submission. Status=BIDDING requires unit_price >= 0; NOT_BIDDING leaves unit_price NULL (explicit opt-out per owner decision 2026-05-31).';

-- -----------------------------------------------------------------------------
-- 4. Auto-backfill placeholder row for every existing tender
-- -----------------------------------------------------------------------------
-- Ensures the schema invariant "every tender has ≥1 BOQ row" holds. Comparison
-- aggregator's BUG-053 manual-entry fallback still triggers on bids that have
-- no bid_boq_items rows, so legacy tenders continue to work unchanged.
INSERT INTO tender_boq_items (tender_id, item_no, description, qty, unit, sort_order)
SELECT t.id, '0', 'Legacy tender — no BOQ defined', 1, 'LS', 0
FROM tenders t
WHERE NOT EXISTS (
    SELECT 1 FROM tender_boq_items b WHERE b.tender_id = t.id
);

COMMIT;
