/**
 * ONE-SHOT — rebake the audit_logs hash chain from a given row onward.
 *
 * Context: AUDIT_CHAIN_BREAK_RCA_2026-05-23. Prior code's canonicalize()
 * mishandled JS Date objects (treated them as a plain {} with no keys),
 * while Prisma writes Date to JSONB as an ISO-8601 string. Rows whose
 * audit payload contained a Date got hashed with the broken canonical at
 * write time; verifyChain() with the fixed canonical no longer recomputes
 * those hashes. The data is intact — only the hash columns need to be
 * rewritten so the chain validates again going forward.
 *
 * Run inside ctmp-api (so it shares the Prisma client + node runtime):
 *   docker cp /tmp/rebake-audit-chain.js ctmp-api:/app/apps/api/
 *   docker exec -w /app/apps/api ctmp-api node rebake-audit-chain.js [--execute] [--from <id>]
 *
 * Flags:
 *   --dry-run     (default) — show planned UPDATEs without writing
 *   --execute               — actually run the transaction
 *   --from <id>             — start rebake at this id (default: lowest affected id)
 *   --skip-ack              — don't acknowledge the existing AUDIT_CHAIN_BREAK
 *                             security_alerts rows after rebake
 *
 * Safety:
 *   1. Pre-check: refuse to run if verifyChain() already returns ok=true.
 *   2. Single transaction. Triggers re-enabled inside same txn.
 *   3. Disables ONLY the no_update trigger. INSERT-blocker triggers stay armed.
 *   4. Post-check: re-run verifyChain() inside txn. Rollback if it doesn't pass.
 *   5. Appends a final AUDIT_CHAIN_REBAKE row via the normal audit.log() path
 *      (after triggers are re-enabled), with metadata listing rebuilt row ids.
 *   6. The Prisma client used here is whatever the running api container's
 *      build has compiled in — must match the new canonicalize. Verify by
 *      checking that `node verify-audit-row.js 7` (the original diagnostic)
 *      reports `recomputed (verify) match=true` for the rebaked rows after
 *      this script executes.
 */

const { PrismaClient, Prisma, AuditRiskLevel } = require('@prisma/client');
const { createHash } = require('crypto');

const GENESIS_HASH = '0'.repeat(64);
const AUDIT_LOCK_KEY = 0x6354_4d50;
const SYSTEM_ADMIN_USER_ID = 'e7f2677b-c2f0-4f2b-bc92-809189c4ee50'; // admin@ctmp.local

// Mirror of the fixed canonicalize() in audit.service.ts.
function canonicalize(value) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function rebuildPayload(row) {
  return {
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId == null ? undefined : row.entityId,
    actorUserId: row.actorUserId == null ? undefined : row.actorUserId,
    actorVendorUserId: row.actorVendorUserId == null ? undefined : row.actorVendorUserId,
    actorRoleCode: row.actorRoleCode == null ? undefined : row.actorRoleCode,
    tenderId: row.tenderId == null ? undefined : row.tenderId,
    vendorId: row.vendorId == null ? undefined : row.vendorId,
    bidId: row.bidId == null ? undefined : row.bidId,
    ipAddress: row.ipAddress == null ? undefined : row.ipAddress,
    userAgent: row.userAgent == null ? undefined : row.userAgent,
    beforeValue: row.beforeValue == null ? null : row.beforeValue,
    afterValue: row.afterValue == null ? null : row.afterValue,
    reason: row.reason == null ? undefined : row.reason,
    metadata: row.metadata == null ? null : row.metadata,
    riskLevel: row.riskLevel,
  };
}

function parseArgs(argv) {
  const args = { execute: false, from: null, skipAck: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--execute') args.execute = true;
    else if (argv[i] === '--dry-run') args.execute = false;
    else if (argv[i] === '--from') args.from = BigInt(argv[++i]);
    else if (argv[i] === '--skip-ack') args.skipAck = true;
  }
  return args;
}

