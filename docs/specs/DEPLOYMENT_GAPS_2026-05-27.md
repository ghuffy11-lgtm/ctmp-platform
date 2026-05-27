# Deployment Gap Analysis — In-App Comparison Redesign

**Document type:** Gap inventory
**Created:** 2026-05-27
**Companion to:** `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`

This document inventories **every gap** that must be closed before the in-app comparison redesign (BUG-035 through BUG-045) can be deployed to staging and used end-to-end. Each gap has a category, owner-area, severity, and a recommended sequence.

**How to read it:** A gap is something that does not exist yet (or exists but is wrong) and would block a clean ship. Some gaps are tiny (one column on a table); others are workstreams of their own.

Legend:

- **Severity:** 🔴 Critical (blocks deploy) · 🟠 High (blocks feature) · 🟡 Medium (feature works but is degraded) · 🟢 Low (cleanup)
- **Owner area:** Backend / Frontend Admin / Frontend Vendor / Database / DevOps / QA / Docs

---

## A — Code gaps (what doesn't exist yet)

### A.1 Frontend admin components

| File | Severity | Phase | Note |
|---|---|---|---|
| `apps/web-admin/src/app/(admin)/technical-comparison/page.tsx` | 🟠 | B | New route — needs to render `<TechnicalMatrix>` + cards |
| `apps/web-admin/src/app/(admin)/technical-comparison/layout.tsx` | 🟡 | B | Or use the existing `(admin)/layout.tsx` if it covers sidebar — verify |
| `apps/web-admin/src/components/comparison/CommercialMatrix.tsx` | 🔴 | C | Summary ↔ Itemized toggle |
| `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx` | 🔴 | B | Vendors-as-rows ↔ Criteria-as-rows toggle |
| `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` | 🔴 | C | Expandable card with all 5 blocks |
| `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` | 🔴 | B | Expandable card (technical side) |
| `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` | 🔴 | D | Recommend + justification + notification toggles + Confirm |
| `apps/web-admin/src/components/comparison/AmendAwardDialog.tsx` | 🟠 | D | Post-award correction |
| `apps/web-admin/src/components/comparison/QuorumStatus.tsx` | 🟠 | D | Disabled-reason chip |
| `apps/web-admin/src/components/viewer/PdfViewerModal.tsx` | 🔴 | A | Shared full-screen modal |
| `apps/web-admin/src/components/viewer/PdfViewerProvider.tsx` | 🔴 | A | React context for cross-cutting open |

### A.2 Frontend admin modifications

| File | Severity | Phase | Note |
|---|---|---|---|
| `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` | 🔴 | C | **In-place replacement** — delete current contents, write new hybrid view |
| `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` | 🟠 | D | Add "Proceed to Comparison" button + attendance handoff |
| `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` | 🟠 | A | Re-wire View Full Proposal to `PdfViewerModal` (closes retest D2) |
| `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` | 🟡 | D + E | Add Amend Award + Generate Award Minutes buttons |
| `apps/web-admin/src/components/layout/Sidebar.tsx` | 🟡 | B | Add Technical Comparison nav entry, RBAC-gated |
| `apps/web-admin/src/app/(admin)/settings/evaluation-criteria/page.tsx` | 🟠 | F | New library CRUD page |
| `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` | 🟠 | F | Add per-tender criteria editor |
| `apps/web-admin/src/app/(admin)/reports/page.tsx` | 🟢 | G | Remove Commercial Comparison card (cleanup) |

### A.3 Frontend vendor

| File | Severity | Phase | Note |
|---|---|---|---|
| `apps/web-vendor/src/app/(portal)/bids/wizard/[tenderId]/...` | 🔴 | A | Enforce PDF-only at file picker + on submit. Reject non-PDF with clear error |
| `apps/web-vendor/src/app/(portal)/bids/[bidId]/page.tsx` | 🟡 | E | Award-state UI ("You have been awarded" / "Awarded to another vendor") |

### A.4 Backend modules

