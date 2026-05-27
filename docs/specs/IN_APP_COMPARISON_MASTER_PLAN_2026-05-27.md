# In-App Comparison & Document Viewer — Master Plan

**Document type:** Locked master plan
**Created:** 2026-05-27
**Author:** Design session between project owner and Claude (Opus 4.7)
**Status:** ✅ DECISIONS LOCKED — see "Change-control rules" before modifying

---

## ⚠️ Change-control rules

This document is the **single source of truth** for the in-app comparison and document-viewer redesign. It is **deliberately frozen** so that future sessions, agents, or contributors do not re-litigate decisions that were already agreed in the 2026-05-27 design session.

1. **Do not edit the "Locked decisions" section** without explicit, written approval from the project owner. Each decision references the discussion question that produced it.
2. **Implementation may evolve** (file names, function signatures, library choices) — but the **behavioural contract** in this document cannot be changed unilaterally.
3. If you discover that a locked decision is technically impossible or contradicts the spec/regulations, **stop, raise the issue with the project owner, and update this document with a dated amendment block** below the original decision. Do not silently change behaviour.
4. The **flowchart** (`IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`) is the visual companion to this document. Both must stay in sync.
5. The **tracker** (`docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md`) tracks implementation status of each line item below. Update tracker as work proceeds.

---

## 1. Why this work exists

The project owner reviewed the existing Commercial Comparison page after the BUG-033 export fix shipped (2026-05-26) and concluded:

> "I don't want export in Excel or comparison. What's the point of the system if it cannot provide these features? I might better create an Excel file and throw this system out."

The platform's core procurement value — committee comparison, technical/commercial evaluation, document review — was being deferred to XLSX exports rather than performed inside the web app. This master plan corrects that.

**Scope:** Replace the export-centric workflow with three in-app surfaces:
1. **New Commercial Comparison page** (replaces existing one in place)
2. **New Technical Comparison page** (brand-new route)
3. **Shared In-App PDF Viewer** (modal component used across the platform)

**Out of scope:** Reports module remains intact for non-comparison reports (Tender Summary, Audit Trail, Vendor Activity). Only the Commercial Comparison XLSX export is removed.

---

## 2. Locked decisions (the 37 agreed points)

### A. Commercial Comparison page

| # | Decision | Q-ref |
|---|---|---|
| A1 | **Hybrid view** — matrix top + per-vendor expandable card bottom | Q1 |
| A2 | Technical scores AND commercial prices visible **on the same screen** (committee makes trade-off in one place) | Q1 |
| A3 | Technically-FAILED vendors are **shown in the matrix grayed-out + FAIL badge** (not hidden, not in a separate section) | Q2 |
| A4 | Matrix has a toggle: **Summary view (vendor-per-row)** ↔ **Itemized view (line-item-per-row)** | Q3 |
| A5 | Expandable vendor card contains **all five blocks**: (i) line-item breakdown, (ii) technical score detail (read-only), (iii) commercial documents (with inline modal viewer), (iv) vendor profile snapshot, (v) award action button | Q4 |

### B. Technical Comparison page (NEW)

| # | Decision | Q-ref |
|---|---|---|
| B1 | **Separate page** from Technical Evaluation (not folded into the existing scorecard page) | Q4 / instruction |
| B2 | **Read-only** — scoring only happens on the existing Technical Evaluation page; this is a consolidated view only | Q5 |
| B3 | Visible to **both evaluators** (during Technical Evaluation stage) **and committee** (through to award) | Q5 |
| B4 | Matrix layout is **switchable**: vendors-as-rows ↔ criteria-as-rows | Q6 layout |
| B5 | Multi-evaluator handling: **consensus average shown by default**, expand cell to see each evaluator's individual score | Q6 multi-eval |
| B6 | Total score = **simple average across evaluators** (no weighting between evaluators) | Q6 multi-eval |

### C. Technical criteria structure

