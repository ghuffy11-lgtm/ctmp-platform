# Local Docker Development Setup (Windows Server 2022)

Complete guide for setting up WSL2 + Docker Desktop for local CTMP development.

## Prerequisites

- Windows Server 2022 Standard
- Administrator access
- ~30 GB free disk space
- 8+ GB RAM available

## Step 1: Enable Windows Features

Run PowerShell as Administrator:

```powershell
# Enable required Windows features
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart

# Restart required
Restart-Computer
```

## Step 2: Install WSL2 Kernel

After restart, run PowerShell as Administrator:

```powershell
# Download and install WSL2 kernel
wsl --install --no-distribution

# Update WSL2
wsl --update
```

## Step 3: Install Linux Distribution

```powershell
# List available distros
wsl --list --online

# Install Ubuntu 22.04 (recommended)
wsl --install -d Ubuntu-22.04

# First boot will prompt for username/password
```

After installation, verify:

```bash
# From WSL2 bash
wsl --list --verbose
# Should show Ubuntu-22.04 with Version 2
```

## Step 4: Install Docker Desktop

1. Download Docker Desktop installer from https://www.docker.com/products/docker-desktop
2. Run installer, ensure "Install required Windows components for WSL 2" is checked
3. After install, Docker Desktop Settings → Resources → WSL Integration → Enable integration with Ubuntu-22.04
4. Restart Docker Desktop

Verify installation:

```bash
docker --version
docker compose version
```

## Step 5: Clone/Access Repo in WSL2

From WSL2 bash:

```bash
# Option A: Clone repo into WSL2 (recommended)
cd ~
git clone git@github.com:ghuffy11-lgtm/ctmp-platform.git

# Option B: Access repo from Windows (slower but simpler)
cd /mnt/d/Work/CTMP/ctmp-platform
```

## Step 6: Start CTMP Stack

```bash
cd ctmp-platform/infrastructure/docker

# Copy .env template and generate secrets
cp .env.example .env

# Generate random JWT secrets (Linux in WSL2)
openssl rand -base64 48 > /tmp/jwt1.txt
openssl rand -base64 48 > /tmp/jwt2.txt
openssl rand -base64 48 > /tmp/jwt3.txt
openssl rand -base64 48 > /tmp/jwt4.txt

# Edit .env and replace placeholders with generated values
# Or use sed:
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(cat /tmp/jwt1.txt)|" .env
sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(cat /tmp/jwt2.txt)|" .env
sed -i "s|VENDOR_JWT_SECRET=.*|VENDOR_JWT_SECRET=$(cat /tmp/jwt3.txt)|" .env
sed -i "s|VENDOR_JWT_REFRESH_SECRET=.*|VENDOR_JWT_REFRESH_SECRET=$(cat /tmp/jwt4.txt)|" .env

# Start stack
docker compose up -d --build

# Wait ~2 min for all services to start
docker compose ps

# Should see all services as "healthy" or "running"
```

## Step 7: Apply Baseline Seeds

```bash
# From WSL2, in ctmp-platform directory
for f in database/seeds/*.sql; do
  echo "Applying $f..."
  docker compose exec -T postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1 < "$f"
done
```

## Step 8: Verify Services

```bash
# API health
curl http://localhost:3000/api/v1/health

# Admin portal
curl -s http://localhost:4200 | head -20

# Vendor portal
curl -s http://localhost:4300 | head -20

# MailHog (open in browser)
firefox http://localhost:8025 &

# MinIO console
firefox http://localhost:9001 &
```

## Access URLs

Once running:

| Service | URL |
|---------|-----|
| Admin Portal | http://localhost:4200 |
| Vendor Portal | http://localhost:4300 |
| API Health | http://localhost:3000/api/v1/health |
| API Docs | http://localhost:3000/api/v1/docs |
| MailHog | http://localhost:8025 |
| MinIO Console | http://localhost:9001 (user: ctmpadmin, password: ctmpadmin_dev) |

## Test Admin Login

Admin user (seeded):
- Email: `qa-admin@hadiclinic.com.kw`
- Password: `QaAdminPass!2026`

## Run E2E Tests Against Local Stack

From WSL2:

```bash
cd ctmp-platform

# Install dependencies if not done
pnpm install

# Run all tests
pnpm --filter @ctmp/qa-playwright run test

# Run specific test
pnpm --filter @ctmp/qa-playwright run test tests/golden-path.spec.ts

# View Playwright report
pnpm --filter @ctmp/qa-playwright run test
# Then open playwright-report/index.html in browser
```

## Useful Commands

```bash
# View logs
docker compose logs -f              # All services
docker compose logs -f api          # Just API
docker compose logs -f postgres     # Just PostgreSQL

# Stop stack (keep data)
docker compose down

# Full clean (remove volumes)
docker compose down -v

# Rebuild after code changes
docker compose build api
docker compose up -d api

# Access PostgreSQL CLI
docker compose exec postgres psql -U ctmp -d ctmp

# Access Redis CLI
docker compose exec redis redis-cli
```

## Troubleshooting

**Error: "Docker daemon not running"**
- Ensure Docker Desktop is running (check system tray)
- Restart Docker Desktop

**Error: "Cannot connect to docker"**
- Check WSL2 integration: Docker Desktop Settings → Resources → WSL Integration
- Ensure Ubuntu-22.04 is enabled
- Restart Docker Desktop

**Port already in use**
- List processes: `netstat -tuln | grep LISTEN`
- Kill process: `lsof -i :3000` then `kill -9 <PID>`
- Or change ports in `.env`

**Database won't start**
- Remove volume: `docker compose down -v`
- Rebuild: `docker compose up -d --build postgres`

**Tests failing with "Cannot connect to API"**
- Verify API is running: `curl http://localhost:3000/api/v1/health`
- Check logs: `docker compose logs api`
- Ensure QA_API_URL env var matches: `export QA_API_URL=http://localhost:3000`

## Next Steps

1. ✓ Start stack
2. ✓ Verify all services healthy
3. Run golden-path e2e test
4. Login to admin portal + test UI flows
5. Login to vendor portal + test registration + bid wizard

For issues, check `docker compose logs` output or file an issue.
