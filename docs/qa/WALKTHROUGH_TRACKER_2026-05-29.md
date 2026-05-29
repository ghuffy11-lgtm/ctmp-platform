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
| WALK-038 | **Blocker** — When manager clicks "Schedule Committee Session", the Committee Members picker shows **no users at all** to select from. Manager cannot create a session because they can't pick the required ≥2 members. Likely cause: GET `/users?pageSize=100` returns 403 for manager (PROCUREMENT_ADMIN role does not have `users:list` / `users:read`) and the frontend silently catches the error → empty list. | Critical bug | ✅ | Resolved 2026-05-29 — granted `users:list` + `users:read` to PROCUREMENT_ADMIN (codified in seed, commit `61f04fe`). Owner re-logged in as manager → picker now populates. |
| WALK-040 | When manager schedules a committee session and selects members, the system **does not send any automated email** to the selected members about agenda + meeting timing. Confirmed by reading `apps/api/src/modules/committee/committee.service.ts:17-63` — `createSession` writes the session + members + audit log only. No mail dispatch hook is invoked. Owner expectation: invited members should receive an email with date/time/location/agenda link when the session is created (and follow-up on changes). | New feature | 🔴 | Needs decision on: (a) email template content (agenda included or just a link to the in-app session page?), (b) re-send on update vs. only-on-create, (c) ICS attachment for calendar import — yes/no |
| WALK-041 | **Critical gap in BUG-050 dept-scoping** — `finance@ctmp.local` (COMMERCIAL_COMMITTEE_MEMBER + COMMERCIAL_EVALUATOR) could **not view the tender** because their `user_departments` did not include the tender's department. Owner worked around by manually assigning finance to the same department. Real problem: committee members and commercial evaluators are **cross-department by nature** — a finance person on a committee for a tender outside their home department must still see it. The dept-scoped `findOne`/`findAll` introduced in BUG-050 does not consider committee membership or assigned evaluator role on a given tender. | Critical bug | 🔴 | Approach options: (a) bypass dept filter when user is a member of an active committee session for that tender (or assigned `COMMERCIAL_EVALUATOR` on it); (b) add an "assigned tenders" inclusion to the dept filter; (c) grant `system:view_all_departments` to committee/evaluator roles (blunt — defeats BUG-050 intent for non-committee work). Owner decision pending. |
| WALK-042 | **Manager hit 403 after clicking "Open Commercial Envelopes"** even though the server-side action succeeded. Cause: after the open succeeds, `committee-opening/page.tsx` triggers follow-up fetches and/or post-open UI components that require `commercial:view`. Manager (PROCUREMENT_ADMIN) intentionally does NOT have `commercial:view` (spec separation of duties). The page surfaces the 403 as if the open failed, but the tender transitioned to `COMMERCIAL_EVALUATION` and envelopes are opened. Misleading UX. | Bug / UX | 🔴 | Fix approach: after a successful `openCommercialEnvelopes` call, the page should (a) show a success toast "Envelopes opened — hand off to commercial evaluators", (b) NOT attempt to fetch commercial:view-gated data, (c) redirect or offer a clear next-step link (e.g., "Notify finance@/committee@ — they will continue in Commercial Comparison"). |
| WALK-043 | **Tender disappears from Committee & Commercial Opening page after envelopes are opened.** The page filters tenders by status IN `['Commercial Sealed', 'Committee Commercial Opening']` (`committee-opening/page.tsx:78`). The successful open call transitions tender to `COMMERCIAL_EVALUATION` — outside that filter — so on refresh the tender is gone and the user feels stuck. | Bug / UX | 🔴 | Fix approach options: (a) add `COMMERCIAL_EVALUATION` to the filter so opened sessions remain visible read-only (showing "Envelopes opened — session COMPLETED"); (b) keep current filter but show an "Opened sessions (last 7 days)" sub-list as a hand-off cue; (c) keep current filter but show a persistent banner with a link to the Commercial Comparison page for the just-opened tender. |

## J. Admin — Role management

| ID | Observation | Type | Status | Resolution / notes |
|---|---|---|---|---|
| WALK-035 | Admin (SYSTEM_ADMIN) must be able to **create new roles by themselves**. Reason: multiple roles are sometimes needed combined as one, or custom variants are required. Admin should be able to define a role + assign permissions to it via the Settings UI, without waiting on a developer to add a migration. | New feature | 🔴 | |
| WALK-039 | Admin cannot edit role-permission grants through the Settings UI — all the role/permission checkboxes are **disabled** for admin. Admin holds `roles:manage` + `permissions:manage` perms but the UI doesn't let them act on those. Related to WALK-035 (the whole admin-side role/permission management surface is missing or broken). | Critical bug | 🔴 | Workaround for the walkthrough: SQL grants directly against the DB |

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