| # | Decision | Q-ref |
|---|---|---|
| C1 | **Hybrid criteria source**: admin maintains a master library template; per-tender customisation allowed (add/remove/rename) | Q10A |
| C2 | **Weights per criterion** (e.g., Technical capability 40%, Past experience 30%, Team 30%). Sum to 100% | Q10B |
| C3 | **Mandatory PASS gates** — some criteria flagged as gates. Fail any gated criterion = overall FAIL regardless of total score | Q10C |
| C4 | **PASS/FAIL = gate-only**. Pass all mandatory gates = PASS. Total weighted score is for **ranking only**, NOT for PASS/FAIL determination | Q12A |
| C5 | Typical tender has **5–10 criteria** | Q10 trailer |

### D. Commercial bid structure (BOQ)

| # | Decision | Q-ref |
|---|---|---|
| D1 | **Buyer (procurement) defines a BOQ template** when creating the tender. Vendors fill **unit prices only** against the buyer's items. Apples-to-apples comparison | Q11A |
| D2 | **KWD only**. No multi-currency | Q11B |
| D3 | **No VAT line**. Prices are total | Q11C |
| D4 | **No discounts** — neither line-level nor bid-level. What vendor enters is what is compared | Q11D |

### E. Document viewer (shared component)

| # | Decision | Q-ref |
|---|---|---|
| E1 | **PDF only**. Enforced at vendor upload time. Office docs and images NOT supported in v1 | Q7A |
| E2 | **Modal overlay** — full-screen, ESC closes. Not inline-embedded, not split-pane, not new-tab | Q7B |
| E3 | **View only** — no annotations, no private notes, no shared committee comments. v1 is read-only | Q7C |
| E4 | **Every view is audit-logged** (timestamp, user, document, vendor, tender) per spec mandate | Q7C |
| E5 | Reused across: Commercial Comparison card, Technical Comparison card, Technical Evaluation "View Full Proposal" (fixes retest D2) | Q7 trailer |

### F. Award decision flow

| # | Decision | Q-ref |
|---|---|---|
| F1 | **Pre-select the lowest commercial price among technically-PASS vendors** when the page loads | Q8A |
| F2 | **Override = required text justification + required attached PDF document** | Q8B |
| F3 | **Lowest-pick (default) = zero-friction Confirm**. No text, no PDF. Acceptance of the system default is itself the audit signal | Q9A |
| F4 | **Single-winner only**. No split awards across multiple vendors | Q8C |
| F5 | Committee recommendation → final **Confirm** click → tender moves to `Awarded` state. **No higher-authority approval layer** | Q8D |
| F6 | **Vendor notifications default OFF**. Award Confirm dialog has an opt-in toggle "Notify winning vendor automatically" (and analogous for losers). When opted-in: winner sees "You have been awarded"; losers see "Awarded to another vendor" | Q9B + Q16B |
| F7 | **Amendment workflow** — privileged role(s) can open an "Amend Award" flow after `Awarded` state. Creates a new audit-logged record that **supersedes** the original. Both the original award and the amendment remain visible in the audit trail. Original is never deleted | Q16A |

### G. Meeting + quorum

| # | Decision | Q-ref |
|---|---|---|
| G1 | Operational reality: **Procurement Manager drives the system** in a physical meeting room. Committee members are **executives sitting in the room**, not system users. Decision is collective; only one person clicks | Q12B narrative |
| G2 | Existing Committee Opening page handles **schedule + attendance + envelope opening**. New Commercial Comparison page handles **comparison + recommendation + Confirm** | Q13A |
| G3 | **"Proceed to Comparison" button** on Committee Opening page. **Attendance is carried over** to Commercial Comparison page (no re-entry required) | Q13A |
| G4 | **Hard quorum + role check**: Confirm button is disabled until (a) minimum N committee members are marked PRESENT, AND (b) the Committee Chair (or other configurable required role) is PRESENT. Configurable per committee | Q13B |
| G5 | Confirm button shows a **clear disabled reason** (e.g., "Need 2 more members + Chair must be present") | Q13B |

### H. Reporting + output documents

