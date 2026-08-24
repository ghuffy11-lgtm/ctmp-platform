# Runbook — CTMP Admin Portal Production Deploy

**Server:** `10.1.27.99` (hostname `int`, SSH alias `cts-prod`, user `claude`, passwordless sudo)
**URL:** `https://ctmp.hadiclinic.com.kw:4202`
**Project root on host:** `/var/lib/docker/ctmp-platform` (on `/dev/sdb`, 98 G — NOT the `/` partition)
**Compose project:** `ctmp` · **Compose file:** `infrastructure/docker/docker-compose.admin-prod.yml`

This host already runs unrelated docker projects (`complainmgmt`, `hadi-intranet`). **Do not touch
them.** Port 443 belongs to `hadi-intranet-nginx-1`; CTMP terminates its own TLS on **4202**.

---

## Architecture

```
browser ──https──> host:4202 ──> [ctmp-nginx :443]
                                   ├─ /api/*  ─> api:3000        (NestJS, trust proxy=1)
                                   └─ /*       ─> web-admin:4200  (Next.js)
                                         api ─> postgres:5432 (internal), redis:6379 (internal)
volumes (on /dev/sdb): postgres_data, redis_data, app_storage, report_storage,
                       bid_storage, tender_storage     (STORAGE_DRIVER=local)
```

postgres + redis have **no host ports**. nginx is the only published port. No mailhog, no minio, no
web-vendor on this host (web-vendor ships to `172.16.4.11` in a later phase).

---

## Prerequisites (collect before building)

