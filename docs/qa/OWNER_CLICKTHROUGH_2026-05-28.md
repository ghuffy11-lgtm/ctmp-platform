# Owner End-to-End Click-Through — 2026-05-28

Fill this in as you go. For each check, change `[ ]` → `[x]` if it passed, or `[!]` if it failed, and add a one-line note. At the end, hand this file back to Claude — anything marked `[!]` becomes a `BUG-046+` entry.

**Environment:** staging `10.1.13.98`
**Latest deployed commit:** `0c6d27c` (`origin/develop`)

| URL | Use |
|---|---|
| https://ctmp-admin.hadiclinic.com.kw:4202 | Admin portal |
| https://vn.hadiclinic.com.kw:4201 | Vendor portal (NOT :443 — firewalled) |
| http://10.1.13.98:8025 | MailHog — every outbound email lands here |

**Admin login:** `admin@ctmp.local` / `Admin@12345!` (login DTO expects `username`, not `email`)

---

## Pre-flight — fresh test tender

Pick or create a tender to walk through. Note the ID here so every later check ties back to the same record.

- Tender code: _TDR-2026-0009___________________
- Procurement type: ✅ PUBLIC  ☐ INVITATION_ONLY
- At least 1 RFQ doc uploaded: [ ✅]
- At least 1 invited vendor (only if INVITATION_ONLY): [ ✅]
- Per-tender criteria added with weights summing to **exactly 100%**: [ ✅]

Note: ___________________________________________________________

---

## Phase A — In-app PDF viewer (BUG-037)

- [!] Opening a bid document opens the **full-screen modal** viewer (not a new tab, not inline-embedded, not split-pane)
- [!] Viewer is **view-only** — no annotation / private notes / comments controls
- [!] After viewing, the event appears in `/audit-log` for that tender (event = document view)
- [!] Closing the modal returns to the previous page intact (no broken state)
- [ ] As a **System Admin**, commercial PDFs are **not** viewable by default (separation of duties)

Notes: ____________________________________________________________

---

## Phase B — Technical Comparison page (BUG-036)

URL: `/technical-comparison` → pick the test tender.

- [!] Matrix renders (vendors-as-rows ↔ criteria-as-rows toggle works)
- [!] Sticky first column behaves correctly when scrolling
- [x] Gate (mandatory) criteria show a badge
- [!] Per-vendor card opens with per-criterion consensus + per-evaluator breakdown including notes
- [! ] Sidebar entry "Technical Comparison" is permission-gated (hidden for roles without `comparison:technical:view`)

Notes: ____________________________________________________________

---

## Phase C — Commercial Comparison page (BUG-035)

URL: `/commercial-comparison` → pick the test tender (must be past committee commercial opening).