| Path | Severity | Phase | Note |
|---|---|---|---|
| `apps/api/src/modules/comparison/comparison.module.ts` | 🔴 | B + C | NEW NestJS module |
| `apps/api/src/modules/comparison/comparison.controller.ts` | 🔴 | B + C | `GET /tenders/:id/comparison/{commercial,technical}` + `/quorum` |
| `apps/api/src/modules/comparison/comparison.service.ts` | 🔴 | B + C | Aggregate scores, line items, vendor data |
| `apps/api/src/modules/comparison/dto/*.dto.ts` | 🔴 | B + C | Response DTOs |
| `apps/api/src/modules/award/award.controller.ts` | 🔴 | D | Extend with `recommend`, `confirm`, `amend`, `notify` |
| `apps/api/src/modules/award/award.service.ts` | 🔴 | D | Award + Amendment business logic |
| `apps/api/src/modules/award/dto/recommend-award.dto.ts` | 🔴 | D | NEW |
| `apps/api/src/modules/award/dto/amend-award.dto.ts` | 🔴 | D | NEW |
| `apps/api/src/modules/award/award-minutes.service.ts` | 🟠 | E | PDF generation — library choice pending (see C.3) |
| `apps/api/src/modules/bids/bids.controller.ts` | 🔴 | A | New `GET /bids/:id/envelopes/:type/documents/:docId/view` — fixes D2 401 |
| `apps/api/src/modules/audit/audit.service.ts` | 🔴 | A | `logDocumentView()` writing to `document_view_log` |
| `apps/api/src/modules/committee/committee.service.ts` | 🟠 | D | `checkQuorum(tenderId)` |
| `apps/api/src/modules/notifications/notifications.service.ts` | 🟠 | E | `notifyAwardWinner()`, `notifyAwardLoser()` |
| `apps/api/src/modules/evaluation-criteria/` | 🟠 | F | NEW (or extend existing) — library CRUD + per-tender validation |
| `apps/api/src/modules/reports/reports.service.ts` | 🟢 | G | Remove `commercial_comparison` branch |

### A.5 API contract (OpenAPI)

`api-contracts/openapi/ctmp.openapi.yaml` needs entries for every new endpoint listed in master plan §3.4. Without this, frontend code generation drifts. **Severity 🟠**, applies to all of Phases A–E.

---

## B — Database gaps

All collected into `database/migrations/00X_award_workflow_and_viewer.sql` (replace `00X` with the next sequential number when implementing).

### B.1 Schema additions (🔴 blocks Phases D + F)

```sql
-- evaluation_criteria: add gate flag and weight
ALTER TABLE evaluation_criteria
  ADD COLUMN is_mandatory_gate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN weight DECIMAL(5,2) NOT NULL DEFAULT 0.0;

-- committees: add quorum config
ALTER TABLE committees
  ADD COLUMN required_quorum_count INT,
  ADD COLUMN required_role_code VARCHAR(50) DEFAULT 'CHAIR';

-- New tables
CREATE TABLE evaluation_criteria_library (...);  -- see master plan §3.3
CREATE TABLE awards (...);                       -- with CHECK constraint
CREATE TABLE award_minutes (...);
CREATE TABLE document_view_log (...);
```

### B.2 Indexes (🟡 performance)

- `idx_document_view_log_document` on `document_view_log(document_id)`
- `idx_document_view_log_tender` on `document_view_log(tender_id)`
- `idx_awards_tender` on `awards(tender_id)`
- `idx_awards_superseded` on `awards(superseded_by_award_id)` WHERE NOT NULL

### B.3 Constraints (🔴 correctness)

- `awards` CHECK: `(is_lowest = TRUE) OR (justification_text IS NOT NULL AND justification_pdf_document_id IS NOT NULL)` — enforces master plan F2/F3
- `evaluation_criteria` per-tender constraint or trigger: sum of weights = 100% (validate at application layer OR in trigger)

### B.4 Backfills (🟠 data quality)

Two existing-data backfill decisions needed before any new schema lands on production:

| Data | Question | Recommended default |
|---|---|---|
| Existing `evaluation_criteria` rows | What `weight` should they get? | Equal weights (100/count) per parent tender; flag the tender as "criteria needs review" |
| Existing `evaluation_criteria` rows | What `is_mandatory_gate` should they get? | `FALSE`; admin reviews and flags as needed |
| Existing `committees` rows | What `required_quorum_count` should they get? | NULL = no quorum required (preserves current behaviour); admin sets per committee |
| Existing tenders past `Awarded` | Do they get an `awards` row retroactively? | NO — pre-redesign awards stay in their old format. New `awards` table only used going forward |

