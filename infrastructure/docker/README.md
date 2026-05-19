# CTMP Docker Compose

Local + on-prem deployment of the full CTMP stack (PostgreSQL, Redis, NestJS API, admin portal, vendor portal).

## Services

| Service     | Port | Built from                            |
|-------------|------|----------------------------------------|
| postgres    | 5432 | `postgres:16-alpine` (managed image)   |
| redis       | 6379 | `redis:7-alpine` (managed image)       |
| api         | 3000 | `infrastructure/docker/api.Dockerfile` |
| web-admin   | 4200 | `infrastructure/docker/web-admin.Dockerfile` |
| web-vendor  | 4300 | `infrastructure/docker/web-vendor.Dockerfile` |

The postgres container auto-runs every `*.sql` file in `database/migrations/` on first start, so a fresh
container comes up with the full schema already applied.

## Quick start

```bash
cd infrastructure/docker
cp .env.example .env       # fill in secrets
docker compose up -d --build
```

Then visit:

- Admin portal:  http://localhost:4200
- Vendor portal: http://localhost:4300
- API health:    http://localhost:3000/api/health

## Required secrets

Compose refuses to start if any of these are blank — set them in `.env`:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `VENDOR_JWT_SECRET`
- `VENDOR_JWT_REFRESH_SECRET`

Generate with `openssl rand -base64 48` per secret.

## Production deployment notes

1. **Reverse proxy:** Front the three web services with a TLS-terminating proxy (Caddy, nginx, or
   Traefik). Do not expose the API directly to the public network — the OpenAPI describes vendor
   endpoints that are public-facing but commercial / audit endpoints must stay behind VPN or zero-trust.
2. **CAPTCHA:** Vendor self-registration is blocked unless `CAPTCHA_SECRET_KEY` is set and the
   selected provider (`hcaptcha` or `recaptcha`) is reachable. This is a non-negotiable business rule.
3. **Backups:** `postgres_data` volume holds the entire system of record. Schedule daily logical
   backups (`pg_dump`) plus point-in-time WAL archiving for production.
4. **Audit log integrity:** the `audit_logs` table is append-only via DB triggers AND hash-chained at
   the application layer. Do NOT enable any extension that bypasses row-level triggers (e.g. logical
   replication slots with conflict resolvers).
5. **SMTP:** notifications fail open by default (template-not-sent is logged but does not block the
   business transaction). Configure SMTP early — vendor verification + award notifications depend on it.

## Rebuilding individual services

```bash
docker compose build api
docker compose up -d api
```

Compose will pick up source changes from the build context (the repo root).
