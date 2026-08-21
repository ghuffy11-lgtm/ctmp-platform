-- 054 (2026-08-13): Arabic names for the three data columns the Arabic
-- Management Dashboard (/executive-ar) still shows in English — departments,
-- vendors and tender categories.
--
-- Interface text is handled by label sets in the frontend; THESE are data, so
-- the Arabic values have to be captured where the data is created. Every column
-- is nullable and every consumer falls back to the existing English/Latin name,
-- so a half-filled table degrades one row at a time rather than blanking out.
--
-- Categories additionally get a real table. Until now `tenders.category` was
-- free text and the dropdown was a hardcoded array duplicated in
-- tenders/new/page.tsx and tenders/[id]/edit/page.tsx — there was nowhere to
-- attach an Arabic name, and no way for procurement to manage its own taxonomy.
--
-- `tenders.category` deliberately stays a text column: switching it to a
-- foreign key would touch tender create/edit, list filters, reports, analytics
-- and the executive drill-downs for no benefit to this feature. The categories
-- table is the source for the dropdown and the Arabic name, joined by name.
-- Renaming a category updates the matching tenders in the same transaction
-- (see TenderCategoriesService.update) so a rename cannot orphan tenders.
--
-- Idempotent — hand-applied to live databases.

-- --------------------------------------------------------------------------
-- 1. departments.name_ar
-- --------------------------------------------------------------------------
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS name_ar VARCHAR(255);

COMMENT ON COLUMN departments.name_ar IS
  'Arabic department name. NULL = fall back to name. Shown on /executive-ar.';

-- --------------------------------------------------------------------------
-- 2. vendors.company_name_ar
-- --------------------------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS company_name_ar VARCHAR(255);

COMMENT ON COLUMN vendors.company_name_ar IS
  'Arabic company name, supplied by the vendor at registration or by procurement. Optional by owner decision 2026-08-13 — an international supplier may have no Arabic trade name. NULL = fall back to company_name.';

-- --------------------------------------------------------------------------
-- 3. tender_categories
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tender_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL UNIQUE,
  name_ar     VARCHAR(120),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_categories_active
  ON tender_categories (is_active, sort_order);

COMMENT ON TABLE tender_categories IS
  'Managed tender categories. Replaces a hardcoded array that was duplicated in the tender create and edit pages. Joined to tenders.category BY NAME — tenders.category remains a text column on purpose.';

-- Seed: the eight previously-hardcoded options, with Arabic drafted alongside.
-- ON CONFLICT DO NOTHING so re-running never clobbers an edited Arabic name.
INSERT INTO tender_categories (name, name_ar, sort_order) VALUES
  ('Construction',  'إنشاءات',            10),
  ('IT Services',   'خدمات تقنية المعلومات', 20),
  ('Healthcare',    'رعاية صحية',          30),
  ('Engineering',   'هندسة',              40),
  ('Services',      'خدمات',              50),
  ('Insurance',     'تأمين',              60),
  ('Consulting',    'استشارات',            70),
  ('Supply',        'توريد',              80)
ON CONFLICT (name) DO NOTHING;

-- Safety net: any category already used by a tender but missing from the seed
-- (free text meant anything could have been saved) becomes a row too, so the
-- dropdown can never silently drop a value that live data depends on.
INSERT INTO tender_categories (name, sort_order)
SELECT DISTINCT t.category, 900
  FROM tenders t
 WHERE t.category IS NOT NULL
   AND btrim(t.category) <> ''
   AND NOT EXISTS (SELECT 1 FROM tender_categories c WHERE c.name = t.category)
ON CONFLICT (name) DO NOTHING;
