# Agent Work Areas

Use these areas as ownership boundaries for parallel implementation.

## Backend Agent

Primary folders:

- `apps/api/`
- `packages/shared-types/`
- `api-contracts/`

Main concerns:

- Auth
- RBAC
- Tender workflow
- Bid envelopes
- Committee opening
- Audit
- Reports

## Frontend Admin Agent

Primary folders:

- `apps/web-admin/`
- `packages/ui/`

Main concerns:

- Internal dashboard
- Tender management
- Approval queue
- Technical evaluation
- Committee commercial opening
- Commercial comparison
- Reports and audit viewer

## Frontend Vendor Agent

Primary folders:

- `apps/web-vendor/`
- `packages/ui/`

Main concerns:

- Vendor registration with CAPTCHA
- Vendor login/reset password
- Vendor dashboard
- Tender access
- Clarifications
- Bid submission wizard
- Submission receipt

## Database Agent

Primary folders:

- `database/`
- `docs/architecture/`

Main concerns:

- PostgreSQL schema
- Migrations
- Seed data
- Integrity constraints
- Audit log structure

## DevOps Agent

Primary folders:

- `infrastructure/`
- `docs/runbooks/`

Main concerns:

- Docker Compose
- On-prem deployment
- Environment configuration
- Backups
- Logs

## QA Agent

Primary folders:

- `qa/`
- `docs/qa/`

Main concerns:

- Manual test cases
- API tests
- Playwright tests
- UAT scenarios
- Security test checklist