**✅ RESOLVED 2026-05-27** — Owner approved the recommended defaults: existing weights → equal split; existing gates → FALSE; existing committees → quorum NULL; pre-redesign awarded tenders → NOT backfilled. See `DECISION_LOG.md` 2026-05-27 entry "Implementation-decision locks".

### B.5 Prisma schema sync (🔴)

`apps/api/prisma/schema.prisma` must be updated in lockstep with the SQL migration. After update, run `pnpm -C apps/api prisma generate` to regenerate the typed client.

---

## C — Library / dependency gaps

### C.1 PDF generation library (🟠 Phase E)

The Award Minutes PDF generator has **no library installed** yet. Two viable choices:

| Library | Pros | Cons |
|---|---|---|
| `pdfkit` | Tiny footprint, programmatic API, runs in NestJS without browser | Manual layout, no HTML→PDF |
| `puppeteer` | Render an HTML template → PDF, easy styling | Requires headless Chromium in the Docker image (~300 MB), slower cold start |

**Recommendation:** `puppeteer` because the Award Minutes template will evolve, and HTML+CSS is faster to iterate.

**✅ RESOLVED 2026-05-27** — Owner approved `puppeteer`. Headless Chromium will be added to the API Docker image. See `DECISION_LOG.md` 2026-05-27 entry "Implementation-decision locks".

### C.2 PDF rendering on the frontend (🔴 Phase A)

The modal viewer needs to render PDFs in-browser. Options:

| Approach | Pros | Cons |
|---|---|---|
| Native `<iframe src="data:application/pdf...">` | Zero JS dependency, browser handles | Mobile rendering inconsistent; no consistent toolbar |
| `pdfjs-dist` (Mozilla PDF.js) | Consistent toolbar across browsers, page navigation, zoom | ~2 MB bundle increase |
| `react-pdf` wrapper | Same as PDF.js with React API | Slight extra weight |

**Recommendation:** `react-pdf` (wraps `pdfjs-dist`). Locks in consistent UX for the viewer.

### C.3 PDF upload validation (🟠 Phase A)

Need a server-side guard that rejects non-PDF uploads. Options:

- Magic-number check (`%PDF-` header) — cheap and reliable
- `file-type` npm library — robust mime detection
- Multer mime filter — naive (trusts client-provided MIME)

**Recommendation:** Combine `file-type` (server) + magic-number sanity check (defense-in-depth). Frontend `<input accept=".pdf">` is a hint, not a guarantee.

### C.4 Email service for notifications (🟡 Phase E)

Optional vendor notifications need an email sender. Check if SMTP is already wired (likely yes — vendor email verification exists). If only transactional templates exist, add award-winner and award-loser templates.

---

## D — Infrastructure gaps

### D.1 Storage for generated PDFs (🟠 Phase E)

Where do Award Minutes PDFs live? Two options:

- **MinIO bucket** `ctmp-award-minutes` (preferred — same pattern as existing bid documents)
- **Filesystem path** `/mnt/repo/ctmp-platform/storage/award_minutes/` (simpler, no MinIO dependency for this feature)

**✅ RESOLVED 2026-05-27** — Owner approved MinIO. Bucket `ctmp-award-minutes` will be created on the staging server with versioning ON and a 10-year retention policy. See `DECISION_LOG.md` 2026-05-27 entry "Implementation-decision locks".

### D.2 Bucket policies + retention (🟡)

If MinIO: ensure `ctmp-award-minutes` bucket has versioning ON and a retention policy (e.g., 10 years for compliance). Award Minutes are legally significant documents.

### D.3 Disk capacity on staging (🟠 cross-cutting)

The 2026-05-26 session hit 100% disk on `/dev/mapper/ubuntu--vg-ubuntu--lv`. Phase E adds Award Minutes PDFs + new viewer-rendered chunks. Pre-deploy check: `docker system df` must show ≥ 20 GB free before any rebuild.

### D.4 No CDN for static assets (🟢)

Not a blocker; just noting that the new comparison pages add JS chunks to the admin portal. They're served directly from the container, which is fine for an internal-only on-prem deployment.

