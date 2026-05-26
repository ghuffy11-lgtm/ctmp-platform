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

### 2026-05-26 — Vendor portal: light theme only (no dark/light toggle), electric-blue accent retained

Date: 2026-05-26
Decision: Convert the vendor portal (`apps/web-vendor/`) from the dark navy "VENDOR•CONNECT" aesthetic to a light theme. Single-theme app — no dark/light toggle, no `prefers-color-scheme` switching. Body uses `linear-gradient(135deg, #F8FAFC → #EFF6FF)`; cards use `bg-white/92` with `rgba(15,23,42,0.08)` border; text is `#0F172A` (slate-900). The electric-blue brand accent (`#00B4FF`) is retained for CTAs, focus rings, link hovers, and nav underlines — it reads well on both backgrounds and preserves continuity with the existing redesign.
Context: User feedback after the 2026-05-24 dark-theme deploy was unequivocal: "I need a light theme, this is way too dark." The dark redesign was code-complete and deployed but rejected on aesthetics. Three options were on the table: (1) full light conversion, (2) dual-mode toggle, (3) hybrid with light bg + dark cards.
Options considered:
- A (chosen): Full one-shot rewrite of design tokens. ~16 files. No `prefers-color-scheme` branching. Simpler codebase, faster ship, no theme-state machinery. Accent kept as electric-blue for visual continuity with the just-shipped redesign.
- B: Dual-mode toggle. Keep dark theme code intact, add light theme via Tailwind `dark:` variants, driven by `html.dark` toggle + localStorage. Higher initial effort. Carries both themes forever. Would require theme-switcher UI.
- C: Hybrid (white body + dark cards). Lightest change but creates visual dissonance — dark surfaces "floating" on white never look right at scale.
Outcome: Option A live on staging at `https://vn.hadiclinic.com.kw:4201`. CSS bundle verified: `color-scheme: light`, body gradient `linear-gradient(135deg, #F8FAFC, #EFF6FF)`, zero traces of `#0A1428` navy. Playwright suite passes 17/17 against live URL (one assertion updated — dropped the `html.dark` check, renamed 6 test titles). Build clean (13 routes), type-check clean.
Impact: All vendor-facing pages render light. The two unreskinned bid pages (`/bids/[bidId]`, `/bids/wizard/[tenderId]`) auto-flipped via the Tailwind legacy alias rename (`bg`/`card` → `#FFFFFF`, `text-primary` → `#0F172A`, `border` → `rgba(15,23,42,0.1)`) — no direct edits needed. Admin portal intentionally untouched (already light-themed). hCaptcha widget switched `theme="dark"` → `theme="light"`.
Related files: `apps/web-vendor/src/app/globals.css`, `apps/web-vendor/tailwind.config.ts`, `apps/web-vendor/src/app/layout.tsx`, `apps/web-vendor/src/components/ui/{Input,PageHeader,Empty,StatusBadge}.tsx`, `apps/web-vendor/src/components/layout/{PortalShell,AuthShell}.tsx`, 10 page files under `apps/web-vendor/src/app/`, `apps/web-vendor/src/app/register/page.tsx` (hCaptcha theme), `qa/playwright/tests/vendor-portal-redesign.spec.ts`.

### 2026-05-26 — Tender field naming: frontend canonical wins (`procurementType`, `estimatedBudget`)

Date: 2026-05-26
Decision: When the agreed BUG-008/009/010/011 fix bundle ships, the Prisma model fields `tenderType` and `budgetEstimate` will be renamed to `procurementType` and `estimatedBudget` respectively (keeping the DB column names via `@map("tender_type")` and `@map("budget_estimate")`). The API serializer + CreateTenderDto + UpdateTenderDto + frontend all standardise on the frontend names. No DB migration required — just regenerate Prisma client.
Context: The frontend code, spec docs, and UI all use `procurementType` and `estimatedBudget`. The Prisma model historically used `tenderType` and `budgetEstimate` (matching the DB column names). This mismatch caused BUG-003 (Procurement Type empty on detail), BUG-011 (PATCH rejected with 400 "property procurementType should not exist"), BUG-002 ancillary (estimatedBudget missing from response). Today's serializer-sweep ships a temporary `procurementType: t.tenderType` map until the full bundle lands.
Options considered:
- A (chosen): Rename Prisma fields, keep DB columns. Frontend names win. One-line `@map()` per field; zero migration; zero downtime; immediate consistency for any code reading Prisma client types.
- B: Rename frontend fields to match Prisma (`tenderType`, `budgetEstimate`). Cheapest backend change but every UI, spec doc, and test now uses non-canonical terms. User-facing terminology drift.
- C: Rename both (Prisma model + DB columns). True consistency but requires a real migration with downtime risk on the production DB once it has data.
Outcome: Decision locked. Implementation ships with the BUG-008/9/10/11 bundle (queued, not yet executed). Today's serializer sweep includes the mapping as an interim measure (`procurementType: t.tenderType` in `serializeSummary`).
Impact: Future tender code is consistent end-to-end on the canonical names. Existing Prisma client consumers (audit service, reports renderer, etc.) need a one-time update once the rename lands. The DB schema is undisturbed.
Related files: `apps/api/prisma/schema.prisma` (to be updated), `apps/api/src/modules/tenders/dto/{create,update}-tender.dto.ts` (to be updated), `apps/api/src/modules/tenders/tenders.service.ts` (already has the interim map), `docs/qa/BUG_TRACKER_2026-05-25.md` (BUG-008 full decision record).

