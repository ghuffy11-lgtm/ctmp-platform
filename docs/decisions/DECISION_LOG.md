# Decision Log

Record project decisions here so future agents can understand why the system works the way it does.

Add newest decisions at the top.

Decision entry format:

```text
Date:
Decision:
Context:
Options considered:
Outcome:
Impact:
Related files:
```

## Decisions

### 2026-08-24 - Registry invitations for prospective suppliers

Decision:

Procurement can invite a company with no vendor record by email. The invitation is a **general
registry invitation, not tied to a tender**. The link is tokenised (`/register?invite=<token>`) so
the email prefills and conversion is tracked. Retention: revoked and long-expired invitations are
purged; accepted ones are kept.

Context:

The only route onto the platform was unsolicited self-registration. `tender_vendors` cannot
represent an invitee — `vendor_id` is `NOT NULL REFERENCES vendors(id)` — so a new table was
required rather than an extension of the existing tender-invite flow.

Options considered:

- **Tender-scoped invitation** (invite them to bid on a specific tender). Rejected by the owner in
  favour of the general registry invite — it needs auto-linking on approval to be useful, and most
  outreach is "join our supplier list", not "bid on this one thing".
- **Plain link to /register, no token.** Simpler, but gives no way to tell an invitee from a
  passer-by and no conversion signal. Owner chose tokenised.
- **Reuse `tender:edit` for the permission.** Rejected: `SYSTEM_ADMIN` does not hold it, and the
  owner wanted IT able to send invitations. Hence a new `vendor:invite`.

Outcome:

- No stored `EXPIRED` status — expiry is derived. A stored value needs a sweeper, and this platform
  has no scheduler, so it would drift out of sync with the clock.
- One-live-invitation-per-address is a **partial unique index**, not just a service check, so a race
  cannot produce two live links to one inbox.
- Only the SHA-256 of the token is stored. Verified that no invitation audit row contains a token.
- The invited email is locked on the prefilled form, because the address match is what links the
  signup back to the invitation. An explicit "use a different email address" releases it and
  forgoes the linkage.
- Every token failure degrades to the ordinary blank registration form. A dead invite link must
  never block a supplier from registering.

Impact:

**The retention purge is incomplete by design and this is accepted.** The invited address is also
written to `audit_logs`, which is append-only and hash-chained — deleting there would break
verification for every later row. So purging reduces exposure but is not erasure, and a
data-subject request cannot be fully honoured. Owner accepted this explicitly on 2026-08-24.

Related files:

`database/migrations/057_vendor_registry_invitations.sql`,
`apps/api/src/modules/vendors/vendor-invitations.{service,controller}.ts`,
`apps/web-admin/src/components/VendorInvitationsPanel.tsx`,
`apps/web-vendor/src/app/register/page.tsx`,
`scripts/purge_vendor_invitations.sh`

### 2026-08-21 - Validate pre-approval fields at submit, and allow revert from Approved

Decision:

`submitForApproval` now rejects a tender missing `procurementType` or `estimatedBudget`, and
`revert` accepts **Approved** as a source status in addition to Published. The revert target must
be strictly earlier than the current status.

Context:

The end-to-end lifecycle test found that a tender could reach APPROVED without a procurement type
and then be impossible to publish, edit or revert. Publish requires the field; the edit form sends
a visibility-only payload once APPROVED (BUG-122b) and returns without calling the API; the API
rejects `tenderType`; and revert only ran from Published. The only exit was Cancel and rebuild,
losing the BoQ, criteria and approval.

Options considered:

- **Pre-select "Open Tender" on the create form.** One line, but it only hides the common case —
  anyone who clears the radio still reaches the dead end.
- **Validate at submit-for-approval.** Chosen. It fails at the last moment the field is still
  editable, and the message says why it matters.
- **Allow revert from Approved.** Also chosen. It fixes the dead end as a class rather than for
  this one field — any other pre-publish omission is now recoverable.

Owner picked both.

Outcome:

- Only `procurementType` and `estimatedBudget` are enforced at submit. RFQ documents are
  deliberately NOT, because uploads still work in APPROVED and a missing document is recoverable.
- `revert` gained an ordering guard (`Draft < Internal Review < Approved < Published`) so it can
  never move a tender forward or sideways.
- The audit `beforeValue` on revert was hardcoded to `PUBLISHED`; corrected to the real prior
  status, which would have logged falsely once Approved became a valid source.
- `RevertTenderDialog` takes `currentStatus` and offers only earlier targets; the Revert button now
  shows on Approved as well as Published.
- The existing binding-bid guard is untouched — a tender with submitted bids still cannot be
  reverted.

Impact:

Verified on dev: submit without the fields returns a clear message naming both; a tender approved
and then reverted lands in Draft; reverting forward from Draft, and reverting an AWARDED tender,
are both refused.

Related files:

```text
apps/api/src/modules/tenders/tenders.service.ts
apps/web-admin/src/components/dialog/RevertTenderDialog.tsx
apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx
```

### 2026-08-21 - Money columns widened to numeric(16,3); KWD carries fils

Decision:

`tenders.awarded_amount`, `tenders.budget_estimate` and `commercial_evaluations.total_price` were
widened from `numeric(15,2)` to `numeric(16,3)`. Migration `055`.

Context:

The Kuwaiti Dinar has three decimal places (1 KWD = 1000 fils). BoQ quantities, bid line prices and
negotiation totals were already `numeric(15,3)`, but the three columns those feed into were
`numeric(15,2)`. PostgreSQL rounds to nearest on write, silently — so a bid line of `29.998` was
recorded as a `30.00` contract, and a computed total of `84317.499` as `84317.50`. The error could
fall either side of the true figure, up to 5 fils, and the Award Minutes PDF printed the rounded
value as the contract value.

