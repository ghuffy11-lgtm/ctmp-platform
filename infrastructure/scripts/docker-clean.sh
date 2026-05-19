#!/bin/bash
# =============================================================================
# CTMP Docker Cleanup
# Stops and removes containers, volumes, and optionally the .env file.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../docker"
ENV_FILE="$DOCKER_DIR/.env"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}=== CTMP Docker Cleanup ===${NC}\n"

# Parse arguments
REMOVE_ENV=false
if [ "$1" == "--reset" ] || [ "$1" == "-r" ]; then
  REMOVE_ENV=true
  echo -e "${YELLOW}Mode: Full reset (will remove .env file)${NC}\n"
else
  echo -e "${YELLOW}Mode: Clean volumes only (keeps .env)${NC}"
  echo -e "${YELLOW}Use --reset or -r to also remove .env file${NC}\n"
fi

# Stop and remove containers
echo -e "${GREEN}Stopping Docker Compose stack...${NC}"
cd "$DOCKER_DIR"
docker compose down -v

echo -e "${GREEN}✓ Containers and volumes removed${NC}\n"

# Optionally remove .env
if [ "$REMOVE_ENV" = true ]; then
  if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}Removing .env file...${NC}"
    rm -f "$ENV_FILE"
    echo -e "${GREEN}✓ .env removed${NC}\n"
  fi
fi

echo -e "${GREEN}=== Cleanup Complete ===${NC}"
echo -e "\nNext time, run: ${YELLOW}./infrastructure/scripts/docker-setup.sh${NC}\n"
