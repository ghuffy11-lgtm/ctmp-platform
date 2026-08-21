# CTMP Implementation Specification

## 1. Project Overview

The Corporate Tender Management Platform (CTMP) is an on-premises enterprise procurement platform for managing tender creation, vendor participation, bid submission, technical evaluation, commercial opening, award recommendation, reporting, and audit compliance.

The platform supports one company with department-based segregation. It includes internal procurement users and external vendor users. Internal users authenticate through Active Directory. Vendor users authenticate through email/password with optional MFA.

## 2. Deployment Direction

- Deployment model: On-premises.
- Initial runtime: Docker-based deployment.
- Kubernetes: Future production scaling option, not required from day one.
- Notifications: Internal Exchange SMTP.
- File storage: On-premises storage path or object-compatible storage, configurable.
- Upload size: Configurable, initially 50 MB.
- Future roadmap: OCR, ERP integration, AI-assisted bid analysis, mobile app.

## 3. Tender Lifecycle

The tender lifecycle uses clear separation between submission closure and final tender closure.

Core states:

```text
Draft
Internal Review
Approved
Published
Clarification Period
Submission Closed
Technical Opening
Technical Evaluation
Commercial Sealed
Committee Commercial Opening
Commercial Evaluation / Comparison
Award Recommendation
Awarded
Tender Closed
Cancelled
Suspended
Archived
```

Definitions:

- `Submission Closed`: Vendor submission period has ended. Normal submissions are blocked. Technical envelopes may be opened.
- `Tender Closed`: The complete tender process is finished after award/completion.
- `Commercial Sealed`: Commercial envelopes remain inaccessible until official committee opening.
- `Committee Commercial Opening`: Authorized committee action that changes commercial envelopes from sealed to opened.

## 4. Tender Visibility

Tenders may be:

- Public to registered vendors.
- Invitation-only for selected vendors.

Vendor visibility rules:

- Vendors only see tenders available to them.
- Vendors cannot see other vendors' bids, clarifications, submissions, prices, or documents.
- Clarification replies are private to the requesting vendor unless the business explicitly marks a clarification as general/public.

## 5. Vendor Management

Vendor management includes:

- Vendor self-registration.
- CAPTCHA-protected registration.
- Email verification.
- Vendor approval/rejection.
- Vendor profile management.
- Vendor document management.
- Vendor suspension.
- Vendor blacklist capability.
- Vendor forgot/reset password.

Vendor registration security:

- Vendor registration must include CAPTCHA.
- CAPTCHA may use text/image challenge or an approved provider such as reCAPTCHA or hCaptcha, depending on on-prem/security policy.
- CAPTCHA validation must happen server-side.
- Registration endpoint must include rate limiting.
- Duplicate company/email checks are required.
- Failed CAPTCHA and suspicious registration attempts are logged.

Vendor password reset:

- Vendor can request password reset from the login page.
- Reset link/token is sent to registered vendor email.
- Token must be single-use.
- Token must expire after configured time.
- Reset flow must use CAPTCHA and/or rate limiting.
- New password must satisfy configured password policy.
- Successful password reset invalidates active vendor sessions.
- Requests and completions are audit logged.

## 6. Bid Submission And Envelopes

Each bid contains separate technical and commercial envelopes.

Submission rules:

- Vendor may submit one bid per tender unless alternative bids are explicitly enabled.
- Submitted bid is immutable.
- Vendor cannot revise after submission.
- Submission generates a receipt.
- Submitted documents are locked.
- Every submitted document receives a SHA-256 checksum.

Envelope rules:

```text
Submitted bid = immutable
Technical envelope = available after Submission Closed
Commercial envelope = sealed until Committee Commercial Opening
```

Technical envelope:

- Cannot be opened before `Submission Closed`.
- Can be opened by assigned technical evaluators after `Submission Closed`.
- Technical evaluation determines pass/fail.
- Only technically passed vendors proceed to commercial comparison.

Commercial envelope:

- Remains sealed after submission.
- Cannot be opened by procurement, admin, evaluator, or vendor before committee opening.
- May be opened only through an official committee commercial opening session.
- Only technically qualified vendors' commercial envelopes are opened.
- Opening must verify file checksums before access.
- Opening must record committee session, attendance, timestamp, actor, remarks, and audit record.

Important distinction:

```text
Commercial opening changes envelope state.
Permissions still control commercial visibility.
```

After committee opening:

- Unauthorized users see only `Commercial Opened` status.
- Users need `commercial:view` to see commercial details.
- Users need `commercial:download` to download commercial files.
- Users need `commercial:evaluate` to evaluate commercial data.
- Every commercial view, download, export, or evaluation is audit logged.
- System Admin does not automatically receive commercial visibility.

