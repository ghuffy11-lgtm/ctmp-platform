# Owner Walkthrough Tracker — 2026-05-29

Captured during the owner's procurement walkthrough. Each row is an observation; the owner will mark status as items are addressed. When an item is locked into a fix plan it will be promoted to a `BUG-NNN` entry in `BUG_TRACKER_2026-05-25.md` with the agreed approach. Until then this is the working punch list.

**Status legend:** 🔴 Open · 🟡 In Progress · ✅ Fixed · 🔵 Confirmation only (no action)

---

## 🟢 Ready for owner verification — 2026-05-30

**All captured items are at terminal status (✅ Fixed or 🔵 Confirmation-only) except the two Theme 3 entries explicitly held by owner directive (WALK-053, WALK-055).** Code is deployed to staging — the local `develop` branch is 15 commits ahead of `origin/develop` and push is held pending owner sign-off.

**How to test:** Re-login as each role (token_version was bumped by migrations 015/016/017/018/019 — old JWTs will lack new perms). For each ✅ item below, open the relevant surface on staging and confirm the described behaviour. Add a follow-up row in **section N** (Regression captured post-Theme J) for anything that needs a return trip.

**Staging URLs:** Admin `https://ctmp-admin.hadiclinic.com.kw:4202` · Vendor `https://vn.hadiclinic.com.kw:4201`. Cast credentials per the walkthrough setup entry in `HANDOVER.md` (shared password `Walkthrough@2026!`, admin uses `Admin@12345!`).

**Cross-reference table for fast lookup of what shipped where:**

| Theme | BUG | WALK items closed |
|---|---|---|
| K (truncated recovery) | docs only | WALK-027 + WALK-028 inferred bodies recorded |
| D — Tender detail tabs | BUG-056 | WALK-009/010/011/013/014/015/020/021/022 |
| F — Tech Eval polish | BUG-057 | WALK-024/025/026/027/028 |
| A — Dashboard gating | BUG-058 | WALK-002/003/G1 |
| B — Approval Queue | BUG-059 | WALK-004/005/006 |
| C — Tender Create cue | BUG-060 | WALK-007 |
| G — Tech Comparison polish | BUG-061 | WALK-029/030/031/032/033/034 |
| I — Committee Opening | BUG-062 | WALK-036/037/040/041/042/043 |
| E — Vendor portal | BUG-063 | WALK-016/017/018 |
| H — Admin role mgmt | BUG-064 | WALK-035/039 |
| J — Filter/search | BUG-065 | WALK-056 |
| Hot patch | BUG-066 | WALK-057 (Bids tile regression) |
| Already-shipped pre-walkthrough | BUG-046 (hydration) + BUG-037 (PDF viewer) | WALK-049 (confirmation) + WALK-024 (verified already in place) |

**User accounts in the walkthrough** (shared password `Walkthrough@2026!`):

- `officer@ctmp.local` — PROCUREMENT_OFFICER
- `engineer@ctmp.local` — TECHNICAL_EVALUATOR (owner manually changed from APPROVER on 2026-05-29 — see role note at section G)
- `manager@ctmp.local` — PROCUREMENT_ADMIN
- `finance@ctmp.local` — COMMERCIAL_COMMITTEE_MEMBER + COMMERCIAL_EVALUATOR
- `committee@ctmp.local` — COMMERCIAL_COMMITTEE_MEMBER
- `vendor1/2/3@vendor.test` — vendor primary contacts

---

## A. Engineer — Dashboard

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-001 | Engineer's tender list shows only their department | Confirmation of BUG-050 | ✅ | Working as designed |
| WALK-002 | Dashboard still shows "Quick Actions" panel for engineer — should be removed | UI gating gap | ✅ | Fixed 2026-05-30 (BUG-058) — see WALK-G1 |
| WALK-003 | Engineer should only **view** the Dashboard (no actionable widgets) | UI gating gap | ✅ | Fixed 2026-05-30 (BUG-058) — see WALK-G1 |

## B. General UI principle (applies everywhere)

| ID | Principle | Status | Resolution / notes |
|---|---|---|---|
| WALK-G1 | "Quick Actions" cards on every dashboard must be **permission-gated per card**. If a user has zero matching perms, the whole Quick Actions section is hidden. Applies to engineer, finance, committee, auditor, all users. | ✅ | Fixed 2026-05-30 (BUG-058). `/dashboard` Quick Actions now gates each card by perm (Create New Tender → `tender:create`; Review Approvals → `tender:approve` OR `award:approve`; Vendor Database → `vendor:view`) using the mounted-token hydration pattern (BUG-046). Whole panel renders only when at least one card qualifies. Verified across 4 roles: admin (3/3 cards), manager (3/3), officer (2/3 — no Approvals), engineer (panel hidden — 0 perms). Same principle propagates to any future dashboard variants as they ship. |

