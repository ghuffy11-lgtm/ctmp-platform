# AUDIT_CHAIN_BREAK — raw evidence

Captured 2026-05-23 from `ctmp-postgres` on `10.1.13.98`. Vendor IDs and user IDs are test data (acme@testco.com test vendor; `admin@ctmp.local` test admin).

## security_alerts

Eight alerts, all identical signature. Every container boot since 2026-05-21 10:29 has produced one. The break is stable — never advances, never repairs.

| id | created_at (UTC) | acknowledged | brokenAtId | expectedPrev (row 6 hash) | reported actualPrev |
|----|------------------|--------------|------------|---------------------------|---------------------|
| 1  | 2026-05-21 10:29 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 2  | 2026-05-21 13:22 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 3  | 2026-05-21 13:43 | **yes** (2026-05-21 16:55) | 7 | b4b37647…5842 | dc108206…b61e |
| 4  | 2026-05-21 18:47 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 5  | 2026-05-22 03:31 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 6  | 2026-05-22 06:59 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 7  | 2026-05-22 11:37 | no  | 7 | b4b37647…5842 | dc108206…b61e |
| 8  | 2026-05-22 11:54 | no  | 7 | b4b37647…5842 | dc108206…b61e |

The metadata's `actualPrev: dc108206…b61e` is **row 7's own `hash_chain_value`**, not a competing prev pointer. This is the logging bug at `audit.service.ts:133` — on a hash-recompute failure the alert reports `actualPrev: row.hashChainValue` instead of the recomputed hash. The alerts have been *misleadingly labelled as link breaks*. The actual failure type is Type-B (payload-hash mismatch).

## audit_logs link integrity check (rows 1–15)

Every row's `prev_hash_chain_value` matches its predecessor's `hash_chain_value`:

| id | event_type | prev | hash | predecessor hash | link OK? |
|----|------------|------|------|------------------|----------|
| 6  | TENDER_PUBLISHED | afcf2d35…dacec | **b4b37647…5842** | row 5: afcf2d35…dacec | ✓ |
| 7  | VENDOR_APPROVED  | **b4b37647…5842** | dc108206…b61e | row 6: b4b37647…5842 | **✓ (chain link is intact)** |
| 8  | VENDOR_APPROVED  | dc108206…b61e | 4d162317…3930 | row 7: dc108206…b61e | ✓ |

So this is **not** a link break. The chain pointers are consistent. The break is in the *hash recomputation* for row 7 (and consequently every row after it, because verifyChain returns on first break).

## Row 7 payload (the broken row)

```
id                : 7
event_type        : VENDOR_APPROVED
entity_type       : Vendor
entity_id         : 5d4a8a89-227e-446d-b8b5-ab25670fd19c
actor_user_id     : e7f2677b-c2f0-4f2b-bc92-809189c4ee50
actor_vendor_user_id : NULL
actor_role_code   : NULL
tender_id         : NULL
vendor_id         : 5d4a8a89-227e-446d-b8b5-ab25670fd19c
bid_id            : NULL
ip_address        : NULL
user_agent        : NULL
before_value      : {"status": "PENDING"}
after_value       : {"status": "APPROVED", "approvedAt": "2026-05-21T09:09:34.840Z"}
reason            : NULL
metadata          : null         (JSON null)
risk_level        : MEDIUM
prev_hash_chain_value : b4b37647…5842
hash_chain_value      : dc108206…b61e
event_time            : 2026-05-21 09:09:34.855+00
```

## Call-site under suspicion

`apps/api/src/modules/vendors/vendors.service.ts:117–135`:

```ts
const updated = await this.prisma.vendor.update({
  where: { id },
  data: {
    status: VendorStatus.APPROVED,
    approvedBy: actorUserId,
    approvedAt: new Date(),
  },
});

await this.audit.log({
  eventType: 'VENDOR_APPROVED',
  entityType: 'Vendor',
  entityId: id,
  vendorId: id,
  actorUserId,
  beforeValue: { status: VendorStatus.PENDING },
  afterValue: { status: VendorStatus.APPROVED, approvedAt: updated.approvedAt },
  riskLevel: AuditRiskLevel.MEDIUM,
});
```

`updated.approvedAt` is a Prisma-returned **`Date` object**, not a string.

## Hypothesis (to verify in Stage 2)

In `audit.service.ts` `canonicalize()` (lines 34–43):

```ts
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
```

`typeof new Date() === 'object'`. The function falls into the object branch and computes `Object.keys(date).sort()`, which returns `[]` (Date has no enumerable own properties). It returns the literal string `'{}'`.

So at `log()` time, the canonicalized payload contains:

```
"afterValue":{"approvedAt":{},"status":"APPROVED"}
```

Prisma then stores the same `Date` into the JSONB column via its built-in JSON serializer, which calls `Date.prototype.toJSON()`. The DB-stored representation is:

```
{"status": "APPROVED", "approvedAt": "2026-05-21T09:09:34.840Z"}
```

At `verifyChain()` time the row is read back as a plain object with `approvedAt` as a **string**. Canonicalizing that produces:

```
"afterValue":{"approvedAt":"2026-05-21T09:09:34.840Z","status":"APPROVED"}
```

The two canonicals differ → recomputed `SHA-256` ≠ stored `hash_chain_value` → verifier flags row 7 as broken.

## Other audit.log call sites that may share the bug

15 files use `audit.log(...)`. Stage 2 will sweep all of them for `beforeValue`/`afterValue`/`metadata` arguments that include Date objects (or any other non-string non-primitive that Prisma JSON-serializes asymmetrically vs `canonicalize`). Vendor-suspend, tender-approve, tender-reject, late-submission-grant, vendor-register are likely candidates.

## Sample size note

Eight alerts, identical signature. No second-axis break (no row beyond id=7 fails because verifyChain returns at the first break). After Stage 2 confirms the fix, a second pass that mocks the bug-free canonicalizer can prove rows 8…N are otherwise hash-clean.