### 2026-05-26 — Tender lifecycle field gating: required-before-Publish, not required-on-Create

Date: 2026-05-26
Decision: Procurement Type, Category, Estimated Budget, and the existence of ≥1 RFQ document are NOT required to save a tender as Draft. They ARE required before the Publish action succeeds. Server-side `publish()` guard returns 400 listing whichever prerequisite fields are missing. Department selector is editable on the create form AND on the edit form WHILE the tender is in Draft status only — once Internal Review or beyond, Department becomes a read-only label. Estimated Budget is editable in Draft + Internal Review, locked once Approved.
Context: While walking the bug tracker, the user needed to decide for each missing/restricted field: required from the start, required eventually, or always optional? Two procurement patterns exist: strict (everything required upfront) or progressive (start a Draft early, firm up before Publish). The progressive model wins for procurement officers who need to capture an early skeleton tender and gradually add details as they're known.
Options considered:
- A (chosen): Progressive — empty Drafts allowed, gates at status transitions. Publish, Approval, Submission Closed each enforce specific field presence. Matches how procurement teams actually work.
- B: Strict — every field required at create. Lower-flexibility but ensures no incomplete tenders ever exist. Annoying when drafting from scratch.
- C: Per-organisation configurable. Out of scope for v1 — over-engineered.
Outcome: Decision locked across BUG-008 (Procurement Type before Publish), BUG-009 (Department editable in Draft only), BUG-010 (Budget locked after Approval, required before Publish), BUG-012 (≥1 RFQ document required before Publish). To be implemented in the BUG-008/9/10/11 + BUG-012 bundles.
Impact: Tender creation UX improves — fewer required fields up front. Publish action becomes the firm checkpoint. Audit-clarity benefit: every tender that reaches Publish has a complete record by definition.
Related files: `apps/api/src/modules/tenders/tenders.service.ts` (publish() gate), `apps/web-admin/src/app/(admin)/tenders/{new,[id]/edit}/page.tsx`, `docs/qa/BUG_TRACKER_2026-05-25.md` (BUG-008/009/010 full records).

### 2026-05-26 — INVITATION_ONLY tender workflow: visibility fixed at create, dedicated panel, ≥3 invited vendors, add-but-no-remove after Publish