## 7. Late Submission Exceptions

Late submission is blocked by default after the submission deadline.

Authorized procurement users may grant late submission exceptions.

Rules:

- Exception must be tender-specific.
- Exception must be vendor-specific.
- Exception must include reason.
- Exception must include expiry time.
- Exception must record granting user.
- Optional approval workflow may be required depending on configuration.
- Late bid is marked as `Late Submitted` or `Late Accepted`.
- Late submission must appear in reports and evaluation screens.
- Exception and resulting submission are audit logged.
- Late submission should not be granted after technical opening has started unless an emergency override policy is explicitly configured.

Suggested exception data:

```text
late_submission_exceptions
- id
- tender_id
- vendor_id
- granted_by
- granted_at
- reason
- expires_at
- status
- approval_workflow_instance_id
- audit_log_id
```

## 8. Approval Workflow

Approval workflows are configurable by:

- Tender type.
- Department.
- Budget range.
- Procurement category.

Workflow characteristics:

- Sequential approval.
- Parallel approval.
- Required comments for rejection.
- Optional comments for approval.
- Configurable award approval route.
- Optional late submission exception approval.

Main approval flows:

- Tender creation approval.
- Tender publishing approval.
- Late submission exception approval.
- Technical result finalization.
- Award recommendation approval.
- Award finalization.

## 9. Committee Commercial Opening

Commercial opening requires a formal committee session.

Committee session must record:

- Tender.
- Session date/time.
- Committee members.
- Attendance.
- Technically qualified vendor list.
- Checksum verification results.
- Envelopes opened.
- Opening remarks/minutes.
- Opening timestamp.
- Actor/user who triggered opening.

The committee opening screen must show:

- Tender summary.
- Committee session details.
- Attendance list.
- Technically qualified vendors.
- Commercial envelope status per vendor.
- Checksum verification status.
- Opening remarks.
- Opening record export.

Commercial opening must not expose commercial details to unauthorized users.

## 10. Roles

Baseline roles:

```text
System Admin
Procurement Admin
Procurement Officer
Department Requester
Approver
Technical Evaluator
Commercial Evaluator
Commercial Committee Member
Finance Reviewer
Legal Reviewer
Executive Viewer
Vendor Admin
Vendor User
Auditor
```

Role principles:

- System Admin can configure platform settings but does not automatically view commercial bid content.
- Procurement Admin can manage tenders, vendors, workflows, exceptions, and publishing, subject to permissions.
- Technical Evaluator can open/view/evaluate technical envelopes only.
- Commercial Evaluator can view/evaluate commercial envelopes only after committee opening and only with explicit permission.
- Committee Member can participate in assigned committee sessions.
- Auditor has read-only audit/report access, with commercial access separately permissioned if required.
- Vendor users can access only their own organization, tenders, bids, clarifications, and documents.

## 11. Permissions

Suggested granular permissions:

```text
vendor:view
vendor:create
vendor:approve
vendor:reject
vendor:suspend
vendor:blacklist
vendor:edit_profile
vendor:review_documents

tender:create
tender:edit
tender:view
tender:approve
tender:publish
tender:cancel
tender:close_submission
tender:archive

clarification:create
clarification:reply
clarification:view_internal
clarification:view_vendor_own

bid:submit
bid:view_metadata

technical:view
technical:open
technical:evaluate
technical:finalize

commercial:view_status
commercial:open_committee
commercial:view
commercial:download
commercial:evaluate
commercial:export

late_submission:grant
late_submission:approve
late_submission:view

committee:create_session
committee:record_attendance
committee:open_commercial
committee:view_minutes
committee:export_minutes

award:recommend
award:approve
award:finalize

reports:view
reports:export
audit:view
audit:export

system:configure
roles:manage
permissions:manage
notification_templates:manage
```

## 12. Database Model

Core domains:

```text
Organization
- departments
- users
- roles
- permissions
- user_roles
- user_departments

Vendors
- vendors
- vendor_users
- vendor_registration_requests
- vendor_email_verification_tokens
- vendor_password_reset_tokens
- vendor_documents
- vendor_status_history

Tenders
- tenders
- tender_versions
- tender_documents
- tender_vendors
- tender_clarifications
- tender_clarification_replies

Bids
- bids
- bid_envelopes
- bid_documents
- bid_submission_receipts
- late_submission_exceptions

Evaluations
- technical_evaluations
- technical_evaluation_scores
- commercial_evaluations
- commercial_comparisons

Committee
- committee_sessions
- committee_members
- committee_attendance
- committee_opening_records

Workflow
- workflow_templates
- workflow_steps
- workflow_instances
- workflow_tasks
- approval_actions

Audit And Security
- audit_logs
- file_integrity_checks
- security_alerts
- captcha_verification_logs
- notification_logs
```