Found during the 2026-08-21 documentation audit, not by a bug report: no award had yet landed on a
fils value, so nothing stored had actually been damaged. One BoQ line on dev already carried fils
(`29.998` on `TDR-2026-0025`, not yet awarded).

Options considered:

- **Leave it.** Defensible while every award is a round figure, but the failure is silent and by the
  time it is noticed the affected awards are historical.
- **Round explicitly in the API** so the behaviour is at least intentional and visible in code.
  Rejected: it makes the wrong answer official and still leaves CTMP unable to record a contract in
  fils.
- **Widen the columns.** Chosen — it was reversible-cost work *only* while no data had been lost.

Outcome:

- Precision 16, not 15: `numeric(15,3)` would allow only 12 whole-dinar digits where `numeric(15,2)`
  allowed 13. `numeric(16,3)` keeps all 13 and adds the fils digit, so no existing value can fall
  out of range.
- Widening scale is non-destructive; values gain a trailing zero. All 63 stored values were compared
  before and after — zero changed numerically.
- Migration is idempotent (guarded on `numeric_scale = 2`) and was rehearsed with `ROLLBACK` before
  being applied.
- **JavaScript float accumulation was investigated and ruled out**, not assumed. The award total is
  built with `reduce` over `Number(...)`, which is the classic `0.1 + 0.2` trap, so it was measured:
  across 20,000 randomised BoQ sets at realistic magnitudes the largest deviation from exact
  integer-fils arithmetic was 1.5e-8 KWD and the third decimal moved in 0 of 20,000 cases. Real but
  negligible; the column type was the entire problem. Do not "fix" the float arithmetic on the
  strength of theory alone.

Impact:

- Award Minutes already formatted with `maximumFractionDigits: 3`, so it prints fils correctly with
  no code change. Same for the Commercial Comparison and awarded-tenders screens.
- `tenders/[id]` and the vendor tender page deliberately show the *estimated* budget with
  `maximumFractionDigits: 0`; that is a display choice and the stored value is unaffected.
- Prisma schema updated to `@db.Decimal(16, 3)` and the API image rebuilt. Verified by writing
  `84317.499` and `29.998` through Prisma and reading them back intact, inside a transaction that
  was rolled back.

Related files:

```text
database/migrations/055_money_precision.sql
apps/api/prisma/schema.prisma
apps/api/src/modules/award/award.service.ts        (boqTotal, line ~268)
apps/api/src/modules/award/award-minutes.service.ts (fmt, line ~486)
```

### 2026-05-19 — Audit chain race closed by `pg_advisory_xact_lock`, not row lock

Date: 2026-05-19
Decision: `AuditService.log()` acquires `pg_advisory_xact_lock(0x6354_4d50)` as the first statement inside its Prisma transaction. Concurrent writers across any number of api replicas serialize through this single lock; whichever replica enters the txn first holds the lock until commit.
Context: The 2026-05-18 decision log noted that "transaction-only" was correct for single-replica deployments but had a chain-fork race under multi-replica load. The original 3 options were A (txn-only), B (`SELECT FOR UPDATE` on the latest audit row), C (serializable isolation). Production-readiness now requires closing the gap.
Options considered:
- D: `pg_advisory_xact_lock` (chosen). Locks a logical resource, not a row. Held only for the audit txn's lifetime. All replicas use the same 32-bit key.
- B: `SELECT FOR UPDATE` on `audit_logs WHERE id = (SELECT max(id) FROM audit_logs)`. Two queries to acquire one lock; race window between the SELECT and the FOR UPDATE.
- C: `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`. Overkill; retry-on-conflict overhead per audit write.
Outcome: D. Lock key `0x6354_4d50` (ASCII "cTMP") so operators see a memorable marker in `pg_locks`. Released automatically at commit/rollback.
Impact: Multi-replica deployments now chain-safe. Lock is process-wide — a single hung audit write blocks every other audit write. Production should add `SET LOCAL lock_timeout = '5s'` before acquisition; tracked as a future improvement.
Related files: `apps/api/src/modules/audit/audit.service.ts`.

### 2026-05-19 — Storage backend abstraction (local + S3); `STORAGE_DRIVER` toggles

Date: 2026-05-19
Decision: All file persistence (reports, bid documents) goes through a `StorageBackend` interface. Two implementations: `LocalStorageBackend` (disk-backed) and `S3StorageBackend` (`@aws-sdk/client-s3`, `forcePathStyle: true`). `STORAGE_DRIVER` env var picks the backend at boot; bid + report storage services delegate via the `STORAGE_BACKEND` DI symbol.
Context: Local-disk storage works on single-host on-prem deploys but blocks multi-node deployments and external backup pipelines. Most enterprise customers will run MinIO on-prem; some will use AWS S3 directly.
Options considered:
- A: Single interface + factory-provider DI (chosen). One symbol injected into both storage services; backend can be replaced at deploy time without code change.
- B: Separate code paths for local vs S3 in each storage service. Duplicate code, easy to drift.
- C: Always use S3 + run MinIO even for single-host dev. Adds a container + cold-start delay; complicates the dev setup.
Outcome: A. `STORAGE_DRIVER=local` (default) on dev; `STORAGE_DRIVER=s3` for prod / multi-node. Bucket auto-create flagged separately (`STORAGE_S3_AUTO_CREATE_BUCKETS`) — on for dev, off for prod (Terraform creates with stricter ACLs).
Impact: One env var swap moves the storage layer. Existing local-disk volumes still work; production migration is a doc step (copy local files into MinIO + flip the flag).
Related files: `apps/api/src/common/storage/*`, `apps/api/src/modules/bids/bid-storage.service.ts`, `apps/api/src/modules/reports/report-storage.service.ts`, `infrastructure/docker/docker-compose.yml` (MinIO sidecar).

