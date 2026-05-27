-- =============================================================================
-- Migration 010 — BUG-031: per-reply clarification visibility
-- =============================================================================
-- Before: tender_clarifications.is_public controlled the entire thread.
-- Vendors saw any clarification whose parent had is_public=true, which by the
-- column default leaked all clarifications to every vendor on the tender.
--
-- After: each reply carries its own is_public flag. A thread is visible to
-- other vendors only when at least one reply is is_public=true. The parent
-- column is dropped.
-- =============================================================================

BEGIN;

ALTER TABLE tender_clarification_replies
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing replies from their parent's flag so current visibility
-- state is preserved on this hot data.
UPDATE tender_clarification_replies r
SET is_public = c.is_public
FROM tender_clarifications c
WHERE r.clarification_id = c.id;

ALTER TABLE tender_clarifications
  DROP COLUMN is_public;

CREATE INDEX idx_clarification_replies_public ON tender_clarification_replies(is_public) WHERE is_public = TRUE;

COMMIT;
