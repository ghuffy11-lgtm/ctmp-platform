# Phase 2 API Contract Review

**File reviewed:** `api-contracts/openapi/ctmp.openapi.yaml`
**Reviewed by:** Claude Sonnet 4.6, 2026-05-17
**Review format:** see `agents/reviews/README.md`

Overall assessment: the contract covers all required endpoint groups, the commercial-opening guardrail is correctly documented, and CAPTCHA is correctly enforced. The issues below must be resolved or acknowledged before backend scaffold produces code that conflicts with this contract.

---

## Issues

---

### [REVIEW-001] `/auth/refresh` inherits global bearerAuth — should be unauthenticated

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 58–74
**Raised by:** Claude, 2026-05-17
**Status:** `BLOCKING`

**Observation:**
The global security block at line 27–28 sets `bearerAuth: []` on all endpoints. `/auth/refresh` has no `security: []` override. The endpoint body schema (`RefreshTokenRequest`) carries `refreshToken` as the credential.

```yaml
/auth/refresh:
  post:
    summary: Refresh an access token
    # no security: [] override — inherits bearerAuth
    requestBody:
      schema:
        $ref: '#/components/schemas/RefreshTokenRequest'
```

**Risk if unresolved:**
The contract declares that a valid bearer token is required to call the refresh endpoint. Clients call refresh precisely because the access token has expired. The backend developer will be forced to special-case this endpoint outside the auth middleware (contradicting the contract), or the frontend will receive 401 when trying to refresh an expired session — causing an infinite logout loop.

**Proposed resolution:**
Add `security: []` to `/auth/refresh`. The refresh token in the request body is the sole credential; no bearer token should be required.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-002] `/auth/mfa/verify` inherits global bearerAuth — should be unauthenticated

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 75–91
**Raised by:** Claude, 2026-05-17
**Status:** `BLOCKING`

**Observation:**
`/auth/mfa/verify` has no `security: []` override. MFA verify is called mid-login after the password step succeeds and a challenge is issued, but before the access token is issued. The sibling `/vendor-auth/mfa/verify` (line 163) correctly has `security: []`.

```yaml
/auth/mfa/verify:
  post:
    summary: Verify internal MFA challenge
    # no security: [] override — inconsistent with /vendor-auth/mfa/verify
```

**Risk if unresolved:**
An internal user who has MFA enabled cannot complete login. They have no access token at the point they call this endpoint. Backend will either reject the request (401) or add a silent carve-out not described in the contract.

**Proposed resolution:**
Add `security: []` to `/auth/mfa/verify`. The `challengeId` field in `MfaVerifyRequest` is the session credential at this step.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-003] No vendor login endpoint (`POST /vendor-auth/login` is missing)

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` — Vendor Auth section, lines 93–180
**Raised by:** Claude, 2026-05-17
**Status:** `BLOCKING`

**Observation:**
The Vendor Auth group defines: register, verify-email, forgot-password, reset-password, mfa/verify. There is no login endpoint. Internal users log in via `POST /auth/login` (line 30). No equivalent exists for vendor users.

**Risk if unresolved:**
Vendor users cannot authenticate. The entire vendor portal is non-functional. Any backend auth module built against this contract will have no route for vendor session creation.

**Proposed resolution:**
Add `POST /vendor-auth/login` with `security: []`. It should accept email + password (and optionally return a MFA challenge or full `AuthTokenResponse`). Pattern it after `POST /auth/login`.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-004] `TenderStatus` enum uses human-readable strings with spaces; all other enums use SCREAMING_SNAKE_CASE

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 1041–1060
**Raised by:** Claude, 2026-05-17
**Status:** `BLOCKING`

**Observation:**
Every enum in the contract uses `SCREAMING_SNAKE_CASE`: `BidStatus`, `EnvelopeStatus`, `EnvelopeType`, `VendorStatus`, `LateSubmissionException.status`, `CommitteeSession.status`, `AwardRecommendation.status`. `TenderStatus` alone uses human-readable strings:

```yaml
TenderStatus:
  type: string
  enum:
    - Draft
    - Internal Review
    - Approved
    - Published
    - Clarification Period
    - Submission Closed
    - Technical Opening
    - Technical Evaluation
    - Commercial Sealed
    - Committee Commercial Opening
    - Commercial Evaluation / Comparison   # contains "/" and spaces
    - Award Recommendation
    - Awarded
    - Tender Closed
    - Cancelled
    - Suspended
    - Archived