| # | Decision | Q-ref |
|---|---|---|
| H1 | **"Generate Award Minutes" PDF** — on-demand button on awarded tenders. Contains tender details, all bidders, technical scores per vendor (including FAILed with reason), commercial prices, attendees, lowest, recommended vendor, justification text/PDF, timestamp, Procurement Manager name. Immutable, hashed, stored alongside tender | Q14A |
| H2 | **No auto-generation** of Award Minutes. User clicks the button when they need the document (after award, for committee binders, etc.) | Q14A |
| H3 | **Audit log on comparison pages = small badge** ("12 views logged") that **links out to the full audit page**. No inline audit list on the comparison surface | Q14B |
| H4 | **Reports module stays untouched** for: Tender Summary, Audit Trail, Vendor Activity, etc. (XLSX export preserved — analysts genuinely use spreadsheets) | Q15A |
| H5 | **Commercial Comparison XLSX export REMOVED** from Reports module when the new in-app page ships | Q15A |
| H6 | **BUG-033 fix stays working in the interim** (Commercial Comparison XLSX export continues to function) — until the new in-app page is verified live, then removed | Q16C |

### I. Permissions (RBAC) and visibility

| # | Decision | Q-ref |
|---|---|---|
| I1 | **Permissions are configurable** via the existing RBAC system. Defaults provided below; project owner can tune per role later | Q12B + |
| I2 | The new Commercial Comparison page **replaces the existing one in place** at route `/commercial-comparison`. Old page deleted | Q15B |
| I3 | The new Technical Comparison page lives at route `/technical-comparison` (new sidebar entry) | derived |

#### Default RBAC matrix (tunable later)

| Permission | Default roles | Notes |
|---|---|---|
| `comparison:commercial:view` | Procurement Manager, Committee Member | Only AFTER official commercial opening session |
| `comparison:commercial:recommend` | Procurement Manager | The "Recommend this vendor" action |
| `comparison:commercial:confirm` | Procurement Manager | Final Confirm action that moves tender → Awarded |
| `comparison:technical:view` | Procurement Manager, Evaluator, Committee Member | Read-only |
| `viewer:pdf:open` | Anyone who can view the page that hosts the doc | Audit-logged regardless |
| `viewer:pdf:download` | Procurement Manager, Committee Member | Tunable. Audit-logged |
| `award:minutes:generate` | Procurement Manager, Committee Member | Generate PDF button |
| `award:amend` | Procurement Manager + System Admin (BOTH required) | Two-person rule for amendments |
| `notification:vendor:trigger` | Procurement Manager | The opt-in toggle at award Confirm |

System Admin does NOT receive commercial visibility by default, per spec separation-of-duties rule.

---

## 3. Implementation structure

### 3.1 New / changed admin frontend files

| Path | Purpose | Action |
|---|---|---|
| `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` | New hybrid view page | **REPLACE** existing (delete old, write new) |
| `apps/web-admin/src/app/(admin)/technical-comparison/page.tsx` | New Technical Comparison page | **CREATE** |
| `apps/web-admin/src/app/(admin)/technical-comparison/layout.tsx` | Section layout (sidebar nav entry) | **CREATE** |
| `apps/web-admin/src/components/comparison/CommercialMatrix.tsx` | Matrix top section with Summary↔Itemized toggle | **CREATE** |
| `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx` | Matrix top section with vendors↔criteria toggle | **CREATE** |
| `apps/web-admin/src/components/comparison/VendorComparisonCard.tsx` | Expandable per-vendor card (commercial side) | **CREATE** |
| `apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx` | Expandable per-vendor card (technical side) | **CREATE** |
| `apps/web-admin/src/components/comparison/AwardConfirmDialog.tsx` | Recommendation + justification + notification opt-ins + Confirm | **CREATE** |
| `apps/web-admin/src/components/comparison/QuorumStatus.tsx` | "Need 2 more members + Chair" disabled-reason chip | **CREATE** |
| `apps/web-admin/src/components/viewer/PdfViewerModal.tsx` | Shared full-screen modal PDF viewer | **CREATE** |
| `apps/web-admin/src/components/viewer/PdfViewerProvider.tsx` | React context so any descendant can open the viewer | **CREATE** |
| `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` | Add "Proceed to Comparison" button + attendance hand-off | **MODIFY** |
| `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` | Hook View Full Proposal to PDF viewer modal (fixes retest D2) | **MODIFY** |
| `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` | Add "Generate Award Minutes" button for awarded tenders | **MODIFY** |
| `apps/web-admin/src/components/layout/Sidebar.tsx` | Add Technical Comparison entry | **MODIFY** |

