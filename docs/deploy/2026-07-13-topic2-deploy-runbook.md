# Deploy Runbook — Topic 2 (iTourTT) + B2C standalone

**Window:** tonight 00:00 Africa/Cairo, after last live job on prod completes.
**Scope:** ship `feat/b2c-partner-seam` (iTourTT) + `feat/standalone-backend` (B2C) together.
**Status:** PLAN ONLY. Nothing here runs until you say go.

---

## 0. Why this order (non-negotiable)

iTourTT **first**, B2C **second**, same window. Reasons:

- B2C backend `partner-client` pushes pricing/jobs → iTourTT `/api/partner/*`. That seam is **not on iTourTT `main`/live yet** → B2C pushes 404 until iTourTT ships it. iTourTT must go first.
- This iTourTT release **removes** the old embedded website API (`/api/public/*`, `/api/w-api/*`). The **currently-live** B2C container calls exactly those on `fulvago.itourtt.cloud`. The moment iTourTT deploys, the live B2C site breaks — **unless** B2C is simultaneously flipped to its own standalone backend (which now serves `/api/public/*` itself). So B2C must cut over in the same window, right after iTourTT.

Net: iTourTT deploy → verify seam up → B2C cut to standalone → verify end-to-end.

---

## 1. BLOCKERS — must clear BEFORE 00:00 (do this evening, zero downtime)

These are not optional. Each one silently breaks the deploy if skipped.

| # | Blocker | Why | Action |
|---|---------|-----|--------|
| B1 | `deploy.sh` runs `git pull origin main`, but all Topic-2 work is on `feat/b2c-partner-seam` | Deploy would ship the OLD code | Merge `feat/b2c-partner-seam` → `main`, push. (Or edit deploy.sh line 17 to pull the branch — merge is cleaner.) |
| B2 | `PARTNER_API_KEY` not in iTourTT prod k8s secret. Guard **fails closed** → every partner call 401 | Whole seam dead | Add `PARTNER_API_KEY` to prod backend secret; must **exactly equal** B2C backend `PARTNER_API_KEY`. See §5. |
| B3 | B2C `docker-compose.yml` still runs only the OLD single `web` container → `fulvago` | Standalone backend + b2c_db never start | Rewrite compose to 3 services (postgres + backend + web). See §6. Author + test on VPS tonight before window. |
| B4 | B2C backend has **0 prisma migrations** (schema is `db push`-only) | `migrate deploy` would apply nothing | Use `prisma db push` on the B2C VPS to create `b2c_db`. See §6. |
| B5 | B2C backend has **no seed file** → super-admin (`mggouda@gmail.com`) is local-DB-only state | No login on fresh b2c_db | Recreate super-admin on the new VPS DB via one-off script/insert. See §6. |
| B6 | Host nginx on B2C VPS proxies `:80/:443 → :3000` only | Frontend `/api/*` must reach backend :3002 | Add nginx `location /api/ → 127.0.0.1:3002`. See §6. |

**Also prep tonight (safe, no downtime):**
- Full DB backup, both systems (§7).
- Pre-build B2C images on the VPS if possible (warms cache; cuts window). iTourTT uses `--no-cache` so its build runs live.
- Rotate Gemini key; confirm JWT/DB secrets strong + distinct on both prod.
- Confirm xlsx build can reach `cdn.sheetjs.com` (both backends pin the CDN tarball).

---

## 2. Time estimates

Downtime is small on both — the wall-clock is **build-dominated**. Pre-build where noted to shrink it.

### iTourTT (k3s VPS, `deploy.sh`)
| Step | Est. | Notes |
|------|------|-------|
| Merge→main + `git pull` | 1 min | done pre-window (B1) |
| Backend image build `--no-cache` | 6–10 min | live on VPS, unavoidable |
| Frontend image build `--no-cache` | 6–10 min | live on VPS |
| `docker save \| ctr import` ×2 | 2–3 min | |
| set image + rollout backend | ~2 min | replicas=2, rolling — near-zero user downtime |
| `migrate deploy` + `db push` | 1–2 min | 3 new migrations |
| seed | ~30 s | perms/params skipped |
| rollout frontend | ~2 min | |
| one-off SQL (§7) | ~1 min | |
| cleanup | ~2 min | |
| **iTourTT total** | **~25–35 min** | actual user-facing cutover ≈ 1–2 min |

### B2C (VPS 31.97.45.33)
| Step | Est. | Notes |
|------|------|-------|
| `git pull` | ~20 s | |
| compose build (backend + web) | 8–15 min | **halve if pre-built tonight** |
| compose up (pg+backend+web) | ~1 min | |
| `prisma db push` (create b2c_db) | ~30 s | B4 |
| recreate super-admin | ~2 min | B5 |
| nginx `/api` route + reload | ~2 min | B6 |
| **B2C total** | **~15–25 min** (~8–12 if pre-built) | |

### End-to-end connectivity tests (§8): **5–10 min**

**Grand total window: ~45–70 min** live-build, **~30–40 min** if B2C pre-built.
Recommend starting builds the moment the last live job closes.

---

