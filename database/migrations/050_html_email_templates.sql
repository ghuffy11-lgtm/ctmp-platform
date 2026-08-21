-- 050 (2026-06-26): convert notification bodies to HTML content. The API wraps
-- each body in a branded shell (logo header, accent bar, footer with brand +
-- "do not reply"), so templates hold only the inner content. Variable values
-- are HTML-escaped at render time. All original {{variables}} are preserved.
-- Idempotent.

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Committee session — {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{recipientName}},</p>
<p style="margin:0 0 14px;">You are formally invited to attend the evaluation committee session for the tender below. Your participation is important to maintain quorum and ensure a fair, transparent evaluation.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Date &amp; time</td><td style="padding:6px 0;font-weight:600;">{{scheduledAt}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Location</td><td style="padding:6px 0;font-weight:600;">{{location}}</td></tr>
</table>
<div style="margin:0 0 16px;padding:12px 14px;background:#eef6fb;border-left:4px solid #1d6fa5;border-radius:4px;">Quorum requirement: <strong>{{requiredQuorumCount}}</strong> members present, including at least one <strong>{{requiredRoleCode}}</strong>.</div>
<p style="margin:0 0 6px;font-weight:600;">During the session</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>The committee chair will record attendance at the start.</li>
  <li>Commercial envelopes are opened only once quorum is confirmed.</li>
  <li>All deliberations are confidential and recorded in the tender audit trail.</li>
</ul>
<p style="margin:0 0 18px;">If you are unable to attend or need the session rescheduled, please notify the Procurement team as early as possible so that quorum can be maintained.</p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'COMMITTEE_SESSION_INVITATION';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Technical envelopes opened — {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{evaluatorName}},</p>
<p style="margin:0 0 14px;">The technical envelopes for the following tender have been opened and are ready for your evaluation. Please review each submission against the published technical criteria and record your scores in the platform.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Department</td><td style="padding:6px 0;font-weight:600;">{{departmentName}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Submissions</td><td style="padding:6px 0;font-weight:600;">{{submissionCount}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Current status</td><td style="padding:6px 0;font-weight:600;">{{newStatus}}</td></tr>
</table>
<p style="margin:0 0 18px;"><a href="{{tenderUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Begin evaluation</a></p>
<p style="margin:0 0 6px;font-weight:600;">Please note</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>Commercial envelopes remain sealed and are not visible at this stage.</li>
  <li>Your scoring and PASS/FAIL decisions are recorded in the tender audit trail.</li>
  <li>Kindly complete your evaluation promptly so the tender can progress on schedule.</li>
</ul>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TECHNICAL_ENVELOPES_OPENED_EVALUATOR';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Technical evaluation finalised — {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{managerName}},</p>
<p style="margin:0 0 14px;">The technical evaluation stage for the tender below has been completed and finalised.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Total bids</td><td style="padding:6px 0;font-weight:600;">{{totalBids}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Passed (technical)</td><td style="padding:6px 0;font-weight:600;color:#15803d;">{{passCount}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Failed (technical)</td><td style="padding:6px 0;font-weight:600;color:#b91c1c;">{{failCount}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Evaluators</td><td style="padding:6px 0;font-weight:600;">{{evaluatorList}}</td></tr>
</table>
<p style="margin:0 0 16px;">The tender has now moved to status <strong>{{newStatus}}</strong>. The commercial envelopes of technically compliant bids remain sealed and will be opened only during the committee commercial opening session.</p>
<p style="margin:0 0 18px;"><a href="{{tenderUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Review results</a></p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TECHNICAL_EVALUATION_FINALIZED';

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Outcome of tender {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{vendorName}},</p>
<p style="margin:0 0 14px;">Thank you for participating in the following tender and for the time and effort invested in your submission:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
</table>
<p style="margin:0 0 14px;">Following a thorough technical and commercial evaluation, we regret to inform you that, on this occasion, the tender has been awarded to another vendor. This outcome is in no way a reflection of our appreciation for your interest, and we sincerely encourage you to participate in future opportunities.</p>
<p style="margin:0 0 18px;"><a href="{{vendorPortalUrl}}/bids/{{bidId}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View your submission</a></p>
<p style="margin:0 0 18px;">We value your continued interest and look forward to the opportunity of working with you in the future.</p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TENDER_AWARDED_LOSER';

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Award notification — {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{vendorName}},</p>
<div style="margin:0 0 16px;padding:14px 16px;background:#ecfdf3;border-left:4px solid #15803d;border-radius:4px;"><strong style="color:#15803d;">Congratulations.</strong> We are pleased to inform you that your bid for the following tender has been selected for award.</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Award confirmed</td><td style="padding:6px 0;font-weight:600;">{{confirmedAt}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Confirmed by</td><td style="padding:6px 0;font-weight:600;">{{confirmedByName}}</td></tr>
</table>
<p style="margin:0 0 6px;font-weight:600;">Next steps</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>The Procurement team will contact you directly regarding contract execution and any supporting documentation required.</li>
  <li>Please ensure your company and contact details on the vendor portal are up to date.</li>
  <li>This message is a courtesy notification and does not by itself constitute a binding contract; the formal award and contract documents will be issued separately.</li>
</ul>
<p style="margin:0 0 18px;"><a href="{{vendorPortalUrl}}/bids/{{bidId}}" style="display:inline-block;padding:11px 22px;background:#15803d;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View award notice</a></p>
<p style="margin:0;">Congratulations once again, and we look forward to working with you.<br><br>Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TENDER_AWARDED_WINNER';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Invitation to bid — {{tenderReference}}: {{tenderTitle}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{vendorName}} Team,</p>
<p style="margin:0 0 14px;">You are invited to submit a bid for the following tender. We welcome your participation and look forward to receiving your proposal.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Category</td><td style="padding:6px 0;font-weight:600;">{{tenderCategory}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Submission deadline</td><td style="padding:6px 0;font-weight:600;color:#b45309;">{{submissionDeadline}}</td></tr>
</table>
<p style="margin:0 0 6px;font-weight:600;">How to participate</p>
<ol style="margin:0 0 14px;padding-left:20px;">
  <li>Log in to the vendor portal and open the tender.</li>
  <li>Download and review the tender documents and requirements.</li>
  <li>Prepare and upload your technical and commercial submissions before the deadline.</li>
</ol>
<p style="margin:0 0 18px;"><a href="{{tenderUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Open the tender</a></p>
<p style="margin:0 0 18px;">If you have any questions about the requirements, please use the Clarifications feature on the tender page so that all responses are properly recorded. Please note that submissions received after the deadline cannot be accepted.</p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TENDER_INVITATION_SENT';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Reminder: bid for {{tenderReference}} closes {{submissionDeadline}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{vendorName}} Team,</p>
<p style="margin:0 0 14px;">This is a courteous reminder that you have been invited to submit a bid for the following tender, and the submission window is still open:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Category</td><td style="padding:6px 0;font-weight:600;">{{tenderCategory}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Submission deadline</td><td style="padding:6px 0;font-weight:600;color:#b45309;">{{submissionDeadline}}</td></tr>
</table>
<p style="margin:0 0 18px;">If you intend to participate, please complete and submit your bid before the deadline through the vendor portal.</p>
<p style="margin:0 0 18px;"><a href="{{tenderUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Submit your bid</a></p>
<p style="margin:0 0 18px;">If you have already submitted your bid, kindly disregard this reminder. For any questions, please use the Clarifications feature on the tender page. Submissions received after the deadline cannot be accepted.</p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TENDER_INVITATION_REMINDER';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Negotiation round {{roundNumber}} — {{tenderReference}}$t$,
  body_template = $b$<p style="margin:0 0 14px;">Dear {{vendorName}} Team,</p>
<p style="margin:0 0 14px;">The Procurement team has invited you to take part in a negotiation round for the following tender:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px;">
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">Tender reference</td><td style="padding:6px 0;font-weight:600;">{{tenderReference}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Title</td><td style="padding:6px 0;font-weight:600;">{{tenderTitle}}</td></tr>
  <tr><td style="padding:6px 14px 6px 0;color:#6b7280;vertical-align:top;">Negotiation round</td><td style="padding:6px 0;font-weight:600;">{{roundNumber}}</td></tr>
</table>
<div style="margin:0 0 16px;padding:12px 14px;background:#eef6fb;border-left:4px solid #1d6fa5;border-radius:4px;"><strong>Reason for this round:</strong><br>{{launchReason}}</div>
<p style="margin:0 0 6px;font-weight:600;">What you need to do</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>Log in to the vendor portal and open this bid.</li>
  <li>Submit a revised commercial proposal, including your per-line BoQ prices and a supporting PDF.</li>
  <li>Your original submission remains on record; the negotiation submission is added as a new entry.</li>
</ul>
<p style="margin:0 0 18px;"><a href="{{tenderUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Open the tender</a></p>
<p style="margin:0 0 18px;">There is no fixed deadline for this round, but we kindly ask that you submit your revised proposal at your earliest convenience. For any questions, please use the Clarifications feature on the tender page.</p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  updated_at = now()
WHERE code = 'TENDER_NEGOTIATION_LAUNCHED';

UPDATE notification_templates SET
  subject_template = $t$Verify your vendor account — Hadi Clinic Tendering System$t$,
  body_template = $b$<p style="margin:0 0 14px;">Welcome to the Hadi Clinic Tendering System.</p>
<p style="margin:0 0 14px;">Thank you for registering as a vendor. To activate your account and begin participating in tenders, please confirm your email address using the button below:</p>
<p style="margin:0 0 16px;"><a href="{{verifyUrl}}" style="display:inline-block;padding:12px 24px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Verify my email</a></p>
<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 14px;word-break:break-all;"><a href="{{verifyUrl}}" style="color:#1d6fa5;">{{verifyUrl}}</a></p>
<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Or enter this verification token manually:</p>
<p style="margin:0 0 16px;"><code style="display:inline-block;padding:8px 12px;background:#f3f4f6;border:1px solid #e3e7eb;border-radius:4px;font-size:14px;">{{token}}</code></p>
<p style="margin:0;color:#6b7280;font-size:13px;">For your security, this link expires in 24 hours. If you did not create this account, please disregard this email — no account will be activated without confirmation.</p>$b$,
  updated_at = now()
WHERE code = 'vendor-verify-email';

UPDATE notification_templates SET
  subject_template = $t$Password reset request — Hadi Clinic Tendering System$t$,
  body_template = $b$<p style="margin:0 0 14px;">A password reset was requested for your vendor account on the Hadi Clinic Tendering System.</p>
<p style="margin:0 0 16px;">To set a new password, please use the button below:</p>
<p style="margin:0 0 16px;"><a href="{{resetUrl}}" style="display:inline-block;padding:12px 24px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Reset my password</a></p>
<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 14px;word-break:break-all;"><a href="{{resetUrl}}" style="color:#1d6fa5;">{{resetUrl}}</a></p>
<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Or enter this reset token manually:</p>
<p style="margin:0 0 16px;"><code style="display:inline-block;padding:8px 12px;background:#f3f4f6;border:1px solid #e3e7eb;border-radius:4px;font-size:14px;">{{token}}</code></p>
<p style="margin:0;color:#6b7280;font-size:13px;">For your security, this link expires in 1 hour and can be used only once. If you did not request a password reset, please ignore this email — your current password will remain unchanged.</p>$b$,
  updated_at = now()
WHERE code = 'vendor-reset-password';