1. **Wildcard TLS cert** `*.hadiclinic.com.kw` — `fullchain.pem` + `privkey.pem`.
2. **Internal Exchange SMTP** — host, port (587 STARTTLS / 465 implicit-TLS), user, password, from-addr.
3. **Admin bootstrap** — email + initial password for the first SYSTEM_ADMIN.
4. **Real hCaptcha secret** for `CAPTCHA_SECRET_KEY` (org's production key).
5. **DNS** — `ctmp.hadiclinic.com.kw` → `10.1.27.99` (already created). Verify:
   `ssh cts-prod getent hosts ctmp.hadiclinic.com.kw`.

---

## Deploy

All commands run on the host from `/var/lib/docker/ctmp-platform/infrastructure/docker` unless noted.

### 1. Create project dir (on the sdb disk)

```bash
ssh cts-prod 'sudo install -d -o claude -g claude /var/lib/docker/ctmp-platform'
```

### 2. Ship code (rsync from the build box `10.1.13.98`)

```bash
rsync -az --delete \
  --exclude node_modules --exclude '**/.next' --exclude '**/dist' \
  --exclude .git --exclude 'infrastructure/docker/.env*' \
  --exclude '**/*.bak*' --exclude backups --exclude 'infrastructure/docker/certs' \
  /mnt/repo/ctmp-platform/ cts-prod:/var/lib/docker/ctmp-platform/
```

`pnpm-lock.yaml` **is** shipped (needed for `--frozen-lockfile` builds). The `.env.admin-prod.example`
template ships; the real secrets file does not.

### 3. Install cert + key

```bash
ssh cts-prod 'install -d -m 750 /var/lib/docker/ctmp-platform/infrastructure/docker/certs'
# copy fullchain.pem + privkey.pem into that dir, then:
ssh cts-prod 'chmod 600 /var/lib/docker/ctmp-platform/infrastructure/docker/certs/privkey.pem'
```

### 4. Create `.env.admin-prod` (host only)

Copy `.env.admin-prod.example` → `.env.admin-prod` and fill in. Generate each secret fresh
(`openssl rand -hex 32`) — do **not** reuse staging values. Set SMTP, `CAPTCHA_SECRET_KEY`, and the
`ctmp.hadiclinic.com.kw:4202` URLs.

### 5. Build on the build box, transfer, bring up with `--no-build`

> **Corrected 2026-08-24.** This step used to say `docker compose … build` **on this host**. That
> cannot work: `10.1.27.99` has **no internet egress** (one exception, `hcaptcha.com`), so it cannot
> reach Docker Hub or npm and every build fails. It was written before the air-gap was in place and
> nobody re-ran it afterwards. The real procedure — used for every deploy since June — is below.

Build on the **build box** (`10.1.13.98`), which is the only machine with egress:

```bash
# on the build box, from /mnt/repo/ctmp-platform
sudo docker build -f infrastructure/docker/api.Dockerfile -t ctmp-api:prod-$(date +%Y%m%d) .
sudo docker build -f infrastructure/docker/web-admin.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://ctmp.hadiclinic.com.kw:4202 \
  -t ctmp-web-admin:prod-$(date +%Y%m%d) .
```

> **`NEXT_PUBLIC_API_URL` must be passed explicitly.** It is inlined into the browser bundle at
> build time; a bare build bakes `http://localhost:3000` and every browser then fails with "Failed
> to fetch". Verify **before** transferring — the healthy fingerprint is ~43 hits for the prod
> origin and exactly **11** residual `localhost:3000` in the admin bundle.

Transfer and cut over:

```bash
sudo sh -c "docker save ctmp-api:prod-YYYYMMDD | gzip -1 | ssh cts-prod 'gunzip | docker load'"
sudo ssh cts-prod "docker tag ctmp-api:prod-YYYYMMDD ctmp-api:latest && \
  cd /var/lib/docker/ctmp-platform/infrastructure/docker && \
  docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp \
    up -d --no-build --force-recreate api"
```

**Always `--no-build` on this host.** Cut a `rollback-YYYYMMDD` tag from the running image and take a
`pg_dump` before starting — see `docs/runbooks/BACKUP_RESTORE.md`.

On a **first** install only, postgres auto-applies `database/migrations/*.sql` at init. On an
initialised database migrations do **not** auto-run; apply them by hand. Wait for health:

```bash
docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp ps
```

### 6. Apply seeds (roles/permissions + email templates)

```bash
for f in 001_baseline_roles_permissions 002_notification_templates; do
  docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp \
    exec -T postgres psql -U ctmp -d ctmp < ../../database/seeds/$f.sql
done
```

### 7. Bootstrap the first admin

```bash
ADMIN_EMAIL=admin@hadiclinic.com.kw ADMIN_NAME="System Admin" \
  bash ../../scripts/bootstrap_admin.sh        # prompts for password
```

---

## Smoke test

```bash
# Health over TLS (works before DNS propagates via --resolve)
curl -sk --resolve ctmp.hadiclinic.com.kw:4202:10.1.27.99 \
  https://ctmp.hadiclinic.com.kw:4202/api/v1/health

# Cert CN/SAN
echo | openssl s_client -connect 10.1.27.99:4202 \
  -servername ctmp.hadiclinic.com.kw 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```

Then in a browser: load `https://ctmp.hadiclinic.com.kw:4202/`, log in as the bootstrap admin, confirm
the dashboard and an authenticated call (e.g. Settings → Roles) load through nginx → api.

Confirm in the api logs: `CAPTCHA provider: hCaptcha (production)` and audit-chain verify success.
Trigger a test email (Settings SMTP test, or a password reset) and confirm it reaches a real inbox.

Confirm isolation: `docker ps` shows CTMP published only on `4202`; the other projects' containers are
unchanged; disk growth is on `/dev/sdb` (`df -h /` flat).

---

## Backups

Install the nightly dump (as `claude`):

```cron
15 1 * * * /var/lib/docker/ctmp-platform/scripts/backup_ctmp_db.sh >> \
  /var/lib/docker/ctmp-platform/backups/backup.log 2>&1
```

Restore is documented at the top of `scripts/backup_ctmp_db.sh` (stop api, `pg_restore --clean`).

---

## Rollback

```bash
docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp down
```

Add `-v` to also drop the data volumes (DESTROYS the database — only on a fresh/aborted install, never
once real data exists). Rebuild a single service after a code change:

```bash
docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp up -d --build api
```

---

## Common pitfalls

- **Email links wrong** — `ADMIN_PORTAL_URL` / `ADMIN_PUBLIC_API_URL` must be the exact public origin
  including `:4202`; they're baked into the admin bundle (build arg) and into outbound emails.
- **Admin bundle points at the wrong API** — `ADMIN_PUBLIC_API_URL` is a **build arg**; changing it
  requires `--build web-admin`, not just a restart.
- **`POSTGRES_PORT` / 5432** — do not publish postgres; host 5432 is already taken by another project.
- **Compose interpolation** — always pass `--env-file .env.admin-prod`; without it the `:?` required
  guards fail and build args resolve empty.