```

The value `"Commercial Evaluation / Comparison"` contains a forward slash. This will break code generators (TypeScript enums, Java enums, Python enums), switch/case logic, and URL query param encoding (`GET /tenders?status=Commercial+Evaluation+%2F+Comparison`).

**Risk if unresolved:**
Backend and frontend code generators will produce inconsistent enum types. The status filter on `GET /tenders` will require URL-encoding a slash. Database seeds and migration enum values may diverge from the wire format. Any code that compares tender status strings will be fragile.

**Proposed resolution:**
Convert all `TenderStatus` values to `SCREAMING_SNAKE_CASE`:
`DRAFT`, `INTERNAL_REVIEW`, `APPROVED`, `PUBLISHED`, `CLARIFICATION_PERIOD`, `SUBMISSION_CLOSED`, `TECHNICAL_OPENING`, `TECHNICAL_EVALUATION`, `COMMERCIAL_SEALED`, `COMMITTEE_COMMERCIAL_OPENING`, `COMMERCIAL_EVALUATION`, `AWARD_RECOMMENDATION`, `AWARDED`, `TENDER_CLOSED`, `CANCELLED`, `SUSPENDED`, `ARCHIVED`.
Also verify that the PostgreSQL `tender_status` enum in `001_initial_schema.sql` matches the chosen wire format.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-005] `TenderUpdateRequest` inherits all required fields from `TenderCreateRequest` — incompatible with PATCH semantics

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 1125–1127; endpoint at line 234
**Raised by:** Claude, 2026-05-17
**Status:** `RECOMMENDED`

**Observation:**
```yaml
TenderUpdateRequest:
  allOf:
    - $ref: '#/components/schemas/TenderCreateRequest'
```
`TenderCreateRequest` has `required: [title, visibility, submissionDeadline]`. The `allOf` inherits those required fields. `PATCH /tenders/{tenderId}` uses `TenderUpdateRequest`, meaning every patch request must supply all three fields even if only one field is changing.

**Risk if unresolved:**
Frontend cannot do partial saves (e.g. update only the title). Backend developers may silently override the contract and accept partial bodies anyway, causing the contract to lie about what the API accepts.

**Proposed resolution:**
Define `TenderUpdateRequest` as a standalone schema with the same properties as `TenderCreateRequest` but with no `required` array (all fields optional). Alternatively, change the endpoint from `PATCH` to `PUT` if full-replacement semantics are intended — but that is a separate decision.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-006] `CommercialOpeningRequest.confirmChecksumVerification` is optional — compliance risk

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 1449–1454
**Raised by:** Claude, 2026-05-17
**Status:** `NEEDS-PM-DECISION`

**Observation:**
```yaml
CommercialOpeningRequest:
  type: object
  required: [remarks]
  properties:
    remarks:
      type: string
    confirmChecksumVerification:
      type: boolean   # not in required[]
```
The `confirmChecksumVerification` field is not in `required`. The endpoint description states it "verifies checksums before access". If the backend must verify checksums regardless of whether this flag is sent, the field is redundant. If the field is a committee operator's explicit confirmation, it should be required for compliance and audit purposes.

**Risk if unresolved:**
A backend developer may implement the flag as a skip-verification shortcut (set to false = skip) rather than a mandatory confirmation. In a procurement compliance context this is a material risk.

**Proposed resolution:**
Decision required: Is `confirmChecksumVerification` (a) a mandatory committee confirmation checkbox that must be `true` before the server proceeds, (b) informational metadata recorded in the opening record, or (c) redundant because the server always verifies regardless? If (a), add it to `required` and have the backend reject requests where it is `false`. If (c), remove the field to avoid confusion.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-007] `AwardRecommendationRequest.recommendedBidId` is not required — ambiguous intent

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 1569–1580
**Raised by:** Claude, 2026-05-17
**Status:** `NEEDS-PM-DECISION`

**Observation:**
```yaml
AwardRecommendationRequest:
  required: [recommendedVendorId, reason]
  properties:
    recommendedVendorId:
      type: string
      format: uuid
    recommendedBidId:       # not required
      type: string
      format: uuid
    reason:
      type: string
```
A vendor may have only one bid per tender, making `recommendedBidId` derivable. But if alternative bids are enabled (`Bid.isAlternative: true`) there could be multiple bids per vendor, and the award recommendation is ambiguous without specifying which bid.

**Risk if unresolved:**
Backend will need to infer the bid from context. If alternative bids are ever used, the contract cannot distinguish which bid was awarded.

**Proposed resolution:**
Decision required: If alternative bids are out of scope for MVP, leave as-is and document that assumption. If alternative bids are in scope, make `recommendedBidId` required.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-008] No file download endpoints — `commercial:download` permission has no matching route

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` — Bids section; global description line 9
**Raised by:** Claude, 2026-05-17
**Status:** `NEEDS-PM-DECISION`

