# Runbook — Backup and Restore

**Scope:** the CTMP production database on the admin host `10.1.27.99` (SSH alias `cts-prod`).
**Written:** 2026-08-24, after actually performing a restore rather than describing one.

Everything below has been executed. Where a command has not been run against production, it says so.

> **The vendor host holds no data.** `172.16.4.11` runs `web-vendor` + nginx only and proxies to
> this API. There is nothing to back up there.

---

## 1. What exists

| | |
|---|---|
| Script | `scripts/backup_ctmp_db.sh` |
| Schedule | `15 1 * * *` in the `claude` crontab on `cts-prod` |
| Format | `pg_dump -Fc` — compressed custom format, restorable with `pg_restore` |
| Location | `/var/lib/docker/ctmp-platform/backups/ctmp-YYYYmmdd-HHMMSS.dump` (on `/dev/sdb`, **not** `/`) |
| Retention | 14 days, pruned by the script. **Only files matching `ctmp-*.dump`** — manual dumps named `ctmp_pre*.dump` are never pruned |
| Log | `backups/backup.log` |
| Size | ~233 KB as of 2026-08-24 (production holds no tenders yet; expect this to grow substantially once it does) |

**There are no off-host copies.** Every dump sits on the same machine as the database it came from.
Disk loss or host loss takes both. See §6.

---

## 2. Check the backup is actually running

**Do this monthly. It is the check that would have caught a two-month outage.**

```bash
ssh cts-prod 'tail -5 /var/lib/docker/ctmp-platform/backups/backup.log'
```

A healthy tail looks like:

```
[2026-08-24T20:13:38+03:00] dumping ctmp -> /var/lib/docker/ctmp-platform/backups/ctmp-20260824-201337.dump
[2026-08-24T20:13:38+03:00] ok: 236K
[2026-08-24T20:13:38+03:00] pruned dumps older than 14d
```

Then confirm a dump from **last night** actually exists — a log can look fine while the file is missing:

```bash
ssh cts-prod 'ls -lht /var/lib/docker/ctmp-platform/backups/ctmp-*.dump | head -3'
```

> **This exact check failed on 2026-08-24.** The log held **61 lines, 61 of them
> `Permission denied`, and zero successes** — the script was mode `644` with no execute bit, and
> cron invokes it by path. It had **never** run since being installed. Fixed with `chmod +x`.
> The lesson generalises: a cron job that has never worked looks identical to one that has no
> log yet. Read the log, do not assume.

---

## 3. Restore into a scratch database (safe, non-destructive)

**Do this quarterly, and after any change to the backup script.** It proves the artifact is
restorable without touching anything live. It is also how you inspect an old dump.

Run from the build box. **Restoring into dev's scratch DB does not affect dev's real database.**

```bash
# 1. Pull a dump off production (or use one already on the build box)
ssh cts-prod 'docker exec ctmp-postgres pg_dump -U ctmp -d ctmp -Fc' > /tmp/rt.dump

# 2. Record the SOURCE counts, so you have something to compare against
ssh cts-prod 'docker exec ctmp-postgres psql -U ctmp -d ctmp -tAc \
  "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM roles), \
          (SELECT count(*) FROM permissions), (SELECT count(*) FROM audit_logs);"'

# 3. Create a throwaway target on dev and restore into it
docker exec ctmp-postgres psql -U ctmp -d postgres -c 'CREATE DATABASE ctmp_restore_test;'
docker cp /tmp/rt.dump ctmp-postgres:/tmp/rt.dump
docker exec ctmp-postgres pg_restore -U ctmp -d ctmp_restore_test --no-owner /tmp/rt.dump

# 4. Compare. The counts must match exactly.
docker exec ctmp-postgres psql -U ctmp -d ctmp_restore_test -tAc \
  "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM roles), \
          (SELECT count(*) FROM permissions), (SELECT count(*) FROM audit_logs);"

# 5. Audit chain must survive — first and last hash identical to source, no NULLs
docker exec ctmp-postgres psql -U ctmp -d ctmp_restore_test -tAc \
  "SELECT (SELECT left(hash_chain_value,12) FROM audit_logs ORDER BY id LIMIT 1),
          (SELECT left(hash_chain_value,12) FROM audit_logs ORDER BY id DESC LIMIT 1),
          (SELECT count(*) FROM audit_logs WHERE hash_chain_value IS NULL);"

# 6. Tear it down — do not leave a stale copy of production on the dev box
docker exec ctmp-postgres psql -U ctmp -d postgres -c 'DROP DATABASE ctmp_restore_test;'
docker exec ctmp-postgres rm -f /tmp/rt.dump && rm -f /tmp/rt.dump
```

**Result of the 2026-08-24 run** — the first restore ever performed on this system:

| Check | Source | Restored |
|---|---|---|
| users / roles / permissions / audit_logs / templates | `4 / 15 / 78 / 41 / 12` | `4 / 15 / 78 / 41 / 12` ✅ |
| Audit chain first…last hash | `cc03a36cd0e1 … 0fabffc308e7` | identical ✅ |
| `hash_chain_value` NULLs | 0 | 0 ✅ |
| Migration `057` objects | present | `vendor_invitations` + both unique indexes ✅ |

`pg_restore` exited **0** with no warnings.

---

## 4. Restore over the live database (DESTRUCTIVE)

**Never run this to "check the backup".** Use §3 for that. This is for genuine data loss or a
migration that has to be undone.

> **NOT YET REHEARSED against production.** §3 proves the dump restores faithfully into an empty
> database; it does not prove this exact sequence against a live one. Read it through before you
> need it, and if there is ever a maintenance window, rehearse it.

```bash
# 0. Take a dump of the CURRENT state first, however broken it looks.
#    You may need to compare, or discover the "bad" state held something you wanted.
ssh cts-prod 'docker exec ctmp-postgres pg_dump -U ctmp -d ctmp -Fc' \
  > /tmp/pre-restore-$(date +%Y%m%d-%H%M%S).dump

# 1. Stop the API so nothing writes mid-restore. Leave postgres up.
ssh cts-prod 'cd /var/lib/docker/ctmp-platform/infrastructure/docker && \
  docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp stop api'

# 2. Restore. --clean --if-exists drops each object before recreating it.
ssh cts-prod 'docker exec -i ctmp-postgres pg_restore -U ctmp -d ctmp --clean --if-exists' \
  < /var/lib/docker/ctmp-platform/backups/ctmp-YYYYmmdd-HHMMSS.dump

# 3. Bring the API back
ssh cts-prod 'cd /var/lib/docker/ctmp-platform/infrastructure/docker && \
  docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp start api'

# 4. VERIFY — the boot log is the real test
ssh cts-prod 'docker logs ctmp-api 2>&1 | grep -i "audit chain"'
#    MUST read: Audit chain verified — N rows OK
#    If it says AUDIT CHAIN BREAK, the restore is not trustworthy. Stop and investigate.
```

Then check the migration level matches the images you are running:

```bash
ssh cts-prod 'docker exec ctmp-postgres psql -U ctmp -d ctmp -tAc \
  "SELECT count(*) FROM vendor_invitations;"'   # exists only from migration 057
```

**If the dump predates a migration the running images require**, the API will fail on missing
columns. Either restore a newer dump, or re-apply the migrations by hand in filename order after
restoring (`docs/runbooks/PRODUCTION_OPERATIONS.md` §migrations).

---

## 5. What a restore does **not** recover

`pg_dump` covers the database only. These live outside it:

| Not in the dump | Where it lives | Consequence |
|---|---|---|
| Uploaded files — bid documents, tender documents, award minutes, vendor registration PDFs | Docker volumes `bid_storage`, `tender_storage`, `report_storage`, `app_storage` on `/dev/sdb` | **A DB-only restore leaves rows pointing at files that are gone.** Checksums will not match anything |
| Branding logos, role-guide PDFs | `app_storage` (`/data/branding`, `/data/role-guides`) | Regenerate role guides with `scripts/seed_role_guides.sh cts-prod`; re-upload logos |
| `.env.admin-prod` — secrets, JWT keys, SMTP, CAPTCHA | Host filesystem, **not in git** | Without it the stack will not start. JWT secret loss invalidates every session |
| TLS certificate and key | `infrastructure/docker/certs/` | Cert valid to **2026-09-16** — see §6 |

**There is no backup of the file volumes today.** For a system whose bid documents are
SHA-256-checksummed evidence, that is the larger exposure of the two. Recorded as a gap, not solved
here.

---

## 6. Known gaps

Stated plainly so nobody assumes otherwise:

1. **No off-host copy.** Every dump is on the machine it came from. Losing `/dev/sdb` or the host
   loses the database and every backup of it in the same moment.
2. **No file-volume backup.** Uploaded bid and tender documents are not backed up at all. A restore
   gives you rows referring to missing files.
3. **§4 has never been rehearsed** against production.
4. **No restore-time objective.** Nobody has agreed how much data loss is acceptable. Nightly dumps
   mean up to ~24 hours.
5. **TLS cert expires 2026-09-16** — roughly three weeks out at the time of writing. Unrelated to
   backups, but it is on the same host and will take the portals down when it lapses.

---

## Quick reference

| Task | Command |
|---|---|
| Is it running? | `ssh cts-prod 'tail -5 …/backups/backup.log'` — expect `ok:`, not `Permission denied` |
| Latest dumps | `ssh cts-prod 'ls -lht …/backups/ctmp-*.dump \| head -3'` |
| Manual dump now | `ssh cts-prod '…/scripts/backup_ctmp_db.sh'` |
| Test a restore (safe) | §3 |
| Restore for real (destructive) | §4 — stop api, `pg_restore --clean --if-exists`, start api, **check the audit chain** |