Date: 2026-05-26
Decision: Tender visibility (`PUBLIC` vs `INVITATION_ONLY`) is chosen at the create form and immutable for the tender's life. When INVITATION_ONLY, a "Manage Invited Vendors" panel appears on the tender detail page (only when visibility=INVITATION_ONLY); admin adds vendors there. Publish requires ≥3 invited vendors (procurement-fairness convention — three quotes minimum). After Publish, admins can ADD new invitees (handles "forgot one") but cannot REMOVE existing ones (vendors may have started preparing a bid; removal would be unfair). After Submission Closed, the list is fully frozen.
Context: BUG-015 surfaced that the DB already has the `TenderVisibility` enum + `tender_vendors` join table, but no UI, no publish gate, no vendor-side filter. Building the full workflow needed several policy decisions: where visibility is set, where vendor selection happens, what the minimum-vendor threshold should be, and whether the invite list is editable post-publish.
Options considered:
- Visibility-set-when: at create (chosen) / editable in Draft / chosen at Publish.
- Vendor-selection-where: dedicated detail panel (chosen) / publish-time modal / wizard step.
- Min vendors: 3 (chosen — standard competitive-bidding convention) / 1 / 2.
- Post-publish edit: add-only until close (chosen) / fully frozen at publish / fully editable until close.
Outcome: Decisions locked into BUG-015 entry. To be implemented as the "Invitation workflow" bundle along with BUG-016 (notification policy).
Impact: Procurement gets a clean separation of public vs invited tenders. Compliance gets the 3-vendor floor + immutable visibility. Vendors only see tenders they're allowed to bid on (PUBLIC ones for them, or INVITATION_ONLY ones they were invited to).
Related files: `apps/api/prisma/schema.prisma:58-63, 571, 640-651` (existing infra), `apps/api/src/modules/tenders/tenders.service.ts` (publish gate + new invite endpoints), `apps/web-admin/src/app/(admin)/tenders/{new,[id]}/page.tsx`, `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-015 entry.

### 2026-05-26 — Tender publication notification policy: email all approved vendors (PUBLIC) / invitees at publish (INVITATION_ONLY); no in-app or SMS, no reminders for v1

Date: 2026-05-26
Decision: When a PUBLIC tender is published, the system emails every vendor with status=APPROVED via the existing notifications module (`TENDER_PUBLISHED_PUBLIC` template). When an INVITATION_ONLY tender is published, only the invited vendors are emailed (`TENDER_INVITATION` template). Post-publish vendor additions (per BUG-015's add-after-publish rule) email the new invitee immediately. Email is the only channel for v1 — no in-app notification badge, no SMS. No deadline-reminder emails for v1 (cron-based reminders deferred).
Context: BUG-016 was originally a Question — "how do publication notices reach vendors?" The notifications module is built and works (nodemailer + template interpolation + NotificationLog), but `publish()` doesn't enqueue anything today. Needed policy decisions across recipient scope, channels, and reminder cadence.
Options considered: PUBLIC scope — all approved vendors (chosen) / category-matched / no email. Invited timing — at publish (chosen) / at invite. Channels — email only (chosen) / +in-app / +SMS. Reminders — none (chosen) / one 48h before / two 7d+48h before.
Outcome: Decisions locked into BUG-016 entry. Implementation queued as part of the Invitation workflow bundle (depends on BUG-015 vendor-selection landing first).
Impact: Vendors learn of new opportunities through their inbox without needing to poll the portal. Procurement teams know exactly who got the notification via NotificationLog. v1 footprint is small (2 templates + 1 service method); reminders + in-app + SMS can layer in later if usage demands.
Related files: `apps/api/src/modules/notifications/notifications.service.ts` (existing infra), `apps/api/src/modules/tenders/tenders.service.ts` (publish hook to be added), 2 new template seeds in `database/seeds/`, `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-016 entry.

### 2026-05-26 — RBAC enforcement model: full sidebar permission map + department-scoped data filtering (SYSTEM_ADMIN bypass)

