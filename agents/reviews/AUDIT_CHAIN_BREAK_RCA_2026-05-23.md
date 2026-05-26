# AUDIT_CHAIN_BREAK — Root Cause Analysis

**Date:** 2026-05-23
**Author:** RCA pass on Phase 9 follow-up
**Status:** Cause identified. Fix scoped as separate task.
**Scope:** All `AUDIT_CHAIN_BREAK` security alerts produced by `AuditService.onModuleInit()` on `ctmp-api` boot between 2026-05-21 and 2026-05-22.

## TL;DR

`AuditService.canonicalize()` (`apps/api/src/modules/audit/audit.service.ts:34–43`) handles JS `Date` objects asymmetrically with Prisma's JSONB writer:

- `canonicalize(new Date(...))` enters the generic object branch, gets `Object.keys(date).sort() === []` (Date has no enumerable own keys), and returns the literal string `'{}'`.
- Prisma serialises the same `Date` into a JSONB column via `JSON.stringify`, which calls `Date.prototype.toJSON()` and stores an ISO-8601 string (e.g. `"2026-05-21T09:09:34.840Z"`).

When `log()` runs, the hash is computed over the `'{}'` form. When `verifyChain()` reads the row back, the `Date` is now a string, the canonical contains the ISO form, the recomputed hash differs, and the verifier flags the row as broken on every boot.

**Eight rows are affected. The audit data itself is intact** — under a Date-aware canonicalize, every one of the 72 rows on the staging chain hashes to its stored value. The integrity proof is broken, not the content.

The eight `AUDIT_CHAIN_BREAK` security_alerts rows are all duplicates of the same root finding — the verifier stops at the first broken row, sees the same row 7 break on every boot, and emits another alert.

## Methodology

1. Read every `security_alerts.alert_type='AUDIT_CHAIN_BREAK'` row from `ctmp-postgres` (`10.1.13.98`, the staging DB).
2. Read every `audit_logs` row to walk the chain, focusing on rows around `metadata.brokenAtId`.
3. Wrote a one-shot diagnostic (`apps/api/scripts/verify-audit-row.js`) that runs inside the `ctmp-api` container, fetches a row + its predecessor via the same Prisma client production uses, and recomputes the chain hash two ways:
   - **verify-time canonical** — exact byte-for-byte copy of `canonicalize()` from `audit.service.ts`. Same path `verifyChain()` runs at boot.
   - **write-time canonical** — same function applied to the same row payload, but with ISO-string-looking JSONB values re-hydrated to `Date` objects before canonicalising. This simulates what `log()` would have seen in-memory before Prisma wrote to JSONB.
4. Swept all 72 rows; categorised each by which canonical matches.

Raw evidence captured in `agents/reviews/audit-chain-break-evidence-2026-05-23.md`.

## Findings

### Finding 1 — Single mechanism, eight affected rows, 64 clean rows

Staging chain length: 72 rows (no gaps; `MAX(id)=72`, `COUNT(*)=72`).

| Result | Count | Row IDs |
|--------|-------|---------|
| Both canonicals match stored hash (clean row) | 64 | all other rows |
| Only write-time canonical matches stored hash (Date-asymmetry bug) | 8 | 7, 8, 22, 27, 34, 39, 48, 70 |
| Neither canonical matches (would indicate a different bug or tampering) | 0 | — |

Every broken row is either `VENDOR_APPROVED` (5 of them: 7, 8, 27, 39, 70) or `COMMITTEE_SESSION_CREATED` (3: 22, 34, 48). Every one has a `Date` in its `afterValue`:

