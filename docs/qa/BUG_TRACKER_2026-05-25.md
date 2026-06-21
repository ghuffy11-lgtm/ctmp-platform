# CTMP E2E Bug Tracker — Run starting 2026-05-25

Living document. Bugs discovered during E2E manual testing (against staging `10.1.13.98`) are captured below as `BUG-NNN`. When a fix lands, mark **Status = Fixed** and add commit/PR ref + verification line.

The user reports observations in chat → this doc captures them with file:line root cause → fixes happen in later, separate sessions.

## Legend

- **Status:** `Open` | `In Progress` | `Fixed` | `Won't Fix` | `Not a bug`
- **Severity:**
  - `Critical` — blocks the procurement workflow OR violates a compliance rule (immutability, sealing, audit). Cannot ship.
  - `High` — blocks a user flow but a workaround exists. Must fix soon.
  - `Medium` — incorrect behaviour with low impact, or significant UX issue.
  - `Low` — cosmetic / minor UX.

---

## Summary

### Open

| ID | Sev | Type | Component | One-line symptom |
|---|---|---|---|---|
| BUG-016 | High | Feature | Admin → Tender → Publish | Notification dispatch on publish — deferred; needs new notification templates + recipient enumeration. Partially addressed by BUG-062 (committee-session invitation template pattern + module wiring), but the on-publish dispatch is still TODO. |
| BUG-017 | Medium | Feature | Admin → Clarifications | Attachments on questions + replies — deferred; needs new DB tables + storage service + UI |
| BUG-018 | Medium | Bug | Admin → Clarifications | Print shipped; Export disabled with tooltip ("Coming in next release — depends on Reports module renderer") |
| BUG-028 | Critical | Feature | Admin RBAC enforcement | Part A (Sidebar gating) shipped 2026-05-27. Part B Tenders dept-scoping shipped 2026-05-29 (BUG-050) + extended for cross-dept committee/evaluator visibility 2026-05-30 (BUG-062). Same dept-scoping pattern still TODO for clarifications / audit / reports / technical-evaluation / committee / commercial-comparison lists (originally tracked as BUG-051). |
| Theme 3 | — | Feature | Cross-app | WALK-053 (unified Tender Summary view) + WALK-055 (overall Phase D flow simplification). Held by owner directive 2026-05-30 until owner-verification of Themes D–J passes. See `docs/qa/WALKTHROUGH_TRACKER_2026-05-29.md` "Locked directive" header. |

### In progress
*(none)*

### Fixed

