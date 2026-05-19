# CTMP Infrastructure Scripts

Helper scripts for local development and deployment of CTMP.

## Docker Development

### Quick Start

```bash
chmod +x docker-setup.sh
./docker-setup.sh
```

This script will:
1. Check that Docker and Docker Compose are installed
2. Generate random JWT secrets if `.env` doesn't exist
3. Start the full stack (PostgreSQL, Redis, API, web-admin, web-vendor)
4. Wait for all services to be healthy
5. Apply baseline seed data (roles, permissions, notification templates)
6. Report access URLs

### Accessing the Platform

Once setup is complete:

- **Admin Portal**: http://localhost:4200
- **Vendor Portal**: http://localhost:4300
- **API Health**: http://localhost:3000/api/v1/health
- **API Docs**: http://localhost:3000/api/v1/docs (Swagger)
- **MailHog** (email testing): http://localhost:8025
- **MinIO** (S3-compatible storage): http://localhost:9001

### Cleanup

Stop and remove containers and volumes:

```bash
./docker-clean.sh
```

Full reset (also removes `.env` file):

```bash
./docker-clean.sh --reset
# or
./docker-clean.sh -r
```

### Viewing Logs

```bash
cd infrastructure/docker
docker compose logs -f          # All services
docker compose logs -f api      # Just the API
docker compose logs -f postgres # Just PostgreSQL
```

### Rebuilding After Code Changes

If you've changed the API, admin portal, or vendor portal code:

```bash
cd infrastructure/docker
docker compose up -d --build
```

Or rebuild specific services:

```bash
docker compose build api
docker compose up -d api
```

## Environment Variables

The `.env` file in `infrastructure/docker/` controls the stack. Key variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | `ctmp_dev` |
| `JWT_SECRET` | Internal user JWT secret | Generated |
| `VENDOR_JWT_SECRET` | Vendor JWT secret | Generated |
| `CAPTCHA_PROVIDER` | Vendor registration CAPTCHA | `hcaptcha` (set `CAPTCHA_SECRET_KEY` for real) |
| `SMTP_HOST` | Email server | `mailhog` (local testing) |
| `STORAGE_DRIVER` | File storage backend | `local` (volumes) or `s3` (MinIO) |
| `NODE_ENV` | API environment | `production` |

For production, see `infrastructure/docker/.env.example` and the full Compose documentation in `infrastructure/docker/README.md`.

## Directory Structure

```
infrastructure/
├── docker/
│   ├── docker-compose.yml       # Full stack definition
│   ├── .env.example             # Template for secrets
│   ├── api.Dockerfile           # API build
│   ├── web-admin.Dockerfile     # Admin portal build
│   ├── web-vendor.Dockerfile    # Vendor portal build
│   └── README.md                # Deployment documentation
├── scripts/
│   ├── docker-setup.sh          # Quick local start
│   ├── docker-clean.sh          # Cleanup
│   └── README.md                # This file
├── k8s/                         # Kubernetes manifests (future)
└── terraform/                   # Infrastructure-as-Code (future)
```

## Troubleshooting

### Services won't start

```bash
# Check service status
cd infrastructure/docker
docker compose ps

# View logs
docker compose logs

# Rebuild and restart
docker compose down -v
docker compose up -d --build
```

### Port already in use

By default, services run on ports 3000 (API), 4200 (admin), 4300 (vendor), 5432 (postgres), 6379 (redis), 8025 (mailhog), 9000/9001 (minio). If these conflict:

1. Stop other services using those ports, OR
2. Edit `infrastructure/docker/docker-compose.yml` to use different ports, OR
3. Override via `.env`:
   ```
   API_PORT=3001
   WEB_ADMIN_PORT=4201
   POSTGRES_PORT=5433
   # etc.
   ```

### Database locked or corrupted

Remove all volumes and restart:

```bash
./docker-clean.sh --reset
./docker-setup.sh
```

This will recreate a fresh database and re-apply all migrations and seeds.

## Testing Against the Stack

Run e2e tests against the local stack:

```bash
# Ensure stack is running
./docker-setup.sh

# In another terminal, run tests
pnpm --filter @ctmp/qa-playwright run test
```

Or run a specific test spec:

```bash
pnpm --filter @ctmp/qa-playwright run test tests/golden-path.spec.ts
```

For CI/CD, see `../.github/workflows/e2e.yml`.
