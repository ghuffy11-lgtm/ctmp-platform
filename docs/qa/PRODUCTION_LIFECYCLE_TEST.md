# Production lifecycle test — Claude-in-Chrome runbook

**Target:** production. `https://ctmp.hadiclinic.com.kw:4202` (admin) and
`https://vn.hadiclinic.com.kw:4201` (vendor).
**Purpose:** exercise the live money path once, end to end, with real data — then remove it.
**Written:** 2026-08-22, after the `prod-20260822` deploy. Reusable.

Production has processed **zero tenders** since going live in June 2026. Every control in this
system — sealed envelopes, quorum, separation of duties, money precision — has been verified on dev
and never once on production. That is what this test closes.

The same run doubles as the owner's verification of the three fixes shipped on 2026-08-22, which
went to production without a dev walkthrough by the owner's decision. They are marked **[FIX]**
below.

---

## How to use this file

**As a Claude-in-Chrome prompt.** Paste the *Operating rules* section plus one *Stage* at a time
into a session that has the Chrome tools available. Do not paste the whole file and say "do this" —
the stages have gates between them that a single autonomous pass will run straight through.

**As a human checklist.** Ignore the second-person voice and follow the steps.

Either way, fill in the **Result** column of the record table at the bottom as you go, and paste
that table into `agents/handoffs/HANDOVER.md` when finished.

---

## STOP — read before booking time

### 1. Production has the permissions, but no separation between people

Production has four internal users: `admin@hadiclinic.com.kw` (`SYSTEM_ADMIN`) and three
`PROCUREMENT_ADMIN`s. Nobody holds `APPROVER`, `TECHNICAL_EVALUATOR` or
`COMMERCIAL_COMMITTEE_MEMBER`.

**This does not block the test.** Permissions here do not follow role names. `PROCUREMENT_ADMIN`
holds `tender:approve`, `technical:open`, `technical:evaluate`, `committee:create_session`,
`committee:record_attendance`, `committee:open_commercial` and `commercial:view`. Committee
membership is not role-gated either — `committee_members.user_id` references `users(id)` with no
role check, and `is_chair` is a per-session flag. `SYSTEM_ADMIN` holds `award:recommend` and
`award:finalize`. The four existing accounts can complete the whole lifecycle.

> An earlier revision of this runbook said production could not complete a tender at all. That was
> wrong — it read role names instead of grants. Full table in `docs/PROJECT_STATE.md`.

**What it does mean for the test.** Run with the existing accounts, but read the separation-of-duties
checks in Stages 8 and 10 carefully: with one person holding every role, several of those refusals
**will not fire**, and that is the configuration's doing rather than a bug. Record which ones could
not be exercised instead of marking them passed.

The one real split that survives: `SYSTEM_ADMIN` can recommend and finalise an award but
deliberately **cannot** see commercial detail (`commercial:view` is withheld). **Stage 11 should
confirm the award flow is usable under that restriction** — that is the most interesting thing this
run can discover.

### 2. Vendor accounts

Production has **2 approved vendors / 2 vendor users**. A meaningful commercial comparison needs
**at least two bidders**, so two vendors is exactly enough — but both are real suppliers, and this
test will attach a test bid to their record. Teardown removes the bid; the audit trail keeps the
record that it happened (by design — `audit_logs` is append-only and hash-chained).

If you would rather not touch real supplier records, register two throwaway vendors first — but
production uses a **real hCaptcha key**, so registration needs a human to solve it. Claude cannot,
and must not attempt to.

### 3. Credentials

**Claude must not type passwords into any field.** Log in yourself in both portals, then hand the
authenticated tabs over. This applies to every persona switch in the test — plan for the owner (or
each role-holder) to be at the keyboard at each switch.

---

## Operating rules — paste these into the Chrome session

> You are driving a **live production** procurement system for a single scripted test tender.
>
> 1. **Touch only the test tender.** Its reference will be `TDR-2026-####`, given to you after
>    Stage 1. Never open, edit, cancel or act on any other tender, vendor, user or setting.
> 2. **Never type a password, and never solve a CAPTCHA.** If a login screen or CAPTCHA appears,
>    stop and ask the human to complete it.
> 3. **Never click Cancel on the tender.** Cancellation is not part of this test and is not
>    cleanly reversible. If you think you need it, stop and ask.
> 4. **Do not change any Settings**, role, permission, department, category or vendor record.
> 5. **Report what you observe, not what you expect.** If a button is missing, say it is missing —
>    a missing button is frequently the *correct* result in this system (separation of duties).
> 6. **Stop at every `GATE` line** and report before continuing.
> 7. Take a screenshot at each `📸` marker and name it for the stage.
> 8. If any step fails, **stop** and report — do not improvise a workaround. The last test found a
>    real defect precisely because the workaround was recorded rather than hidden.

