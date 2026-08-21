-- 048 (2026-06-26): import the real departments configured in dev. Flat (no
-- hierarchy). Excludes the disabled TEST_NEW test department. Idempotent.
INSERT INTO departments (code, name, is_active)
VALUES
  ('BM','Biomedical Department',true),
  ('FAC','Facilities Management',true),
  ('FIN','Finance',true),
  ('HR','Human Resources',true),
  ('IT','Information Technology',true),
  ('LEG','Legal & Compliance',true),
  ('LOG','Logistics',true),
  ('MR','Medical Record',true),
  ('OPS','Operations',true),
  ('PROC','Procurement',true),
  ('QA','QA Department',true)
ON CONFLICT (code) DO NOTHING;
