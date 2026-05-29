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
| BUG-016 | High | Feature | Admin → Tender → Publish | Notification dispatch on publish — deferred; needs new notification templates + recipient enumeration (depends on existing notifications module) |
| BUG-017 | Medium | Feature | Admin → Clarifications | Attachments on questions + replies — deferred; needs new DB tables + storage service + UI |
| BUG-018 | Medium | Bug | Admin → Clarifications | Print shipped; Export disabled with tooltip ("Coming in next release — depends on Reports module renderer") |
| BUG-020 | — | Question | Admin → Technical Evaluation | Who is supposed to perform technical evaluation? How are they notified that envelopes are open? |
| BUG-028 | Critical | Feature | Admin RBAC enforcement | Part A (Sidebar gating) shipped 2026-05-27. Part B (tender list + detail dept-scoping) shipped 2026-05-29 — see Fixed table. Same dept-scoping pattern still TODO for clarifications / audit / reports / technical-evaluation / committee / commercial-comparison lists; tracked as BUG-051. |

### In progress
*(none)*

### Fixed

| ID | Sev | Type | Component | Fixed | Notes |
|---|---|---|---|---|---|
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