---

## Personas

| # | Persona | Account | Stages |
|---|---|---|---|
| P1 | Procurement Admin | `ghuffran@hadiclinic.com.kw` | 1–3, 5, 6, 8, 9, 10, 11 |
| P2 | Second Procurement Admin (approves) | `EZAZM@hadiclinic.com.kw` | 4, 5 |
| P3 | Vendor A | existing approved vendor #1 | 7 |
| P4 | Vendor B | existing approved vendor #2 | 7 |
| P5 | System Admin (award only) | `admin@hadiclinic.com.kw` | 11 (recommend/finalise), 12 |

Committee members for Stage 10: add `ghuffran@`, `EZAZM@` and `walidb@` to the session, chair one of
them. No extra accounts needed.

**Use a *different* procurement admin to approve (P2) than the one who created the tender (P1).**
It is the only separation this configuration can actually demonstrate. If the system permits the
same person to create and approve, that is worth recording explicitly.

**Every persona switch needs the owner at the keyboard** to perform the login. Claude drives only
after the tab is authenticated. There are six switches — worth batching the test into one sitting
rather than spreading it across days.

---

## The test tender

| Field | Value |
|---|---|
| Title | `PRODUCTION SMOKE TEST — DO NOT PROCESS — <today's date>` |
| Department | any |
| Category | any |
| Procurement Type | **Open Tender** |
| Visibility | Public |
| Est. Budget | `50,000.000` |
| Submission Deadline | today + 2 days |
| Clarification Deadline | today + 1 day |
| BoQ | 3 lines, unit prices with **3 decimals** (e.g. `1250.750`, `3400.125`, `900.500`) |
| Criteria | 2 weighted technical criteria totalling 100% |

The title is deliberately shouty. Anyone who stumbles on it in the live system should know
immediately not to act on it.

---

## Stages

### Stage 1 — Create the tender · P1

`/tenders` → **Create New Tender**. Fill: Tender Title, Department, Category, Procurement Type,
Visibility, Tender Description, Est. Budget, Submission Deadline, Clarification Deadline.

📸 the completed form before saving.

**Record the reference number** (`TDR-2026-####`). Everything downstream keys off it.

`GATE` — report the reference before continuing.

### Stage 2 — BoQ and criteria · P1

Add the 3 BoQ lines with 3-decimal unit prices, and the 2 weighted criteria (weights must total
100%; mark at least one as a mandatory gate).

✅ **Check:** the BoQ unit-price inputs *accept and retain* the third decimal. This is migration
`055` (`numeric(16,3)`). If a price renders as `1250.75`, stop — that is a money-precision
regression and matters more than the rest of the test.

### Stage 3 — Submit for approval · P1 · **[FIX]**

Open the tender's **edit** page → **Submit for Approval**.

**[FIX] First, prove the new guard fires.** Before submitting properly, temporarily clear
**Procurement Type** (or Est. Budget) and press Submit for Approval.

✅ **Expect: refusal, with a message naming the missing field.** Before 2026-08-22 this was
accepted and the tender became permanently stuck — publish demanded the field, the edit form would
no longer send it, and revert did not work from Approved. The only exit was Cancel.

📸 the refusal message. Then restore the field and submit properly.

### Stage 4 — Approve · P2

`/approvals` → the tender → approve **with written comments**.

✅ **Check:** approving with the comment box empty is refused.

### Stage 5 — [FIX] Revert round-trip · P1 · **[FIX]**

The tender is now `Approved`. This stage exists only to prove the second half of the dead-end fix,
then puts the tender straight back.

1. On the tender detail page, confirm a **Revert** control is present *on an Approved tender*.
   Before 2026-08-22 it appeared only on Published.
2. Open it — the dialog is titled **Revert tender**.
   ✅ **Expect:** it offers only statuses *earlier* than Approved (Draft, Internal Review) —
   **not** Published, and not Approved itself.
3. Revert to **Internal Review**. 📸
4. Re-submit for approval (P1) and re-approve (P2) to get back to `Approved`.

`GATE` — report before publishing. Publishing is the first stage visible to real suppliers.

### Stage 6 — Publish · P1

Publish the tender.

⚠️ **Real vendors can now see this tender in their portal.** That is unavoidable in a genuine
end-to-end test and is why the title shouts. Keep the window from here to teardown short.

✅ **Check:** the tender appears in the vendor portal tender list (Stage 7 confirms).

