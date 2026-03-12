#!/bin/bash
set -e

USAGE="Usage: $0 [production|training|all]"
ENV="${1:-all}"

if [[ "$ENV" != "production" && "$ENV" != "training" && "$ENV" != "all" ]]; then
  echo "$USAGE"
  exit 1
fi

cd /opt/itour

deploy_env() {
  local ns="$1"
  local label="$2"

  echo ""
  echo "=== Deploying $label ($ns) ==="

  # Build backend image
  echo ">> Building backend image..."
  docker build -t itourtt-backend:3.2.0 backend -q

  # Build frontend image
  echo ">> Building frontend image..."
  docker build -t itourtt-frontend:3.2.0 frontend -q

  # Run database migrations
  echo ">> Running database migrations..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma migrate deploy 2>&1 || true

  # Sync schema (catch any drift not covered by migrations)
  echo ">> Syncing database schema..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma db push --accept-data-loss 2>&1 || true

  # Restart backend
  echo ">> Rolling out backend..."
  kubectl rollout restart deployment/backend -n "$ns"
  kubectl rollout status deployment/backend -n "$ns" --timeout=120s

  # Restart frontend
  echo ">> Rolling out frontend..."
  kubectl rollout restart deployment/frontend -n "$ns"
  kubectl rollout status deployment/frontend -n "$ns" --timeout=120s

  echo ">> $label deployed successfully!"
}

if [[ "$ENV" == "production" || "$ENV" == "all" ]]; then
  deploy_env "itour-production" "Production"
fi

if [[ "$ENV" == "training" || "$ENV" == "all" ]]; then
  deploy_env "itour-training" "Training"
fi

echo ""
echo "=== Deployment complete ==="
echo "Production: https://fulvago.itourtt.cloud"
echo "Training:   https://tranning.itourtt.cloud"
