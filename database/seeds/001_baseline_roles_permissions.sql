-- =====================================================================
-- CTMP 001_baseline_roles_permissions.sql
-- Baseline roles and permissions per implementation-spec.md sections 10-11.
--
-- This file is idempotent: every INSERT uses ON CONFLICT DO NOTHING.
--
-- Critical rule from the spec (decision: "Commercial Opening Does Not
-- Mean Universal Visibility"):
--
--   System Admin MUST NOT receive any commercial:* permissions other
--   than commercial:view_status. Commercial confidentiality is a
--   separation-of-duties control and must survive seeding.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Roles (spec section 10)
-- ---------------------------------------------------------------------

INSERT INTO roles (code, name, description, is_system) VALUES
    ('SYSTEM_ADMIN',                'System Admin',                'Platform configuration. Does not receive commercial visibility by default.', TRUE),
    ('PROCUREMENT_ADMIN',           'Procurement Admin',           'Manages tenders, vendors, workflows, exceptions, and publishing.',          TRUE),
    ('PROCUREMENT_OFFICER',         'Procurement Officer',         'Day-to-day procurement operations subject to permissions.',                 TRUE),
    ('DEPARTMENT_REQUESTER',        'Department Requester',        'Raises tender requests for a department.',                                  TRUE),
    ('APPROVER',                    'Approver',                    'Generic approver role used in workflow steps.',                             TRUE),
    ('TECHNICAL_EVALUATOR',         'Technical Evaluator',         'Opens/views/evaluates technical envelopes only.',                           TRUE),
    ('COMMERCIAL_EVALUATOR',        'Commercial Evaluator',        'Views/evaluates commercial envelopes after committee opening with permission.', TRUE),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'Commercial Committee Member', 'Participates in assigned commercial opening sessions.',                     TRUE),
    ('FINANCE_REVIEWER',            'Finance Reviewer',            'Reviews finance-related approvals.',                                        TRUE),
    ('LEGAL_REVIEWER',              'Legal Reviewer',              'Reviews legal-related approvals.',                                          TRUE),
    ('EXECUTIVE_VIEWER',            'Executive Viewer',            'Read-only executive dashboards and reports.',                               TRUE),
    ('AUDITOR',                     'Auditor',                     'Read-only audit/report access. Commercial access separately permissioned.', TRUE),
    ('VENDOR_ADMIN',                'Vendor Admin',                'Vendor-side administrator for the vendor''s own organisation.',             TRUE),
    ('VENDOR_USER',                 'Vendor User',                 'Vendor-side regular user.',                                                 TRUE)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Permissions (spec section 11)
-- ---------------------------------------------------------------------

INSERT INTO permissions (code, category, description) VALUES
    -- vendor
    ('vendor:view',                  'vendor', 'View vendor list and profile.'),
    ('vendor:create',                'vendor', 'Create vendor records on behalf of a vendor.'),
    ('vendor:approve',               'vendor', 'Approve a vendor registration.'),
    ('vendor:reject',                'vendor', 'Reject a vendor registration.'),
    ('vendor:suspend',               'vendor', 'Suspend a vendor.'),
    ('vendor:blacklist',             'vendor', 'Blacklist a vendor.'),
    ('vendor:edit_profile',          'vendor', 'Edit vendor profile data.'),
    ('vendor:review_documents',      'vendor', 'Review vendor uploaded documents.'),
    -- tender
    ('tender:create',                'tender', 'Create new tenders.'),
    ('tender:edit',                  'tender', 'Edit tender drafts.'),
    ('tender:view',                  'tender', 'View tenders.'),
    ('tender:approve',               'tender', 'Approve tenders in workflow.'),
    ('tender:publish',               'tender', 'Publish a tender.'),
    ('tender:cancel',                'tender', 'Cancel a tender.'),
    ('tender:close_submission',      'tender', 'Close submissions on a tender.'),
    ('tender:archive',               'tender', 'Archive a closed tender.'),
    -- clarification
    ('clarification:create',         'clarification', 'Create clarification questions.'),
    ('clarification:reply',          'clarification', 'Reply to clarification questions.'),
    ('clarification:view_internal',  'clarification', 'View all clarifications internally.'),
    ('clarification:view_vendor_own','clarification', 'Vendor view of their own clarifications.'),
    -- bid
    ('bid:submit',                   'bid',    'Submit a bid (vendor side).'),
    ('bid:view_metadata',            'bid',    'View non-sensitive bid metadata.'),
    -- technical
    ('technical:view',               'technical', 'View technical envelope contents.'),
    ('technical:open',               'technical', 'Open technical envelopes after submission closed.'),
    ('technical:evaluate',           'technical', 'Submit technical evaluation scores.'),
    ('technical:finalize',           'technical', 'Finalise technical evaluation results.'),
    -- commercial (sensitive: commercial:view, :download, :evaluate, :export must NOT be granted to System Admin by default)
    ('commercial:view_status',       'commercial', 'View commercial envelope status only.'),
    ('commercial:open_committee',    'commercial', 'Trigger commercial opening within a committee session.'),
    ('commercial:view',              'commercial', 'View commercial bid details after committee opening.'),
    ('commercial:download',          'commercial', 'Download commercial files after committee opening.'),
    ('commercial:evaluate',          'commercial', 'Evaluate commercial bids after committee opening.'),
    ('commercial:export',            'commercial', 'Export commercial comparison data.'),
    -- late submission
    ('late_submission:grant',        'late_submission', 'Grant a late submission exception.'),
    ('late_submission:approve',      'late_submission', 'Approve a late submission exception via workflow.'),
    ('late_submission:view',         'late_submission', 'View late submission exceptions.'),
    -- committee
    ('committee:create_session',     'committee', 'Create a committee session.'),
    ('committee:record_attendance',  'committee', 'Record committee attendance.'),
    ('committee:open_commercial',    'committee', 'Open commercial envelopes inside a committee session.'),
    ('committee:view_minutes',       'committee', 'View committee minutes.'),
    ('committee:export_minutes',     'committee', 'Export committee minutes.'),
    -- award
    ('award:recommend',              'award', 'Recommend an award.'),
    ('award:approve',                'award', 'Approve an award recommendation.'),
    ('award:finalize',               'award', 'Finalise the award.'),
    -- reports & audit
    ('reports:view',                 'reports', 'View operational reports.'),
    ('reports:export',               'reports', 'Export operational reports.'),
    ('audit:view',                   'audit',   'View audit logs.'),
    ('audit:export',                 'audit',   'Export audit logs.'),
    -- system
    ('system:configure',             'system', 'Configure system settings.'),
    ('roles:manage',                 'system', 'Manage roles.'),
    ('permissions:manage',           'system', 'Manage permission grants.'),
    ('notification_templates:manage','system', 'Manage notification templates.')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Role-permission baseline grants
