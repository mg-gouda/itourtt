# CODEMAP — iTour Transport & Traffic

**Read this file first. It tells you which map to open; you should rarely need to grep the codebase blind.**

| Area | Files | LOC | Root |
|---|---|---|---|
| Backend (NestJS) | 246 | 40,492 | `backend/src` |
| Frontend (Next.js) | 169 | 56,962 | `frontend/src` |
| Mobile (4 RN apps + 2 pkgs) | 121 | 13,436 | `mobile` |
| B2C site | 129 | 20,732 | separate repo `mg-gouda/iTourTT-B2CSite` |
| Prisma schema (84 models) | 1 | 2,394 | `backend/prisma/schema.prisma` |

## Which map do I open?

| I need to find… | Open |
|---|---|
| A function/class/method by name | `docs/map/12-symbol-index.md` — A–Z, gives `file:line` |
| Which endpoint serves a URL, and what it calls | `docs/map/02-backend-api.md` — 444 endpoints |
| A DB table, column, or relation | `docs/map/01-data-model.md` — 84 models |
| Which page renders a screen, and what it calls | `docs/map/07-frontend-routes.md` — 48 routes |
| Where a business rule is enforced | `docs/map/11-business-rules.md` _(phase 5)_ |
| What a backend service method does | `docs/map/03…06-backend-*.md` _(phase 2)_ |
| A shared component / hook / store | `docs/map/08-frontend-shared.md` _(phase 3)_ |
| A mobile screen | `docs/map/09-mobile.md` _(phase 4)_ |
| A B2C page | `docs/map/10-b2c-site.md` _(phase 4)_ |
| How the system fits together | `docs/map/00-architecture.md` _(phase 5)_ |

## How the map stays true

```
node scripts/generate-codemap.mjs      # regenerate (~0.4s)
```

- **Generated files are owned by the script.** Hand-edits to `01`, `02`, `07`, `12` are overwritten.
- **Prose lives in `docs/map/descriptions.json`**, keyed by stable symbol id
  (`backend/src/x.service.ts#XService.method`). The generator merges it in, so regenerating
  never destroys a description.
- **`docs/map/_undescribed.txt`** lists symbols still missing a description, plus any *stale*
  entries whose symbol no longer exists — that file is the work queue and the rot detector.
- A **pre-commit hook** (`scripts/hooks/pre-commit`, wired via `core.hooksPath`) regenerates and
  stages the map whenever a commit touches `.ts`/`.tsx`/`.prisma`.

Line numbers appear **only** in generated files. Hand-written prose refers to symbols
(`driver-portal.service.ts › submitCompleted`), never line numbers, so it cannot rot.

## Status

Phase 1 complete: generator, hook, and the four generated maps.
Descriptions: **0 / 576** — phases 2–4 fill these in (final target ≈2,200 including service
methods and exports, which register their description slots as those maps are added).