### 3.2 New / changed API files

| Path | Purpose | Action |
|---|---|---|
| `apps/api/src/modules/comparison/` | New top-level module | **CREATE** |
| `apps/api/src/modules/comparison/comparison.module.ts` | NestJS module wiring | **CREATE** |
| `apps/api/src/modules/comparison/comparison.controller.ts` | GET endpoints for both comparison pages | **CREATE** |
| `apps/api/src/modules/comparison/comparison.service.ts` | Aggregate technical scores + commercial prices per vendor | **CREATE** |
| `apps/api/src/modules/comparison/dto/comparison-response.dto.ts` | Response DTO | **CREATE** |
| `apps/api/src/modules/award/award.controller.ts` | Recommend / Confirm / Amend endpoints | **EXTEND** existing |
| `apps/api/src/modules/award/award.service.ts` | Award + Amendment logic + Award Minutes PDF generation | **EXTEND** existing |
| `apps/api/src/modules/award/dto/recommend-award.dto.ts` | { vendorId, justificationText?, justificationPdfId?, notifyWinner, notifyLosers } | **CREATE** |
| `apps/api/src/modules/award/dto/amend-award.dto.ts` | { newVendorId, reason, supersedingPdfId } | **CREATE** |
| `apps/api/src/modules/award/award-minutes.service.ts` | PDF generation via pdfkit / puppeteer (decide at build time) | **CREATE** |
| `apps/api/src/modules/bids/bids.controller.ts` | Add `GET /bids/:id/envelopes/:type/documents/:docId/view` (auth + audit + stream PDF) — fixes D2 401 | **MODIFY** |
| `apps/api/src/modules/audit/audit.service.ts` | `logDocumentView()` helper called from every viewer open | **MODIFY** |
| `apps/api/src/modules/committee/committee.service.ts` | `checkQuorum(tenderId)` returning { hasQuorum, missingMemberCount, chairPresent } | **EXTEND** |
| `apps/api/src/modules/notifications/notifications.service.ts` | `notifyAwardWinner()`, `notifyAwardLoser()` triggers | **EXTEND** |
| `apps/api/src/modules/reports/reports.service.ts` | **REMOVE** `commercial_comparison` report code (only after new page is live and verified) | **MODIFY (deferred)** |

### 3.3 Database schema changes

All changes go in `database/migrations/003_award_workflow.sql` (or higher number, check current migration sequence at build time).

