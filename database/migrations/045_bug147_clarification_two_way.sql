-- =============================================================================
-- Migration 045 — BUG-147 (2026-06-21): two-way clarification replies
-- =============================================================================
-- A clarification reply can now come from either an internal user (admin /
-- engineer / procurement officer) OR the asking vendor user. Exactly one of
-- the two id columns will be set per row.
--
-- Schema change:
--   * tender_clarification_replies.replied_by_user_id          → nullable
--   * tender_clarification_replies.replied_by_vendor_user_id   → NEW (nullable)
--   * Index on the new column
--   * FK back to vendor_users(id)
--
-- All historical rows have replied_by_user_id NOT NULL (admin replies); the
-- new column starts NULL on every existing row.
-- =============================================================================

BEGIN;

ALTER TABLE tender_clarification_replies
    ALTER COLUMN replied_by_user_id DROP NOT NULL;

ALTER TABLE tender_clarification_replies
    ADD COLUMN IF NOT EXISTS replied_by_vendor_user_id UUID NULL
        REFERENCES vendor_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tender_clarification_replies_replied_by_vendor_user_id_idx
    ON tender_clarification_replies (replied_by_vendor_user_id);

-- Sanity: exactly one of the two id columns must be set per row.
ALTER TABLE tender_clarification_replies
    DROP CONSTRAINT IF EXISTS tender_clarification_replies_reply_caller_check;
ALTER TABLE tender_clarification_replies
    ADD CONSTRAINT tender_clarification_replies_reply_caller_check
    CHECK (
        (replied_by_user_id IS NOT NULL AND replied_by_vendor_user_id IS NULL)
        OR
        (replied_by_user_id IS NULL AND replied_by_vendor_user_id IS NOT NULL)
    );

COMMIT;