| Row | event_type | Date field | Date value |
|-----|------------|------------|------------|
| 7   | VENDOR_APPROVED            | `afterValue.approvedAt`  | 2026-05-21T09:09:34.840Z |
| 8   | VENDOR_APPROVED            | `afterValue.approvedAt`  | 2026-05-21T09:18:13.201Z |
| 22  | COMMITTEE_SESSION_CREATED  | `afterValue.scheduledAt` | 2026-05-21T07:00:00.000Z |
| 27  | VENDOR_APPROVED            | `afterValue.approvedAt`  | 2026-05-21T14:25:53.406Z |
| 34  | COMMITTEE_SESSION_CREATED  | `afterValue.scheduledAt` | 2026-05-21T07:00:00.000Z |
| 39  | VENDOR_APPROVED            | `afterValue.approvedAt`  | 2026-05-21T16:05:37.935Z |
| 48  | COMMITTEE_SESSION_CREATED  | `afterValue.scheduledAt` | 2026-05-21T07:00:00.000Z |
| 70  | VENDOR_APPROVED            | `afterValue.approvedAt`  | 2026-05-22T12:15:56.961Z |

### Finding 2 — Asymmetry confirmed by direct hash comparison

Row 7 verification:

- Stored `hash_chain_value = dc108206e09fced1e264a7666a1cf02785c6f6cb38dff684752a59161871b61e`
- Verify-time canonical: `…"afterValue":{"approvedAt":"2026-05-21T09:09:34.840Z","status":"APPROVED"}…` → recomputed hash `4415304556852841…` ❌
- Write-time canonical (Date re-hydrated): `…"afterValue":{"approvedAt":{},"status":"APPROVED"}…` → recomputed hash `dc108206e09fced1…` ✅ matches stored exactly

The diff is exactly `"approvedAt":"…ISO…"` vs `"approvedAt":{}`. Same pattern on all 8 rows.

### Finding 3 — Calling sites where the bug was triggered

```ts
// apps/api/src/modules/vendors/vendors.service.ts:117–135
const updated = await this.prisma.vendor.update({
  where: { id },
  data: { status: VendorStatus.APPROVED, approvedBy: actorUserId, approvedAt: new Date() },
});
await this.audit.log({
  …
  afterValue: { status: VendorStatus.APPROVED, approvedAt: updated.approvedAt }, // ← Date object
  …
});
```

```ts
// apps/api/src/modules/committee/committee.service.ts:32–58
const session = await this.prisma.committeeSession.create({
  data: { tenderId, scheduledAt: new Date(dto.scheduledAt), … },
});
await this.audit.log({
  …
  afterValue: { scheduledAt: session.scheduledAt, memberCount: dto.memberIds.length }, // ← Date object
  …
});
```

In both cases, Prisma's returned object exposes the timestamp as a JS `Date`. The audit payload then carries the `Date` straight into `canonicalize()`, which is where the asymmetry strikes.

A grep over the 15 audit-log call sites surfaced no other call passing a non-primitive non-plain-object in `beforeValue`/`afterValue`/`metadata`. These two are the only triggers in the current codebase.

### Finding 4 — Hypothesis "container restart mid-transaction breaks the chain" is wrong

The `pg_advisory_xact_lock(0x6354_4d50)` pattern (`audit.service.ts:174–217`) is correct. Postgres transaction rollback is durable: rows from an aborted transaction never become visible. No physical evidence on the staging DB shows a partial row, an orphan id, a mismatched link, or a duplicate prev-hash. All 72 rows form an unbroken link chain (`prev_hash_chain_value` of row N+1 equals `hash_chain_value` of row N, end-to-end). The link side of the chain is intact; only the payload-hash side trips on the Date asymmetry. The restart-race hypothesis is unsupported by the evidence and can be retired.

### Finding 5 — Verifier reporting is misleading on hash mismatches

At `audit.service.ts:127–134`, on `recomputed !== row.hashChainValue` the verifier returns:

```ts
return { ok: false, …, expectedPrev, actualPrev: row.hashChainValue };
```

`actualPrev` is set to *row 7's own stored `hash_chain_value`*, not the *recomputed* hash. The downstream `recordSecurityAlert()` (line 146–163) writes that into `security_alerts.metadata.actualPrev`, and into the human-readable `message`. Every existing alert message therefore reads:

> Audit hash chain integrity broken at audit_logs.id=7. Expected prev=b4b37647…5842, actual=dc108206…b61e.

