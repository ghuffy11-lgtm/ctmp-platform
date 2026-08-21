-- 055_money_precision.sql
--
-- The Kuwaiti Dinar carries THREE decimal places (1 KWD = 1000 fils). The schema
-- did not apply that consistently: BoQ line prices, quantities and negotiation
-- totals are numeric(15,3), but the three columns they feed into were
-- numeric(15,2):
--
--   tenders.awarded_amount              <- Σ(unit_price × qty) at award time
--   tenders.budget_estimate
--   commercial_evaluations.total_price
--
-- PostgreSQL rounds on the way in, silently. A bid of 29.998 was recorded as a
-- 30.00 contract. Rounding is to nearest, so the stored contract value could sit
-- either side of the accepted bid, by up to 5 fils. The Award Minutes PDF then
-- prints that rounded figure as the contract value.
--
-- Found 2026-08-21 during the documentation audit. At that point NO stored row
-- had lost anything (every award to date is a round figure, and the single
-- fils-bearing BoQ line on dev — 29.998 on TDR-2026-0025 — had not been awarded),
-- which is why this is a pure widening with no data repair attached. That window
-- closes as soon as one award lands on a fils value.
--
-- Precision goes to 16, not 15, deliberately: numeric(15,3) would allow only 12
-- whole-dinar digits where numeric(15,2) allowed 13. numeric(16,3) keeps all 13
-- and adds the fils digit, so no existing value can fall out of range.
--
-- Widening scale is non-destructive — existing values keep their value and gain a
-- trailing zero (30.00 -> 30.000). It rewrites the table, which is irrelevant at
-- these row counts (tenders ~30, commercial_evaluations ~30).
--
-- Idempotent: re-running is a no-op because the target type is already in place.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenders'
      AND column_name = 'awarded_amount' AND numeric_scale = 2
  ) THEN
    ALTER TABLE tenders ALTER COLUMN awarded_amount TYPE numeric(16,3);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenders'
      AND column_name = 'budget_estimate' AND numeric_scale = 2
  ) THEN
    ALTER TABLE tenders ALTER COLUMN budget_estimate TYPE numeric(16,3);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commercial_evaluations'
      AND column_name = 'total_price' AND numeric_scale = 2
  ) THEN
    ALTER TABLE commercial_evaluations ALTER COLUMN total_price TYPE numeric(16,3);
  END IF;
END $$;

COMMENT ON COLUMN tenders.awarded_amount IS
  'Awarded contract value in KWD. numeric(16,3) — KWD carries 3 decimal places (fils). See migration 055.';
COMMENT ON COLUMN tenders.budget_estimate IS
  'Estimated budget in KWD. numeric(16,3) — KWD carries 3 decimal places (fils). See migration 055.';
COMMENT ON COLUMN commercial_evaluations.total_price IS
  'Evaluated commercial total in KWD. numeric(16,3) — KWD carries 3 decimal places (fils). See migration 055.';