Important relationships:

```text
tenders 1 -> many bids
vendors 1 -> many bids
bids 1 -> many bid_envelopes
bid_envelopes 1 -> many bid_documents
committee_sessions 1 -> many committee_opening_records
workflow_instances 1 -> many workflow_tasks
```

Envelope table concept:

```text
bid_envelopes
- id
- bid_id
- envelope_type: TECHNICAL | COMMERCIAL
- status: DRAFT | SUBMITTED | SEALED | OPENED | LOCKED
- submitted_at
- opened_at
- opened_by
- committee_session_id
- hash_verified_at
```

Document table concept:

```text
bid_documents
- id
- bid_envelope_id
- storage_key
- original_filename
- mime_type
- file_size
- checksum_sha256
- uploaded_at
- submitted_at
- locked_at
```

## 13. API Contract

Core endpoint groups:

```text
Auth
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
POST /api/v1/auth/mfa/verify

Vendor Auth
POST /api/v1/vendor-auth/register
POST /api/v1/vendor-auth/verify-email
POST /api/v1/vendor-auth/forgot-password
POST /api/v1/vendor-auth/reset-password
POST /api/v1/vendor-auth/mfa/verify

Tenders
GET /api/v1/tenders
POST /api/v1/tenders
GET /api/v1/tenders/{tenderId}
PATCH /api/v1/tenders/{tenderId}
POST /api/v1/tenders/{tenderId}/submit-for-approval
POST /api/v1/tenders/{tenderId}/publish
POST /api/v1/tenders/{tenderId}/cancel
POST /api/v1/tenders/{tenderId}/close-submissions

Clarifications
POST /api/v1/tenders/{tenderId}/clarifications
GET /api/v1/tenders/{tenderId}/clarifications
POST /api/v1/clarifications/{clarificationId}/reply

Bids
POST /api/v1/tenders/{tenderId}/bids/draft
PUT /api/v1/bids/{bidId}/technical-envelope
PUT /api/v1/bids/{bidId}/commercial-envelope
POST /api/v1/bids/{bidId}/submit
GET /api/v1/bids/{bidId}/receipt

Late Submission
POST /api/v1/tenders/{tenderId}/late-submission-exceptions
GET /api/v1/tenders/{tenderId}/late-submission-exceptions

Technical Evaluation
POST /api/v1/tenders/{tenderId}/technical-opening
GET /api/v1/tenders/{tenderId}/technical-evaluations
POST /api/v1/bids/{bidId}/technical-evaluations
POST /api/v1/tenders/{tenderId}/finalize-technical-results

Committee / Commercial Opening
POST /api/v1/tenders/{tenderId}/committee-sessions
POST /api/v1/committee-sessions/{sessionId}/attendance
POST /api/v1/committee-sessions/{sessionId}/open-commercial-envelopes
GET /api/v1/committee-sessions/{sessionId}/opening-records

Commercial Evaluation
GET /api/v1/tenders/{tenderId}/commercial-comparison
POST /api/v1/bids/{bidId}/commercial-evaluations

Award
POST /api/v1/tenders/{tenderId}/award-recommendation
POST /api/v1/tenders/{tenderId}/award-approval
POST /api/v1/tenders/{tenderId}/award

Audit
GET /api/v1/audit-logs
GET /api/v1/tenders/{tenderId}/audit-logs
```

API enforcement rules:

- No generic endpoint should open commercial documents.
- Commercial opening must only happen through committee session endpoints.
- File download endpoints must check envelope state and user permission.
- Technical opening must not expose commercial envelope content.
- Late bid submission requires an active exception.
- All state-changing endpoints write audit records.

## 14. Frontend Screens

Internal portal:

```text
Dashboard
Tender List
Tender Create/Edit
Tender Detail
Approval Queue
Clarification Center
Technical Evaluation Workspace
Committee Commercial Opening Screen
Commercial Comparison Screen
Award Recommendation Screen
Vendor Management
Reports
Audit Log Viewer
System Configuration
```

Vendor portal:

```text
Vendor Login
Vendor Registration
Vendor Email Verification
Forgot Password / Reset Password
Vendor Dashboard
Tender Invitations / Public Tenders
Tender Detail
Clarification Center
Bid Submission Wizard
Submission Receipt
Company Profile
Document Repository
```

Commercial comparison screen rules:

- Shows only technically passed vendors.
- Shows commercial details only to authorized users.
- Unauthorized users see status only.
- Price, documents, downloads, scoring, and exports require explicit permissions.
- Sensitive actions are audit logged.

## 15. Audit And Compliance

Audit model:

```text
Append-only, tamper-evident, exportable, retention-controlled.
```

