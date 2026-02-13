#!/bin/bash
set -e

echo "=== iTourTT Production Deployment ==="

# Check .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

# Load env
source .env

# Check required vars
for var in DOMAIN POSTGRES_PASSWORD JWT_SECRET JWT_REFRESH_SECRET; do
  if [ -z "${!var}" ] || [[ "${!var}" == *"change"* ]]; then
    echo "ERROR: $var is not set or still has default value in .env"
    exit 1
  fi
done

# Check SSL certificates exist
if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then
  echo "WARNING: SSL certificates not found in nginx/ssl/"
  echo "Place your SSL files at:"
  echo "  nginx/ssl/fullchain.pem"
  echo "  nginx/ssl/privkey.pem"
  echo ""
  echo "You can generate free certificates with:"
  echo "  certbot certonly --standalone -d $DOMAIN"
  echo "  cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/"
  echo "  cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/"
  echo ""
  read -p "Continue without SSL? (y/N): " confirm
  if [ "$confirm" != "y" ]; then
    exit 1
  fi
fi

echo ""
echo "Deploying to: $DOMAIN"
echo ""

# Pull latest code
echo ">> Pulling latest code..."
git pull origin main

# Build and start containers
echo ">> Building and starting containers..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Wait for database
echo ">> Waiting for database..."
sleep 5

# Run Prisma migrations
echo ">> Running database migrations..."
docker compose -f docker-compose.prod.yml exec backend npx prisma db push --accept-data-loss

# Seed database (only on first deploy)
if [ "$1" = "--seed" ]; then
  echo ">> Seeding database..."
  docker compose -f docker-compose.prod.yml exec backend npx tsx src/prisma/seed.ts
fi

echo ""
echo "=== Deployment complete ==="
echo "Frontend: https://$DOMAIN"
echo "API:      https://$DOMAIN/api"
echo ""
echo "Check status: docker compose -f docker-compose.prod.yml ps"
echo "View logs:    docker compose -f docker-compose.prod.yml logs -f"
