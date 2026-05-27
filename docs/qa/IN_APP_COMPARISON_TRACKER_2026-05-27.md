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
| A.1 PDF viewer modal component (frontend) | `[ ]` | `apps/web-admin/src/components/viewer/PdfViewerModal.tsx` | Full-screen modal, ESC closes, no annotations |
| A.2 PDF viewer provider (frontend context) | `[ ]` | `apps/web-admin/src/components/viewer/PdfViewerProvider.tsx` | App-wide so any descendant can open |
| A.3 New view-stream API endpoint | `[ ]` | `apps/api/src/modules/bids/bids.controller.ts` | `GET /bids/:id/envelopes/:type/documents/:docId/view` |
| A.4 Audit logging on view | `[ ]` | `apps/api/src/modules/audit/audit.service.ts` + new `document_view_log` table | Failing-open NOT allowed |
| A.5 DB migration: `document_view_log` table | `[ ]` | `database/migrations/00X_document_view_log.sql` | See master plan §3.3 |
| A.6 RBAC entries: `viewer:pdf:open`, `viewer:pdf:download` | `[ ]` | `database/seeds/` | Defaults per master plan §I |
| A.7 Wire viewer into existing Technical Evaluation page (fixes retest D2) | `[ ]` | `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` | Replaces broken handler from BUG-022 |
| A.8 Vendor-portal upload enforcement: PDF only | `[ ]` | `apps/web-vendor/src/app/(portal)/bids/wizard/[tenderId]/...` + API DTO | Reject non-PDF at upload |
| A.9 Verification | `[ ]` | — | Open a PDF from each surface; confirm modal opens, ESC closes, audit row written, non-PDF upload rejected |

---

## Phase B — Technical Comparison page (BUG-036)

Read-only. No new write paths. Lower-risk to ship first among the comparison pages.

| Item | Status | Files | Notes |
|---|---|---|---|
| B.1 Page shell + route | `[ ]` | `apps/web-admin/src/app/(admin)/technical-comparison/page.tsx` + layout | New sidebar entry |
| B.2 Comparison API endpoint | `[ ]` | `apps/api/src/modules/comparison/comparison.controller.ts` | `GET /tenders/:id/comparison/technical` |
| B.3 Comparison service: aggregate scores per evaluator + consensus | `[ ]` | `apps/api/src/modules/comparison/comparison.service.ts` | Simple avg across evaluators |
| B.4 TechnicalMatrix component with switchable layout | `[ ]` | `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx` | Vendors-as-rows ↔ Criteria-as-rows |
| B.5 Cell expand-to-show-individual-evaluator-scores | `[ ]` | Inside TechnicalMatrix.tsx | Default collapsed (consensus only) |
| B.6 Per-vendor expandable card | `[ ]` | `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` | Criteria breakdown, gate badges, FAIL highlight |
| B.7 Sidebar nav entry | `[ ]` | `apps/web-admin/src/components/layout/Sidebar.tsx` | Visible only to roles with `comparison:technical:view` |
| B.8 RBAC entry: `comparison:technical:view` | `[ ]` | `database/seeds/` | Defaults per master plan §I |
| B.9 Verification | `[ ]` | — | All evaluator scores aggregate correctly; gates and weights respected; toggle works |

---

## Phase C — Commercial Comparison page redesign (BUG-035)

The biggest piece. Replaces the existing page **in place**.

| Item | Status | Files | Notes |
|---|---|---|---|
| C.1 Delete old page content, write new hybrid view | `[ ]` | `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` | In-place replacement |
| C.2 Comparison API endpoint | `[ ]` | `apps/api/src/modules/comparison/comparison.controller.ts` | `GET /tenders/:id/comparison/commercial` |
| C.3 Comparison service: tech score + commercial total + line items per vendor | `[ ]` | `apps/api/src/modules/comparison/comparison.service.ts` | Includes FAILed vendors with FAIL flag |
| C.4 CommercialMatrix component | `[ ]` | `apps/web-admin/src/components/comparison/CommercialMatrix.tsx` | Summary ↔ Itemized toggle |
| C.5 VendorComparisonCard with all 5 blocks | `[ ]` | `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` | line items, tech detail, docs, profile, recommend |
| C.6 Pre-select lowest PASS on load | `[ ]` | Inside CommercialMatrix.tsx | Visual highlight + AwardConfirmDialog default |
| C.7 FAIL vendors grayed-out + badge | `[ ]` | Inside CommercialMatrix.tsx | Still expandable for audit |
| C.8 Audit badge in header | `[ ]` | Inside page.tsx | Counts views; links to audit page |
| C.9 RBAC: `comparison:commercial:view` enforced server-side | `[ ]` | API guard | Only after commercial opening |
| C.10 Verification | `[ ]` | — | All blocks render; toggle works; pre-select correct; FAIL grayed |

---

## Phase D — Award flow + Quorum + Amendment (BUG-039, BUG-040, BUG-041)

Touches Committee Opening page and adds Recommend/Confirm/Amend endpoints.

| Item | Status | Files | Notes |
|---|---|---|---|
| D.1 "Proceed to Comparison" button on Committee Opening | `[ ]` | `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` | Hands off attendance |
| D.2 Attendance carry-over (URL param or shared state) | `[ ]` | committee-opening + commercial-comparison | Both pages read from same backing data |
| D.3 Quorum check endpoint | `[ ]` | `apps/api/src/modules/comparison/comparison.controller.ts` | `GET /tenders/:id/quorum` |
| D.4 QuorumStatus chip in header | `[ ]` | `apps/web-admin/src/components/comparison/QuorumStatus.tsx` | Shows disabled reason |
| D.5 AwardConfirmDialog component | `[ ]` | `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` | Recommend → justification (if override) → notification toggles → Confirm |
| D.6 Recommend endpoint | `[ ]` | `apps/api/src/modules/award/award.controller.ts` | `POST /tenders/:id/award/recommend` |
| D.7 Confirm endpoint | `[ ]` | Same controller | `POST /tenders/:id/award/confirm` → state Awarded |
| D.8 Amend endpoint + dialog | `[ ]` | Same controller + new dialog component | `POST /tenders/:id/award/amend` |
| D.9 DB migration: `awards`, `award_minutes`, committee quorum columns, criteria gate/weight | `[ ]` | `database/migrations/00X_award_workflow.sql` | See master plan §3.3 |
| D.10 RBAC entries: `comparison:commercial:recommend`, `comparison:commercial:confirm`, `award:amend` | `[ ]` | `database/seeds/` | Defaults per master plan §I |
| D.11 Verification | `[ ]` | — | Quorum gate works; lowest pre-select; override requires PDF; amendment supersedes |

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
