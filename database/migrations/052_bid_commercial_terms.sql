-- 052 (2026-08-06): bid-level commercial terms — brand/manufacturer, country of
-- origin, warranty, delivery period and payment terms.
--
-- Scope decision: these describe the WHOLE offer, not a BOQ line. They live as
-- plain nullable columns on the two tables that already own an offer:
--   * bids                      — the original offer
--   * bid_negotiation_submissions — the revised offer for a negotiation round
--
-- Every column is nullable and stays out of every submission precondition:
-- an empty set of terms must never block a bid submission.
--
-- Idempotent — this migration is hand-applied to live databases (migrations
-- only auto-run on a fresh DB), so every ADD CONSTRAINT is guarded.

-- --------------------------------------------------------------------------
-- 1. delivery_period_unit enum
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE delivery_period_unit AS ENUM ('WEEKS', 'MONTHS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------------------
-- 2. bids
-- --------------------------------------------------------------------------
ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS brand_manufacturer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS country_of_origin  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS warranty_years     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS delivery_from      INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_to        INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_unit      delivery_period_unit,
  ADD COLUMN IF NOT EXISTS payment_terms      TEXT;

DO $$ BEGIN
  ALTER TABLE bids ADD CONSTRAINT bids_warranty_years_nonneg
    CHECK (warranty_years IS NULL OR warranty_years >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bids ADD CONSTRAINT bids_delivery_positive
    CHECK ((delivery_from IS NULL OR delivery_from > 0)
       AND (delivery_to   IS NULL OR delivery_to   > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bids ADD CONSTRAINT bids_delivery_range_ordered
    CHECK (delivery_from IS NULL OR delivery_to IS NULL OR delivery_to >= delivery_from);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "to" and "unit" carry no meaning without "from"
DO $$ BEGIN
  ALTER TABLE bids ADD CONSTRAINT bids_delivery_requires_from
    CHECK (delivery_from IS NOT NULL OR (delivery_to IS NULL AND delivery_unit IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bids ADD CONSTRAINT bids_delivery_requires_unit
    CHECK (delivery_from IS NULL OR delivery_unit IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------------------
-- 3. bid_negotiation_submissions — same 7 columns, same 5 rules
-- --------------------------------------------------------------------------
ALTER TABLE bid_negotiation_submissions
  ADD COLUMN IF NOT EXISTS brand_manufacturer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS country_of_origin  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS warranty_years     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS delivery_from      INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_to        INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_unit      delivery_period_unit,
  ADD COLUMN IF NOT EXISTS payment_terms      TEXT;

DO $$ BEGIN
  ALTER TABLE bid_negotiation_submissions ADD CONSTRAINT bid_neg_sub_warranty_years_nonneg
    CHECK (warranty_years IS NULL OR warranty_years >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bid_negotiation_submissions ADD CONSTRAINT bid_neg_sub_delivery_positive
    CHECK ((delivery_from IS NULL OR delivery_from > 0)
       AND (delivery_to   IS NULL OR delivery_to   > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bid_negotiation_submissions ADD CONSTRAINT bid_neg_sub_delivery_range_ordered
    CHECK (delivery_from IS NULL OR delivery_to IS NULL OR delivery_to >= delivery_from);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bid_negotiation_submissions ADD CONSTRAINT bid_neg_sub_delivery_requires_from
    CHECK (delivery_from IS NOT NULL OR (delivery_to IS NULL AND delivery_unit IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bid_negotiation_submissions ADD CONSTRAINT bid_neg_sub_delivery_requires_unit
    CHECK (delivery_from IS NULL OR delivery_unit IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN bids.warranty_years IS 'Warranty in years; decimals allowed (0.5 = 6 months)';
COMMENT ON COLUMN bids.delivery_to    IS 'Optional upper bound of the delivery range; NULL = fixed period';
COMMENT ON COLUMN bids.payment_terms  IS 'Free text, one milestone per line; line breaks are preserved on display';
