#!/bin/bash
set -e

USAGE="Usage: $0 [production|training|travelplan|all]"
ENV="${1:-all}"

if [[ "$ENV" != "production" && "$ENV" != "training" && "$ENV" != "travelplan" && "$ENV" != "all" ]]; then
  echo "$USAGE"
  exit 1
fi

cd /opt/itour

# ── Build shared backend image (same for all environments) ──
echo ""
echo ">> Building backend image..."
docker build --no-cache -t itourtt-backend:3.3.7 backend -q

# ── Build frontend images (per-environment feature flags) ──
# Production & Training: Car Dispatch enabled
# TravelPlan: Car Dispatch disabled

needs_car_dispatch=false
needs_standard=false

if [[ "$ENV" == "production" || "$ENV" == "training" || "$ENV" == "all" ]]; then
  needs_car_dispatch=true
fi
if [[ "$ENV" == "travelplan" || "$ENV" == "all" ]]; then
  needs_standard=true
fi

if $needs_car_dispatch; then
  echo ">> Building frontend image (with Car Dispatch)..."
  docker build --no-cache \
    --build-arg NEXT_PUBLIC_ENABLE_CAR_DISPATCH=true \
    -t itourtt-frontend:3.3.7-cardispatch frontend -q
  docker save itourtt-frontend:3.3.7-cardispatch | k3s ctr images import -
fi

if $needs_standard; then
  echo ">> Building frontend image (standard)..."
  docker build --no-cache -t itourtt-frontend:3.3.7 frontend -q
  docker save itourtt-frontend:3.3.7 | k3s ctr images import -
fi

# Import backend image into k3s
echo ">> Importing backend image into k3s..."
docker save itourtt-backend:3.3.7 | k3s ctr images import -

deploy_env() {
  local ns="$1"
  local label="$2"
  local frontend_tag="$3"

  echo ""
  echo "=== Deploying $label ($ns) ==="

  # Point frontend deployment to the correct image tag
  kubectl set image deployment/backend backend=itourtt-backend:3.3.7 -n "$ns"
  kubectl set image deployment/frontend frontend=itourtt-frontend:${frontend_tag} -n "$ns"

  # Run database migrations
  echo ">> Running database migrations..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma migrate deploy 2>&1 || true

  # Sync schema (catch any drift not covered by migrations)
  echo ">> Syncing database schema..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma db push --accept-data-loss 2>&1 || true

  # Run seed (upserts — safe to re-run)
  echo ">> Running database seed..."
  kubectl exec -n "$ns" deployment/backend -- node dist/src/prisma/seed.js 2>&1 || true

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
  deploy_env "itour-production" "Production" "3.3.7-cardispatch"
fi

if [[ "$ENV" == "training" || "$ENV" == "all" ]]; then
  deploy_env "itour-training" "Training" "3.3.7-cardispatch"
fi

if [[ "$ENV" == "travelplan" || "$ENV" == "all" ]]; then
  deploy_env "itour-travelplan" "TravelPlan" "3.3.7"
fi

echo ""
echo "=== Deployment complete ==="
echo "Production:  https://fulvago.itourtt.cloud"
echo "Training:    https://tranning.itourtt.cloud"
echo "TravelPlan:  https://travelplan.itourtt.cloud"
