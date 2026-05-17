-- Migration 004: Add auth token fields to vendor_users table
-- token_version: incremented on logout to invalidate all refresh tokens (version-based revocation)
-- mfa_secret:    base32 TOTP secret; NULL when MFA not configured for the vendor user

ALTER TABLE vendor_users
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN mfa_secret    TEXT;

COMMENT ON COLUMN vendor_users.token_version IS
  'Incremented on logout; refresh tokens embed this version and are rejected when stale.';

COMMENT ON COLUMN vendor_users.mfa_secret IS
  'Base32 TOTP secret. NULL = MFA not set up. Store encrypted at rest in production.';
