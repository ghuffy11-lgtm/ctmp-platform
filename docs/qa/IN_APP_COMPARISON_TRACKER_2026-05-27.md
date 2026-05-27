# In-App Comparison — Implementation Tracker

**Document type:** Living implementation tracker
**Created:** 2026-05-27
**Companion to:** `docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`

Update this file as work proceeds. Status legend:

- `[ ]` not started
- `[~]` in progress
- `[x]` completed (with date)
- `[!]` blocked (with reason)
- `[-]` deferred / superseded

---

## Execution order recap (from master plan section 6)

The new-feature work below is **Phase A onward**. It does NOT begin until **(P1) the 5 retest fails are closed** and **(P2) the 21 still-Open bugs are closed**. Both prerequisite blocks are tracked in `docs/qa/BUG_TRACKER_2026-05-25.md`.

---

## Phase A — Shared In-App PDF Viewer (BUG-037)

Lands first because retest item **D2** (View Full Proposal 401) immediately benefits, and Phases B & C depend on this component.

| Item | Status | Files | Notes |
|---|---|---|---|
| A.1 PDF viewer modal component (frontend) | `[x] 2026-05-27` | `apps/web-admin/src/components/viewer/PdfViewerModal.tsx` | Full-screen modal, ESC closes, no annotations |
| A.2 PDF viewer provider (frontend context) | `[x] 2026-05-27` | `apps/web-admin/src/components/viewer/PdfViewerProvider.tsx` | Mounted in `(admin)/layout.tsx`; `usePdfViewer()` hook; locks body scroll while open |
| A.3 New view-stream API endpoint | `[x] 2026-05-27` | `apps/api/src/modules/bids/bids.controller.ts` | `GET /bids/:id/envelopes/:type/documents/:docId/view`; guard = `OptionalVendorOrUserGuard`; Content-Disposition: inline; `X-Content-Type-Options: nosniff` |
| A.4 Audit logging on view | `[x] 2026-05-27` | `apps/api/src/modules/audit/audit.service.ts` + `document_view_log` table | Writes both `document_view_log` AND `audit_logs` chain BEFORE the stream returns. Vendor self-views skipped. |
| A.5 DB migration: `document_view_log` table | `[x] 2026-05-27` | `database/migrations/009_phase_a_pdf_viewer.sql` | Applied to staging: 1 CREATE TABLE + 3 CREATE INDEX. FK to `bid_documents` (v1 only opens bid PDFs). |
| A.6 RBAC entries: `viewer:pdf:open`, `viewer:pdf:download` | `[x] 2026-05-27` | `database/migrations/009_phase_a_pdf_viewer.sql` (folded into migration) | INSERT 0 2 + INSERT 0 10 grants. SYSTEM_ADMIN deliberately omitted (separation of duties). |
| A.7 Wire viewer into existing Technical Evaluation page (fixes retest D2) | `[x] 2026-05-27` | `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` | Pre-fetches PDF with bearer auth → blob URL → modal. Also fixed: list endpoint guard (was vendor-only → 401 for admins). |
| A.8 Vendor-portal upload enforcement: PDF only | `[x] 2026-05-27` | `apps/web-vendor/src/components/forms/FileDropZone.tsx` + `apps/api/src/modules/bids/bids.service.ts` | Client: mime + filename + `accept="application/pdf,.pdf"`. Server: mime + `%PDF-` magic bytes. |
| A.9 Verification | `[x] 2026-05-27` | — | All 6 markers verified live on staging (see HANDOVER 2026-05-27 afternoon entry). End-to-end click-through still pending owner. |

---

## Phase B — Technical Comparison page (BUG-036)

Read-only. No new write paths. Lower-risk to ship first among the comparison pages.

