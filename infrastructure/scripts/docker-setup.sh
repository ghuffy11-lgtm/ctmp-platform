#!/bin/bash
# =============================================================================
# CTMP Docker Compose Quick Setup
# Generates secrets, creates .env, starts stack, seeds database, and reports URLs.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../docker"
ENV_FILE="$DOCKER_DIR/.env"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== CTMP Docker Setup ===${NC}\n"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Error: Docker is not installed or not in PATH${NC}"
  exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}Error: Docker Compose is not available${NC}"
  exit 1
fi

# Generate secrets if .env doesn't exist
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}Found existing .env — using current secrets${NC}\n"
else
  echo -e "${GREEN}Generating .env with random JWT secrets...${NC}"

  # Copy template
  cp "$DOCKER_DIR/.env.example" "$ENV_FILE"

  # Generate random secrets (or use openssl if available)
  if command -v openssl &> /dev/null; then
    JWT_SECRET=$(openssl rand -base64 48)
    JWT_REFRESH=$(openssl rand -base64 48)
    VENDOR_JWT=$(openssl rand -base64 48)
    VENDOR_REFRESH=$(openssl rand -base64 48)
  else
    # Fallback for systems without openssl
    JWT_SECRET=$(head -c 48 /dev/urandom | base64)
    JWT_REFRESH=$(head -c 48 /dev/urandom | base64)
    VENDOR_JWT=$(head -c 48 /dev/urandom | base64)
    VENDOR_REFRESH=$(head -c 48 /dev/urandom | base64)
  fi

  # Update .env with generated secrets
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
  sed -i.bak "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$JWT_REFRESH|" "$ENV_FILE"
  sed -i.bak "s|VENDOR_JWT_SECRET=.*|VENDOR_JWT_SECRET=$VENDOR_JWT|" "$ENV_FILE"
  sed -i.bak "s|VENDOR_JWT_REFRESH_SECRET=.*|VENDOR_JWT_REFRESH_SECRET=$VENDOR_REFRESH|" "$ENV_FILE"
  sed -i.bak "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=ctmp_dev|" "$ENV_FILE"

  # Clean up backup files
  rm -f "$ENV_FILE.bak"

  echo -e "${GREEN}✓ Secrets generated and saved to .env${NC}\n"
fi

# Start Docker Compose
echo -e "${GREEN}Starting Docker Compose stack...${NC}"
cd "$DOCKER_DIR"
docker compose up -d --build

# Wait for services to be healthy
echo -e "\n${GREEN}Waiting for services to be healthy...${NC}"
max_attempts=60
attempt=0
while [ $attempt -lt $max_attempts ]; do
  if docker compose exec -T postgres pg_isready -U ctmp -d ctmp &>/dev/null && \
     docker compose exec -T redis redis-cli ping &>/dev/null && \
     docker compose exec -T api wget --quiet --tries=1 --spider http://localhost:3000/api/v1/health &>/dev/null; then
    echo -e "${GREEN}✓ All services healthy${NC}\n"
    break
  fi
  attempt=$((attempt + 1))
  echo -n "."
  sleep 1
done

if [ $attempt -eq $max_attempts ]; then
  echo -e "\n${YELLOW}Warning: Services did not become healthy in time. Check logs with: docker compose logs${NC}"
fi

# Apply seed data
echo -e "${GREEN}Applying baseline seed data...${NC}"
for seedfile in ../../database/seeds/*.sql; do
  if [ -f "$seedfile" ]; then
    echo "  Applying $(basename $seedfile)..."
    docker compose exec -T postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1 < "$seedfile"
  fi
done
echo -e "${GREEN}✓ Seeds applied${NC}\n"

# Report URLs
echo -e "${GREEN}=== Setup Complete ===${NC}\n"
echo -e "Access the platform at:\n"
echo -e "  ${BLUE}Admin Portal:${NC}    http://localhost:4200"
echo -e "  ${BLUE}Vendor Portal:${NC}   http://localhost:4300"
echo -e "  ${BLUE}API Health:${NC}      http://localhost:3000/api/v1/health"
echo -e "  ${BLUE}API Docs:${NC}        http://localhost:3000/api/v1/docs"
echo -e "  ${BLUE}MailHog (mail):${NC}  http://localhost:8025"
echo -e "  ${BLUE}MinIO Console:${NC}   http://localhost:9001\n"

echo -e "Useful commands:"
echo -e "  ${BLUE}View logs:${NC}       cd $DOCKER_DIR && docker compose logs -f"
echo -e "  ${BLUE}Stop stack:${NC}      cd $DOCKER_DIR && docker compose down"
echo -e "  ${BLUE}Clean + restart:${NC} cd $DOCKER_DIR && docker compose down -v && docker compose up -d --build\n"
