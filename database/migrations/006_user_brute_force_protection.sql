-- ============================================================================
-- Migration 006: Add brute-force protection to users table
--
-- Adds failedLoginCount and lockedUntil columns to match vendor_users
-- enforcement pattern. LOCAL auth users now subject to same lockout rules
-- as vendor users.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMPTZ;

-- Index for locked_until check in login queries
CREATE INDEX idx_users_locked_until ON users (locked_until) WHERE locked_until IS NOT NULL;
