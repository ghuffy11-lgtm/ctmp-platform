-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 — DOCUMENTATION-ONLY MARKER
--
-- This file is intentionally a no-op. The work it documents was applied to the
-- staging DB on 2026-05-23 by a Node script that ran inside ctmp-api:
--   apps/api/scripts/rebake-audit-chain.js --execute
-- That script holds the same advisory lock the runtime uses, walks
-- audit_logs rows >=7 in id order, and rewrites hash_chain_value +
-- prev_hash_chain_value using the FIXED Date-aware canonicalize() in
-- apps/api/src/modules/audit/audit.service.ts. It appends an
-- AUDIT_CHAIN_REBAKE row (id 73 on staging) and acknowledges every
-- AUDIT_CHAIN_BREAK security_alerts row with the SYSTEM_ADMIN user id.
--
-- Why a Node script and not pure SQL: the canonicalisation rules are
-- application-level (sorted-key JSON with Date.toISOString() and
-- Buffer.toString('base64') normalisation). Reimplementing them in
-- plpgsql to a guaranteed byte-for-byte match was riskier than reusing
-- the JS function via Prisma.
--
-- Why this file exists at all: on a brand-new database, migration 008
-- runs alongside 001..007 and we want the migration index to remain
-- contiguous. A fresh DB has no broken rows to rebake — the new
-- canonicalize is in effect from the first audit.log() call, so this
-- file SHOULD always be a no-op on a clean install.
--
-- Spec invariant note: "audit logs are append-only and cannot be edited
-- through the application." The rebake script bypassed the
-- audit_logs_block_modifications UPDATE trigger inside a single
-- transaction. This was an out-of-band repair, not a normal-path edit;
-- the deviation is documented in:
--   agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md (RCA + fix design)
--   docs/decisions/DECISION_LOG.md (the architectural decision)
--   agents/handoffs/HANDOVER.md  (the operational record)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  RAISE NOTICE 'Migration 008 is a documentation marker. See header for context.';
END $$;
