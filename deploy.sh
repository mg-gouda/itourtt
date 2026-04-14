#!/bin/bash
set -e

USAGE="Usage: $0 [production|travelplan|all]"
ENV="${1:-all}"

if [[ "$ENV" != "production" && "$ENV" != "travelplan" && "$ENV" != "all" ]]; then
  echo "$USAGE"
  exit 1
fi

cd /opt/itour

# ── Pull latest code from GitHub ──
echo ""
echo ">> Pulling latest code from GitHub (main)..."
git pull origin main

# ── Derive version from package.json ──
VERSION=$(node -p "require('./backend/package.json').version")
echo ">> Version: $VERSION"

# ── Build shared backend image (same for all environments) ──
echo ""
echo ">> Building backend image..."
docker build --no-cache -t itourtt-backend:${VERSION} backend -q

# ── Build frontend images (per-environment feature flags) ──
# Production: Car Dispatch enabled
# TravelPlan: Car Dispatch disabled

needs_car_dispatch=false
needs_standard=false

if [[ "$ENV" == "production" || "$ENV" == "all" ]]; then
  needs_car_dispatch=true
fi
if [[ "$ENV" == "travelplan" || "$ENV" == "all" ]]; then
  needs_standard=true
fi

if $needs_car_dispatch; then
  echo ">> Building frontend image (with Car Dispatch)..."
  docker build --no-cache \
    --build-arg NEXT_PUBLIC_ENABLE_CAR_DISPATCH=true \
    -t itourtt-frontend:${VERSION}-cardispatch frontend -q
  docker save itourtt-frontend:${VERSION}-cardispatch | k3s ctr images import -
fi

if $needs_standard; then
  echo ">> Building frontend image (standard)..."
  docker build --no-cache -t itourtt-frontend:${VERSION} frontend -q
  docker save itourtt-frontend:${VERSION} | k3s ctr images import -
fi

# Import backend image into k3s
echo ">> Importing backend image into k3s..."
docker save itourtt-backend:${VERSION} | k3s ctr images import -

deploy_env() {
  local ns="$1"
  local label="$2"
  local frontend_tag="$3"

  echo ""
  echo "=== Deploying $label ($ns) ==="

  # Point both deployments to the new image tags
  kubectl set image deployment/backend backend=itourtt-backend:${VERSION} -n "$ns"
  kubectl set image deployment/frontend frontend=itourtt-frontend:${frontend_tag} -n "$ns"

  # Scale to 2 replicas
  echo ">> Scaling to 2 replicas..."
  kubectl scale deployment/backend --replicas=2 -n "$ns" 2>&1 || true
  kubectl scale deployment/frontend --replicas=2 -n "$ns" 2>&1 || true

  # Rollout backend FIRST so migration runs from the NEW image
  echo ">> Rolling out backend..."
  kubectl rollout restart deployment/backend -n "$ns"
  kubectl rollout status deployment/backend -n "$ns" --timeout=120s

  # Run migrations AFTER rollout — new image has the new migration files
  echo ">> Running database migrations..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma migrate deploy 2>&1 || true

  # Sync schema (catch any drift not covered by migrations)
  echo ">> Syncing database schema..."
  kubectl exec -n "$ns" deployment/backend -- npx prisma db push --accept-data-loss 2>&1 || true

  # Run seed AFTER migration
  echo ">> Running database seed (permissions + system params skipped)..."
  kubectl exec -n "$ns" deployment/backend -- env SKIP_PERMISSION_SEED=true SKIP_SYSTEM_PARAMS_SEED=true node dist/src/prisma/seed.js 2>&1 || true

  # Restart frontend
  echo ">> Rolling out frontend..."
  kubectl rollout restart deployment/frontend -n "$ns"
  kubectl rollout status deployment/frontend -n "$ns" --timeout=120s

  echo ">> $label deployed successfully!"
}

if [[ "$ENV" == "production" || "$ENV" == "all" ]]; then
  deploy_env "itour-production" "Production" "${VERSION}-cardispatch"
fi

if [[ "$ENV" == "travelplan" || "$ENV" == "all" ]]; then
  deploy_env "itour-travelplan" "TravelPlan" "${VERSION}"
fi

# ── Cleanup: remove unused images and Docker build cache ──
echo ""
echo ">> Pruning unused container images..."
k3s ctr images ls -q | grep "^sha256:" | xargs -r k3s ctr images rm 2>/dev/null || true
docker builder prune -af --filter "until=1h" -q 2>/dev/null || true

echo ""
echo "=== Deployment complete ==="
echo "Production:  https://fulvago.itourtt.cloud"
echo "TravelPlan:  https://travelplan.itourtt.cloud"
df -h / | awk 'NR==2 {printf "Disk:        %s used of %s (%s)\n", $3, $2, $5}'
