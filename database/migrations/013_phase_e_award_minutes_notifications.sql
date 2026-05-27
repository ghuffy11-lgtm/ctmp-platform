-- =============================================================================
-- Migration 013 — Phase E: Award Minutes PDF + vendor notification templates
-- =============================================================================
-- Per master plan §H1-H2 + §F6 + the implementation-decision lock from
-- 2026-05-27 evening (notification dispatch is opt-in via the Confirm dialog).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Permissions: award:minutes:generate + notification:vendor:trigger
-- -----------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description) VALUES
    ('award:minutes:generate',     'award:minutes:generate',     'award', 'Generate Award Minutes PDF on-demand for an awarded tender.'),
    ('notification:vendor:trigger','notification:vendor:trigger','award', 'Manually trigger vendor award notifications (if forgotten at Confirm time).')
ON CONFLICT (code) DO NOTHING;

WITH grants(role_code, permission_code) AS (
    VALUES
    ('PROCUREMENT_ADMIN',           'award:minutes:generate'),
    ('COMMERCIAL_COMMITTEE_MEMBER', 'award:minutes:generate'),
    ('AUDITOR',                     'award:minutes:generate'),
    ('PROCUREMENT_ADMIN',           'notification:vendor:trigger')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Notification templates — TENDER_AWARDED_WINNER + TENDER_AWARDED_LOSER
-- -----------------------------------------------------------------------------
INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES
    (
        'TENDER_AWARDED_WINNER',
        'Tender awarded — vendor won',
        '[CTMP] Award decision — {{tenderReference}}: you have been awarded',
        E'Dear {{vendorName}},\n\nCongratulations — your bid for tender {{tenderReference}} ("{{tenderTitle}}") has been awarded.\n\nAward summary:\n  • Confirmed at: {{confirmedAt}}\n  • Confirmed by: {{confirmedByName}}\n\nFurther steps will follow from the procurement team. Please log in to the vendor portal to review the official award notice:\n  {{vendorPortalUrl}}/bids/{{bidId}}\n\nThis email is a courtesy notification — the procurement team will contact you directly about contract execution.\n\nCTMP\n',
        'EMAIL',
        'en',
        TRUE
    ),
    (
        'TENDER_AWARDED_LOSER',
        'Tender awarded — vendor not selected',
        '[CTMP] Award decision — {{tenderReference}}: awarded to another vendor',
        E'Dear {{vendorName}},\n\nThank you for participating in tender {{tenderReference}} ("{{tenderTitle}}").\n\nAfter careful technical and commercial evaluation, the award has been made to another vendor. We appreciate the time and effort invested in your submission and encourage you to participate in future opportunities.\n\nYou can view your bid status on the vendor portal:\n  {{vendorPortalUrl}}/bids/{{bidId}}\n\nCTMP\n',
        'EMAIL',
        'en',
        TRUE
    )
ON CONFLICT (code) DO NOTHING;

COMMIT;