### Stage 7 — Two bids · P3, P4

For each vendor, in the vendor portal: `/tenders` → the tender → start a bid. The wizard is
**Tender → Technical Envelope → Commercial Pricing → Commercial PDF → Review & Submit** (a
*Supporting Documents* step appears between Commercial PDF and Review if the tender requires it).

Give the two vendors **different** BoQ prices so the comparison has a real lowest bidder. Fill all
5 Commercial Terms (brand/manufacturer, country of origin, warranty, delivery period, payment
terms). PDF uploads only — the system rejects anything else by design.

**[FIX] At Review & Submit, press submit.**

✅ **Expect: a styled in-app modal titled "Submit your bid"** — *not* a grey browser dialog.
Before 2026-08-22 the single most consequential, irreversible action a supplier takes was announced
by unstyled browser chrome. 📸 the modal.

✅ **Check after submitting:** the bid cannot be edited, re-uploaded or withdrawn. Submitted bids
are immutable — enforced at five points in the API.

### Stage 8 — Close submissions, open technical envelopes · P1

Close submissions, then open the **technical** envelopes.

✅ **Separation of duties — expect a refusal.** Confirm the **Procurement Admin has no control to
open technical envelopes**. A missing button here is the correct result. If P1 *can* open them,
that is a serious finding — stop and report.

✅ **Check:** commercial envelopes remain `SEALED`. Verify in the UI *and* in SQL (below).

### Stage 9 — Technical evaluation · P5

`/technical-evaluation` → score both bids against both criteria → finalise.

✅ **Check:** overall PASS/FAIL is decided by the **mandatory gates only**. The weighted total is
for ranking and must never drive PASS/FAIL.

Then `/technical-comparison` → per-criterion consensus renders for both vendors.

### Stage 10 — Committee commercial opening · P6

`/committee-opening` → create the session → mark attendance → open commercial envelopes.

✅ **Check:** opening is refused **below quorum**, and refused with the required role (default
`CHAIR`) absent. Test at least the under-quorum refusal before satisfying it. 📸 the refusal.

✅ **Check:** opening refuses to proceed without written remarks.

✅ **Separation of duties, the other direction:** a committee member attempting to award gets
**403**.

`GATE` — this is the regulated action. Report before and after.

### Stage 11 — Commercial comparison and award · P1

`/commercial-comparison`.

✅ **Check:** the **lowest-priced technically-PASS** vendor is auto-highlighted and pre-selected.
✅ **Check:** prices show 3 decimals throughout.
✅ **Check:** accepting the pre-selected lowest-PASS vendor needs **one Confirm click** — no
justification text, no PDF.

