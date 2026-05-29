# Owner Walkthrough Tracker — 2026-05-29

Captured during the owner's procurement walkthrough. Each row is an observation; the owner will mark status as items are addressed. When an item is locked into a fix plan it will be promoted to a `BUG-NNN` entry in `BUG_TRACKER_2026-05-25.md` with the agreed approach. Until then this is the working punch list.

**Status legend:** 🔴 Open · 🟡 In Progress · ✅ Fixed · 🔵 Confirmation only (no action)

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
| WALK-001 | Engineer's tender list shows only their department | Confirmation of BUG-050 | 🔵 | Working as designed |
| WALK-002 | Dashboard still shows "Quick Actions" panel for engineer — should be removed | UI gating gap | 🔴 | |
| WALK-003 | Engineer should only **view** the Dashboard (no actionable widgets) | UI gating gap | 🔴 | |

## B. General UI principle (applies everywhere)

| ID | Principle | Status | Resolution / notes |
|---|---|---|---|
| WALK-G1 | "Quick Actions" cards on every dashboard must be **permission-gated per card**. If a user has zero matching perms, the whole Quick Actions section is hidden. Applies to engineer, finance, committee, auditor, all users. | 🔴 | |

## C. Engineer — Approval Queue

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-004 | Tender description shows empty — should display what officer wrote in the Description field | Bug | 🔴 | |
| WALK-005 | Uploaded tender documents have no one-click "View" — currently forces a download. Engineer needs to view the PDF in the in-app viewer modal | Bug / UX | 🔴 | |
| WALK-006 | Edit button visible on tender card — must be hidden from engineer (no `tender:edit` on their role) | UI gating gap | 🔴 | |

## D. Officer — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-007 | Tender Create page (`/tenders/new`) should include the Technical Evaluation Criteria editor — currently officer must save first then go to edit to access it | UX / feature gap | 🔴 | |
| WALK-008 | Overview tab — working as expected | Confirmation | 🔵 | |
| WALK-009 | Clarifications tab — vendor sent a clarification but engineer doesn't see it | Bug | 🔴 | |
| WALK-010 | Bids tab — not working | Bug (details TBD) | 🔴 | |
| WALK-011 | Audit Trail tab — not working | Bug (details TBD) | 🔴 | |

## E. Manager — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-012 | Overview tab — working as expected | Confirmation | 🔵 | |
| WALK-013 | Clarifications tab — same issue as WALK-009 | Bug | 🔴 | |
| WALK-014 | Bids tab — same issue as WALK-010 | Bug | 🔴 | |
| WALK-015 | Audit Trail tab — same issue as WALK-011 | Bug | 🔴 | |

## F. Vendor portal — Tender detail

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-016 | Download Tender document is not working | Bug | 🔴 | |
| WALK-017 | Need a "View" option that opens the document in the in-app PDF viewer | Bug / UX | 🔴 | |
| WALK-018 | Clarifications should live **inside the tender detail page**, not as a separate top-level menu. Vendor should view tender info + click clarification for the same tender they're on. | Feature / restructure | 🔴 | |

## G. Engineer — Tender detail (tabs)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-019 | Overview tab — working as expected | Confirmation | 🔵 | |
| WALK-020 | Clarifications tab — same issue as WALK-009 | Bug | 🔴 | |
| WALK-021 | Bids tab — same issue as WALK-010 | Bug | 🔴 | |
| WALK-022 | Audit Trail tab — same issue as WALK-011 | Bug | 🔴 | |
| WALK-023 | Technical Comparison option missing for engineer. Cause: engineer had APPROVER role only (not TECHNICAL_EVALUATOR). | Role config | 🟡 | Resolved by user manual role change — see role note below |

### Role-change note (user-initiated, 2026-05-29)

Owner manually changed `engineer@ctmp.local`'s role from **APPROVER → TECHNICAL_EVALUATOR**. **Implication:** engineer no longer has `tender:approve`, so the "Approve tender during Internal Review" workflow step now needs a different user. Manager (PROCUREMENT_ADMIN) gained `tender:approve` as part of BUG-050 and can cover this step. To capture when we plan: either (a) accept manager-as-approver going forward, or (b) re-stack APPROVER on engineer alongside TECHNICAL_EVALUATOR. Owner decision pending.

