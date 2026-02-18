#!/bin/bash
set -e

echo "=== iTourTT Production Deployment ==="

cd /opt/iTourTT

# Pull latest code
echo ">> Pulling latest code..."
git pull origin main

# Build and start containers
echo ">> Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

# Wait for backend to be ready
echo ">> Waiting for backend..."
sleep 10

# Run Prisma migrations
echo ">> Running database migrations..."
docker exec itour_backend npx prisma migrate deploy

echo ""
echo "=== Deployment complete ==="
echo "Site: https://fulvago.itourtt.cloud"
echo ""
echo "Check status: docker compose -f docker-compose.prod.yml ps"
echo "View logs:    docker compose -f docker-compose.prod.yml logs -f"