Overriding to any other vendor requires **written justification of at least 20 characters**. The
PDF is **optional**, not mandatory — BUG-095 (2026-06-02, owner directive *"remove mandatory pdf
upload, just keep it optional"*) and BUG-149 (min length 100 → 20). Note the master plan
§A6/§F7 still says *"text + PDF always required"* for the confirm path; the code disagrees and the
code is what runs. **Verified on dev 2026-08-22 for the amend path** (text under 20 chars refused,
valid text with no PDF accepted); the confirm-override path was not executed, only read.

You do not need to exercise the override here — it changes the award record. It is covered by the
dev harness.

✅ **Check:** the server does not trust the client's `isLowest` flag. It recomputes the lowest-PASS
bid and refuses a false claim. Confirmed on dev.

Confirm the award. 📸

### Stage 12 — Award Minutes PDF · P1

Generate the Award Minutes PDF.

✅ **Check it contains:** the awarded value with **3 decimals** and `KWD`; the per-criterion
technical matrix; the BoQ line-item comparison; the Commercial Terms of both offers. (No
negotiation section is expected — this run has no negotiation rounds.)

📸 the relevant pages.

---

## Server-side verification — the part a browser cannot see

Run from the build box after Stage 12. Read-only.

```bash
ssh ctmp-server
sudo ssh cts-prod
REF=TDR-2026-####     # the test tender

docker exec ctmp-postgres psql -U ctmp -d ctmp <<SQL
-- money precision survived the whole path
SELECT reference_number, tender_type, status, budget_estimate, awarded_amount
FROM tenders WHERE reference_number = '$REF';

-- envelope states: commercial must have been SEALED until Stage 10
SELECT b.id, e.envelope_type, e.status
FROM bids b JOIN bid_envelopes e ON e.bid_id = b.id
JOIN tenders t ON t.id = b.tender_id WHERE t.reference_number = '$REF';

-- the two regulated actions must be CRITICAL, and the chain must be intact
SELECT event_type, risk_level, created_at FROM audit_logs
WHERE event_type IN ('COMMERCIAL_ENVELOPES_OPENED','TENDER_AWARDED')
ORDER BY created_at DESC LIMIT 10;

-- no security alert may have been raised during the run
SELECT count(*) AS alerts_today FROM security_alerts
WHERE created_at > now() - interval '1 day';

-- procurementType stayed canonical (migration 056)
SELECT tender_type, count(*) FROM tenders GROUP BY 1;
SQL
```

Then confirm the audit hash chain still verifies — restart is not needed, the API checks on boot:

```bash
docker logs ctmp-api 2>&1 | grep -i "audit chain"
# expect: "Audit chain verified — N rows OK"
```

✅ `awarded_amount` must carry 3 decimals.
✅ `alerts_today` must be `0`.
✅ `tender_type` must contain only `Open Tender`, `Restricted`, `Single Source`, `NULL`.

---

## Teardown

**Prove the purge on dev first.** `scripts/purge_tender.sh` has never been run anywhere. Its first
live use must not be against production.

```bash
# on the build box — dev, dry run, changes nothing
cd /mnt/repo/ctmp-platform && bash scripts/purge_tender.sh TDR-2026-0028
# then for real on dev, and confirm the dev tender is gone and the audit chain still verifies
bash scripts/purge_tender.sh TDR-2026-0028 --confirm
```

Only once that is clean:

```bash
SSH_ALIAS=cts-prod bash scripts/purge_tender.sh $REF            # dry run
SSH_ALIAS=cts-prod bash scripts/purge_tender.sh $REF --confirm  # real
```

A confirmed run takes its own `pg_dump` first and aborts if that fails. `audit_logs` is
deliberately **not** touched — the trail will still show the tender existed and was worked on, and
that is correct. Migration `053` dropped the audit FKs precisely so this is possible.

Afterwards:
- Confirm the tender is gone from both portals.
- Confirm `docker logs ctmp-api | grep "audit chain"` still reports **verified**.

**No test users to remove** — this run uses the four existing production accounts, so there is
nothing extra to clean up. If a future run *does* create temporary users, note that
`purge_tender.sh` removes tender data only and **does not touch users**; deleting them is a
separate manual step, and the audit trail will still record that they existed and acted, which is
correct and must not be "cleaned up".

---

## Result record

| # | Stage | Expected | Result | Notes |
|---|---|---|---|---|
| 1 | Create | reference issued | | |
| 2 | BoQ 3-decimal retained | `1250.750` survives | | |
| 3 | **[FIX]** submit refused without procurement type | refusal names the field | | |
| 4 | Approve needs comments | empty comment refused | | |
| 5 | **[FIX]** Revert present on Approved, earlier targets only | Draft/Internal Review offered | | |
| 6 | Publish | visible to vendors | | |
| 7 | **[FIX]** in-app submit modal, not browser chrome | styled modal | | |
| 7 | Bid immutable after submit | no edit path | | |
| 8 | P1 cannot open technical envelopes | no control present | | |
| 8 | Commercial stays SEALED | `SEALED` in DB | | |
| 9 | PASS/FAIL from gates only | | | |
| 10 | Under-quorum opening refused | refusal | | |
| 10 | Committee member awarding → 403 | 403 | | |
| 11 | Lowest-PASS pre-selected | auto-highlighted | | |
| 11 | One-click confirm for lowest-PASS | no text/PDF demanded | | |
| 12 | Minutes PDF: 3 decimals + all matrices | | | |
| — | `alerts_today` = 0 | 0 | | |
| — | Audit chain verified after purge | verified | | |
| — | Test tender purged | gone from both portals | | |
| — | **Separation of duties unexercised** | which refusals could not fire | ⚠️ | one person holds every role in this configuration |
| 11 | `SYSTEM_ADMIN` can award without `commercial:view` | award flow usable | | the one real split that survives |

Paste this table, completed, into `agents/handoffs/HANDOVER.md`.

---

## Known limitations of this test

- **Vendor self-registration is not exercised.** Production uses a real hCaptcha key; it needs a
  human, and Claude must not attempt it. The registration path therefore stays unverified on
  production.
- **The negotiation path is not exercised.** Adding it roughly doubles the run. It is covered on
  dev by the 2026-08-21 test.
- **The override-award path is not exercised** (picking a non-lowest vendor, which requires
  justification text *and* a PDF). Testing it would create a second award record.
- **This is a manual runbook, not an automated suite.** It has the same weakness PROJECT_STATE
  already flags about the Arabic checks: it depends on a person following it. Promoting the
  server-side block into `qa/playwright` would fix that.
