# Production mock run — TDR-2026-0001 — 2026-08-25

**What this was:** the first complete tender lifecycle ever executed on production, run through the
browser against `https://ctmp.hadiclinic.com.kw:4202` and `https://vn.hadiclinic.com.kw:4201`.

**Outcome:** all 13 workflow steps completed, then the tender was **cancelled** (not purged) on the
owner's instruction, so reference `TDR-2026-0001` is permanently consumed and can never be reissued
to a genuine tender.

Everything below was observed, not inferred. Where something was *not* verified, it says so.

---

## The tender

| | |
|---|---|
| Reference | `TDR-2026-0001` (id `c1919149-f5e5-4d88-b51e-b88c6455cbff`) |
| Title | MOCK RUN — DO NOT PROCESS — Server Room Upgrade |
| Budget | `50000.000` KWD · Open Tender · PUBLIC · IT Services |
| BoQ | 3 lines — rack+PDU (qty 2), UPS 10kVA (1), structured cabling (1) |
| Criteria | `TECHNICAL_CLINICAL_SUITABILITY` max 40 / weight 40 (mandatory), `VENDOR_QUALIFICATION` max 10 / weight 60 |
| Bidders | Vendor1 (`ghuffy11@hotmail.com`), vendor2 (`ghuffy11@gmail.com`) — the only two vendors on production |
| Award | **vendor2, KWD 23,265.750** (lowest technically-passing) |
| Final status | `CANCELLED` |

Only the owner's own two vendor accounts exist on production, so nothing labelled
"MOCK RUN — DO NOT PROCESS" could reach a genuine supplier. Winner/loser award emails were
deliberately left **unsent**.

---

## What was proven to work

**The audit hash chain is intact — 77 of 77 rows.** This is the headline result. `verifyChain()`
normally runs only at API boot, so it was replicated exactly (same `canonicalize()`, same payload
construction) and run against the live rows without restarting production. The chain now contains
`TENDER_CREATED` carrying `50000.000`, every BoQ price write, and `AWARD_CONFIRMED` carrying
`23265.750` — all `Prisma.Decimal` values. **Before the 2026-08-24 Decimal fix, every one of those
would have broken the chain.** Production had previously verified clean only because it held zero
tenders; the first budgeted tender would have broken it.

**Audit trail attribution is fixed.** The tender's Audit Trail now reads
`Ghuffran Anwar (PROCUREMENT_ADMIN)` for staff actions and `Vendor1` / `vendor2` for vendor actions.
`system` appears exactly once, on a genuinely system-generated email event. No `Invalid Date`
anywhere. This closes the complaint that opened the investigation.

**Document integrity is real, not decorative.** All four bid PDFs were SHA-256-checksummed
server-side; each digest matched the local original byte for byte. At commercial opening the
platform re-hashed the stored files and stamped `hash_verified_at` — both showed **VERIFIED**. The
Award Minutes PDF (119 KB) on disk matches its stored `sha256` exactly.

**The seal held.** After technical opening, technical envelopes were `OPENED` while both commercial
envelopes remained `SUBMITTED` / `NOT OPENED`. The technical evaluation screen carried an explicit
"Commercial envelopes remain sealed" banner throughout.

**Every committee gate fired.** Opening commercial envelopes required, and was blocked without:
a scheduled session, minimum-2 quorum plus chair present, and remarks of ≥20 characters. The
scheduled-time gate genuinely blocked the action until 17:00.

**Risk grading is correct.** `COMMERCIAL_ENVELOPES_OPENED` and `AWARD_CONFIRMED` are `CRITICAL`;
`TECHNICAL_RESULTS_FINALIZED` and `TENDER_CANCELLED` are `HIGH`.

**Money precision survives end to end.** `4980.125 × 2 = 9960.250`, bid total `23265.750`, award
amount stored `23265.750`. Three decimals throughout the write path.

**Separation of duties is enforced and visible.** The commercial comparison page states that
System Administrators do not receive commercial access automatically. System Admin was not seated
on the committee.

**No native browser dialogs.** Bid submission, envelope opening, finalisation and cancellation all
used in-app modals.

---

## Findings

Ordered by how much they matter. None blocked the run.

**#2 has since been downgraded to a copy fix** — the owner confirmed on 2026-08-25 that private
clarification replies are the intended design. It keeps its position here so the numbering matches
the tracker and the handover.

### 1. Publishing a tender notifies nobody

`notification_logs` gained **no row** when the tender was published. This is the known deferred
BUG-016 (broader publish-notification dispatch), not a regression — but stated plainly: on
production today, a published tender reaches suppliers only if they happen to log in and look.
Worth an explicit decision before go-live.

### 2. The vendor portal promises public clarification replies the system never sends

**Private replies are the intended design — confirmed by the owner on 2026-08-25.** The behaviour
is correct. This finding is only about the wording.

`clarifications.service.ts:266` hardcodes `isPublic: false` on every reply, so no reply is ever
visible to another bidder. The data model does support the alternative — migration `010` moved
`is_public` onto each reply specifically so a thread could be shared — but nothing sets it true and
the admin UI exposes no control. That is deliberate and matches the owner’s intent.