Date: 2026-05-26
Decision: All 12 admin sidebar items get an explicit `permission` field (today only 2 do). A user without the required permission doesn't see the link. Beyond menu gating, non-admin internal users see only data tied to their `user_departments` membership — the filter applies to tenders/approvals/clarifications/technical-evaluation/committee-sessions/commercial-comparison and to audit-log search. SYSTEM_ADMIN bypasses every filter. Multi-department users see the union of their departments. Empty-scope pages render a friendly empty state ("No items in your scope") rather than hiding the menu item.
Context: BUG-028 (the last Critical). User report: "I assigned technical evaluator permission, user can view all menu in the side bar … should be restricted to only users permission based on department level." Currently every non-gated menu item is visible to everyone; tender list isn't dept-scoped for internal users. The combination leaks tender information across departments and shows menu items that 403 on click.
Options considered:
- Sidebar gates: full per-item map (chosen) / loose (high-sensitivity only).
- Data scope: tenders + derivatives (chosen) / tenders only / no scope.
- Empty UX: show menu + empty page (chosen) / hide menu when empty.
- Department membership: union for multi-dept (chosen, implicit) / require primary dept only.
Permission map (locked):
| Item | Permission |
|---|---|
| Dashboard | always |
| Tenders | tender:view |
| Approvals | tender:approve OR award:approve |
| Clarifications | clarification:view |
| Technical Evaluation | technical:evaluate |
| Committee & Commercial | committee:manage OR commercial:view |
| Commercial Comparison | commercial:view (already gated) |
| Vendor Management | vendor:view |
| Reports | reports:view |
| Audit Log | audit:view |
| Security Alerts | audit:view (already gated) |
| System Configuration | system:configure |
Outcome: Decisions locked. To be implemented as the largest remaining single bundle.
Impact: Compliance gap closed (no cross-department tender visibility for internal users without elevated role). UX clearer (menu reflects what the user can actually do). Auditors get a credible answer to "who could have seen this tender?" — the answer is "SYSTEM_ADMIN + users in tender.department".
Related files: `apps/web-admin/src/components/layout/Sidebar.tsx` (extend `permission` field on 9 items), `apps/api/src/modules/tenders/tenders.service.ts` (findAll dept-scope), new `apps/api/src/common/rbac/dept-scope.helper.ts`, new request-context extension to load `user.departments`, similar findAll edits on 5 other service files. `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-028 entry.

### 2026-05-26 — Award recommendation: any technically-PASS bid eligible, non-lowest pick requires 100+ char justification, flagged in audit + Approval banner

Date: 2026-05-26
Decision: The Recommend Award action can target any bid that passed technical evaluation (FAIL bids excluded). When the recommended bid is NOT rank-1 by price, the system records `nonLowestPrice=true` + `bypassedLowestBidId` + `priceGapKwd` on the recommendation row, emits a distinct audit event `AWARD_RECOMMENDED_NON_LOWEST` (HIGH risk, separate from `AWARD_RECOMMENDED`), requires a justification ≥100 characters (vs any non-empty justification when picking the lowest), and shows a prominent red banner on the Approvals queue detail panel: "This recommendation is NOT the lowest priced bid (+X KWD above lowest). Review the justification carefully." with the bypassed bids listed.
Context: BUG-026 — committee needs the flexibility to recommend a non-lowest bidder when quality/capacity/risk justifies the premium, but compliance demands clear documentation when they do. Pure "lowest wins" is too rigid; pure "free choice" is too lax for a public-procurement context.
Options considered:
- Eligibility: PASS only (chosen) / top-3 by price / any including FAIL.
- Non-lowest handling: audit flag + banner (chosen) / no special treatment / dual-approval required.
- Justification length: 100 chars when non-lowest (chosen) / 100 chars always / no minimum.
Outcome: Decisions locked into BUG-026 entry. Single-approver model retained (no dual-approval gate added).
Impact: Committee gets the flexibility procurement law generally allows. Auditors can filter on `AWARD_RECOMMENDED_NON_LOWEST` to find every recommendation that bypassed the cheapest. Approver sees the override clearly before signing off — informed consent on every non-lowest pick.
Related files: `apps/api/src/modules/award/award.service.ts` (recommend logic + 3 new audit event types), `apps/api/src/modules/award/dto/recommend-award.dto.ts`, `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` (Recommend on every PASS row), `apps/web-admin/src/app/(admin)/approvals/page.tsx` (non-lowest banner). Schema migration adds `non_lowest_price`, `bypassed_lowest_bid_id`, `price_gap_kwd` columns to the award recommendations table. `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-026 entry.

### 2026-05-26 — Clarifications visibility: per-reply isPublic (not per-parent), vendor identity redaction on cross-vendor public threads

