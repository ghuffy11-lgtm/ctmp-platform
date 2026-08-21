-- 049 (2026-06-26): rewrite notification email copy to be professional and
-- fuller (greeting, context, clear next steps, security notes, signature).
-- Every {{variable}} from the originals is preserved exactly; no new variables
-- are introduced (the renderer blanks unknown ones). Plain-text channel.
-- Idempotent: re-running just re-sets the same copy.

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Committee session — {{tenderReference}}$t$,
  body_template = $b$Dear {{recipientName}},

You are formally invited to attend the evaluation committee session for the tender below. Your participation is important to maintain quorum and ensure a fair, transparent evaluation.

  Tender reference : {{tenderReference}}
  Title            : {{tenderTitle}}
  Date and time    : {{scheduledAt}}
  Location         : {{location}}

Quorum requirement : {{requiredQuorumCount}} members present, including at least one {{requiredRoleCode}}.

What to expect during the session:
  - The committee chair will record attendance at the start.
  - Commercial envelopes are opened only once quorum is confirmed.
  - All deliberations are confidential and recorded in the tender audit trail.

If you are unable to attend or need the session rescheduled, please notify the Procurement team as early as possible so that quorum can be maintained.

Kind regards,
Procurement Team
Hadi Clinic Tendering System

This is an automated message. Please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'COMMITTEE_SESSION_INVITATION';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Technical envelopes opened — {{tenderReference}}$t$,
  body_template = $b$Dear {{evaluatorName}},

The technical envelopes for the following tender have been opened and are ready for your evaluation. Please review each submission against the published technical criteria and record your scores in the platform.

  Tender reference : {{tenderReference}}
  Title            : {{tenderTitle}}
  Department       : {{departmentName}}
  Submissions      : {{submissionCount}}
  Current status   : {{newStatus}}

Begin your evaluation here:
  {{tenderUrl}}

Please note:
  - Commercial envelopes remain sealed and are not visible at this stage.
  - Your scoring and PASS/FAIL decisions are recorded in the tender audit trail.
  - Kindly complete your evaluation promptly so the tender can progress on schedule.

Kind regards,
Procurement Team
{{systemName}}

This is an automated notification — no reply is required.$b$,
  updated_at = now()
WHERE code = 'TECHNICAL_ENVELOPES_OPENED_EVALUATOR';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Technical evaluation finalised — {{tenderReference}}$t$,
  body_template = $b$Dear {{managerName}},

The technical evaluation stage for the tender below has been completed and finalised.

  Tender reference  : {{tenderReference}}
  Title             : {{tenderTitle}}
  Total bids        : {{totalBids}}
  Passed (technical): {{passCount}}
  Failed (technical): {{failCount}}
  Evaluators        : {{evaluatorList}}

The tender has now moved to status {{newStatus}}. The commercial envelopes of technically compliant bids remain sealed and will be opened only during the committee commercial opening session.

Review the full results here:
  {{tenderUrl}}

Kind regards,
Procurement Team
{{systemName}}

This is an automated confirmation — no reply is required.$b$,
  updated_at = now()
WHERE code = 'TECHNICAL_EVALUATION_FINALIZED';

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Outcome of tender {{tenderReference}}$t$,
  body_template = $b$Dear {{vendorName}},

Thank you for participating in the following tender and for the time and effort invested in your submission:

  Tender reference : {{tenderReference}}
  Title            : {{tenderTitle}}

Following a thorough technical and commercial evaluation, we regret to inform you that, on this occasion, the tender has been awarded to another vendor. This outcome is in no way a reflection of our appreciation for your interest, and we sincerely encourage you to participate in future opportunities.

You may review the status of your submission on the vendor portal:
  {{vendorPortalUrl}}/bids/{{bidId}}

We value your continued interest and look forward to the opportunity of working with you in the future.

Kind regards,
Procurement Team
Hadi Clinic Tendering System

This is an automated notification. Please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'TENDER_AWARDED_LOSER';

UPDATE notification_templates SET
  subject_template = $t$[Hadi Clinic Tendering System] Award notification — {{tenderReference}}$t$,
  body_template = $b$Dear {{vendorName}},

Congratulations. We are pleased to inform you that your bid for the following tender has been selected for award:

  Tender reference : {{tenderReference}}
  Title            : {{tenderTitle}}
  Award confirmed  : {{confirmedAt}}
  Confirmed by     : {{confirmedByName}}

Next steps:
  - The Procurement team will contact you directly regarding contract execution and any supporting documentation required.
  - Please ensure your company and contact details on the vendor portal are up to date.
  - This message is a courtesy notification and does not by itself constitute a binding contract; the formal award and contract documents will be issued separately.