What is wrong is the placeholder on the vendor tender page
(`apps/web-vendor/src/app/(portal)/tenders/[id]/page.tsx:406`):

> *Ask a question about this tender. Replies marked as public are visible to all bidders; private
> replies only to you.*

It tells suppliers a public reply is possible. It is not. Observed during the run: Vendor1 asked
whether an external maintenance bypass switch was required, the answer made it mandatory, and
vendor2’s page showed *No clarifications posted yet.* — correct behaviour, but a bidder reading
that placeholder would reasonably expect an answer of general application to be shared.

**Fix:** reword the placeholder so it says replies go only to the asking bidder. If information
ever has to reach every bidder, that is an addendum to the tender document, not a clarification
reply.

### 3. Three different technical scores appear under the same "/ 50" label

The criteria carry both `max_score` and `weight`, and different screens use different ones:

| Screen | vendor2 shows | What it actually is |
|---|---|---|
| Technical scorecard | `38 / 50` | raw scores ÷ sum of `max_score` |
| Submitted-bids badge | `78 / 50` | **weighted /100 numerator against the /50 denominator** |
| Commercial comparison | `39 / 50` | weighted 78 rescaled to a 50-point display |

`78 / 50` is a score above its own stated maximum. `Min. 70 to pass` is tested against the weighted
/100 figure, so it is a percentage — but it sits directly beside "CURRENT SCORE 38 / 50", which
reads as 70 points on a 50-point scale and is impossible. Vendor1 happens to read `45` on all three
screens, which hides the inconsistency from anyone spot-checking a single bid.

Nothing was mis-awarded — pass/fail and ranking used the weighted score consistently. But an
evaluator reconciling two screens would find a discrepancy they cannot explain, on an evaluation
record that has to withstand challenge.

### 4. The awarded amount loses a decimal in the Awarded Tenders archive

Stored: `23265.750`. Commercial Comparison renders `KWD 23,265.750`. The **Awarded Tenders**
archive renders `23,265.75 KWD` — two decimals — in both the header line and the AWARDED AMOUNT
card. KWD carries three decimal places (fils). This is the permanent read-only archive of past
procurement decisions, which is where the figure matters most.

### 5. The vendor bid wizard renders icon names as literal text

Material Symbols ligatures are not resolving on the vendor bid wizard route, so the icon *names*
render as words: `chevron_right` in the breadcrumb, `schedule` beside the deadline, a large grey
`upload_file` in the middle of **both** upload drop zones, `description` beside each filename,
`verified` on the success screen and `warning` on the certification notice.

Admin portal icons render correctly, so it is specific to the vendor portal. This is the screen
every supplier uses to bid — the first impression of the platform.

### 6. Technical envelopes are not hash-verified at opening

`bid_envelopes.hash_verified_at` is set for both COMMERCIAL envelopes at opening and left **NULL**
for both TECHNICAL envelopes. Technical submissions are evidence too; their integrity is checked at
upload and at nothing thereafter.

---

## Not verified

**The rendered wording of the Award Minutes PDF.** The file exists, is a valid 119 KB PDF, and its
on-disk SHA-256 matches the database record. Its text is stored as subsetted-font glyph IDs rather
than literal strings, so it could not be extracted without CMap decoding. The document's *contents*
have not been read. It opens fine in the browser and should be eyeballed once.

---

## Sequence executed

| # | Step | Result |
|---|---|---|
| 1 | Draft created, BoQ + criteria + document | ✅ budget stored `50000.000` |
| 2 | Submitted for approval | ✅ |
| 3 | Approved (≥20-char comment) | ✅ `actor=PROCUREMENT_ADMIN` recorded |
| 4 | Published | ✅ — but no notification dispatched (finding 1) |
| 5 | Clarification asked + answered | ✅ — forced private (finding 2) |
| 6 | Submissions closed | ✅ |
| 7 | Technical envelopes opened | ✅ commercial stayed sealed |
| 8 | Both bids scored + notes + finalised | ✅ Vendor1 90, vendor2 78 (weighted) |
| 9 | Commercial sealed | ✅ status `COMMERCIAL_SEALED` |
| 10 | Committee session, quorum 3/3, envelopes opened | ✅ all gates enforced, checksums VERIFIED |
| 11 | Commercial comparison | ✅ vendor2 auto-selected as lowest PASS |
| 12–13 | Award confirmed + minutes generated | ✅ `23265.750`, minutes SHA matches |
| — | **Cancelled** | ✅ `CANCELLED`, reference permanently consumed |

Audit chain re-verified after cancellation: **77 rows OK (id 1..77)**.

---

## Housekeeping

Four generated bid PDFs were written to `D:\Work\CTMP\_mockrun_tmp` for upload and deleted
afterwards. Temporary verification scripts copied to the build box, the production host and the
`ctmp-api` container were removed from all three. Nothing was left behind on any server.

`ctmp_pre*.dump` and the nightly backups were untouched. No other project on any host was accessed.
