-- BUG-137 (2026-06-19): vendor registration documents + bid supporting docs
--   + mandatory-supporting-docs flag on tenders.
--
-- Companion to the existing `vendor_documents` table (which is reused for
-- vendor registration documents — no schema change needed there).
--
-- Idempotent: ALTER ... IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tenders.requires_supporting_documents — default false
-- ---------------------------------------------------------------------------
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS requires_supporting_documents BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenders.requires_supporting_documents IS
  'When true, vendors must attach ≥1 supporting document PDF before bid submit. Default false (supporting docs accepted but optional).';

-- ---------------------------------------------------------------------------
-- 2. bid_supporting_documents — per-bid attached PDFs (certificates etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bid_supporting_documents (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id                      UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  original_filename           VARCHAR(255) NOT NULL,
  storage_key                 TEXT NOT NULL,
  mime_type                   VARCHAR(128) NOT NULL,
  file_size                   BIGINT NOT NULL,
  checksum_sha256             CHAR(64) NOT NULL,
  uploaded_by_vendor_user_id  UUID NULL REFERENCES vendor_users(id),
  uploaded_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at                   TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS bid_supporting_documents_bid_id_idx
  ON bid_supporting_documents (bid_id);

CREATE UNIQUE INDEX IF NOT EXISTS bid_supporting_documents_bid_checksum_uniq
  ON bid_supporting_documents (bid_id, checksum_sha256);

COMMENT ON TABLE bid_supporting_documents IS
  'BUG-137: optional supporting documents (certificates, letters, etc.) attached to a bid alongside the technical + commercial envelopes. Frozen (locked_at set) on bid submit.';

COMMIT;