Date: 2026-05-26
Decision: Move the `is_public` column from `tender_clarifications` to `tender_clarification_replies` so each reply has its own visibility. A clarification is "visible to other vendors" if ANY of its replies has `isPublic=true`. When another vendor's clarification surfaces on the asking vendor's portal via a public reply, the vendor identity is redacted (vendorName → "Another vendor", vendorId → null); private replies on that thread are never sent to other vendors. Admins see everything unchanged.
Context: BUG-031 — confidentiality bug. The current backend filter uses `{ isPublic: true }` on the parent clarification, but `isPublic` defaults to true at the parent level → vendors see every other vendor's questions. The admin reply UI already lets you toggle Public/Private per reply but the data model didn't support it — replies inherited from the parent. Fundamental model mismatch.
Options considered:
- Model: per-reply visibility (chosen) / per-parent only.
- Other-vendor exposure: redact identity (chosen) / show vendor name / hide question text entirely.
- Migration: copy parent flag to all replies, drop parent column (chosen) / keep both fields with reply-overrides-parent semantics.
Outcome: Decisions locked into BUG-031 entry. One-shot SQL migration scoped (3 lines): `ALTER TABLE … ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false; UPDATE … SET … FROM parent; ALTER TABLE tender_clarifications DROP COLUMN is_public;`. Backend filter rewrites + frontend "Another vendor" badge to follow.
Impact: Closes the confidentiality leak. Aligns the data model with the admin UI's per-reply visibility toggle. Vendors get visibility into shared answers without learning who asked — preserves procurement-fairness (everyone sees the same info) without revealing competitive intel (who's bidding).
Related files: New SQL migration in `database/migrations/`, `apps/api/prisma/schema.prisma` (move isPublic field), `apps/api/src/modules/clarifications/clarifications.service.ts` (findAll rewrite + redaction), `apps/web-admin/src/app/(admin)/clarifications/page.tsx` (confirm reply payload), `apps/web-vendor/src/app/(portal)/clarifications/page.tsx` (render "Another vendor" badge). `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-031 entry.

### 2026-05-26 — Technical evaluators: explicit per-tender assignment + email at TECHNICAL_OPENING + 1-evaluator minimum to finalize

Date: 2026-05-26
Decision: A new `tender_evaluators` join table (`tenderId, userId, assignedBy, assignedAt`) records which users (from the pool with TECHNICAL_EVALUATOR role) are assigned to score a specific tender. Admin manages this via an "Assign Evaluators" panel on the tender detail page (visible from status=Approved onward). Only assigned evaluators can call `evaluate()` (others get 403). When `openTechnicalEnvelopes()` succeeds, each assigned evaluator gets an email via a new `TECHNICAL_EVALUATION_READY` template. `finalizeTechnicalResults()` requires at least 1 evaluator to have submitted scores (permissive; can be raised later if compliance demands).
Context: BUG-020 was a Question — "who performs technical evaluation, how are they notified?" The TECHNICAL_EVALUATOR role exists with correct permissions but there's no explicit assignment mechanism. Anyone with the role could score any tender they could see, which after BUG-028 RBAC lands will be only their dept's tenders — but even within a department, formal per-tender assignment is a procurement-defensible model.
Options considered:
- Assignment: explicit per-tender (chosen) / implicit by role+dept / reuse committee model.
- Notification: at TECHNICAL_OPENING (chosen) / at assignment / both.
- Minimum to finalize: 1 (chosen — permissive) / 2 / 3.
Outcome: Decisions locked into BUG-020 entry. Implementation queued.
Impact: Audit clarity ("who was supposed to evaluate, who actually did, when were they told"). Evaluators stop manually polling the portal. Single-evaluator finalisation allowed for v1 but instrumented so the threshold is one-line raise-to-2/3 if compliance later demands.
Related files: New DB migration (`tender_evaluators` table), `apps/api/src/modules/tenders/tenders.service.ts` (assign/unassign methods + status guards), `apps/api/src/modules/technical-evaluation/technical-evaluation.service.ts` (evaluate() assignment check), new email template `TECHNICAL_EVALUATION_READY`, `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (Assign Evaluators panel). `docs/qa/BUG_TRACKER_2026-05-25.md` BUG-020 entry.

### 2026-05-24 — Carry request context (client IP + User-Agent) via AsyncLocalStorage, not explicit threading

Date: 2026-05-24
Decision: A NestJS middleware populates Node's `AsyncLocalStorage` with `{ ipAddress, userAgent }` at the start of every HTTP request; `AuditService.log()` reads those values as fallbacks when the caller didn't pass them explicitly. Express `trust proxy` is set to `1` so `req.ip` reflects the real client (leftmost `X-Forwarded-For`) through the on-host nginx hop.
Context: Reviewing the audit-log viewer after the AUDIT_CHAIN_BREAK rebake exposed two cosmetic-but-important gaps — the Actor column showed UUID prefixes (no `displayName`/`companyName` lookup) and the IP Address / User Agent columns showed `—` for every row (no caller populated them). Fixing the actor name was a single Prisma `include` change. Fixing IP/UA across 37 audit call sites in 15 services was the harder choice.
Options considered:
- A (chosen): Middleware + AsyncLocalStorage. ~80 LOC, 3 new files in `apps/api/src/common/request-context/`. Zero changes to any of the 37 audit call sites or to the controllers that invoke them. Background jobs and scripts (BullMQ workers, the rebake script) run outside the context and correctly produce rows with NULL IP/UA — honest, no fabricated values.
- B: Explicit threading. Add `@Req() req` to every audit-triggering controller method; pass `{ipAddress, userAgent}` into every service method; forward into each `audit.log()` call. ~200–300 LOC of mechanical churn across ~30 files. Easier to grep ("where does this IP come from?") but every future audit call has to remember to thread the args. Test suites for those services would need re-mocking too.
- C: NestJS Interceptor + `REQUEST`-scoped DI. Cleaner in pure-NestJS terms but request-scoped providers force a new module instance per request and have measurable perf impact, especially when injected high in the dependency graph like `AuditService` is.
Outcome: Option A is live on staging. Smoke-tested with `POST /reports/tender_summary/export` + custom `X-Forwarded-For: 203.0.113.42`; the resulting `audit_logs` row 74 carries the exact IP and User-Agent values. Boot-time `verifyChain` still returns `ok=true` (74 rows). Two new unit tests cover the explicit-wins-over-context and context-fallback paths; the audit suite is 20/20, the whole api workspace is 79/79.
Impact: Every `audit.log()` call from within an HTTP request scope automatically attributes the client IP and UA, including the 37 existing call sites that were never updated. The pattern is reusable for any future ambient request data (e.g. trace IDs, tenant scoping). The trade-off — implicit ambient state — is contained to the audit module today; if a second consumer wants the same context (e.g. a request-id logger), the same service injects cleanly. Tests stay deterministic because explicit args always win and the mocked context returns `undefined` by default.
Related files: `apps/api/src/common/request-context/{request-context.service.ts,request-context.middleware.ts,request-context.module.ts}` (new), `apps/api/src/app.module.ts` (middleware wiring), `apps/api/src/main.ts` (trust proxy = 1), `apps/api/src/modules/audit/audit.service.ts` (consumer), `apps/api/src/modules/audit/audit.service.spec.ts` (fallback + precedence tests), `agents/skills/PROJECT_SKILLS.md` ("Per-Request Context via AsyncLocalStorage").

