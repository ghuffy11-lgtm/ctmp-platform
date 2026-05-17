# API App

Backend application area.

Recommended stack from project documents:

- NestJS
- TypeScript
- PostgreSQL
- Redis
- JWT/session support
- AD integration for internal users
- Vendor email/password auth
- Swagger/OpenAPI

Primary modules:

```text
auth
vendor-auth
users
roles
permissions
departments
vendors
tenders
clarifications
bids
bid-envelopes
technical-evaluations
committee-sessions
commercial-evaluations
awards
workflows
notifications
reports
audit
system-config
```

Critical backend controls:

- Do not expose commercial files through generic document routes.
- Technical envelope access starts after `Submission Closed`.
- Commercial envelope opens only through committee session service.
- Commercial visibility requires explicit permissions after opening.
- All sensitive actions require audit records.