## 3. iTourTT deploy — runbook (Phase 1)

Pre-window (B1) done → on the k3s VPS:

```bash
# 3.1 sanity: on prod VPS, main has the seam
cd /opt/itour && git fetch origin && git log origin/main --oneline | grep -i partner   # expect the partner-seam commits

# 3.2 backup FIRST (see §7)

# 3.3 run the deploy (builds, imports, sets image, migrates, seeds, rolls out)
./deploy.sh production
```

`deploy.sh` does: pull main → build backend+frontend `--no-cache` → `ctr import` → `set image` (both) → scale 2 → **rollout backend first** → `prisma migrate deploy` → `prisma db push --accept-data-loss` → seed (perms/params skipped) → rollout frontend → prune.

> ⚠️ **`db push --accept-data-loss` (line 67).** Backup (§7) covers you. Schema still declares every model (strip removed code, not tables) → no drops expected. If you want zero risk, comment line 67 for this run — `migrate deploy` is sufficient.

**Verify migrations actually applied** (steps are `|| true` → they don't fail the script):
```bash
NS=itour-production
kubectl exec -n $NS deployment/backend -- npx prisma migrate status | tail -20
# expect applied: 20260713_user_2fa, 20260713_user_sessions, 20260713_finance_indexes
```

Then run one-off SQL (§7), then the smoke checks (§8.1).

---

## 4. B2C deploy — runbook (Phase 2, after iTourTT verified)

On the B2C VPS (`31.97.45.33`, `/opt/iTourTT-B2CSite`):

```bash
cd /opt/iTourTT-B2CSite
git fetch origin && git checkout feat/standalone-backend && git pull

# compose now = 3 services (see §6). Build + up:
docker compose up -d --build
docker compose ps            # web:3000, backend:3002, postgres all Up

# create b2c_db schema (no migrations exist → db push)
docker compose exec backend npx prisma db push

# recreate super-admin on fresh DB (see §6 script)
docker compose exec backend node scripts/create-superadmin.js   # mggouda@gmail.com

# nginx: add /api → :3002, reload
sudo nginx -t && sudo systemctl reload nginx
docker compose logs -f backend   # confirm boot + "listening on 3002"
```

---

## 5. iTourTT prod PARTNER_API_KEY (B2)

Guard: `PartnerKeyGuard` compares `X-Partner-Key` header vs `process.env.PARTNER_API_KEY`, timing-safe, **fails closed if unset**. Must be in the prod backend secret and identical on both sides.

```bash
NS=itour-production
# inspect current secret keys (find the backend env secret name)
kubectl get secret -n $NS
# add/patch PARTNER_API_KEY (base64), then restart backend to pick it up
kubectl patch secret <backend-secret> -n $NS \
  --type merge -p "{\"data\":{\"PARTNER_API_KEY\":\"$(printf %s '<THE-KEY>' | base64 -w0)\"}}"
kubectl rollout restart deployment/backend -n $NS
```
`<THE-KEY>` = the value in B2C `backend/.env` `PARTNER_API_KEY`. **Copy it verbatim; do not regenerate one side only.**

---

## 6. B2C standalone compose + nginx + super-admin (B3–B6)

The deployed compose is stale (single `web` → fulvago). Target: **postgres + backend(:3002) + web(:3000)**, web talks same-origin `/api` (nginx routes `/api`→backend).

**Target `docker-compose.yml` (author + commit to B2C repo tonight):**
```yaml
services:
  postgres:
    image: postgres:16
    container_name: b2c-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: b2c_db
      POSTGRES_USER: b2c
      POSTGRES_PASSWORD: ${B2C_DB_PASSWORD}
    volumes: [b2c-pgdata:/var/lib/postgresql/data]

  backend:
    build: ./backend
    container_name: b2c-backend
    restart: unless-stopped
    depends_on: [postgres]
    environment:
      NODE_ENV: production
      PORT: 3002
      DATABASE_URL: postgres://b2c:${B2C_DB_PASSWORD}@postgres:5432/b2c_db
      JWT_SECRET: ${B2C_JWT_SECRET}
      ITOURTT_API_URL: https://fulvago.itourtt.cloud
      PARTNER_API_KEY: ${PARTNER_API_KEY}       # == iTourTT prod (§5)
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    ports: ["127.0.0.1:3002:3002"]

  web:
    build:
      context: .
      args:
        NEXT_PUBLIC_API_URL: https://transferra.ae   # same-origin; nginx routes /api→backend
    image: itourtt-b2c:latest
    container_name: itourtt-b2c
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_API_URL: https://transferra.ae
    ports: ["127.0.0.1:3000:3000"]

volumes:
  b2c-pgdata:
```

**nginx (`/etc/nginx/sites-available/transferra`) — add before the `/` block:**
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
location / {
    proxy_pass http://127.0.0.1:3000;
    # ...existing headers...
}
```

**Super-admin recreate (B5)** — no seed file exists. Write a tiny one-off (`backend/scripts/create-superadmin.js`) that upserts `mggouda@gmail.com` with the Super Admin role + bcrypt password, or insert via psql. Confirm the exact role name from local b2c_db before the window.

> Also replicate any **local-only** B2C DB state from the separation build: pruned roles (Super Admin / Transportation Accountant / SEO Admin), permission-matrix grants, password changes. These live only in your local b2c_db — script or dump/restore them.

---

## 7. Data steps — backups + one-off SQL

**Backups (before any deploy):**
```bash
# iTourTT prod
kubectl exec -n itour-production deployment/postgres -- \
  pg_dump -U <user> itour_db | gzip > itour_db_$(date +%F).sql.gz
# B2C (if a prior DB exists; first standalone deploy starts empty)
```

**iTourTT one-off SQL (after migrate, via `kubectl exec ... psql`):**
```sql
-- Brand reset (slate/sky) — else old purple persists (branding is DB-driven)
UPDATE system_settings
SET primary_color='#0ea5e9', accent_color='#06b6d4', sidebar_color='#0f172a';

-- Backfill isPosted on rows created before the immutability fix
UPDATE payments       SET is_posted = true WHERE is_posted = false;
UPDATE supplier_costs SET is_posted = true WHERE is_posted = false;
```
> Verify exact table/column names against schema before running (`is_posted` on `payments` + `supplier_costs`).

---

## 8. API connectivity tests — partner seam

Run after **both** sides are up. `KEY` = the shared `PARTNER_API_KEY`. All read-only (safe on prod).

### 8.1 iTourTT seam reachable + auth correct
```bash
KEY='<PARTNER_API_KEY>'
BASE='https://fulvago.itourtt.cloud'

# positive — reference data
curl -sS -o /dev/null -w "reference: %{http_code}\n" -H "X-Partner-Key: $KEY" $BASE/api/partner/reference        # expect 200

# negative — wrong key (guard fails closed)
curl -sS -o /dev/null -w "wrong-key: %{http_code}\n" -H "X-Partner-Key: nope" $BASE/api/partner/reference        # expect 401

# negative — no key
curl -sS -o /dev/null -w "no-key:    %{http_code}\n" $BASE/api/partner/reference                                 # expect 401

# job status read (empty refs ok)
curl -sS -H "X-Partner-Key: $KEY" "$BASE/api/partner/jobs?refs=" | head -c 200; echo
```

### 8.2 B2C standalone self-check
```bash
BASE='https://transferra.ae'
curl -sS -o /dev/null -w "b2c public/pages: %{http_code}\n" $BASE/api/public/pages          # expect 200 (served by NEW backend, not fulvago)
curl -sSI $BASE/ | head -1                                                                   # site 200
```

### 8.3 End-to-end (real push) — preferred over synthetic POST
Do a live B2C quote/booking through the site UI, then confirm it landed:
```bash
# after a test booking on transferra.ae, its ref should appear:
curl -sS -H "X-Partner-Key: $KEY" "$BASE_ITOUR/api/partner/jobs?refs=<REF>" | jq .
docker compose logs backend | grep -i partner    # B2C side: push succeeded, no 401/timeout
```
> Synthetic `POST /api/partner/pricing` / `POST /api/partner/jobs` exist but **mutate prod** — prefer the real B2C flow above. If you must POST synthetically, use throwaway data and clean up. Bodies: `UpsertPublicPricesDto` (pricing), `PartnerJobDto` (jobs).

**Pass criteria:** 8.1 all expected codes · 8.2 both 200 (B2C served by its own backend) · 8.3 ref visible on iTourTT + no 401/timeout in B2C logs.

---

## 9. Rollback

**iTourTT** (images tagged per VERSION, prior kept until prune):
```bash
NS=itour-production
kubectl rollout undo deployment/backend  -n $NS
kubectl rollout undo deployment/frontend -n $NS
# migrations: additive (2FA cols, sessions table, indexes) — safe to leave. Restore from §7 dump only if data corrupted.
```
**B2C**: revert compose to prior commit + `docker compose up -d --build`; restore nginx site; the OLD single-container flow returns (but needs the old fulvago `/api/public/*` — which iTourTT no longer serves, so a B2C rollback implies an iTourTT rollback too). **Roll back both or neither.**

---

## 10. Post-deploy checklist
- [ ] iTourTT: login works; sidebar slate/sky (not purple); footer = ResLite format
- [ ] 2FA setup/verify round-trips; recovery codes show
- [ ] Rep/driver single-device lock: 2nd device → 409 + manager modal
- [ ] `/uploads` private doc needs auth; login branding still public
- [ ] Job Control appears in permission matrix; admins have it
- [ ] Finance: new payment posts `is_posted=true`, currency = invoice currency
- [ ] Email smoke test (nodemailer 9) sends
- [ ] xlsx export downloads (CDN reachable)
- [ ] §8 all green
- [ ] B2C: site loads; hero container has the 25% overlay; admin = ResLite light+dark
- [ ] B2C super-admin login works; roles/permissions replicated
- [ ] Local == origin on both repos (no commit drift)

---
*Prepared 2026-07-13. Execute at your go tonight 00:00. Deploy iTourTT → verify → B2C → verify end-to-end.*