---

## E — RBAC gaps

### E.1 Permission seeds (🔴 blocks all phases)

The new permissions from master plan §I do NOT exist in `database/seeds/001_baseline_roles_permissions.sql`. They need adding:

```text
comparison:commercial:view
comparison:commercial:recommend
comparison:commercial:confirm
comparison:technical:view
viewer:pdf:open
viewer:pdf:download
award:minutes:generate
award:amend
notification:vendor:trigger
```

### E.2 Default role assignments (🟠)

Master plan §I provides recommended defaults. These need to be wired into the seed:

| Permission | Default roles |
|---|---|
| `comparison:commercial:view` | Procurement Manager, Committee Member |
| `comparison:commercial:recommend` | Procurement Manager |
| `comparison:commercial:confirm` | Procurement Manager |
| `comparison:technical:view` | Procurement Manager, Evaluator, Committee Member |
| `viewer:pdf:open` | inherited from host page |
| `viewer:pdf:download` | Procurement Manager, Committee Member |
| `award:minutes:generate` | Procurement Manager, Committee Member |
| `award:amend` | Procurement Manager AND System Admin (two-person rule) |
| `notification:vendor:trigger` | Procurement Manager |

### E.3 Backend guards (🔴)

Every new endpoint must be decorated with `@RequirePermissions(...)`. Missing guards = silent privilege escalation.

### E.4 BUG-028 interaction (🟠)

BUG-028 (RBAC sidebar gating + dept-scoped data filtering) is a **prerequisite** — without it, even with the new permissions seeded, the sidebar won't hide the Technical Comparison entry from unauthorised roles. Ship BUG-028 in Priority 2 before Phase B.

---

## F — Prerequisite bug overlaps (must ship FIRST)

Some of the 21 still-Open bugs must close before the new features can land cleanly. Mapped here so the dependency is explicit:

| Open Bug | Must close before | Why |
|---|---|---|
| BUG-004, BUG-012, BUG-014 (tender doc upload pipeline) | Phase A (PDF viewer) | Vendor PDFs must exist before the viewer has anything to view. The bid wizard upload flow must enforce PDF-only at the same time |
| BUG-008, BUG-009, BUG-010, BUG-011 (tender form completeness, Prisma rename) | Phase F (criteria editor) | The criteria editor lives on the tender create/edit page; the form must be in its final shape before criteria UI plugs in |
| BUG-028 (RBAC sidebar + dept-scoped data) | Phase B (Technical Comparison page) | Without RBAC enforcement, the new page is visible to everyone |
| BUG-023, BUG-025 (commercial docs surface) | Phase C (Commercial Comparison redesign) | Subsumed by BUG-035 — but committee opening still references these docs. Wire correctly to avoid double-implementation |
| BUG-026 (award recommendation forced to lowest) | Phase D (award flow) | Subsumed by BUG-039 — close as duplicate when D ships |
| BUG-016 (notification policy unclear) | Phase E (optional vendor notifications) | The agreed approach is BUG-042's opt-in toggles. Close as duplicate when E ships |
| BUG-031 (vendor sees other vendors' clarifications) | Independent | Not directly tied, but recommend bundling with the clarification overhaul before any new vendor-portal work |

---

## G — Retest gap overlaps (auto-resolved by new phases)

Some of the 5 failed retest items resolve automatically when later phases ship. Tag clearly so we don't double-fix:

| Retest ID | Status | Action |
|---|---|---|
| A2 / A3 (serializer null) | INDEPENDENT | Patch in Priority 1 — not subsumed by anything later |
| A4 (Days Left empty) | INDEPENDENT | Patch in Priority 1 — small UI fix |
| D1 (Save Evaluation cramped) | INDEPENDENT | Patch in Priority 1 — owner wants Save on its own row |
| D2 (View Full Proposal 401) | **AUTO-RESOLVED by Phase A (BUG-037)** | Do NOT patch separately. The PDF viewer Phase A replaces the broken endpoint |
| F4 (export pulls all tenders) | **AUTO-RESOLVED by Phase C + G** | Do NOT patch separately. New page replaces export; Phase G removes the export entirely |

---

## H — Operational gaps

### H.1 Migration ordering (🔴)

Critical sequence:

1. **Database schema migration** (B.1) runs first on staging
2. **Backend deploy** with new permissions seed (E.1, E.2)
3. **Frontend admin deploy** with new pages + components
4. **Frontend vendor deploy** with PDF-only upload enforcement
5. **Smoke test** — verify migration ran, RBAC enforced, viewer renders, comparison loads
6. Only THEN — cleanup deploy that removes XLSX export (Phase G / BUG-045)

Do NOT deploy frontend before backend — admin portal will hit endpoints that don't exist and break loudly.

### H.2 Rollback plan (🟠)

If Phase C (Commercial Comparison redesign) breaks something major after deploy:

- **Frontend rollback:** redeploy previous container image; old `commercial-comparison/page.tsx` returns. Works in seconds.
- **Backend rollback:** redeploy previous API container; new endpoints return 404. Old XLSX export still works because Phase G hasn't run yet.
- **Schema rollback:** `awards`, `award_minutes`, `evaluation_criteria_library`, `document_view_log` table drops are non-destructive (no data loss in old code paths because old code doesn't touch them).

**Document this in a runbook** before Phase C ships: `docs/runbooks/in-app-comparison-rollback.md`.

### H.3 Existing tenders gap (🟠)

What happens to tenders that are currently in `Commercial Sealed` or later states when the new pages ship?

- Tenders in `Commercial Evaluation / Comparison` mid-decision: the new page will load against existing data. Likely fine, but **must be tested with the actual staging data** before announcing.
- Tenders already `Awarded` pre-redesign: NO `awards` row exists for them. The old award flow's audit trail remains. New Award Minutes button only works if an `awards` row exists. **Decision needed:** either backfill `awards` rows from existing tender data, or show a "Pre-redesign award" placeholder on those tenders.

**Recommendation:** show a placeholder; do not backfill. Backfilling risks rewriting historical audit data.

**✅ RESOLVED 2026-05-27** — Owner approved placeholder approach. Pre-redesign awarded tenders show "Pre-redesign award" placeholder; Generate Award Minutes button is disabled for them. New behaviour applies only to tenders awarded via Phase D. See `DECISION_LOG.md` 2026-05-27 entry.

### H.4 Feature flag (🟢)

Not required for an on-prem single-tenant deploy. New pages ship to all users at once. Acceptable risk for an internal tool.

---

## I — Testing gaps

### I.1 Playwright tests (🟠)

New tests needed in `qa/playwright/tests/`:

- `commercial-comparison-redesign.spec.ts` — toggle matrix, expand cards, open PDF viewer, recommend lowest, override with PDF, Confirm
- `technical-comparison.spec.ts` — toggle layout, expand cells, gate-fail vendor row red
- `pdf-viewer.spec.ts` — open from each host page, ESC closes, audit log row written
- `award-flow.spec.ts` — quorum gate, chair check, justification validation, single-winner enforcement
- `award-amendment.spec.ts` — privileged amend, original retained, both visible

### I.2 Backend unit tests (🟠)

`apps/api/test/` additions:

- `comparison.service.spec.ts` — score aggregation across evaluators, gate-only PASS/FAIL
- `award.service.spec.ts` — recommend, confirm state transition, amendment supersedes
- `award-minutes.service.spec.ts` — PDF generation contains all required sections
- `committee.service.spec.ts` — `checkQuorum()` logic

### I.3 Integration tests (🟡)

- Document view → audit log row written (test against test DB)
- PDF upload → reject non-PDF
- Quorum endpoint → returns correct disabled reason

### I.4 Manual test plan (🟡)

Extend `docs/qa/END_TO_END_MANUAL_TEST.md` with a new section covering the new flows. Add to `docs/qa/END_TO_END_CHROME_AGENT_PROMPTS.md` for automated Chrome-agent walkthroughs.

---

## J — Documentation gaps

### J.1 User-facing docs (🟡)

Procurement Manager and committee members will use the new pages. Need:

- **Procurement Manager guide**: how to operate the system during a committee meeting (attendance → comparison → recommend → confirm → notifications → minutes PDF)
- **Vendor guide**: bid documents must be PDF (no Word, no Excel)
- **Committee Chair guide**: their role in quorum

Location: `docs/runbooks/` or `docs/guides/` (decide at build time).

### J.2 OpenAPI documentation (🟠)

`api-contracts/openapi/ctmp.openapi.yaml` must document every new endpoint with full request/response schemas. Without this, Swagger UI lies to users about the API surface.

### J.3 Decision log entries per phase (🟢)

Each phase that ships gets a `DECISION_LOG.md` entry recording the choices made during implementation (e.g., final PDF library choice, MinIO bucket policy). Already covered by the work cycle in CLAUDE.md.

---

## K — Deployment-procedure gaps

### K.1 Pre-deploy checklist for Phase C (🔴 the riskiest deploy)

Phase C replaces a live page in place. Before deploying:

- [ ] `docker system df` shows ≥ 20 GB free
- [ ] Backend deployed first with new comparison endpoints
- [ ] Smoke-tested new endpoints with curl from staging
- [ ] At least one tender in each lifecycle state exists for testing
- [ ] Rollback runbook (H.2) is in place
- [ ] Owner is reachable for sign-off if something breaks

### K.2 Verification markers (🟠)

The team's deploy pattern uses grep-able markers in `.next/static/chunks/`. Phase C needs explicit marker strings included in the new components (e.g., the string `CommercialComparisonRedesign-v1`) so post-deploy verification can confirm the new code is actually in the running container.

### K.3 Communications plan (🟢)

Internal users need to know:

- Phase C ship date: Commercial Comparison page looks different
- Phase F ship date: tender create form has a new criteria section
- Phase G ship date: Commercial Comparison XLSX export is gone (point them to the new in-app page)

Not technically a blocker; just a politeness gap.

---

## Summary scorecard

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Code | 12 | 9 | 5 | 2 |
| Database | 2 | 2 | 1 | 0 |
| Library/dep | 1 | 2 | 1 | 0 |
| Infrastructure | 0 | 2 | 1 | 1 |
| RBAC | 2 | 2 | 0 | 0 |
| Prerequisite bugs | 0 | 7 | 0 | 0 |
| Retest overlaps | 0 | 0 | 5 | 0 |
| Operational | 1 | 2 | 0 | 1 |
| Testing | 0 | 2 | 2 | 0 |
| Documentation | 0 | 1 | 1 | 1 |
| Deploy procedure | 1 | 1 | 0 | 1 |

**Total critical (🔴) gaps:** 19. Most are code files that don't exist yet — expected for a feature this size.

**Highest-leverage early wins** (start with these even before Phase A coding begins):

1. **Owner sign-off on B.4 backfill defaults** — unblocks the schema migration
2. **Owner sign-off on C.1 PDF library choice** (puppeteer recommended)
3. **Owner sign-off on D.1 storage location** (MinIO recommended)
4. **Run `docker system df`** on staging — confirm deploy capacity
5. **Add the new permissions to the RBAC seed** (E.1) — can land independently as a small PR

---

## Decision points — ALL RESOLVED 2026-05-27

All 5 implementation decisions are now locked. See `DECISION_LOG.md` 2026-05-27 entry "Implementation-decision locks for in-app comparison redesign".

| # | Decision point | Locked answer |
|---|---|---|
| 1 | Backfill rules for existing data | Existing weights → equal split; gates → FALSE; committee quorum → NULL; pre-redesign awarded tenders → NOT backfilled |
| 2 | PDF library | `puppeteer` (headless Chromium added to API Docker image) |
| 3 | PDF storage location | MinIO bucket `ctmp-award-minutes`, versioning ON, 10-year retention |
| 4 | Phase A bundling | Ship PDF viewer **with** the Priority 1 retest-fail patch deploy (closes retest D2 via the full Phase A implementation) |
| 5 | Pre-redesign awarded tenders | Show "Pre-redesign award" placeholder; no backfill of `awards` rows |

**Implementation is unblocked.** Phase A coding can begin.

---

## Cross-references

- Master plan: `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`
- Flowchart: `IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`
- Implementation tracker: `docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md`
- Bug tracker: `docs/qa/BUG_TRACKER_2026-05-25.md` (BUG-035 through BUG-045)
- Retest sheet: `docs/qa/RETEST_2026-05-26.md` (5 failed items)
- Session-start prompt: `agents/handoffs/NEXT_SESSION_PROMPT.md`