### 2026-05-23 — One-shot audit_logs hash-chain rebake to repair Date-canonicalize asymmetry

Date: 2026-05-23
Decision: Run a one-shot Node script (`apps/api/scripts/rebake-audit-chain.js`) inside the running `ctmp-api` container that disables the `audit_logs_no_update` trigger for the duration of a single transaction, rewrites `prev_hash_chain_value` and `hash_chain_value` on the rows from the first broken id forward, re-enables the trigger, and appends an `AUDIT_CHAIN_REBAKE` audit row recording exactly which ids were rewritten and a link to the RCA document. Run only on staging at this time. The hash columns of 66 rows on staging were edited; no other columns were touched.
Context: The Phase 9 manual testing batch produced 8 `AUDIT_CHAIN_BREAK` security alerts. The RCA (`agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md`) traced the failure to `canonicalize()` in `audit.service.ts` returning `'{}'` for any `Date` (Date has no enumerable own keys), while Prisma's JSONB writer normalises Date to its ISO string via `.toJSON()`. The asymmetry means the write-time hash and the verify-time recomputed hash for any row containing a `Date` in payload disagree. Eight rows on staging matched this pattern. Data was never tampered with — only the *cryptographic proof of integrity* failed to validate. After the canonicalize fix lands, the chain is still broken until the affected rows' hashes are rewritten under the new canonical, because each row's hash also forms the previous-hash input for the next row (cascading break). Two clean paths existed: rebake the chain, or leave the broken rows as a documented exception.
Options considered:
- A (chosen): One-shot rebake script, run inside a single Prisma `$transaction`, advisory-lock held, post-rebake in-txn `verifyChain` runs and aborts the txn on any failure. Eight `security_alerts` rows bulk-acknowledged by the SYSTEM_ADMIN user inside the same txn. AUDIT_CHAIN_REBAKE marker row appended via the normal `audit.log()` path so the change itself is hash-chained, dated, attributed, and references the RCA.
- B: `.toISOString()` defensively at every caller, no rebake, permanent ignore-list in `verifyChain` for the 8 row ids. Cleaner from a "never edit audit_logs" perspective but leaves the canonicalize bug in place (any future contributor passing a Date re-triggers it) and bakes hard-coded row ids into runtime code (a compliance-audit anti-pattern).
- C: Accept the existing alerts as known-state with a permanent annotation, do nothing structural until pre-production cutover. Zero work today but launches with 8 unresolved CRITICAL alerts in the admin UI.
- D: Pure-SQL migration (008_audit_chain_rebake.sql) that implements canonicalise + SHA-256 in plpgsql. Risk of byte-for-byte drift from the JS canonicalize is significant; reimplementing JSONB → canonical-JSON exactly is fragile. The Node script reuses the same `canonicalize()` body that production code uses, so drift is impossible by construction.
Outcome: 66 rows on staging now carry hashes produced under the Date-aware canonicalize. `verifyChain(1000)` returns `ok=true` on subsequent boots. All 8 `AUDIT_CHAIN_BREAK` alerts acknowledged. AUDIT_CHAIN_REBAKE row (id 73) records the operation. The spec invariant "audit logs are append-only and cannot be edited through the application" was deviated from for exactly this one transaction; the deviation is logged here, in the HANDOVER, in the marker row's own metadata, and in the RCA document.
Impact: Audit-chain tamper-evidence is restored on staging. The bug class is closed: `canonicalize` now special-cases `Date` and `Buffer`, both unit-tested. Any future occurrence (e.g. a developer adding a new audit call site that passes a `Decimal` or `BigInt` not handled by Prisma's JSON serializer) would be a different bug — the RCA pattern for diagnosing it remains the diagnostic script + write-time vs verify-time canonical comparison. For production cutover: this same fix must be deployed *before* the production database accumulates any audit_logs rows under the broken canonicalize. If production has already accumulated such rows, the rebake script can be re-run there with the appropriate SYSTEM_ADMIN user id and equivalent post-rebake validation.
Related files: `apps/api/src/modules/audit/audit.service.ts` (the fix), `apps/api/src/modules/audit/audit.service.spec.ts` (regression tests), `apps/api/scripts/rebake-audit-chain.js` (the migration tool), `database/migrations/008_audit_chain_rebake_2026-05-23.sql` (documentation-only marker), `agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md` (root-cause), `agents/handoffs/HANDOVER.md` 2026-05-23 entries (operational record), `agents/skills/PROJECT_SKILLS.md` "Audit Payloads Must Use Primitives Only" (forward-looking guidance for callers).

### 2026-05-22 — Vendor portal ingress moved from :443 to :4201 (upstream routing)

Date: 2026-05-22 (same-day revision of the prior entry)
Decision: Vendor portal HTTPS ingress listens on **port 4201**, not 443. URL is `https://vn.hadiclinic.com.kw:4201/...`. `PUBLIC_API_URL` includes the port. Follows the host's existing per-app-port convention (Citelify :9090, complainmgmt-internal :8443).
Context: The prior entry (same date) put the vhost on :443. That worked from the server itself (curl from localhost returned 200) but the user could not reach it from their network. Server-side firewall was not the cause — iptables default policy is ACCEPT and there are explicit `ACCEPT tcp dpt:443` rules. The blockage is upstream (corporate firewall / NAT / network path) only exposing certain high ports to this host. The pre-existing Citelify config comment ("Port 443 is reserved for another hadiclinic app") now reads as a hint that nothing upstream forwards :443 here at all.
Options considered:
- A (chosen): Move to :4201. Free port adjacent to web-admin (:4200) / web-vendor (:4300), matches the host's per-app-port convention, confirmed reachable by the user.
- B: Diagnose upstream routing and try to get :443 forwarded. Outside our admin scope (corporate network) and would block Phase 9 sign-off for unknown duration.
- C: Use another high port (e.g. :8444, :9095). Functionally identical to :4201; :4201 was chosen because it sits in the CTMP port band (42xx) and is more discoverable to anyone reading the docker-compose port mapping.
- D: Skip HTTPS, just expose :4300 directly. Would not satisfy the hCaptcha hostname check (production key is bound to `vn.hadiclinic.com.kw`, not to `10.1.13.98`).
Outcome: A. Test URL is `https://vn.hadiclinic.com.kw:4201/register`. hCaptcha hostname check is hostname-only (port-agnostic), so the production site key continues to work.
Impact:
- All vendor-portal URLs in docs and test plans gain a `:4201` suffix.
- `PUBLIC_API_URL` is now `https://vn.hadiclinic.com.kw:4201`; rebuild required if it changes again.
- :443 on the host is freed and remains unused (the historical "reserved" comment was always aspirational).
- The same pattern is available for web-admin and any future CTMP frontend (pick another free 4xxx port).
Supersedes: the prior decision entry of the same date (which left :443 bound). That entry is kept in the log for history.
Related files: `/etc/nginx/sites-available/ctmp-vendor-tls.conf` (server-only), `infrastructure/docker/.env` (`PUBLIC_API_URL`), `agents/handoffs/HANDOVER.md` (2026-05-22 ~11:35 entry).

### 2026-05-22 — Vendor portal HTTPS via host nginx on :443 with SNI dispatch

Date: 2026-05-22
Decision: HTTPS ingress for `vn.hadiclinic.com.kw` terminates on the **host** nginx on **port 443** (server_name SNI dispatch), proxying to `ctmp-web-vendor:4300` and `ctmp-api:3000` (`/api/`) over loopback. The vendor portal's `NEXT_PUBLIC_API_URL` was changed to the same hostname to make API calls same-origin.
Context: Host nginx already fronts other apps but each existing tenant uses its **own** TLS port (Citelify on :9090, complainmgmt-internal on :8443). The Citelify config comment said ":443 is reserved for another hadiclinic app" — but nothing was bound to :443 and no such app exists yet. Wildcard `*.HADICLINIC.COM.KW` cert was already on disk. The positive hCaptcha E2E was blocked because the production hCaptcha key is hostname-bound to `vn.hadiclinic.com.kw`, which had no route.
Options considered:
- A (chosen): Use :443 with `server_name vn.hadiclinic.com.kw`. SNI lets future apps coexist on :443 with their own server_name. Same-origin `/api/` proxy avoids browser mixed-content blocking and removes the need for CORS config. URL is the natural `https://vn.hadiclinic.com.kw/...` the team has been writing in docs.
- B: Follow Citelify's per-app-port pattern (e.g. `https://vn.hadiclinic.com.kw:9095`). Keeps :443 free for the (still hypothetical) reserved app. Drawbacks: every doc/URL gains a `:9095` suffix; hCaptcha dashboard hostname check is hostname-only so it still works, but user-facing UX degrades.
- C: Put the vendor portal's own nginx container in front (as complainmgmt does with `complainmgmt-nginx-1` on `:8080/:8443`). Adds a layer; host nginx still has to dispatch to it. More moving parts for the same outcome.
- D: Defer until the "reserved" :443 app surfaces. Pragmatic, but keeps the positive E2E blocked indefinitely.
Outcome: A. If the historical "reserved app" ever materializes, SNI dispatch on :443 lets both vhosts coexist as long as they pick different server_names; only an actual port-bind conflict would force a refactor.
Impact:
- HTTPS now terminates on :443 of the dev host for the first time (host nginx previously served :80 only).
- Vendor portal calls API as same-origin under one hostname — simpler than the previous cross-origin `http://10.1.13.98:3000` arrangement.
- `PUBLIC_API_URL` is now an HTTPS URL baked into the web-vendor build; rebuild required to change it again.
- Other apps on host nginx are untouched (no edit to the `default` vhost; no edit to `citelify-tls.conf`).
- The Citelify config's "another app reserves :443" comment becomes stale. Consider revising it next time someone touches that file so the comment reflects current state.
Related files: `/etc/nginx/sites-available/ctmp-vendor-tls.conf` (server-only, not in repo), `infrastructure/docker/.env` (PUBLIC_API_URL), `agents/handoffs/HANDOVER.md` (2026-05-22 entry).

### 2026-05-22 — Dedicated persistent storage deferred to post-completion

Date: 2026-05-22
Decision: The current storage layout (`STORAGE_DRIVER=local` writing to two Docker named volumes `ctmp_bid_storage` and `ctmp_report_storage` on the shared dev server `10.1.13.98`) is acceptable for pre-launch but **must be replaced with dedicated, wipe-resistant storage post-completion**. Migration, backup policy, restore drill, and full storage-architecture documentation are tracked as a post-launch hardening item (see "Post-Completion / Post-Launch Items" in `agents/backlog/MASTER_TASK_TRACKER.md`).
Context: The 2026-05-19 decision introduced the `StorageBackend` abstraction (local + S3) but the on-prem deployment runs the local backend. The volumes live under `/mnt/repo/docker/volumes/...` on a multi-tenant dev host. A `docker compose down -v`, `docker volume rm`, or host-side accidental delete would wipe vendor-submitted bid documents and generated reports — artefacts that are legally/audit-sensitive in a procurement system. The user explicitly directed that this hardening be deferred until after project completion to avoid scope creep on the MVP, but recorded so it is not forgotten.
Options considered:
- A (chosen): Defer to post-completion. Log the work item in the tracker + decision log + project memory so it surfaces in future sessions. Keep MVP timeline clean.
- B: Pull into pre-launch hardening. Risks scope creep and delays sign-off. Storage is "good enough for pilot" today.
- C: Switch `STORAGE_DRIVER=s3` now, point at the already-running `ctmp-minio`, defer the backup/replication story to post-launch. Half-measure — gives object storage semantics but leaves the same single-host data-loss exposure.
Outcome: A. Recorded in tracker under a new "Post-Completion / Post-Launch Items" heading.
Impact: No code or infrastructure change today. A documented, durable backlog item for post-launch hardening, with explicit triggers ("pilot vendors uploading non-recoverable bids", "dev-host disk-pressure or multi-tenant event") that would re-prioritize earlier.
Related files: `agents/backlog/MASTER_TASK_TRACKER.md` (Post-Completion section), `agents/handoffs/HANDOVER.md` (2026-05-22 entry), prior decision "Storage backend abstraction" 2026-05-19.

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

`api-contracts/openapi/ctmp.openapi.yaml`, `ctmp-platform/.spectral.yaml`

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

