-- BUG-138 (2026-06-19): drop the unique-checksum index on
-- bid_supporting_documents. The intent in BUG-137 was to dedupe accidental
-- double-clicks, but it's blocking real multi-upload when a vendor (or
-- tester) attaches the same PDF twice. Vendors can upload whatever number
-- of supporting docs they want — the bid is theirs and the upload is
-- vendor-side intent. The non-unique bid_id index stays for lookup speed.
--
-- Idempotent: DROP ... IF EXISTS.

BEGIN;

DROP INDEX IF EXISTS bid_supporting_documents_bid_checksum_uniq;

COMMIT;
