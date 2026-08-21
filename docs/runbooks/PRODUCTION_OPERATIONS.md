# CTMP Production Operations & Troubleshooting

Authoritative reference for running CTMP in production. Pairs with `agents/handoffs/HANDOVER.md`
(chronological log) and the `admin-prod-deploy.md` runbook. Last major update: 2026-06-27.

## 1. Topology

| Role | Host | SSH alias | URL | Compose | Env |
|---|---|---|---|---|---|
| Admin (full backend) | `10.1.27.99` (`int`) | `cts-prod` | `https://ctmp.hadiclinic.com.kw:4202` | `docker-compose.admin-prod.yml` | `.env.admin-prod` |
| Vendor (frontend) | `172.16.4.11` (`mrbs`) | `cts-vendor` | `https://vn.hadiclinic.com.kw:4201` | `docker-compose.vendor-prod.yml` | `.env.vendor-prod` |
| Dev / build / staging | `10.1.13.98` | local | `https://tvn.hadiclinic.com.kw:4201`, `https://ctmp-admin.hadiclinic.com.kw` | `docker-compose.yml` | `infrastructure/docker/.env` |

- **Admin** runs postgres + redis (internal only) + api + web-admin + nginx (`4202:443`).
- **Vendor** runs only web-vendor + nginx (`4201:443`); nginx proxies `/api` → `https://10.1.27.99:4202`.
- **Dev** runs the full base stack (incl. mailhog + minio). Dev TLS is **host nginx** on `10.1.13.98`
  (`/etc/nginx/sites-available/*.conf`), not a container — the vendor dev vhost is `tvn.hadiclinic.com.kw`.
- Project dir on sdb (NOT `/`): admin `/var/lib/docker/ctmp-platform`, vendor `/mnt/repo/ctmp-platform`.
- Compose project name on every host: `ctmp`. Container names: `ctmp-api`, `ctmp-web-admin`,
  `ctmp-web-vendor`, `ctmp-postgres`, `ctmp-redis`, `ctmp-nginx`, `ctmp-vendor-nginx`.

## 2. The air-gap rule

The **admin/API server has no internet egress** (Docker Hub + general internet blocked) except a
deliberate allowance to `hcaptcha.com`. The vendor server has egress. Therefore:

- **Build images on the build box `10.1.13.98`**, transfer with `docker save | gzip | ssh | docker load`,
  bring up with **`--no-build`**. `postgres:16-alpine` + `nginx:1.27-alpine` are cached on the hosts.
- The vendor host only had `docker-compose` v1; the **compose v2 plugin** was copied to
  `~/.docker/cli-plugins/`.

## 3. Common operations

**Rebuild + redeploy the API after a code change:**
```bash
cd /mnt/repo/ctmp-platform
docker build -f infrastructure/docker/api.Dockerfile -t ctmp-api:latest .
docker save ctmp-api:latest | gzip -1 | ssh cts-prod 'gunzip | docker load'
ssh cts-prod 'cd /var/lib/docker/ctmp-platform/infrastructure/docker && \
  docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml -p ctmp up -d --no-build api'
# dev (local):
docker compose -p ctmp -f infrastructure/docker/docker-compose.yml up -d --no-build api
```
`web-admin`/`web-vendor` bake `NEXT_PUBLIC_API_URL` (+ vendor `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`) at build
time — URL/key changes need `--build-arg` + re-transfer, not a restart.

**Apply a DB migration to a live (already-initialised) DB** — migrations auto-run only on a FRESH
postgres init, so apply by hand:
```bash
cat database/migrations/NNN.sql | ssh cts-prod 'docker exec -i ctmp-postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1'
```

**Backups:** nightly `pg_dump -Fc` via `scripts/backup_ctmp_db.sh` (cron on admin host) to
`/var/lib/docker/ctmp-platform/backups`. Restore: stop api, `pg_restore --clean --if-exists`.

**Cleaning docker disk (build box):** `docker builder prune -f` (safe, reclaims build cache) +
`docker image prune -f` (dangling). NEVER `volume prune` blind.

## 4. TLS

Real DigiCert wildcard `*.HADICLINIC.COM.KW` (to 2026-09-16), covers all subdomains + any port.
- Admin mounts the host's shared cert (`/etc/ssl/certs/wildcard_HADICLINIC_COM_KW_fullchain.crt` +
  `/etc/ssl/private/...key`); renewals propagate.
- Vendor copies the cert into `infrastructure/docker/certs/` (host has no `/etc/ssl` convention) —
  re-copy on renewal.
- Admin uses port 4202 because `hadi-intranet-nginx-1` owns 443 on that host.

## 5. Integrations (see also docs/security + the ctmp-config skill)

- **SMTP** — DB-first (`system_settings.smtp.*`, password encrypted), env fallback. Set via Settings
  UI. Prod relay `mail.hadiclinic.com.kw:587` user `noreply`. Dev = mailhog.
- **AD** — `ldap://10.1.14.20:389`, domain `hadiclinic.com.kw`, bind `netsrv`. The probe/login
  auto-append `@domain`; enter the BARE username. `data 52e` = bad bind format/creds.
- **hCaptcha** — site key baked into web-vendor build; secret on the api. **The API must reach
  `hcaptcha.com` to verify** (egress opened on the otherwise air-gapped admin host). Blocked egress →
  registration `400 CAPTCHA verification failed`.
- **SETTINGS_ENCRYPTION_KEY** — AES-256-GCM master key for `system_settings.encrypted_value`
  (smtp/ad passwords). MUST be set (else a known in-source fallback is used). Now set on both. Rotating
  requires re-encrypting existing blobs in place — see the 2026-06-27 HANDOVER entry.

## 6. Email

HTML/branded emails (header admin logo + vendor logo under the signature, both inline CID). Shell is in
`notifications.service.ts`; bodies are HTML in `notification_templates`. Email-client rules: explicit
`width`/`height` attributes (not CSS `max-*`); explicit left-align; SVG logos must be rasterised
(`scripts/rasterize_vendor_logo.sh`). Full detail in the **ctmp-email** skill.

## 7. Troubleshooting quick table

| Symptom | Fix |
|---|---|
| Registration `400` / captcha aborted | Restore hcaptcha.com egress from admin host |
| AD `data 52e` | Bare username in probe (domain auto-appended) |
| Email centered in webmail | left-align fix (in shell) |
| Email logo fills page | explicit `width`/`height` attrs |
| Vendor logo absent in email | rasterise SVG → PNG |
| Permission change not applied | user re-login (JWT-baked) |
| Perms in dev not prod | apply sync migrations by hand on prod |
| compose tries to pull/build | use `--no-build` + image transfer |
| SMTP/AD password "wrong" post-config | re-encrypt blobs after key change |

## 8. Hard rules

1. Never touch other projects on the hosts (`complainmgmt`/`hadi-intranet` on admin; `pharmacy` on
   vendor). 443 on admin belongs to `hadi-intranet-nginx-1`.
2. Everything on sdb, nothing on `/`.
3. `--no-build` on prod; transfer images.
4. DB change → both dev + prod. Code change → rebuild + redeploy both.
5. Don't blind-sync SYSTEM_ADMIN permissions from dev (separation of duties — no commercial access).
6. Real secrets are host-only + gitignored; never rsync `.env.*`/`certs/`.
