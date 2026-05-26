# CTMP Manual Test Plan — Phase 9

This is the master test plan and progress record. It is split into 3 batches so each batch fits comfortably in a single browser-extension session:

- **Batch 1 — Sections 1–5** (login, settings, tender creation, approval, vendor registration). **STATUS: ✅ COMPLETE.**
- **Batch 2 — Sections 6–8** (vendor bid submission, technical evaluation, committee commercial opening). **STATUS: ✅ COMPLETE.** See [TEST_BATCH_2.md](./TEST_BATCH_2.md).
- **Batch 3 — Sections 9–12** (commercial comparison + award, audit, clarifications, security alerts). **STATUS: ✅ COMPLETE.** See [TEST_BATCH_3.md](./TEST_BATCH_3.md).

---

## Persistent Test Data (use across all batches)

| Item | Value |
|------|-------|
| Admin user | `admin@ctmp.local` / `Admin@12345!` |
| Committee user | `committee@ctmp.local` / `Admin@12345!` |
| Vendor email (use this exact email) | `acme@testco.com` |
| Vendor password | `Vendor@12345!` |
| Vendor company | `Acme Builders LLC` |
| Tender title (primary) | `Office Renovation 2026` |
| Tender department (primary) | `Facilities Management` |
| Tender description (primary) | `Renovation of headquarters office space including flooring, lighting, and partitions` |
| Tender title (clarifications, Section 11) | `Stationery Supply 2026` |
| Tender department (clarifications) | `Procurement` |

> **If your environment already has a vendor/tender with these names from prior runs, use those — do not create duplicates.** Check the Vendor Management page and Tenders list before registering.

---

## Environment

| URL | Purpose |
|-----|---------|
| http://10.1.13.98:4200 | Admin portal |
| http://10.1.13.98:4300 | Vendor portal |
| http://10.1.13.98:8025 | MailHog (email viewer) |

---

## Batch Results

Verified on 2026-05-21.

| Batch | Section | Result |
|-------|---------|--------|
| 1 | **1. Admin Login** | ✅ PASS (4/4) — Login, sidebar, top bar all working |
| 1 | **2. System Configuration** | ✅ PASS (4/4) — All 3 settings tabs load |
| 1 | **3. Create a Tender** | ✅ PASS (5/5) — Tender created with auto-generated reference |
| 1 | **4. Tender Approval Workflow** | ✅ PASS (6/6) — Draft → Internal Review → Approved → Published |
| 1 | **5. Vendor Registration & Login** | ✅ PASS (9/9) — Register, MailHog verify, admin approve, vendor login |
| 2 | **6. Vendor Browses and Bids** | ✅ PASS (10/10) — Bid receipt `RCPT-1779380984150-4FBCD9` issued for `TDR-2026-0005` |
| 2 | **7. Close Submissions & Technical Eval** | ✅ PASS (9/9) — Score 80/100, finalized → `Commercial Sealed` |
| 2 | **8. Committee Commercial Opening** | ✅ PASS (7/7) — Session scheduled, quorum met, envelopes opened |
| 3 | **9. Commercial Comparison & Award** | ✅ PASS (8/8) — Price entered, recommended, approved, issued → `Tender Closed` |
| 3 | **10. Audit Log & Reports** | ✅ PASS (5/5) — All 9 key events logged, XLSX export downloads |
| 3 | **11. Clarifications** | ✅ PASS (7/7) after admin-filter fix (was PARTIAL pre-fix) |
| 3 | **12. Security Alerts** | ✅ PASS (2/2) — 3 `AUDIT_CHAIN_BREAK` alerts visible, acknowledge works |

**Final tally: 76/76 tests pass.** Full procurement workflow verified end-to-end.

---

## Master Feedback Summary

Compile all issues found across batches here.

| Batch | Section | Step | Severity | Description | Status |
|-------|---------|------|----------|-------------|--------|
| 1 | 3 | tender detail | Low | "Created Invalid Date" shown next to reference number | Open |
| 3 | 11 | 11.5 | Medium | Admin Clarifications page filtered out `Published` tenders — vendor questions couldn't be seen by admin until status reached `Clarification Period` | Resolved (filter widened to `['Published', 'Clarification Period']`) |
| 3 | 11 | 11.6 | Medium | Admin reply submission failed: frontend sent `{ visibility: 'GENERAL_PUBLIC' \| 'PRIVATE_TO_VENDOR' }` but backend DTO expects `{ isPublic: boolean }` | Resolved (frontend now maps `visibility === 'GENERAL_PUBLIC'` to `isPublic: true`); verified via TEST_BATCH_4 — admin reply now visible to vendor |
| 3 | 9 | 9.4 | Low | "Recommend Award" button required multiple clicks; possible React state-render lag | Open |
| 3 | 10 | 10.2 | Low | Audit log records `BID_DOCUMENT_UPLOADED` rather than `BID_SUBMITTED` (test plan expectation). The actual event name is correct per spec; only the test plan wording was off. | Resolved 2026-05-21 — `TEST_BATCH_3.md` step 10.2 updated to expect `BID_DOCUMENT_UPLOADED` (the actual event emitted by `bids.service.ts:281`). No `BID_SUBMITTED` event exists in the codebase. |

**Severity guide:**
- **High** — blocks the workflow, cannot proceed
- **Medium** — works but incorrectly or with errors
- **Low** — cosmetic or minor UX issue