### 2026-05-19 — Audit chain verified on api boot; break → CRITICAL security_alerts row

Date: 2026-05-19
Decision: `AuditService.onModuleInit` runs `verifyChain(AUDIT_VERIFY_LIMIT)` on api boot. The check recomputes `SHA-256(prev || canonical(payload))` for the latest N rows and confirms each row's `prev_hash_chain_value` matches the predecessor's `hash_chain_value`. On break, the verifier logs the broken row id + expected vs actual hashes and inserts a CRITICAL `security_alerts` row tagged `AUDIT_CHAIN_BREAK`.
Context: A broken chain is forensically critical but historically silent — only a manual SQL probe would detect it. Production-readiness needs an automatic detection on every cold start.
Options considered:
- A: Verify on boot, limit to last N rows (chosen). Cheap (default 1000 rows). Misses old breaks but catches anything recent.
- B: Full-table verify on boot. Bootstraps slow on large databases. Reserve for an admin tool / scheduled task.
- C: Background scheduled verify with cron. Requires a worker — more moving parts. Defer to a future hardening pass.
Outcome: A by default, with `AUDIT_VERIFY_LIMIT` configurable. Admin tool can call `verifyChain(Number.MAX_SAFE_INTEGER)` for full history when needed.
Impact: Operators see chain breaks in logs immediately + can build a `/security-alerts` admin page that surfaces them. No UI page exists yet — alerts are queryable via SQL until that page lands.
Related files: `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/config/audit.config.ts`.

### 2026-05-19 — Vendor self-service namespaced under `/vendor-auth/me/*`

Date: 2026-05-19
Decision: Vendor-self read/write endpoints live under `/vendor-auth/me/*` rather than `/vendors/{id}/*` (admin scope) or top-level `/me`.
Context: Three new endpoints needed: get own profile, update own profile, list own bids. Existing `/vendors/{id}/*` requires `vendors:read|update|approve` permissions (admin). A vendor session has no such permission. A new namespace was needed.
Options considered:
- A: `/vendor-auth/me/*` (chosen). Co-located with the rest of the vendor-auth surface; matches the vendor JWT guard's natural scope.
- B: Top-level `/me`. Conflicts with future internal-user-self namespace ambiguity.
- C: Allow `/vendors/{id}/*` when caller is the vendor. Mixes admin and self-service in one route, hard to reason about authorization.
Outcome: A. `GET /vendor-auth/me`, `PATCH /vendor-auth/me`, `GET /vendor-auth/me/bids`. All vendor-JWT scoped.
Impact: Internal-user-self could later sit at `/auth/me/*` for symmetry. Vendor email change is rejected at this layer (would bypass email-verify flow) and explicitly deferred.
Related files: `apps/api/src/modules/vendor-auth/vendor-auth.controller.ts`, `vendor-auth.service.ts`, `api-contracts/openapi/ctmp.openapi.yaml`.

### 2026-05-19 — Vendor email change requires re-verification flow (deferred)

Date: 2026-05-19
Decision: `PATCH /vendor-auth/me` rejects changes to the primary contact's email. UI shows email read-only with "Contact admin to change". A full email-change flow with re-verification is out of scope for Phase 5 Part 2.
Context: Allowing arbitrary email edits via the profile endpoint would let a vendor escape the email-verification gate enforced at registration (which is a precondition for admin approval). A proper change-of-email flow needs: new email → verification token → confirm with both old and new addresses → flip the row.
Options considered:
- A: Reject silently and show read-only (chosen).
- B: Allow change but force email_verified_at = NULL until re-verified. Adds complexity and creates a window where an unverified vendor is still APPROVED.
- C: Build the full re-verification flow now. Out of scope for Part 2.
Outcome: A. Documented in profile UI + DTO comments. Tracker entry references this decision.
Impact: Vendors must contact admin to change email. Admin → DB direct edit. Future Phase 5 Part 3 can ship the re-verification flow.
Related files: `apps/api/src/modules/vendor-auth/dto/update-profile.dto.ts`, `apps/web-vendor/src/app/(portal)/profile/page.tsx`.

### 2026-05-18 — Failing bids' commercial envelopes go to LOCKED, not SEALED

Date: 2026-05-18
Decision: When `technical-evaluation.finalize` runs, commercial envelopes for bids with technicalResult=FAIL transition to `LOCKED` (with `lockedAt` set), while passing bids' commercials transition to `SEALED`.
Context: After technical evaluation completes, the committee will eventually open commercial envelopes for the passed vendors. Failed vendors' commercial envelopes must NEVER be opened — even by the committee opening flow. The schema has both SEALED and LOCKED envelope statuses, and the committee opening service filters on `bid.technicalResult = PASS`, so an envelope that escapes filtering still cannot be opened from LOCKED.
Options considered:
- A: LOCKED for failed, SEALED for passed (chosen). Defense in depth: filter + state.
- B: All SEALED, rely solely on the `WHERE technicalResult=PASS` filter. Single layer; a future bug could bypass.
- C: Delete failed commercial envelopes. Loses the audit trail of what was originally submitted.
Outcome: A. Committee opening service queries `status=SEALED AND bid.technicalResult=PASS`. Failed bids' envelopes are visible in the schema for audit but cannot transition out of LOCKED.
Impact: QA must verify that no admin flow attempts to open a LOCKED envelope (would error rather than silently allow). Audit log can still produce an immutable record of original sealed checksums for failed bids.
Related files: `apps/api/src/modules/technical-evaluation/technical-evaluation.service.ts`, `apps/api/src/modules/committee/committee.service.ts`.

### 2026-05-18 — Audit log hash chain uses Prisma transaction, not row lock

