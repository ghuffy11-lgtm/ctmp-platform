I need you to test the CTMP procurement platform step by step.
Follow this batch (Sections 6-8) exactly.

Credentials:
  Admin     = admin@ctmp.local     / Admin@12345!   at http://10.1.13.98:4200
  Committee = committee@ctmp.local / Admin@12345!   at http://10.1.13.98:4200
  Vendor    = acme@testco.com      / Vendor@12345!  at http://10.1.13.98:4300
  MailHog emails at http://10.1.13.98:8025

For each step: attempt it, report PASS/FAIL, and if FAIL describe exactly
what you see (error message, wrong redirect, missing element, etc.).
If a step is completely blocked, note it and move to the next section.
Do not stop on first failure — complete the full batch.



# CTMP Manual Test — Batch 2 (Sections 6-8)

**Environment:** http://10.1.13.98:4200 (Admin) · http://10.1.13.98:4300 (Vendor)

**Prerequisites (already completed in Batch 1):**
- Vendor `Acme Builders LLC` is registered and approved
- Tender `Office Renovation 2026` exists and is in `Published` status (the tender reference is `TDR-2026-XXXX` — find it in the Tenders list)

**Goal of this batch:** Submit a bid, close submissions, evaluate technical, schedule and run a committee commercial opening.

**Instructions for tester:**
- Follow each step in order.
- In the **Result** column write `PASS`, `FAIL`, or `PARTIAL`.
- In the **Notes / Issue** column describe exactly what happened if it was not PASS.
- If a date input field will not accept typed values, you may set it via JavaScript — the system handles either approach.

---

## Test Credentials

| Role | URL | Username | Password |
|------|-----|----------|----------|
| System Admin | http://10.1.13.98:4200 | admin@ctmp.local | Admin@12345! |
| Committee Member | http://10.1.13.98:4200 | committee@ctmp.local | Admin@12345! |
| Vendor | http://10.1.13.98:4300 | acme@testco.com | Vendor@12345! |

---

## Section 6 — Vendor Browses and Bids on Tender

| # | Action | Expected Result | Result | Notes / Issue |
|---|--------|-----------------|--------|---------------|
| 6.1 | Open http://10.1.13.98:4300 and log in as `acme@testco.com` / `Vendor@12345!` | Vendor dashboard opens | | |
| 6.2 | Click **Tenders** in the vendor sidebar | `Office Renovation 2026` appears in the list | | |
| 6.3 | Click on the tender | Tender detail page opens with description and deadline | | |
| 6.4 | Click **Start Bid** | Bid wizard opens (Step 1: Confirm tender details) | | |
| 6.5 | Click **Continue** on Step 1 | Step 2 opens (Technical Envelope upload) | | |
| 6.6 | Upload a Technical file — any small text file (e.g. `technical.txt` with one line of content) | File uploads. SHA-256 checksum is displayed under the file name. | | |
| 6.7 | Click **Continue** to Step 3, upload a Commercial file (`commercial.txt` with one line) | File uploads with checksum shown | | |
| 6.8 | Click **Continue** to Step 4 — Review and Submit | Summary shows both envelopes, Submit button active | | |
| 6.9 | Click **Submit Bid** | Confirmation page shows receipt with reference number and timestamp | | |
| 6.10 | Record the bid receipt reference here: | | | |

---

## Section 7 — Close Submissions & Technical Evaluation

| # | Action | Expected Result | Result | Notes / Issue |
|---|--------|-----------------|--------|---------------|
| 7.1 | In Admin portal (separate tab, logged in as admin), navigate to **Tenders** → click `Office Renovation 2026` | Tender detail loads. Status is `Published`. Bid count shows at least 1. | | |
| 7.2 | Click **Close Submissions** | Status changes to `Submission Closed` | | |
| 7.3 | Click **Open Technical Envelopes** (button appears once status is `Submission Closed`) | Status changes to `Technical Opening` | | |
| 7.4 | Click **Technical Evaluation** in sidebar | Technical Evaluation workspace opens | | |
| 7.5 | Select the tender from the left panel | Bid list appears in the center panel — vendor name shown with envelope status `OPENED` | | |
| 7.6 | Click the bid | Scorecard panel appears on the right with 4 criteria | | |
| 7.7 | Enter scores: Compliance=24, Experience=20, Methodology=20, Support=16 (total **80/100**) | Scores accepted, total displayed | | |
| 7.8 | Click **Save Evaluation** | Save succeeds. Bid marked `PASS 80/100`. | | |
| 7.9 | Click **Finalize Technical Results** (confirm in dialog) | Tender status changes to `Commercial Sealed`. Scorecard locked. | | |

---

## Section 8 — Committee Commercial Opening

| # | Action | Expected Result | Result | Notes / Issue |
|---|--------|-----------------|--------|---------------|
| 8.1 | Click **Committee & Commercial** in sidebar | Workspace opens. Your tender appears in the left list with status `Commercial Sealed`. | | |
| 8.2 | Select the tender | Center panel shows "No committee session scheduled" with a **Schedule Committee Session** button | | |
| 8.3 | Click **Schedule Committee Session** | Inline form appears with date, time, and member checkboxes | | |
| 8.4 | Pick date = today, time = 10:00, tick **both** `admin@ctmp.local` and `committee@ctmp.local`, click **Create Session** | Session created. Members panel populates with both users. Status shows `SCHEDULED`. | | |
| 8.5 | Mark both members **PRESENT** (click the PRESENT button next to each member) | Both members marked PRESENT. Quorum indicator turns green: `Quorum met (2/2)`. | | |
| 8.6 | Type opening remarks (e.g. `Commercial opening session — both members present, no conflicts of interest declared.`) into the remarks textarea | Textarea accepts text | | |
| 8.7 | Click **Open Commercial Envelopes** (confirm in dialog) | Attendance is auto-saved, then envelopes are opened. Tender status transitions to `Committee Commercial Opening` then `Commercial Evaluation / Comparison`. Opening records appear in the right panel. | | |

---

## Batch 2 Feedback Summary

| Section | Step | Severity | Description | Status |
|---------|------|----------|-------------|--------|
| | | | | |
| | | | | |
| | | | | |

**Severity guide:**
- **High** — blocks the workflow, cannot proceed
- **Medium** — works but incorrectly or with errors
- **Low** — cosmetic or minor UX issue

**Once complete, paste the table back so the next batch (Sections 9-12) can be picked up.**
