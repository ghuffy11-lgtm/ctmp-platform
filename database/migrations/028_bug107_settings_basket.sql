-- BUG-107 (2026-06-05): owner settings basket Pieces 2-5.
--
-- Schema additions:
--   1. system_settings.is_encrypted + encrypted_value (Piece 5: SMTP password,
--      future AD service-account password, etc).
--   2. roles.sidebar_label_overrides JSONB (Piece 4: per-role label rename).
-- Seed data:
--   3. branding.* keys (system_name, logo storage keys, image-size hints).
--   4. smtp.* + ad.* keys (Piece 5 — plaintext fields; passwords go in the
--      encrypted slot via the new POST /system-settings/secure endpoint).
--
-- Idempotent: every ALTER uses IF NOT EXISTS; every INSERT uses ON CONFLICT
-- DO NOTHING so re-running is safe.

BEGIN;

-- 1. Encrypted-value columns on system_settings (Piece 5)
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS encrypted_value BYTEA;

-- 2. Per-role sidebar label override (Piece 4)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS sidebar_label_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Branding seed keys (Pieces 2 + 3)
INSERT INTO system_settings (key, value, value_type, category, description) VALUES
  ('branding.system_name', 'CTMP', 'string', 'Branding',
   'Display name of the platform — appears in Sidebar header, Login page, and report metadata.'),
  ('branding.vendor_portal_logo_storage_key', '', 'string', 'Branding',
   'Storage key of the logo shown in the vendor portal top nav. Upload via /system-settings/branding/upload.'),
  ('branding.report_logo_storage_key', '', 'string', 'Branding',
   'Storage key of the logo embedded in PDF reports. Upload via /system-settings/branding/upload.'),
  ('branding.hint_vendor_logo', 'Recommended 240×80 PNG or JPG · max 200 KB · transparent background preferred',
   'string', 'Branding', 'Helper text shown next to the Vendor Portal Logo upload field. Read-only display hint.'),
  ('branding.hint_report_logo', 'Recommended 400×120 PNG or JPG · max 500 KB · sized for A4 landscape header',
   'string', 'Branding', 'Helper text shown next to the Report Logo upload field. Read-only display hint.')
ON CONFLICT (key) DO NOTHING;

-- 4. SMTP + AD plaintext keys (Piece 5)
INSERT INTO system_settings (key, value, value_type, category, description) VALUES
  ('smtp.host', '', 'string', 'Email', 'SMTP server hostname. Falls back to SMTP_HOST env var when empty.'),
  ('smtp.port', '587', 'integer', 'Email', 'SMTP port. 25 / 465 (TLS) / 587 (STARTTLS).'),
  ('smtp.user', '', 'string', 'Email', 'SMTP auth username. Falls back to SMTP_USER env var when empty.'),
  ('smtp.from', '', 'string', 'Email', 'Default From address for outbound mail (e.g. "noreply@example.com"). Falls back to SMTP_FROM env var.'),
  ('ad.url', '', 'string', 'Active Directory', 'LDAP URL (e.g. ldap://dc.example.com:389 or ldaps://...). Falls back to AD_URL env var when empty.'),
  ('ad.domain', '', 'string', 'Active Directory', 'AD domain suffix appended to usernames at bind time (e.g. corp.example.com). Falls back to AD_DOMAIN env var.')
ON CONFLICT (key) DO NOTHING;

-- 5. Encrypted slots for password keys. We pre-insert them as is_encrypted=true
--    with empty encrypted_value so the UI can detect they exist and offer a
--    write-only password field. Plaintext `value` stays NULL for these rows.
INSERT INTO system_settings (key, value, value_type, category, description, is_encrypted, encrypted_value) VALUES
  ('smtp.password', NULL, 'string', 'Email',
   'SMTP auth password. Stored AES-256-GCM encrypted at rest. Set via POST /system-settings/secure. Falls back to SMTP_PASSWORD env var when empty.',
   true, NULL),
  ('ad.bind_password', NULL, 'string', 'Active Directory',
   'Optional service-account password for AD bind (not used by the current per-user-bind code path). Stored AES-256-GCM encrypted at rest.',
   true, NULL)
ON CONFLICT (key) DO NOTHING;

COMMIT;