| Item | Status | Files | Notes |
|---|---|---|---|
| B.1 Page shell + route | `[x] 2026-05-27` | `apps/web-admin/src/app/(admin)/technical-comparison/page.tsx` | New route. Tender picker + summary header + matrix + cards. `Suspense` wrapper around `useSearchParams` to keep SSG happy. |
| B.2 Comparison API endpoint | `[x] 2026-05-27` | `apps/api/src/modules/comparison/comparison.controller.ts` | `GET /tenders/:id/comparison/technical` guarded by `JwtAuthGuard + PermissionsGuard` with `comparison:technical:view`. |
| B.3 Comparison service: aggregate scores per evaluator + consensus | `[x] 2026-05-27` | `apps/api/src/modules/comparison/comparison.service.ts` | Simple avg of `TechnicalEvaluation.overallScore` across evaluators. Per-criterion consensus = avg of `TechnicalEvaluationScore.score` matched by criterion name. Consensus result reads the official `bid.technicalResult`. |
| B.4 TechnicalMatrix component with switchable layout | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx` | Vendor-as-rows ↔ Criterion-as-rows toggle. Mandatory-gate criteria flagged with a shield icon. Sticky first column for horizontal scroll. |
| B.5 Cell expand-to-show-individual-evaluator-scores | `[x] 2026-05-27` | VendorTechnicalCard.tsx | Implemented via the per-vendor card's `<details>` rows: clicking a matrix cell selects the vendor + scrolls to its card, which has full per-evaluator breakdown. Cleaner UX than expanding inside cells. |
| B.6 Per-vendor expandable card | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` | Top row = consensus + result badge + total. Expanded: per-criterion consensus list + per-evaluator `<details>` blocks with their full score breakdown + notes. FAIL bids dim to 70%. |
| B.7 Sidebar nav entry | `[x] 2026-05-27` | `apps/web-admin/src/components/layout/Sidebar.tsx` | New nav entry between Technical Evaluation and Committee & Commercial. Gated on `comparison:technical:view`. |
| B.8 RBAC entry: `comparison:technical:view` | `[x] 2026-05-27` | `database/migrations/011_comparison_permissions.sql` | Migration also pre-seeds Phase C/D permissions (`comparison:commercial:view/recommend/confirm`) since they share the same RBAC matrix. SYSTEM_ADMIN omitted from all commercial-side grants (separation of duties). |
| B.9 Verification | `[x] 2026-05-27` | — | All 5 verifications passed: endpoint registered (`ComparisonController` in boot log + 401 on no-auth), audit chain 217 rows OK, frontend chunk contains "Technical Comparison Matrix", sidebar layout chunk contains `comparison:technical:view`. End-to-end click-through pending owner. |

---

## Phase C — Commercial Comparison page redesign (BUG-035)

The biggest piece. Replaces the existing page **in place**.

| Item | Status | Files | Notes |
|---|---|---|---|
| C.1 Delete old page content, write new hybrid view | `[x] 2026-05-27` | `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` | In-place replacement. Tender picker (Committee Commercial Opening+), summary header, matrix on top, vendor cards below. Suspense wrapper around `useSearchParams`. |
| C.2 Comparison API endpoint | `[x] 2026-05-27` | `apps/api/src/modules/comparison/comparison.controller.ts` | `GET /tenders/:id/comparison/commercial` gated by `comparison:commercial:view`. Returns 401 on no-auth (verified). |
| C.3 Comparison service: tech score + commercial total + line items per vendor | `[x] 2026-05-27` | `apps/api/src/modules/comparison/comparison.service.ts` | Aggregates technical avg + commercial total + envelope status + commercial docs + vendor profile + evaluator comments. Pre-computes `lowestPassBidId`. BOQ line items deferred to Phase F per the data model. |
| C.4 CommercialMatrix component | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/CommercialMatrix.tsx` | Summary ↔ Itemized toggle. Itemized renders a Phase-F placeholder (BOQ template doesn't exist yet). Sorts: lowest-PASS first, then PASS ascending price, then FAIL/PENDING. |
| C.5 VendorComparisonCard with all 5 blocks | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` | Block 1 line items (Phase F placeholder showing total) · Block 2 tech detail with link to Technical Comparison · Block 3 commercial docs (reuses `<CommercialDocumentsList>` + PDF viewer) · Block 4 vendor profile snapshot · Block 5 Recommend button (PASS only). |
| C.6 Pre-select lowest PASS on load | `[x] 2026-05-27` | CommercialMatrix.tsx + page.tsx | Server returns `lowestPassBidId`; matrix row highlighted with success border + Award icon + "Lowest PASS" badge; corresponding card auto-expands. |
| C.7 FAIL vendors grayed-out + badge | `[x] 2026-05-27` | CommercialMatrix.tsx + VendorComparisonCard.tsx | Matrix row at 60% opacity, FAIL pill, still expandable. Card disables Recommend with explicit "cannot be awarded" notice. |
| C.8 Audit badge in header | `[x] 2026-05-27` | Inside page.tsx | "N views logged" pill in tender header. Server counts `BID_DOCUMENT_VIEWED` + `COMMERCIAL_COMPARISON_VIEWED` audit events. Click → `/audit-log?tenderId=…`. |
| C.9 RBAC: `comparison:commercial:view` enforced server-side | `[x] 2026-05-27` | Controller `@RequirePermissions('comparison:commercial:view')` + service-level envelope check | Permission was pre-seeded in migration 011. Service also returns 403 if NO commercial envelope has been opened yet (status-based gate per spec). |
| C.10 Verification | `[x] 2026-05-27` | — | Verified live: comparison/commercial route mapped in boot log, 401 on no-auth, audit chain 217 rows OK, frontend chunk contains "Lowest PASS" + `CommercialMatrix`. Recommendation flow uses existing `/award-recommendation` endpoint as stop-gap until Phase D's `AwardConfirmDialog` replaces it. |