That phrasing makes the failure look like a *link mismatch* (row 7's `prev_hash` doesn't match row 6's hash), when in fact it's a *payload-hash mismatch* on row 7 itself. This is the reason HANDOVER.md framed the issue as an advisory-lock / restart-race issue — a reading the message text invited but the data does not support.

This is a small, isolated logging bug separate from the canonicalize asymmetry; fixing it will make any future RCA much faster.

### Finding 6 — Alerts are duplicates, not independent incidents

Eight rows in `security_alerts`. All eight have identical `brokenAtId=7`, identical `expectedPrev`, identical `actualPrev`. One was acknowledged on 2026-05-21 16:55. The other seven are unacknowledged. The verifier writes one alert *per boot* if the chain is broken — and the chain has been broken on the same row since the first VENDOR_APPROVED audit was written.

Container restart events between 2026-05-21 10:29 and 2026-05-22 11:54 (8 boots, matches the alert count) all produced the same alert because the verifier returns at the first break and never re-checks the rest of the chain.

## Why this is bad

The spec's audit invariant is: *"audit logs are append-only and cannot be edited through the application; all sensitive actions must be audit logged."* In practice, "cannot be edited" is enforced by (a) the DB trigger `audit_logs_block_modifications` blocking UPDATE/DELETE/TRUNCATE and (b) the SHA-256 hash chain making post-hoc edits detectable.

Today, the chain's tamper-evidence on rows 7, 8, 22, 27, 34, 39, 48, 70 is broken: even though the data was never tampered with, the cryptographic proof of integrity does not validate. We can tell *this specific RCA* that no tampering occurred, but a third party doing a future audit cannot. Eight critical-severity alerts are sitting in the DB that future operators must either trust the RCA on or re-investigate.

The bug also poses an ongoing risk: any new `audit.log()` call site that passes a `Date` to JSONB will break the chain again. Tomorrow's caller, not today's, is the bigger concern.

## Why this is not as bad as it looked

- **Data integrity is intact.** Every row's content under the original write-time canonical produces exactly its stored hash. No row is missing, no row has been edited, no row has a mismatched link.
- **The bug is deterministic, not racy.** It triggers on `Date` in payload and nothing else; no concurrency, no restart, no replica race is involved.
- **The advisory-lock pattern works.** The hypothesis that motivated this RCA was operational; the answer turned out to be code-level. The lock can be left alone.
- **The verifier did its job.** It detected the asymmetry on the first boot after row 7 was written, and again on every subsequent boot — that's exactly what it was built to do.

## Recommended fix (out of scope for this RCA, queued as a follow-up)

This is a fix design only; **not implemented under this task.** The user should decide between the three options below before any code or DB write happens.

### Option A — Date-aware `canonicalize()` + chain rebake (preferred)

1. Patch `apps/api/src/modules/audit/audit.service.ts:34–43`:
   ```ts
   function canonicalize(value: unknown): string {
     if (value === null || value === undefined) return 'null';
     if (value instanceof Date) return JSON.stringify(value.toISOString());
     if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
     if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
     if (typeof value === 'object') { … unchanged … }
     return JSON.stringify(value);
   }
   ```
   The added `Date` and `Buffer` branches match Prisma's JSONB serialisation.

2. Add unit tests in `audit.service.spec.ts` for:
   - `Date` in `afterValue` round-trips deterministically.
   - `Buffer` in `metadata` round-trips deterministically.
   - Nested arrays/objects containing dates.

3. Fix the verifier logging bug at line 127–134: on hash mismatch, report `recomputed` (the value we computed) and `storedHash`, not `actualPrev: row.hashChainValue`. Adjust the alert message wording accordingly.

4. One-shot DB migration `database/migrations/008_audit_chain_rebake_2026-05-23.sql` that:
   - Disables `audit_logs_block_modifications` triggers temporarily.
   - Walks rows 7..72 in order, recomputing each row's `hash_chain_value` (with the new canonicalize) and updating subsequent rows' `prev_hash_chain_value`.
   - Re-enables the triggers.
   - Inserts a final `audit_logs` row of `event_type=AUDIT_CHAIN_REBAKE`, risk_level=CRITICAL, `metadata` containing the migration commit SHA and the count of rows rewritten. This row's hash chains forward from the rebaked row 72.
   - Bulk-acknowledges the eight existing `security_alerts` rows with `acknowledgedBy = (the system user running the migration)`, message annotation linking to this RCA.

5. After deploy, boot `ctmp-api` and confirm `verifyChain(1000)` returns `ok=true`.

**Trade-off:** This is the cleanest end state but it does require a one-time edit of audit_logs hashes. The audit *content* is not edited, only the hash columns are. Document this prominently in `DECISION_LOG.md` and in the migration file header.

### Option B — Defensive `.toISOString()` at call sites + no rebake

1. Patch every caller that passes a Prisma `Date` to `audit.log()` to stringify first:
   ```ts
   afterValue: { status: VendorStatus.APPROVED, approvedAt: updated.approvedAt.toISOString() },
   ```
2. Leave `canonicalize()` unchanged (still latently buggy for any future caller that forgets).
3. Leave the eight broken rows as-is. Add a permanent ignore-list in `verifyChain()` for ids 7, 8, 22, 27, 34, 39, 48, 70.
4. Acknowledge the existing security alerts with a permanent annotation linking this RCA.

**Trade-off:** No DB rewrite, but the underlying bug stays in `canonicalize()`. Any future contributor passing a `Date` re-triggers the issue. Ignore-lists in verifyChain are exactly the kind of thing a compliance audit hates.

### Option C — Accept as known-state, do nothing now

Acknowledge the eight existing `security_alerts` rows with a permanent annotation linking this RCA. Do not change code. Plan to address pre-production cutover.

**Trade-off:** zero work today, but production launch cannot proceed with eight unresolved CRITICAL alerts visible in the admin UI. This option only makes sense for a temporary period (e.g. while staging is the only target).

### Recommendation

**Option A.** The fix is small (≤30 LOC of code + a ~50-line SQL migration), the unit tests are obvious, the migration is one-shot and documented, and the end state restores the spec invariant cleanly. Option B is a maintenance trap, and Option C only defers the cost.

## Verifier intactness check

`verifyChain(1000)` will return `ok=true` after rebake. To confirm without a real rebake, the diagnostic script `apps/api/scripts/verify-audit-row.js` re-runs the hash recomputation with the Date-aware canonical and shows `recomputed (writeT.): … match=true` for every row id 1..72. That is the proof that the chain content is intact.

## Files referenced

- `apps/api/src/modules/audit/audit.service.ts` — `canonicalize()` (lines 34–43), `log()` (173–218), `verifyChain()` (83–144), `onModuleInit()` (54–75), `recordSecurityAlert()` (146–163).
- `apps/api/src/modules/audit/audit.service.spec.ts` — existing 20 tests; gap noted in coverage (no Date-roundtrip test).
- `apps/api/src/modules/vendors/vendors.service.ts:117–135` — broken caller (5 of 8 rows).
- `apps/api/src/modules/committee/committee.service.ts:32–58` — broken caller (3 of 8 rows).
- `database/migrations/001_initial_schema.sql:162–169` — `audit_logs_block_modifications` trigger.
- `database/migrations/001_initial_schema.sql:748–795` — `audit_logs`, `security_alerts` tables.
- `apps/api/scripts/verify-audit-row.{js,ts}` — diagnostic, one-shot, not wired into prod.
- `agents/reviews/audit-chain-break-evidence-2026-05-23.md` — raw evidence dump.
- `agents/handoffs/HANDOVER.md` 2026-05-21 entries — original (now-superseded) hypothesis: "advisory-lock pattern doesn't fully protect against container restarts mid-transaction."
- `docs/specs/implementation-spec.md` — audit invariant ("logs are append-only and cannot be edited through the application").

## Footnote — clean-up

After Option A lands the rebake migration, delete:
- `apps/api/scripts/verify-audit-row.{js,ts}` (diagnostic, no longer needed),
- the script copy at `/app/apps/api/verify-audit-row.js` inside `ctmp-api`,
- the staging copy at `ctmp-server:/tmp/verify-audit-row.js`.