Required audit event areas:

```text
Authentication
Tender Lifecycle
Bid Submission
Envelope Opening
Late Submission Exceptions
Committee Sessions
Technical Evaluation
Commercial Evaluation
Award
Commercial Views/Downloads/Exports
Permission Changes
Configuration Changes
File Integrity Checks
Unauthorized Access Attempts
Emergency Overrides
```

Audit log fields:

```text
id
event_type
actor_user_id
actor_vendor_user_id
actor_role
entity_type
entity_id
tender_id
vendor_id
bid_id
ip_address
user_agent
event_time
before_value
after_value
reason
metadata_json
risk_level
hash_chain_value
```

Compliance rules:

- Audit logs are append-only.
- Audit logs cannot be edited through the application.
- Sensitive commercial access is always audited.
- Every approval/rejection records actor, timestamp, and comments where required.
- Every late submission exception requires reason.
- Every emergency override requires reason and elevated permission.
- File checksums are generated at submission and verified before opening.
- Audit retention policy is configurable.
- Audit export is available for authorized auditors.
- ISO 27001 alignment is required.

## 16. Reporting

Dashboards:

```text
Executive dashboard
Tender status dashboard
Pending approvals dashboard
```

Operational reports:

```text
Tender status report
Vendor participation report
Technical evaluation report
Commercial comparison report
Late submission exception report
Committee commercial opening report
Audit report
Procurement savings report
```

Export rules:

- Excel export for operational reports.
- PDF export for official tender and committee records.
- Commercial comparison export requires commercial export permission.
- Sensitive exports are audit logged.
- Reports respect department segregation and user permissions.

Savings calculation:

```text
Estimated budget - awarded amount
```

Optional future calculations:

```text
Lowest technically qualified bid vs awarded amount
Historical baseline vs awarded amount
```

## 17. Notifications

Primary channel:

```text
Internal Exchange SMTP
```

Notification areas:

```text
Approvals
Tender publishing
Vendor invitations
Clarifications
Bid receipts
Late submission exceptions
Technical evaluation assignments
Committee commercial opening
Award recommendation and award notices
Security and audit alerts
```

Notification rules:

- Templates are configurable.
- Failed email delivery is logged.
- Sensitive notices do not include commercial prices or confidential bid contents.
- Vendor emails include only information relevant to that vendor.
- Internal users receive notifications based on assignments and permissions.
- Sensitive emails link users back to the secured platform.

## 18. System Configuration

Configurable areas:

```text
Departments
Tender types
Procurement categories
Budget ranges
Committee groups
Approval workflow templates
Late submission exception rules
Technical scoring templates
Commercial comparison formulas
Password policy
Vendor MFA policy
Session timeout
Role and permission matrix
Upload size
Allowed file types
SMTP settings
Notification templates
Audit retention
Backup schedule
Log retention
Maintenance mode
```

Configuration control:

- Every configuration change must be audited.
- Before/after values must be recorded.
- System configuration does not grant commercial visibility by default.

## 19. MVP Scope

MVP modules:

```text
1. Authentication & Users
2. Organization Setup
3. Vendor Management
4. Vendor Registration Security
5. Tender Management
6. Bid Submission
7. Technical Evaluation
8. Committee Commercial Opening
9. Commercial Evaluation & Award
10. Audit & Reports
11. Notifications
12. System Configuration
```

Included in MVP:

- AD login for internal users.
- Vendor email/password login.
- Vendor registration with CAPTCHA.
- Vendor forgot/reset password.
- Roles and permissions.
- Departments and tender categories.
- Vendor approval/rejection/suspension/blacklist.
- Tender creation and publishing.
- Public/invitation-only tenders.
- Clarifications.
- Technical/commercial envelopes.
- Immutable submissions.
- Late submission exceptions.
- Technical evaluation.
- Committee commercial opening.
- Permission-controlled commercial visibility.
- Award recommendation and approval.
- Audit logs.
- Executive dashboard and core reports.
- Excel/PDF exports.
- Exchange SMTP notifications.

Out of MVP:

- ERP integration.
- AI-assisted bid analysis.
- OCR.
- Mobile application.
- Microsoft Teams integration.
- SMS notifications.
- Kubernetes production rollout.
- Advanced BI/data warehouse.

## 20. Critical Implementation Principles

- Business workflow must be configurable where rules may change.
- Commercial confidentiality must be permission-controlled.
- Commercial envelope state and commercial visibility are separate concerns.
- Submitted documents must be immutable.
- File integrity must be verifiable through checksums.
- Sensitive operations must be audit logged.
- System Admin must not bypass procurement confidentiality by default.
- The platform must make exceptions visible, traceable, and reportable.
