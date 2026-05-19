#!/bin/bash
# Start CTMP Docker stack in WSL2
# Run from: /mnt/d/Work/CTMP/ctmp-platform or ~/ctmp-platform (if cloned in WSL2)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

echo "=== CTMP Docker Stack Startup (WSL2) ==="
echo ""

# Verify we're in WSL2
if ! grep -qi microsoft /proc/version 2>/dev/null; then
    echo "ERROR: Not running in WSL2. Run this from WSL2 Ubuntu terminal."
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker not found. Ensure Docker Desktop is running with WSL2 integration enabled."
    exit 1
fi

cd "$DOCKER_DIR"
echo "Working directory: $(pwd)"
echo ""

# Create .env if missing
if [ ! -f ".env" ]; then
    echo "Creating .env with random secrets..."
    cp .env.example .env

    JWT1=$(openssl rand -base64 48)
    JWT2=$(openssl rand -base64 48)
    JWT3=$(openssl rand -base64 48)
    JWT4=$(openssl rand -base64 48)

    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT1|" .env
    sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT2|" .env
    sed -i "s|VENDOR_JWT_SECRET=.*|VENDOR_JWT_SECRET=$JWT3|" .env
    sed -i "s|VENDOR_JWT_REFRESH_SECRET=.*|VENDOR_JWT_REFRESH_SECRET=$JWT4|" .env

    echo "✓ .env created with secrets"
else
    echo "✓ Using existing .env"
fi

echo ""
echo "Starting Docker Compose stack..."
docker compose up -d --build

echo ""
echo "Waiting for services to be healthy (2 min)..."
sleep 120

# Check health
echo ""
echo "Health check:"
docker compose ps

# Apply seeds
echo ""
echo "Applying database seeds..."
for f in ../../database/seeds/*.sql; do
    if [ -f "$f" ]; then
        echo "  Applying $(basename "$f")..."
        docker compose exec -T postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1 < "$f" 2>/dev/null || true
    fi
done

echo ""
echo "=== Stack Ready ==="
echo ""
echo "Access at:"
echo "  Admin:       http://localhost:4200"
echo "  Vendor:      http://localhost:4300"
echo "  API Docs:    http://localhost:3000/api/v1/docs"
echo "  MailHog:     http://localhost:8025"
echo ""
echo "Test credentials:"
echo "  Email: qa-admin@hadiclinic.com.kw"
echo "  Password: QaAdminPass!2026"
echo ""
echo "Commands:"
echo "  Logs:        docker compose logs -f"
echo "  Stop:        docker compose down"
echo "  Clean:       docker compose down -v"
echo ""