## H. Engineer — Technical Evaluation (scoring)

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-024 | "View Full Proposal" button should open the proposal in a separate window (in-app PDF viewer modal) | UX | 🔴 | |
| WALK-025 | When overall score is ≥ 70, the Pass toggle should auto-flip to Pass | UX | 🔴 | |
| WALK-026 | After saving evaluation: bid shows correctly as PASS in "Submitted Bids" list, but reopening the same tender shows **no score, no evaluator notes** in the scorecard. Engineer must be able to review their saved scorecard before finalizing. | Critical bug | 🔴 | Likely related to BUG-047 per-criterion persistence gap, but extends to aggregate score + notes too |
| WALK-027 | "After finalizing …" — section header noted, body truncated in chat — TBD when owner continues | Pending detail | 🔴 | |
| WALK-028 | "When engineer completes the evaluation for a vendor it should be …" — incomplete, TBD | Pending detail | 🔴 | |

## I. Technical Comparison page

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-029 | Per-vendor detail: **remove** the "Consensus per criterion" block entirely | Spec change | 🔴 | |
| WALK-030 | Per-vendor detail: in "Evaluator Breakdown" block, keep only **Notes** and **Recommendation**; drop the per-criterion scores | Spec change | 🔴 | |
| WALK-031 | Per-vendor detail: **add** a one-click link to the vendor's submitted technical proposal PDF (opens in in-app PDF viewer) | New feature | 🔴 | |
| WALK-032 | Score display shows values like `83.3 / 30` where the number exceeds the max — formatting/calculation is wrong | Bug | 🔴 | Owner confirmed Q1 = (b) — score formatting wrong, not the label |
| WALK-033 | Remove "Score evaluations" — no use for it | Spec change | 🔴 | |
| WALK-034 | Technical comparison matrix values are not correct (root cause likely tied to WALK-032 and the unresolved per-criterion persistence gap from BUG-047) | Critical bug | 🔴 | |

## K. Manager — Committee & Commercial Opening

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-036 | After selecting a tender on the Committee Opening page, the right pane renders headers (Committee Attendance, Technically Qualified Vendors, Print Agenda button) but everything is blank | Bug | 🔴 | Empty because no session exists yet — expected? But headers should still hide/empty-state gracefully |
| WALK-037 | Print Agenda button does not work | Bug | 🔴 | |
| WALK-038 | **Blocker** — When manager clicks "Schedule Committee Session", the Committee Members picker shows **no users at all** to select from. Manager cannot create a session because they can't pick the required ≥2 members. Likely cause: GET `/users?pageSize=100` returns 403 for manager (PROCUREMENT_ADMIN role does not have `users:list` / `users:read`) and the frontend silently catches the error → empty list. | Critical bug | 🔴 | Walkthrough cannot continue past this step without a fix |

## J. Admin — Role management

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-035 | Admin (SYSTEM_ADMIN) must be able to **create new roles by themselves**. Reason: multiple roles are sometimes needed combined as one, or custom variants are required. Admin should be able to define a role + assign permissions to it via the Settings UI, without waiting on a developer to add a migration. | New feature | 🔴 | |
| WALK-039 | Admin cannot edit role-permission grants through the Settings UI — all the role/permission checkboxes are **disabled** for admin. Admin holds `roles:manage` + `permissions:manage` perms but the UI doesn't let them act on those. Related to WALK-035 (the whole admin-side role/permission management surface is missing or broken). | Critical bug | 🔴 | Workaround for the walkthrough: SQL grants directly against the DB |

---

## Open clarifications / locked answers from chat

- **Q1 (WALK-032):** Answered (b) — score formatting is wrong (`83.3 / 30` exceeds max), not the label.
- **Q2 (WALK-031):** Answered (a) — link to **all** technical envelope documents, each opens in the viewer.

## Pending sections (owner walkthrough still in progress)

- Committee Commercial Opening — owner about to walk this; discussion notes will be appended here.

## How this tracker is used

1. Owner adds rows as they walk further (post by post in chat → appended here).
2. When a row is locked into a code change, it gets promoted to a `BUG-NNN` row in `docs/qa/BUG_TRACKER_2026-05-25.md` with the agreed approach.
3. Status flips here when the fix ships (or when owner re-tests).
4. This file is **not** code. It's a living capture of the walkthrough and will be archived when all rows reach a terminal status.
