# Database

This folder owns the PostgreSQL implementation.

Planned structure:

```text
migrations/     Versioned schema migrations
seeds/          Reference and development seed data
docs/           ERD notes and database decisions
```

Priority tables:

- departments
- users
- roles
- permissions
- vendors
- vendor_users
- tenders
- tender_versions
- bids
- bid_envelopes
- bid_documents
- late_submission_exceptions
- committee_sessions
- committee_opening_records
- workflow_templates
- workflow_instances
- audit_logs
- file_integrity_checks