**Observation:**
The contract defines `commercial:download` as a required permission (referenced in endpoint descriptions and in `CommercialComparison.callerCommercialAccess.canDownload`). There are upload endpoints for bid documents (lines 393–436) and tender documents are referenced throughout, but there are no download endpoints for any file type:
- No `GET /tenders/{tenderId}/documents/{documentId}`
- No `GET /bids/{bidId}/documents/{documentId}`
- No commercial document download route

**Risk if unresolved:**
Phase 3 backend developers will invent download endpoint shapes independently, producing routes that are not in the contract and may bypass the commercial permission checks described in the spec. The `commercial:download` permission becomes unenforceable at the contract level.

**Proposed resolution:**
Decision required: What is the file serving strategy? Options: (a) signed URL — API returns a time-limited presigned URL, no streaming; (b) streaming proxy — API streams the file, enforcing permissions per request; (c) deferred to Phase 3 with a placeholder in the contract. At minimum, add placeholder paths with the correct permission notes so Phase 3 has a contract target.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-009] No report job status or result download endpoint

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 820–845
**Raised by:** Claude, 2026-05-17
**Status:** `RECOMMENDED`

**Observation:**
`POST /reports/{reportCode}/export` returns a `ReportExportJob` with `id` and `status` (QUEUED / RUNNING / COMPLETED / FAILED). There is no endpoint to poll the job status or retrieve the completed file:
- No `GET /reports/jobs/{jobId}` for status polling
- No `GET /reports/jobs/{jobId}/download` for result retrieval

**Risk if unresolved:**
Frontend has no way to know when the export is ready or how to retrieve it. Phase 3 will add these endpoints without a contract target, risking inconsistency with the rest of the contract's naming and permission conventions.

**Proposed resolution:**
Add `GET /reports/jobs/{jobId}` returning `ReportExportJob`, and `GET /reports/jobs/{jobId}/download` returning the file (or a signed URL). Both require `reports:export` and `commercial:export` as applicable.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-010] `GET /tenders` has no department or date-range filter

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 183–200
**Raised by:** Claude, 2026-05-17
**Status:** `REFINE-IN-IMPL`

**Observation:**
```yaml
GET /tenders:
  parameters:
    - $ref: '#/components/parameters/Page'
    - $ref: '#/components/parameters/PageSize'
    - name: status
      in: query
      schema:
        $ref: '#/components/schemas/TenderStatus'
```
Only a `status` filter is defined. In a multi-department system, procurement staff will need to filter by department. Vendors need to distinguish PUBLIC vs INVITATION_ONLY. Date range (submissionDeadline before/after) is also a common procurement UX requirement.

**Risk if unresolved:**
Low risk at contract level — query parameters can be added without breaking existing clients. Medium risk for the admin portal UX in Phase 4.

**Proposed resolution:**
Add optional query parameters during Phase 3: `departmentId` (uuid), `visibility` (PUBLIC | INVITATION_ONLY), `submissionDeadlineBefore` (date-time), `submissionDeadlineAfter` (date-time). Can be done without a contract revision if documented in the backend implementation.

**PM/Owner response:** _(leave blank)_

---

### [REVIEW-011] `EnvelopeUploadRequest` array-of-binary in multipart may not generate correctly

**Location:** `api-contracts/openapi/ctmp.openapi.yaml` lines 1251–1259
**Raised by:** Claude, 2026-05-17
**Status:** `REFINE-IN-IMPL`

**Observation:**
```yaml
EnvelopeUploadRequest:
  type: object
  required: [files]
  properties:
    files:
      type: array
      items:
        type: string
        format: binary
```
OpenAPI 3.0 support for an array of binary files in `multipart/form-data` is implementation-dependent. Some code generators and OpenAPI validators emit warnings or produce incorrect client stubs for this pattern. The OpenAPI 3.0 spec recommends using `encoding` hints alongside the schema.

**Risk if unresolved:**
Generated client SDKs or server validation middleware may not handle multi-file uploads correctly. Low immediate risk; surfaces during Phase 3 when NestJS file upload decorators are wired up.

**Proposed resolution:**
Add an `encoding` block alongside the schema in the `multipart/form-data` content entry. Or document the expected form field name explicitly. Can be refined during Phase 3 implementation without rework to other phases.

**PM/Owner response:** _(leave blank)_