--
-- Pattern: insert (role_code, permission_code) pairs. The CTE below
-- resolves them to UUIDs and inserts with ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------

WITH grants(role_code, permission_code) AS (
    VALUES
    -- SYSTEM_ADMIN: platform configuration. Deliberately NO commercial:view/download/evaluate/export.
    ('SYSTEM_ADMIN', 'system:configure'),
    ('SYSTEM_ADMIN', 'roles:manage'),
    ('SYSTEM_ADMIN', 'permissions:manage'),
    ('SYSTEM_ADMIN', 'notification_templates:manage'),
    ('SYSTEM_ADMIN', 'tender:view'),
    ('SYSTEM_ADMIN', 'vendor:view'),
    ('SYSTEM_ADMIN', 'commercial:view_status'),
    ('SYSTEM_ADMIN', 'audit:view'),
    ('SYSTEM_ADMIN', 'reports:view'),

    -- PROCUREMENT_ADMIN: full procurement operations except commercial details (acquired separately).
    ('PROCUREMENT_ADMIN', 'tender:create'),
    ('PROCUREMENT_ADMIN', 'tender:edit'),
    ('PROCUREMENT_ADMIN', 'tender:view'),
    ('PROCUREMENT_ADMIN', 'tender:publish'),
    ('PROCUREMENT_ADMIN', 'tender:cancel'),
    ('PROCUREMENT_ADMIN', 'tender:close_submission'),
    ('PROCUREMENT_ADMIN', 'tender:archive'),
    ('PROCUREMENT_ADMIN', 'vendor:view'),
    ('PROCUREMENT_ADMIN', 'vendor:create'),
    ('PROCUREMENT_ADMIN', 'vendor:approve'),
    ('PROCUREMENT_ADMIN', 'vendor:reject'),
    ('PROCUREMENT_ADMIN', 'vendor:suspend'),
    ('PROCUREMENT_ADMIN', 'vendor:blacklist'),
    ('PROCUREMENT_ADMIN', 'vendor:edit_profile'),
    ('PROCUREMENT_ADMIN', 'vendor:review_documents'),
    ('PROCUREMENT_ADMIN', 'clarification:reply'),
    ('PROCUREMENT_ADMIN', 'clarification:view_internal'),
    ('PROCUREMENT_ADMIN', 'bid:view_metadata'),
    ('PROCUREMENT_ADMIN', 'late_submission:grant'),
    ('PROCUREMENT_ADMIN', 'late_submission:view'),
    ('PROCUREMENT_ADMIN', 'committee:create_session'),
    ('PROCUREMENT_ADMIN', 'committee:record_attendance'),
    ('PROCUREMENT_ADMIN', 'committee:view_minutes'),
    ('PROCUREMENT_ADMIN', 'commercial:view_status'),
    ('PROCUREMENT_ADMIN', 'reports:view'),
    ('PROCUREMENT_ADMIN', 'reports:export'),

    -- PROCUREMENT_OFFICER: subset of admin, no destructive operations.
    ('PROCUREMENT_OFFICER', 'tender:create'),
    ('PROCUREMENT_OFFICER', 'tender:edit'),
    ('PROCUREMENT_OFFICER', 'tender:view'),
    ('PROCUREMENT_OFFICER', 'vendor:view'),
    ('PROCUREMENT_OFFICER', 'clarification:reply'),
    ('PROCUREMENT_OFFICER', 'clarification:view_internal'),
    ('PROCUREMENT_OFFICER', 'bid:view_metadata'),
    ('PROCUREMENT_OFFICER', 'late_submission:view'),
    ('PROCUREMENT_OFFICER', 'committee:view_minutes'),
    ('PROCUREMENT_OFFICER', 'commercial:view_status'),
    ('PROCUREMENT_OFFICER', 'reports:view'),

    -- DEPARTMENT_REQUESTER
    ('DEPARTMENT_REQUESTER', 'tender:create'),
    ('DEPARTMENT_REQUESTER', 'tender:view'),
    ('DEPARTMENT_REQUESTER', 'clarification:view_internal'),

    -- APPROVER: generic approver used in workflow assignment.
    ('APPROVER', 'tender:approve'),
    ('APPROVER', 'tender:view'),
    ('APPROVER', 'late_submission:approve'),
    ('APPROVER', 'award:approve'),

    -- TECHNICAL_EVALUATOR
    ('TECHNICAL_EVALUATOR', 'tender:view'),
    ('TECHNICAL_EVALUATOR', 'bid:view_metadata'),
    ('TECHNICAL_EVALUATOR', 'technical:view'),
    ('TECHNICAL_EVALUATOR', 'technical:open'),
    ('TECHNICAL_EVALUATOR', 'technical:evaluate'),
    ('TECHNICAL_EVALUATOR', 'technical:finalize'),

    -- COMMERCIAL_EVALUATOR
    ('COMMERCIAL_EVALUATOR', 'tender:view'),
    ('COMMERCIAL_EVALUATOR', 'bid:view_metadata'),
    ('COMMERCIAL_EVALUATOR', 'commercial:view_status'),
    ('COMMERCIAL_EVALUATOR', 'commercial:view'),
    ('COMMERCIAL_EVALUATOR', 'commercial:evaluate'),

    -- COMMERCIAL_COMMITTEE_MEMBER
    ('COMMERCIAL_COMMITTEE_MEMBER', 'tender:view'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'bid:view_metadata'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'committee:record_attendance'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'committee:open_commercial'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'committee:view_minutes'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'commercial:open_committee'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'commercial:view_status'),

    -- FINANCE_REVIEWER
    ('FINANCE_REVIEWER', 'tender:view'),
    ('FINANCE_REVIEWER', 'tender:approve'),
    ('FINANCE_REVIEWER', 'award:approve'),
    ('FINANCE_REVIEWER', 'reports:view'),

    -- LEGAL_REVIEWER
    ('LEGAL_REVIEWER', 'tender:view'),
    ('LEGAL_REVIEWER', 'tender:approve'),
    ('LEGAL_REVIEWER', 'reports:view'),

    -- EXECUTIVE_VIEWER
    ('EXECUTIVE_VIEWER', 'tender:view'),
    ('EXECUTIVE_VIEWER', 'reports:view'),
    ('EXECUTIVE_VIEWER', 'reports:export'),
    ('EXECUTIVE_VIEWER', 'commercial:view_status'),

    -- AUDITOR: read-only audit and reports. Commercial visibility must be granted separately.
    ('AUDITOR', 'audit:view'),
    ('AUDITOR', 'audit:export'),
    ('AUDITOR', 'reports:view'),
    ('AUDITOR', 'reports:export'),
    ('AUDITOR', 'tender:view'),
    ('AUDITOR', 'vendor:view'),
    ('AUDITOR', 'commercial:view_status'),

    -- VENDOR_ADMIN
    ('VENDOR_ADMIN', 'vendor:edit_profile'),
    ('VENDOR_ADMIN', 'bid:submit'),
    ('VENDOR_ADMIN', 'clarification:create'),
    ('VENDOR_ADMIN', 'clarification:view_vendor_own'),

    -- VENDOR_USER
    ('VENDOR_USER', 'bid:submit'),
    ('VENDOR_USER', 'clarification:create'),
    ('VENDOR_USER', 'clarification:view_vendor_own')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- System settings: minimal defaults the platform expects at boot.
-- ---------------------------------------------------------------------

INSERT INTO system_settings (key, value, value_type, description) VALUES
    ('upload.max_file_size_bytes', '52428800', 'integer', 'Maximum upload size per file (default 50 MB).'),
    ('session.idle_timeout_minutes', '30', 'integer', 'Idle session timeout in minutes.'),
    ('vendor.captcha.enabled', 'true', 'boolean', 'Whether CAPTCHA is enforced on vendor public endpoints.'),
    ('vendor.password.min_length', '12', 'integer', 'Minimum vendor password length.'),
    ('audit.retention_days', '2555', 'integer', 'Audit log retention in days (default ~7 years).'),
    ('late_submission.allow_after_technical_opening', 'false', 'boolean', 'Whether late exceptions may be granted after technical opening starts.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
