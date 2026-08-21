-- 053 (2026-08-07): let audit rows outlive the entities they describe.
--
-- WHY
-- `audit_logs` is an append-only, hash-chained table: each row's
-- hash_chain_value = SHA-256(prev_hash || canonical(payload)), and the payload
-- INCLUDES tender_id and bid_id (apps/api/src/modules/audit/audit.service.ts).
-- The API verifies the whole chain on boot.
--
-- That made purging a tender impossible without damaging the audit trail:
--   * tender_id / bid_id were FKs with NO ACTION, so Postgres refused to delete
--     a tender while any audit row referenced it;
--   * setting those columns NULL (or ON DELETE SET NULL) changes the payload the
--     verifier re-hashes, so every later row fails and the API logs
--     "AUDIT CHAIN BREAK" on every boot.
--
-- Dropping the two FKs resolves both: the audit row keeps the original UUID
-- untouched (so its hash still verifies) and simply refers to an entity that no
-- longer exists. This is the normal shape for an append-only log — the log is
-- not a child of the thing it records, and its retention must not be dictated
-- by that thing's lifecycle.
--
-- NOT dropped: actor_user_id, actor_vendor_user_id, vendor_id. Users and vendors
-- are not purged, and keeping those FKs preserves the audit viewer's actor-name
-- joins.
--
-- CONSEQUENCE: audit_logs.tender_id / bid_id may now be dangling UUIDs. Prisma
-- reads them fine (a relation lookup simply resolves to null). Do NOT run
-- `prisma db push` against a live database — it would try to re-create these
-- constraints from schema.prisma and fail on the dangling rows.
--
-- Idempotent.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tender_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_bid_id_fkey;

COMMENT ON COLUMN audit_logs.tender_id IS
  'Tender this event concerned. Intentionally NOT a foreign key (migration 053) — the tender may since have been purged; the value is part of the hash-chained payload and must never be rewritten.';
COMMENT ON COLUMN audit_logs.bid_id IS
  'Bid this event concerned. Intentionally NOT a foreign key (migration 053) — see tender_id.';