## C. Engineer — Approval Queue

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-004 | Tender description shows empty — should display what officer wrote in the Description field | Bug | ✅ | Fixed 2026-05-30 (BUG-059). The Approval Queue right pane was rendering `selectedTask.description` from the list endpoint, which returns the summary serialiser (no description). On task selection the page now fetches `GET /tenders/:id` via the detail endpoint and renders `detail.description` (falls back to summary description for safety, then to italic placeholder when truly empty). Includes `whitespace-pre-wrap` so multi-paragraph descriptions render correctly. |
| WALK-005 | Uploaded tender documents have no one-click "View" — currently forces a download. Engineer needs to view the PDF in the in-app viewer modal | Bug / UX | ✅ | Fixed 2026-05-30 (BUG-059). Documents block now lists items from the freshly-fetched detail and renders two action buttons per row: **View** (only for PDFs — opens the document in the shared `PdfViewerModal` via `usePdfViewer`, using the same blob+Authorization pattern as Technical Evaluation's View Full Proposal) and **Download** (existing behaviour preserved). |
| WALK-006 | Edit button visible on tender card — must be hidden from engineer (no `tender:edit` on their role) | UI gating gap | ✅ | Confirmed 2026-05-30 — no Edit button exists on Approval Queue rows (only Review and View). Edit action on the tender detail page itself is already gated by `perms.edit` (`tender:edit` perm) from BUG-050. No additional change required. |

## D. Officer — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-007 | Tender Create page (`/tenders/new`) should include the Technical Evaluation Criteria editor — currently officer must save first then go to edit to access it | UX / feature gap | ✅ | Fixed 2026-05-30 (BUG-060). Post-create now routes to `/tenders/:id/edit?from=create` instead of `/tenders/:id`. The edit page hosts `<TenderCriteriaEditor>` (BUG-044) and now shows a blue cue banner ("Tender created — next: set the Technical Evaluation Criteria") when the `?from=create` flag is present. Officer flow becomes: fill Create form → click Save → arrive on edit with banner highlighting criteria as the next step → set weights/criteria → Save → navigate to detail. The editor stays available indefinitely for revisions until Submit-for-Approval. Mounting the editor literally inside Create was rejected because the editor requires an existing tender id for its PUT — the redirect approach reuses BUG-044 with zero refactor. |
| WALK-008 | Overview tab — Est. Budget showed `$` instead of KWD | Bug | ✅ | Fixed 2026-05-31 (BUG-067). `tenders/[id]/page.tsx` formatter switched from `en-US`+`USD` to `en-GB`+`KWD`. |
| WALK-009 | Clarifications tab — engineer needs inline reply in the tender (not a navigation away to /clarifications) | Bug | ✅ | Fixed 2026-05-31 (BUG-067). New `ClarificationReplyForm` subcomponent embedded per thread in `ClarificationsTabPanel`, gated on `clarification:reply` perm, with public/private visibility toggle. POSTs to existing `/clarifications/:id/reply`. |
| WALK-010 | Bids tab — not working | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |
| WALK-011 | Audit Trail tab — not working | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |

## E. Manager — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-012 | Overview tab — Est. Budget showed `$` instead of KWD (same as WALK-008) | Bug | ✅ | Fixed 2026-05-31 (BUG-067) — see WALK-008 |
| WALK-013 | Clarifications tab — same inline-reply gap as WALK-009 | Bug | ✅ | Fixed 2026-05-31 (BUG-067) — see WALK-009 |
| WALK-014 | Bids tab — same issue as WALK-010 | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |
| WALK-015 | Audit Trail tab — same issue as WALK-011 | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |

## F. Vendor portal — Tender detail

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-016 | Download Tender document is not working — vendor got 401 | Bug | ✅ | Fixed 2026-05-31 (BUG-067). Tender doc endpoint was admin-only (`tender:view` perm); vendor JWT 401'd. Endpoint now uses `@Public() + @UseGuards(OptionalVendorOrUserGuard)`; `streamDocument` runs `findOne(tenderId, user)` first for unified access (BUG-015 vendor visibility OR BUG-050/062 internal dept-scope). Audit log split — vendor caller → `actorVendorUserId`. Also fixed `/data/tender-documents` missing docker volume mount (uploaded files were wiped on every container recreate). Verified vendor download → HTTP 200. |
| WALK-017 | Need a "View" option that opens the document — vendor got 401 | Bug / UX | ✅ | Fixed 2026-05-31 (BUG-067) — same root causes as WALK-016. View button uses the same endpoint via blob+`window.open`. |
| WALK-018 | Clarifications should live **inside the tender detail page**, not as a separate top-level menu. Vendor should view tender info + click clarification for the same tender they're on. | Feature / restructure | ✅ | Fixed 2026-05-30 (BUG-063). New `ClarificationsSection` component embedded directly in the tender detail page (under the documents block). Lists existing clarifications (with public/private chip per reply) and offers an inline "Ask a question" textarea + Send button when the tender is in `Published` or `Clarification Period`. The standalone `/clarifications` nav menu remains for cross-tender browsing — owner can deprecate it later if desired. |

## G. Engineer — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-019 | Overview tab — Est. Budget showed `$` instead of KWD (same as WALK-008) | Bug | ✅ | Fixed 2026-05-31 (BUG-067) — see WALK-008 |
| WALK-020 | Clarifications tab — same inline-reply gap as WALK-009 | Bug | ✅ | Fixed 2026-05-31 (BUG-067) — see WALK-009 |
| WALK-021 | Bids tab — same issue as WALK-010 | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |
| WALK-022 | Audit Trail tab — same issue as WALK-011 | Bug | ✅ | Fixed 2026-05-30 (BUG-056) — see notes below |
| WALK-023 | Technical Comparison option missing for engineer. Cause: engineer had APPROVER role only (not TECHNICAL_EVALUATOR). Owner requested both roles stacked. | Role config | ✅ | Fixed 2026-05-31 (BUG-067). Re-added APPROVER to engineer@ via SQL `INSERT INTO user_roles ... ON CONFLICT DO NOTHING` + token_version bump. Engineer now has TECHNICAL_EVALUATOR + APPROVER (matches what the seed script always intended; DB had drifted after the 2026-05-29 manual swap). |

### Role-change note (user-initiated, 2026-05-29)

Owner manually changed `engineer@ctmp.local`'s role from **APPROVER → TECHNICAL_EVALUATOR**. **Implication:** engineer no longer has `tender:approve`, so the "Approve tender during Internal Review" workflow step now needs a different user. Manager (PROCUREMENT_ADMIN) gained `tender:approve` as part of BUG-050 and can cover this step. To capture when we plan: either (a) accept manager-as-approver going forward, or (b) re-stack APPROVER on engineer alongside TECHNICAL_EVALUATOR. Owner decision pending.

## H. Engineer — Technical Evaluation (scoring)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-024 | "View Full Proposal" button should open the proposal in a separate window (in-app PDF viewer modal) | UX | ✅ | Already shipped (BUG-037 Phase A `openPdfViewer({src,title,onClose})`); verified 2026-05-30 by re-reading the handler. The button already uses the modal viewer (line 297 of the page). No code change needed. |
| WALK-025 | When overall score is ≥ 70, the Pass toggle should auto-flip to Pass | UX | ✅ | Fixed 2026-05-30 (BUG-057). New `useEffect` watches `totalScore / maxTotal` and auto-flips `recommendation` to PASS once the ratio crosses ≥70. Stops auto-flipping once the evaluator has manually clicked either toggle (`recommendationDirty` flag). |
| WALK-026 | After saving evaluation: bid shows correctly as PASS in "Submitted Bids" list, but reopening the same tender shows **no score, no evaluator notes** in the scorecard. Engineer must be able to review their saved scorecard before finalizing. | Critical bug | ✅ | Fixed 2026-05-30 (BUG-057). Backend `findAll` now joins `TechnicalEvaluationScore[]` and surfaces `comments` + `criterionScores` + `evaluatorName` + `finalizedAt`. Frontend hydration `useEffect` (was reset-only) now looks up the caller's own evaluation by `(bidId, evaluatorUserId == currentUserId)`, maps saved per-criterion scores back into the form template by criterion name, restores recommendation + notes (strips the duplicated "Recommendation: …" prefix). Verified: backend returns 2 hydrated rows for TDR-2026-0013 with evaluatorName, result, score, 4 criterionScores, and comments populated. |
| WALK-027 | **After finalizing the technical evaluation, the page should switch to a clear "Finalised" view, not just hide the Finalize button.** Recovered 2026-05-30 by Claude as a relevant inference (original chat note was truncated). | UX gap (likely) | ✅ | Fixed 2026-05-30 (BUG-057). New `FinalisedSummaryBanner` component renders at the top of the scorecard column when `tender.status` is past Technical Evaluation. Green-banded card with Lock icon + latest finalizedAt timestamp + per-vendor PASS/FAIL outcome row (pass/fail evaluator counts + final result by majority). Slate footer notes scorecards below are reference-only and links the reader mentally to Technical Comparison for the matrix view. |
| WALK-028 | **When the engineer completes evaluation for a vendor, the bid card in the tender's vendor list should visually indicate "Evaluated" so the engineer can see at a glance what's done vs. pending.** Recovered 2026-05-30 by Claude as a relevant inference (original chat note was truncated). | UX gap (likely) | ✅ | Fixed 2026-05-30 (BUG-057). Bid card pill block now always renders: when an evaluation exists for the (evaluator, bid) pair, shows green "Evaluated" + PASS/FAIL + score/maxTotal; otherwise shows amber "Pending". Engineer can see at a glance which vendors still need scoring. |

## I. Technical Comparison page

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-029 | Per-vendor detail: **remove** the "Consensus per criterion" block entirely | Spec change | ✅ | Fixed 2026-05-30 (BUG-061). Block deleted from `VendorTechnicalCard`. The Technical Matrix above the per-vendor cards already shows the same data. |
| WALK-030 | Per-vendor detail: in "Evaluator Breakdown" block, keep only **Notes** and **Recommendation**; drop the per-criterion scores | Spec change | ✅ | Fixed 2026-05-30 (BUG-061). Evaluator breakdown now renders only the recommendation (PASS/FAIL pill), overall score (in absolute units — see WALK-032), and Notes (with explicit "No notes recorded" fallback). Per-criterion `<ul>` removed. |
| WALK-031 | Per-vendor detail: **add** a one-click link to the vendor's submitted technical proposal PDF (opens in in-app PDF viewer) | New feature | ✅ | Fixed 2026-05-30 (BUG-061). On card expand, fetches `/bids/:bidId/envelopes/TECHNICAL/documents` and renders each document with a **View** button that opens the file in the shared `PdfViewerModal` via `usePdfViewer` (blob+Authorization pattern). Matches owner's locked answer (Q2) — link to ALL technical envelope documents, each opens in the viewer. |
| WALK-032 | Score display shows values like `83.3 / 30` where the number exceeds the max — formatting/calculation is wrong | Bug | ✅ | Fixed 2026-05-30 (BUG-061). Root cause: backend stores scores normalised to 0–100 (percentage), but the display passed them through `fmtScore(score, max)` as if they were absolute units. New `toAbsolute(normalised, max)` helper scales the value back: `(normalised / 100) * max`. Applied to (a) per-vendor card header consensus score against `totalMaxScore`, (b) per-evaluator overall score against `totalMaxScore`, (c) Technical Matrix cells against `c.maxScore`, (d) Technical Matrix Total column against `totalMaxScore`. |
| WALK-033 | Remove "Score evaluations" — no use for it | Spec change | ✅ | Fixed 2026-05-30 (BUG-061). The "Score evaluations" link in the tender-header card was removed; evaluators reach scoring via the sidebar. |
| WALK-034 | Technical comparison matrix values are not correct (root cause likely tied to WALK-032 and the unresolved per-criterion persistence gap from BUG-047) | Critical bug | ✅ | Fixed 2026-05-30 (BUG-061). Same root cause as WALK-032 — cells displayed normalised 0–100 values as if they were absolute. `toAbsolute(score, c.maxScore)` applied in both vendor-as-rows and criterion-as-rows modes. Per-criterion persistence is fine post-BUG-047 + BUG-057. |

## K. Manager — Committee & Commercial Opening

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-036 | After selecting a tender on the Committee Opening page, the right pane renders headers (Committee Attendance, Technically Qualified Vendors, Print Agenda button) but everything is blank | Bug | ✅ | Fixed 2026-05-30 (BUG-062). Wrapped the heavy grid (Committee Attendance + remarks + Technically Qualified Vendors) in `{session && (...)}` so it's hidden when no session exists. The missing-session warning + Create Session form remain the only meaningful UI in the empty state, which is what owner expected. |
| WALK-037 | Print Agenda button does not work | Bug | ✅ | Fixed 2026-05-30 (BUG-062). Wired `onClick={() => window.print()}` to the button. Browser's print dialog reuses the existing `@media print` rules from BUG-018 (hides sidebar/nav). |
| WALK-038 | **Blocker** — When manager clicks "Schedule Committee Session", the Committee Members picker shows **no users at all** to select from. Manager cannot create a session because they can't pick the required ≥2 members. Likely cause: GET `/users?pageSize=100` returns 403 for manager (PROCUREMENT_ADMIN role does not have `users:list` / `users:read`) and the frontend silently catches the error → empty list. | Critical bug | ✅ | Resolved 2026-05-29 — granted `users:list` + `users:read` to PROCUREMENT_ADMIN (codified in seed, commit `61f04fe`). Owner re-logged in as manager → picker now populates. |
| WALK-040 | When manager schedules a committee session and selects members, the system **does not send any automated email** to the selected members about agenda + meeting timing. | New feature | ✅ | Fixed 2026-05-30 (BUG-062). Migration 019 seeds the `COMMITTEE_SESSION_INVITATION` notification template (subject + body with `{{recipientName}}`/`{{tenderReference}}`/`{{tenderTitle}}`/`{{scheduledAt}}`/`{{location}}`/`{{requiredQuorumCount}}`/`{{requiredRoleCode}}` placeholders). `CommitteeModule` now imports `NotificationsModule`; `CommitteeService.createSession` fans out invitation emails to every member via `NotificationsService.sendEmail` (best-effort — failures logged but session creation does not roll back, matching the dispatchAwardNotifications pattern). MailHog on staging captures the dispatches. |
| WALK-041 | **Critical gap in BUG-050 dept-scoping** — committee members and commercial evaluators are **cross-department by nature** — a finance person on a committee for a tender outside their home department must still see it. | Critical bug | ✅ | Fixed 2026-05-30 (BUG-062). `TendersService.findAll` dept filter changed from a single `where.departmentId = { in: depts }` to an `OR` of (departmentId in user's depts) + (committee_session has user as member) + (commercial_evaluation exists for user on this tender). `findOne` extends the same logic: if dept check fails, check committee/evaluator membership before throwing NotFound. SYSTEM_ADMIN/AUDITOR/PROCUREMENT_ADMIN bypass via `system:view_all_departments` unchanged. |
| WALK-042 | **Manager hit 403 after clicking "Open Commercial Envelopes"** even though the server-side action succeeded. | Bug / UX | ✅ | Fixed 2026-05-30 (BUG-062). After `open-commercial-envelopes` succeeds, the page now shows a green success banner ("Envelopes opened — N envelope(s) unsealed. Hand-off to finance + committee for evaluation. Open in Commercial Comparison →") instead of bubbling the post-open 403 as if the open failed. Follow-up fetches that legitimately 403 (manager lacks `commercial:view` per separation of duties) are caught and swallowed because the operation already succeeded server-side. |
| WALK-043 | **Tender disappears from Committee & Commercial Opening page after envelopes are opened.** | Bug / UX | ✅ | Fixed 2026-05-30 (BUG-062). `COMMITTEE_STATUSES` extended to include `Commercial Evaluation / Comparison` so opened tenders stay visible. The list-item status pill renders a slate "Opened — handed off" label for those rows (vs. amber for actionable ones) so the user can see progress instead of feeling the tender vanished. |

## J. Admin — Role management

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-035 | Admin (SYSTEM_ADMIN) must be able to **create new roles by themselves** AND edit grants on system roles. | New feature + bug | ✅ | Fixed 2026-05-31 (BUG-067). Both root causes were in the backend (BUG-064's frontend was built on top of stubs/blocks). (a) `RolesService.create` was a literal `throw new Error('Not implemented')`; implemented properly with input validation (uppercase code regex, unique check), audit log `ROLE_CREATED` at HIGH risk, `isSystem=false` for admin-created roles. (b) `RolesService.setPermissions` had `if (role.isSystem) throw new ForbiddenException(...)` blocking edits on every seeded role; removed — admin holding `roles:manage` can now edit any role's grants. `findAll` serializer also extended to include `code`. Verified: POST `/roles` with `{code:"WALKTHROUGH_TEST_ROLE",...}` → 200. PATCH TECHNICAL_EVALUATOR perms → 200. |
| WALK-039 | Admin cannot edit role-permission grants through the Settings UI — all the role/permission checkboxes are **disabled** for admin. | Critical bug | ✅ | Fixed 2026-05-30 (BUG-064). Root cause: per-checkbox `disabled={selectedRole.isSystem}` AND Save button `disabled={..|| selectedRole.isSystem}` blocked editing on every seeded role (all 8 baseline roles carry `isSystem=true`). Removed both. Admin can now edit grants on system roles too — they hold the `roles:manage` perm, and the backend already accepts the change. |

## L. Finance — Commercial Comparison (sidebar + perm chain)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-044 | **Commercial Comparison link missing from sidebar for finance@**. `apps/web-admin/src/components/layout/Sidebar.tsx:43` gates the `/commercial-comparison` nav entry on the legacy permission `commercial:view`. Finance (COMMERCIAL_COMMITTEE_MEMBER) holds the new permission `comparison:commercial:view`, NOT `commercial:view` — so the menu item never renders. The page itself accepts EITHER permission, so URL access still worked. | UI gating bug | ✅ | Fixed 2026-05-29 (BUG-052). Sidebar.tsx:43 switched to `anyPermission:['comparison:commercial:view','commercial:view']`. Re-login required to pick up new JWT. |
| WALK-045 | **Expanding a vendor card on Commercial Comparison errors with "commercial:view permission required" for finance@**. Root cause: `apps/api/src/modules/bids/bids.service.ts:391` gated `listEnvelopeDocuments` (commercial branch) on legacy `commercial:view` only. | Backend perm gate bug | ✅ | Fixed 2026-05-29 (BUG-052). bids.service.ts:391 now accepts either `commercial:view` OR `comparison:commercial:view`. Verified: finance@ GET `/bids/:id/envelopes/COMMERCIAL/documents` → 200 (was 403). |
| WALK-046 | **Commercial prices never entered → "Lowest PASS" auto-highlight never appears → Phase D Confirm flow cannot be tested.** No active user held COMMERCIAL_EVALUATOR (the role that owns `commercial:evaluate`); finance@ was supposed to be stacked with it per handover but DB showed only COMMERCIAL_COMMITTEE_MEMBER. | Upstream blocker for Phase D | ✅ | Fixed 2026-05-29 (BUG-052). Migration 015 grants `commercial:evaluate` to COMMERCIAL_COMMITTEE_MEMBER directly — finance@ can now enter prices via the commercial-evaluation page without needing the stacked role. Owner should walk into commercial-evaluation as finance@ and enter prices to populate `commercialTotal` and unlock lowest-PASS auto-highlight on the Commercial Comparison page. |
| WALK-047 | **Role drift: handover claims finance@ has `COMMERCIAL_COMMITTEE_MEMBER + COMMERCIAL_EVALUATOR`, DB shows only COMMERCIAL_COMMITTEE_MEMBER.** | Config drift | ✅ | Closed by WALK-046's fix. The COMMERCIAL_EVALUATOR stack is no longer required — all the perms finance needs are now on COMMERCIAL_COMMITTEE_MEMBER directly. Seed script intent preserved (the stack INSERT remains for future hires who only get the evaluator role). |
| WALK-048 | **COMMERCIAL_COMMITTEE_MEMBER role is functionally read-only on commercial surfaces.** Current grants gave finance@ only `comparison:commercial:view` + committee perms; missing `commercial:view/download/evaluate` and `comparison:commercial:recommend`. | Role config gap | ✅ | Fixed 2026-05-29 (BUG-052). Migration 015 added the four missing perms to COMMERCIAL_COMMITTEE_MEMBER. Confirm authority stays with PROCUREMENT_ADMIN per locked rule "Confirm is final. No higher-authority approval layer." |
| WALK-049 | **Owner believed "Phase D is not implemented".** Code verification: Phase D was shipped on develop; perceived absence was the cascade of WALK-044/045/046/048. | Confirmation only | ✅ | Closed by the WALK-044..048 fixes. Phase D AwardConfirmDialog + Recommend/Confirm endpoints are in place; the matrix lockdown unblocks the path to them. |

---

## M. Post-Confirm flow + lifecycle review gaps

Captured 2026-05-29 ~17:30 GMT+3 after owner successfully walked Phase D end-to-end on TDR-2026-0013 (manager@ entered prices via BUG-053, Recommend on lowest-PASS Vendor 1, AwardConfirmDialog, Confirm → tender Awarded, Award Minutes PDF generated). The Confirm path works; the surrounding flow needs refinement.

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-050 | **No in-place Award Summary after Confirm.** Owner expectation: after the Confirm button is pressed, the Commercial Comparison page should reload showing a clear "Awarded to [Vendor] — [Price] — Confirmed by [User] on [Date]" summary card at the top (or replacing the comparison cards), with the saved decision visible at a glance. Current behaviour: dialog closes, page re-fetches comparison data, the same comparison surface re-renders with the tender now in Awarded status — no celebratory/confirmatory block. Owner phrasing: "it should refresh page and show that awarded to this vendor like a summary and save automatically." | UX gap | ✅ | Fixed 2026-05-29 (BUG-054). Approach (a) selected: comparison endpoint extended with `award` block (latest non-superseded Award row + winner + price + confirmer + notify flags + minutes timestamp). New AwardSummaryCard renders at top when present; full comparison collapses into a "Full comparison (audit reference)" `<details>` expander. Minutes generation stays manual per owner direction. Verified end-to-end on TDR-2026-0013: award block returns full populated, non-Awarded tenders return null. |
| WALK-051 | **Awarded tenders disappear from active queues; no history/review surface.** Owner can drill into the tender detail page and see "status: Awarded" but cannot see the comparison context, the per-vendor prices, or the decision rationale from any list view. "if in future someone wants to review what happened in that tender there is no way to find." | UX gap / history feature missing | ✅ | Partial fix shipped 2026-05-29 (BUG-055). Commercial Comparison picker now groups options via `<optgroup>` into "Active" (Committee Commercial Opening, Commercial Evaluation, Award Recommendation) and "Completed (awarded / closed)" (Awarded, Tender Closed). Awarded tenders stay findable + visually separated from active queue. Committee Opening page uses a different UI pattern (button list filtered to opening-eligible statuses) and is handled via WALK-043 separately. Bigger global Tender Archive page deferred. |
| WALK-052 | **Workflow Progress widget shows Tender Closed below Awarded but does not enable.** After Confirm, the Workflow Progress shows the current stage as Awarded with Tender Closed as the next stage — but there is no button to mark Tender Closed. Question: is there a `POST /tenders/:id/close` endpoint and an action button somewhere, or does the spec leave Tender Closed as automatic on some condition (e.g., notification dispatch completed, retention period elapsed)? | Workflow gap | ✅ | Fixed 2026-05-29 (BUG-055). Backend had no closeTender transition (only closeSubmissions for the bid window). Migration 017 added `tender:close` perm + granted to PROCUREMENT_ADMIN + bumped token_version. New `POST /tenders/:id/close-tender` endpoint transitions AWARDED → TENDER_CLOSED with audit row (event `TENDER_CLOSED`). Tender detail page now shows a "Close Tender" button (Lock icon, gated on `tender:close`, visible only when status is Awarded). Verified end-to-end on TDR-2026-0013: manager@ closed it; DB confirms TENDER_CLOSED. |
| WALK-053 | **No unified Tender Summary view.** Owner wants a single page that tells the full story of a tender across the lifecycle: timeline of state transitions, vendors who bid, technical scores per vendor, commercial totals per vendor, who recommended whom, the final award decision, the minutes PDF link, attached clarifications, audit highlights. Currently this data lives spread across tender-detail / technical-comparison / commercial-comparison / clarifications / audit-log pages with no single rollup. | Feature gap | 🔴 | Approach: add a new "Summary" tab on the tender detail page (or a `/tenders/:id/summary` route). Aggregator endpoint `GET /tenders/:id/summary` returns the rollup data. Scope decision: ship a minimal "story" first (status transitions + vendor list with tech/commercial outcomes + award + minutes link), or wait for a full design pass? |
| WALK-054 | **Technical Evaluator loses access to a tender they evaluated after finalisation.** Owner: "once evaluation is completed tender disappeared from the technical evaluator, This is not right he should be able to revisit the evaluation just incase need some more information." Likely cause: the `/technical-evaluation` list filters tenders by an "evaluation pending" status set, removing tenders that have moved beyond Technical Evaluation. Evaluator should retain read-only access to their finalised work. | Access regression | ✅ | Fixed 2026-05-29 (BUG-055). `/technical-evaluation` list now fetches active statuses (Technical Opening, Technical Evaluation) AND past statuses (Commercial Sealed, Committee Commercial Opening, Commercial Evaluation, Award Recommendation, Awarded, Tender Closed). List renders two groups with a section header each: "Active" (amber status pill) and "Past evaluations (view only)" (slate status pill + "View only" chip, 75% opacity). When a past-status tender is selected, the Save Evaluation button is replaced by a "Technical evaluation finalised" notice, and the Finalize Technical Results action card is hidden. Inputs themselves remain readable for reference (no Save = no risk). |
| WALK-055 | **Overall flow has too many steps; owner wants Phase D simplification.** | UX simplification | ✅ | Partially closed 2026-05-31 (BUG-068): auto-generate Award Minutes PDF on Confirm bundled into the BOQ commit. `award.service.ts:confirmAward` now fires `awardMinutesService.generate` best-effort after the notification dispatch; failures logged, Confirm still succeeds, manual Regenerate button on AwardSummaryCard remains as the recovery path. AwardSummaryCard's `minutesGeneratedAt` field populates automatically on next page load. Other compression options (bulk price entry, auto-Confirm on lowest-PASS click) explicitly NOT picked by owner during the Theme 3 planning round and remain open if needed later. BIGGER win: the BOQ feature itself (BUG-068) removes the entire manual price-entry step that was the worst friction point in the flow. |
| WALK-056 | **Past evaluations list (and Tender Closed picker) lacks organisation — no filter / search / status indicator beyond the section header.** | UX gap (followup to WALK-054 + WALK-051) | ✅ | Fixed 2026-05-30 (BUG-065). Added a per-page text filter (case-insensitive, matches reference number OR title) to three places: `/technical-evaluation` side list (filters Active + Past sections together), `/commercial-comparison` picker (filters before `<optgroup>` grouping), and `/committee-opening` side list (filters with "No tenders match" fallback). Same simple pattern across all three, kept inline so each page owns its own filter state without introducing a shared component yet. A shared component (Approach D from the original notes — search + status chips + date range) can be lifted later if more list surfaces need it. |

## N. Regression captured post-Theme J

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-057 | **Tender detail page — Bids stat tile (next to Days Left) shows 00 instead of the real bid count.** Owner 2026-05-30: "bids numbers are not showing in tender beside the countdown before it was showing now its not." Investigation: `tenders.service.ts:serializeDetail` never populated `bidCount`; the field has been undefined on `findOne` since the BUG-013 serializer sweep (frontend `tender.bidCount ?? 0` rendered as `00`). Two bids existed on TDR-2026-0013 (verified via DB) — none of them surfaced on the detail page tile. | Bug | ✅ | Fixed 2026-05-30 (BUG-066). `findOne` now includes Prisma `_count: { select: { bids: true } }`. `serializeDetail` returns `bidCount: t._count?.bids ?? 0`. Fresh-create + update paths fall back to 0 (no bids attach during those flows; detail page reloads via `findOne` after). Verified end-to-end on TDR-2026-0013: `bidCount: 2` returned by the detail endpoint. |

## Owner verification follow-ups (BUG-067 — 2026-05-31)

Owner re-walked the staging deploy after the documentation pass and surfaced five regression items, all addressed in BUG-067 below. The original WALK rows for these items have been flipped back to ✅ with their resolution notes updated.

- **WALK-008/012/019 — Est. Budget showed `$` instead of KWD.** Fixed by switching the formatter on the Overview tab from `en-US`+`USD` to `en-GB`+`KWD`. Single source of the `$` was `tenders/[id]/page.tsx` line 518; no other places used USD.
- **WALK-009/013/020 — Engineer/manager/officer could see clarifications in the tab but couldn't reply without leaving the tender.** Fixed by adding a new `ClarificationReplyForm` subcomponent inside `ClarificationsTabPanel` (gated on `clarification:reply` perm), with public/private visibility toggle. POSTs to the existing `/clarifications/:id/reply` endpoint; on success the panel re-fetches.
- **WALK-016/017 — Vendor portal download/view 401.** Three layered fixes: (1) tender doc endpoint switched from `@RequirePermissions('tender:view')` (admin-only) to `@Public() + @UseGuards(OptionalVendorOrUserGuard)`; (2) `streamDocument` now takes a user object and runs `findOne(tenderId, user)` first to apply unified access control (BUG-015 vendor visibility OR BUG-050/062 internal dept-scope); (3) audit log split — vendor caller goes to `actorVendorUserId` instead of `actorUserId` to avoid the `audit_logs_actor_user_id_fkey` FK violation. (4) Also discovered + fixed: `/data/tender-documents` had no docker volume mount, so uploaded tender docs were wiped on every container recreate — added `tender_storage` volume in `docker-compose.yml`. Verified vendor download returns HTTP 200 with correct file content.
- **WALK-023 — Engineer needed both TECHNICAL_EVALUATOR + APPROVER.** Owner had manually swapped to TECHNICAL_EVALUATOR only on 2026-05-29; today re-added APPROVER via direct SQL `INSERT INTO user_roles ... ON CONFLICT DO NOTHING` + token_version bump. The seed script already inserts both roles for fresh runs; no script change needed (it was DB drift, not seed correctness).
- **WALK-035 — POST /roles 500 + still can't edit system role grants.** Both root causes were in the backend service (frontend BUG-064 was correctly built on top of these stubs/blocks): (a) `RolesService.create` was a literal `throw new Error('Not implemented')` stub — implemented properly with input validation, audit log, `isSystem=false` for admin-created roles. (b) `RolesService.setPermissions` had `if (role.isSystem) throw new ForbiddenException('System roles are read-only')` at line 100 — removed; admin holding `roles:manage` can now edit grants on system roles too (HIGH-risk audit row preserves visibility). `findAll` serializer also extended to include `code` so the frontend can display it. Verified end-to-end: created `WALKTHROUGH_TEST_ROLE` via POST (200), PATCH'd TECHNICAL_EVALUATOR's permissions (200).

## Open clarifications / locked answers from chat

- **Q1 (WALK-032):** Answered (b) — score formatting is wrong (`83.3 / 30` exceeds max), not the label.
- **Q2 (WALK-031):** Answered (a) — link to **all** technical envelope documents, each opens in the viewer.

## Locked directive — owner, 2026-05-30

**All open WALK items in this tracker are to be worked through to completion before Theme 3 begins.** Theme 3 (WALK-053 unified Tender Summary view + WALK-055 overall Phase D flow simplification) is explicitly **held** until every other 🔴 / 🟡 item here has reached a terminal status (✅ Fixed, 🔵 Confirmation only, or promoted to a BUG-NNN with locked approach).

### Locked sequence (owner-approved 2026-05-30)

Items are grouped into themes. Themes are tackled in **highest-impact-first** order, NOT tracker order:

1. **Theme K** — Recover the two truncated WALK-027 / WALK-028 (owner dictates) so they slot into the right downstream theme
2. **Theme D — Tender detail broken tabs** (WALK-009/010/011/013/014/015/020/021/022) — 9 items, single root-cause cluster
3. **Theme F — Technical Evaluation polish** (WALK-024/025/026, plus WALK-027/028 once recovered) — WALK-026 scorecard re-load is critical
4. **Theme A — Dashboard + Quick Actions perm gating** (WALK-002/003/G1)
5. **Theme B — Approval Queue bugs** (WALK-004/005/006)
6. **Theme C — Tender Create criteria editor** (WALK-007)
7. **Theme G — Technical Comparison polish** (WALK-029/030/031/032/033/034)
8. **Theme I — Committee Opening** (WALK-036/037/040/041/042/043)
9. **Theme E — Vendor portal** (WALK-016/017/018)
10. **Theme H — Admin role management UI** (WALK-035/039)
11. **Theme J — Shared filter / search component** (WALK-056) — last so it can absorb requirements from all earlier list surfaces

### Commit cadence

**One BUG-NNN per theme.** Each theme bundle ships as a single commit (BUG-056 for Theme D, BUG-057 for Theme F, etc.). Owner verifies after each before the next theme begins. Hot patches that surface mid-theme attach to the theme's own commit unless the owner explicitly splits them off.

## Pending sections (owner walkthrough still in progress)

- Committee Commercial Opening — owner about to walk this; discussion notes will be appended here.

## How this tracker is used

1. Owner adds rows as they walk further (post by post in chat → appended here).
2. When a row is locked into a code change, it gets promoted to a `BUG-NNN` row in `docs/qa/BUG_TRACKER_2026-05-25.md` with the agreed approach.
3. Status flips here when the fix ships (or when owner re-tests).
4. This file is **not** code. It's a living capture of the walkthrough and will be archived when all rows reach a terminal status.