```sql
-- Add gate flag and weight to evaluation_criteria
ALTER TABLE evaluation_criteria
  ADD COLUMN is_mandatory_gate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN weight DECIMAL(5,2) NOT NULL DEFAULT 0.0;

-- Criteria library template (the "library" side of hybrid)
CREATE TABLE evaluation_criteria_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  default_weight DECIMAL(5,2),
  default_is_gate BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Committee quorum config
ALTER TABLE committees
  ADD COLUMN required_quorum_count INT,
  ADD COLUMN required_role_code VARCHAR(50) DEFAULT 'CHAIR';

-- Award recommendation + amendment history
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id UUID NOT NULL REFERENCES tenders(id),
  recommended_vendor_id UUID NOT NULL REFERENCES vendors(id),
  is_lowest BOOLEAN NOT NULL,
  justification_text TEXT,
  justification_pdf_document_id UUID REFERENCES documents(id),
  notify_winner BOOLEAN NOT NULL DEFAULT FALSE,
  notify_losers BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_by UUID NOT NULL REFERENCES users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by_award_id UUID REFERENCES awards(id),
  superseded_at TIMESTAMPTZ,
  CHECK (
    (is_lowest = TRUE) OR
    (justification_text IS NOT NULL AND justification_pdf_document_id IS NOT NULL)
  )
);

-- Award Minutes PDFs (generated on-demand)
CREATE TABLE award_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id UUID NOT NULL REFERENCES awards(id),
  pdf_document_id UUID NOT NULL REFERENCES documents(id),
  generated_by UUID NOT NULL REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sha256 CHAR(64) NOT NULL
);

-- Document view audit log (extend existing audit_log or new table)
CREATE TABLE document_view_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  document_id UUID NOT NULL REFERENCES documents(id),
  tender_id UUID REFERENCES tenders(id),
  bid_id UUID REFERENCES bids(id),
  view_context VARCHAR(50) NOT NULL, -- 'commercial-comparison' | 'technical-comparison' | 'technical-evaluation'
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),
  user_agent TEXT
);
CREATE INDEX idx_document_view_log_document ON document_view_log(document_id);
CREATE INDEX idx_document_view_log_tender ON document_view_log(tender_id);
```

### 3.4 New API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/tenders/:id/comparison/commercial` | Full payload for Commercial Comparison page: vendors[] with tech score, tech result, commercial total, line items, commercial doc IDs |
| GET | `/api/v1/tenders/:id/comparison/technical` | Full payload for Technical Comparison page: vendors[] with criterion-by-criterion scores per evaluator + consensus |
| GET | `/api/v1/tenders/:id/quorum` | { hasQuorum, requiredCount, presentCount, missingRoles[], chairPresent } |
| POST | `/api/v1/tenders/:id/award/recommend` | Body: `RecommendAwardDto`. Returns the created Award record. Moves tender → `Award Recommendation` |
| POST | `/api/v1/tenders/:id/award/confirm` | Final Confirm. Moves tender → `Awarded`. Triggers optional vendor notifications |
| POST | `/api/v1/tenders/:id/award/amend` | Body: `AmendAwardDto`. Creates a new Award record that supersedes the previous one. Requires `award:amend` permission |
| GET | `/api/v1/tenders/:id/award/minutes.pdf` | On-demand PDF generation + download. Audit-logged |
| GET | `/api/v1/bids/:id/envelopes/:envelopeType/documents/:docId/view` | Stream PDF inline (replaces broken `/documents` endpoint from BUG-022 / retest D2). Authenticated. Audit-logged via `document_view_log` |
| POST | `/api/v1/tenders/:id/award/notify` | Manual re-trigger of vendor notification (in case Procurement Manager forgot the opt-in at Confirm time) |

### 3.5 New library/criteria management UI

Out of scope for v1 page work, but needed for C1 (hybrid library):
- `apps/web-admin/src/app/(admin)/settings/evaluation-criteria/page.tsx` — admin manages library
- Mentioned here for completeness; will become BUG-046 if not already an open item.

---

## 4. Lifecycle integration

The new pages do NOT introduce new tender states. They plug into existing states from the spec:

```
... Technical Opening
  → Technical Evaluation [evaluators score per vendor on existing scorecard]
                          [Technical Comparison page is read-only view, available throughout]
  → Commercial Sealed
  → Committee Commercial Opening [existing Committee Opening page: schedule, attendance, opening]
                                 [→ "Proceed to Comparison" button → new Commercial Comparison page]
  → Commercial Evaluation / Comparison [the new Commercial Comparison page is the working surface]
                                       [Procurement Manager recommends → Confirm]
  → Award Recommendation [intermediate state between Recommend and Confirm]
  → Awarded [Confirm pressed; optional vendor notifications fire]
  → Tender Closed
```

**No new states.** No spec changes. The new pages are richer renderings of existing lifecycle stages.