| ID | Sev | Type | Component | Fixed | Notes |
|---|---|---|---|---|---|
| BUG-151 | High | Security | Vendor portal pre-launch hardening pack (throttling + forgot-password + JWT + cookies + token msgs + CSP) | 2026-06-22 | **Shipped.** Pre-launch security review identified `ThrottlerModule.forRoot()` was dead code — never bound globally — so every anonymous endpoint was uncapped. Forgot-password specifically had no CAPTCHA, no per-email cooldown, synchronous-await SMTP (timing oracle), no audit log. JWT secrets had `?? ''` fallbacks that would silently accept attacker-minted empty-secret tokens if env was missing. Token errors gave 3 distinct messages (state oracle). Helmet was bare (no CSP). Vendor cookies had `secure: false` + no expiry. **Six-phase fix:** (1) `APP_GUARD: ThrottlerGuard` bound globally in `app.module.ts` + per-endpoint `@Throttle()` on register / upload / login / verify-email / forgot-password / reset-password / mfa/verify. (2) `forgot-password.dto.ts` requires `captchaToken`; service validates via `CaptchaService.validate`, applies 60s per-email cooldown skipping send, audits each attempt with sha256-truncated email hash, fires SMTP via `setImmediate` for constant response time; `forgot-password/page.tsx` ships hCaptcha widget. (3) `jwt.config.ts` `requireSecret()` helper throws at boot if any of 4 JWT secrets is missing or < 32 chars. (4) Vendor cookie `secure: true` in HTTPS context + `expires` matching JWT TTL (1d access / 7d refresh). (5) `verifyEmail` + `resetPassword` collapsed 3 messages → 1 generic "Invalid or expired token"; details kept in server logs. (6) `main.ts` helmet config: explicit CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, no-referrer, same-site CORP. **Verified on staging:** typecheck clean both apps; rebuild + recreate clean; throttler proven live (12 GETs → 10×200 + 2×429); forgot-password CAPTCHA enforced (no captchaToken → 400); all deployed dist markers present (APP_GUARD, VENDOR_PASSWORD_RESET_REQUESTED, requireSecret×5, "Invalid or expired"×8, frame-ancestors); vendor chunk ships hCaptcha widget. **Deferred follow-ups (NOT blocking go-live):** BUG-152 DB-backed pending uploads, BUG-153 httpOnly server-set cookies, BUG-154 encrypt mfa_secret, BUG-155 single-use MFA temp jti, BUG-156 RefreshTokenDto + access-token revocation, BUG-157 prod-CORS guard, BUG-158 verify-email button-click. **Production env requirements** documented in HANDOVER top entry. Locked-rule: no master-plan amendment. |
| BUG-150 | High | Bug + Feature | Award Minutes PDF — financial values + technical/commercial/negotiation detail | 2026-06-21 | **Fixed + owner-verified ("its good").** Pre-fix the PDF only read `commercialEvaluations` for prices — bids priced via BoQ or Negotiation rendered "—". Owner also wanted full decision-record detail. Single-file rewrite in `apps/api/src/modules/award/award-minutes.service.ts`: (1) `collectData()` now inlines the same 3-source resolver chain as `award.service.resolveBidWinningPrice` (Negotiation → BoQ → CommercialEvaluation) for every bid; loads tender BoQ template, technical criteria, all bids with full nested data (commercialEvaluations + bidBoqItems + negotiationInvitations + per-criterion scores), tender-wide negotiation rounds matrix; rescales per-criterion scores from 0–100 storage to criterion maxScore. (2) `AwardMinutesData` extended with `BidEntry.originalPrice/negotiatedPrice/finalPrice/boqLines/negotiationRows/perCriterionScores` + new top-level `criteria[]/negotiationRounds[]/boqTemplate[]`. (3) `renderHtml()` — "All Bids Considered" table gains Original/Negotiated/Final price columns. Three new conditional sections: "Technical Evaluation — Per-Criterion Scores" matrix (criteria rows × vendor columns, MANDATORY badges + weight + Overall PASS/FAIL row); "Commercial Comparison — BoQ Line Items" matrix when BoQ used (item rows × vendor columns + BoQ Total row); "Negotiation Rounds" matrix when any round happened (Original baseline + per-round rows × vendor columns with % vs original + Final price row). Decision summary box gains Budgeted line. New CSS for matrix tables. Verified: typecheck clean; rebuild + recreate; deployed dist has all section strings + 13× originalPrice. Locked-rule: audit append-only respected (PDF generation row still written per call); no master-plan amendment needed. |
| BUG-149 | Medium | Bug | Award override text: UI said 50-char min, backend enforced 100 (+ second-pass service-layer 50-char gate) | 2026-06-21 | **Fixed + owner-verified.** Owner reported the mismatch — UI text reads "Minimum 50 characters" but backend rejects under 100. Per owner directive, reduce to **20 characters for all comments**. Phase 1: `confirm-award.dto.ts` + `amend-award.dto.ts` `@MinLength(100)` → `@MinLength(20)`; UI strings in `AwardConfirmDialog.tsx`/`AmendAwardDialog.tsx`/`VendorComparisonCard.tsx` all 50/100 → 20. Other comment fields already at 20. **Phase 2 (same-day follow-up):** owner hit a 400 anyway because `award.service.confirmAward` had a SECOND hard-coded `length < 50` check that short-circuited before the DTO. Updated that branch to 20 + reworded the two BadRequestException messages ("Override award requires written justification (min 20 chars)." and "Awarding a technically-FAIL vendor requires written justification (min 20 chars)."). Source-of-truth aligned at 20 across DTO + service + UI. Verified: deployed `dist/modules/award/award.service.js` shows 2× "min 20 chars" and 0× "min 50 chars". |
| BUG-148 | High | Bug + Feature | Unified quorum rule + post-hoc committee session amend | 2026-06-21 | **Fixed.** Owner reported TDR-2026-0024 stuck: commercial envelopes opened with 3/4 present + `required_quorum_count = 4`; award now blocked with "Need 1 more member(s) present" and no UI lever to fix it. Root cause: two different quorum gates that disagreed. `committee.service.openEnvelopes()` used a majority rule (`present*2 >= members.length`) so 3/4 passed at opening; `award.service.quorum()` used `required_quorum_count` so 3<4 blocked at award. Owner picked **Option C** — fix the rule at source AND build the lever. **Backend** unified `openEnvelopes()` quorum check to consult `required_quorum_count` + `required_role_code` (falls back to majority when `required_quorum_count` is unset for legacy sessions). New `amendSession()` service method + `AmendSessionDto` (optional `requiredQuorumCount` / `requiredRoleCode` / `attendeeIds[]` + required `reason` ≥20 chars). New `PATCH /committee-sessions/:sessionId/amend` route gated by `committee:create_session`. Writes HIGH `COMMITTEE_SESSION_AMENDED` audit row with full before+after snapshot (member list + presence flags + quorum config) and reason text. **Admin UI** — "Amend session" link in committee-opening page session-header strip, visible only when `session.status === 'COMPLETED'` and caller has `committee:create_session`. Modal with required-quorum number input + required-role text input + per-member attendance checkboxes + mandatory reason textarea (≥20 chars). Verified: typecheck clean; rebuild + recreate; `ctmp-api` healthy; deployed dist contains `amendSession` + `COMMITTEE_SESSION_AMENDED` markers. Pending owner walkthrough: use the new dialog on TDR-2026-0024 to either lower required quorum to 3 or mark Finance present + type reason → save → award unblocks. **Locked-rule:** audit append-only respected (amend writes a new audit row, doesn't edit existing); separation of duties unchanged. |
| BUG-147 | High | Feature | Clarifications go two-way + full active lifecycle + admin can initiate to vendor | 2026-06-21 | **Fixed + owner-verified.** Closes the BUG-141 half-job and three coupled gaps: (1) vendor couldn't ask on TDR-2026-0019 (NEGOTIATION) — both whitelists excluded it; (2) engineers had no UI to ask vendors mid-evaluation; (3) vendors couldn't reply when admin asked them. **Migration 045** makes `tender_clarification_replies.replied_by_user_id` nullable + adds `replied_by_vendor_user_id UUID NULL` with FK to `vendor_users(id)` + index + check constraint enforcing exactly-one-of. **Backend** — module constant `CLARIFICATION_ALLOWED_STATES` covers full active lifecycle (`PUBLISHED → AWARDED`, excluding pre-publish + terminal); used by both `create()` and picker so whitelists can't drift. `CreateClarificationDto` gains optional `targetVendorId` (UUID); `create()` requires it when caller is admin + verifies target vendor is engaged (invited or has bid). `reply()` allows vendor caller on own threads + admin caller with `clarification:reply`; status flips OPEN on vendor reply / ANSWERED on admin reply. `findAll()` exposes `askedByAdmin`, `askedByName`, per-reply `repliedByAdmin`. Controller switched reply guard from `JwtAuthGuard + PermissionsGuard` to `OptionalVendorOrUserGuard` (perm check moved into service since vendor tokens lack `permissions[]`). **Admin UI** — new "+ Ask vendor a question" button on per-tender Clarifications tab + `AskVendorDialog` modal (vendor picker sourced from `/tenders/:id/bids`, deduped, question textarea ≥10 chars). Old `ClarificationReplyForm` leftover `isPublic` checkbox (missed in BUG-145) cleaned up. **Vendor UI** — `FROM PROCUREMENT` chip on admin-initiated threads + `VendorReplyForm` shown when ball is in vendor's court (admin asked + no reply, or latest reply is from admin). Verified on staging: migration applied; 3 containers rebuilt + healthy; deployed dist contains all expected markers. Owner end-to-end walkthrough on TDR-2026-0019 confirmed working — vendor sees tender + asks + replies; admin asks vendor + sees replies; cross-vendor privacy holds. Locked-rule: BUG-145 privacy rule still applies (every thread private to the specific asking-vendor / asked-vendor pair). |
| BUG-146 | High | Bug | Vendor portal clarification picker missed tenders past Clarification Period | 2026-06-21 | **Fixed.** Owner reported on TDR-2026-0025 (Technical Evaluation): vendor portal `/clarifications` showed no threads even though the vendor had asked questions earlier. Root cause: my BUG-145 frontend `ELIGIBLE_STATUSES` expansion was wishful thinking — the picker iterates `GET /tenders?status=…` but `tenders.service.ts:189-205` intentionally restricts vendors to seeing tenders in `PUBLISHED \| CLARIFICATION_PERIOD \| NEGOTIATION` only (per owner: vendors must not see commercial / award state via the regular list). So the tender never reached the picker. **Owner directive:** "we do not want to show vendor any status of commercial, just clarifications if requested by engineer or manager to appear in vendor portal so they can reply back." Targeted fix only — must NOT widen tender visibility. **Backend:** new `ClarificationsService.myTendersWithClarifications(user)` queries `tenderClarification.where.vendorId = user.vendorId`, dedupes by tender id (most-recent first), returns `[{ id, referenceNumber, title, status }]`. Skips tender visibility filter — only exposes the *identity* of tenders the vendor *already has a thread on*. Module-local `TENDER_STATUS_LABEL` map humanises the Prisma enum to the label form the frontend StatusBadge expects. New route `GET /vendor/clarification-tenders` guarded by `VendorJwtAuthGuard`. **Frontend:** vendor portal picker switched from `Promise.all(ELIGIBLE_STATUSES.map(s => GET /tenders?status=s))` to a single `GET /vendor/clarification-tenders` call. Old `ELIGIBLE_STATUSES` array removed. The existing `GET /tenders/:tenderId/clarifications` endpoint already enforces vendor-id ownership (BUG-145), doesn't gate on tender visibility — so once picker has tenderId, fetching threads works. **Not in scope (flagged for follow-up BUG-147 candidate):** admin currently has NO UI to *ask* a vendor a question; `CreateClarificationDto` has only `question`, no `targetVendorId`. If owner wants admins to *initiate* clarifications to vendors, extend DTO + add admin UI + set `vendor.connect` when admin caller provides target. Verified: typecheck clean both apps. Locked-rule: tender visibility unchanged. |
| BUG-145 | Medium | UX/Privacy | Clarification replies always private; vendor portal picker expanded | 2026-06-19 | **Fixed.** Owner directive: "make it private all clarification answer. Remove public reply, just keep private with vendor no public." Plus: "Vendor portal clarification is not appearing in clarification." Two coupled fixes. **(1) All replies private.** Backend `ReplyClarificationDto` drops the `isPublic` field; `clarifications.service.findAll()` simplifies the vendor branch to `where.vendorId = user.vendorId` (vendor sees own threads only — the old `or public-reply-exists` clause is gone). `reply()` writes `isPublic: false` unconditionally. Response `visibility` field hard-pinned to `'PRIVATE_TO_VENDOR'` for backwards-compat. **Admin UI** drops the `ReplyVisibility` type, useState, Private/Public toggle row, lock-vs-globe chip in both collapsed + expanded thread cards, and the now-unused `Globe` import. Replaced with a single-line lock-icon notice: "Replies are private to the asking vendor." Reply POST sends just `{ reply }`. **Vendor UI** drops the public/private chip computation and hard-renders `PRIVATE` (neutral tone). **(2) Vendor picker expansion.** The vendor portal `ELIGIBLE_STATUSES` was `['Published', 'Clarification Period']` only — so any tender past Clarification Period dropped off the picker, hiding both old threads and any new admin replies. Expanded to the full vendor-visible lifecycle (Published, Clarification Period, Submission Closed, Technical Opening, Technical Evaluation, Commercial Sealed, Committee Commercial Opening, Commercial Evaluation / Comparison, Negotiation, Award Recommendation, Awarded). Header subtitle reworded ("All replies are private to your company."). Empty-state copy reworded. Historical rows with `isPublic = TRUE` on staging are neutralised by the new query (vendor-id-only filter) and the response-visibility pin — no migration needed; the column stays for audit. Verified: typecheck clean on all 3 apps. Locked-rule: not affected. |
| BUG-144 | High | Bug | Email URLs were relative (not full hostnames) — cross-cutting | 2026-06-19 | **Fixed.** Owner noticed BUG-143's verification email landed with `/technical-evaluation?tenderId=…` instead of an absolute URL. Root cause: `app.adminPortalUrl` was never registered in `apps/api/src/config/app.config.ts`, so `this.config.get('app.adminPortalUrl')` returned `undefined` and every dispatch site fell back to its `?? ''` empty branch → relative URL. Same gap for `vendor.portalUrl`. Plus `vendor-verify-email` template referenced `{{verifyUrl}}` but dispatch only passed `{ token }`, so the rendered email body shipped with the literal `{{verifyUrl}}` text. **Fix:** registered `app.adminPortalUrl` + `app.vendorPortalUrl` in `app.config.ts` with **hardcoded staging-URL defaults** (`https://ctmp-admin.hadiclinic.com.kw:4202` + `https://vn.hadiclinic.com.kw:4201`); trailing slashes stripped at registration time. Updated 5 dispatch modules to use the new keys + dropped all `vendorPortalUrl ? `${url}/path` : `/path`` ternaries (the relative fallback was dead code masking the bug): `vendor-auth.service.ts` (register adds verifyUrl + reset uses new key), `award.service.ts` (winner/loser emails), `negotiation.service.ts` (TENDER_NEGOTIATION_LAUNCHED), `tenders.service.ts` (TENDER_INVITATION_SENT + REMINDER), `technical-evaluation.service.ts` (both BUG-140 finalize + BUG-143 open). 9 active URL-bearing templates audited; `COMMITTEE_SESSION_INVITATION` body has no URL token (per BUG-126 migration 036) so no change there. **Also fixed:** pre-existing test gap in `vendor-auth.service.spec.ts` where `SystemSettingsService` + `VendorDocumentStorageService` providers were missing (introduced silently by BUG-137); added mocks; 34/34 tests now pass (was 0/34). Verified on staging: `Built` line; deployed `dist/config/app.config.js` contains both URL constants; all 5 service `.js` files reference the new config keys. End-to-end smoke (owner-side): trigger a vendor invitation / open technical envelopes / finalize technical / reset vendor password — confirm each email body renders absolute `https://…` URLs. Locked-rule: not affected; `notifications.email_override` still applies. |
| BUG-143 | Medium | Feature | Evaluator email on `TECHNICAL_ENVELOPES_OPENED` (closes deferred BUG-020) | 2026-06-19 | **Fixed.** Same-day Q from the BUG-142 walkthrough — owner asked whether engineers get an email when technical envelopes open; answer was no, the long-standing BUG-020 deferred item. Wired the dispatch. **Migration 044** seeds new `notification_templates` row `TECHNICAL_ENVELOPES_OPENED_EVALUATOR` (EMAIL, en, active). Subject `[{{systemName}}] Technical envelopes opened — {{tenderReference}}`. Body tokens: `evaluatorName`, `tenderReference`, `tenderTitle`, `submissionCount`, `newStatus`, `departmentName`, `tenderUrl` (deep-links to `/technical-evaluation?tenderId=…`), `systemName`. **Backend:** `technical-evaluation.service.openEnvelopes()` now calls best-effort `dispatchOpenedEmail()` after the audit log. New private method resolves recipients via `prisma.user.findMany({ status: ACTIVE, userRoles ∋ TECHNICAL_EVALUATOR, userDepartments ∋ tender.departmentId })` — dept-scoped (separation of duties; system-admins NOT included). Per-recipient try/catch inside the loop so one bad email doesn't kill the rest. Writes a single `TECHNICAL_OPENED_EMAIL_SENT` LOW audit row with the recipient list; the empty case still audits with `recipientCount: 0, reason: 'no_active_evaluators_in_department'` so the operational gap is visible. **Locked-rule:** no master-plan amendment. `notifications.email_override` (BUG-121) still applies. Verified: typecheck clean; migration applied on staging (`INSERT 0 1`); template row visible; api rebuild + recreate left for the verification stamp once the build notification lands. Cross-dept committee evaluators (BUG-062) intentionally excluded from V1 — owner can extend the filter to drop the `userDepartments` join later if engineers borrowed from other depts are missing the email. |
| BUG-142 | Medium | UX | Bid supporting documents relocated from Bids tab → Commercial Comparison per-vendor card | 2026-06-19 | **Fixed.** Owner walkthrough rejected BUG-139's placement of supporting documents inside the Bids tab on `/tenders/[id]` — Bids tab is a status roster, supporting documents are commercial-side secondary evidence (certificates, authorisation letters) that belong next to the priced offer. **Frontend:** new `apps/web-admin/src/components/SupportingDocumentsList.tsx` (near-copy of `CommercialDocumentsList.tsx`; gates on `commercialEnvelopeStatus === 'OPENED'`, fetches `/bids/:bidId/supporting-documents`, View/Download with `usePdfViewer`). Slotted into `VendorComparisonCard.tsx` as new Block 3b between "Commercial documents" and "Vendor profile". Bids tab stripped of all supporting-doc UI — interface, state, fetch effect, render rows, and `SupportingDocActions` helper all removed; tab returns to BUG-131 shape (initial rows + amber Round-N rows only). **Backend:** `bids.service.ts` helper renamed `bothEnvelopesOpened` → `commercialEnvelopeOpened` (commercial-only check); both call sites (`listSupportingDocuments`, `streamSupportingDocument`) updated; 403 message reworded to `Supporting documents become visible once the commercial envelope is opened.` In normal flow commercial-OPEN implies technical-OPEN (committee commercial opening always follows technical opening), so this is a strict loosening within the common path — no extra disclosure risk. **Not a bug** but flagged in same owner message: "commercial document under technical comparison" — confirmed clean; `/technical-comparison` and `VendorTechnicalCard` only call `/bids/:bidId/envelopes/TECHNICAL/documents`. **Verification:** typecheck clean on api+web-admin (`nest build` exit 0; `next build` 26/26 static pages, no errors). Audit events (`BID_SUPPORTING_DOCUMENT_VIEWED/_DOWNLOADED`) fire unchanged. Locked-rule: no master-plan amendment. |
| BUG-141 | High | Feature | Clarifications during evaluation + extend-submission re-open | 2026-06-19 | **Fixed.** Two coupled additions. **(1) Clarification gate:** `clarifications.service.ts:create()` whitelist now includes `TECHNICAL_EVALUATION` + `COMMERCIAL_EVALUATION` alongside the existing `PUBLISHED` + `CLARIFICATION_PERIOD`. Engineers/evaluators (and vendors if needed) can post new clarifications mid-evaluation. No permission change. **(2) Extend submission:** new `ExtendSubmissionDto` + `tenders.service.extendSubmission()` + `POST /tenders/:id/extend-submission` route (gated by `tender:close_submission` — symmetric with close). Reverts a `Submission Closed` tender to `Published` with a new future deadline. Rejects any other source state (e.g. `Commercial Sealed` → 400 with clear message). Validates new deadline is in the future + parseable; optional new clarification deadline. Existing submitted bids unaffected (immutability respected). Audit `TENDER_SUBMISSION_EXTENDED` HIGH with before/after deadlines + reason. **Frontend:** new `ExtendSubmissionDialog.tsx` (amber, date+time picker, ≥20-char reason, default +7 days). Action bar shows "Extend Submission" button only when `status === Submission Closed && perms.closeSub`. **Verified on staging:** typecheck clean; rebuild + restart 200; negative test confirms 400 with correct "Extension only supported from Submission Closed" message when called on a `Commercial Sealed` tender. Locked-rule: bid immutability respected. |
| BUG-140 | Medium | Feature | Manager email when technical evaluation phase is finalised | 2026-06-19 | **Fixed.** Owner asked whether engineers finishing technical evaluation triggered a manager email — no, the existing `finalize()` did state updates + audit only. **Migration 043** seeds a new `TECHNICAL_EVALUATION_FINALIZED` notification template (subject `[{{systemName}}] Technical evaluation complete — {{tenderReference}}`; body lists tender ref/title + total bids + PASS/FAIL counts + distinct evaluator names + the new `Commercial Sealed` status + tender URL). **Backend:** `technical-evaluation.module.ts` imports `NotificationsModule`; `technical-evaluation.service.ts` injects `NotificationsService` + `ConfigService`; new private `dispatchFinalizedEmail()` called after the finalize transaction commits and the `TECHNICAL_RESULTS_FINALIZED` audit. Recipient resolution: `tender.owningUser` → `tender.createdByUser` fallback; both fields select `displayName` + `email`. Distinct evaluators gathered across all bids' `technicalEvaluations.evaluatorUser`. Dispatch is best-effort (logger.warn on failure, finalize never rolls back). New audit event `TECHNICAL_FINALIZED_EMAIL_SENT` LOW so the send is discoverable. **Verified on staging:** migration applied; template row present; API rebuilt + health 200. End-to-end requires owner to walk a tender through finalize — `notifications.email_override` (BUG-121) still in effect if set. Locked-rule: no master-plan amendment. |
| BUG-139 | High | Security/UX | Bid supporting docs hidden until both envelopes OPENED | 2026-06-19 | **Fixed.** Walkthrough follow-up to BUG-137. Owner asked supporting documents to follow the same secrecy model as the technical + commercial envelopes. **Backend:** new private helper `BidsService.bothEnvelopesOpened()` checks both envelopes have `EnvelopeStatus.OPENED`. `listSupportingDocuments` + `streamSupportingDocument` now throw 403 for non-vendor callers unless both envelopes are open. Vendor's own bid: always accessible (own data). **Frontend:** BidsTabPanel skips the per-bid supporting-doc fetch when the row's envelope statuses aren't both `OPENED`; render also guarded on `bothOpened` for defence in depth. **Verified on staging:** end-to-end smoke shows SUBMITTED/SUBMITTED → 403, OPENED/OPENED → 200, LOCKED/LOCKED → 403 (matches existing envelope-doc gate). **Locked-rule:** reinforces "Commercial envelopes open only through an official committee commercial opening session" + "Technical envelopes open only after Submission Closed" by extending the same lifecycle gate to supporting documents. |
| BUG-138 | Medium | Bug + UX | Trim vendor doc slots + fix supporting-docs multi-upload 400 | 2026-06-19 | **Fixed.** Walkthrough follow-up to BUG-137. (1) Slot list trimmed to **Commercial License (required)**, **Authorisation Letter (optional)**, **Other (optional multi)** — AUTHORISED_REPRESENTATIVE_ID + TAX_CERTIFICATE dropped per owner directive. Backend + frontend constants synced. Admin label map keeps the dropped codes for historical row display. Unit-test fixture updated. (2) Bid supporting docs returned `400 Bad Request` when a vendor re-uploaded the same PDF — caused by the `UNIQUE(bid_id, checksum_sha256)` index I added in BUG-137 as accidental-double-click protection. Migration 042 drops the index; Prisma schema mirrors; the service's P2002 catch is removed. Verified on staging: `\d bid_supporting_documents` shows only PK + bid_id index remain; deployed register chunk contains `AUTHORISATION_LETTER` and not `AUTHORISED_REPRESENTATIVE_ID`. Locked-rule: not affected. |
| BUG-137 | High | Feature | Vendor registration docs + bid supporting docs + mandatory commercial PDF | 2026-06-19 | **Fixed.** Three coupled additions to vendor/bid/tender flows around PDF document handling. **Migration 041:** `tenders.requires_supporting_documents BOOLEAN DEFAULT false` + new `bid_supporting_documents` table. No change to existing `VendorDocument` model (already supports `documentType`). **Backend:** new `vendor-document-types.ts` constant (5 slots — COMMERCIAL_LICENSE+AUTHORISED_REPRESENTATIVE_ID required, others optional); new `VendorDocumentStorageService` (namespace `vendor-registration-documents`) + `BidSupportingDocumentStorageService` (namespace `bid-supporting-documents`); anonymous `POST /vendor-auth/registration-documents/upload` (15-min pending TTL — same pattern as BUG-129 negotiation); `register()` extended to validate required types + persist `VendorDocument` rows transactionally; admin endpoints `GET /vendors/:id/documents`, `/view`, `/download` with `OptionalVendorOrUserGuard` + audit `VENDOR_DOCUMENT_VIEWED/_DOWNLOADED` HIGH before stream. New bid endpoints `GET/POST/DELETE /bids/:id/supporting-documents` + `/view` + `/download`; unique `(bid_id, checksum_sha256)` index dedupes; new audit events `BID_SUPPORTING_DOCUMENT_*`. **`bids.submit()` rewritten:** BoQ exception removed (commercial PDF always required); supporting-doc gate added when `tender.requiresSupportingDocuments`; supporting docs `locked_at` set on submit. **Tender DTO** gains `requiresSupportingDocuments` (CreateTenderDto + UpdateTenderDto via PartialType); serializer emits it. **Frontend:** vendor register page gets named-slot upload section (5 slots); admin vendor profile shows registration docs with View/Download; admin tender create + edit page gets checkbox; vendor bid wizard's step list switched from numeric to name-based switching so the conditional Supporting Documents step inserts cleanly between Commercial PDF and Review; admin Bids tab shows blue-tinted supporting-doc child row per file with View/Download. **Verification:** typecheck clean on api+web-admin+web-vendor; pruned 58GB before rebuild (BUG-118 disk lesson — staging was at 94%); migration applied; all three services rebuilt with `Built` lines; deployed chunks contain `COMMERCIAL_LICENSE`, `Supporting Documents`, `requiresSupportingDocuments` markers. Locked-rule: commercial-PDF-always-required reaffirms BUG-112; bid immutability respected — supporting docs `locked_at` on submit. |
| BUG-135 | High | Bug + Feature | Department KPIs aligned with main dashboard + drill-downs | 2026-06-15 | **Fixed.** Owner reported `/executive/departments` + `/executive/departments/:id` showed different numbers than the main dashboard. Cause: BUG-133's correctness fix only landed on the main `executiveSummary()`; the dept endpoints kept pre-fix logic (createdAt-year scoping, included cancelled, no BoQ in resolver include, clamped savings). **Backend:** `_loadAwardedTendersForVendors` extended to return `estimatedBudget`, `createdAt`, `submissionCloseAt` — every caller now has the meta fields needed without a side-query. `departmentOverview` + `getDepartmentProfile` both rewritten to mirror `executiveSummary`'s rules: awarded set from the resolver-priced loader, scoped by `awardedAt`-year + excludes CANCELLED; estimated set scoped by `createdAt`-year + excludes CANCELLED; active pipeline across all years; savings clamp removed. `listExecutiveTenders` now composes status filters via `where.AND` (so multiple coexist) and auto-excludes CANCELLED whenever `hasAward` or `awardedYear` is set — keeps drill-down counts consistent with the headline KPI. **Frontend:** `Stat` + `SummaryCard` components on the dept profile + directory pages gain optional `href` (clickable Link) + `negative` (red value on cost overrun). All 8 dept-profile KPI tiles drill into a dept-scoped `/executive/tenders` filtered list; all 4 directory totals tiles drill into the org-wide filtered list. Realised Savings sub-line on both pages updated to BUG-134's `Awarded X of Y KWD budgeted` pattern. Dept row → profile link unchanged. **Verification on staging:** main dashboard `Awarded Value 47,150 / Estimated 279,999` matches dept overview totals exactly; "Facilities Management" dept-profile reads `Awarded 34,000 / Estimated 160,000 / Savings 16,000 / Active 110,000` consistent with its dept row; drill-down `?departmentId=facilities&awardedYear=2026&hasAward=true` returns 3 tenders / 34,000 KWD — matches dept row exactly (post the `where.AND` CANCELLED-exclusion fix). |
| BUG-134 | Low | UX/Copy | Realised Savings sub-line wording | 2026-06-15 | **Fixed.** Walkthrough follow-up to BUG-133. Owner read the existing sub-line `2.7K of 150K KWD estimated` as a progress fraction ("we've done 2.7 out of 150") rather than "we saved 2.7K against a 150K budget". Reworded to `Awarded {derived awarded total} of {budgeted total} KWD budgeted` so the two side-by-side numbers tell the story; the savings (main tile value) is the visible gap between them. The awarded total is derived in-place as `denominator − numerator` from the existing KpiCard fields — no backend or response-shape change. In the negative-savings case (cost overrun) the sub-line reads naturally too (e.g. `Awarded 155K of 150K KWD budgeted`) while the main value remains red. Verified: deployed chunk `app/(admin)/executive/page-a8a4985019080a3f.js` contains `KWD budgeted` marker; zero hits for the old `KWD estimated` string. Single-file change in `apps/web-admin/src/app/(admin)/executive/page.tsx`. |
| BUG-133 | High | Bug + Feature | Executive dashboard — correctness fix + drill-downs | 2026-06-14 | **Fixed.** Closes the long-deferred BUG-088 root cause + extends the existing read-side resolver + makes every KPI tile and breakdown row drillable. Owner symptom was "Vendor1: 4 awarded tenders, 3 show blank" — root cause was twofold: (a) `tenders.awarded_amount` was NULL on every awarded tender (the confirm/amend/approve paths never wrote it), (b) the analytics resolver didn't look at BoQ-derived prices, so modern BoQ-priced tenders read as 0 even when the data was there. **Backend:** new `award.service.resolveBidWinningPrice(bidId)` (canonical 3-source chain — negotiation → BoQ → CommercialEvaluation); 3 award sites now write `awardedAmount` on tender update. `_resolveAwardedAmount` extended with BoQ as priority #2; `_loadAwardedTendersForVendors` now eagerly loads `bidBoqItems`. Main `executiveSummary()` rewritten to use the resolver-priced loader, switched year filter to `awardedAt`-year for Awarded Value / Realised Savings / Awarded Tenders / Avg Days to Award, excludes cancelled-after-award from awarded sets, excludes cancelled from Estimated Value side, drops the `max(0,…)` clamp so overruns appear as negative savings, returns null for empty cycle time. New 9th KPI **Negotiation Savings** aggregating `_resolveNegotiationSavings`. New `listExecutiveTenders()` service + `GET /analytics/tenders-list` route (gated by `executive:dashboard`). Migration 039 backfills `tenders.awarded_amount` across historical awards using the same 3-source chain. **Frontend (admin):** every KPI tile wrapped in `<Link>` with `drillDownHrefForKpi()` helper; new sky-palette Negotiation Savings tile; Realised Savings + Savings Rate render red when negative; Active Pipeline tile labelled "(all years)"; By-Department / By-Category / Active-Pipeline-list rows clickable; new `/executive/tenders` filtered list page (Suspense-wrapped). `KpiCard.value` type widened to `number \| null` so empty days renders "—". **Verification on staging:** typecheck clean; migration 039 backfilled 7 tenders (4 BoQ, 3 CommercialEvaluation); API health 200; smoke-test confirms Awarded Value=147,250 KWD (was 0), Top Vendor "Acme Builders LLC" 100,000 KWD (was 0 share), Realised Savings=2,749 KWD, 7 awarded tenders, `/analytics/tenders-list?awardedYear=2026&hasAward=true` returns 7 rows ranked correctly. Locked-rule: no master-plan amendment; bid immutability respected. |
| BUG-132 | High | Feature | Hold (Suspend) + Resume + Cancel-from-any-state with cascade | 2026-06-14 | **Fixed.** Owner needed Hold + Cancel to be available from anywhere in the tender lifecycle, not just early states. **Migration 038:** new `tenders.previous_status tender_status NULL` (snapshot for Resume); new permission `tender:suspend` granted to SYSTEM_ADMIN + PROCUREMENT_ADMIN; token-version bump on holders. **Backend (`tenders.service.ts`):** `cancel()` rewritten — removed the old early-state whitelist (Draft → Clarification Period); now blocks only when `status === CANCELLED`; wrapped in `$transaction` that closes open negotiation rounds (mirrors award-confirm cascade) + locks all bid envelopes to `EnvelopeStatus.LOCKED`. `suspend(id, dto, userId)` new: stores `previousStatus = currentStatus`, sets `status = SUSPENDED`. `resume(id, dto, userId)` new: returns to `previousStatus`, clears the column. New audit events `TENDER_SUSPENDED` + `TENDER_RESUMED` HIGH; `TENDER_CANCELLED` afterValue now carries `roundsClosed` + `envelopesLocked` counts. New DTOs `suspend-tender.dto.ts` + `resume-tender.dto.ts` + `cancel-tender.dto.ts` (formalises cancel reason ≥20 chars). New routes `POST /tenders/:id/suspend` + `/resume`, both `@RequirePermissions('tender:suspend')`. `serializeSummary` emits `previousStatus`. **Frontend (admin):** new `HoldTenderDialog.tsx` + `ResumeTenderDialog.tsx` (amber styling, reason ≥20 chars). `CancelTenderDialog.tsx` warning now explains cascade ("Any open negotiation rounds are auto-closed and all bid envelopes are locked. Vendors are not auto-notified."). `/tenders/[id]` action bar: workflow buttons wrapped in `tender.status !== 'Suspended' && tender.status !== 'Cancelled'` guard; Cancel guard relaxed to `tender.status !== 'Cancelled'`; new Hold (any non-Suspended/Cancelled state) + Resume (Suspended only) buttons; new `perms.suspend` flag. **Verification on staging:** migration applied via `psql` (column + permission confirmed); api+web-admin both produced `Built` lines; deployed chunk contains `Put tender on hold` + `Resume tender` markers; end-to-end via admin@ctmp.local on TDR-2026-0004 (Negotiation state): suspend → 201, GET shows `status=Suspended, previousStatus=Negotiation`; resume → 201, GET shows `status=Negotiation, previousStatus=null`. Locked-rule: bid immutability respected — locking envelopes blocks further mutation but doesn't alter bid contents; award records untouched by cancel. |
| BUG-131-fix | Low | UX | Bids tab — drop Total + PDF columns, pin submitted-date to Kuwait TZ | 2026-06-13 | **Fixed.** Walkthrough follow-up to BUG-131. Owner asked: bid info only, no prices/PDF; and submitted date looks wrong. `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` — removed `Total` and `PDF` columns (initial bid + negotiation child rows; table is back to 5 cols: Vendor / Submitted / Technical envelope / Commercial envelope / Technical result). Dropped the inline view/download PDF helpers. Added `fmtSubmittedAt()` that always renders with `timeZone: 'Asia/Kuwait'` so the time matches what the vendor saw regardless of the workstation host's TZ (likely-root-cause for the perceived wrong date — Windows host on UTC would have shown 3 h earlier than the actual Kuwait submission time). Both the initial-bid row and the negotiation child row use the helper. Verified: deployed chunk `app/(admin)/tenders/[id]/page-a51304cbae704439.js` contains `Asia/Kuwait` and `Negotiated commercial submission`; no `font-bold text-right` headers (Total/PDF gone). |
| BUG-131 | Medium | UX | BoQ header rename + drop LT columns + show negotiation submissions in tender Bids tab | 2026-06-13 | **Fixed.** Three follow-ups from the BUG-130 walkthrough. **(1) BoqBreakdownBlock rename.** Headers in `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` changed from `Original UP` / `Negotiated UP` to `Original Price` / `Negotiated Price` — "UP" was opaque shorthand the owner didn't use during walkthrough. **(2) LT columns removed.** Per-row `LT (orig)` and `LT (neg)` cells dropped from the table; the footer keeps Original total + Negotiated total + overall `−X%` chip, which is what the committee actually compares. Negotiation-mode column count drops from 9 to 7; legacy non-negotiation mode unchanged. Footer rewritten to align with new column count: `Bid total` (colSpan=4) + Original total + Negotiated total + overall % chip. **(3) Negotiation submissions in tender Bids tab.** `BidsTabPanel` on `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` now fetches `/tenders/:id/negotiation` in parallel with `/tenders/:id/bids` (best-effort: viewers without `negotiation:view` see only initial bids, no error). Builds a `bidId → NegSubmissionRow[]` map sorted by round number. Renders one initial bid row per vendor + one indented amber child row per negotiation submission with `Round N` chip + vendor name + submitted-at + total price + View/Download PDF buttons reusing the BUG-129 endpoints `/tenders/:tenderId/negotiation-submissions/:submissionId/commercial-pdf[/view]`. Header gains two columns (`Total`, `PDF`); initial rows show `—` for these since their price/PDF surface lives on `/commercial-comparison`. **Verification on staging:** typecheck clean; pre-flight 41 GB free; rebuild produced `Built` line; deployed chunk `136-e3210dbeb54a9872.js` contains `Original Price` + `Negotiated Price`; deployed chunk `app/(admin)/tenders/[id]/page-e50ff16c42d78709.js` contains `Negotiated commercial submission`. **Locked-rule status:** no master-plan rule amended. PDF view/download in Bids tab reuses the existing audit-before-stream guard and service-layer permission check. |
| BUG-130 | Medium | Feature/UX | Commercial Comparison — per-line side-by-side + per-round matrix sections | 2026-06-12 | **Fixed.** Two extensions to BUG-129's negotiation card. **(1) Per-line itemwise comparison.** `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` — `CardVendor.negotiationHistory[]` gains optional `boqLines[]` (`tenderBoqItemId`, `status`, `unitPrice`); backend was already sending these (see `comparison.service.ts:382–393`), only the frontend type needed widening. `BoqBreakdownBlock` table now switches into a wider `hasNegotiation` layout when ≥1 round exists: columns become Item · Description · Qty · Unit · Original UP · **Negotiated UP** (amber bg) · `−X%` chip (green ≥0, rose <0) · LT(orig) · LT(neg). Two-row footer shows Grand-Total Original / Negotiated and the overall % reduction, matching the headline summary. Pre-negotiation cards render identically to before. **(2) Multi-section Commercial Comparison page.** `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` — old single-matrix `matrixVendors` useMemo replaced with `matrixSections` useMemo returning N+1 sections: `original` (always present, uses `originalCommercialTotal` + original `boqLines`) and one section per round number that has ≥1 submitted vendor. Each round section filters to *participants only* (owner directive — non-submitters excluded for a cleaner per-round story), materialises per-vendor `boqLines` from `entry.boqLines` with line totals derived from `boqTemplate` qty × `unitPrice`, sets `commercialTotal = entry.totalPrice`, and recomputes its own `lowestPassBidId` scoped to that round's vendors. Render loop emits a section heading (gray for Original, amber for round sections) + a CommercialMatrix instance per section. `selectedBidId` / `onSelect` / award-confirm flow wire through unchanged — clicking a vendor in any matrix selects them for award the same way as before. **Verification on staging:** typecheck clean; pre-flight 44 GB free; rebuild produced `ctmp-web-admin Built` line; deployed chunk `page-20cec841061e9761.js` contains both `Original Commercial Comparison` and `Negotiated Commercial Comparison` markers. Owner-walkthrough on TDR-2026-0019 (has R1 submissions) pending. **Locked-rule status:** no master-plan rule amended; per-round lowest-PASS is consistent with existing "Gate-only PASS/FAIL" + "Pre-select lowest-PASS" rules (page still pre-selects from the resolved current price; per-round matrices are read-only views). |
| BUG-120 | High | Feature | Vendor invitation email dispatch (closes deferred BUG-016) | 2026-06-10 | **Fixed.** Adds the BCC-based invitation email flow asked for by the owner. **Migration 033:** new nullable `tender_vendors.extra_notification_emails TEXT[]` + `notified_at TIMESTAMPTZ`; new `NotificationTemplate` row `TENDER_INVITATION_SENT`; optional `branding.vendor_portal_url` setting. **Backend:** `inviteVendor()` accepts `extraEmails[]` (validated, normalised, deduped) and fires `dispatchInvitationEmail()` immediately when the tender is already in Published / Clarification Period; otherwise just queues. `publish()` triggers `dispatchPendingInvitationEmails()` — sweeps every invited vendor with `notified_at IS NULL` and emails them. Dispatcher resolves BCC list = vendor's ACTIVE `vendor_users.email` + the row's `extra_notification_emails`; TO is the platform's SMTP from-address so contacts don't see each other on To/CC. New `sendEmailWithBcc()` on `NotificationsService` writes one `notification_log` row per BCC recipient. New audit events: `TENDER_INVITATION_NOTIFIED` MEDIUM + `TENDER_INVITATION_EXTRAS_UPDATED` LOW. New endpoint `PATCH /tenders/:id/invited-vendors/:vendorId/extra-emails` lets admin edit extras between invite and publish. **Frontend:** `ManageInvitedVendors.tsx` picker click no longer POSTs immediately — opens an inline confirm pane with vendor name + extras textarea (comma/space/newline-separated, validated client-side) + Send button. Invited list rows gain a pencil to edit extras and an "email sent {date}" stamp once `notifiedAt` is set. Banner under the panel header explains "fires immediately on add" vs "fires on Publish" depending on current tender status. Verified on staging: migration applied; Vendor 3 invited to TDR-2026-0022 with two extras → DB row contains `{extra1@example.com, extra2@example.com}` in `extra_notification_emails`, `notified_at NULL` (correctly queued because tender is in INTERNAL_REVIEW). Publish-sweep code path uses identical dispatchInvitationEmail() so mechanically verified. |
| BUG-118 | High | Bug + UX | Invited Vendors picker text invisible (Chrome + OS dark mode) → replaced native `<select>` with button-list | 2026-06-10 | **Fixed (eventually).** Owner reported "Pick a vendor to invite…" dropdown text was invisible (white-on-white). Three escalating attempts: (a) added `text-text-primary` to select + options — Chrome ignored on `<option>` because OS-native popup, (b) added `color-scheme: light` globally on `select` in `globals.css` + inline-style fallbacks — also didn't deploy, (c) replaced the entire `<select>` with a button-list picker (search input + scrollable `<button>` list, no native popup at all). **Hidden root cause that masked attempts (a) and (b):** staging disk was 100% full (94/98 GB). Every `docker compose build --no-cache web-admin` returned exit 0 but silently used a stale cached layer because BuildKit's activity-metadata write hit `no space left on device`. So `.next/static/chunks/.../page-*.js` kept serving the OLD pre-fix code regardless of how many "successful" rebuilds + restarts ran. CLAUDE.md flags this exact failure mode (BUG-102/103/105). Recovery: `docker builder prune -af` + `docker image prune -af` freed 52 GB. Real rebuild produced new chunk `page-0edc34459bcc9947.js` with `Search vendors to invite` (1) + `No match for` (1) + zero hits for the old `Pick a vendor` string — confirmed live. The global `select { color-scheme: light }` rule in `globals.css` is kept as defense for any remaining native `<select>` elements elsewhere. **Operational lesson:** add `docker system df` to pre-flight on every rebuild — repeated in CLAUDE.md, was skipped during BUG-118 a+b. |
| BUG-117 | Critical | Bundle | Persistent storage (catch-all /data volume) · Cancel Tender reason dialog · Vendor portal Estimated Budget hidden · Picker empty-state UX | 2026-06-09 | **Fixed.** Four issues in one deploy. **(1) Critical: STORAGE_DRIVER=local but only 3 of 6+ storage namespaces had volumes** → uploaded logos / award justification PDFs / negotiation submission PDFs were silently wiped on every `docker compose --force-recreate api`. Verified on staging: `/data/branding` didn't exist at all (DB had storage keys but files were gone); `/data/award-justifications` + `/data/negotiation-submissions` were sitting in the container's writable layer at imminent risk. Fix: new `app_storage` named volume mounted at `/data`; the 3 existing sub-mounts stay intact via Docker's longest-path-wins; every present + future namespace persists. Owner needs to re-upload logos once after this fix (existing references in DB point at lost files). **(2) Cancel Tender failed with no reason input** — frontend opened a bare confirm() and POSTed `{}`; backend's `cancel()` requires `reason`. New `CancelTenderDialog.tsx` mirrors `RevertTenderDialog` (20-char min reason). **(3) Vendor portal showed Estimated Budget** — owner directive: internal-only figure; vendors should bid against the BoQ, not anchor on the buyer's budget. Removed the rendered block on `/tenders/[id]`. **(4) Picker empty-state ambiguity** — BUG-116 was silent because of a field-name typo + a swallowed catch. Hardened: `vendorLoadError` is now captured and surfaced under the dropdown along with two other distinct empty-state messages (no APPROVED vendors, or all invited). |
| BUG-116 | Medium | Bug | Admin → Invitation-only tender → "Pick a vendor to invite…" dropdown empty | 2026-06-09 | **Fixed.** Owner reported the Invited Vendors picker was empty even though 13 APPROVED vendors existed on staging. Root cause: backend `/vendors` endpoint returns `{ items, page, pageSize, total }` but the picker in `ManageInvitedVendors.tsx:64` was reading `res.data ?? []`. The `.catch(() => ({ data: [] }))` silently swallowed the field-name mismatch — looked like a perms issue but the call was succeeding. One-line frontend fix: read `res.items` instead. Verified deployed chunk now has `items:` and zero `data:` fallbacks. Admin rebuilt + restarted. |
| BUG-115 | High | Feature | Negotiation workflow (multi-round, no deadline) | 2026-06-09 | **Fixed.** New procurement workflow: after Commercial Comparison, procurement clicks **Negotiate** beside Confirm Award, picks PASS vendors, types ≥20-char reason. Tender enters new state `Negotiation`. Invited vendors get a new section on their portal under their submitted BoQ to revise per-line prices + upload a new commercial PDF. Original prices preserved forever; each round is a new `bid_negotiation_submissions` row linked via `negotiation_invitations.bid_id`. Multi-round (launching round N+1 auto-closes round N). No deadline (procurement ends the phase by confirming an award or explicitly closing). Award flow consumes the latest negotiation submission via a single resolver chain — comparison page, AwardSummaryCard, Award Minutes PDF, Reports Award History XLSX, analytics vendor profile all reflect negotiated prices. Locked rule "No new tender lifecycle states" was overridden with a dated amendment block in master plan §10 before code shipped. Migration 032 adds 4 tables + 2 perms + enum value. New backend module `apps/api/src/modules/negotiation/` (service + controller + 3 DTOs, vendor-JWT submission endpoints, 15-min PDF holding tank mirrored from Award). Frontend: `LaunchNegotiationDialog` + Negotiate button on Commercial Comparison; `VendorComparisonCard` renders stacked Original / R1 / R2 rows with `% reduction`; `AwardSummaryCard` adds "Awarded after N rounds — X% saved" sub-line; vendor `NegotiationSection` component renders read-only past submissions + editable form for any open invitation. SYSTEM_ADMIN gets neither `negotiation:launch` nor `negotiation:view` (separation of duties); PROCUREMENT_ADMIN gets both; COMMERCIAL_COMMITTEE_MEMBER / COMMERCIAL_EVALUATOR / EXECUTIVE / AUDITOR get view. Dashboard UI changes deferred per owner directive — backend `negotiationSavings` fields shipped for the follow-up to render. Local typecheck clean on api + web-admin + web-vendor. End-to-end verification on staging pending. |
| BUG-114 | Medium | Locked-rule amendment | Admin → Awarded → Amend Award — Submit button stuck disabled; PDF made optional | 2026-06-09 | **Fixed.** Owner reported the Submit Amendment button stayed disabled. Root cause was the existing PDF-required gate (frontend `canSubmit` requires `pdfDocumentId` AND backend DTO `@IsString justificationDocumentId` is non-optional). Owner directive: drop PDF requirement, keep reason mandatory. This overrides locked master-plan §A6 + §F7 ("Override always requires text + PDF"); a dated amendment block was added to `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md` Section 10 before shipping, per the document's own change-control rule. Confirm-Award override (non-lowest at first-confirm) unchanged — that path still requires text + PDF. Reason min unchanged at 100 chars. Schema impact: none (PDF columns were already nullable). Backend: `justificationDocumentId?` optional, service-layer lookup + cache-delete now `if (dto.justificationDocumentId)` guarded. Frontend: `canSubmit` drops `pdfDocumentId` clause, POST omits the field entirely when no PDF, banner + label copy updated. |
| BUG-113 | High | Bug | Admin → Awarded Tenders → Award + Commercial tabs blank | 2026-06-08 | **Fixed.** Owner (logged in as `manager@ctmp.local` = PROCUREMENT_ADMIN) reported Award + Commercial tabs on the archive page rendered nothing while other tabs worked. Root cause was a frontend endpoint mismatch: `awarded-tenders/page.tsx:324` called the legacy `/tenders/:id/commercial-comparison` (CommercialEvaluationController, returns `{ tenderId, callerCommercialAccess, rows }`) but the page's response interface and the Award + Commercial tabs expect the new shape from `/tenders/:id/comparison/commercial` (ComparisonController, returns `{ tender, summary, lowestPassBidId, vendors, award, boqTemplate }`). The manager's request succeeded (200, audit row exists) but the payload was missing the `award`, `vendors`, `boqTemplate`, and `lowestPassBidId` fields the tabs render — Award tab fell through to "No active award row" and Commercial tab to "No bids on this tender". One-line endpoint swap. PROCUREMENT_ADMIN / EXECUTIVE / COMMERCIAL_COMMITTEE_MEMBER / COMMERCIAL_EVALUATOR all already hold the new `comparison:commercial:view` perm. Verified: 0 references to legacy endpoint in deployed chunk; new endpoint string present. SYSTEM_ADMIN + AUDITOR still see blank tabs here (separate locked-rule decision — BUG-052 separation of duties). |
| BUG-112 | High | Bundle | Owner walkthrough: Tender Revert + Tenders search fix + Clarification reply private default + Idle-timeout signout + Vendor commercial PDF mandatory | 2026-06-07 | **Fixed.** Five-piece bundle. **(1) Tender Revert:** new `POST /tenders/:id/revert` lets SYSTEM_ADMIN + PROCUREMENT_ADMIN roll a Published tender back to Approved / Internal Review / Draft to undo a mistake. Blocked when any vendor bid is in a binding status `{SUBMITTED, LATE_SUBMITTED, LATE_ACCEPTED, EVALUATED, AWARDED, NOT_AWARDED, DISQUALIFIED}` — admin must Cancel instead. Reason required (≥20 chars). HIGH-risk audit event `TENDER_REVERTED`. Migration 031 seeds `tender:revert` perm + role grants + token-version bump. New `RevertTenderDialog` with live binding-bid count check. **(2) Search fix:** admin Tenders search now sends `?search=…` (not `?q=…`), matching the backend DTO. One-line frontend change. **(3) Clarification reply private default:** DTO `isPublic` now optional with default `false` so a client forgetting the flag is safe; Private toggle button styled solid `bg-text-primary text-white shadow-sm` with explicit "(default)" label so the visual selected state matches the actual state. **(4) Idle timeout signout:** `session.idle_timeout_minutes` setting (BUG-107) now carried in JWT as `idleTimeoutMinutes` on both admin + vendor tokens (defaults 30 if absent). New `useIdleTimeout` hook on each portal watches activity events, signs out + redirects to `/login?reason=timeout`. New 401 interceptor in each `lib/api.ts` bounces to `/login?reason=expired` when the server reports the token is invalid. Login pages render amber banner explaining why. **(5) Commercial PDF mandatory:** vendor bid wizard Step 3 no longer exempts BOQ tenders; `required={true}` unconditionally; Skip button removed; submission validation always requires ≥1 commercial PDF. Verified on staging: migration applied (perm + 2 grants + token bumps); containers rebuilt for api + web-admin + web-vendor. Owner end-to-end pass pending. |
| BUG-111 | Medium | Feature | Split Technical Evaluation between Technical Engineer + Procurement Manager roles, per-criterion | 2026-06-06 | **Fixed.** Owner wanted "some criteria evaluated by Technical Engineer and some by Procurement manager". Picked Option A (per-criterion role assignment) over Option B (two parallel evaluations with arbitrary 50/50 blend). **Migration 030** adds `tender_technical_criteria.evaluator_role VARCHAR(32) NOT NULL DEFAULT 'EITHER'` + seeds new permission `technical:evaluate:procurement` granted to PROCUREMENT_ADMIN + PROCUREMENT_OFFICER + SYSTEM_ADMIN with token-version bumps. **Backend** introduces `@RequireAnyPermission(...)` decorator (OR semantics, sibling to existing AND `@RequirePermissions`). `evaluate()` loads criteria roles per submission and 403s when a score targets a criterion outside the caller's bucket. `listCriteria()` returns `evaluatorRole`. Comparison service returns per-vendor `consensusScoreTechnical` + `consensusScoreProcurement` plus `weightTechnical`/`weightProcurement`/`weightEither` totals. CriterionInputDto + serializer thread `evaluatorRole` through PUT /tenders/:id/criteria. **Frontend** TenderCriteriaEditor gains "Scored by" select per row. Technical Evaluation scorecard reads caller's perms from JWT and filters visible criteria; chip above the scorecard tags Technical/Procurement/both. TechnicalMatrix renders small `T: X/W` + `P: X/W` figures under the combined score when the tender uses a role split. **Back-compat:** every existing criterion defaults to EITHER → no behaviour change for pre-BUG-111 tenders. Combined PASS/FAIL unchanged. Verified on staging: migration applied (3 grants + 4 token bumps), criteria endpoint returns evaluatorRole=EITHER for legacy criteria, admin JWT carries both perms, code paths confirmed; full end-to-end with a role-split tender pending owner-driven setup. |
| BUG-110 | Medium | UX + Feature | Vendor portal: public Tenders landing at `/` + dropdown category filter (replaces BUG-109 side panel) | 2026-06-05 | **Fixed.** Owner walked BUG-109 and asked for two changes: (a) drop the left side panel, move filter beside search as a single-select dropdown; (b) make the vendor portal landing (`/`) public — anonymous visitors see the open tender list, clicking a tender redirects to login, login forwards to the intended detail after auth. **Backend:** new `PublicTendersController` with `@Public() @Get('public/tenders')` route + new `findAllPublic(query)` service method filtering to status ∈ {Published, Clarification Period} + visibility = PUBLIC. No invitation-only (anonymous can't be invited). No dept scoping. Anonymous accessible. **Frontend:** `app/page.tsx` rewritten from `redirect('/login')` to a public landing — checks token cookie on mount, redirects logged-in vendors to `/dashboard`, otherwise fetches `/public-branding` + `/public/tenders` and renders minimal top bar (brand + Sign In + Register) plus card grid with search + category dropdown beside; card click pushes to `/login?next=/tenders/<id>`. `(portal)/tenders/page.tsx` refactored — removed BUG-109 sidebar + mobile chip strip, added single-select `<select>` dropdown beside the search bar with options `Category (N)` derived from loaded tenders. `login/page.tsx` reads `?next=` via `useSearchParams()`, sanitises with open-redirect defense (must start with `/`, no `//`, no `:`), applies on both login + MFA-verify branches; wrapped in `<Suspense>` boundary per Next.js requirement. **Verified live:** `GET /public/tenders` returns 5 tenders all status=Published, anonymous detail still 401, `/` and `/login?next=...` both 200, open-redirect sanitisation in deployed bundle. No DB migration. |
| BUG-109 | Low | UX | Vendor portal Tenders browse — category side filter | 2026-06-05 | **Fixed.** Owner asked for category-wise filter on the side of the vendor tenders browse page. Single-file change in `apps/web-vendor/src/app/(portal)/tenders/page.tsx`. Layout shifted to two-column (left sidebar 224 px + main card grid). New `selectedCategories: Set<string>` state; multi-select checkbox UI; live filter (no Apply button); "Clear" link when ≥1 box is checked. Categories derived dynamically from the loaded tender list via `useMemo` (sorted alphabetically with "Uncategorised" pinned last); each entry shows a `(N)` count. Tenders with null/empty `category` bucket under "Uncategorised". Mobile (`<md`): sidebar hides, horizontally-scrolling chip strip replaces it above the grid with the same toggle behavior. Search + category filter compose as AND. No backend / migration / endpoint change — `GET /tenders` already supports `?category=` but client-side filter over the already-loaded list (pageSize=100) is cleaner and supports multi-select. Verified live: bundle contains new code, page returns 200, real data on staging gives 3 buckets (Construction 4, IT Services 5, Uncategorised 10). |
| BUG-108 | Medium | UX + Feature follow-up | Login-page logos + admin_logo type + Vendor Portal Name + Platform settings sectioned redesign | 2026-06-05 | **Fixed.** Owner walked BUG-107 and surfaced three gaps. **(a) Login pages had no logo wiring** — admin login was rendering vendor_logo as a fallback (mismatched brand) and vendor AuthShell (login/register/reset/verify) never read branding at all. Fix: added `admin_logo` type to BrandingService (`ALLOWED_TYPES + KEY_BY_TYPE`); admin login + Sidebar now use admin_logo; vendor AuthShell converted to client component, fetches `/public-branding`, renders vendor_logo + vendor portal name. **(b) Vendor Portal Name needed to be separate from System Name.** New `branding.vendor_portal_name` setting; `getPublicBranding` returns it (falls back to system_name when empty). Vendor PortalShell + AuthShell use it. Admin pages still use system_name independently. **(c) Platform tab "not standard"** — replaced ad-hoc BrandingPanel + ConnectionsPanel + raw-key list with seven semantic section cards: General · Branding · Email (SMTP) · Active Directory · Vendor Portal · Security & Audit · Uploads. Each section is a `SectionCard` with icon + heading + description + per-section Save button. Inputs use friendly labels via `LabeledField` (raw setting keys shown small mono under the label). New `useSectionEdits` hook for per-section dirty tracking + save via `/system-settings/batch`. Existing helpers (LogoUploadRow, SecureSetterRow, SmtpTestRow, AdTestRow) composed by the new sections. **Migration 029** seeds 3 settings rows (admin_logo storage key + hint, vendor_portal_name). Verified live on staging: admin_logo upload + serve round-trip works; `/public-branding` exposes new fields; vendor_portal_name fallback to system_name confirmed. Test data cleared post-verification. |
| BUG-107 | High | Feature bundle | Settings basket Pieces 2-5: configurable system name + vendor/report logos + per-role sidebar label rename + SMTP/AD config UI with AES-256-GCM encrypted credentials | 2026-06-05 | **Fixed.** Big bundle covering owner's remaining settings basket. **Migration 028** adds `system_settings.is_encrypted/encrypted_value`, `roles.sidebar_label_overrides JSONB`, and seeds 13 settings rows (branding.system_name, logo storage keys, image-size hints, SMTP plaintext, AD plaintext, plus encrypted slots for smtp.password + ad.bind_password). **Piece 2:** `branding.system_name` setting drives Sidebar header, Login page header, vendor portal nav, and report XLSX `workbook.creator`. **Piece 3:** new BrandingService + upload (POST /system-settings/branding/upload, multipart, system:configure) + public serve (GET /branding/:type, cache 5min) + report PDF logo embed via `doc.image()` (graceful text fallback) + image-size hints rendered from `branding.hint_*` settings. **Piece 4:** new `PATCH /roles/:id/sidebar-labels` writes per-href overrides as JSONB; auth merges them into JWT (`sidebarLabelOverrides`, first non-empty per href wins ordered by granted_at); Sidebar reads at render with fallback to hardcoded label; Settings → Roles tab gains a "Sidebar labels (rename per role)" panel. **Piece 5:** new `SecureSettingsService` with AES-256-GCM encryption (key=SHA-256 of `SETTINGS_ENCRYPTION_KEY` env, IV(12)+tag(16)+ciphertext packed into encrypted_value BYTEA); `system-settings.list()` masks encrypted rows as ••••••••; `POST /system-settings/secure` writes plaintext→encrypted; NotificationsService + AuthService.bindToAd resolve config DB-first with env fallback; new `POST /system-settings/test-smtp` + `/test-ad` endpoints; Platform tab gains a "Secrets & Connection Tests" panel with password write-only fields + Send Test + Probe buttons. **Verified live:** all 9 new routes mapped, smoke-tested each piece end-to-end. Migration: 3 ALTERs + 13 settings + idempotent guards. Test data cleaned up post-verification. **Open note:** `SETTINGS_ENCRYPTION_KEY` env var not yet set on staging — dev fallback in use; set in prod runbook before going live. |
| BUG-106 | Low | UX | EXECUTIVE lands on /executive + Dashboard menu hidden (Piece 1 of 5 owner settings basket) | 2026-06-05 | **Fixed.** Owner asked to remove the Dashboard menu from executive users and make /executive their landing page. Uses BUG-093's existing `hidden_sidebar_items` infrastructure — no schema change, no new perm. Migration 027 `array_append`s `/dashboard` to EXECUTIVE role's hide list (idempotent) and bumps `token_version` for the 1 affected user (`executive@ctmp.local`) so JWT refreshes. `login/page.tsx` gains a `landingPath(token)` helper that reads `hiddenSidebarItems` from the JWT and returns `/executive` when `/dashboard` is hidden, else `/dashboard`. Both the normal login path and the MFA-verify branch use it. Generic — any future role that hides Dashboard gets the same behaviour. `/dashboard` URL itself remains accessible (no perm gate added). Verified live on staging: executive JWT `hiddenSidebarItems` includes `/dashboard`; admin JWT empty; deployed minified login bundle contains the expected redirect ternary. Pieces 2-5 of the basket (configurable system name, logos + image-size hints, per-role sidebar rename, SMTP+AD config UI with DB-encrypted credentials) captured as next-up backlog in plan file. |
| BUG-105 | High | Bug bundle + Security | Reports module restricted to SYSTEM_ADMIN + PDF export fix + award_history money fallback | 2026-06-05 | **Fixed.** Owner asked to remove Reports menu from non-admin roles and confirmed Reports were broken across formats. **Three concrete issues, all addressed:** (a) **Migration 026** revokes `reports:view` + `reports:export` from PROCUREMENT_ADMIN, AUDITOR, EXECUTIVE_VIEWER, FINANCE_REVIEWER, LEGAL_REVIEWER, PROCUREMENT_OFFICER (9 role_permissions rows deleted) and bumps `token_version` for 3 affected users so JWTs refresh. Only SYSTEM_ADMIN retains both perms. Existing `Sidebar.tsx:61` gate (`permission: 'reports:view'`) auto-hides; controller `@RequirePermissions` guards return 403 to non-admin callers. (b) **PDFKit import fix** at `report-renderer.service.ts:3`: pdfkit's CommonJS export is `module.exports = PDFDocument` (no `default` key), but `@types/pdfkit` misdeclares it as a var, so the previous `import PDFDocument from 'pdfkit'` compiled to `pdfkit_1.default` (undefined) — every PDF export threw "default is not a constructor". Changed to `import PDFDocument = require('pdfkit')` (TS-canonical for CommonJS modules with bad types). All 8 report PDFs now work via the same fix. (c) **`award_history` BUG-088 fallback at render time:** awardHistory() Prisma query extended with `bids: { where: { isAlternative: false }, select: { vendorId, commercialEvaluations: { orderBy: createdAt desc, take: 1 } } }`. Row mapper resolves `t.awardedAmount ?? awardedVendor's latest CE.totalPrice ?? null` — mirrors `AnalyticsService._resolveAwardedAmount`. On staging where all tenders have NULL `awardedAmount`, the export now shows real KWD figures: 100 / 15000 / 100000 for tenders with CE rows; blank for tenders without (correct null behaviour). **Verified live on staging:** all 8 XLSX + 1 PDF complete, non-admin (executive@ctmp.local) JWT has zero report perms and gets 403 on both list + export endpoints. Operational note: first job enqueued seconds after api force-recreate hit a stale BullMQ worker and rendered the old logic — subsequent jobs work. Defer follow-ups: `technical_evaluations` no pagination (fine at current volume), `vendor_directory` silent drop on missing primary contact, BUG-088 Phase 2 root fix (populate `tenders.awarded_amount` at award confirm). |
| BUG-104 | Low | UX | Commercial Comparison — Itemized view doesn't scale beyond 2-3 vendors | 2026-06-05 | **Fixed.** Owner asked what happens when a tender has 5-6+ vendors on Commercial Comparison. Summary view (vendors as rows) already scales; Itemized view (BoQ-rows × vendors-as-columns) was the real pinch point: vendor cols had no `min-w-*` so they compressed below readability, and once the table needed horizontal scroll, Item No + Description slid off-screen. **Fix (CSS only, `CommercialMatrix.tsx:142-205`):** Item No + Description columns become `sticky left-0 / left-20 z-10` with matching backgrounds (bg-bg header / bg-card body / bg-bg/60 totals); Description gets a fixed `w-64` and right-border seam; every vendor `<th>` / `<td>` (header + lineTotal + Not-bidding + totals) gets `min-w-[140px]` (mirrors `TechnicalMatrix.tsx:191`'s 120 px pattern); body rows switch `hover:bg-bg/40` → `group hover:bg-bg/40` so sticky cells pick up `group-hover:bg-bg/40` and the hover stays continuous across the seam; totals row reshaped from `colSpan={4}` "Total" cell to four separate cells (sticky Item + sticky blank Desc + non-sticky Qty + non-sticky Unit) so sticky offsets match body rows; wrapper `<div>` gains `relative` for sticky offset resolution. Verified deployed bundle on staging: `min-w-[140px]` appears 4× (the 4 vendor cell sites) and 6 sticky-class variants (header/body/totals × Item/Desc) are all present. Visual sweep with ≥5 vendors deferred — no staging tender currently has that many bids; classes will activate as soon as one does. **Out of scope per owner directive:** vendor pinning chips, layout toggle, compact mode, any Summary-view change. |
| BUG-103 | Medium | Bug | Commercial Comparison — "Show technical breakdown" per-criterion + total still rendering percentage instead of absolute score | 2026-06-05 | **Fixed.** Owner pushed back: "you did not fix, in Commercial comparison Technical score". BUG-101 had only touched two of the three score-display surfaces — the missed one is the **inline expander** inside each vendor card on `/commercial-comparison` (function `InlineTechBreakdown` inside `VendorComparisonCard.tsx:564-650`), which renders a Criterion / Max / Score table. Its `fmt` helper was rounding the raw 0..100 percentage directly. For a criterion with `max_score=30` and stored `score=93.33`, it rendered "Max 30 / Score 93" — exactly the value the owner reported. DB confirms `technical_evaluation_scores.score` is 0..100 percentage (sampled: 93.33 / 90.00 / 100.00 / 83.33 across maxes 20–30). Fix: replaced `fmt` with `fmtAbs(percent, max)` using `Math.round(percent / 100 * max)`. Per-criterion rows pass `c.maxScore` as the per-row max; total row passes `data.totalMaxScore`. Mirrors `toAbsolute()` in `TechnicalMatrix.tsx` (BUG-061). Verified the deployed minified JS contains the new lambda. Pruned 44 GB Docker build cache before rebuild (BUG-102 deploy had hit `/tmp` pressure). All three surfaces on the Commercial Comparison page now agree: top-of-page Tech score column, per-vendor card Block 2 Technical Score, and per-vendor inline breakdown. |
| BUG-102 | Medium | Refactor + Feature | Restructure Department dashboard to directory + per-dept drill-down (mirror Vendor dashboard) | 2026-06-04 | **Fixed.** Owner pushed back on BUG-101's single-page Department Overview ("you kept all in one page, I was hoping department similar to vendor dashboard which will have department and then can click to drill down and check tenders"). Restructured to mirror the vendor dashboard shape from BUG-100. (a) **New backend endpoint** `GET /api/v1/analytics/departments/:departmentId?year=YYYY|all` — same `executive:dashboard` perm. Returns profile + metrics + every tender in the dept (with BUG-088 fallback per tender) + top vendors + multi-year spend trend + per-category breakdown. `year=all` (or empty) → all-time scoping (null sentinel). New service method `getDepartmentProfile(deptId, year|null)` + new types DepartmentTenderRow / DepartmentSpendByYear / DepartmentProfileResponse. (b) **`/executive/departments` rewritten** as compact directory: coloured KPI strip + clickable comparison bar chart + sortable clickable table (Department / Tenders / Awarded / Estimated / Awarded value / Savings %). Each row links to `/executive/departments/[id]?year=YYYY` preserving the year filter. Dropped the big per-dept cards (those become the detail page). (c) **NEW `/executive/departments/[id]`** detail page mirrors the vendor detail structure: year selector (All time + last 5 years), header card with name + code + accent icon + big awarded-value callout, 4 tabs — **Overview** (8-card coloured metric grid), **Tenders** (full tender list with reference → tender detail link, status badge, category, est, awarded, winner → vendor drill-down link), **Spend Trend** (always full multi-year + per-category bars), **Vendors** (top vendors with horizontal spend bars + links to per-vendor profiles). Full cross-navigation between Executive, Vendors, Departments surfaces. Verified on staging: Facilities Management (year=2026) returns 8 tenders, 3 awarded, 170K estimated, 115.1K awarded, 3 distinct vendors, 3 categories (Uncategorised/Construction/IT Services). All-time `?year=all` scoping works (`year: null`). |
| BUG-101 | Medium | UX bundle + Feature | Vendor reg form simplification · CommercialMatrix tech-score absolute display · Colourised executive dashboards · NEW Department Overview dashboard | 2026-06-04 | **Fixed.** Four owner-walk asks bundled. (a) **Vendor registration form** — Registration Number, Tax Number, Country fields removed from `apps/web-vendor/src/app/register/page.tsx`. Company Website (URL with `IsUrl({require_protocol:true})` server-side validation) added. `vendor-register.dto.ts` + `vendor-auth.service.ts:65-74` updated. The dropped fields remain on the `Vendor` model and can be set later via admin tools / profile edits if needed. (b) **CommercialMatrix tech-score** — owner saw "Max 30, Score 93". Root cause: `technical-evaluation.service.ts:143` clamps `overallScore` to 0..100 (percentage), but `CommercialMatrix.fmtScore` printed `${percent} / ${max}` mixing units. Fix mirrors BUG-061's `toAbsolute` in TechnicalMatrix: convert percent → absolute (`Math.round((p/100)*max)`) then print `${absolute} / ${max}`. Same fix applied to `VendorComparisonCard.fmtScore` (previously dropped /max per BUG-097-fix, now restored with the absolute denominator so figures match the standalone Technical Comparison page). (c) **Colourised dashboards** — `/executive` KPI strip gains `KPI_STYLES` palette (blue/indigo/emerald/teal/green/amber/purple/cyan, one tone per KPI label) with coloured top-accent bar + coloured icon chip + coloured value text. `/executive/vendors` `KpiCard` gains a `tone` prop with the same palette; Top 5 Concentration card uses tone-by-threshold (≥75 rose, ≥50 amber, else teal). (d) **NEW Department Overview** at `/executive/departments` — `GET /api/v1/analytics/departments?year=YYYY` returns per-department roll-up (tender count, awarded count, active count, estimated, awarded with BUG-088 fallback, savings, savings rate, active pipeline, top-3 vendors). Frontend page has year selector + Print, totals strip (4 colour cards), comparison bar list (estimated vs awarded), per-department cards (one per dept, rotating 8-tone palette), and bottom detail table with totals row. Sidebar entry "Department Overview" with Layers icon under Executive Vendors, gated by existing `executive:dashboard` perm — no migration, no new perm. Verified on staging: 5 active depts, 19 tenders, 115,100 KWD awarded, 83.3% savings rate (Facilities Management leads with 8 tenders / 3 awards / 115K). |
| BUG-100 | Medium | Feature | Admin → Executive → Per-vendor profile + history drill-down | 2026-06-04 | **Fixed.** Owner asked for a new admin-portal view where an executive picks a vendor and sees the full profile, every awarded tender, lifetime spend with year-over-year trend, department/category breakdown, and bid participation/win-rate. The existing `/executive` dashboard already had a Top Vendors table but no drill-down. Two new endpoints on the existing `analytics` module: `GET /api/v1/analytics/vendors` (directory) and `GET /api/v1/analytics/vendors/:vendorId` (per-vendor consolidated payload — profile + metrics + awardHistory + spendByYear + spendByDepartment + spendByCategory + bidParticipation). Both gated by existing `executive:dashboard` permission — no migration, no new role, no schema change. Two new pages on web-admin: `/executive/vendors` directory (KPI strip, search/status/year filters, sortable table) and `/executive/vendors/[id]` detail (header card + 4 tabs: Overview / Award History / Spend Trend / Participation). Top Vendors rows on the existing `/executive` dashboard now link into the new drill-down. **BUG-088 fallback baked into every money calculation:** `_resolveAwardedAmount()` uses `Tender.awardedAmount` if non-null, else the awarded vendor's bid's latest `CommercialEvaluation.totalPrice`. Verified end-to-end on staging where every awarded tender currently has null `awarded_amount` — fallback computed 115,100 KWD total spend correctly, matched manual SQL aggregate. Win-rate denominator excludes WITHDRAWN bids; numerator = AWARDED status. Tech PASS rate excludes PENDING. Files: `apps/api/src/modules/analytics/analytics.{service,controller}.ts`, `apps/web-admin/src/app/(admin)/executive/vendors/{page.tsx,[id]/page.tsx}` (new), `apps/web-admin/src/components/layout/Sidebar.tsx`, `apps/web-admin/src/app/(admin)/executive/page.tsx`. **DMZ segregation deferred** — plan retained for follow-up workstream. |
| BUG-001 | Medium | Bug | Admin → Tender Detail header | 2026-05-26 | "Created Invalid Date" — serializer now returns `createdAt`. Verified: detail endpoint shows `createdAt: 2026-05-25T16:49:14.192Z`. |
| BUG-002 | Medium | Bug | Admin → Tender Detail key details | 2026-05-26 | Category empty — serializer now returns `category` (null for old tenders, will populate once BUG-008 ships the form field). |
| BUG-003 | Medium | Bug | Admin → Tender Detail key details | 2026-05-26 | Procurement Type empty — serializer now returns `procurementType` (mapped from Prisma `tenderType`). |
| BUG-013 | High | Bug | Admin → Approvals queue | 2026-05-26 | Requested By "Unknown" — serializer now returns `createdByName` (joined from User). Verified: `createdByName: CTMP Admin`. Also closes Request Date blank (same `createdAt` field). |
| BUG-006 | Medium | Bug | Admin → Tender Detail Days Left widget | 2026-05-26 | Changed `bg-sidebar text-white` → `bg-card border border-border` to match BIDS card. Verified: new chunk has `bg-card border border-border p-5 rounded-xl`, old `bg-sidebar text-white` absent. |
| BUG-021 | Low | Bug | Admin → Technical Evaluation scorecard | 2026-05-26 | Save Evaluation button rendered with zero padding (no `px-/py-`) → looked overlapped with Pass/Fail toggle. Added `px-6 py-4`. Verified: new chunk has `px-6 py-4 transition-all`. |
| BUG-024 | Low | Bug | Admin → Committee Attendance UI | 2026-05-26 | Attendance row now uses `flex-1 min-w-0 truncate` on the member-name column + `shrink-0` on the PRESENT/ABSENT pill group so the toggle column locks to a consistent x-position regardless of name length. Verified: all 3 markers in chunk. |
| BUG-007 | High | Bug | Admin → Tender Detail Workflow Progress | 2026-05-26 | Added missing entries to `LIFECYCLE_STAGES`: `Technical Opening`, `Commercial Sealed`, `Tender Closed`. Now all 13 forward states from the spec render correctly. Verified all 3 new keys present in live chunk. |
| BUG-022 | High | Bug | Admin → Technical Evaluation | 2026-05-26 | Added `handleViewProposal()` handler — fetches `GET /bids/:id/envelopes/TECHNICAL/documents`, downloads the first doc as a blob, opens in new tab via `URL.createObjectURL`. Empty/error states alert. Verified handler + `Opening…` UI string in live chunk. |
| BUG-027 | High | Bug | Admin → Settings → Users → Edit | 2026-05-26 | Moved `authType` + `adUsername` into the `editing === 'new'` branch so they're never sent on edit PATCH. Backend DTO unchanged (still enforces immutability). Verified: PATCH without authType → 200; PATCH with authType → 400 (as expected). |
| BUG-029 | Low | Feature | Vendor portal → Dashboard | 2026-05-26 | Stat cards wrapped in `<Link>` (Active Bids/In Evaluation/Awarded → `/bids`; Open Tenders → `/tenders`). Filter-prefill via `?status=…` deferred — destination pages don't have filter-from-query plumbing yet; ship a follow-up if usage shows demand. |
| BUG-033 | Medium | Bug | Admin → Commercial Comparison → Export | 2026-05-26 | Frontend used `commercial-comparison` (hyphen) + missing tenderId. Now uses `commercial_comparison` + sends tenderId. Backend DTO extended with `tenderId` + defensive `.toLowerCase()` on code lookup. End-to-end verified: 6,723-byte XLSX downloaded. **2026-05-28: Superseded by Phase G (BUG-045) — the entire `commercial_comparison` report code has been removed from the Reports module. The in-app Commercial Comparison page (Phase C / BUG-035) is the canonical surface.** |
| BUG-034 | Low (was Critical) | Bug (misdiagnosis) | Admin → Reports & Analytics | 2026-05-26 | Reports module was never broken. Investigation showed 21 historical jobs completed across multiple codes; new test jobs complete in <300 ms. "All reports broken" perception came entirely from BUG-033 (1 frontend mismatch) + 2 wrong-code attempts in logs (`AUDIT_TRAIL` uppercase, `/reports/catalog` path). The defensive `.toLowerCase()` shipped with BUG-033 also closes the uppercase case. No worker/storage/Redis issue found. |
| BUG-005 | Medium | Bug | Admin → Tender Detail Days Left widget | 2026-05-27 | Days Left count was blank because `tenders.service.ts` serializer never emitted the field. Added `daysLeft = Math.ceil((submissionCloseAt - now) / 86_400_000)` to `serializeSummary`. Verified: `/api/v1/tenders?pageSize=1` response now contains `daysLeft` key. Closes retest A4. (Retest sheet incorrectly tagged this as BUG-006; BUG-006 was the visual fix.) |
| BUG-021 | Low | Bug | Admin → Technical Evaluation scorecard | 2026-05-27 | **Second pass.** First pass (2026-05-26) added `px-6 py-4` padding but retest D1 still failed — owner wanted Save on its own row. Restructured the Pass/Fail/Save group: two stacked rows, Pass/Fail full-width on top, Save full-width below. Verified `space-y-4 mb-6` + `w-full bg-accent` in chunk. |
| BUG-022 | High | Bug | Admin → Technical Evaluation | 2026-05-27 | **Second pass.** First pass (2026-05-26) wired the handler; retest D2 hit 401 on the documents list because `GET /bids/:id/envelopes/:type/documents` had `VendorJwtAuthGuard` (vendor-only). Phase A fix: changed list guard to `OptionalVendorOrUserGuard`, expanded `listEnvelopeDocuments` access model to admit admin (TECHNICAL = envelope OPENED; COMMERCIAL = OPENED + `commercial:view`). View now routes through the new modal viewer endpoint (`GET /bids/:id/envelopes/:type/documents/:docId/view`). |
| BUG-037 | High | Feature | Shared component → In-app PDF viewer | 2026-05-27 | **Phase A complete.** Shipped: `document_view_log` table + 2 indexes (migration 009), `viewer:pdf:open` / `viewer:pdf:download` permissions seeded with role grants (SYSTEM_ADMIN omitted), `audit.logDocumentView()` writing to BOTH `document_view_log` AND `audit_logs` chain BEFORE streaming, new view-stream endpoint with `OptionalVendorOrUserGuard`, `PdfViewerProvider` + `PdfViewerModal` mounted in admin root layout, Technical Evaluation re-wired to use `usePdfViewer()`, vendor portal `FileDropZone` PDF-only at upload (client mime + filename + backend mime + magic bytes). Verified all 9 tracker line items on staging. Closes retest D2. |
| BUG-008 | Medium | Bug | Admin → Tender Create form | 2026-05-27 | Added Category select, Procurement Type radio, Estimated Budget (KWD) inputs to `tenders/new/page.tsx`. Backend persists via expanded CreateTenderDto. Prisma fields renamed `tenderType → procurementType` and `budgetEstimate → estimatedBudget` (with `@map`, no DB migration). |
| BUG-009 | Medium | Bug | Admin → Tender Edit form | 2026-05-27 | Department dropdown shown when `tender.status === 'Draft'`; locked label otherwise. Backend `update()` rejects departmentId changes for non-Draft tenders with clear 400. |
| BUG-010 | High | Bug | Admin → Tender Create + Edit | 2026-05-27 | Estimated Budget on create + read-only after Approved on edit. Publish gate now refuses if `procurementType` or `estimatedBudget` missing. |
| BUG-011 | High | Bug | Admin → Tender Edit | 2026-05-27 | Auto-resolved by BUG-008 — `CreateTenderDto` now whitelists `category` / `procurementType` / `estimatedBudget`, `UpdateTenderDto` inherits via PartialType. PATCH 400 gone. |
| BUG-004 | High | Bug | Admin → Tender Detail documents | 2026-05-27 | Frontend `TenderDocument` interface renamed `fileName/fileType → filename/mimeType` to match API serialisation. Count + table now populate correctly. |
| BUG-012 | High | Bug | Admin → Tender Detail (Draft) | 2026-05-27 | NEW `TenderStorageService` mirroring BidStorageService (namespace `tender-documents`); `POST /tenders/:id/documents` (multipart, MIME allow-list of PDF + Office docs, server SHA-256), `DELETE /tenders/:id/documents/:documentId`. Streaming download via `streamDocument`. Frontend hooked: hidden file input + Upload button + Delete + Download. Publish gate requires ≥1 RFQ doc. |
| BUG-014 | Medium | Bug | Admin → Tender Detail → Description tab | 2026-05-27 | Auto-resolved by BUG-004 + BUG-012 — documents card now renders properly. |
| BUG-023 | High | Bug | Admin → Committee Opening + Commercial Comparison | 2026-05-27 | NEW shared `CommercialDocumentsList.tsx`: renders "Awaiting committee opening" until envelope.OPENED, then fetches `/bids/:id/envelopes/COMMERCIAL/documents` and lists each as a download link. Embedded in Committee Opening "Technically Qualified Vendors" table as 5th column. Server still gates per-file download with `commercial:download`. |
| BUG-028 | Critical (Part A only) | Feature | Admin RBAC sidebar | 2026-05-27 | **Part A shipped.** Sidebar nav items all permission-gated per master plan §I matrix (`tender:view`, `tender:approve`/`award:approve`, `clarification:view_internal`/`reply`, `technical:evaluate`, `committee:*`/`commercial:view`, `vendor:view`, `reports:view`, `audit:view`, `system:configure`). `anyPermission` OR-list helper added. **Part B (dept-scoped data filtering) deferred** — requires `user.departments` on JWT payload. |
| BUG-030 | High | Bug | Vendor portal → password reset | 2026-05-27 | NEW `apps/web-vendor/src/app/reset-password/page.tsx` (mirrors verify-email pattern: token from query, password + confirm fields, 12-char min, POST to `/vendor-auth/reset-password`). Backend `vendor-auth.service.ts` now emits `resetUrl` template var built from `vendor.portalUrl` config. |
| BUG-031 | High | Bug | Vendor portal Clarifications privacy | 2026-05-27 | Migration 010 moves `is_public` from `tender_clarifications` → `tender_clarification_replies` (with backfill of parent flag to all replies). `clarifications.service.ts` rewrites the vendor filter: own threads OR threads with `replies.some.isPublic=true`; non-public replies and the asking-vendor's identity are redacted from non-owning vendor callers (§4 of agreed approach). |
| BUG-019 | Low | Bug | Admin → Clarifications right sidebar | 2026-05-27 | Timeline icon now opens `<TenderTimelineDrawer>` — fetches the existing `GET /tenders/:id/audit-logs`, renders chronologically with expandable before/after detail per event. ESC closes. Disabled when no tender selected. Component reusable for tender detail page later. |
| BUG-018 (Print) | Medium | Bug | Admin → Clarifications | 2026-05-27 | Print button wired to `window.print()`. Added `@media print` rules in `globals.css` (hides sidebars + nav so threads print clean) plus `print:hidden` utility class. Export button disabled with explanatory tooltip — full Export needs the Reports module renderer (deferred). |
| BUG-015 | High | Feature | Admin → Tender invitation workflow | 2026-05-27 | Full end-to-end: visibility selector on create form (PUBLIC default), new `Manage Invited Vendors` panel on detail page (renders only for INVITATION_ONLY), three new endpoints (`POST/GET/DELETE /tenders/:id/invited-vendors`), status-based add/remove gates (add allowed Draft→Clarification Period, remove allowed Draft/InternalReview/Approved only), publish gate requires ≥3 invitees for INVITATION_ONLY, vendor `findAll`/`findOne` filter rewritten to OR PUBLIC with INVITATION_ONLY + invited-membership. Audit events `TENDER_VENDOR_INVITED/UNINVITED` (HIGH risk). |
| BUG-032 | Medium | Feature | Vendor portal blocked-state messaging | 2026-05-27 | NEW central registry `apps/web-vendor/src/lib/vendor-messages.ts` (12 states + `blockedStateForTender(status)` helper) + `<MessageBanner>` component with info/warning/danger severities. Vendor tender detail page now renders the appropriate banner instead of the generic "Bidding only available during Published or Clarification Period" copy. Remaining pages (dashboard, bid wizard, login) can adopt the registry incrementally — wiring is mechanical. |
| BUG-036 | High | Feature | Admin → Technical Comparison page (Phase B) | 2026-05-27 | **Phase B complete.** New NestJS comparison module with `GET /tenders/:id/comparison/technical` aggregating TechnicalEvaluation + TechnicalEvaluationScore rows into per-vendor consensus (simple average) + per-criterion consensus + per-evaluator breakdown. Migration 011 seeds `comparison:technical:view` + Phase C/D sibling permissions (4 new permissions + 11 role grants; SYSTEM_ADMIN omitted from commercial-side). New `/technical-comparison` admin route with tender picker, `TechnicalMatrix` (vendor-as-rows ↔ criterion-as-rows toggle, sticky first column, gate badges), and `VendorTechnicalCard` (per-criterion consensus + per-evaluator details with notes). Sidebar entry gated on `comparison:technical:view`. Suspense wrapper around `useSearchParams` to satisfy Next.js SSG. Verified end-to-end on staging. |
| BUG-035 | High | Feature | Admin → Commercial Comparison page (Phase C) | 2026-05-27 | **Phase C complete.** `commercialComparison()` added to ComparisonService aggregating tech score + commercial total + commercial envelope state + bid documents + vendor profile snapshot + per-evaluator comments; pre-computes `lowestPassBidId` per master-plan F1; service-side 403 if no commercial envelope has been opened yet. `GET /tenders/:id/comparison/commercial` gated by `comparison:commercial:view`. NEW `CommercialMatrix` (Summary ↔ Itemized toggle — Itemized is a Phase-F placeholder until BOQ template lands; lowest-PASS row highlighted with Award icon + "Lowest PASS" badge; FAIL rows grayed at 60% opacity). NEW `VendorComparisonCard` with 5 blocks (line items, tech detail with link to Tech Comparison, commercial docs reusing `<CommercialDocumentsList>` + PDF viewer, vendor profile, Recommend button). `/commercial-comparison` page replaced in place; old XLSX-export-centric layout removed; `/reports` XLSX export stays working until Phase G. Audit-view-count badge in header links to `/audit-log?tenderId=…`. Recommend button still POSTs to the legacy `/award-recommendation` endpoint as a stop-gap — Phase D's `AwardConfirmDialog` will replace it with quorum check + notification opt-ins. |
| BUG-025 | High | Bug | Admin → Commercial Comparison + Committee Opening | 2026-05-27 | **Closed by Phase C.** The commercial documents surface now appears as Block 3 of the per-vendor card on the redesigned Commercial Comparison page. Committee Opening page already had the inline `<CommercialDocumentsList>` from the 2026-05-27 morning bundle. Both sides covered. |
| BUG-039 | High | Feature | Admin → Award flow (Confirm) | 2026-05-27 | **Phase D complete.** Single Confirm endpoint `POST /tenders/:id/award/confirm` collapses the legacy Recommend→Approve chain per master plan F5. Server re-verifies isLowest (client can't lie). Lowest-PASS = zero friction; override = text ≥100 chars + PDF + DB CHECK constraint. Atomic transaction creates Award row + flips tender→Awarded + winning bid→AWARDED. Notification opt-ins recorded for Phase E dispatch. AwardConfirmDialog frontend integrates with quorum chip + PDF upload + notification toggles. Closes BUG-026 (committee can pick any PASS with justification). |
| BUG-040 | High | Feature | Admin → Committee Opening → Quorum + Chair check | 2026-05-27 | **Phase D complete.** Migration 012 adds `required_quorum_count` + `required_role_code` (default CHAIR) to committee_sessions. New `GET /tenders/:id/quorum` returns hasQuorum + reason string + presentCount/requiredCount/chairPresent. QuorumStatus chip mounted in Commercial Comparison header; AwardConfirmDialog blocks Confirm when quorum not met. |
| BUG-041 | Medium | Feature | Admin → Awarded tender → Amend Award | 2026-05-27 | **Phase D complete.** `POST /tenders/:id/award/amend` creates a new Award row that supersedes the active one via `superseded_by_award_id`. Always requires text + PDF (no zero-friction path). AmendAwardDialog wired to the tender detail page Amend Award button (visible only when status=Awarded). Original Award + amendment both remain visible forever per master plan F7. Gated by `award:amend` permission (PROCUREMENT_ADMIN only; two-person rule with SYSTEM_ADMIN deferred). |
| BUG-026 | High | Feature | Admin → Commercial Comparison | 2026-05-27 | **Closed by Phase D (BUG-039).** Override-with-justification is now the standard path; the new AwardConfirmDialog enforces text + PDF for any non-lowest-PASS pick. |
| BUG-038 | Medium | Feature | Admin → Awarded tender → Award Minutes PDF | 2026-05-27 | **Phase E complete.** `award-minutes.service.ts` renders HTML→PDF via puppeteer-core + system chromium (api.Dockerfile updated with chromium-alpine + fonts). PDF includes header, decision summary, justification block, all bids considered (winner highlighted, FAIL grayed), committee attendance, notification opt-in flags, immutable SHA-256 footer. Always generates a fresh copy per master plan H2. New `GET /tenders/:id/award/minutes.pdf` gated by `award:minutes:generate`. "Generate Award Minutes" button on tender detail page (Awarded status only) triggers download. award_minutes table populated; each generation appends a new row + storage object. |
| BUG-043 | Medium | Feature | Admin → Settings → Evaluation Criteria Library | 2026-05-28 | **Phase F (library) complete.** Migration 014 creates `evaluation_criteria_library` table (+ 6 starter seeds), `criteria:library:manage` + `criteria:tender:edit` permissions. NEW NestJS module `evaluation-criteria` with library CRUD endpoints (`GET/POST /evaluation-criteria/library`, `PUT/DELETE /evaluation-criteria/library/:id`). Soft-delete only (is_active=false). NEW `/settings/evaluation-criteria` admin page with full CRUD UI + show-inactive toggle. Sidebar entry gated by `criteria:library:manage`. |
| BUG-046 | Critical | Bug | Admin layout → Sidebar + TopNavBar | 2026-05-29 | **Hydration crash (React #418) on every admin page.** `Sidebar.tsx:54` and `TopNavBar.tsx:33` called `getAccessToken()` during render. SSR has no `document.cookie` → render produced 1-item sidebar + "User" placeholder. Client hydration with cookie → render produced 14-item sidebar + real user. Mismatched DOM → React threw #418 → admin layout crashed into error overlay → every page beneath looked broken (Commercial Comparison blank, Phase A modal not openable, sidebar gates not effective, etc). Fix: deferred token read behind `useEffect`; both files now use `useState(undefined)` + `useEffect(setToken(getAccessToken()))` so SSR and first client render produce identical DOM. Verified SSR `<nav>` contents = `['/dashboard']` on all admin routes post-fix; new layout chunk hash `a2eb0aea5e608a64`. |
| BUG-047 | High | Bug | Admin → Technical Evaluation + Comparison | 2026-05-29 | **Per-criterion scores never persisted.** `EvaluateBidDto` accepted only `{score, notes}`; the frontend scorecard concatenated per-criterion entries into the `notes` text and POSTed only the aggregated total. `technical_evaluation_scores` table had 0 rows system-wide, so the Phase B Technical Comparison matrix was structurally empty. Fix: `EvaluateBidDto` gains a `criterionScores: CriterionScoreDto[]` array (criterion / weight / score / comments); service writes per-criterion rows to `technical_evaluation_scores` in a transaction (atomic replace) and computes `overallScore` as weighted average from them; frontend `technical-evaluation/page.tsx` POSTs the per-criterion array instead of stringifying into notes. Legacy aggregated `score`-only payloads still accepted (backwards compatible). |
| BUG-048 | Medium | Bug | Admin → PDF viewer modal | 2026-05-29 | **Viewer streamed any mime type.** `bids.service.ts` viewBidDocument did not check `mime_type`; the 10 legacy `text/plain` bid_documents (pre-Phase-A upload enforcement) streamed through the view endpoint and the frontend modal viewer (PDF.js) broke on them. Fix: added `if (doc.mimeType && doc.mimeType !== 'application/pdf') throw new BadRequestException(...)` immediately after the doc lookup. Verified: text/plain doc → 400, application/pdf doc → 200. Master plan A invariant ("PDF only for the viewer") now enforced server-side. |
| BUG-050 | Critical | Feature | Admin RBAC — dept-scoping (BUG-028 Part B, tenders) | 2026-05-29 | **Tenders list + detail are now dept-scoped.** JWT extended with `departments: string[]` populated at login from `user_departments` join. `TendersService.findAll` and `findOne` filter by `where.departmentId ∈ user.departments` when caller lacks the new `system:view_all_departments` bypass perm. Bypass granted to SYSTEM_ADMIN + AUDITOR + PROCUREMENT_ADMIN per owner decision (manager handles org-wide procurement). Out-of-dept detail returns 404 (no existence leak). All 10 active LOCAL users had `token_version` bumped so stale JWTs (without the `departments` claim) can't bypass. Also added UI permission gating on `/tenders` (Create button → `tender:create`) and `/tenders/[id]` action buttons (Submit/Publish/Close/Tech-Open/Edit/Cancel/Amend/Minutes/Award each gated by their matching perm). Verified: engineer JWT carries `departments=[<PROC>]`; engineer's list returns only Procurement tenders; engineer GET /tenders/<IT-tender> → 404; manager (bypass) sees all 5 depts and 200 on same. **Same dept-scoping pattern still TODO for clarifications / audit / reports / technical-evaluation / committee / commercial-comparison lists — captured as BUG-051.** |
| BUG-049 | Medium | Feature | Admin → Committee Opening → Schedule Session | 2026-05-29 | **Quorum count gate had no UI.** Backend `committee_sessions.required_quorum_count` column + `award.service.ts:152` quorum logic shipped in Phase D, but no input on the Schedule-Session form meant every session was created with `required_quorum_count = NULL`, silently disabling the count gate (chair-presence rule still worked). Fix: added "Required Quorum (members PRESENT)" number input + "Required Role at Confirm" select to the create form; extended `CreateSessionDto` with `requiredQuorumCount?` + `requiredRoleCode?`; `committee.service.ts` writes them on session create; serialiser returns them so the existing session header now displays "Quorum: N (+ CHAIR present)". Blank quorum value still allowed (chair-only gate, by design). |
| BUG-045 | Low | Cleanup | Reports module → Remove Commercial Comparison export | 2026-05-28 | **Phase G complete.** Removed the `commercial_comparison` entry from the REPORT_CATALOG in `reports.service.ts` + the case branch + the `commercialComparison()` private method in `report-renderer.service.ts`. The card automatically disappears from the Reports & Analytics UI (admin page reads the catalog from `GET /reports`). New attempts to `POST /reports/commercial_comparison/export` return `404 Unknown report code`. All other report codes (tender_summary, vendor_directory, vendor_activity, bid_submissions, technical_evaluations, award_history, audit_trail) still work. BUG-033 marked superseded in the tracker. |
| BUG-044 | Medium | Feature | Admin → Tender edit → Per-tender Criteria Editor | 2026-05-28 | **Phase F (per-tender) complete.** `PUT /tenders/:id/criteria` atomic replace — validates weights sum to 100 (±0.05 FP slop), unique codes, positive max-scores, transactional upsert+delete. Gated by `criteria:tender:edit` and tender status (Draft/InternalReview/Approved only). NEW `<TenderCriteriaEditor>` component mounted on `/tenders/[id]/edit` page — inline rows, add-from-library OR custom, live weight-sum indicator, mandatory-gate toggle, Save disabled until weights==100. Technical Evaluation scorecard now reads `GET /tenders/:id/criteria` (falls back to DEFAULT_CRITERIA for pre-Phase-F tenders). |
| BUG-042 | Medium | Feature | Vendor portal + Notifications → Optional award notifications | 2026-05-27 | **Phase E complete.** Migration 013 seeds TENDER_AWARDED_WINNER + TENDER_AWARDED_LOSER notification templates. AwardService.dispatchAwardNotifications() resolves recipients by VendorUser.isPrimaryContact (falls back to all active users); auto-called from confirmAward() when opt-in flags TRUE (best-effort, failures audit-logged but don't roll back). Manual re-trigger: `POST /tenders/:id/award/notify` (perm `notification:vendor:trigger`) re-dispatches with optional body flags. Vendor portal `/bids/[bidId]` shows celebratory emerald "You have been awarded" banner when bid.status=AWARDED, thank-you slate "Awarded to another vendor" when tender is Awarded/Closed but they didn't win. |
| BUG-099 | Low | UX (Pending) | Cross-envelope filename warning hint on per-bid document lists | 2026-06-04 | **Pending — next session pick up.** Owner walked TDR-2026-0018 Technical Comparison and saw Vendor 1's TECHNICAL envelope list includes a file named `commercial.pdf` (vendor uploaded the wrong file into the technical slot at submit time). Data is correct (submitted-bid immutability rule applies — can't move it). Owner picked option 2 from the three offered: show a small ⚠ icon + tooltip on any file whose filename hints it belongs to the other envelope. Cosmetic only, no data change, no DB write. **Scope:** `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` (technical list flags filenames containing "commercial") + `apps/web-admin/src/components/CommercialDocumentsList.tsx` (commercial list flags filenames containing "technical"). Use a case-insensitive substring check; icon = `lucide-react` `AlertTriangle` amber, tooltip "Filename suggests this may be misfiled in this envelope." |
| BUG-098 | Medium | UX | Commercial Comparison — remove standalone Tech matrix + per-vendor "Show technical breakdown" shows only this vendor | 2026-06-04 | **Fixed.** Owner walked BUG-097's standalone Technical Comparison matrix and identified 3 redundant copies of technical info on the page: (1) Technical + Tech score columns inside the CommercialMatrix (original Phase C design, kept), (2) standalone TechnicalMatrix at top of page (BUG-097 — deleted), (3) per-vendor card's "Show technical breakdown" expander that previously rendered the full matrix with all vendors. **Changes:** (a) Standalone `<TechnicalMatrix>` section removed from `commercial-comparison/page.tsx` along with its parallel `/comparison/technical` fetch + state + import — page goes back to a single CommercialMatrix at the top. (b) `InlineTechBreakdown` in `VendorComparisonCard.tsx` rewritten — instead of mounting `<TechnicalMatrix>` it now renders a small 3-column table: Criterion (with Mandatory tag) / Max / Score, plus a Total row with the consensus result pill. Uses `Math.round` formatter consistent with BUG-096. The fetch + lookup is per-card, so when owner clicks "Show technical breakdown" on Vendor 2's card they see only Vendor 2's per-criterion scores. |
| BUG-097-fix | High | Bug | Tech matrix on Commercial Comparison rendered blank on awarded tenders + per-vendor card tech score still showed "/max" | 2026-06-03 | **Fixed.** Two follow-ups to BUG-097 (owner reported "Technical comparison is totally blank no data anymore"). (a) Verified the `/comparison/technical` endpoint with manager@ctmp.local on TDR-2026-0016 — returns 2 vendors, 4 criteria, consensusScore + consensusByCriterion populated. Not a data issue. **Root cause:** I had the Technical matrix INSIDE the `!comparison.award` branch on the Commercial Comparison page. Awarded tenders take the `comparison.award` true branch (renders AwardSummaryCard + a collapsed `<details>`), so the Technical matrix simply never rendered. Moved the Commercial + Technical matrices ABOVE the award conditional so they render for both awarded and pre-award tenders. Also defaulted the `<details>` `open` so the per-vendor section unfolds by default on awarded tenders (no extra click needed). (b) Per-vendor Block 2 Technical-score number still printed `25.0 / 30` — fixed `fmtScore()` inside `VendorComparisonCard.tsx` to mirror the TechnicalMatrix contract: round integer, no denominator. |
| BUG-097 | High | Feature bundle | Tech matrix on Commercial Comparison · Reschedule meeting · Attendance lock until meeting day · 100→50 char min · acknowledge existing Tenders search | 2026-06-03 | **Fixed.** (a) **Technical matrix below Commercial matrix** on `/commercial-comparison`. Owner asked twice — now the page fetches `/comparison/technical` in parallel with the commercial fetch (`loadComparison`) and renders a `<TechnicalMatrix>` with `defaultLayout="criterion-rows"` directly under the `CommercialMatrix` (above the per-vendor cards). Reads top-to-bottom: commercial pricing row → technical criteria → per-vendor cards. (b) **Reschedule meeting.** New backend `PATCH /committee-sessions/:id` (gated by `committee:create_session`) updates `scheduledAt` and/or `location` when session not COMPLETED. Audit MEDIUM `COMMITTEE_SESSION_RESCHEDULED` with before/after. Frontend: Reschedule link beside the meeting date on Committee Commercial Opening header opens a modal with date/time/location inputs prefilled from current values. (c) **Attendance lock.** New `beforeMeetingDay` (day-precision compare so attendance opens at 00:00 on the meeting day). PRESENT/ABSENT buttons get `disabled={beforeMeetingDay}` + tooltip; amber banner above the member list explains "Attendance is locked until the meeting day (DD/MM/YYYY)." Separate from the existing minute-precision `beforeMeeting` gate on Open Commercial Envelopes (BUG-079). (d) **100→50 char min override justification.** Backend `award.service.confirmAward` text-length check changed to 50; FAIL-bid path same. Frontend `AwardConfirmDialog`: `overrideMissingText`, warning text, placeholder, and the "X/100 minimum" counter all updated to 50. (e) **Tenders search** — verified existing implementation already has search input + status dropdown with all 17 statuses + Clear Filters button. No change needed; will add explicit Search button pattern if owner requests after walk. Committee Commercial Opening page redesign (owner's #2 request — "similar to Commercial Comparison layout") deferred as a larger UX rework — separate bundle. |
| BUG-096 | Medium | Bug + UX | Awarded Tenders archive — Commercial tab silent-blank · Tab reorder (Commercial before Technical) · Matrix score format (round int, no `/max`) · Default criteria-rows everywhere | 2026-06-03 | **Fixed.** Owner walkthrough follow-up to BUG-095. (a) **Commercial tab silent-blank** investigated. Likely path was the endpoint returning 403/null, my fetch did `.catch(() => null)` and the tab fell through to "No commercial comparison data." with no clue why. Now: per-tab `commercialError` and `technicalError` state captures the actual error message and surfaces it in a red banner inside the affected tab. Same instrumentation on the Technical tab. (b) **Tab reorder** — owner asked Technical to sit right below Commercial. New order: Overview → Award → **Commercial** → **Technical** → BoQ → Documents → Audit. (c) **Score format** — `TechnicalMatrix.fmtScore` rewritten: `Math.round(v)` and drop the "/ max" denominator. Owner: "Change 25.0 /30 to 25 and only round figure." The Max column already shows the maximum so the denominator was redundant. Applies to all consensus + per-criterion cells in both layouts. (d) **Default criterion-rows** — standalone `/technical-comparison` page now passes `defaultLayout="criterion-rows"` to the matrix; matches the inline view inside `VendorComparisonCard` (criteria stacked vertically, vendors as columns — easier to scan when many criteria). User can still toggle to vendor-rows. (e) **Awarded archive Technical tab** also gains `defaultLayout="criterion-rows"` + null-safety on `technical.vendors`/`technical.criteria`/`technical.totalMaxScore`. |
| BUG-095 | High | Bug bundle + Feature | PDF optional on override/FAIL award · Commercial-tab full crash-proof · Tech-score relabel · Matrix defaults criteria-rows · LOCKED envelope badge · winnerPrice from BoQ | 2026-06-02 | **Fixed.** Owner walkthrough follow-up. (a) **PDF justification is now optional** on overrides + FAIL awards. Backend `award.service.confirmAward` only requires text (min 100 chars); PDF stored when provided. DB constraint `awards_override_requires_justification` rewritten via migration `025_bug095_optional_pdf.sql` — drops the `justification_pdf_storage_key IS NOT NULL` clause; just text suffices. UI: AwardConfirmDialog label "Justification PDF *" → "Justification PDF (optional)", warning text rewritten, `canConfirm` no longer gated on PDF presence. (b) **Commercial tab still crashed.** Bulletproofed: `commercial.vendors` defended with `Array.isArray` guard + empty-bid early return; same for `boqTemplate`. `safeVendor()` extended to default the nested `vendor.vendor` object (companyName/status/country) + coerce `commentsByEvaluator`/`boqLines`/`commercialDocuments` via `Array.isArray` checks + default `technicalResult: 'PENDING'`. (c) **Technical-score label** "Technical score (read-only)" → "Technical score" inside `VendorComparisonCard` Block 2. (d) **Inline matrix defaults to criteria-rows.** `TechnicalMatrix` gains `defaultLayout?: Layout` prop; `InlineTechBreakdown` passes `'criterion-rows'` so the inline view defaults to vendors-as-columns (compact for many vendors). The standalone `/technical-comparison` page keeps `'vendor-rows'` default — unchanged. (e) **LOCKED envelope badge** in `CommercialMatrix` envelope-status cell now renders a distinct amber pill "LOCKED · Technical FAIL" with `title=` tooltip explaining the auto-lock from Finalize Technical Results. OPENED is a green pill, SEALED a slate pill. Owner now sees WHY a commercial envelope is locked without DB lookup. (f) **winnerPrice from BoQ.** `comparison.service.activeAwardSummary` now computes the winner's price the same way the vendor-list aggregator does — sum of BIDDING `unit_price × qty` from `bid_boq_items` first, manual `commercialEvaluations.totalPrice` average as fallback. Mirrors BUG-091 fix on award.service. Means TDR-2026-0016's confirmed award now shows actual KWD winning price in the AwardSummaryCard instead of "—". |
| BUG-094 | High | Bug bundle + Feature | Archive Commercial crash · Audit fields blank · Allow awarding technically-FAIL vendor with justification · Inline tech detail | 2026-06-02 | **Fixed.** Four owner-reported issues bundled. (a) **Commercial tab JS crash** on Awarded Tenders archive — `commentsByEvaluator` (and other vendor array fields) could be missing for legacy/empty bids. New `safeVendor()` helper in `awarded-tenders/page.tsx` shallow-merges defaults (`commentsByEvaluator: []`, `boqLines: []`, `commercialDocuments: []`, `currency: 'KWD'`) before handing the vendor to `<CommercialMatrix>` and `<VendorComparisonCard>`. (b) **Audit timeline em-dashes** — frontend was reading `occurredAt` + `actorDisplayName`, backend actually returns `eventTime` + `actorName`. `AuditEntry` interface + render cells fixed. (c) **Allow awarding technically-FAIL vendor** — `award.service.confirmAward` previously threw outright when `bid.technicalResult !== PASS`. Removed the hard refusal; FAIL bids now take the existing override path: justification text (min 100 chars) + attached PDF required. Different error wording when FAIL-specific. UI: `VendorComparisonCard` Block 5 (Award action) for FAIL bids replaces the "cannot be awarded" red box with a clear warning + an enabled "Recommend FAIL vendor (override)" button. Existing `AwardConfirmDialog` already handles non-lowest justification — no dialog change needed. Notification opt-ins for winner/losers reused. (d) **Inline technical breakdown** — owner asked for tech score detail to show in the same frame instead of opening the BUG-070 modal. `TechDetailModal` removed; new `InlineTechBreakdown` component embedded directly under the technical-score row inside each vendor card. "Show technical breakdown ▼" / "Hide ▲" toggle. Fetches `/tenders/:id/comparison/technical` lazily; same `<TechnicalMatrix>` renders with the clicked vendor highlighted. Unused `X` icon import and `VendorTechnicalCard` (component) import dropped. |
| BUG-093 | High | Feature | Per-role sidebar hide list — decouple menu visibility from data permissions | 2026-06-02 | **Fixed.** Owner directive: *"i just want to remove menues not the permission."* Previous design coupled sidebar entry visibility to data perms, so hiding a menu meant losing endpoint access (e.g. removing `comparison:technical:view` from EXECUTIVE hid Technical Comparison but also broke the Technical tab inside Awarded Tenders). New decoupled model: each role gets a `hidden_sidebar_items TEXT[]` column listing sidebar `href` values to hide. Permissions stay untouched — data access works everywhere else the user can reach. Migration `024_bug093_role_hidden_sidebar.sql` adds the column. Prisma schema extended. `auth.service.ts` new `loadHiddenSidebarItems(userId)` returns the union across all the user's roles; included in JWT as `hiddenSidebarItems`. `roles.service.ts` new `setHiddenSidebar(roleId, items)` validates input, dedupes, writes the column, transactionally bumps `token_version` for every user holding the role (so their JWT refreshes on next request and sidebar updates immediately), audits HIGH `ROLE_HIDDEN_SIDEBAR_UPDATED`. New endpoint `PATCH /roles/:id/hidden-sidebar` gated by `roles:manage`. `findOne` now returns `hiddenSidebarItems`. Frontend: `auth.ts` adds `getHiddenSidebarItems(token)` JWT decoder. `Sidebar.tsx` filters out entries in the hide set BEFORE the existing perm gate. Settings → Roles tab gains a "Hidden sidebar entries" section above the perms checklist with a row per sidebar item (label + href + checkbox) and a "Save hide list" button independent of the perms Save button. Union semantics across roles: if any role hides an entry, it's hidden for users with that role. |
| BUG-092 | High | Bug bundle | Awarded Tenders UX (search not applied, no reset, auto-select last) + missing serializer fields + EXECUTIVE archive read perms | 2026-06-02 | **Fixed.** Three layered issues from owner walkthrough. (a) **UX:** Filter bar no longer auto-fetches on every keystroke. Added explicit **Search** + **Reset** buttons. Page starts blank — no auto-select of last tender, no URL persistence of `?tenderId=`. Picker hidden until first Search. Empty hint banner ("Set filters above and click Search...") replaces the auto-loaded picker. Selecting a tender clears on subsequent Search to avoid stale detail panel. (b) **Backend serializer:** `tenders.service.ts:findOne` now includes `awardedVendor` relation; `serializeDetail` emits `awardedAt`, `awardedAmount`, `awardedVendorId`, `awardedVendorName`. Owner saw all of these blank on Overview tab because they were never on the response. `clarificationDeadline` was already emitted — blank value means the tender genuinely has no clarification deadline. (c) **Perms:** Migration `023_bug092_executive_archive_read.sql` grants EXECUTIVE `comparison:technical:view` + `tender:audit:view` so the Technical + Audit tabs populate. Without these the endpoints 403 and tabs render "No data". Token version bumped on the executive user. The remaining "No data" on Award / Commercial tabs for staging Tender Closed rows is a data-quality gap: the 3 staging closed tenders (0005/0007/0013) were closed without going through the proper Confirm flow, so `awards` rows + `tenders.awarded_amount` are NULL. For real awards going forward this won't apply. |
| BUG-091 | Critical | Bug | Award Confirm rejected with "Client claimed isLowest but server-computed lowest-PASS bid differs" for BoQ-only bids | 2026-06-02 | **Fixed.** Owner (as EXECUTIVE) tried to confirm award on TDR-2026-0016, hit 400 with that message. Root cause: BUG-068 added BoQ-derived pricing on `commercial-comparison.service.ts` (sum of `unit_price × qty` over BIDDING rows) which the UI uses to compute `lowestPassBidId`. But `award.service.ts:computeLowestPassBidId` was never updated and still only looked at `commercial_evaluations.totalPrice` (manual entry — BUG-053 path). For TDR-2026-0016 both PASS bids have NULL manual entries and real BoQ totals (4000 vs 7000) → server returned `null` for lowest → every Confirm with `isLowest=true` got rejected as tampering. Fix: `computeLowestPassBidId` now uses the same rule as `comparison.service.ts:vendors.map` — BoQ-driven `boqTotal` first, manual `commercialEvaluations.totalPrice` average as fallback. Aligned exactly so client + server agree on lowest-PASS for every tender shape (BoQ-only, manual-only, mixed). |
| BUG-090 | High | Feature | Awarded Tenders archive (read-only) + remove Awarded/Closed from Commercial Comparison picker | 2026-06-02 | **Fixed.** New `/awarded-tenders` page modeled on Commercial Comparison but purely read-only: filter bar (status toggle Awarded/Tender Closed/Both, department, category, awarded-date range, free-text search) + picker + tabbed detail panel (Overview, Award, Technical, Commercial, BoQ, Documents, Audit Trail). All artefacts use existing endpoints + existing components in read-only mode (`AwardSummaryCard`, `TechnicalMatrix`, `VendorTechnicalCard`, `CommercialMatrix`, `VendorComparisonCard canEvaluate=false`, `TenderBoqEditor editable=false`). Documents tab surfaces: RFQ docs, award justification PDF, award minutes PDF, per-bid technical+commercial envelope docs. Audit tab renders timeline from `/tenders/:id/audit-logs`. Backend: `ListTendersDto` extended with `awardedFrom`/`awardedTo`/`category`/`search`; service `findAll` composes them with the existing dept-scoping using a `where.AND` array (avoids the earlier `where.OR` collision). New migration `022_bug090_awarded_view.sql` adds permission `awarded:view` (category: tender) granted to EXECUTIVE / AUDITOR / PROCUREMENT_ADMIN / SYSTEM_ADMIN. Sidebar entry `Award` icon between Commercial Comparison and Vendor Management, gated by `awarded:view`. Token version bumped on all 10 users in those 4 roles so JWTs refresh on next login. Commercial Comparison picker tightened: `ELIGIBLE_STATUSES` dropped from `[active + completed]` to active only (Committee Commercial Opening, Commercial Evaluation / Comparison, Award Recommendation); WALK-051's Active/Completed optgroup split retired (`COMPLETED_SET` removed). Past awards no longer clutter the live evaluation picker. |
| BUG-089 | Medium | Bug + Cleanup | Admin app — favicon 404 + cross-origin 401 after idle (admin calling vendor URL) | 2026-06-02 | **Fixed.** (a) `apps/web-admin/public/favicon.ico` added (1150-byte 16x16 ICO, accent blue). Also `apps/web-admin/src/app/icon.tsx` Next.js icon convention so `<link rel="icon">` resolves. (b) Root cause of cross-origin 401: staging `.env` set a single `PUBLIC_API_URL=https://vn.hadiclinic.com.kw:4201` (vendor URL) which was baked into BOTH admin + vendor builds at build time. Admin browser was calling the vendor host for `/api/v1/*` — worked while JWT valid, 401 once expired. Fix: compose now reads `ADMIN_PUBLIC_API_URL` for admin and `VENDOR_PUBLIC_API_URL` for vendor (both fall back to `PUBLIC_API_URL` for back-compat). Staging `.env` updated with `ADMIN_PUBLIC_API_URL=https://ctmp-admin.hadiclinic.com.kw:4202`. Admin container rebuilt and recreated; new build markers confirmed in `.next/static/chunks/`. |
| BUG-088 | Medium | Bug | Executive Dashboard — Top Vendors empty, Cycle Time 0d, sums affected by null awarded_amount | 2026-06-02 | **Partially fixed.** Underlying data gap: existing award flow on staging never populated `tenders.awarded_amount` (only `awarded_at` + `awarded_vendor_id`). Analytics service `awardedRows` filter loosened from `awardedAt != null && awardedAmount != null` to just `awardedAt != null`. Null amounts contribute 0 to sums but the rows now show up in **Top Vendors** (3 vendors visible on staging: E2E Test Vendor LLC, Acme Builders LLC, Vendor 1). Deeper fix (populating `awarded_amount` from `commercial_evaluations.totalPrice` or `bid_boq_items` sum on award confirm) deferred — separate workstream in `award.service.ts:confirmAward`. Frontend null-safe display labels (N/A vs 0) also deferred to BUG-088 Phase 2. **2026-06-04 (BUG-100):** `AnalyticsService._resolveAwardedAmount()` now implements an end-to-end fallback used by the new vendor directory + per-vendor profile endpoints — when `Tender.awardedAmount IS NULL`, falls back to the awarded vendor's bid's latest `CommercialEvaluation.totalPrice`. This keeps the new dashboard accurate today; the underlying `confirmAward` populate-on-write fix is still the right long-term answer and once shipped, the fallback can be simplified out. |
| BUG-087 | High | Feature | EXECUTIVE role + `executive:dashboard` permission + sidebar/backend gate | 2026-06-02 | **Fixed.** New permission `executive:dashboard` (category: executive) and new system role `EXECUTIVE` introduced via migration `021_bug087_executive_role.sql`. EXECUTIVE granted: `executive:dashboard`, `system:view_all_departments` (cumulative cross-dept view per owner's directive), `tender:view`, `comparison:commercial:view`, `comparison:commercial:confirm` (so they can do the final Confirm Award click). SYSTEM_ADMIN also granted `executive:dashboard`. `executive@ctmp.local` (existing user) assigned EXECUTIVE role (additive — kept legacy EXECUTIVE_VIEWER too); token_version bumped to force JWT refresh. Backend: `analytics.controller.ts` gate changed from `reports:view` → `executive:dashboard`. Frontend: `Sidebar.tsx` /executive entry gate changed to `executive:dashboard`. Procurement Admin / Manager / Auditor lose Executive sidebar access. Effective perms on executive@ctmp.local verified via SQL: 9 perms total (including the 5 from EXECUTIVE + 4 legacy from EXECUTIVE_VIEWER). |
| BUG-086 | High | Feature | Executive Dashboard — KPIs, monthly trend, financial breakdowns, vendor concentration | 2026-06-02 | **Fixed (Phase 1 MVP).** New top-level page `/executive` gated by `reports:view` (already on PROCUREMENT_ADMIN / SYSTEM_ADMIN / MANAGER). New backend module `apps/api/src/modules/analytics/` (controller + service) exposes `GET /analytics/executive-summary?year=YYYY` returning: (a) 8 KPI cards — Tenders Created, Estimated Value, Awarded Value, Realised Savings, Savings Rate, Active Pipeline, Avg Days to Award, Awarded Tenders — each with YoY delta vs prior year; (b) monthly trend (12 months, est vs awarded per month); (c) department breakdown (sorted by spend); (d) category breakdown; (e) top-10 vendors by award value with share-of-total; (f) vendor concentration risk indicator (Top-3 / Top-5 share, colour-coded green/amber/red); (g) active pipeline by status with estimated value sum; (h) cycle-time footer (Created→Awarded and Submission→Awarded averages). All aggregations on-demand from existing tender/award/vendor rows — no new schema, no migration, no cache layer. Frontend uses pure-Tailwind bar charts (width %s) so no chart library added. Year selector + Print button (browser PDF). Sidebar entry "Executive" with TrendingUp icon between Dashboard and Tenders. Phase 2 roadmap captured in source comments: drill-downs, time-range picker beyond year, forecasting, stage velocity heatmap, scheduled email digest, richer PDF export. |
| BUG-085 | Medium | Feature | Admin tender — Criteria/BoQ as tabs + Documents on edit page + Submit on edit page | 2026-06-02 | **Fixed.** Two friction points closed in one bundle. (a) **View/manager flow:** `/tenders/[id]` `TabId` extends to include `'criteria' \| 'boq'`; tab order Overview → Criteria → BoQ → Clarifications → Bids → Audit. Each new tab mounts `<TenderCriteriaEditor editable={false}>` / `<TenderBoqEditor editable={false}>` (read-only). When caller has `tender:edit` + status ∈ Draft/Internal/Approved, an "Edit on edit page →" link appears at top of the tab content (deep-links to `/edit#criteria` or `/edit#boq`). (b) **Officer/create flow:** `/tenders/[id]/edit` now hosts a **Tender Documents** block (new inline `TenderDocumentsBlock` component — same upload/list/delete pattern as detail page Overview), section anchor IDs (`#documents`, `#criteria`, `#boq`) for deep-links, **Submit for Approval** CTA at the bottom (status=Draft + `tender:edit`), and the `?from=create` banner moved to the **top** of the page with quick anchor links to each section. Page H1 reads "Tender Setup" when `?from=create`, "Edit Tender" otherwise. No backend / schema / endpoint / permission change. Same `EDITABLE_STATUSES` (Draft/Internal Review/Approved) gates everywhere. |
| BUG-084 | Medium | Feature | Vendor portal — BoQ CSV round-trip (download + import) in bid wizard | 2026-06-02 | **Fixed.** Mirrors BUG-072 admin CSV pattern. `Step2BoqPricing` in `apps/web-vendor/src/app/(portal)/bids/wizard/[tenderId]/page.tsx` gains **Download CSV** + **Import CSV** + a hidden file input. Six-column CSV: `item_no,description,qty,unit,status,unit_price`. Download builds from current form state (template + vendor's typed status/price) — supports iterate-in-Excel and iterate-in-app interchangeably. Import matches by `item_no` against in-DB template (procurement-defined qty stays authoritative), validates non-negative numeric `unit_price` when `status=BIDDING`, accepts `BIDDING`/`Bidding`/`NOT_BIDDING`/`Not bidding`/blank (defaults BIDDING). Missing-template-rows kept at current state (partial CSV OK); extra rows error with item_no name. Errors render row-numbered in a red banner. No backend / endpoint / permission change. CSV escaping (RFC-4180-lite) handles commas in procurement-defined descriptions. |
| BUG-083 | Medium | UX | Vendor portal — Disable "Start Bid" for tenders the vendor has already submitted | 2026-06-01 | **Fixed (Bundle 5).** `apps/web-vendor/src/app/(portal)/tenders/[id]/page.tsx` now also fetches the caller's bids via `/vendor-auth/me/bids` and, if a bid exists on this tender, renders **VIEW SUBMITTED BID** (post-submit) linking to `/bids/[id]`, **CONTINUE BID** (DRAFT) linking to the wizard, otherwise the original **START BID**. |
| BUG-082 | Medium | Feature | Vendor portal — My Bids page should show BoQ as view-only | 2026-06-01 | **Fixed (Bundle 5).** `apps/web-vendor/src/app/(portal)/bids/[bidId]/page.tsx` fetches `/tenders/:id/boq` + `/bids/:bidId/boq-items` and renders a read-only table with Bidding/Not bidding chips, per-line totals, and grand total. Hidden for legacy tenders (placeholder template) and DRAFT bids without saved lines. |
| BUG-081 | Medium | UX | Committee Commercial Opening — Technically Qualified Vendors commercial docs need View button (not just Download) | 2026-06-01 | **Fixed (Bundle 2).** `CommercialDocumentsList` now renders **View** alongside Download. View fetches blob with auth then calls `openPdfViewer` (which per BUG-071 opens in new tab). Permission gating mirrors Download (403 surfaces "Your role lacks commercial:view permission."). |
| BUG-080 | Medium | UX | Committee Commercial Opening list — hide tenders past Committee Commercial Opening state | 2026-06-01 | **Fixed (Bundle 3).** `committee-opening/page.tsx` `COMMITTEE_STATUSES` reduced to `['Commercial Sealed']` only. Supersedes WALK-043. |
| BUG-079 | High | Bug | Committee Commercial Opening — must block opening before meeting.scheduled_at | 2026-06-01 | **Fixed (Bundle 3).** Backend: `committee.service.ts:openEnvelopes` now throws `ConflictException({ code: 'BEFORE_MEETING_DATE', scheduledAt })` when `now < session.scheduledAt`. Frontend: `canOpenEnvelopes` gates the button via 60s-interval `nowTick`; danger banner + tooltip surface the scheduled date. |
| BUG-078 | Medium | UX | Admin app — replace browser-native confirm()/alert() with in-app modal | 2026-06-01 | **Fixed (Bundle 1).** New `DialogProvider` in `apps/web-admin/src/components/dialog/`. `useConfirm()` hook with `destructive` variant + `useNotify()` hook. Mounted in `(admin)/layout.tsx`. All 12 destructive `window.confirm(...)` call sites across committee-opening, technical-evaluation, vendors, settings, settings/evaluation-criteria, tenders/[id], ManageInvitedVendors replaced. Error-display `alert(...)` calls staged for a follow-up. |
| BUG-077 | Medium | Bug | Committee Commercial Opening — "Opening remarks" field not persisted | 2026-06-01 | **Fixed (Bundle 3).** Root cause: the `POST /committee-sessions/:id/open-commercial-envelopes` endpoint had no `@Body()` — the frontend posted `{ remarks }` but the backend dropped it. Now: controller accepts `{ remarks?: string }`, service writes `session.minutesText = remarks` in the `committeeSession.update` step. Frontend already hydrates from `session.remarks` (mapped from `minutesText`). |
| BUG-076 | Medium | Bug | Committee Commercial Opening — "Print Agenda" only prints current page (not a real agenda doc) | 2026-06-01 | **Fixed (Bundle 3).** New page `apps/web-admin/src/app/(admin)/committee-opening/agenda/print/[sessionId]/page.tsx` renders a clean agenda doc: meeting metadata, tender info, committee-member table with PRESENT/ABSENT + signature columns, agenda body, opening remarks, signature lines. Auto-triggers `window.print()` on mount; `@media print` hides admin chrome. Button now opens this page in a new tab with `?tenderId=...`. |
| BUG-075 | Medium | UX | Technical Evaluation list — finalized tenders should drop off (only pending evaluation appear) | 2026-06-01 | **Fixed (Bundle 2).** `technical-evaluation/page.tsx` fetch loop now uses `EVALUATION_STATUSES` only (drops `PAST_EVALUATION_STATUSES`). Supersedes WALK-054 revisit-read-only behaviour per explicit owner directive. |
| BUG-074 | Low | UX | Technical Evaluation form — show "Evaluating as: \<name\> · \<role\>" at top | 2026-06-01 | **Fixed (Bundle 2).** `technical-evaluation/page.tsx` now decodes `username` from the JWT (alongside the existing `sub`) and renders an accent-bordered banner above the scorecard: "Evaluating as: \<username\>". Hidden for past-status read-only views. JWT carries adUsername/email; richer name/role surfacing is a follow-up (would require a /users/me endpoint). |
| BUG-073 | Critical | Bug | Technical Evaluation — Finalize button allowed without all vendors evaluated | 2026-06-01 | **Fixed (Bundle 2).** Backend: `technical-evaluation.service.ts:finalize` now refuses with `ConflictException({ code: 'UNEVALUATED_VENDORS', unevaluatedVendors })` when any active bid (`SUBMITTED` or `LATE_ACCEPTED`) has zero technical evaluations. Frontend: Finalize button block computes `unevaluatedBids` from `bids` × `evaluations`; button is `disabled` with a red helper line listing un-evaluated vendor names, plus a tooltip. |
| BUG-072 | Medium | Feature | Admin Tender BOQ editor — add CSV import + template download | 2026-06-01 | **Fixed (Bundle 4).** Toolbar gains **Template** (links to `/templates/boq-template.csv`) + **Import CSV** (hidden file picker → inline parser). Parser validates header (item_no/description/qty/unit), qty > 0, unique item_no; errors render row-numbered in a red banner. Imported rows replace state and remain inline-editable; user clicks Save BOQ to commit (existing flow). |
| BUG-071 | Medium | UX | All PDFs across admin — open in new browser tab (not in-page modal) | 2026-06-01 | **Fixed (Bundle 1).** Owner directive: modal was accidentally dismissed by ESC/backdrop, losing the doc. `PdfViewerProvider.openPdfViewer` rewritten to call `window.open(src, '_blank')` and skip mounting the modal; call-site API preserved across all 3 admin call sites (`technical-evaluation`, `approvals`, `VendorTechnicalCard`). Blob URL revoke deferred 60s. Popup-blocked fallback navigates same-tab. **Locked-rule amendment**: master plan's "Modal full-screen PDF viewer / not new-tab" rule amended by owner directive 2026-06-01; audit-log-before-stream rule unchanged. |
| BUG-070 | Medium | UX | Commercial Comparison — "View Technical Comparison" modal should show full matrix, not single vendor | 2026-06-01 | **Fixed (Bundle 2).** Supersedes BUG-069 body. `VendorComparisonCard.tsx` `TechDetailModal` body swapped from `<VendorTechnicalCard target initialExpanded />` to `<TechnicalMatrix vendors criteria totalMaxScore passThreshold selectedVendorId={clickedVendorId} />`. Modal width bumped to `max-w-6xl`. Same `/tenders/:id/comparison/technical` fetch — now includes `tender.technicalPassThreshold`. |
| BUG-069 | Low | UX | VendorComparisonCard — View Technical Comparison opens in-page modal | 2026-06-01 | Owner walked the BOQ surface and asked for a single small change: the per-vendor card's "View Technical Comparison →" link was a `<Link href=/technical-comparison?tenderId=...>` that navigated away from Commercial Comparison entirely. Replaced with a `<button>` that opens a modal showing only THIS vendor's technical detail (criterion scores + evaluator notes). New `TechDetailModal` subcomponent in `VendorComparisonCard.tsx` fetches `/tenders/:id/comparison/technical`, finds the matching vendor row by `vendorId`, and renders the existing `VendorTechnicalCard` with `initialExpanded={true}`. ESC + backdrop click close. Owner explicitly said "i dont want any other changes" so no other surfaces touched. Zero new endpoints, zero new schema, zero new perms. |
| BUG-068 | Critical | Feature | Phase F BOQ unlock + auto-minutes on Confirm | 2026-05-31 | **Owner's proposal `docs/qa/Proposed_Automatic_Bid_Comparison.md` shipped end-to-end.** Implements master plan §D1 (locked 2026-05-27, deferred). Migration 020 adds `tender_boq_items` + `bid_boq_items` + `bid_boq_status` enum + auto-backfill placeholder row per legacy tender (15/15 backfilled). NEW boq module (`apps/api/src/modules/boq/`): GET/PUT tender BOQ template (admin gated on `tender:edit` + status gate Draft/InternalReview/Approved), GET/PUT bid BOQ entries (vendor own-bid in DRAFT only). New audit events `BOQ_TEMPLATE_REPLACED` (HIGH) + `BID_BOQ_REPLACED` (LOW). `comparison.service.ts:commercialComparison` now sums `bid_boq_items.unit_price × tender_boq_items.qty` from BIDDING rows; falls back to `commercial_evaluations.totalPrice` (BUG-053 manual) for legacy bids. Response includes `boqTemplate` + per-vendor `boqLines` for the Itemized matrix + per-vendor card breakdown. `bids.service.ts:submit` now requires every BOQ template row to have a status (BIDDING with price OR NOT_BIDDING) when tender has real BOQ; commercial PDF becomes optional in that case (locked owner decision: BOQ is the legal price record). Admin frontend: new `TenderBoqEditor` clone of TenderCriteriaEditor pattern, mounted on `/tenders/[id]/edit` alongside the criteria editor. CommercialMatrix Itemized view activated — rows = template lines, cols = vendors, cells = line total (or "Not bidding"). VendorComparisonCard renders new `BoqBreakdownBlock` when BOQ data present; `CommercialTotalBlock` (BUG-053) stays as fallback for legacy/no-BOQ tenders. Vendor portal bid wizard: NEW Commercial Pricing step between Technical and Commercial PDF, generates form from BOQ template, per-row Bidding/Not bidding toggle + unit price input + live grand total + Save Draft + auto-PUT on Continue. Commercial PDF step relabelled "(optional reference)" when BOQ is real. Bonus from Theme 3 standby plan: **WALK-055 auto-minutes** — `award.service.ts:confirmAward` fires `awardMinutesService.generate` best-effort after notification dispatch; failures logged, manual Regenerate button remains as recovery. Verified on staging: PUT BOQ template 3 rows OK (placeholder replaced); GET as vendor returns the 3 rows; status gate rejects PUT on PUBLISHED with 400; 4 backend endpoints + 1 frontend wizard step + 1 admin editor + 1 admin Itemized view + 1 admin per-vendor breakdown block + 1 backend submit gate all wired and typechecked clean. |
| BUG-067 | High | Bug bundle | Owner-verification follow-ups (BUG-067) | 2026-05-31 | **WALK-008/009/012/013/016/017/019/020/023/035 closed (regression items spotted during owner verification of BUG-052..066).** Five fixes batched: (a) Est. Budget formatter switched from `en-US`+`USD` to `en-GB`+`KWD` on tender detail Overview tab (closes WALK-008/012/019). (b) New `ClarificationReplyForm` subcomponent inside `ClarificationsTabPanel` — inline reply per thread with public/private toggle; gated on `clarification:reply` perm; POSTs to existing `/clarifications/:id/reply` endpoint (closes WALK-009/013/020). (c) Vendor portal tender doc download/view — three layered fixes: tender doc endpoint switched from `@RequirePermissions('tender:view')` to `@Public() + @UseGuards(OptionalVendorOrUserGuard)`; `streamDocument(tenderId, documentId, user)` runs `findOne` first for unified access control (BUG-015 vendor visibility OR BUG-050/062 internal dept-scope); audit log split — vendor caller goes to `actorVendorUserId` (avoids `audit_logs_actor_user_id_fkey` FK violation). Also added `tender_storage` docker volume mount — `/data/tender-documents` had no mount, so uploaded tender docs were wiped on every container recreate (closes WALK-016/017). (d) Re-added APPROVER role to engineer@ alongside TECHNICAL_EVALUATOR via SQL + token bump (closes WALK-023). (e) `RolesService.create` was a literal `throw 'Not implemented'` stub — implemented with input validation, audit log, `isSystem=false`. `RolesService.setPermissions` `isSystem` ForbiddenException removed — admin holding `roles:manage` can now edit grants on system roles. `findAll` serializer extended with `code` field (closes WALK-035). Verified end-to-end on staging: roles POST 200, system-role PATCH 200, vendor doc download 200 with correct file content. |
| BUG-066 | Low | Bug | Tender detail Bids stat tile shows 00 (serializer gap) | 2026-05-30 | **WALK-057 closed.** Owner reported the Bids stat tile next to Days Left showed 00 instead of the real count ("before it was showing now its not"). Root cause: `tenders.service.ts:serializeDetail` never emitted `bidCount`; the frontend rendered `tender.bidCount ?? 0` as `00` for any tender with bids. Fix: `findOne` Prisma include adds `_count: { select: { bids: true } }`; `serializeDetail` returns `bidCount: t._count?.bids ?? 0`. Verified on TDR-2026-0013 (2 bids in DB): detail endpoint now returns `bidCount: 2`. Fresh-create/update paths fall back to 0 (no bids attach mid-update; detail page re-loads via findOne afterwards). |
| BUG-065 | Low | UX | Theme J: Filter/search inputs on accumulating lists | 2026-05-30 | **WALK-056 closed.** Case-insensitive text filter (matches reference or title) added to three list surfaces: `/technical-evaluation` side list (filters Active + Past sections together), `/commercial-comparison` picker (filters before the Active/Completed `<optgroup>` grouping), and `/committee-opening` side list (with "No tenders match" empty state). Kept inline state per page; a shared component can be lifted later if more surfaces want the same pattern. |
| BUG-064 | Medium | Bug+Feature | Theme H: Admin role management UI (create + edit) | 2026-05-30 | **WALK-035/039 closed.** WALK-039 root cause: `disabled={selectedRole.isSystem}` on every per-perm checkbox and the Save button blocked editing on every seeded role (all 8 baselines have `isSystem=true`); admin holds `roles:manage` but couldn't actually exercise it. Removed both disabled conditions. Backend already accepts the PATCH (gated on `roles:manage`). WALK-035: added a `+ Create Role` button in the Settings page header that toggles an inline form (Code uppercase mono, Display name, optional Description). POST to `/roles` (backend was already implemented), reloads the list, auto-selects the new role so admin can configure perms on the right pane and click Save. New roles start with zero perms. |
| BUG-063 | Medium | Bug+Feature | Theme E: Vendor portal — Download + View + Inline Clarifications | 2026-05-30 | **WALK-016/017/018 closed.** Vendor tender detail had no working document interactions. Document rows now render a **View** button (PDFs only, opens blob via `window.open` — browser-native PDF viewer; vendor portal doesn't have the BUG-037 modal viewer ported yet) and a **Download** button (blob + anchor-tag download). The previously-stub "Download All Documents" button at the bottom of the aside now loops through `tender.documents` and downloads each. New `ClarificationsSection` component embedded inline below the documents block: lists existing clarifications with public/private reply visibility chips, offers an inline "Ask a question" textarea + Send button when the tender is in Published or Clarification Period. Standalone `/clarifications` nav remains for cross-tender browsing. |
| BUG-062 | High | Bug+Feature | Theme I: Committee Opening bundle (6 items) | 2026-05-30 | **WALK-036/037/040/041/042/043 closed.** Right pane no longer renders empty headers when no session exists (WALK-036) — heavy grid wrapped in `{session && (...)}`. Print Agenda wired to `window.print()` reusing the existing `@media print` rules (WALK-037). Migration 019 seeds `COMMITTEE_SESSION_INVITATION` notification template; `CommitteeModule` imports `NotificationsModule`; `CommitteeService.createSession` fans out invitation emails to each member via `NotificationsService.sendEmail` (WALK-040 — MailHog captures on staging). `TendersService.findAll/findOne` dept-scoping extended with an `OR` clause that includes tenders where the caller is a committee member OR has a commercial evaluation row — committee/evaluators are cross-departmental by nature (WALK-041). Open-commercial-envelopes success path now shows a green hand-off banner with a link to Commercial Comparison instead of bubbling the post-open 403 as failure (WALK-042). `COMMITTEE_STATUSES` extended to include `Commercial Evaluation / Comparison` so opened tenders stay visible in the list with a slate "Opened — handed off" pill (WALK-043). |
| BUG-061 | High | Bug+UX | Theme G: Technical Comparison polish (6 items) | 2026-05-30 | **WALK-029/030/031/032/033/034 closed.** `VendorTechnicalCard`: removed Consensus-per-criterion block (WALK-029); slimmed Evaluator Breakdown to recommendation + overall score + Notes only (WALK-030); added a Technical Proposal Documents block that fetches `/bids/:bidId/envelopes/TECHNICAL/documents` on card expand and renders each doc with a one-click View button that opens the shared `PdfViewerModal` via `usePdfViewer` (WALK-031). Score formatting bug (`83.3 / 30`) — root cause was the backend stores scores normalised to 0–100 while the display passed them as if they were absolute units. New `toAbsolute(normalised, max) = (normalised/100) * max` helper applied to the card header consensus score, per-evaluator overall score, and (in `TechnicalMatrix`) per-cell + total column — fixes both WALK-032 (formatting) and WALK-034 (matrix values). "Score evaluations" link removed from the tender-header card (WALK-033). |
| BUG-060 | Low | UX | Theme C: Tender Create → criteria editor on next step | 2026-05-30 | **WALK-007 closed.** Officer creating a tender previously landed on the detail page with no obvious next step toward configuring evaluation criteria. Post-create now routes to `/tenders/:id/edit?from=create` (the edit page mounts `<TenderCriteriaEditor>` from BUG-044). Edit page detects `?from=create` and surfaces a blue accent banner: "Tender created — next: set the Technical Evaluation Criteria. Define the criteria evaluators will score against (weights must total 100). You can revisit this page anytime before approval." Editor inlining on Create was rejected — `TenderCriteriaEditor` PUTs to `/tenders/:id/criteria` and requires an existing tender id. The redirect approach reuses BUG-044 with zero refactor. |
| BUG-059 | Medium | Bug+UX | Theme B: Approval Queue (description fetch + PDF modal docs) | 2026-05-30 | **WALK-004/005/006 closed.** The Approval Queue list endpoint returns the summary serialiser (no `description`, no `documents`), so the right pane's Tender Description block was always empty and Related Documents was empty too. On task selection the page now fetches `GET /tenders/:id` and renders the full description (multi-paragraph safe via `whitespace-pre-wrap`) and the document list. Each document row gets two buttons: **View** (PDFs only — opens the shared `PdfViewerModal` via `usePdfViewer` with the same blob+Authorization pattern as Technical Evaluation) and **Download** (existing behaviour). WALK-006 confirmed not actually present in this page (rows only render Review/View; Edit is on the tender detail page and already gated via BUG-050). |
| BUG-058 | Medium | Feature | Theme A: Dashboard Quick Actions per-card perm gating | 2026-05-30 | **WALK-002/003/G1 closed.** `/dashboard` Quick Actions panel was unconditional — engineer, finance, committee, auditor all saw the same three action buttons (Create New Tender, Review Approvals, Vendor Database) even though most couldn't act on them. Each card now checks the matching perm via the mounted-token pattern (BUG-046 hydration safety): Create New Tender → `tender:create`; Review Approvals → `tender:approve` OR `award:approve`; Vendor Database → `vendor:view`. When the caller has none of the three, the whole `<div>Quick Actions</div>` wrapper is hidden so engineer/auditor/finance get a clean view-only dashboard. Verified across 4 roles: admin@ (3 cards), manager@ (3 cards), officer@ (2 cards — no Approvals), engineer@ (panel hidden). |
| BUG-057 | Critical | Bug+Feature | Theme F bundle: Technical Evaluation polish (hydration + auto-Pass + finalised summary + Evaluated pill) | 2026-05-30 | **WALK-024/025/026/027/028 closed.** WALK-026 was the critical one — engineer saved a scorecard, came back, and the form was blank. Root cause: backend `findAll` only returned `{id, bidId, evaluatorUserId, result, score}` (no comments, no per-criterion scores), and the frontend `useEffect` always reset the form on bid switch rather than hydrating. Backend now joins `TechnicalEvaluationScore[]` + includes `comments` + `evaluatorName` + `finalizedAt` + `updatedAt`. Frontend hydration `useEffect` matches the caller's saved evaluation by `(bidId, evaluatorUserId == currentUserId)`, maps saved per-criterion scores back into the template by criterion name, reverses the 0–100 normalisation, restores recommendation + notes, sets a `recommendationDirty` flag. WALK-025 auto-Pass: new effect watches `totalScore / maxTotal` and auto-flips recommendation to PASS at ≥70 until the evaluator manually clicks either toggle. WALK-027 post-finalize summary: new `FinalisedSummaryBanner` shown when tender is past Technical Evaluation — green-banded card with latest finalizedAt timestamp + per-vendor PASS/FAIL outcome by majority of evaluator results + counts of pass/fail evaluators. WALK-028 Evaluated/Pending pill: bid cards always show a progress chip — green "Evaluated" + PASS/FAIL + score when an evaluation exists, amber "Pending" otherwise. WALK-024 verified already shipped via BUG-037 (the View Full Proposal button already calls `openPdfViewer` for the modal viewer — no code change needed). Verified backend: `GET /tenders/<TDR-2026-0013>/technical-evaluations` returns 2 hydrated rows with full evaluator/score/criterionScores/comments. |
| BUG-056 | High | Feature | Theme D bundle: Tender detail tabs (Clarifications + Bids + Audit Trail) | 2026-05-30 | **WALK-009/010/011/013/014/015/020/021/022 closed.** All three secondary tabs on `/tenders/[id]` were stubs (comment in code literally said `Stub tabs`); they rendered an empty placeholder regardless of role. Wired each to its existing backend endpoint with proper empty/error/loading states. Clarifications panel: lists vendor questions with status pill + inline replies (public/private visibility chip + author + timestamp). Bids panel: table with vendor, submitted timestamp, technical envelope pill, commercial envelope pill, technical PASS/FAIL pill. Audit Trail panel: chronological table with timestamp, event type, actor (name + role), entity reference, risk-level pill (HIGH/MEDIUM/LOW). Reusable `TabSkeleton` / `TabError` / `TabEmpty` subcomponents handle the three non-data states uniformly. Migration 018 adds new `tender:audit:view` permission granted to SYSTEM_ADMIN + AUDITOR + all 6 procurement/technical/committee roles; the per-tender audit endpoint switched gate from broad `audit:view` to the new narrower perm so procurement staff can see their own tender's history while the system-wide search stays restricted. token_version bumped on all 9 holders. Verified end-to-end on TDR-2026-0013: clarifications/bids/audit endpoints return 200 for officer/manager/engineer (9/9 green); audit returned 403 before the migration, 200 after. |
| BUG-055 | High | Feature | Theme 2 bundle: Close Tender + picker grouping + evaluator revisit | 2026-05-29 | **WALK-051, WALK-052, WALK-054 closed.** Three lifecycle-continuity fixes batched. (1) Backend has no closeTender transition — only closeSubmissions for the bid window. Migration 017 adds `tender:close` perm, grants to PROCUREMENT_ADMIN, bumps token_version. New `POST /tenders/:id/close-tender` endpoint transitions AWARDED → TENDER_CLOSED with audit row (event `TENDER_CLOSED`, MEDIUM risk). Tender detail page gains a "Close Tender" button (Lock icon, gated on `tender:close`, visible only when status is Awarded) — closes WALK-052. (2) Commercial Comparison picker now uses `<optgroup label="Active">` and `<optgroup label="Completed (awarded / closed)">` to separate in-progress vs. completed tenders — closes WALK-051 (committee-opening uses a different UI pattern, deferred to WALK-043). (3) `/technical-evaluation` list now fetches active + past statuses; list renders two groups ("Active" / "Past evaluations (view only)") with slate status pill + "View only" chip + 75% opacity on past entries; past-status tenders replace the Save button with a "Technical evaluation finalised" notice and hide the Finalize action card — closes WALK-054. Also: BUG-054 Minutes link patched to use authenticated fetch + blob (a 401 surfaced when owner clicked Regenerate Award Minutes because `<a href>` does not carry Bearer token). Verified end-to-end on TDR-2026-0013: manager@ closed the tender (status flipped AWARDED → TENDER_CLOSED in DB), Minutes button now opens the PDF cleanly. |
| BUG-054 | High | Feature | Admin → Commercial Comparison → post-Confirm Award Summary | 2026-05-29 | **WALK-050 closed.** After Phase D Confirm, the page re-fetched comparison data but the same comparison surface re-rendered with status=Awarded — no summary, no clear "decision saved" signal. Backend: `ComparisonService.commercialComparison()` now returns an `award` block when the tender has an active (non-superseded) Award row. Block carries winnerVendorId/Name, winnerBidId, winnerPrice (avg across commercial evaluations), winnerCurrency, isLowest, justificationText, justificationPdfFilename, notifyWinner, notifyLosers, confirmedByName, confirmedAt, minutesGeneratedAt (latest AwardMinutes row if any). Frontend: NEW `AwardSummaryCard` component (winner + price prominent, override badge when isLowest=false, override-justification amber block when present, notification flags row, Generate/Regenerate Award Minutes action gated by `award:minutes:generate`). Commercial Comparison page conditionally renders AwardSummaryCard at top + wraps `CommercialMatrix` + per-vendor cards inside a collapsed `<details>` expander labelled "Full comparison (audit reference)". Non-Awarded tenders unaffected — same comparison surface as before. Verified end-to-end on TDR-2026-0013 (already Awarded from BUG-053 walk): award block returns fully populated, non-Awarded tenders return null. Auto-generate minutes deferred per owner directive ("keep the manual button"). |
| BUG-053 | Critical | Feature | Admin → Commercial Comparison → inline commercial-total entry | 2026-05-29 | **Walkthrough unblocker — completes BUG-052.** Owner's walk surfaced two gaps: (1) no admin UI ever existed to enter commercial prices despite a backend module + endpoint being live (`POST /bids/:bidId/commercial-evaluations` with `commercial:evaluate` gate); (2) the manager (PROCUREMENT_ADMIN) — who in the real-world procurement flow joints with finance to prepare the comparison before the award meeting — held zero commercial:* perms after BUG-052's separation-of-duties pass. The "separation" rule applies to SYSTEM_ADMIN, not the procurement-team lead. Migration 016 grants PROCUREMENT_ADMIN `commercial:view` + `commercial:download` + `commercial:evaluate` and bumps token_version. Frontend ships a new `CommercialTotalBlock` sub-component inside `VendorComparisonCard` (replaces the Phase-F line-items placeholder): callers with `commercial:evaluate` see an editable amount input + Save button when the envelope is OPENED and no price is recorded; once recorded, value displays with a small Edit affordance; vendors without the perm see the value read-only or a "Awaiting price entry by procurement / finance" amber notice. Page wires `canEvaluate` from JWT + reloads comparison data on Save so lowest-PASS auto-highlight fires immediately. Verified end-to-end on staging: manager@ entered 15,000 KWD on Vendor 1 + 18,500 KWD on Vendor 2 → `priceCount` 0→2, `lowestPassBidId` materialised pointing at Vendor 1; admin@ correctly 403's on the same POST. Future enhancement (deferred per owner): auto-extract totals from vendor PDFs at submission time so this becomes a review step rather than re-keying. |
| BUG-052 | Critical | Feature | RBAC — commercial-flow permission matrix lockdown | 2026-05-29 | **Walkthrough unblocker.** Owner's walk as `finance@` hit four chained perm issues: sidebar `/commercial-comparison` entry never rendered (Sidebar gated legacy `commercial:view`, finance had only new `comparison:commercial:view`); typing URL directly worked but expanding any vendor card 403'd with "commercial:view permission required" (`bids.service.ts:391` legacy-only gate); no `commercial_evaluations` rows → no lowest-PASS highlight; no active user held COMMERCIAL_EVALUATOR (config drift). Captured as WALK-044 to WALK-049. Locked perm matrix per master-plan §I + spec separation-of-duties: SYSTEM_ADMIN REVOKES `commercial:view/download/evaluate` + `award:minutes:generate` (CLAUDE.md: "System Admin does NOT automatically receive commercial bid visibility"); COMMERCIAL_COMMITTEE_MEMBER ADDS `commercial:view/download/evaluate` + `comparison:commercial:recommend` (committee members are full participants per WALK-048); COMMERCIAL_EVALUATOR ADDS `commercial:download` + `comparison:commercial:view/recommend` + `award:minutes:generate` (kept as a peer role for outside specialists); PROCUREMENT_ADMIN remains sole Confirm authority. Migration 015 applies REVOKEs/GRANTs idempotently + bumps token_version on all affected users. Backend gate `bids.service.ts:391` accepts either `commercial:view` OR `comparison:commercial:view` (graceful migration). Sidebar.tsx:43 switched from `permission:'commercial:view'` to `anyPermission:['comparison:commercial:view','commercial:view']`. Seed script updated to reproduce the matrix on fresh runs. See DECISION_LOG.md 2026-05-29 entry for full rationale. |

### Not a bug / closed without fix

| ID | Note |
|---|---|
| BUG-NA-001 | "1 jusn 2026" date — that's `1 Jun 2026` rendered via `en-GB` short-month locale. "jusn" was a typo in the user's report, not a system bug. |

---

## BUG-001 — Admin tender detail header shows "Created Invalid Date"

- **Status:** ✅ **Fixed 2026-05-26** (serializer sweep, see BUG-013)
- **Severity:** Medium
- **Discovered:** 2026-05-25 (manual E2E walk, tender `TDR-2026-0007`)
- **Component:** Admin portal → Tenders → detail page header
- **Symptom:** Header line reads `TDR-2026-0007 · Created Invalid Date` instead of `… · Created 25 May 2026` (or similar).
- **Root cause:** API `serializeDetail()` does not include `createdAt` in the JSON response. Frontend reads `tender.createdAt` (undefined) and passes it into `new Date(undefined).toLocaleDateString(…)`, which returns the literal string `"Invalid Date"`.
- **Location:**
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — `serializeDetail()` / `serializeSummary()`
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:182-184`
- **Fix scope:** Add `createdAt: t.createdAt?.toISOString()` to the `serializeDetail()` return (or the underlying `serializeSummary()` so list views get it too).
- **Verification:** Refresh the admin tender detail page; header reads `Created <DD MMM YYYY>`.
- **Notes:** **Bundled with BUG-013 serializer-sweep** (decision 2026-05-26). See BUG-013 for the full master entry.

---

## BUG-002 — Admin tender detail: Category field empty

- **Status:** ✅ **Fixed 2026-05-26** (serializer sweep, see BUG-013)
- **Severity:** Medium
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`)
- **Component:** Admin portal → Tender Detail → "Key Details" section
- **Symptom:** Category field renders as `—` (empty). The value should exist if a category was assigned at creation (or be explicitly "Not set" if not).
- **Root cause:** `serializeDetail()` does not include the `category` field in the API response. The DB column / Prisma field exists; it's just not mapped to the JSON output.
- **Location:**
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` (serializeDetail)
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:336`
- **Fix scope:** Add `category: t.category ?? null` to the serializer return.
- **Verification:** Create or open a tender with a category; admin detail page shows the actual category text instead of `—`.
- **Notes:** **Bundled with BUG-013 serializer-sweep** (decision 2026-05-26). See BUG-013 for the full master entry.

---

## BUG-003 — Admin tender detail: Procurement Type empty

- **Status:** ✅ **Fixed 2026-05-26** (serializer sweep, see BUG-013)
- **Severity:** Medium
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`)
- **Component:** Admin portal → Tender Detail → "Key Details" section
- **Symptom:** Procurement Type field renders as `—`.
- **Root cause:** `serializeDetail()` does not return the `tenderType` (or `procurementType`) field. Confirm the exact Prisma column name when fixing — schema uses `tenderType`, frontend reads `procurementType`. Pick one canonical name and align both ends.
- **Location:**
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` (serializeDetail) + `apps/api/prisma/schema.prisma`
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:340`
- **Fix scope:** Map `tenderType` → `procurementType` in the serializer (or rename on the frontend). Document the decision so future contributors don't reintroduce the mismatch.
- **Verification:** Create a tender with a procurement type; admin detail page shows it.
- **Notes:** **Bundled with BUG-013 serializer-sweep + BUG-008 rename decision** (2026-05-26). BUG-008 chose frontend names as canonical → Prisma model renamed `tenderType` → `procurementType` (`@map("tender_type")`). Closes alongside BUG-013.

---

## BUG-004 — Admin tender detail: Technical Documents count shows 0 even when docs exist

- **Status:** ✅ **Fixed 2026-05-28**
- **Severity:** High
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`)
- **Component:** Admin portal → Tender Detail → "Tender Documents" section
- **Symptom:** Count shows `0` and the document list is empty, even when procurement uploaded documents at creation.
- **Root cause:** API serialises each document object with fields named `filename` + `mimeType` + `checksumSha256`. Frontend `TenderDetail` interface declares `fileName` + `fileType` (camelCase mismatch). The array length renders correctly only if the array is actually populated with the expected shape; here it's populated but the JSX reads undefined fields.
- **Location:**
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — documents mapping inside serializeDetail
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` — `tender.documents` interface (~line 31, 34) and consumer (~line 372–414)
- **Fix scope:** Pick one casing (recommended: API stays `filename`/`mimeType` to match upload payload; frontend interface + consumer change to match). Update the TenderDetail interface, all `doc.fileName` → `doc.filename`, `doc.fileType` → `doc.mimeType`.
- **Verification:** Open a tender that has documents attached; the count is non-zero and each document row shows filename + size + upload date.
- **Notes:** Note: this widget shows *tender documents* (uploaded by procurement when the tender was created), **NOT** *bid documents* (uploaded by vendors). Two distinct concepts — don't conflate them when fixing.

---

## BUG-005 — Admin tender detail: "Days Left" widget shows no number

- **Status:** ✅ **Fixed 2026-05-28**
- **Severity:** Medium
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`)
- **Component:** Admin portal → Tender Detail → "Days Left" widget
- **Symptom:** Widget renders the label but no number (or shows `—`).
- **Root cause:** Frontend reads `tender.daysLeft` but the API doesn't compute or return that field. Two valid fixes: (a) compute server-side and serialise, or (b) derive client-side from `tender.submissionDeadline`.
- **Location:**
  - Backend (option a): `apps/api/src/modules/tenders/tenders.service.ts` (serializeDetail)
  - Frontend (option b): `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:441`
- **Fix scope:** Recommend the frontend-derived approach — `Math.ceil((new Date(tender.submissionDeadline).getTime() - Date.now()) / 86_400_000)` — keeps the API response stable across requests (no time-of-request divergence) and avoids backend timezone drift. Show `Closed` when negative, `Today` when 0.
- **Verification:** Open a tender with a future deadline → number > 0; with today's deadline → `Today`; with past deadline → `Closed`.
- **Notes:** Same widget also has BUG-006 (CSS). Fix both together to avoid two redeploys.

---

## BUG-006 — Admin tender detail: "Days Left" widget dark, unreadable

- **Status:** ✅ **Fixed 2026-05-26** — `bg-sidebar text-white` → `bg-card border border-border` (matches BIDS card). Verified in live JS chunk.
- **Severity:** Medium
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`)
- **Component:** Admin portal → Tender Detail → "Days Left" widget (visual)
- **Symptom:** Widget background is dark navy and the text inside is hard to read. The neighbouring "BIDS" widget has a light/white background — the user wants the "Days Left" widget to match.
- **Root cause:** Widget uses `bg-sidebar` (dark navy admin sidebar token) instead of `bg-card` (white card token). Likely a copy-paste error during a prior refactor.
- **Location:** `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:438`
- **Fix scope:** Change `bg-sidebar text-white` → `bg-card text-text-primary` (or whatever tokens the BIDS widget uses on the same row). Verify text colors flip appropriately.
- **Verification:** Side-by-side comparison with the BIDS widget — same background colour, readable text.
- **Notes:** Pair with BUG-005 — both touch the same widget; redeploy once.

---

## BUG-007 — Admin tender detail: Workflow Progress doesn't show current stage [FIXED 2026-05-26]

- **Status:** ✅ **Fixed 2026-05-28**
- **Severity:** High
- **Discovered:** 2026-05-25 (tender `TDR-2026-0007`, currently in `Commercial Sealed`)
- **Component:** Admin portal → Tender Detail → "Workflow Progress" visualisation
- **Symptom:** The progress UI doesn't highlight the tender's current stage. For a tender in `Commercial Sealed` (technical evaluation just completed), no stage is shown as active.
- **Root cause:** The frontend `LIFECYCLE_STAGES` array is missing the `Commercial Sealed` entry. The indexer `LIFECYCLE_STAGES.findIndex(s => s.key === tender.status)` returns `-1` when the status isn't in the array → no stage is highlighted. Audit the array against the full 13-state spec list in `CLAUDE.md`:
  `Draft → Internal Review → Approved → Published → Clarification Period → Submission Closed → Technical Opening → Technical Evaluation → Commercial Sealed → Committee Commercial Opening → Commercial Evaluation / Comparison → Award Recommendation → Awarded → Tender Closed` (plus `Cancelled`, `Suspended`, `Archived` exit states).
- **Location:**
  - Array definition: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:71-82`
  - Current-stage computation: `page.tsx:161`
  - Renderer: `page.tsx:456-494`
- **Fix scope:** Add the missing entries to `LIFECYCLE_STAGES` so all 13 forward states are present and ordered correctly. Decide separately how to render the 3 exit states (`Cancelled`/`Suspended`/`Archived`) — they break the linear visual.
- **Verification:** Walk a tender through every state in turn (Draft → Internal Review → … → Tender Closed) and confirm the workflow progress UI highlights each stage as the tender enters it.
- **Notes:** This is High severity because it's the at-a-glance "where are we?" widget — without it, admins must read the status badge, defeating the purpose of the visualisation.

---

## BUG-NA-001 — "1 jusn 2026" date

- **Status:** ✅ **Fixed 2026-05-28**
- **Severity:** —
- **Discovered:** 2026-05-25 (user report)
- **Component:** Admin portal → Tender Detail → Submission Deadline
- **Observation:** User wrote that the deadline shows "1 jusn 2026".
- **Resolution:** The format string `toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })` produces `1 Jun 2026`. "jusn" was a typo in the user's chat message — the system output is correct.
- **Action:** None.

---

## BUG-008 — Tender create form missing Procurement Type field

- **Status:** ✅ **Fixed 2026-05-28**
- **Type:** Bug
- **Severity:** Medium
- **Discovered:** 2026-05-26 (manual E2E)
- **Component:** Admin → Tenders → New Tender form
- **Symptom:** Procurement Type field is not present on the New Tender form. It only appears when editing an existing tender.
- **Root cause:** Create form (`tenders/new/page.tsx`) only sends `title`, `description`, `departmentId`, `submissionDeadline`, `clarificationDeadline`. Three fields are entirely missing from the create UI: `procurementType`, `category`, `estimatedBudget` — all three columns exist on the `tenders` table (nullable) and all three are present on the edit form.
- **Location:**
  - Frontend create form: `apps/web-admin/src/app/(admin)/tenders/new/page.tsx`
  - Frontend edit form (reference): `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx:245-265` (Procurement Type radio group)
  - PROCUREMENT_TYPES constant: `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx:23` → `['Open Tender', 'Restricted', 'Single Source']`
  - Backend Prisma model: `apps/api/prisma/schema.prisma:567-569` (`category`, `tenderType`, `budgetEstimate`)
  - Backend DTOs: `apps/api/src/modules/tenders/dto/create-tender.dto.ts` + `update-tender.dto.ts`
  - API serializer: `apps/api/src/modules/tenders/tenders.service.ts` (serializeDetail / serializeSummary)
- **Agreed approach (2026-05-26):**
  1. **Bundle** BUG-008, BUG-009 (Department on edit decision), BUG-010 (Budget on create + edit editable) into one fix session — same files, same redeploy.
  2. **Required-before-Publish, not required-on-create** for Procurement Type. Draft can be saved without it; the Publish action is blocked until it's set. Server-side guard in `tenders.service.publish()` returns 400 with a clear message naming any unset prerequisite fields.
  3. **Frontend naming wins.** Canonical names across all layers: `procurementType` + `estimatedBudget`. Backend keeps DB column names (`tender_type`, `budget_estimate`) but the Prisma model + DTO + serializer use the frontend names — `tenderType` Prisma field renamed to `procurementType` (with `@map("tender_type")`), `budgetEstimate` renamed to `estimatedBudget` (with `@map("budget_estimate")`). No DB migration needed, no downtime.
- **Fix scope:**
  1. Add Procurement Type radio group (3 options) + Category text input + Estimated Budget numeric input to the create form. Mirror styling of edit form.
  2. Update create POST payload to send the three new fields (all optional).
  3. Update CreateTenderDto + UpdateTenderDto to accept `procurementType`, `category`, `estimatedBudget` as `@IsOptional()`.
  4. Rename Prisma model fields per #3 of agreed approach; regenerate Prisma client.
  5. Update serializer to return `procurementType` + `estimatedBudget` in detail + summary responses (also closes BUG-002, BUG-003, BUG-011 partially).
  6. Add publish-gate: `tenders.service.publish()` rejects with 400 if `procurementType` is null, naming the missing field.
- **Verification:**
  1. Create a Draft tender with no Procurement Type → succeeds. Try Publish → 400 "Procurement Type is required before publishing".
  2. Edit the Draft, set Procurement Type = Open Tender → Save → Publish → 200, status Published.
  3. Detail page shows Procurement Type and any set Category/Budget (also verifies BUG-002, BUG-003).
- **Notes:** Bundled with BUG-009 and BUG-010. Also unblocks BUG-011 (DTO whitelist gap) for these three fields specifically. BUG-009 still has an independent decision needed (is Department editable post-create?) — discussed next.

---

## BUG-009 — Tender edit form: Department editable only in Draft

- **Status:** ✅ **Fixed 2026-05-28**
- **Type:** Bug + business-rule decision
- **Severity:** Medium
- **Discovered:** 2026-05-26
- **Component:** Admin → Tenders → Edit
- **Symptom:** Edit form shows Category but not Department. Create form has Department.
- **Agreed approach (2026-05-26):** **Editable in Draft only.** Show the Department selector on the edit form when `tender.status == 'Draft'`. Once the tender moves to Internal Review or beyond, the Department field becomes a read-only display row. Server-side guard rejects PATCH attempts to change `departmentId` for any non-Draft tender.
- **Reasoning:** Allows fixing mis-assignments before the tender becomes official, without polluting the downstream approval chain (which is tied to the department's approvers + audit context).
- **Location:**
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` (add conditional Department selector at top of form, same component as in create page)
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — `update()` method needs status guard: if `departmentId` in PATCH payload AND existing tender's status != `Draft`, return 400.
- **Fix scope:**
  1. Add Department dropdown to edit form, render only when `tender.status === 'Draft'`. For non-Draft, render a read-only label showing the current department name + a small "Department is locked after submission" hint.
  2. Update Edit form's submit payload to include `departmentId` only when status == Draft.
  3. Add backend guard in `tenders.service.update()` — reject `departmentId` change when status != Draft.
  4. Update UpdateTenderDto to accept `departmentId` as `@IsOptional()` UUID.
- **Verification:**
  1. Create Draft → Edit → Department dropdown visible and writable → save → department changes.
  2. Submit for Approval → Edit → Department now shown as read-only label.
  3. Attempt direct PATCH with `departmentId` on Internal Review tender → 400 with clear error.
- **Notes:** Bundled with BUG-008 + BUG-010 fix session.

---

## BUG-010 — Estimated Budget on create + edit (writable in Draft + Internal Review, locked after Approval)

- **Status:** Open **Inprogress  2026-05-28**
- **Type:** Bug + business-rule decision
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tenders → Create + Edit
- **Symptom:** Create form has no budget input. Edit form shows the budget but the field is read-only / can't be changed.
- **Agreed approach (2026-05-26):**
  1. **Add to create form** as an optional numeric input. Field name `estimatedBudget`. Currency is implicit KWD (matches existing UI). No per-tender currency field for now.
  2. **Editable through Draft + Internal Review.** Edit form's budget input is writable when `tender.status ∈ {'Draft', 'Internal Review'}`. Once `Approved` or beyond, it becomes a read-only label with hint "Budget is locked after approval".
  3. **Required before Publish.** Optional on create. The Publish action is blocked with a 400 if `estimatedBudget` is null, naming the missing field (same publish-gate as Procurement Type).
- **Location:**
  - Frontend create: `apps/web-admin/src/app/(admin)/tenders/new/page.tsx`
  - Frontend edit: `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` (budget input — make conditional read-only based on status)
  - Backend service: `apps/api/src/modules/tenders/tenders.service.ts` — `update()` rejects `estimatedBudget` change when status ∉ {Draft, Internal Review}; `publish()` rejects when `estimatedBudget` is null.
  - Backend DTO: `apps/api/src/modules/tenders/dto/update-tender.dto.ts` + `create-tender.dto.ts` — accept `estimatedBudget` as `@IsOptional() @IsNumber()`.
  - Prisma model: rename `budgetEstimate` → `estimatedBudget` (keep `@map("budget_estimate")` to preserve DB column).
- **Fix scope:**
  1. Add Estimated Budget numeric input to create form (placeholder "e.g. 100000", hint "Currency: KWD").
  2. Edit form: conditional read-only based on status (writable only in Draft + Internal Review).
  3. Backend update guard: reject `estimatedBudget` changes when status is Approved or beyond.
  4. Backend publish guard: reject publish when `estimatedBudget` is null.
  5. DTO + Prisma renames per agreed approach in BUG-008.
- **Verification:**
  1. Create Draft with budget 100000 → detail shows KWD 100,000.00.
  2. Edit Draft, change to 120000 → saved.
  3. Submit for Approval (still Internal Review) → edit still allows budget change.
  4. Approve tender → edit shows budget as read-only with hint.
  5. Create Draft without budget → try Publish → 400 "Estimated Budget is required before publishing".
- **Notes:** Bundled with BUG-008 + BUG-009. Same redeploy. Per-tender currency configurability deferred — system-wide KWD assumption is acceptable for v1.
  **Notes 2026-05-28** When creating a new tender Estimate Budget in KWD, but when checking tender under Key Details it shows in $ instead ok KWD

---

## BUG-011 — Tender edit (pre-approval) rejected with 400 "property … should not exist"

- **Status:** ✅ **Fixed 2026-05-28**
- **Type:** Bug (auto-resolved by bundle)
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tenders → Edit (Draft / Internal Review)
- **Symptom:** PATCH on a Draft/Internal-Review tender returns 400 with `property category should not exist, property procurementType should not exist, property estimatedBudget should not exist`.
- **Root cause:** Backend `UpdateTenderDto` is using `whitelist: true` + `forbidNonWhitelisted: true` and the DTO is missing these three fields. The frontend sends them; the backend rejects them.
- **Location:** `apps/api/src/modules/tenders/dto/update-tender.dto.ts`
- **Resolution:** The BUG-008/9/10 fix bundle adds `category`, `procurementType`, `estimatedBudget` to both `CreateTenderDto` and `UpdateTenderDto` as `@IsOptional()`. That change directly closes this 400. No separate work item.
- **Verification (as part of bundle):** Edit a Draft tender, change category / procurement type / budget → save → 200 OK; detail page reflects changes.
- **Notes:** Mark Fixed at the same time as BUG-008/9/10 (single deploy verifies all four).

---

## BUG-012 — Tender RFQ document upload (build feature end-to-end)

- **Status:** Open **Inprogress  2026-05-28**
- **Type:** Bug + new feature (both ends missing)
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tender Detail → Tender Documents card
- **Symptom:** Upload button is visible but does nothing. No way for admins to attach RFQ documents that vendors will need to bid against.
- **Root cause:** Both ends missing:
  1. Frontend `<button>` at `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:380-383` has no `onClick`, no file input, no upload logic.
  2. Backend has only a download endpoint (`GET /tenders/:id/documents/:documentId` at `tenders.controller.ts:51-55`); there is no `POST /tenders/:id/documents` upload endpoint and no `DELETE`.
- **Existing reusable pattern:** Bid documents already work via `POST /bids/{id}/envelopes/{type}/documents` with multipart upload + server-side SHA-256 + `BidStorageService` (path-traversal guard, mkdir-recursive, stream). Mirror this pattern for tender documents using a new `TenderDocumentStorageService` (or extend the existing one).
- **Agreed approach (2026-05-26):**
  1. **Allowed in statuses:** `Draft`, `Internal Review`, `Approved` (matches `EDITABLE_STATUSES` already used in the UI). Locks at Published — vendors shouldn't see a moving doc set. Delete also allowed in these statuses.
  2. **File constraints:** PDF, DOC, DOCX, XLS, XLSX. Max 50 MB. Server-side MIME-type validation against an allow-list (rejecting magic-byte spoofs is out of scope but recommended later). Server-computed SHA-256.
  3. **Required before Publish:** At least 1 RFQ document required. Publish endpoint returns 400 "At least one RFQ document is required before publishing" when zero docs attached.
- **Location:**
  - Frontend: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (upload + delete handlers, file input, optimistic UI)
  - Backend controller: `apps/api/src/modules/tenders/tenders.controller.ts` — add `POST :id/documents` (multipart, `@UseInterceptors(FileInterceptor('file'))`) and `DELETE :id/documents/:documentId`
  - Backend service: `apps/api/src/modules/tenders/tenders.service.ts` — `uploadDocument`, `deleteDocument`, both with status guard (`Draft|Internal Review|Approved`) + audit log entries (`TENDER_DOCUMENT_UPLOADED`, `TENDER_DOCUMENT_DELETED`)
  - Storage: new `apps/api/src/modules/tenders/tender-document-storage.service.ts` mirroring `BidStorageService`. Container volume `tender_storage` mounted at `/data/tender-documents` (add to `infrastructure/docker/docker-compose.yml`).
  - Publish guard: `tenders.service.publish()` rejects when `documents.length === 0`.
  - DTO: file validation pipe with MIME + size constraints.
- **Fix scope:**
  1. Backend storage service (mirror BidStorageService).
  2. Backend POST + DELETE endpoints with permission gate (`tender:edit` or equivalent), status guard, audit logging.
  3. Frontend upload (file input + multipart fetch with bearer token), per-row Delete action with confirm.
  4. Publish-gate update.
  5. Docker volume + env var (`TENDER_STORAGE_PATH=/data/tender-documents`).
- **Verification:**
  1. Draft tender → click Upload → select a PDF → file appears in the list with size + upload date + SHA-256.
  2. Delete a doc → row removed, audit entry recorded.
  3. Upload an `.exe` → rejected with clear MIME error.
  4. Upload a 60 MB file → rejected with size error.
  5. Try Publish with zero docs → 400 "At least one RFQ document is required". Add a doc → Publish succeeds.
  6. After Publish, Upload + Delete buttons are hidden.
- **Notes:** Critical for the procurement workflow — without RFQ docs, vendors have nothing to bid against. Should ship before any pilot vendor onboarding. Related to BUG-004 (display side) and BUG-014 (Description tab attachment view).
  **Notes 2026-05-28** Upload button works,
  **New Feature 2026-05-28** we need Tender Documents allow upload when creating a new tender also, means allow upload when creating tender.

---

## BUG-013 — Approvals queue: "Requested By: Unknown" + "Invalid Date" (lead of serializer-sweep bundle)

- **Status:** ✅ **Fixed 2026-05-26** (deployed to staging at ~08:33 GMT+3)
- **Fixed scope (actual changes):**
  - `apps/api/src/modules/tenders/tenders.service.ts` — extended Prisma `include` to fetch `createdByUser.displayName` + `department.code` on `findAll`, `findOne`, `create`, `update` (4 sites). Updated `serializeSummary` to return 6 new fields: `createdAt`, `createdByName`, `category`, `procurementType` (mapped from Prisma `tenderType`), `estimatedBudget` (mapped from `budgetEstimate`), `departmentCode`.
- **Verification (post-deploy):** `GET /tenders/{id}` against staging returns: `createdAt: 2026-05-25T16:49:14.192Z`, `createdByName: CTMP Admin`, `departmentCode: IT`. `category` / `procurementType` / `estimatedBudget` are `null` for existing test tenders (created before BUG-008 form fields land) — serializer is correct; values will populate once that bundle ships.
- **Closes:** BUG-001 (Created Invalid Date), BUG-002 (Category empty), BUG-003 (Procurement Type empty), BUG-013 (Requested By Unknown + Request Date blank).
- **Type:** Bug
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Approvals queue → Approval Details panel
- **Symptom:** Detail panel shows: Requested By = "Unknown", Request Date blank, dates rendering as "Invalid Date".
- **Root cause:** Frontend reads `tender.createdByName ?? 'Unknown'` (`approvals/page.tsx:85`) and `tender.createdAt` (line 87) for Request Date. Neither is returned by the API serializer. Same root-cause family as BUG-001 (Invalid Date in tender header) and BUG-002/003 (empty Category/ProcurementType fields) — every case is "API serializer drops the field → frontend renders the fallback."
- **Agreed approach (2026-05-26):** **Single serializer-sweep bundle.** One pass on `apps/api/src/modules/tenders/tenders.service.ts` adds every missing field at once and closes BUG-001, BUG-002, BUG-003, BUG-013 in one deploy.
- **Fields to add in the sweep:**
  - `createdAt` — `t.createdAt?.toISOString()` (closes BUG-001 + BUG-013 Request Date)
  - `createdByName` — join `t.createdByUser?.displayName` via Prisma `include` (closes BUG-013 Requested By)
  - `category` — `t.category ?? null` (closes BUG-002)
  - `procurementType` — `t.procurementType ?? null` (after rename per BUG-008 approach; closes BUG-003)
  - `estimatedBudget` — `t.estimatedBudget != null ? Number(t.estimatedBudget) : null` (closes BUG-002 ancillary + BUG-010 detail display)
  - `daysLeft` — derive client-side from `submissionDeadline`, per BUG-005 decision (no backend computation)
- **Location:**
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — `serializeSummary()` + `serializeDetail()`. Also add Prisma `include: { createdByUser: { select: { displayName: true } } }` to the find queries.
- **Fix scope:**
  1. One Prisma `include` change on the find queries.
  2. One sweep over `serializeSummary` / `serializeDetail` adding the 5 fields.
  3. Optional: defensive frontend — wrap date formatting in a util `formatDateOr(value, fallback = '—')` that returns the fallback if the input is null/undefined/invalid. Prevents future "Invalid Date" regressions.
- **Verification:**
  1. Open Approvals → any pending tender → Requested By shows the admin's display name, Request Date shows a real date.
  2. Open admin tender detail → header reads "Created <real date>" (closes BUG-001).
  3. Open admin tender detail → Category + Procurement Type fields show actual values when set (closes BUG-002, BUG-003).
- **Notes:** This entry is the master record for the serializer bundle. BUG-001, BUG-002, BUG-003 reference back to here.

---

## BUG-014 — Tender Description: no attachment view (auto-resolved by BUG-004 + BUG-012)

- **Status:** Open — **bundled with BUG-004 + BUG-012** (decision 2026-05-26)
- **Type:** Bug (auto-resolved by bundle)
- **Severity:** Medium
- **Discovered:** 2026-05-26
- **Component:** Admin → Tender Detail → Overview tab
- **Symptom (original report):** "There is no attachment view option here [Description], if any document uploaded in creation time it should appear here for review."
- **Investigation:** The Overview tab already has a **Tender Documents card directly below the Description card** (`apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx:369-385`). The card looks empty because (a) admins can't currently attach docs at all — BUG-012, and (b) when docs do exist they don't render because of the field-name mismatch — BUG-004.
- **Resolution:** Once BUG-004 (display) + BUG-012 (upload pipeline) ship, the Documents card on the Overview tab will show attached docs. BUG-014 closes automatically — no separate code change.
- **Verification (as part of the bundle):** Open a tender that has documents attached → Overview tab shows the Documents card with each filename + size + upload date + download link, right below the Project Description card.
- **Notes:** No standalone work. Mark Fixed at the same time as BUG-004 + BUG-012 (a single redeploy verifies all three).
  **Notes 2026-05-28** Attachemnt can Only be downloaded, there is no option to view, there should be option to view the attachment in full window.  
---

## BUG-015 — INVITATION_ONLY tender workflow (build end-to-end)

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Feature
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tender Create + Tender Detail + Publish + Vendor `GET /tenders` filter
- **Symptom:** No way to mark a tender as INVITATION_ONLY, no way to select which vendors are invited, no enforcement that vendors only see tenders they should.
- **Existing infrastructure (already built):**
  - DB enum `TenderVisibility` = `PUBLIC | INVITATION_ONLY`, default `PUBLIC` (`prisma/schema.prisma:58-63`)
  - Field `tender.visibility` already on `tenders` table (`prisma/schema.prisma:571`)
  - Join table `tender_vendors` with `tenderId`, `vendorId`, `invitedBy`, `invitedAt` (`prisma/schema.prisma:640-651`)
- **Missing infrastructure:**
  - Visibility selector on create form
  - "Manage Invited Vendors" panel on tender detail (for INVITATION_ONLY only)
  - Publish-gate enforcing ≥3 invited vendors for INVITATION_ONLY
  - Vendor-side `GET /tenders` filter: vendor sees PUBLIC tenders + INVITATION_ONLY tenders where they appear in `tender_vendors`
  - Post-publish edit rules (add only, no remove, until Submission Closed)
- **Agreed approach (2026-05-26):**
  1. **Visibility set at create time, fixed for life.** Add a Visibility radio (PUBLIC / INVITATION_ONLY) to the create form. Default PUBLIC. Once saved, can't change.
  2. **Vendor selection lives in a dedicated "Manage Invited Vendors" panel** on the tender detail page. Panel only renders when `tender.visibility === 'INVITATION_ONLY'`. Lists currently-invited vendors with Add Vendor (vendor picker) + Remove (per row, with rules below).
  3. **Add-yes / remove-no after Publish, until Submission Closed.**
     - Draft / Internal Review / Approved: full add + remove.
     - Published / Clarification Period: add only, remove disabled (vendor may have started preparing — removal is unfair).
     - Submission Closed and beyond: list frozen, panel becomes read-only.
  4. **Minimum 3 vendors required to publish INVITATION_ONLY** tender. Publish endpoint rejects with 400 "INVITATION_ONLY tenders require at least 3 invited vendors before publishing".
  5. **Vendor visibility scope** — backend `GET /tenders` for vendor caller filters: `(visibility = PUBLIC AND status IN [PUBLISHED, CLARIFICATION_PERIOD]) OR (visibility = INVITATION_ONLY AND id IN tender_vendors WHERE vendor_id = caller AND status IN [PUBLISHED, CLARIFICATION_PERIOD])`.
- **Location:**
  - Frontend create: `apps/web-admin/src/app/(admin)/tenders/new/page.tsx` (add Visibility radio)
  - Frontend detail: `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (new Manage Invited Vendors panel)
  - Backend service: `apps/api/src/modules/tenders/tenders.service.ts` — `publish()` gate, new `inviteVendor(tenderId, vendorId, userId)`, `uninviteVendor(tenderId, vendorId, userId)`, status guards.
  - Backend controller: `apps/api/src/modules/tenders/tenders.controller.ts` — new `POST /tenders/:id/invited-vendors`, `DELETE /tenders/:id/invited-vendors/:vendorId`, `GET /tenders/:id/invited-vendors`.
  - Vendor visibility filter: `apps/api/src/modules/tenders/tenders.service.ts` — `findAll()` extended Prisma WHERE for vendor caller (the existing PUBLIC-filter from earlier patches needs a parallel INVITATION_ONLY branch).
  - DTOs: new `InviteVendorDto` (vendorId UUID), CreateTenderDto adds `visibility` field.
  - Audit events: `TENDER_VENDOR_INVITED`, `TENDER_VENDOR_UNINVITED` (HIGH risk).
- **Fix scope:**
  1. Schema/DTOs: add `visibility` to CreateTenderDto; `InviteVendorDto`.
  2. Backend endpoints (3): invite, uninvite (with status guard), list invited.
  3. Backend publish gate: visibility check + minimum 3 vendors.
  4. Backend vendor-side filter: extend `findAll` for vendor caller.
  5. Frontend create: Visibility radio.
  6. Frontend detail: Manage Invited Vendors panel with vendor picker (lazy-loaded vendor search) + invited list + Remove button (disabled by status rules).
  7. Audit logging for invite/uninvite (HIGH risk).
- **Verification:**
  1. Create INVITATION_ONLY tender → save Draft → Manage Invited Vendors panel appears → add 2 vendors → try Publish → 400 "require at least 3 invited vendors". Add 3rd → Publish succeeds.
  2. As Vendor A (invited): `/tenders` shows the INVITATION_ONLY tender. As Vendor B (not invited): does NOT show.
  3. After Publish, try to remove an invited vendor → blocked. Try to add a new vendor → succeeds.
  4. Close Submissions → Manage panel becomes fully read-only.
- **Notes:** Tightly coupled to BUG-016 (notification policy) and BUG-031 (vendor visibility — also a confidentiality bug). After this lands, BUG-031 may be auto-resolved.
  **Notes 2026-05-28** no option to select companies to send to .. there is nothing can be done.
---

## BUG-016 — Tender publication notification policy

- **Status:** Open (decisions locked 2026-05-26 — promoted from Question to Feature)
- **Type:** Feature
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tender → Publish → notification dispatch
- **Symptom:** Publishing a tender doesn't notify any vendor. `publish()` only changes status; no email goes out.
- **Existing infrastructure:** Notifications module is built (`apps/api/src/modules/notifications/notifications.service.ts`) — nodemailer transporter, template interpolation `{{var}}`, `NotificationTemplate` + `NotificationLog` tables. No publication template/trigger yet.
- **Agreed approach (2026-05-26):**
  1. **PUBLIC publication → email all approved vendors.** When `publish()` succeeds on a PUBLIC tender, enumerate all vendors with status = APPROVED, find each primary contact's email, send one email via the `TENDER_PUBLISHED_PUBLIC` template. Use the existing NotificationLog for delivery audit.
  2. **INVITATION_ONLY publication → email only invited vendors.** Enumerate `tender_vendors` for the tender, send via `TENDER_INVITATION` template. If admins add more invitees after publish (per BUG-015), each new invitee gets the invitation email at the moment they're added.
  3. **Email only for v1.** No in-app notification system. No SMS.
  4. **No deadline reminders for v1.** Publish-on-trigger only — cron-based reminders deferred to a later feature.
- **Email content (minimum viable):**
  - Subject: `[CTMP] New Tender: {{tenderReference}} — {{tenderTitle}}` (PUBLIC) / `[CTMP] You have been invited to bid: {{tenderReference}}` (INVITATION_ONLY)
  - Body: tender reference, title, department, brief description, submission deadline (with formatted date + days remaining), View Tender link → `https://vn.hadiclinic.com.kw:4201/tenders/{{tenderId}}`
- **Location:**
  - Migration: new SQL seeding two NotificationTemplate rows (`TENDER_PUBLISHED_PUBLIC`, `TENDER_INVITATION`). Add to `database/seeds/`.
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — `publish()` enqueues notifications after the status transition + audit log.
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — `inviteVendor()` (from BUG-015) also dispatches the invitation email for post-publish adds.
  - Frontend: confirm-dialog text on Publish updated to warn admin "This will notify N vendors by email" so they're not surprised by the broadcast.
- **Fix scope:**
  1. Seed migration: 2 templates.
  2. Add `dispatchTenderPublicationNotifications()` helper to NotificationsService — takes tenderId, looks up visibility, picks the right template + recipient set, sends each via existing `sendEmail()`.
  3. Hook into `publish()` (best effort — failures get logged but don't roll back the publish).
  4. Hook into `inviteVendor()` for post-publish adds.
  5. Confirm-dialog copy update on frontend.
- **Verification:**
  1. Publish a PUBLIC tender with 5 approved vendors → MailHog shows 5 emails sent (`TENDER_PUBLISHED_PUBLIC` template, correct subject + body).
  2. Publish an INVITATION_ONLY tender with 3 invitees → MailHog shows 3 emails (`TENDER_INVITATION`).
  3. Post-publish, admin adds 4th invitee → MailHog shows 1 new email immediately.
  4. NotificationLog has SENT rows for each dispatch with the correct template code + recipient.
- **Notes:** Tightly coupled to BUG-015 (INVITATION_ONLY workflow). Implement BUG-015 first, then bolt notifications on top. Reminders deferred — list as future feature.
**Notes 2026-05-28** there is nothing
---

## BUG-017 — Clarification attachments (vendor questions + admin replies)

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Feature
- **Severity:** Medium
- **Discovered:** 2026-05-26
- **Component:** Admin → Clarifications + Vendor portal → Clarifications
- **Symptom:** Neither side can attach documents — clarifications are text-only today.
- **Agreed approach (2026-05-26):**
  1. **Both sides can attach.** Vendor can attach 0+ files when asking a clarification question. Admin can attach 0+ files when replying.
  2. **Visibility inherits from the reply text.** Reply text visibility (PUBLIC vs PRIVATE) governs attachment visibility — public reply → all vendors see attachments; private reply → only the asking vendor. Question attachments are always visible to admins (they need them to answer) and to the asking vendor.
  3. **File constraints match BUG-012:** PDF, DOC/DOCX, XLS/XLSX, 50 MB max, server-side SHA-256 and MIME validation. Reuses the same storage pattern + container volume.
- **Location:**
  - DB migration: new `clarification_documents` table (FK → clarifications) + `clarification_reply_documents` (FK → clarification_replies). Both with `filename`, `mimeType`, `fileSize`, `checksumSha256`, `uploadedBy`, `uploadedAt`, `storagePath`.
  - Storage service: either extend existing `BidStorageService` to be generic, OR add `ClarificationDocumentStorageService` mirroring it. Recommend a single `DocumentStorageService` consolidation but defer that refactor — for now, copy the BidStorageService pattern.
  - Backend controller: `apps/api/src/modules/clarifications/clarifications.controller.ts` — add `POST :tenderId/clarifications/:id/documents` (vendor on own question), `POST :tenderId/clarifications/:id/replies/:replyId/documents` (admin on reply), `GET .../documents/:docId` (download with visibility check), `DELETE` (uploader-only, before any further reply lands).
  - Backend service: visibility-aware download gate — vendor can download own-question attachments + admin-reply attachments where reply is public OR vendor is the asker.
  - Frontend admin: `apps/web-admin/src/app/(admin)/clarifications/page.tsx` — add file picker in the reply form, display attached files on each thread row.
  - Frontend vendor: `apps/web-vendor/src/app/(portal)/clarifications/page.tsx` — same pattern for ask + display.
  - Audit events: `CLARIFICATION_DOCUMENT_UPLOADED`, `CLARIFICATION_DOCUMENT_DELETED` (MEDIUM risk).
- **Fix scope:**
  1. DB migration (2 new tables + indexes).
  2. Storage service.
  3. 4 backend endpoints (upload question doc, upload reply doc, download, delete).
  4. Visibility-aware download gate.
  5. Admin frontend (file picker + attachment list per thread).
  6. Vendor frontend (same).
  7. Audit logging.
- **Verification:**
  1. Vendor asks a question with a PDF attached → admin sees the attachment in their clarification thread.
  2. Admin replies PUBLIC with an addendum.pdf → all vendors who can see the tender see the attachment in the thread.
  3. Admin replies PRIVATE with a doc → only the asking vendor sees it; other vendors don't even see the reply text (matches existing behaviour).
  4. Upload an `.exe` → rejected with MIME error.
  5. Audit log shows CLARIFICATION_DOCUMENT_UPLOADED with actor + clarification reference.
- **Notes:** Reuses BUG-012 storage pattern. Could be deployed together to share the storage refactor.
**Notes 2026-05-28** No document upload option. just message.
---

## BUG-018 — Clarifications: Print → window.print + Export → PDF report

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Bug + small feature (Export)
- **Severity:** Medium
- **Discovered:** 2026-05-26
- **Component:** Admin → Clarifications page → toolbar (`page.tsx:531-535`)
- **Symptom:** Print and Export buttons render but have no onClick.
- **Agreed approach (2026-05-26):**
  1. **Print** — wire to `window.print()` and add a print-friendly stylesheet (`@media print`) that hides the nav/sidebar/sidebar-icons and lays out the visible threads cleanly for paper / save-as-PDF.
  2. **Export** — generate a server-side PDF via the existing report-renderer infrastructure. New report code `clarifications-by-tender` added to the reports catalogue. Renderer queries the tender's clarifications + replies (respecting visibility for the caller) and produces a PDF with header (tender ref, title, generation date) + chronological thread list. Async job pattern (queue → poll → download) — matches every other report.
- **Dependency:** Export requires the reports module to be working. **Blocked behind BUG-034** (Reports & Analytics — entire reports broken). Print can ship independently.
- **Location:**
  - Print:
    - Frontend: `apps/web-admin/src/app/(admin)/clarifications/page.tsx` (add onClick + small `print.css` or inline `@media print` styles)
  - Export:
    - Backend catalogue: `apps/api/src/modules/reports/reports.service.ts` (add code `clarifications-by-tender`)
    - Backend renderer: `apps/api/src/modules/reports/report-renderer.service.ts` (new render method using pdfkit)
    - Frontend: add an Export-click handler that takes the current tender id, POSTs to `/reports/clarifications-by-tender/export?tenderId=…`, polls, downloads.
- **Fix scope:**
  1. Print: ~10 lines (onClick + print CSS).
  2. Export: report catalogue entry + PDF renderer + frontend click handler. **Defer until BUG-034 (reports broken) is fixed.**
- **Verification:**
  1. Click Print → browser print preview shows only the threads.
  2. Click Export → job appears in `/reports`, completes, PDF downloads with threads + visibility tags.
- **Notes:** Two-phase fix: Print can ship today; Export waits on BUG-034.

---

## BUG-019 — Clarifications: Timeline icon → tender event drawer

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Bug + small feature
- **Severity:** Low
- **Discovered:** 2026-05-26
- **Component:** Admin → Clarifications → right sidebar icons (`page.tsx:623-628`)
- **Symptom:** Calendar/Timeline icon has no onClick. The other two icons (Tender Details Link, Refresh button) work.
- **Agreed approach (2026-05-26):** Wire Timeline to open a side drawer showing the tender's full audit-event history in chronological order. Reuses the existing `getTenderLogs(tenderId)` audit endpoint — no new backend work. Drawer renders each event with type, actor, timestamp, and (collapsible) before/after detail.
- **Location:**
  - Frontend: `apps/web-admin/src/app/(admin)/clarifications/page.tsx` — add drawer state + onClick on the Timeline button.
  - Likely new reusable component: `components/TenderTimelineDrawer.tsx` so it can also be embedded on the tender detail page later.
  - Backend: no change — `GET /tenders/:id/audit-logs` already exists (audit.service `getTenderLogs`).
- **Fix scope:**
  1. Add Timeline drawer component (fetch logs on open, render chronologically, close on overlay click).
  2. Wire onClick on Timeline icon to open drawer for the currently-selected tender.
  3. Disable the icon when no tender is selected.
- **Verification:** Click Timeline on a tender with audit events → drawer slides in → shows TENDER_CREATED through to most recent event in order.
- **Notes:** Low priority but cheap. Component can be reused on the tender detail page later (would also satisfy BUG-007's workflow-progress need at least partially).

---

## BUG-020 — Technical Evaluator assignment + notification

- **Status:** Open (decisions locked 2026-05-26 — promoted from Question to Feature)
- **Type:** Feature
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Tender Detail (new "Assign Evaluators" panel) + Technical Evaluation workspace + Notifications
- **Symptom:** No way to formally assign evaluators to a specific tender. No notification when envelopes open.
- **Existing infrastructure:** Role `TECHNICAL_EVALUATOR` exists with the right permissions (`technical:view`, `technical:open`, `technical:evaluate`, `technical:finalize`). The role + permission catalogue is done.
- **Agreed approach (2026-05-26):**
  1. **Explicit per-tender assignment.** New `tender_evaluators` join table (`tenderId`, `userId`, `assignedBy`, `assignedAt`). Admin opens an "Assign Evaluators" panel on the tender detail page (visible from status = Approved onward) and picks N users from the pool of users with TECHNICAL_EVALUATOR role. Only users in the assigned list can submit scores (`evaluate()` rejects others). Pattern mirrors the committee for commercial opening.
  2. **Notify on TECHNICAL_OPENING.** When `openTechnicalEnvelopes()` succeeds, dispatch the `TECHNICAL_EVALUATION_READY` template to each assigned evaluator's email. Includes tender ref, title, deadline target, link to the evaluation workspace. Best-effort (failures logged, doesn't roll back).
  3. **Minimum 1 evaluator to finalize.** Admin can assign 1+ at any time. `finalizeTechnicalResults()` requires at least 1 evaluator to have submitted scores. (Note: this is the permissive option — single-evaluator finalisation is allowed. If procurement compliance later wants 2+, just change the threshold.)
- **Location:**
  - DB migration: `tender_evaluators` table.
  - Backend: `apps/api/src/modules/tenders/tenders.service.ts` — new `assignEvaluator()`, `unassignEvaluator()` (with status guard: only allowed in Approved through TECHNICAL_OPENING; locked after Commercial Sealed).
  - Backend controller: `POST /tenders/:id/evaluators`, `DELETE /tenders/:id/evaluators/:userId`, `GET /tenders/:id/evaluators`.
  - Backend technical-evaluation service: `evaluate()` rejects callers not in the assigned list. `finalize()` rejects if no scores submitted (today already required indirectly; make it explicit).
  - Backend notifications: hook into `openTechnicalEnvelopes()` to dispatch emails. New template seeded: `TECHNICAL_EVALUATION_READY`.
  - Frontend admin: "Assign Evaluators" panel on tender detail page (gated on status + admin permission). User picker pulls from `/users?role=TECHNICAL_EVALUATOR&department=<tender.department>`.
  - Audit events: `TENDER_EVALUATOR_ASSIGNED`, `TENDER_EVALUATOR_UNASSIGNED` (MEDIUM risk).
- **Fix scope:**
  1. Migration + Prisma model.
  2. 3 backend endpoints (assign / unassign / list).
  3. Assignment guard in `evaluate()` (reject non-assigned users with 403).
  4. Notification dispatch hooked into TECHNICAL_OPENING.
  5. New email template seed.
  6. Frontend "Assign Evaluators" panel.
  7. Audit logging.
- **Verification:**
  1. Approved tender → admin assigns Alice + Bob (both TECHNICAL_EVALUATOR) → Charlie (also TECHNICAL_EVALUATOR but not assigned) tries to score → 403.
  2. Admin clicks "Open Technical Envelopes" → MailHog shows 2 emails (Alice + Bob).
  3. Alice scores → admin clicks Finalize → succeeds (min 1 evaluator threshold met).
- **Notes:** Tightly coupled to BUG-028 (RBAC tightening — sidebar visibility + department-scoping). The user-picker for assignment depends on `/users?role=…` working correctly with the new permission gates from BUG-028.

---

## BUG-021 — Technical Evaluation scorecard: Fail/Pass overlap with Save

- **Status:** ✅ **Fixed 2026-05-26** — Save Evaluation button was missing `px-/py-` padding so it rendered as a tiny dot next to Pass/Fail. Added `px-6 py-4`. Verified in live JS chunk.
- **Type:** Bug
- **Severity:** Low
- **Discovered:** 2026-05-26
- **Component:** Admin → Technical Evaluation → scorecard
- **Symptom:** Fail / Pass buttons visually overlap with the Save Evaluation button.
- **Root cause:** CSS/layout — likely insufficient gap or wrong positioning.
- **Agreed approach:** Restructure scorecard footer as a single flex container with `gap-3` separating result-toggle (Fail/Pass) from the primary Save Evaluation button. Move Save to its own row if horizontal space is tight at default viewport.
- **Location:** `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` (scorecard footer JSX)
- **Verification:** Open scorecard at 1280×800 and 1440×900 viewports — all three buttons clearly separated with no overlap. Mobile: stacks vertically if needed.
- **Notes:** Pure cosmetic. Defer to whenever the next admin-portal CSS pass happens.

---

## BUG-022 — Technical Evaluation: "View Full Proposal" doesn't open document (pure wiring)

- **Status:** ✅ **Fixed 2026-05-26** — added `handleViewProposal()` fetching `GET /bids/:id/envelopes/TECHNICAL/documents` then opening the first doc via blob URL in a new tab.
- **Type:** Bug
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Technical Evaluation → scorecard header (`page.tsx:441-447`)
- **Symptom:** Bare `<button>` with no onClick. Evaluators can't open the vendor's technical doc.
- **Backend already done:**
  - `GET /bids/:bidId/envelopes/:envelopeType/documents` — lists docs in an envelope (`bids.controller.ts:86`)
  - `GET /bids/:bidId/documents/:documentId` — streams a single doc (`bids.controller.ts:122`)
- **Agreed approach:** Wire the button to fetch the list of TECHNICAL-envelope docs for the currently-selected bid; if 1 doc, open directly; if multiple, show a tiny dropdown to pick.
- **Location:** `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` only — no backend change.
- **Fix scope:**
  1. Add onClick handler that fetches `GET /bids/:selectedBidId/envelopes/TECHNICAL/documents` with bearer token.
  2. If 1 doc: fetch the document blob and `window.open(URL.createObjectURL(blob), '_blank')`.
  3. If multiple: render an inline dropdown listing each filename → click to open.
  4. Disable button + show "No docs uploaded" state if the list is empty.
- **Verification:** Open Technical Evaluation, select a bid with technical docs → click View Full Proposal → PDF opens in a new tab.
- **Notes:** Permission gate is already in place server-side (`technical:view` on the document download endpoint). Required for evaluators to do their job — should ship in same session as BUG-020 (evaluator assignment).

---

## BUG-023 — Commercial documents missing on Committee Opening + Comparison pages (bundled with BUG-025)

- **Status:** Open (decisions locked 2026-05-26 — bundled with BUG-025)
- **Type:** Bug (pure frontend)
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Committee Opening page + Commercial Comparison page
- **Symptom:** Neither page renders the vendors' commercial documents (filenames, download links).
- **Backend already done:**
  - `GET /bids/:bidId/envelopes/COMMERCIAL/documents` lists envelope docs
  - `GET /bids/:bidId/documents/:documentId` streams the file with `commercial:download` permission gate (`bids.service.ts:220`)
  - Commercial-evaluation service already returns `canDownload` flag (`commercial-evaluation.service.ts:81`)
- **Agreed approach (2026-05-26):**
  1. **Bundle BUG-023 + BUG-025.** Build one reusable `CommercialDocumentsList` React component used by both pages.
  2. **Visibility gate: status ≥ Commercial Evaluation/Comparison AND `commercial:view` permission.** Component renders empty placeholder ("Awaiting committee opening") before that status — never leaks docs pre-opening regardless of caller's permission. After opening, lists files with download links; the download link only renders if caller has `commercial:download`.
- **Location:**
  - New: `apps/web-admin/src/components/CommercialDocumentsList.tsx` (reusable; takes `bidId`, `tenderStatus`, `permissions`).
  - Update: `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` — render component per bid in Technically Qualified Vendors section.
  - Update: `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` — add a Documents column to each comparison row, render component.
  - Backend: no change.
- **Fix scope:**
  1. New shared component (~50 LOC).
  2. Embed in two pages.
  3. Visibility gate (status + permission) inside the component.
- **Verification:**
  1. Tender at Commercial Sealed (pre-opening) → both pages show "Awaiting committee opening" placeholder per bid.
  2. After committee opens envelopes (status = Commercial Evaluation) → both pages show each bid's commercial docs.
  3. As a user with `commercial:view` but NOT `commercial:download` → filenames visible, no download link (just an info icon).
  4. As a user with both → click download → file streams.
- **Notes:** Single deploy closes both BUG-023 and BUG-025.

---

## BUG-024 — Committee Attendance UI: PRESENT/ABSENT misaligned

- **Status:** ✅ **Fixed 2026-05-26** — added `flex-1 min-w-0 truncate` to the member-name column and `shrink-0` to the PRESENT/ABSENT pill group so the toggle column locks to a consistent x-position. Verified in live JS chunk.
- **Type:** Bug
- **Severity:** Low
- **Discovered:** 2026-05-26
- **Component:** Admin → Committee Opening → Attendance table
- **Symptom:** PRESENT / ABSENT controls drift out of alignment across rows.
- **Agreed approach:** Constrain the action cell to a fixed width (e.g. `w-32`) and use `flex items-center justify-end gap-2` for the PRESENT/ABSENT button group. Ensures consistent column widths regardless of member name length.
- **Location:** `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` (attendance table row JSX)
- **Verification:** Attendance table with short + long member names renders aligned columns at all default viewport widths.
- **Notes:** Pure cosmetic. Bundle with BUG-021 in the next admin-portal CSS pass.

---

## BUG-025 — Commercial Comparison: commercial documents not attached (bundled with BUG-023)

- **Status:** Open — **bundled with BUG-023** (decision 2026-05-26)
- **Type:** Bug (pure frontend)
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Commercial Comparison
- **Symptom:** Comparison rows don't show or link to the vendor's commercial documents.
- **Resolution:** Closes when the shared `CommercialDocumentsList` component (built per BUG-023 decision) is embedded in this page's Documents column. See BUG-023 for full agreed approach, location, fix scope, and verification.
- **Notes:** Single deploy fixes BUG-023 + BUG-025 together.

---

## BUG-026 — Committee can recommend any technically-PASS bid with justification

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Feature
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Commercial Comparison + Approvals queue
- **Symptom:** UI forces lowest-priced bid as the only recommendable option. Committee can't recommend a higher-priced vendor (e.g. better technical fit, capacity, risk profile).
- **Agreed approach (2026-05-26):**
  1. **Eligible bids:** Any bid with technical result = PASS. FAIL bids excluded — they were eliminated for cause. Validation enforced server-side in `award.service.recommend()`.
  2. **Non-lowest detection + flagging:** When the recommended bid is NOT rank 1 by price, set `nonLowestPrice = true` on the recommendation record and include the price gap (e.g. `bypassedLowestBidId`, `priceGapKwd: 5200`). Audit log entry tagged `AWARD_RECOMMENDED_NON_LOWEST` (separate event type from the standard `AWARD_RECOMMENDED`) with HIGH risk level.
  3. **Approval-screen banner:** Approvals queue detail for non-lowest recommendations shows a prominent banner: "This recommendation is NOT the lowest priced bid (+{priceGap} KWD above lowest). Review the justification carefully." Includes a sub-list of the bids that were bypassed.
  4. **Justification length:** Lowest-price pick → any non-empty justification accepted. Non-lowest pick → minimum 100 characters required (enforced client + server). Server returns 400 with clear message if too short.
  5. **No dual-approval requirement** for v1. Existing single-approver model retained; the banner + 100-char justification + non-lowest audit flag are the controls. Dual-approval can be added later if compliance demands it.
- **Location:**
  - Backend: `apps/api/src/modules/award/award.service.ts` — `recommend()` accepts any technically-PASS bid id; computes nonLowestPrice flag + price gap; emits the right audit event type.
  - Backend DTO: `apps/api/src/modules/award/dto/recommend-award.dto.ts` (new or update) — `bidId: string`, `justification: string` (length validator depends on bidId vs lowest).
  - Backend audit: new event type `AWARD_RECOMMENDED_NON_LOWEST` (audit catalogue update).
  - Frontend Commercial Comparison: `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` — Recommend button on every PASS row (not just rank 1). Modal collects justification with dynamic length validator.
  - Frontend Approvals: `apps/web-admin/src/app/(admin)/approvals/page.tsx` — when the task is an Award Approval with `nonLowestPrice: true`, render the banner + list of bypassed bids.
  - DB migration: add `non_lowest_price BOOLEAN DEFAULT FALSE`, `bypassed_lowest_bid_id UUID NULL`, `price_gap_kwd DECIMAL NULL` columns to the `award_recommendations` table (or wherever recommendations are stored — TBD by reading the service).
- **Fix scope:**
  1. Migration: 3 new columns on the recommendations table.
  2. Backend: update DTO + service + audit event type + recommend logic.
  3. Frontend Comparison: enable Recommend per PASS row, modal with smart length validator.
  4. Frontend Approvals: non-lowest banner + bypassed-bids list.
- **Verification:**
  1. Comparison with 3 PASS bids (rank 1 = 80k, rank 2 = 87k, rank 3 = 95k) → Recommend on rank 2 with 50-char justification → 400 "min 100 characters required for non-lowest".
  2. Same with 120 chars → succeeds → audit log has `AWARD_RECOMMENDED_NON_LOWEST` event.
  3. Approvals queue → task shows red banner "+7,000 KWD above lowest" with the rank-1 bid listed as bypassed.
  4. Recommend rank 1 with 20-char justification → succeeds, standard `AWARD_RECOMMENDED` event, no banner.
- **Notes:** Compliance-sensitive — the audit-event split (`AWARD_RECOMMENDED` vs `AWARD_RECOMMENDED_NON_LOWEST`) makes filtering for review trivial later. Approvers see the override clearly before signing off.

---

## BUG-027 — Edit user PATCH rejected 400 "property authType should not exist" (frontend-only fix)

- **Status:** ✅ **Fixed 2026-05-26** — `authType` + `adUsername` now sent only in the `editing === 'new'` branch. Live verified: PATCH without authType → 200, with authType → 400 (backend rule intact).
- **Type:** Bug
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Admin → Settings → Users → Edit (`settings/page.tsx:892-908`)
- **Symptom:** Every user edit returns `400 property authType should not exist`. Frontend payload always includes `authType` even when editing; backend `UpdateUserDto` correctly rejects it (auth type is immutable post-creation by design).
- **Root cause:** Frontend `handleSave` at `settings/page.tsx:900` unconditionally includes `authType: draft.authType` in the PATCH payload. The DTO correctly excludes this immutable field.
- **Agreed approach (2026-05-26):** **Frontend-only fix.** When `editing !== 'new'`, omit `authType` (and `adUsername` for AD users) from the payload. The backend DTO stays as-is, correctly enforcing the immutability rule.
- **Location:** `apps/web-admin/src/app/(admin)/settings/page.tsx` — `handleSave()` (~lines 892-925)
- **Fix scope:**
  1. In `handleSave`, build the payload conditionally: include `authType` + `adUsername` only inside the `if (editing === 'new')` branch.
  2. For edits (the `else if (editing)` branch), payload contains only the actually-changeable fields: `email`, `displayName`, `password` (optional), `status`, `roleId`, `departmentIds`, `primaryDepartmentId`.
- **Verification:**
  1. Edit a user's department → 200 OK, change persisted.
  2. Edit a user's password → 200 OK, user can log in with new password.
  3. Create a new user → 201 OK with all fields (including authType) accepted.
- **Notes:** Pure frontend, 1-file, ~10-line change. Could be deployed today.

---

## BUG-028 — RBAC: full sidebar gating + department-scoped data filtering

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Feature
- **Severity:** Critical
- **Discovered:** 2026-05-26
- **Component:** Admin portal: Sidebar + every list endpoint (tenders, approvals, clarifications, technical-evaluation, committee, commercial-comparison, audit, reports)
- **Symptom:** Sidebar shows all menu items regardless of role. No department-scoped data filtering for internal users.
- **Agreed approach (2026-05-26):**

  **Part A — Sidebar permission map** (full gating):

  | Item | Permission required |
  |---|---|
  | Dashboard | always visible |
  | Tenders | `tender:view` |
  | Approvals | `tender:approve` OR `award:approve` |
  | Clarifications | `clarification:view` |
  | Technical Evaluation | `technical:evaluate` |
  | Committee & Commercial | `committee:manage` OR `commercial:view` |
  | Commercial Comparison | `commercial:view` (already gated) |
  | Vendor Management | `vendor:view` |
  | Reports | `reports:view` |
  | Audit Log | `audit:view` |
  | Security Alerts | `audit:view` (already gated) |
  | System Configuration | `system:configure` |

  SYSTEM_ADMIN has all permissions by role definition → sees everything.

  **Part B — Department-scoped data filtering:**
  Non-admin internal users see only data tied to their department(s) (`user.departments` join). The filter applies to:
  - `GET /tenders` → tender.departmentId ∈ user.departments
  - `GET /tenders/:id/approvals`, approvals list → same
  - `GET /clarifications` (admin view) → only tenders in user.departments
  - `GET /technical-evaluation/*` → same
  - `GET /committee-sessions/*` → same
  - `GET /commercial-comparison/*` → same
  - `GET /audit-logs?entityType=Tender` → only events for tenders in user.departments
  SYSTEM_ADMIN bypasses every filter.

  **Part C — Empty-state UX:**
  Menu items remain visible. Pages render a friendly empty state when the scope is empty ("No tenders in your department" / "No tasks assigned"). User understands access boundaries instead of being confused by a vanishing menu.

  **Multi-department:** A user belongs to N departments via `user_departments`. Filter uses `IN (...)` — they see the union.
- **Location:**
  - Frontend: `apps/web-admin/src/components/layout/Sidebar.tsx` — extend the existing `permission` field on the NAV array to cover every item.
  - Backend: every list service named above — add `scopeToUserDepartments(userId)` helper used in their `findAll`/`search` methods. New helper in `apps/api/src/common/rbac/dept-scope.helper.ts`.
  - Backend: `apps/api/src/modules/users/users.service.ts` already loads `user.departments` — expose to request guard so services can read it without re-fetching.
- **Fix scope:**
  1. Sidebar gates: extend the `permission` field on 9 nav items per the map above.
  2. Dept-scope helper + permission-checking middleware that loads user.departments into request context.
  3. Apply the filter to 6 list endpoints across tenders/approvals/clarifications/technical-eval/committee/commercial-comparison.
  4. Apply the filter to audit log search.
  5. Empty-state copy on each page (one banner: "No items in your scope. Contact admin if this is unexpected.").
- **Verification:**
  1. Create Alice (Technical Evaluator, IT department). Log in: sidebar shows Dashboard, Tenders, Technical Evaluation only.
  2. Alice opens Tenders → sees only IT-department tenders.
  3. Create Bob (Vendor Manager, no departments). Sees Vendor Management + Dashboard only. Vendor list works (vendors aren't dept-scoped).
  4. SYSTEM_ADMIN logs in → all 12 menu items visible, all tenders across all departments visible.
  5. Try direct URL navigation by a user without permission (e.g. `/audit-log` as Alice) → server returns 403, page shows access-denied state.
- **Notes:** Critical compliance gap. Must ship before any multi-department pilot. Audit-log filtering means evaluators don't see audit events from other departments — confirm with compliance this isn't too restrictive (alternative: gate audit by `audit:view_global` vs `audit:view_own_dept`).

---

## BUG-029 — Vendor dashboard stats should be clickable links

- **Status:** ✅ **Fixed 2026-05-26** — stat cards wrapped in `<Link>` (each routes to `/bids` or `/tenders`). Filter-prefill via `?status=…` deferred — destination pages don't yet read query params for filter state; track as follow-up if needed.
- **Type:** Feature
- **Severity:** Low
- **Discovered:** 2026-05-26
- **Component:** Vendor portal → Dashboard → 4 stat cards
- **Symptom:** Stat cards aren't clickable.
- **Agreed approach:** Wrap each stat card in a `<Link>` with the appropriate filter:
  - Active Bids → `/bids?status=SUBMITTED,LATE_SUBMITTED`
  - Open Tenders → `/tenders?status=Published,Clarification%20Period`
  - In Evaluation → `/bids?status=EVALUATED`
  - Awarded → `/bids?status=AWARDED`
- **Frontend filter prep:** `/bids` and `/tenders` pages need to read the `status` query parameter and apply it to their filter state. If not already implemented, add `useSearchParams` initial-value plumbing.
- **Location:** `apps/web-vendor/src/app/(portal)/dashboard/page.tsx` + `/bids/page.tsx` + `/tenders/page.tsx` (query-param reading)
- **Verification:** Click each stat → URL updates with `?status=…` → destination page renders the filtered subset.
- **Notes:** Cheap UX win. Pair with the next vendor-portal frontend deploy.

---

## BUG-030 — Vendor reset password link returns 404 (build the page + add resetUrl to template)

- **Status:** Open (no policy decision — straight wiring)
- **Type:** Bug
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Vendor portal → `/reset-password` route + `vendor-reset-password` notification template
- **Symptom:** Email links to `https://vn.hadiclinic.com.kw:4201/reset-password?token=…` but that page doesn't exist → 404. No working password recovery.
- **Backend already done:** `POST /vendor-auth/reset-password` endpoint at `vendor-auth.controller.ts:71` accepting `{token, newPassword}`. Service correctly validates the token, marks `used_at`, bumps `token_version`.
- **Missing:**
  1. Frontend page `apps/web-vendor/src/app/reset-password/page.tsx` (mirror of `/verify-email` pattern).
  2. Email template wiring — `vendor-auth.service.ts:225` passes only `{token: rawToken}` but the template likely needs the full URL. Add `resetUrl: ${VENDOR_PORTAL_URL}/reset-password?token=${rawToken}` to the variables. Update template body if needed.
- **Agreed approach:**
  1. **New page** `app/reset-password/page.tsx`:
     - Suspense-wrapped (like verify-email).
     - Reads `token` from `useSearchParams`.
     - Shows password + confirm-password inputs (with the same strength hint as register: 12+ chars, mixed case + digit + symbol).
     - POST to `/vendor-auth/reset-password` with `{token, newPassword}`.
     - Success state → "Password reset successfully" + link to `/login`.
     - Error state → "Token invalid or expired. Request a new reset email." + link to `/forgot-password`.
  2. **Email payload** — add `resetUrl` to the variables passed at `vendor-auth.service.ts:225`. Confirm the `vendor-reset-password` template uses `{{resetUrl}}` (update template body if it still uses raw `{{token}}`).
- **Location:**
  - New file: `apps/web-vendor/src/app/reset-password/page.tsx`
  - Update: `apps/web-vendor/src/components/layout/AuthShell.tsx` — already exists, reuse.
  - Update: `apps/api/src/modules/vendor-auth/vendor-auth.service.ts:225` (one-line variables update)
  - Update: notification template body in DB (or seed migration) if still using raw token.
- **Verification:**
  1. Forgot password → MailHog email → link goes to `https://vn.hadiclinic.com.kw:4201/reset-password?token=…`.
  2. Click → page renders with password inputs.
  3. Submit valid new password → success → log in with new password → reach `/dashboard`.
  4. Submit same token again → 400 "Token already used" surfaced on the page.
- **Notes:** Mirrors the verify-email fix that landed earlier. Should be quick.

---

## BUG-031 — Vendor Clarifications visibility model rewrite (per-reply visibility + vendor identity redaction)

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Bug + small model migration
- **Severity:** High
- **Discovered:** 2026-05-26
- **Component:** Backend `clarifications.service.ts` + Vendor portal Clarifications page
- **Symptom:** Vendors see other vendors' (non-public) clarification questions. Current backend filter uses `{ isPublic: true }` on the parent clarification — which is broken because parent default makes everything visible, and replies don't even have their own visibility field.
- **Agreed approach (2026-05-26):**

  **1. Model change — per-reply visibility.**
  Move `isPublic` from `tender_clarifications` to `tender_clarification_replies`. Each reply has its own `isPublic` flag (admin sets when replying). A clarification is "visible to all" if **any** of its replies has `isPublic = true`.

  **2. Migration.**
  One-shot SQL: `ALTER TABLE tender_clarification_replies ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;` then `UPDATE tender_clarification_replies r SET is_public = c.is_public FROM tender_clarifications c WHERE r.clarification_id = c.id;` then `ALTER TABLE tender_clarifications DROP COLUMN is_public;`. Existing data preserves its current public/private state.

  **3. Vendor-side filter rewrite.**
  For a vendor caller, return clarifications where:
  - `vendorId = caller.vendorId` (own threads — all replies visible), OR
  - `replies.some(isPublic = true)` AND `vendorId != caller.vendorId` (others' threads with at least one public reply — see point 4).

  **4. Vendor identity redaction for others' threads.**
  When returning another vendor's clarification, strip vendor identity: set `vendorName = 'Another vendor'`, `vendorId = null`. Question text is preserved. Within that thread, only PUBLIC replies are included — private replies are dropped from the response.

  **5. Admin caller (no vendorId) unchanged.**
  Admins see all clarifications, all replies, with all vendor identities intact (no filter, no redaction).
- **Location:**
  - DB migration: new SQL file in `database/migrations/`.
  - Prisma schema: `apps/api/prisma/schema.prisma` — move `isPublic` field.
  - Backend: `apps/api/src/modules/clarifications/clarifications.service.ts` — rewrite `findAll` filter + response shape.
  - Backend reply endpoint: update `reply()` to write `isPublic` on the reply row instead of the parent.
  - Frontend admin: `apps/web-admin/src/app/(admin)/clarifications/page.tsx` — Public/Private toggle binds to reply (already does today; just confirm payload).
  - Frontend vendor: `apps/web-vendor/src/app/(portal)/clarifications/page.tsx` — display "Another vendor" badge for redacted threads.
- **Fix scope:**
  1. Migration (3-line SQL).
  2. Prisma schema update + regenerate.
  3. Backend `findAll` rewrite (filter + redaction).
  4. Backend `reply()` update to set `isPublic` on the reply.
  5. Frontend vendor: render "Another vendor" badge for redacted threads.
  6. Audit log entry on visibility-toggle: `CLARIFICATION_REPLY_PUBLISHED` event (HIGH risk).
- **Verification:**
  1. Vendor A asks → Admin replies PRIVATE → Vendor B fetches `/tenders/:id/clarifications` → does NOT see the thread.
  2. Admin replies PUBLIC on the same thread → Vendor B fetches → sees the thread with `vendorName = 'Another vendor'`, sees the public reply text, does NOT see the private reply text from earlier.
  3. Vendor A sees own thread with their own vendorName, both replies visible.
  4. Admin sees everything unchanged.
- **Notes:** Confidentiality bug. Compliance-critical (leaking competitor questions is a procurement violation). Model migration is small; the fix surface touches schema + service + 2 frontends.

---

## BUG-032 — Vendor portal: comprehensive blocked-state messaging via central registry

- **Status:** Open (decisions locked 2026-05-26)
- **Type:** Feature
- **Severity:** Medium
- **Discovered:** 2026-05-26
- **Component:** Vendor portal — all conditional CTAs and error states
- **Symptom:** Vendor actions silently fail or show generic errors when blocked. Needs friendly per-state copy ("Tender submissions have closed", etc.).
- **Agreed approach (2026-05-26):**

  **1. Central registry: `apps/web-vendor/src/lib/vendor-messages.ts`** exports `vendorMessage(state: VendorBlockedState, ctx?: {…}): VendorMessage`. Returns `{ title, body, action?, severity }`. Single source of truth — page components import + render.

  **2. States to cover in v1** (each gets a title + body + optional action like "Browse other tenders" or "Contact support"):

  | State | When triggered | Example copy |
  |---|---|---|
  | TENDER_SUBMISSION_CLOSED | Vendor opens a tender past submission deadline | "Tender submission has closed. The deadline was {{deadline}}." |
  | TENDER_CANCELLED | Vendor opens a tender that was cancelled | "This tender has been cancelled and is no longer accepting bids." |
  | TENDER_AWARDED_ELSEWHERE | Vendor opens an awarded tender they didn't win | "This tender has been awarded to another vendor." |
  | TENDER_NOT_INVITED | Vendor opens an INVITATION_ONLY tender they're not invited to | "This tender is invitation-only. You haven't been invited to bid." (or 404 — see decision) |
  | VENDOR_NOT_APPROVED | Vendor tries to bid before admin approval | "Your account is pending approval. You'll be notified when approved." |
  | VENDOR_SUSPENDED | Vendor's account is suspended | "Your account has been suspended. Contact procurement support." |
  | MFA_REQUIRED | Vendor tries to access portal without MFA setup | "Multi-factor authentication is required to proceed." |
  | ALREADY_SUBMITTED | Vendor tries to start a 2nd bid on the same tender | "You have already submitted a bid for this tender." |
  | BID_WINDOW_NOT_OPEN | Vendor tries to bid on a tender not yet Published | "This tender isn't yet open for bidding. Check back after publication." |
  | EMAIL_NOT_VERIFIED | Vendor tries to bid before verifying email | "Please verify your email address first. Check your inbox or request a new link." |
  | PASSWORD_RESET_TOKEN_INVALID | Reset link expired/used (BUG-030 cousin) | "This reset link is invalid or has been used. Request a new one." |

  ~11 states. Will discover more during implementation — register supports adding new ones cleanly.

  **3. Rendering pattern:** Each blocked CTA renders a small `<MessageBanner>` component (info | warning | danger severity) instead of a disabled grey button. Banner shows title + body + optional action link.

  **4. No backend changes** — backend already returns these states correctly (or doesn't return the resource at all for confidentiality reasons). This is pure frontend UX.
- **Location:**
  - New file: `apps/web-vendor/src/lib/vendor-messages.ts` (registry + types).
  - New component: `apps/web-vendor/src/components/ui/MessageBanner.tsx`.
  - Pages that consume: tender detail (`(portal)/tenders/[id]/page.tsx`), bid wizard, dashboard, login (for VENDOR_SUSPENDED + EMAIL_NOT_VERIFIED), reset-password (PASSWORD_RESET_TOKEN_INVALID — pair with BUG-030).
- **Fix scope:**
  1. Registry + types.
  2. MessageBanner component (3 severity variants).
  3. Page-by-page replacement of generic errors/silent no-ops with banner renders.
  4. Verify in DevTools for each state.
- **Verification:**
  1. As a vendor, open a tender past its submission deadline → friendly TENDER_SUBMISSION_CLOSED banner instead of disabled button.
  2. As a not-yet-approved vendor, try to log in → friendly VENDOR_NOT_APPROVED message on `/login`.
  3. Try to start a 2nd bid → friendly ALREADY_SUBMITTED banner.
  4. Walk all 11 listed states, confirm friendly copy renders.
- **Notes:** Pair with BUG-015 (INVITATION_ONLY tender state) and BUG-030 (reset password page) since both add new blocked states the registry should cover.

---

## BUG-033 — Export Comparison 404: frontend uses wrong report code (hyphen vs underscore)

- **Status:** ✅ **Fixed 2026-05-26** (deployed to staging at ~02:09 GMT+3, verified end-to-end)
- **Fixed scope (actual changes):**
  - `apps/api/src/modules/reports/dto/export-report.dto.ts` — added `tenderId?: string` field
  - `apps/api/src/modules/reports/reports.service.ts` — `exportReport()` now `.toLowerCase()`s the report code before catalogue lookup; forwards `dto.tenderId` into filters
  - `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx:201` — POST URL changed to `/reports/commercial_comparison/export`; payload now `{ format: 'XLSX', tenderId: selectedTenderId }`
- **Verification (post-deploy):** POST `/reports/commercial_comparison/export` with tenderId → job COMPLETED in 238 ms → 6,723-byte XLSX downloaded as valid Microsoft Excel 2007+ file.
- **Type:** Bug (frontend naming mismatch)
- **Severity:** High → downgraded to **Medium** (1-line fix once identified)
- **Discovered:** 2026-05-26
- **Component:** Admin → Commercial Comparison → Export button
- **Symptom:** `POST /api/v1/reports/commercial-comparison/export` → 404 "Unknown report code: commercial-comparison".
- **Root cause (identified):** Backend report catalogue at `apps/api/src/modules/reports/reports.service.ts:24` lists the code as `commercial_comparison` (underscore). All catalogue codes use underscores (`tender_summary`, `tender_lifecycle`, `vendor_directory`, etc.). Frontend POSTs `commercial-comparison` (hyphen). 404 is correct API behaviour given the input.
- **Agreed approach (2026-05-26):** Frontend fix — change the POST URL to use `commercial_comparison`.
- **Location:** `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` (Export click handler — the URL string).
- **Fix scope:** Single string change. Should also audit other Export/report-related call sites in the admin portal to ensure they match catalogue codes (they probably already do — this one is an outlier).
- **Verification:** Click Export on Commercial Comparison → job queued (provided BUG-034 reports-module issue is also resolved, otherwise it queues but never completes).
- **Notes:** Conditional on BUG-034 — even with the correct code, the job won't complete if the report pipeline is broken at runtime. Both should be retested together.

---

## BUG-034 — Reports & Analytics: no reports work (INVESTIGATED — reports module is actually fine)

- **Status:** ✅ **Fixed 2026-05-26** (closed as misdiagnosis; defensive lowercase fix shipped alongside BUG-033)
- **Type:** Misdiagnosis → real residual: frontend code/path mismatches (already covered by BUG-033)
- **Severity:** ~~Critical~~ → **Low** (downgraded after investigation)
- **Discovered:** 2026-05-26
- **Component:** Admin → Reports & Analytics (entire reports module)
- **Symptom:** User reports that none of the reports produce output. Catalogue has 9 reports; failure modes not yet captured per code.
- **Agreed approach (2026-05-26):** **Investigate first**, then scope the fix. Avoids committing to a remediation that doesn't address the actual problem.
- **Investigation checklist (to run as a separate diagnostic session):**
  1. Reproduce one specific report: POST `/api/v1/reports/tender_summary/export?format=XLSX` as admin against staging.
  2. Capture API response (status + body).
  3. `docker logs ctmp-api --tail 200` — look for error stack traces around the time of the request.
  4. Verify the BullMQ worker is registered: check API startup logs for "Report queue ready" or equivalent. If absent, the worker never registered.
  5. Verify Redis connectivity: `docker exec ctmp-api wget -qO- redis://ctmp-redis:6379/ping` (or whatever pattern the API uses).
  6. Verify storage volume mounted + writable: `docker exec ctmp-api ls -la /data/reports` — should exist; permissions should allow API user write.
  7. Check `report_export_jobs` table for the job row from step 1 — what's its status field? Is `failed_reason` populated?
  8. If the job is COMPLETED but download returns 404 → storage issue. If still QUEUED → worker issue. If FAILED → renderer issue (read `failed_reason`).
- **Likely candidates (ranked by probability):**
  1. BullMQ worker isn't running (worker module not imported in AppModule, or Redis connection failing silently).
  2. Storage path mismatch (env var vs docker-compose volume mount mismatch).
  3. Renderer-service exception per code (less likely — would have failed only on some codes, not "all").
- **Location:** `apps/api/src/modules/reports/` (all files), `infrastructure/docker/docker-compose.yml` (volume + REDIS_HOST env), API startup logs.
- **Fix scope:** **TBD — depends on investigation result.** Update this entry with the real root cause + fix once investigation completes.
- **Verification (post-fix):** All 9 reports in the catalogue produce downloadable files in their declared formats (XLSX + PDF where supported). Audit-trail entry exists per export.
- **Notes:** Critical — entire compliance/reporting story is offline. BUG-033 (report code mismatch) also blocks; even with the right code, the job won't complete until this is fixed. The reports module was working as recently as 2026-05-20 per the Phase 8 entry — something regressed in the deploys since.

### Investigation results (2026-05-26 22:50 GMT+3 against staging)

**Reports module is healthy.** End-to-end verification:

| Test | Result |
|---|---|
| All 7 ctmp-* containers running (api, redis, postgres, web-admin, web-vendor, minio, mailhog) | ✓ Healthy |
| `ReportsModule` loaded at startup, all 5 routes mapped (`GET /reports`, `POST /reports/:code/export`, `GET /reports/jobs`, `GET /reports/jobs/:id`, `GET /reports/jobs/:id/download`) | ✓ |
| `GET /reports` returns full 9-entry catalogue | ✓ |
| `POST /reports/tender_summary/export` → job QUEUED → COMPLETED in **86 ms** | ✓ |
| `POST /reports/audit_trail/export` → QUEUED | ✓ |
| `GET /reports/jobs` shows 21 historical jobs across multiple codes (`tender_summary`, `award_history`, `commercial_comparison`) all COMPLETED | ✓ |
| `GET /reports/jobs/:id/download` returns 7,391 bytes, content-type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `file` confirms `Microsoft Excel 2007+` | ✓ |
| BullMQ worker present + Redis connection working (jobs flow QUEUED → COMPLETED) | ✓ |
| Storage backend writing successfully (download streams real bytes) | ✓ |

**Real root cause of the user's "no reports work" experience:** The errors in the api logs are all frontend-side mismatches with the backend report-code catalogue:
- `POST /reports/AUDIT_TRAIL/export` → 404 (catalogue has `audit_trail` lowercase)
- `GET /reports/catalog` → 404 (correct endpoint is `/reports`)
- `POST /reports/commercial-comparison/export` → 404 (catalogue has `commercial_comparison` underscore — this is BUG-033)

The Reports & Analytics page itself (`apps/web-admin/src/app/(admin)/reports/page.tsx`) uses the correct paths everywhere — it iterates the catalogue and passes each code verbatim. So if the user opened that page and hit Export on any catalogue row, it would have worked. The most likely path to the user's bad experience was hitting Export on the **Commercial Comparison page** (which sends `commercial-comparison` — BUG-033) or some other ad-hoc test that used the wrong code.

**Reclassified fix scope:**
1. **BUG-033 is the only real fix** — frontend changes `commercial-comparison` → `commercial_comparison` on the Commercial Comparison Export button.
2. **Optional defensive change:** server-side `exportReport` should be case-insensitive on the report code, so `AUDIT_TRAIL` and `audit_trail` both work. One-line `.toLowerCase()` on the lookup. Low risk, prevents future confusion.
3. **No worker/storage/Redis/renderer changes needed** — all working.

**Status:** Close BUG-034 once the Commercial Comparison Export button is verified post-BUG-033 fix. The "all reports broken" perception was wrong — they all work.

---

## BUG-035 — Commercial Comparison page: full in-app redesign (replaces XLSX export)

- **Status:** Open (locked design — to be implemented as Phase C per master plan)
- **Severity:** High
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin portal → `/commercial-comparison`

**Symptom:** Existing Commercial Comparison page is an export-centric stub. Project owner directive: "What's the point of the system if it cannot provide these features? I might better create an Excel file and throw this system out." Comparison must happen IN-APP.

**Agreed approach (locked in master plan, sections A1–A5):**
- Hybrid view: matrix top + expandable per-vendor card bottom
- Matrix toggle: Summary (vendor-per-row) ↔ Itemized (line-item-per-row)
- ALL vendors shown including technically-FAILed (grayed-out + FAIL badge)
- Each vendor card contains all five blocks: line-item breakdown, technical score detail (read-only), commercial documents (modal viewer), vendor profile snapshot, Recommend action

**Files (see master plan §3 for full list):**
- `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` — REPLACE
- `apps/web-admin/src/components/comparison/CommercialMatrix.tsx` — NEW
- `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` — NEW
- `apps/api/src/modules/comparison/comparison.controller.ts` — NEW (`GET /tenders/:id/comparison/commercial`)

**Verification:**
- Page loads with both matrix toggles working
- Lowest-PASS vendor visually highlighted on page load
- FAILed vendors grayed-out but still expandable for audit
- Vendor cards reveal all five blocks; clicking a commercial doc opens the PDF viewer modal
- BUG-033 XLSX export remains available until this lands, then removed (see BUG-045)

**Cross-refs:** `docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md` §2 sections A, D, F · flowchart diagrams 1, 2, 4

---

## BUG-036 — Technical Comparison page: NEW read-only consolidated view

- **Status:** Open (locked design — to be implemented as Phase B per master plan)
- **Severity:** High
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin portal → `/technical-comparison` (NEW route)

**Symptom:** No consolidated technical-comparison view exists. Evaluators score in isolation; committee has no way to see all technical evaluations side-by-side before commercial opening.

**Agreed approach (locked in master plan, sections B1–B6):**
- Brand-new page at `/technical-comparison`, separate from existing Technical Evaluation
- Read-only — no scoring on this page; scoring stays on existing Technical Evaluation scorecard
- Visible to evaluators (during Technical Evaluation stage) AND committee (through to award)
- Matrix layout switchable: vendors-as-rows ↔ criteria-as-rows
- Multi-evaluator: consensus average shown by default; expand cell to see each evaluator's individual score
- Total score = simple average across evaluators
- Total score is for ranking only, NOT PASS/FAIL (PASS/FAIL is gate-only, see BUG-044)

**Files:**
- `apps/web-admin/src/app/(admin)/technical-comparison/page.tsx` — NEW
- `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx` — NEW
- `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` — NEW
- `apps/api/src/modules/comparison/comparison.controller.ts` — `GET /tenders/:id/comparison/technical`
- `apps/web-admin/src/components/layout/Sidebar.tsx` — add nav entry

**Verification:**
- Page renders with all evaluators' scores aggregated to consensus
- Expanding a cell reveals each evaluator's score + comment
- Toggle switches matrix orientation correctly
- Gate-flagged criteria show PASS/FAIL badge; failing a gate marks vendor row red regardless of total score

**Cross-refs:** master plan §2 section B · flowchart diagrams 1, 3, 7

---

## BUG-037 — Shared in-app PDF viewer (modal full-screen)

- **Status:** Open (locked design — to be implemented as Phase A per master plan)
- **Severity:** High
- **Type:** Feature
- **Discovered:** 2026-05-27 design session (and retest D2 from 2026-05-26)
- **Component:** Cross-cutting shared component

**Symptom:** No consistent in-app document viewer. Retest D2 surfaced that the View Full Proposal button hits `/api/v1/bids/:id/envelopes/TECHNICAL/documents` and returns 401. The new comparison pages need a viewer; we should build one reusable component, not three different solutions.

**Agreed approach (locked in master plan, sections E1–E5):**
- PDF only. Enforced at vendor upload time (reject non-PDF). No Office docs, no images in v1
- Modal overlay — full-screen, ESC closes. Not inline-embedded, not split-pane, not new-tab
- View only — no annotations, no private notes, no shared comments
- Every view audit-logged via new `document_view_log` table; backend writes audit row BEFORE streaming the PDF (failing-open not allowed)
- Reused on: Commercial Comparison cards, Technical Comparison cards, Technical Evaluation View Full Proposal

**Files:**
- `apps/web-admin/src/components/viewer/PdfViewerModal.tsx` — NEW
- `apps/web-admin/src/components/viewer/PdfViewerProvider.tsx` — NEW (React context)
- `apps/api/src/modules/bids/bids.controller.ts` — new `GET /bids/:id/envelopes/:type/documents/:docId/view` (auth + audit + stream)
- `database/migrations/00X_document_view_log.sql` — NEW table
- `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` — re-wire View Full Proposal handler to the new viewer (closes retest D2)

**Verification:**
- Opening a PDF from any of the three host pages shows a modal viewer
- ESC closes the modal
- `document_view_log` row is written for every open (verify in DB)
- Uploading a non-PDF to a bid envelope is rejected with a friendly error
- Retest D2 — View Full Proposal now opens a PDF (no 401)

**Cross-refs:** master plan §2 section E · flowchart diagram 5

---

## BUG-038 — On-demand Award Minutes PDF

- **Status:** Open (locked design — to be implemented as Phase E per master plan)
- **Severity:** Medium
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin portal → Awarded tender detail page

**Symptom:** Procurement teams need a paper-trail document for executives / compliance binders / award memos. Master plan removes XLSX export of Commercial Comparison; a structured PDF replaces it for award decisions.

**Agreed approach (locked in master plan, sections H1–H2):**
- "Generate Award Minutes" button on awarded tender page (`/tenders/[id]`)
- ON-DEMAND only — not auto-generated at Confirm
- PDF contains: tender details, list of all bidders (PASS + FAIL), technical scores per vendor (incl. reason if FAIL), commercial prices, meeting attendees, lowest, recommended vendor, justification text, justification PDF attachment if override, timestamp, Procurement Manager name
- Immutable, SHA-256 hashed, stored in `award_minutes` table, linked to a row in `documents`
- Downloadable any time after Awarded state

**Files:**
- `apps/api/src/modules/award/award-minutes.service.ts` — NEW (decide pdfkit vs puppeteer at build time)
- `apps/api/src/modules/award/award.controller.ts` — `GET /tenders/:id/award/minutes.pdf`
- `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` — add Generate Award Minutes button
- `database/migrations/00X_award_workflow.sql` — `award_minutes` table

**Verification:**
- Awarded tender page shows the button (and only for awarded tenders)
- Button click → PDF downloads with all required sections
- SHA-256 in DB matches the downloaded file's hash
- Re-clicking generates a fresh row (history preserved)

**Cross-refs:** master plan §2 section H · flowchart diagram 4

---

## BUG-039 — Award flow: Recommend → Confirm with justification rules

- **Status:** Open (locked design — Phase D)
- **Severity:** High
- **Type:** Feature
- **Discovered:** 2026-05-27 design session (closes BUG-026 too)
- **Component:** Admin → Commercial Comparison page → AwardConfirmDialog

**Symptom:** Existing Commercial Comparison page forces recommendation to lowest price; no override path; no justification capture. Per spec, committee must be able to award to anyone with documented reasoning.

**Agreed approach (locked in master plan, sections F1–F5):**
- Page load auto-pre-selects lowest commercial price among technically-PASS vendors
- DEFAULT path (accepting pre-select) = zero-friction Confirm — no text, no PDF
- OVERRIDE path (picking non-lowest) = mandatory text justification + mandatory attached PDF
- Single-winner only — no split awards across vendors
- Confirm click → tender state moves to `Awarded`
- NO higher-authority approval layer — committee Confirm is final
- All actions audit-logged with attendee list, justification text, justification PDF hash

**Files:**
- `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` — NEW
- `apps/api/src/modules/award/award.controller.ts` — `POST /tenders/:id/award/recommend` + `POST /tenders/:id/award/confirm`
- `apps/api/src/modules/award/dto/recommend-award.dto.ts` — NEW
- `database/migrations/00X_award_workflow.sql` — `awards` table with CHECK constraint enforcing (is_lowest = TRUE OR justification_text + justification_pdf BOTH present)

**Verification:**
- Lowest-PASS vendor visually pre-selected; Confirm without any input works for that vendor
- Picking a non-lowest vendor surfaces required text + required PDF fields; Confirm blocked until both supplied
- After Confirm, tender state is `Awarded`; audit log entry contains full justification
- Closes BUG-026 (Award recommendation forced to lowest price)

**Cross-refs:** master plan §2 section F · flowchart diagram 4

---

## BUG-040 — Quorum + Committee Chair check before Confirm

- **Status:** Open (locked design — Phase D)
- **Severity:** High
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin → Committee Opening page → Commercial Comparison page

**Symptom:** Currently no enforcement that minimum committee members are present or that the Chair attended before an award is recorded. Project owner: "all members or some should be present in meeting before confirm is selected."

**Agreed approach (locked in master plan, sections G2–G5):**
- Existing Committee Opening page captures attendance (PRESENT/ABSENT per member)
- Add "Proceed to Comparison" button on Committee Opening; carries attendance over to new Commercial Comparison page (no re-entry)
- HARD quorum gate: Confirm is disabled until (a) ≥ N members PRESENT, AND (b) the Committee Chair (or configurable required role) is PRESENT
- Quorum count and required role are per-committee configurable (defaults: 50%+1 members, role = CHAIR)
- Confirm button shows a clear disabled-reason chip ("Need 2 more members + Chair must be present")

**Files:**
- `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` — add Proceed to Comparison button + hand off
- `apps/web-admin/src/components/comparison/QuorumStatus.tsx` — NEW chip
- `apps/api/src/modules/comparison/comparison.controller.ts` — `GET /tenders/:id/quorum` returning `{ hasQuorum, requiredCount, presentCount, chairPresent, missingRoles[] }`
- `apps/api/src/modules/committee/committee.service.ts` — `checkQuorum(tenderId)`
- `database/migrations/00X_award_workflow.sql` — add `required_quorum_count` and `required_role_code` to committees

**Verification:**
- Committee with attendance below quorum: Confirm disabled with correct reason chip
- Committee with quorum but Chair ABSENT: Confirm disabled with "Chair must be present"
- Both conditions met: Confirm enabled
- Audit log entry for the award includes attendance roster

**Cross-refs:** master plan §2 section G · flowchart diagrams 1, 4

---

## BUG-041 — Award amendment workflow (post-Confirm correction)

- **Status:** Open (locked design — Phase D)
- **Severity:** Medium
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin → Awarded tender detail page → Amend Award action

**Symptom:** Once a tender is Awarded, the spec mandates immutability — but real-life mistakes (wrong vendor, withdrawal, calculation error, legal objection) need a documented correction path that does not retroactively rewrite history.

**Agreed approach (locked in master plan, section F7):**
- Privileged role(s) only: Procurement Manager + System Admin both required (default — configurable later)
- Amend Award form requires: new recommended vendor, mandatory reason (text), mandatory superseding PDF
- Creates a NEW row in `awards` table; original is marked with `superseded_by_award_id` pointing to the new row
- Original record is NEVER deleted — both visible in tender history forever
- Audit log captures the amendment with references to both award IDs
- Optional vendor notifications about the amendment (same opt-in pattern as award)

**Files:**
- `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` — Amend Award button on awarded tenders
- `apps/web-admin/src/components/comparison/AmendAwardDialog.tsx` — NEW
- `apps/api/src/modules/award/award.controller.ts` — `POST /tenders/:id/award/amend`
- `apps/api/src/modules/award/dto/amend-award.dto.ts` — NEW
- `database/migrations/00X_award_workflow.sql` — `superseded_by_award_id` self-reference in `awards`

**Verification:**
- Awarded tender shows Amend Award button only to users with both `award:amend` perms
- Submitting an amendment requires text + PDF + new vendor
- Tender history shows both original (struck-through label) and current amendment
- Audit log entry references both award IDs

**Cross-refs:** master plan §2 section F7 · flowchart diagram 6

---

## BUG-042 — Optional vendor notifications at award

- **Status:** Open (locked design — Phase E)
- **Severity:** Medium
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin → AwardConfirmDialog → Vendor portal

**Symptom:** Currently no winner/loser notification system. Project owner: "default i no notification" but option for opt-in is needed.

**Agreed approach (locked in master plan, sections F6, B):**
- Two opt-in toggles at award Confirm time:
  - "Notify winning vendor automatically" (default OFF)
  - "Notify losing vendors automatically" (default OFF)
- When opted-in:
  - Winner sees "You have been awarded TDR-XXXX" in portal + email
  - Losers see status "Awarded to another vendor" + optional reason (committee can fill per-vendor, defaults blank)
- Manual re-trigger endpoint for the case Procurement Manager forgets the toggle at Confirm time

**Files:**
- `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` — add toggles
- `apps/api/src/modules/notifications/notifications.service.ts` — `notifyAwardWinner()`, `notifyAwardLoser()`
- `apps/api/src/modules/award/award.controller.ts` — `POST /tenders/:id/award/notify` (manual re-trigger)
- `apps/web-vendor/src/app/(portal)/bids/[bidId]/page.tsx` — award-state UI

**Verification:**
- Default behaviour at Confirm: no notifications fire
- Toggling winner-on: winner receives portal notification + email
- Toggling losers-on: each losing vendor sees the "Awarded to another vendor" state
- Manual re-trigger works for already-awarded tenders

**Cross-refs:** master plan §2 section F6 · flowchart diagram 4

---

## BUG-043 — Evaluation criteria library (admin master template)

- **Status:** Open (locked design — Phase F)
- **Severity:** Medium
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin → Settings → Evaluation Criteria (NEW)

**Symptom:** No master template for evaluation criteria; every tender starts from scratch. Owner wants a hybrid model where a library exists, but per-tender customisation is allowed.

**Agreed approach (locked in master plan, section C1):**
- New admin page at `/settings/evaluation-criteria`
- CRUD for library entries: name, description, default weight, default is-gate flag, is-active
- Library entries appear as defaults when starting per-tender criteria selection (BUG-044)
- Editing a library entry does NOT retroactively change criteria already attached to existing tenders (snapshot semantics at the per-tender level)

**Files:**
- `apps/web-admin/src/app/(admin)/settings/evaluation-criteria/page.tsx` — NEW CRUD UI
- `apps/api/src/modules/evaluation-criteria/` — NEW or extend existing module
- `database/migrations/00X_award_workflow.sql` — `evaluation_criteria_library` table

**Verification:**
- Admin can create, edit, deactivate library entries
- Library entries appear as defaults when configuring a tender's criteria
- Library edits do not retroactively change existing tender criteria

**Cross-refs:** master plan §2 section C1

---

## BUG-044 — Per-tender criteria editor (weights, gates, customisation)

- **Status:** Open (locked design — Phase F)
- **Severity:** Medium
- **Type:** Feature
- **Discovered:** 2026-05-27 design session
- **Component:** Admin → Tender create / Tender edit (pre-Publish)

**Symptom:** Per-tender criteria cannot be customised. Need add/remove/rename, weights summing to 100%, and a mandatory-gate flag per criterion.

**Agreed approach (locked in master plan, sections C1–C5):**
- During tender create or edit (before Publish), procurement officer selects from library + adds/removes/renames criteria
- Each criterion has: name, description, weight (numeric), is-mandatory-gate (boolean)
- Validation: weights MUST sum to exactly 100% before tender can move past Internal Review
- Typical tender has 5–10 criteria
- PASS/FAIL determination is GATE-ONLY: pass all gated criteria = overall PASS; fail any gate = overall FAIL
- Total weighted score is for ranking only, NOT for PASS/FAIL determination

**Files:**
- `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` — add criteria editor section
- `apps/api/src/modules/tenders/dto/update-tender.dto.ts` — extend with criteria array
- `apps/api/src/modules/evaluation-criteria/evaluation-criteria.service.ts` — validation logic
- `database/migrations/00X_award_workflow.sql` — `is_mandatory_gate` BOOLEAN and `weight` DECIMAL(5,2) on `evaluation_criteria`

**Verification:**
- Tender create form supports 5–10 criteria via library or custom
- Weights validation: cannot save if sum ≠ 100
- Gate-flagged criterion failing → overall FAIL regardless of total score (verify in Technical Evaluation + Comparison)
- Total score visible but does not change PASS/FAIL

**Cross-refs:** master plan §2 section C

---

## BUG-045 — Cleanup: remove Commercial Comparison XLSX export from Reports module

- **Status:** Open (locked design — Phase G, deferred)
- **Severity:** Low
- **Type:** Cleanup
- **Discovered:** 2026-05-27 design session
- **Component:** Reports & Analytics module

**Symptom:** Once BUG-035 ships the new in-app Commercial Comparison page, the XLSX export shipped in BUG-033 is redundant. Master plan removes it.

**Agreed approach (locked in master plan, section H5):**
- After BUG-035 is verified live on staging, remove:
  - `commercial_comparison` report code from `reports.service.ts`
  - The Commercial Comparison card from Reports & Analytics page
- Tender Summary, Audit Trail, Vendor Activity reports remain unchanged (Q15A — A-iv)
- BUG-033 fix stays working until this cleanup; do not remove prematurely

**Files:**
- `apps/api/src/modules/reports/reports.service.ts` — remove `commercial_comparison` branch
- `apps/web-admin/src/app/(admin)/reports/page.tsx` — remove the report card

**Verification:**
- Reports page no longer shows Commercial Comparison card
- Other reports continue to function
- DB cleanup: orphaned `report_jobs` rows with code `commercial_comparison` remain in history (don't delete; they're audit data)

**Cross-refs:** master plan §2 sections H4–H6 · BUG-033 (predecessor) · BUG-035 (successor)

---

## How to add a new bug

When the user reports a new observation in chat:

1. Pick the next `BUG-NNN` ID.
2. Add a one-line row to the **Open** summary table at the top.
3. Append a full detail block at the bottom of the doc with all standard fields (Status, Severity, Discovered, Component, Symptom, Root cause, Location, Fix scope, Verification, Notes).
4. If a quick code lookup can pin the file:line, do it — otherwise leave Root cause / Location as "TBD" until investigation.

## How to mark a bug fixed

1. Update the bug's detail block: `Status: Fixed`, add a new line `Fixed: 2026-MM-DD, commit <sha>` (or PR ref) and `Verified: <method>`.
2. Move the row from the **Open** summary table to **Fixed**.
3. Bump the HANDOVER entry referencing the run.



#New Errors#
1.	Tender
•	Tender creation missing Procurement Type, it only appears when you click on edit.  
•	Tender creation there is Department selection, but when edit the same tender there is no Department selection, there is only category (Question. Is this designed or its an error)
•	Tender creation time no budget option. only in tender edit budget is available but cant edit.
•	Trying to edit Tender before approval got this error "property category should not exist, property procurement Type should not exist, property estimated Budget should not exist"  console error  Failed to load resource: the server responded with a status of 400 ().
•	In Draft mode, can't upload any document. Document upload button doesn’t respond. This document should be available t vendor as this is tender requirement document RFQ.

2.	Approval Queue
Requested by showing Unknown
•	Approval Details 
•	Requested By Unknown
•	Information Technology
Request Date (Blank)
Invalid Date (Blank)
Invalid Date (Blank)


3.	Tender Description
•	There is no attachment view option here, if any document uploaded in creation time it should appear here for review.

4.	Publish
•	There is no option to select to which companies i can select to send invitation, if this is private then should have option to select vendor.
•	How a publication of tender notice will go to all companies


5.	Clarification
•	In clarification there should be option to add additional document, which should be available to a vendor who requested question.
•	Print & Export options no response.
•	on the right side bar there are 3 icons, Tender Detail(works), Timeline(this doesn’t work), Refresh(works)

6.	Technical evaluation
•	Question, who is suppose to do technical evaluation, do we need to and how he will be notified that technical are available. 
•	Fail / Pass is over lapping with Save Evalu (UI needs to be corrected)
•	View Full proposal doesn’t respond anything, vendor uploaded technical document should appear but its not.

7.	Committee and commercial
•	Technically Qualified Vendors Commercial Envelopes not showing any documents.
•	Committee Attendance UI Committee Member PRESENT ABSENT going out of the alignment 



8.	Commercial Comparison
•	Commercial documents not available, not attached.
•	Recommendation based only on price and there is no other option if I want to select other vendor even if price is higher then the lowest. This should be based on technical comparison and commercial but in the end option will be for the committee to award to anyone they like to award so we need to allow to choose which vendor and with justification.



9.	User Permission.
•	Cant change anything after user is created, cant change department or password etc all of it , if i change anything after user is already crated i get error property authType should not exist https://ctmp-admin.hadiclinic.com.kw:4202/api/v1/users/f0fa7291-a253-49c1-9b0b-b6f34019c368 400 (Bad Request)
•	User permission needs to be double check for entire system, I assigned technical evaluator permission, user can view all menu in the side bar. this should be restricted to only users permission based on department level. He should only see tenders which department he belongs to etc. Permissions should be extremely tight and properly monitored and deployed accordingly, no mistake in this.

10-Vendor Portal
•	Dashboard, Active Bids, open tenders, in evaluation, awarded all should be clickable link to respective tenders.
•	Reset password link doesn’t work GET https://vn.hadiclinic.com.kw:4201/reset-password?token=6cf01f709866e5bf3d990d931a73462b603465863ca21591e6d42fee6af1a7c9 404 (Not Found)
•	Clarification questions only should appear for the vendor only who requested for it. Currently all clarification messages are in dashboard however private messages are not shown which is good. Better we need to keep this window per vendor each clarification show only if it is asked from the same vendor, other vendor clarification if not public should not show here.
•	Tender not accessible to vendor after close submission message should be something like  "tender submission is close" tender submission date is over etc.(note, Claude needs to add all relevant messages related to the that particular event)
•	Export comparison shows this error Unknown report code: commercial-comparison page-fe5394a1b0e44911.js:1 POST https://ctmp-admin.hadiclinic.com.kw:4202/api/v1/reports/commercial-comparison/export 404 (Not Found)


10.	Reports & Analytics
•	Not working any report