async function findFirstBrokenRow(prisma) {
  // Walk the chain in ascending id, find the first row whose stored
  // hash_chain_value disagrees with SHA-256(prev_hash || canonical(payload)).
  const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  let expectedPrev = rows.length > 0 ? (rows[0].prevHashChainValue ?? GENESIS_HASH) : GENESIS_HASH;
  for (const row of rows) {
    const actualPrev = row.prevHashChainValue ?? GENESIS_HASH;
    if (actualPrev !== expectedPrev) return row.id;
    const recomputed = createHash('sha256').update(actualPrev + canonicalize(rebuildPayload(row))).digest('hex');
    if (recomputed !== row.hashChainValue) return row.id;
    expectedPrev = row.hashChainValue;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.execute ? 'EXECUTE' : 'DRY-RUN';
  console.log('=== rebake-audit-chain.js [' + mode + '] ===');

  const prisma = new PrismaClient();

  try {
    const firstBroken = args.from ?? (await findFirstBrokenRow(prisma));
    if (firstBroken == null) {
      console.log('verifyChain already clean — nothing to rebake. Exiting without action.');
      await prisma.$disconnect();
      return;
    }
    console.log('First broken id: ' + firstBroken);

    const rows = await prisma.auditLog.findMany({
      where: { id: { gte: firstBroken } },
      orderBy: { id: 'asc' },
    });
    console.log('Rebaking ' + rows.length + ' rows (from id=' + firstBroken + ' onward).');

    // Predecessor's hash is unchanged (otherwise findFirstBrokenRow would have
    // picked an earlier id). Read it once outside the txn.
    const predecessor = await prisma.auditLog.findFirst({
      where: { id: { lt: firstBroken } },
      orderBy: { id: 'desc' },
      select: { id: true, hashChainValue: true },
    });
    let runningPrev = predecessor ? predecessor.hashChainValue : GENESIS_HASH;
    console.log('Chain anchor: predecessor id=' + (predecessor ? predecessor.id : '(none)') + ' hash=' + runningPrev.slice(0, 16) + '...');

    // Plan the UPDATEs first (no DB writes). Print a diff per row.
    const plan = [];
    let prev = runningPrev;
    for (const row of rows) {
      const newPrev = prev;
      const newHash = createHash('sha256').update(newPrev + canonicalize(rebuildPayload(row))).digest('hex');
      plan.push({
        id: row.id,
        eventType: row.eventType,
        oldPrev: row.prevHashChainValue,
        newPrev,
        oldHash: row.hashChainValue,
        newHash,
        changed: newHash !== row.hashChainValue || (newPrev || null) !== (row.prevHashChainValue || null),
      });
      prev = newHash;
    }

    const changedCount = plan.filter(p => p.changed).length;
    console.log('Planned rewrites: ' + changedCount + ' / ' + plan.length + ' rows.');
    for (const p of plan) {
      const flag = p.changed ? '*' : ' ';
      const oldP = (p.oldPrev || '(null)').slice(0, 16);
      const newP = (p.newPrev || '(null)').slice(0, 16);
      console.log(
        flag + ' id=' + String(p.id).padStart(3) + ' ' + p.eventType.padEnd(30) +
        '  prev: ' + oldP + '... -> ' + newP + '...' +
        '  hash: ' + p.oldHash.slice(0, 16) + '... -> ' + p.newHash.slice(0, 16) + '...',
      );
    }

    if (!args.execute) {
      console.log('\n[DRY-RUN] No writes performed. Re-run with --execute to commit.');
      await prisma.$disconnect();
      return;
    }

    // ─── EXECUTE PATH ─────────────────────────────────────────────────────
    console.log('\n[EXECUTE] Starting transaction (60s timeout)...');
    await prisma.$transaction(async (tx) => {
      // Serialise with any concurrent audit.log() via the same advisory lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

      // Disable ONLY the UPDATE-blocker. INSERT path is unaffected
      // (BIGSERIAL still advances; DELETE/TRUNCATE still rejected).
      await tx.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update');

      let updated = 0;
      for (const p of plan) {
        await tx.$executeRaw`
          UPDATE audit_logs
             SET prev_hash_chain_value = ${p.newPrev},
                 hash_chain_value = ${p.newHash}
           WHERE id = ${p.id}`;
        updated++;
      }

      await tx.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update');

      console.log('Updated ' + updated + ' rows. Append AUDIT_CHAIN_REBAKE marker via normal log path...');

      // Now append a marker row through normal canonicalize+chain mechanics.
      // Re-read the last row's hash inside the txn so the chain extends correctly.
      const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hashChainValue: true } });
      const prevHash = last && last.hashChainValue ? last.hashChainValue : GENESIS_HASH;
      const markerPayload = {
        eventType: 'AUDIT_CHAIN_REBAKE',
        entityType: 'AuditLog',
        entityId: undefined,
        actorUserId: SYSTEM_ADMIN_USER_ID,
        actorVendorUserId: undefined,
        actorRoleCode: undefined,
        tenderId: undefined,
        vendorId: undefined,
        bidId: undefined,
        ipAddress: undefined,
        userAgent: undefined,
        beforeValue: null,
        afterValue: null,
        reason: 'AUDIT_CHAIN_BREAK_RCA_2026-05-23 — one-shot rebake of rows >=' + firstBroken,
        metadata: {
          rcaReference: 'agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md',
          firstRebakedId: String(firstBroken),
          rowsRewritten: plan.filter(x => x.changed).map(x => String(x.id)),
          rowsTotal: plan.length,
        },
        riskLevel: AuditRiskLevel.CRITICAL,
      };
      const markerHash = createHash('sha256').update(prevHash + canonicalize(markerPayload)).digest('hex');
      await tx.auditLog.create({
        data: {
          ...markerPayload,
          beforeValue: markerPayload.beforeValue,
          afterValue: markerPayload.afterValue,
          metadata: markerPayload.metadata,
          prevHashChainValue: prevHash === GENESIS_HASH ? null : prevHash,
          hashChainValue: markerHash,
        },
      });

      // Post-rebake verifyChain inside the same txn — rollback if not ok.
      const verifyRows = await tx.auditLog.findMany({ orderBy: { id: 'asc' } });
      let exp = verifyRows.length > 0 ? (verifyRows[0].prevHashChainValue ?? GENESIS_HASH) : GENESIS_HASH;
      for (const row of verifyRows) {
        const actualPrev = row.prevHashChainValue ?? GENESIS_HASH;
        if (actualPrev !== exp) throw new Error('Post-rebake link break at id=' + row.id);
        const r = createHash('sha256').update(actualPrev + canonicalize(rebuildPayload(row))).digest('hex');
        if (r !== row.hashChainValue) throw new Error('Post-rebake hash break at id=' + row.id);
        exp = row.hashChainValue;
      }
      console.log('Post-rebake verifyChain: ok (' + verifyRows.length + ' rows).');

      // Acknowledge existing AUDIT_CHAIN_BREAK alerts.
      if (!args.skipAck) {
        const ackResult = await tx.securityAlert.updateMany({
          where: { alertType: 'AUDIT_CHAIN_BREAK', acknowledgedAt: null },
          data: {
            acknowledgedBy: SYSTEM_ADMIN_USER_ID,
            acknowledgedAt: new Date(),
          },
        });
        console.log('Acknowledged ' + ackResult.count + ' AUDIT_CHAIN_BREAK alerts.');
      }
    }, { timeout: 60_000, maxWait: 10_000 });

    console.log('\n[EXECUTE] Committed. Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
});