Date: 2026-05-18
Decision: `AuditService.log()` wraps the prev-hash read + new-row insert in a single Prisma `$transaction`. No explicit row-level lock on the latest `audit_logs` row.
Context: Hash chain requires `new.hash = SHA256(prev.hash || canonical(payload))`. Two concurrent calls could read the same `prev.hash`, both insert, and chain integrity breaks (two rows with the same `prev_hash_chain_value`).
Options considered:
- A: Transaction-only (chosen). Cheap; works correctly for single-process Node.js where Prisma queries serialize per connection.
- B: `SELECT ... FOR UPDATE` on the latest audit row. Stronger guarantee under multi-process load. Adds lock contention.
- C: Serializable isolation level on the audit txn. Most rigorous; highest cost.
Outcome: A for now. Documented as a known limit. Multi-process deployment (multiple API replicas) MUST upgrade to B or C before production.
Impact: Single-replica deployments are correct. Multi-replica + high audit-write volume risks a chain-break race window. Security review must call this out. Recovery: hash chain break is detectable (next verifier sees mismatched `prev_hash_chain_value` vs the actual prior row's `hash_chain_value`) — broken span can be quarantined for review without losing the rest of the chain.
Related files: `apps/api/src/modules/audit/audit.service.ts`, all 5 write-flow services that call `audit.log()`.

### 2026-05-18 — Vendor admin routes flattened from `/vendors/registrations/{id}/*` to `/vendors/{id}/*`

Date: 2026-05-18
Decision: Renamed vendor lifecycle endpoints to live directly on the vendor ID. Old paths `PATCH /vendors/registrations/{id}/approve`, `/reject` removed. New paths `POST /vendors/{id}/approve`, `/reject`, `/suspend` adopted.
Context: Phase 4 admin portal UI was built against the flat `/vendors/{id}/*` shape (matches REST conventions used elsewhere in the contract — e.g. `/tenders/{id}/approve`). The earlier scaffold used a nested `/registrations` subresource which split the registration from the resulting vendor record. Once approved, that distinction is purely historical; the vendor and registration share a row in `vendors` table.
Options considered:
- A: Flatten to `/vendors/{id}/*` (chosen). Matches UI, matches tender pattern, removes split between registration and vendor.
- B: Change UI to nested form. Adds 3 paths the user thinks of as one resource. Doesn't match `/tenders/{id}/approve` convention.
- C: Keep both. Two ways to do the same thing → confusion and conflict.
Outcome: A. POST verb (not PATCH) because these are workflow transitions, not field edits — consistent with tender approve/reject and committee envelope-open.
Impact: External callers of `/vendors/registrations/{id}/*` (if any) break. Internal: web-admin UI was already on flat form; no client change. Phase 5 vendor portal will not be affected (those routes are vendor-self-service via vendor-auth, separate scope).
Related files: `apps/api/src/modules/vendors/vendors.controller.ts`, `api-contracts/openapi/ctmp.openapi.yaml` (vendor section).

### 2026-05-18 — Admin portal pages speculate on uncontracted endpoints with graceful fallback

Date: 2026-05-18
Decision: Phase 4 admin portal pages (committee opening, commercial comparison, vendor management, reports job history, settings tabs, dashboard) call endpoints that exist conceptually (backend modules scaffolded in Phase 3) but are not present in the OpenAPI contract. Pages catch errors and render empty-state guidance instead of crashing.
Context: Backend scaffolding in Phase 3 created NestJS modules for vendors, roles, permissions, notification, audit, etc., but Phase 2 OpenAPI contract only defined a subset of the routes (mostly tender + bid + auth lifecycle). To deliver Phase 4 UI in this session, UI ships ahead of contract completion.
Options considered:
- A: Speculative calls + empty-state fallback (chosen). UI ships; gaps documented.
- B: Block Phase 4 until OpenAPI contract is extended. Stalls UI for unknown duration.
- C: Implement local mock data in UI. UI ships but creates a parallel reality that conflicts when backend lands.
Outcome: A. Gaps inventoried in `agents/handoffs/HANDOVER.md` (Phase 4 complete entry) and in `MEMORY.md`/`project_state.md`. Backend follow-up will close them in the order most-used by users: `/vendors/*` first, then `/roles` + `/permissions`, then `/system-settings`, then `/notification-templates`, then `/reports/jobs` history list.
Impact: 8 endpoint gaps documented. UI degrades to empty state rather than crashing. No mock data, no parallel reality.
Related files: All 7 Phase 4 admin pages in `apps/web-admin/src/app/(admin)/`; `api-contracts/openapi/ctmp.openapi.yaml` (to be extended).

### 2026-05-18 — Commercial Comparison enforces commercial:view at page level, not just nav

Date: 2026-05-18
Decision: The Commercial Comparison page renders a hard-block NoAccessScreen for users without `commercial:view`, in addition to the sidebar nav being permission-gated.
Context: CLAUDE.md non-negotiable: "System Admin does NOT automatically receive commercial bid visibility." Page must enforce this even if a user reaches it by URL.
Options considered:
- A: Page-level hard gate + sidebar nav gate (chosen). Defense in depth.
- B: Sidebar gate only. URL access bypasses.
- C: Backend-only enforcement. UI still leaks layout/data structure.
Outcome: A. Permission check on mount, full-page block if missing.
Impact: System Admins (or any role lacking `commercial:view`) cannot view commercial comparison even via direct URL. Backend must still enforce — UI gate is for UX, not security.
Related files: `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx`, `apps/web-admin/src/app/(admin)/audit-log/page.tsx` (same pattern for `audit:view`).

### 2026-05-18 — Technical evaluation criteria hardcoded in UI

Date: 2026-05-18
Decision: Hardcode 4 default technical-evaluation criteria and a 70-pt pass threshold in the Technical Evaluation Workspace UI for Phase 4 delivery.
Context: Stitch reference shows a 4-row scorecard (Compliance / Team / Methodology / Support, max 30/25/25/20). OpenAPI `TechnicalEvaluationRequest` accepts an open-ended `scores[]` array with `{ criterion, score, comments }` but does not define a criteria-source endpoint. Spec §5 mentions per-tender evaluation templates but the data model and endpoint for tender-specific criteria are not yet contracted.
Options considered:
- A: Hardcode default criteria in UI (chosen). Ships the screen; documented gap for backend follow-up.
- B: Block screen until `GET /tenders/{id}/technical-criteria` is contracted. Stalls Phase 4 on a contract change.
- C: Free-text criteria input per evaluator. Drift across evaluators; defeats the audit purpose of consistent criteria.
Outcome: A. Default 4-row criteria block lives in `DEFAULT_CRITERIA` in the page file. Replace with API-sourced criteria when endpoint lands.
Impact: Evaluators see a uniform 4-criterion scorecard. Per-tender custom criteria not yet supported. `passed`/"Met" toggle is UI-local — not persisted via current schema.
Related files: `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx`, `api-contracts/openapi/ctmp.openapi.yaml` (TechnicalEvaluationRequest).

### 2026-05-18 — `GET /tenders/{tenderId}/bids` called speculatively from UI

Date: 2026-05-18
Decision: Technical Evaluation Workspace calls `GET /tenders/{tenderId}/bids` even though the endpoint is not in the OpenAPI contract. Page degrades to an empty bid list when the endpoint returns 404.
Context: To present a per-tender bid list for scoring, the UI needs a way to enumerate bids on a tender. Existing contract has `/bids/{bidId}/*` endpoints but no tender-scoped bid list. Same gap previously noted for `/tenders/{id}/approve` and `/reject` in the approval queue.
Options considered:
- A: Speculative call with graceful empty fallback (chosen). Lets UI ship now and uncovers the gap to backend.
- B: Stub data in UI. Mismatched data once backend lands.
- C: Block screen on contract update. Stalls Phase 4.
Outcome: A. UI tagged with inline note `GET /tenders/{id}/bids endpoint pending API contract update.`
Impact: Until backend ships this endpoint, the bid panel stays empty in non-dev environments. Two missing endpoints now accumulated (`/tenders/{id}/approve`, `/tenders/{id}/reject`, `/tenders/{id}/bids`).
Related files: `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx`, `apps/web-admin/src/app/(admin)/approvals/page.tsx`, `api-contracts/openapi/ctmp.openapi.yaml`.


### 2026-05-18 - StatusBadge Uses Inline Styles for 17-State Color Mapping

Date: 2026-05-18

Decision:

`StatusBadge` component uses inline `style` props for background/text/dot colors rather than Tailwind utility classes.

Context:

The tender lifecycle has 17 states (Draft → Archived), each requiring a distinct color triple (bg, text, dot). Adding 17×3 = 51 tokens to `tailwind.config.ts` would pollute the design system. Tailwind's JIT cannot dynamically generate arbitrary colors from a runtime map; the only alternative would be hardcoding class strings per state, which is verbose and hard to maintain.

Options considered:

(1) Add all 51 tokens to Tailwind config. (2) Hardcode class strings per state in a lookup. (3) Use inline styles from a typed lookup object. Option 3 chosen.

Outcome:

`STATUS_MAP` in `StatusBadge.tsx` contains all 17 states as `{ bg, text, dot }` hex triples. The badge renders with `style={{ backgroundColor, color }}`. This is the **only** legitimate use of hardcoded hex values in `apps/web-admin/` — it is status-data, not design decisions.

Impact:

When adding a new tender lifecycle state, add it to both the domain vocabulary in `CLAUDE.md` and the `STATUS_MAP` in `StatusBadge.tsx`. Do not add status badge colors to `tailwind.config.ts`.

Related files:

`apps/web-admin/src/components/ui/StatusBadge.tsx`

---

### 2026-05-18 - Admin Portal Color Scheme

Date: 2026-05-18

Decision:

Admin portal uses the following color palette (owner-specified):

| Token | Hex | Role |
|---|---|---|
| Sidebar | `#0F172A` | Navigation background |
| Sidebar hover | `#1E293B` | Active/hover nav items |
| Accent | `#3B82F6` | Buttons, links, focus rings |
| Accent hover | `#2563EB` | Button hover |
| Background | `#F1F5F9` | Page background |
| Card | `#FFFFFF` | Cards, panels, modals |
| Primary Text | `#0F172A` | Headings, body text |
| Secondary Text | `#475569` | Labels, captions, help text |
| Success | `#22C55E` | Status badges, confirmations |
| Danger | `#EF4444` | Errors, destructive actions |
| Border | `#E2E8F0` | Dividers, input borders |

Context:

Initial Stitch-generated designs used navy `#1E3A5F` sidebar and `#2563EB` accent. Owner reviewed and specified a different palette before screens were built.

Options considered:

Navy/blue (original Stitch design), dark slate/amber, deep teal/green, custom owner-specified palette (chosen).

Outcome:

Custom palette applied. Tokens defined in `tailwind.config.ts` (semantic names: `bg-sidebar`, `text-accent`, etc.) and `globals.css` CSS variables. All existing scaffold files updated. New screens must use the semantic tokens, not raw hex.

Impact:

All future admin portal components must reference these tokens. Do NOT use the old navy `#1E3A5F` or `#2563EB` anywhere in `apps/web-admin/`. The Stitch HTML mockups in `stitch-designs/` use the old navy palette — treat them as layout reference only, not color reference.

Related files:

`apps/web-admin/tailwind.config.ts`, `apps/web-admin/src/app/globals.css`

---

### 2026-05-18 - Google Stitch Used for Admin Portal UI Generation

Date: 2026-05-18

Decision:

Admin portal UI (Phase 4) outsourced to Google Stitch (stitch.withgoogle.com) via Playwright MCP automation rather than hand-coded from scratch.

Context:

Phase 4 requires 13+ screens. Writing them from scratch would be slow. Google Stitch generates production-quality HTML UI from natural-language prompts. Playwright MCP can drive Stitch headlessly.

Options considered:

Hand-coded from scratch, v0.dev, Google Stitch. Stitch chosen: free, Gemini 2.5 Pro, exports clean HTML with Tailwind + Material Symbols.

Outcome:

15 screens generated (including Login and MFA), 14 exported as HTML to `apps/web-admin/stitch-designs/`. These serve as visual + structural reference when building Next.js pages.

Impact:

Stitch HTML is layout/component reference. Color tokens must be overridden (see color scheme decision above). Security gates (commercial:view permission, audit logging) must be applied manually — Stitch cannot enforce these.

Related files:

`apps/web-admin/stitch-designs/` (14 HTML files + PNGs)

---

### 2026-05-17 - Vendor Registration Creates Vendor+VendorUser Before Admin Approval

Date: 2026-05-17

Decision:

Vendor self-registration immediately creates a `Vendor` (status `PENDING`) + `VendorUser` record in an atomic transaction, even though admin approval hasn't happened yet.

Context:

The `vendor_email_verification_tokens` and `vendor_password_reset_tokens` tables have a NOT NULL FK to `vendor_users`, and `vendor_users` has a NOT NULL FK to `vendors`. There is no way to issue verification tokens without both rows existing. The spec requires email verification before the admin review step.

Options considered:

1. Add `password_hash` + `contact_name` to `vendor_registration_requests` and defer `Vendor`/`VendorUser` creation until admin approval. Requires schema migration.
2. Create `Vendor (PENDING)` + `VendorUser` immediately at registration time. No schema change required.

Outcome:

Option 2. Login gates explicitly on `vendor.status === 'APPROVED'` — a PENDING vendor user cannot authenticate even after email verification.

Impact:

Admin "approve" action must update `vendor.status` to `APPROVED` and `vendor_user.status` to `ACTIVE`; "reject" must set `vendor.status = REJECTED` and optionally delete or suspend the `VendorUser`.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts`, `database/migrations/001_initial_schema.sql`

---

### 2026-05-17 - Verification/Reset Tokens Stored as SHA-256 Hashes Only

Date: 2026-05-17

Decision:

Email verification tokens and password reset tokens are stored in the database as SHA-256 hex hashes of the raw 32-byte random token. The raw token is only present in the outbound email.

Context:

If the database is compromised, stored tokens must not be directly usable to take over accounts.

Options considered:

1. Store raw token (simple, common in low-security apps).
2. Store SHA-256(token). No bcrypt needed — token is already high entropy (256 bits).
3. Store bcrypt(token). Unnecessary CPU cost; tokens are already max entropy.

Outcome:

Option 2. `crypto.randomBytes(32).toString('hex')` generates the raw token; `createHash('sha256').update(raw).digest('hex')` is stored. Lookup is by exact hash match.

Impact:

Any future token table must follow this pattern. Do not store raw tokens.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts` (`newToken()`/`hashToken()` helpers)

---

### 2026-05-17 - ORM: Prisma Selected Over TypeORM

Date: 2026-05-17

Decision:

Prisma v6 selected as the ORM for `apps/api`. TypeORM was the main alternative.

Context:

Phase 3 scaffold required selecting an ORM before adding the database connection module. Both are first-class NestJS options.

Options considered:

1. **TypeORM** — Decorator-based, ships with `@nestjs/typeorm`. Closer to SQL. Rougher migration tooling historically; generated migrations are sometimes incomplete for complex schemas. More boilerplate for complex relations.
2. **Prisma v6** — Schema-first (`schema.prisma`). Generates a fully-typed client. `prisma migrate` produces clean, reviewable SQL diffs. Strong N+1 protection via `include`/`select`. Better DX for maintainability of a long-running enterprise system.

Outcome:

Prisma v6 adopted. Schema at `apps/api/prisma/schema.prisma` (33 models, 17+ enums). Client generated via `prisma generate`. Migration workflow: `prisma migrate dev` for development, `prisma migrate deploy` for on-prem production.

Impact:

- All service code uses `PrismaService` (extends `PrismaClient`) injected from `DatabaseModule` (global).
- Database schema changes require a new Prisma migration file, not TypeORM `synchronize`.
- SHA-256 hash format is enforced at DB layer (CHECK constraint in migration 002); Prisma passes values through without transformation — application must produce lowercase hex.
- `prisma generate` must be run after any `schema.prisma` change before TypeScript compilation.

Related files:

`apps/api/prisma/schema.prisma`, `apps/api/src/database/prisma.service.ts`, `apps/api/src/database/database.module.ts`

---

### 2026-05-17 - Spectral OAS Lint: 0 Errors, 71 Warnings (operationId missing)

Date: 2026-05-17

Decision:

Spectral lint run on `api-contracts/openapi/ctmp.openapi.yaml` as first Phase 3 task. Result: 0 errors, 71 warnings. Warnings deferred.

Context:

71 warnings are all `operation-operationId` (every endpoint missing `operationId`) plus 1 unused component (`VendorStatus`). No structural or semantic errors. Contract is valid for Phase 3 implementation.

Outcome:

`operationId` population deferred to a dedicated API annotation pass. Controllers in Phase 3 scaffold already include `operationId` values in `@ApiOperation()` decorators — the OpenAPI YAML file itself is the backlog item.

Impact:

`operationId` values in YAML must match the controller decorator values when the annotation pass happens.

Related files:

`api-contracts/openapi/ctmp.openapi.yaml`, `.spectral.yaml`

---

### 2026-05-17 - SHA-256 Hex Format Enforced At Database Layer

Decision:

All CHAR(64) columns storing SHA-256 digests or hash-chain values carry a `CHECK (col ~ '^[a-f0-9]{64}$')` constraint. Nullable hash-chain columns use `CHECK (col IS NULL OR col ~ '^[a-f0-9]{64}$')`.

Context:

CHAR(64) constrains length only. Without a format check, uppercase hex, truncated values, or arbitrary strings can be stored silently and will fail checksum verification at read time — after a bid is sealed and immutable.

Options considered:

1. Application-only validation — rejected; application code can be bypassed by direct DB access or bugs.
2. DB CHECK constraint — adopted; enforces format regardless of insert path.
3. Encode as BYTEA — would require application changes and offers no practical advantage for an on-prem system that logs/displays hashes as hex strings.

Outcome:

Added via `002_schema_hardening.sql`. Application must compute and store lowercase hex; the DB rejects uppercase or non-hex strings.

Impact:

API and service code must call `hashlib.sha256(...).hexdigest()` (Python) or `crypto.createHash('sha256').digest('hex')` (Node) — not `.hexdigest().upper()`. Add this to code-review checklist.

Related files:

`database/migrations/002_schema_hardening.sql`

---

### 2026-05-17 - captcha_verification_id Nullable By Design, Enforced At API Layer

Decision:

`vendor_registration_requests.captcha_verification_id` is nullable in the schema. A column comment documents that public self-registration must supply it; admin-created records may omit it.

Context:

A NOT NULL constraint would prevent admin staff from importing vendor records without a CAPTCHA. But leaving it nullable without documentation risks developers forgetting to enforce it on the public endpoint.

Options considered:

1. NOT NULL — rejected; breaks admin import path.
2. Nullable + no documentation — rejected; too easy to forget.
3. Nullable + column comment + API-layer validation rule — adopted.

Outcome:

Column stays nullable. `VendorAuthController` (Phase 3) must validate CAPTCHA, insert `captcha_verification_logs`, and supply the FK before any public registration INSERT.

Impact:

API integration test must assert that a public registration request missing a valid CAPTCHA token is rejected with 422.

Related files:

`database/migrations/002_schema_hardening.sql`, `database/migrations/001_initial_schema.sql`

---

### 2026-05-17 - Audit Log Append-Only Enforced At Database Layer

Decision:

`audit_logs` is enforced as append-only inside the database via triggers that raise on UPDATE, DELETE, and TRUNCATE. Tamper-evidence is layered on top via `prev_hash_chain_value` and `hash_chain_value`, computed application-side as SHA-256 over the previous row's hash plus a canonical projection of the current row.

Context:

The spec (section 15) requires append-only, tamper-evident audit. Enforcing the rule application-side alone would allow accidental or malicious DELETEs by anyone with `audit_logs` table privileges. Pushing the rule into a trigger makes the constraint independent of the application code path.

Options considered:

- Application-only enforcement (rejected: too easy to bypass).
- Revoke UPDATE/DELETE from the application role at GRANT level (kept as a complementary control to add in DevOps phase, but it does not prevent superusers, hence the trigger).
- Use a write-only foreign log store (deferred; trigger approach is simpler for on-prem MVP).

Outcome:

Trigger function `audit_logs_block_modifications()` is fired BEFORE UPDATE/DELETE/TRUNCATE on `audit_logs` and raises `insufficient_privilege`. Hash chain columns are present but populated by the application service that writes audit events.

Impact:

- Backend audit service is responsible for computing `hash_chain_value` from the prior row's hash.
- DBAs cannot mutate audit rows through the application path; admin maintenance must use a documented, audited break-glass procedure (out of MVP).
- A future verification job can re-walk the chain and raise alerts on mismatch.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - Use PostgreSQL ENUM Types For Fixed Business States

Decision:

Tender status, envelope type/status, bid status, vendor status, workflow status, and similar fixed business enumerations are modelled with PostgreSQL `CREATE TYPE ... AS ENUM` rather than lookup tables.

Context:

The spec lists every state explicitly. Storing them as ENUMs gives compile-time-style validation at the database boundary and avoids accidental free-text states. New values can be added safely with `ALTER TYPE ... ADD VALUE`.

Options considered:

- Lookup tables (rejected for fixed business states: more joins, weaker invariants).
- VARCHAR + CHECK constraint (rejected: harder to evolve without enumerating values in two places).
- ENUM (chosen).

Outcome:

ENUM types are created in section 1 of `001_initial_schema.sql`. Tables reference them directly.

Impact:

- Future state additions require a small ALTER TYPE migration.
- Backend code in shared-types should mirror these enums (TypeScript union types).

Related files:

```text
database/migrations/001_initial_schema.sql
packages/shared-types/
```

### 2026-05-17 - Commercial Envelope Opening Requires Committee Session At Schema Level

Decision:

The `bid_envelopes` table has a CHECK constraint (`commercial_open_requires_session`) that prevents a row from being in state `OPENED` with `envelope_type = 'COMMERCIAL'` unless `committee_session_id` is set.

Context:

Spec section 6 and the prior decision "Commercial Opening Does Not Mean Universal Visibility" require commercial envelopes to be opened only through a formal committee session. Enforcing this at the database layer is a defence-in-depth control behind the API.

Outcome:

A direct UPDATE that sets `status = 'OPENED'` without a committee session reference will fail at the database. Permission checks for `commercial:view`, `:download`, etc. still apply at the application layer for any visibility beyond status.

Impact:

- API code must always set `committee_session_id` when opening a commercial envelope.
- Any future migration that loosens this constraint requires explicit governance review.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - One Active Late Submission Exception Per (Tender, Vendor)

Decision:

`late_submission_exceptions` has a partial unique index ensuring only one exception in status `PENDING_APPROVAL` or `GRANTED` can exist per (tender_id, vendor_id) at a time. Expired/rejected/used rows are retained for audit but do not block a future exception.

Context:

The business rule is "exceptions are tender-specific and vendor-specific". Without the partial unique index, procurement could accidentally grant overlapping exceptions, which would complicate auditing and reporting.

Outcome:

The constraint is enforced at the schema level. Application must transition older rows to `EXPIRED`/`USED` before granting a fresh exception.

Impact:

- API for granting an exception must reject if an active one already exists.
- Reports of "active exceptions" can join cleanly without aggregation.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - System Admin Baseline Excludes Commercial Detail Permissions

Decision:

The baseline seed grants the `SYSTEM_ADMIN` role only `commercial:view_status` from the commercial:* permission family. `commercial:view`, `commercial:download`, `commercial:evaluate`, and `commercial:export` are deliberately NOT granted.

Context:

Spec section 10 mandates that System Admin does not automatically receive commercial bid visibility. Encoding this in the baseline seed prevents accidental privilege creep on fresh deployments.

Outcome:

If an organisation needs a single user to perform both platform admin and commercial review, an explicit, audited assignment of the COMMERCIAL_EVALUATOR role (or a custom role) is required.

Impact:

- Onboarding must clarify this separation of duties to procurement teams.
- A QA test must verify that a fresh deployment does not let a System Admin view commercial details.

Related files:

```text
database/seeds/001_baseline_roles_permissions.sql
docs/specs/implementation-spec.md
```

### 2026-05-16 - Commercial Opening Does Not Mean Universal Visibility

Decision:

Commercial committee opening changes the commercial envelope state from sealed to opened, but commercial details remain visible only to users with explicit commercial permissions.

Context:

The procurement process requires official committee opening, but confidentiality must continue after opening.

Outcome:

Implement separate concepts:

```text
Envelope state: SEALED / OPENED
User permission: commercial:view / commercial:download / commercial:evaluate / commercial:export
```

Impact:

- API must check both envelope state and permissions.
- UI must show status-only views to unauthorized users.
- Commercial views/downloads/exports must be audit logged.

Related files:

```text
docs/specs/implementation-spec.md
AGENTS.md
AI_BUILD_INSTRUCTIONS.md
```

### 2026-05-16 - Technical Envelope Opens Before Commercial Committee Opening

Decision:

Technical envelopes may be opened after `Submission Closed` so technical evaluation can finish before commercial comparison.

Context:

Technical evaluation must happen before the committee commercial opening. Only technically qualified vendors proceed to commercial comparison.

Outcome:

Technical and commercial envelope controls are separate.

Impact:

- Technical evaluation workflow starts after submission period ends.
- Commercial envelope remains sealed until committee opening.

Related files:

```text
docs/specs/implementation-spec.md
```

### 2026-05-16 - Late Submission Requires Audited Exception

Decision:

Late submissions are blocked by default but may be allowed through a vendor-specific and tender-specific authorized procurement exception.

Context:

The business wants controlled flexibility while preserving auditability.

Outcome:

Late submission exceptions require reason, expiry time, granting user, and audit trail.

Impact:

- Database needs `late_submission_exceptions`.
- API needs exception endpoints.
- UI and reports must mark late accepted bids.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```

### 2026-05-16 - Vendor Registration Requires Bot Protection

Decision:

Vendor self-registration must include CAPTCHA or approved bot-protection challenge.

Context:

The registration form is public-facing and must resist bot submissions.

Outcome:

CAPTCHA is validated server-side, registration is rate-limited, and suspicious attempts are logged.

Impact:

- Vendor frontend requires CAPTCHA UI.
- Backend requires CAPTCHA verification and logging.
- QA must test bot protection and abuse cases.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```


### 2026-08-06 - Commercial Terms Are Per Bid, Not Per BOQ Line

Decision:

The five commercial terms a vendor records with an offer — brand/manufacturer, country of origin,
warranty, delivery period and payment terms — are stored once per bid, not once per BOQ line. They
are all optional and are never part of a submission precondition.

Context:

The first sketch attached brand/origin/warranty to each BOQ line, matching how the itemized
comparison is laid out. The owner rejected that as unnecessary data entry: a tender is bought from
one supplier on one set of terms, so repeating them per line is noise. Delivery is also rarely a
single number, so it is captured as a range (from + optional to + Weeks/Months) rather than one
value.

Outcome:

- Seven nullable columns on `bids`, mirrored on `bid_negotiation_submissions` so a round can revise
  the terms. No side table — the data is 1:1 with its parent and always read with it.
- A dedicated `PUT /bids/:bidId/commercial-terms`, separate from the BOQ save, because the BOQ
  endpoint requires a real template and cannot be called on a legacy tender at all.
- Display formatting lives in `packages/shared-types` for the two web apps and is mirrored in the
  API for the Award Minutes PDF, because the API cannot take a workspace dependency without
  regenerating a lockfile the air-gapped build box cannot regenerate.

Impact:

- Vendor bid wizard gains one card; no new wizard step.
- Admin Commercial Comparison gains a section under the itemized matrix that renders even for
  tenders with no BOQ template.
- Award Minutes PDF gains a "Commercial Terms of Offers" table.
- Any future per-line variant would need a new table, not a column change.

Related files:

```text
database/migrations/052_bid_commercial_terms.sql
apps/api/src/modules/bids/commercial-terms.util.ts
packages/shared-types/src/commercial-terms.ts
```
