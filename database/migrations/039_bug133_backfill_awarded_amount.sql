-- BUG-133 (2026-06-14): backfill tenders.awarded_amount on every tender
-- that was awarded before the BUG-088 root fix landed (BUG-133 P1). Walks
-- the same 4-source priority chain used at confirm time + by the analytics
-- resolver:
--
--   1. Latest negotiation submission's total_price
--   2. Σ(unit_price × qty) over BIDDING rows of the awarded vendor's bid
--   3. Latest commercial_evaluations.total_price for the awarded vendor's bid
--
-- Idempotent: only writes where awarded_amount IS NULL. Re-running is a no-op.
-- Genuinely unrecoverable rows (no source fired) remain NULL — they're flagged
-- by a final SELECT for follow-up.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Latest negotiation submission (newest round first)
-- -----------------------------------------------------------------------------
UPDATE tenders t
SET    awarded_amount = subq.total_price
FROM   (
  SELECT DISTINCT ON (b.tender_id)
         b.tender_id,
         s.total_price
  FROM   bids b
  JOIN   negotiation_invitations i ON i.bid_id = b.id
  JOIN   negotiation_rounds       r ON r.id = i.round_id
  JOIN   bid_negotiation_submissions s ON s.invitation_id = i.id
  WHERE  s.total_price IS NOT NULL
  ORDER  BY b.tender_id, r.round_number DESC
) AS subq
WHERE  t.id = subq.tender_id
  AND  t.awarded_at IS NOT NULL
  AND  t.awarded_amount IS NULL
  AND  EXISTS (
    SELECT 1 FROM bids b2
    WHERE  b2.tender_id = t.id
      AND  b2.vendor_id = t.awarded_vendor_id
      AND  b2.is_alternative = false
  );

-- -----------------------------------------------------------------------------
-- 2. BoQ-driven total (Σ unit_price × qty for BIDDING rows on the awarded bid)
-- -----------------------------------------------------------------------------
UPDATE tenders t
SET    awarded_amount = subq.total_price
FROM   (
  SELECT b.tender_id,
         SUM(boq.unit_price * tboq.qty) AS total_price
  FROM   bids b
  JOIN   bid_boq_items boq ON boq.bid_id = b.id
  JOIN   tender_boq_items tboq ON tboq.id = boq.tender_boq_item_id
  JOIN   tenders parent ON parent.id = b.tender_id
  WHERE  boq.status   = 'BIDDING'
    AND  boq.unit_price IS NOT NULL
    AND  b.vendor_id = parent.awarded_vendor_id
    AND  b.is_alternative = false
  GROUP  BY b.tender_id
  HAVING SUM(boq.unit_price * tboq.qty) IS NOT NULL
) AS subq
WHERE  t.id = subq.tender_id
  AND  t.awarded_at IS NOT NULL
  AND  t.awarded_amount IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Latest commercial_evaluations.total_price for the awarded vendor's bid
-- -----------------------------------------------------------------------------
UPDATE tenders t
SET    awarded_amount = subq.total_price
FROM   (
  SELECT DISTINCT ON (b.tender_id)
         b.tender_id,
         ce.total_price
  FROM   bids b
  JOIN   tenders parent ON parent.id = b.tender_id
  JOIN   commercial_evaluations ce ON ce.bid_id = b.id
  WHERE  ce.total_price IS NOT NULL
    AND  b.vendor_id = parent.awarded_vendor_id
    AND  b.is_alternative = false
  ORDER  BY b.tender_id, ce.created_at DESC
) AS subq
WHERE  t.id = subq.tender_id
  AND  t.awarded_at IS NOT NULL
  AND  t.awarded_amount IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Report the genuinely-unrecoverable rows (no source resolved). These will
--    continue to read as 0 on the dashboard via the read-side resolver until
--    someone manually populates awarded_amount or records a CommercialEvaluation.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT count(*)
  INTO   remaining
  FROM   tenders
  WHERE  awarded_at IS NOT NULL AND awarded_amount IS NULL;
  IF remaining > 0 THEN
    RAISE NOTICE 'BUG-133 backfill: % awarded tender(s) still have NULL awarded_amount (no negotiation submission, no BoQ-priced bid, no commercial evaluation). Investigate individually.', remaining;
  ELSE
    RAISE NOTICE 'BUG-133 backfill: all awarded tenders now have awarded_amount populated.';
  END IF;
END $$;

COMMIT;
