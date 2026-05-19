-- =====================================================================
-- CTMP 002_notification_templates.sql
-- Baseline notification templates required by VendorAuthService and
-- the email-verification e2e flow. Idempotent.
-- =====================================================================

BEGIN;

INSERT INTO notification_templates (id, code, name, subject_template, body_template, channel, locale, is_active)
VALUES
    (gen_random_uuid(),
     'vendor-verify-email',
     'Vendor Email Verification',
     'Verify your CTMP vendor account',
     'Welcome to CTMP.' || E'\n\n' ||
     'Please confirm your email address by visiting:' || E'\n' ||
     '{{verifyUrl}}' || E'\n\n' ||
     'Or use this verification token: {{token}}' || E'\n\n' ||
     'This link expires in 24 hours.',
     'EMAIL', 'en', TRUE),

    (gen_random_uuid(),
     'vendor-reset-password',
     'Vendor Password Reset',
     'Reset your CTMP vendor password',
     'A password reset was requested for your CTMP vendor account.' || E'\n\n' ||
     'Reset your password by visiting:' || E'\n' ||
     '{{resetUrl}}' || E'\n\n' ||
     'Or use this reset token: {{token}}' || E'\n\n' ||
     'This link expires in 1 hour. If you did not request this, ignore this message.',
     'EMAIL', 'en', TRUE)
ON CONFLICT (code) DO NOTHING;

COMMIT;