- [ ] **Lowest-PASS row** is highlighted with **Award icon + "Lowest PASS" badge** and is **pre-selected**
- [ ] FAIL rows are grayed at ~60% opacity
- [ ] Summary ↔ Itemized toggle works (Itemized may be a placeholder card — that's expected)
- [ ] Expanding a vendor card shows **5 blocks**: line items / tech detail (link to Technical Comparison) / commercial docs (via PDF viewer modal) / vendor profile / Recommend button
- [ ] Audit-view-count badge in header links to `/audit-log?tenderId=…`
- [ ] **No XLSX export button on this page** (removed by Phase C; analyst exports live in `/reports`)

Notes: __FAiled totaly cant reach to commercial comparison __________________________________________________________

---

## Phase D — Award flow + Quorum + Amend (BUG-039 / BUG-040 / BUG-041)

### D1 — Quorum gate

- [ ] QuorumStatus chip in the Commercial Comparison page header reflects committee attendance
- [ ] With **chair absent** or **count below quorum**, Confirm is **blocked** with a clear reason
- [ ] After marking chair present + quorum count met, Confirm becomes available
Cant reach to this level

### D2 — Zero-friction Confirm (lowest-PASS)

- [ ] Click Recommend on the **pre-selected lowest-PASS** vendor → AwardConfirmDialog opens
- [ ] Confirm with **no text and no PDF** succeeds (zero-friction path)
- [ ] Tender state flips to **`Awarded`**; winning bid → **`AWARDED`**
Cant reach to this level

### D3 — Override path (non-lowest)

- [ ] Picking any **non-lowest** PASS vendor enforces **text ≥100 chars AND PDF upload**
- [ ] Attempting Confirm with only text OR only PDF is blocked client-side AND server-side
Cant reach to this level

### D4 — Notifications opt-in

- [ ] Winner-notify + Loser-notify toggles default **OFF**
- [ ] Ticking winner-notify + confirming → email appears in MailHog for the winning vendor's primary contact
- [ ] Ticking loser-notify + confirming → email appears in MailHog for each losing vendor
- [ ] With both toggles OFF, **no** emails are sent
Cant reach to this level

### D5 — Amend Award

On the now-awarded tender:

- [ ] "Amend Award" button visible only when status = `Awarded`
- [ ] Amend dialog **always** requires text + PDF (no zero-friction path)
- [ ] After amend: original Award row + amendment row are **both visible forever** (the original is superseded, not deleted)

Notes: __ Cant reach to this level__________________________________________________________

---

## Phase E — Award Minutes PDF + vendor banners (BUG-038 / BUG-042)

### E1 — Award Minutes PDF

- [ ] "Generate Award Minutes" button appears on an awarded tender
- [ ] Clicking it downloads a PDF
- [ ] PDF contents include: header, decision summary, justification block, all bids considered (winner highlighted, FAIL rows grayed), committee attendance, notification opt-in flags, **SHA-256 footer**
- [ ] Re-generating produces a fresh copy (a new `award_minutes` row is appended; old copy remains)
Cant reach to this level

### E2 — Vendor portal banners

Log in to the vendor portal as the **winning** vendor:

- [ ] `/bids/[bidId]` shows the **emerald "You have been awarded"** banner

Log in as a **losing** vendor on the same tender:

- [ ] `/bids/[bidId]` shows the **slate "Awarded to another vendor"** banner (thank-you tone, not error)

Notes: ___Cant reach to this level_________________________________________________________

---

## Phase F — Criteria library + per-tender editor (BUG-043 / BUG-044)

### F1 — Library admin page

URL: `/settings/evaluation-criteria`

- [ x] Sidebar entry "Evaluation Criteria" is gated by `criteria:library:manage`
- [ x] Table lists the 6 seeded entries (or whatever has been added since)
- [ x] Show-inactive toggle filters correctly
- [ x] Add new entry works (name + description + default weight + default max score + default gate + active)
- [x ] Edit existing entry works
- [x ] Trash icon **soft-deletes** (entry becomes inactive, not removed)

### F2 — Per-tender editor

On a Draft / InternalReview / Approved tender → edit page:

- [ x] TenderCriteriaEditor section renders inline
- [ x] "Add from library" populates a row from a library entry
- [ !] "Add custom" creates a blank editable row
- [! ] Code auto-generates from the name slug
- [ !] Live weight-sum total turns **green at exactly 100**, red otherwise
- [ x] Save is **disabled** until weights == 100
- [ !] On a `Published` (or later) tender, the editor is locked / read-only

### F3 — Technical Evaluation pulls per-tender criteria

- [! ] On the test tender, Technical Evaluation scorecard shows the **per-tender** criteria you configured (not the old hardcoded defaults)
- [! ] On a pre-Phase-F tender (no `tender_technical_criteria` rows), it falls back to defaults gracefully

Notes: ____________________________________________________________

---

## Phase G — Reports cleanup (BUG-045)

URL: `/reports`

- [ !] The **Commercial Comparison** card is **GONE** from the catalog
- [ !] Other reports still render and export: Tender Summary / Tender Lifecycle / Vendor Directory / Vendor Activity / Bid Submissions / Technical Evaluations / Award History / Audit Trail (8 total)

Notes: ____________________________________________________________

---

## Cross-cutting sanity checks

- [ ] **System Admin** sees admin-side pages but does **NOT** see commercial PDFs / commercial details by default (separation of duties)
- [ ] **Audit log** has entries for: tender state changes, document views, award confirm, award amend, notification dispatch, criteria changes
- [ ] **Late bid** submission is blocked (no exception granted)
- [ ] **Submitted bid** cannot be edited or re-uploaded by the vendor
- [ ] Vendor self-registration still requires CAPTCHA (don't try to spam — just confirm the field renders)
- [ ] No `commercial_comparison` XLSX export endpoint responds: `POST /api/v1/reports/commercial_comparison/export` returns 404 (skip if you don't have curl handy — server-side already verified)

Notes: ____________________________________________________________

---

## Free-form findings

Anything that didn't fit a checkbox above — UI bugs, copy issues, suggestions, "this felt slow", "this label is confusing" — drop one bullet per finding. I'll triage into BUG-046+ when you hand this file back.

-
-
-

---

## When you're done

1. Save this file.
2. Tell me you're done — I'll read it, open BUG-046+ entries for every `[!]` and every free-form finding, update the trackers and HANDOVER, and commit.
