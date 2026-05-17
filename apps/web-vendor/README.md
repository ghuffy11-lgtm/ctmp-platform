# Vendor Portal

External vendor-facing portal.

Recommended stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Shared UI package

Priority screens:

```text
Vendor Login
Vendor Registration with CAPTCHA
Email Verification
Forgot Password
Reset Password
Vendor Dashboard
Tender Invitations
Public Tenders
Tender Detail
Clarification Center
Bid Submission Wizard
Submission Receipt
Company Profile
Document Repository
```

Important UX rules:

- Vendor sees only their own company data.
- Vendor cannot see other vendors' clarifications, submissions, prices, or documents.
- Bid submission must clearly separate technical and commercial envelopes.
- Submission receipt must show timestamp, receipt number, and checksum references.
- Submitted bid must appear locked/immutable.

