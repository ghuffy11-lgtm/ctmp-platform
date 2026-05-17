-- =====================================================================
-- Migration: 002_schema_hardening.sql
-- Purpose:   Add hex-format CHECK constraints to all SHA-256 / hash-chain
--            columns, and document captcha_verification_id nullability
--            intent on vendor_registration_requests.
-- Prereq:    001_initial_schema.sql applied.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. SHA-256 HEX FORMAT CONSTRAINTS
--    All CHAR(64) columns that store SHA-256 digests must contain exactly
--    64 lowercase hex characters. The database enforces format; the
--    application still owns computation and must compute lowercase hex.
-- ---------------------------------------------------------------------

-- vendor_documents
ALTER TABLE vendor_documents
    ADD CONSTRAINT vendor_documents_checksum_sha256_hex
        CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$');

-- tender_documents
ALTER TABLE tender_documents
    ADD CONSTRAINT tender_documents_checksum_sha256_hex
        CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$');

-- bid_documents
ALTER TABLE bid_documents
    ADD CONSTRAINT bid_documents_checksum_sha256_hex
        CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$');

-- bid_submission_receipts — receipt_hash is also SHA-256
ALTER TABLE bid_submission_receipts
    ADD CONSTRAINT bid_submission_receipts_receipt_hash_hex
        CHECK (receipt_hash ~ '^[a-f0-9]{64}$');

-- file_integrity_checks — both columns are SHA-256 digests
ALTER TABLE file_integrity_checks
    ADD CONSTRAINT file_integrity_checks_expected_checksum_hex
        CHECK (expected_checksum ~ '^[a-f0-9]{64}$');

ALTER TABLE file_integrity_checks
    ADD CONSTRAINT file_integrity_checks_actual_checksum_hex
        CHECK (actual_checksum ~ '^[a-f0-9]{64}$');

-- audit_logs hash chain
-- hash_chain_value is NOT NULL and must always be valid hex.
-- prev_hash_chain_value is NULL only for the genesis row; when present it
-- must also be valid hex.
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_hash_chain_value_hex
        CHECK (hash_chain_value ~ '^[a-f0-9]{64}$');

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_prev_hash_chain_value_hex
        CHECK (prev_hash_chain_value IS NULL
            OR prev_hash_chain_value ~ '^[a-f0-9]{64}$');

-- ---------------------------------------------------------------------
-- 2. CAPTCHA NULLABILITY DOCUMENTATION
--    captcha_verification_id is intentionally nullable to allow
--    admin-created or bulk-imported vendor registration records.
--    The public self-registration API endpoint MUST:
--      a) Validate the CAPTCHA token server-side with the provider.
--      b) Insert the resulting captcha_verification_logs row first.
--      c) Supply the returned ID as captcha_verification_id on INSERT.
--    No DB-level constraint can distinguish web vs admin origin, so this
--    rule is owned by the API layer (VendorAuthController).
-- ---------------------------------------------------------------------
COMMENT ON COLUMN vendor_registration_requests.captcha_verification_id IS
    'NULL for admin-created/imported registrations only. '
    'Public self-registration endpoint must validate CAPTCHA server-side, '
    'insert a captcha_verification_logs row, and supply this FK before INSERT.';

COMMIT;