**Amendment** does not introduce a new state either. An amended tender stays in `Awarded`; the `awards` table tracks the superseding record.

---

## 5. Non-negotiable rules carried over from the spec

These already apply project-wide and must be honoured by the new pages:

- Commercial envelopes open **only through an official committee commercial opening session** (existing rule).
- Commercial **opening changes envelope state only**. Per-action permissions still gate visibility.
- **System Admin does NOT automatically receive commercial bid visibility.**
- All sensitive actions (state changes, sensitive views, downloads, recommendations, confirmations, amendments, notifications) **MUST be audit-logged** — append-only, not editable.
- Submitted bids remain **immutable**.

The new pages reinforce — never relax — these rules.

---

## 6. Order of execution (when implementation begins)

The project owner has stated:

> "Add these to bug tracker, however first complete all others which were left and still not yet fixed, also the ones which failed."

So the execution order is:

1. **Fix the 5 failed retest items** (D2 401 auth, D1 button layout, A4 days-left calc, F4 export scope, A2/A3 serializer null on new tender). Some of these will be subsumed by the new feature work (D2 is the PDF viewer; F4 is the new comparison page).
2. **Close the 21 still-Open bugs** (BUG-004, 005, 008–012, 014–020, 023, 025, 026, 028, 030–032) per their already-locked agreed approaches.
3. **Build the new in-app features** per this master plan, in this order:
   - **Phase A — Shared PDF Viewer** (BUG-037). Lands first because BUG-022/retest-D2 immediately benefit and the new comparison pages depend on it.
   - **Phase B — Technical Comparison page** (BUG-036). Read-only, no new write paths. Lower-risk to ship first.
   - **Phase C — Commercial Comparison page redesign** (BUG-035). The biggest piece. Replaces existing page in place.
   - **Phase D — Award flow + Quorum + Amendment** (BUG-039 + BUG-040 + BUG-041). Touches the existing Committee Opening page and adds the recommend/confirm/amend endpoints.
   - **Phase E — Award Minutes PDF + Optional vendor notifications** (BUG-038 + BUG-042).
   - **Phase F — Criteria library + per-tender customisation** (BUG-043 + BUG-044). Required for C1 (hybrid criteria source) to fully work.
   - **Phase G — Cleanup**: remove old `commercial_comparison` from Reports module (BUG-045) once new page is verified live.

Each phase ships, verifies on staging, then the next begins.

---

## 7. Future-session guardrails

A future agent or session reading this document **must**:

- Not change a "Locked decision" without an explicit, written, dated amendment block.
- Not introduce features that contradict this plan (e.g., re-adding XLSX export for Commercial Comparison, allowing in-line PDF embedding instead of modal, building a split-award flow).
- Not silently change permission defaults; always document the change in `DECISION_LOG.md`.
- Honour the **execution order** — do not start the new pages before the 5 retest fails and the 21 open bugs are closed (unless project owner explicitly waives this order).

If a future agent reaches a junction that this plan does not anticipate, **stop and ask the project owner**, then **append an amendment block to this document** before resuming.

---

## 8. Cross-references

- **Flowchart:** `docs/specs/IN_APP_COMPARISON_FLOWCHART_2026-05-27.md` — visual reference for the same decisions
- **Per-change tracker:** `docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md` — implementation status per BUG-035+ line item
- **Bug tracker entries:** `docs/qa/BUG_TRACKER_2026-05-25.md` — BUG-035 through BUG-045
- **Decision log:** `docs/decisions/DECISION_LOG.md` — high-level architectural decisions recorded today
- **Handover:** `agents/handoffs/HANDOVER.md` — session record for 2026-05-27
- **Spec:** `docs/specs/implementation-spec.md` — the wider project spec; not modified by this work

---

## 9. Sign-off

| Role | Name | Date |
|---|---|---|
| Project owner | (per session record) | 2026-05-27 |
| Design partner | Claude (Opus 4.7) | 2026-05-27 |

**This document is locked.** See section "Change-control rules" before modifying.
