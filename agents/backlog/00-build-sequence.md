# CTMP Build Sequence

## Phase 0: Foundation

1. Create production PostgreSQL schema.
2. Expand OpenAPI contract.
3. Scaffold backend app.
4. Scaffold admin portal.
5. Scaffold vendor portal.
6. Add Docker Compose for local/on-prem development.

## Phase 1: Identity And Configuration

1. Internal AD authentication integration.
2. Vendor authentication.
3. Vendor registration with CAPTCHA.
4. Vendor email verification.
5. Vendor forgot/reset password.
6. Roles and permissions.
7. Departments, categories, tender types, budget ranges.

## Phase 2: Tender And Vendor Flow

1. Vendor approval/rejection/suspension/blacklist.
2. Tender create/edit/detail.
3. Tender approval workflow.
4. Tender publish as public or invitation-only.
5. Clarification center.

## Phase 3: Bid Submission

1. Vendor bid draft.
2. Technical envelope upload.
3. Commercial envelope upload.
4. Submission receipt.
5. Document locking and SHA-256 checksums.
6. Late submission exceptions.

## Phase 4: Evaluation And Opening

1. Submission closed workflow.
2. Technical opening.
3. Technical evaluation and pass/fail finalization.
4. Committee commercial session.
5. Attendance and checksum verification.
6. Commercial envelope opening.
7. Permission-controlled commercial comparison.

## Phase 5: Award, Audit, Reporting

1. Award recommendation.
2. Award approval/finalization.
3. Append-only audit logs.
4. Executive dashboard.
5. Tender and vendor reports.
6. Commercial opening report.
7. Late submission report.
8. Excel/PDF export.

## Phase 6: Hardening

1. Security review.
2. QA automation.
3. Backup and restore runbooks.
4. Deployment runbook.
5. Performance and UAT preparation.

