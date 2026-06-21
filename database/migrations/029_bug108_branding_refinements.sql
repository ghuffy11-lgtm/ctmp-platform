-- BUG-108 (2026-06-05): branding refinements follow-up to BUG-107.
--
-- 1. New `admin_logo` branding type for the admin Sidebar + admin login page
--    (BUG-107 only wired vendor_logo + report_logo; admin login had no logo
--    of its own).
-- 2. New `vendor_portal_name` setting so vendor portal nav + vendor login
--    pages can carry a brand string independent from the admin-side
--    `system_name`. Empty value = frontend falls back to system_name.
-- 3. Image-size hint for admin_logo.
--
-- All inserts are idempotent (ON CONFLICT DO NOTHING) so reruns are safe.

BEGIN;

INSERT INTO system_settings (key, value, value_type, category, description) VALUES
  ('branding.admin_portal_logo_storage_key', '', 'string', 'Branding',
   'Storage key of the logo shown on the admin Sidebar header and the admin login page. Upload via /system-settings/branding/upload (type=admin_logo).'),
  ('branding.hint_admin_logo',
   'Recommended 200×60 PNG or SVG · max 200 KB · transparent background · matches Sidebar header',
   'string', 'Branding', 'Helper text shown next to the Admin Logo upload field. Read-only display hint.'),
  ('branding.vendor_portal_name', '', 'string', 'Branding',
   'Display name of the vendor portal — appears in vendor portal top nav and vendor login/register pages. Empty = fall back to system_name.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