---

## Phase D — Award flow + Quorum + Amendment (BUG-039, BUG-040, BUG-041)

Touches Committee Opening page and adds Recommend/Confirm/Amend endpoints.

| Item | Status | Files | Notes |
|---|---|---|---|
| D.1 "Proceed to Comparison" button on Committee Opening | `[-] deferred 2026-05-27` | `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` | UX shortcut only — sidebar already exposes /commercial-comparison. Recommend adding when committee-opening gets its own redesign pass. |
| D.2 Attendance carry-over (URL param or shared state) | `[-] deferred 2026-05-27` | committee-opening + commercial-comparison | Quorum check on the comparison page reads the latest CommitteeSession's attendance directly from the DB, so no UI hand-off is required for correctness. URL/shared-state hand-off would be UX polish. |
| D.3 Quorum check endpoint | `[x] 2026-05-27` | `apps/api/src/modules/award/award.controller.ts` | `GET /tenders/:id/quorum` — lives on AwardController (kept Comparison module read-only). Returns `{ sessionId, hasQuorum, reason, requiredCount, presentCount, totalMembers, chairPresent, requiredRoleCode, requiredRolePresent }`. Computes from latest CommitteeSession + attendance + isChair flag. |
| D.4 QuorumStatus chip in header | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/QuorumStatus.tsx` | Renders quorum-met (success) or quorum-not-met (amber) with the reason from the server. Mounted in Commercial Comparison page header. |
| D.5 AwardConfirmDialog component | `[x] 2026-05-27` | `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` | Vendor recap + lowest-PASS short-circuit (zero text/PDF) vs override path (text ≥100 chars + PDF upload required). Notification toggles default OFF. Confirm disabled when quorum not met. ESC closes (unless mid-action). |
| D.6 Recommend endpoint | `[-] superseded 2026-05-27` | — | Master plan F5 collapses the old Recommend→Approve→Confirm chain into a single Confirm. Phase D doesn't introduce a separate Recommend endpoint — the AwardConfirmDialog hits `POST /award/confirm` directly. Legacy `POST /award-recommendation` kept for backwards compat. |
| D.7 Confirm endpoint | `[x] 2026-05-27` | `apps/api/src/modules/award/award.controller.ts` | `POST /tenders/:id/award/confirm` gated by `comparison:commercial:confirm`. Quorum check + server-side lowest-PASS recompute (client can't lie about isLowest) + commercial-envelope-opened check. Atomic Prisma transaction creates Award row + flips tender to Awarded + winning bid to AWARDED. Notification opt-ins persisted on the row for Phase E to act on. |
| D.8 Amend endpoint + dialog | `[x] 2026-05-27` | `apps/api/src/modules/award/award.controller.ts` + `apps/web-admin/src/components/comparison/AmendAwardDialog.tsx` | `POST /tenders/:id/award/amend` gated by `award:amend`. Always requires text + PDF. Transaction: new Award row + supersedes prior via `superseded_by_award_id`, flips awardedVendorId + winning bid to AWARDED, demotes prior winning bid back to SUBMITTED. Dialog wired to `/tenders/[id]` "Amend Award" button (Awarded status only). |
| D.9 DB migration: `awards`, `award_minutes`, committee quorum columns | `[x] 2026-05-27` | `database/migrations/012_phase_d_award_workflow.sql` | Applied to staging: 2 CREATE TABLE + 3 CREATE INDEX + ALTER committee_sessions (quorum cols) + 1 new permission + 1 grant. CHECK constraint enforces master plan F1/F2/F3 at the schema level (override needs text + PDF). |
| D.10 RBAC entries | `[x] 2026-05-27` | Migration 011 (recommend/confirm) + migration 012 (amend) | `comparison:commercial:recommend` + `comparison:commercial:confirm` pre-seeded in 011; `award:amend` added in 012 (PROCUREMENT_ADMIN only for v1; two-person rule with SYSTEM_ADMIN deferred). |
| D.11 Verification | `[x] 2026-05-27` | — | All 7 new routes mapped in boot log (`award/justification-document`, `award/confirm`, `award/amend`, `quorum`, `awards` + legacy 3 kept). All POST endpoints return 401 on no-auth. Audit chain 217 rows OK. Frontend chunks contain AwardConfirmDialog + AmendAwardDialog markers. End-to-end click-through pending owner. |

---

## Phase E — Award Minutes PDF + Optional vendor notifications (BUG-038, BUG-042)

| Item | Status | Files | Notes |
|---|---|---|---|
| E.1 PDF generation service | `[ ]` | `apps/api/src/modules/award/award-minutes.service.ts` | Decide library (pdfkit vs puppeteer) at build time |
| E.2 PDF generation endpoint | `[ ]` | `apps/api/src/modules/award/award.controller.ts` | `GET /tenders/:id/award/minutes.pdf` |
| E.3 "Generate Award Minutes" button on awarded tender page | `[ ]` | `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` | On-demand only, no auto |
| E.4 Notification service triggers | `[ ]` | `apps/api/src/modules/notifications/notifications.service.ts` | notifyAwardWinner, notifyAwardLoser |
| E.5 Manual re-trigger endpoint | `[ ]` | `apps/api/src/modules/award/award.controller.ts` | `POST /tenders/:id/award/notify` |
| E.6 Vendor portal: "You have been awarded" / "Awarded to another vendor" status display | `[ ]` | `apps/web-vendor/src/app/(portal)/bids/[bidId]/page.tsx` | Per Q16B optional notifications |
| E.7 DB: `award_minutes` table (links awards → generated PDF docs) | `[ ]` | Same migration as D.9 | sha256 stored |
| E.8 Verification | `[ ]` | — | PDF generates with all required sections; notifications fire only when opted in |

---

## Phase F — Criteria library + per-tender customisation (BUG-043, BUG-044)

Needed for C1 (hybrid criteria source) to fully work.

| Item | Status | Files | Notes |
|---|---|---|---|
| F.1 Library admin page | `[ ]` | `apps/web-admin/src/app/(admin)/settings/evaluation-criteria/page.tsx` | CRUD for library entries |
| F.2 Library API endpoints | `[ ]` | `apps/api/src/modules/evaluation-criteria/` (extend or create) | CRUD endpoints |
| F.3 Per-tender criteria editor (during tender create/edit before Publish) | `[ ]` | `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` or new sub-page | Add/remove/rename criteria; mark gate flag; set weights |
| F.4 Validation: weights sum to 100% | `[ ]` | Frontend + backend DTO validator | Error if not exactly 100 |
| F.5 DB migration: `evaluation_criteria_library` table + gate/weight columns | `[ ]` | Same migration as D.9 | See master plan §3.3 |
| F.6 Verification | `[ ]` | — | Library entries appear as defaults; per-tender customisation persists; gate-only PASS/FAIL works end-to-end |

---

## Phase G — Cleanup (BUG-045)

Only after Phase C is verified live and stable.

| Item | Status | Files | Notes |
|---|---|---|---|
| G.1 Remove `commercial_comparison` report code from Reports module | `[ ]` | `apps/api/src/modules/reports/reports.service.ts` + report-renderers | Removes the XLSX export shipped in BUG-033 |
| G.2 Remove the report card from Reports & Analytics page | `[ ]` | `apps/web-admin/src/app/(admin)/reports/page.tsx` | Card disappears from UI |
| G.3 Tracker doc: confirm in BUG_TRACKER that BUG-033 fix has been superseded | `[ ]` | `docs/qa/BUG_TRACKER_2026-05-25.md` | Add note under BUG-033 |
| G.4 Decision log entry confirming completion | `[ ]` | `docs/decisions/DECISION_LOG.md` | Closes the in-app pivot loop |
| G.5 Verification | `[ ]` | — | Reports module still works for other reports; old XLSX endpoint returns 404 or removed code path |

---

## Cross-phase: documentation updates after each phase

Each completed phase must update:
- `agents/handoffs/HANDOVER.md` — append new top entry with date, files changed, what shipped, verification
- `agents/backlog/MASTER_TASK_TRACKER.md` — tick off the corresponding BUG-NNN entry
- `docs/qa/BUG_TRACKER_2026-05-25.md` — move BUG entry from Open → Fixed with verification line
- This file (`IN_APP_COMPARISON_TRACKER_2026-05-27.md`) — flip status markers from `[ ]` → `[x]`

---

## Stop-and-ask conditions

A future agent **must stop and ask the project owner** if any of the following:

1. A locked decision in `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md` would need to change to proceed.
2. A flowchart diagram in `IN_APP_COMPARISON_FLOWCHART_2026-05-27.md` would need to change to proceed.
3. The execution order (P1 → P2 → A → B → C → D → E → F → G) needs to be reshuffled.
4. A new state has to be added to the tender lifecycle that wasn't in the spec.
5. A permission default in master plan §I needs to change before going live.
6. The PDF viewer needs to support non-PDF file types (E1 decision says no).
7. The award flow needs split-winner support (F4 says single only).
8. Vendor notifications need to become default-on (F6 says default OFF).

For anything else (file names, function signatures, library choices, internal refactors), proceed and document in the handover.
