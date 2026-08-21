-- 051 (2026-06-28): welcome / onboarding email for newly-created internal users.
-- The API (UsersService → NotificationsService.sendRoleWelcome) renders this and
-- attaches the user's role guide PDF when one exists. HTML content only — the
-- branded shell adds the header/footer. Variables: {{userName}} {{roleName}}
-- {{portalUrl}}. Idempotent.

INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
  'USER_WELCOME',
  'User Welcome',
  $t$Welcome to the Hadi Clinic Tendering System$t$,
  $b$<p style="margin:0 0 14px;">Dear {{userName}},</p>
<p style="margin:0 0 14px;">An account has been created for you on the <strong>Hadi Clinic Tendering System</strong>. You have been assigned the role of <strong>{{roleName}}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Your role</td><td style="padding:6px 0;font-weight:600;">{{roleName}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Portal</td><td style="padding:6px 0;font-weight:600;"><a href="{{portalUrl}}" style="color:#1d6fa5;">{{portalUrl}}</a></td></tr>
</table>
<p style="margin:0 0 16px;">Sign in with the credentials provided by your administrator, or with your Active Directory account if your sign-in is AD-based.</p>
<p style="margin:0 0 18px;"><a href="{{portalUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Open the portal</a></p>
<p style="margin:0 0 18px;">Where available, a step-by-step guide for your role is attached to this email to help you get started. If you have any questions, please contact your system administrator.</p>
<p style="margin:0;">Welcome aboard,<br><strong>Procurement Team</strong></p>$b$,
  'EMAIL', 'en', TRUE
)
ON CONFLICT (code) DO NOTHING;
