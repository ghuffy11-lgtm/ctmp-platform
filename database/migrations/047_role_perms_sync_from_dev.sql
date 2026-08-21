-- 047 (2026-06-26): sync role->permission grants from the validated dev set to
-- prod for all roles EXCEPT SYSTEM_ADMIN. SYSTEM_ADMIN is intentionally NOT
-- touched: dev's SYSTEM_ADMIN carries testing-only grants (incl. commercial:*)
-- that migration 007 deliberately removed for separation of duties (spec 3.4).
-- Additive + idempotent; prod-only grants are preserved.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('APPROVER','tender:audit:view'),
  ('AUDITOR','awarded:view'),
  ('AUDITOR','award:minutes:generate'),
  ('AUDITOR','comparison:technical:view'),
  ('AUDITOR','negotiation:view'),
  ('AUDITOR','system:view_all_departments'),
  ('AUDITOR','tender:audit:view'),
  ('AUDITOR','viewer:pdf:open'),
  ('COMMERCIAL_COMMITTEE_MEMBER','award:minutes:generate'),
  ('COMMERCIAL_COMMITTEE_MEMBER','commercial:download'),
  ('COMMERCIAL_COMMITTEE_MEMBER','commercial:evaluate'),
  ('COMMERCIAL_COMMITTEE_MEMBER','commercial:view'),
  ('COMMERCIAL_COMMITTEE_MEMBER','comparison:commercial:recommend'),
  ('COMMERCIAL_COMMITTEE_MEMBER','comparison:commercial:view'),
  ('COMMERCIAL_COMMITTEE_MEMBER','comparison:technical:view'),
  ('COMMERCIAL_COMMITTEE_MEMBER','negotiation:view'),
  ('COMMERCIAL_COMMITTEE_MEMBER','tender:audit:view'),
  ('COMMERCIAL_COMMITTEE_MEMBER','viewer:pdf:download'),
  ('COMMERCIAL_COMMITTEE_MEMBER','viewer:pdf:open'),
  ('COMMERCIAL_EVALUATOR','award:minutes:generate'),
  ('COMMERCIAL_EVALUATOR','commercial:download'),
  ('COMMERCIAL_EVALUATOR','comparison:commercial:recommend'),
  ('COMMERCIAL_EVALUATOR','comparison:commercial:view'),
  ('COMMERCIAL_EVALUATOR','comparison:technical:view'),
  ('COMMERCIAL_EVALUATOR','negotiation:view'),
  ('COMMERCIAL_EVALUATOR','tender:audit:view'),
  ('COMMERCIAL_EVALUATOR','viewer:pdf:download'),
  ('COMMERCIAL_EVALUATOR','viewer:pdf:open'),
  ('EXECUTIVE','system:view_all_departments'),
  ('EXECUTIVE','tender:view'),
  ('EXECUTIVE_VIEWER','technical:view'),
  ('EXECUTIVE_VIEWER','tender:audit:view'),
  ('FINANCE_REVIEWER','awarded:view'),
  ('PROCUREMENT_OFFICER','comparison:technical:view'),
  ('PROCUREMENT_OFFICER','criteria:library:manage'),
  ('PROCUREMENT_OFFICER','criteria:tender:edit'),
  ('PROCUREMENT_OFFICER','technical:evaluate:procurement'),
  ('PROCUREMENT_OFFICER','tender:audit:view'),
  ('PROCUREMENT_OFFICER','tender:cancel'),
  ('PROCUREMENT_OFFICER','viewer:pdf:open'),
  ('TECHNICAL_EVALUATOR','clarification:reply'),
  ('TECHNICAL_EVALUATOR','clarification:view_internal'),
  ('TECHNICAL_EVALUATOR','comparison:technical:view'),
  ('TECHNICAL_EVALUATOR','tender:approve'),
  ('TECHNICAL_EVALUATOR','tender:audit:view'),
  ('TECHNICAL_EVALUATOR','viewer:pdf:download'),
  ('TECHNICAL_EVALUATOR','viewer:pdf:open')
) AS v(rcode, pcode)
JOIN roles r       ON r.code = v.rcode
JOIN permissions p ON p.code = v.pcode
ON CONFLICT DO NOTHING;