Review the official award notice on the vendor portal:
  {{vendorPortalUrl}}/bids/{{bidId}}

Congratulations once again, and we look forward to working with you.

Kind regards,
Procurement Team
Hadi Clinic Tendering System

This is an automated notification. Please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'TENDER_AWARDED_WINNER';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Invitation to bid — {{tenderReference}}: {{tenderTitle}}$t$,
  body_template = $b$Dear {{vendorName}} Team,

You are invited to submit a bid for the following tender. We welcome your participation and look forward to receiving your proposal.

  Tender reference   : {{tenderReference}}
  Title              : {{tenderTitle}}
  Category           : {{tenderCategory}}
  Submission deadline: {{submissionDeadline}}

To participate:
  1. Log in to the vendor portal and open the tender below.
  2. Download and review the tender documents and requirements.
  3. Prepare and upload your technical and commercial submissions before the deadline.

Access the tender here:
  {{tenderUrl}}

If you have any questions about the requirements, please use the Clarifications feature on the tender page so that all responses are properly recorded. Please note that submissions received after the deadline cannot be accepted.

Kind regards,
Procurement Team
{{systemName}}

This is an automated invitation — please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'TENDER_INVITATION_SENT';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Reminder: bid for {{tenderReference}} closes {{submissionDeadline}}$t$,
  body_template = $b$Dear {{vendorName}} Team,

This is a courteous reminder that you have been invited to submit a bid for the following tender, and the submission window is still open:

  Tender reference   : {{tenderReference}}
  Title              : {{tenderTitle}}
  Category           : {{tenderCategory}}
  Submission deadline: {{submissionDeadline}}

If you intend to participate, please complete and submit your bid before the deadline through the vendor portal:
  {{tenderUrl}}

If you have already submitted your bid, kindly disregard this reminder. For any questions, please use the Clarifications feature on the tender page. Submissions received after the deadline cannot be accepted.

Kind regards,
Procurement Team
{{systemName}}

This is an automated reminder — please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'TENDER_INVITATION_REMINDER';

UPDATE notification_templates SET
  subject_template = $t$[{{systemName}}] Negotiation round {{roundNumber}} — {{tenderReference}}$t$,
  body_template = $b$Dear {{vendorName}} Team,

The Procurement team has invited you to take part in a negotiation round for the following tender:

  Tender reference : {{tenderReference}}
  Title            : {{tenderTitle}}
  Negotiation round: {{roundNumber}}

Reason for this negotiation round:
  {{launchReason}}

What you need to do:
  - Log in to the vendor portal and open this bid.
  - Submit a revised commercial proposal, including your per-line BoQ prices and a supporting PDF.
  - Your original submission remains on record; the negotiation submission is added as a new entry.

Access the tender here:
  {{tenderUrl}}

There is no fixed deadline for this round, but we kindly ask that you submit your revised proposal at your earliest convenience. For any questions, please use the Clarifications feature on the tender page.

Kind regards,
Procurement Team
{{systemName}}

This is an automated notification — please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'TENDER_NEGOTIATION_LAUNCHED';

UPDATE notification_templates SET
  subject_template = $t$Verify your vendor account — Hadi Clinic Tendering System$t$,
  body_template = $b$Welcome to the Hadi Clinic Tendering System.

Thank you for registering as a vendor. To activate your account and begin participating in tenders, please confirm your email address by visiting the link below:

  {{verifyUrl}}

If the link does not open, you can enter this verification token manually:
  {{token}}

For your security, this link will expire in 24 hours. If you did not create this account, please disregard this email — no account will be activated without confirmation.

Kind regards,
Procurement Team
Hadi Clinic Tendering System

This is an automated message. Please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'vendor-verify-email';

UPDATE notification_templates SET
  subject_template = $t$Password reset request — Hadi Clinic Tendering System$t$,
  body_template = $b$A password reset was requested for your vendor account on the Hadi Clinic Tendering System.

To set a new password, please visit the link below:
  {{resetUrl}}

If the link does not open, you can enter this reset token manually:
  {{token}}

For your security, this link will expire in 1 hour and can be used only once. If you did not request a password reset, please ignore this email — your current password will remain unchanged. If you receive unexpected reset requests, we recommend reviewing your account security.

Kind regards,
Procurement Team
Hadi Clinic Tendering System

This is an automated message. Please do not reply to this email.$b$,
  updated_at = now()
WHERE code = 'vendor-reset-password';
