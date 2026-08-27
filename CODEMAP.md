# CODEMAP — iTour Transport & Traffic

**Read this file first. It tells you which map to open, so you never have to grep the tree blind.**

Every map below is complete: **2,045 / 2,045 symbols described**, regenerated from the code itself.

| Area | Files | LOC | Root |
|---|---|---|---|
| Backend (NestJS) | 246 | 40k | `backend/src` — 444 endpoints, 37 controllers, 52 services |
| Frontend (Next.js) | 169 | 57k | `frontend/src` — 48 routes |
| Mobile (4 RN apps) | 121 | 13k | `mobile/apps/{driver,rep,supplier,guest}` |
| Prisma schema | 1 | 2.4k | `backend/prisma/schema.prisma` — 84 models |
| B2C site | 422 | 65k | **separate repo + VPS + database** → `docs/map/10-b2c-site.md` |

## Which map do I open?

| I need to… | Open |
|---|---|
| Find a function/class/method by name | `docs/map/12-symbol-index.md` — A–Z → `file:line` |
| Know **why** something behaves that way | `docs/map/11-business-rules.md` ← start here for bugs |
| See how the pieces fit together | `docs/map/00-architecture.md` |
| Trace a URL to its handler and service | `docs/map/02-backend-api.md` |
| Look up a table, column or relation | `docs/map/01-data-model.md` |
| Understand a backend service method | `03` ops · `04` finance · `05` portals · `06` platform |
| Find the page that renders a screen | `docs/map/07-frontend-routes.md` |
| Find a shared component, hook or store | `docs/map/08-frontend-shared.md` |
| Find a mobile screen | `docs/map/09-mobile.md` |
| Touch anything B2C | `docs/map/10-b2c-site.md` (it is a *fork*, read this first) |

## Fastest paths for common questions

| Question | Go to |
|---|---|
| "Why can't the driver complete this job?" | `11` → *Why can't the driver complete this job?* (usually the collection gate) |
| "Why is this job still ASSIGNED with both legs done?" | `11` → *The one rule that catches everyone* |
| "Where is this fee calculated?" | `11` → *Money* |
| "What does this endpoint call?" | `02` — every row lists its service method |
| "What touches this table?" | `03`–`06` — every method lists the models it reads/writes |
| "Which endpoints does this page call?" | `07` |

## Rules of the map

- **Generated files are owned by `scripts/generate-codemap.mjs`.** Hand-edits to `01`, `02`, `03`–`09`
  and `12` are overwritten. `00`, `10` and `11` are hand-written and never touched by it.
- **Prose lives in `docs/map/descriptions.json`**, keyed by stable symbol id
  (`backend/src/x.service.ts#XService.method`), and is merged in at render time — so regenerating
  never destroys a description.
- **Line numbers appear only in generated files.** Hand-written prose refers to
  `file.ts › symbolName`, which cannot rot.
- **`docs/map/_undescribed.txt`** is the work queue *and* the rot detector: it lists symbols with no
  prose, and flags stale entries whose symbol no longer exists.

```bash
node scripts/generate-codemap.mjs     # regenerate (~0.4s, no dependencies)
node scripts/add-descriptions.mjs     # merge a JSON batch of descriptions from stdin
```

A **pre-commit hook** (`scripts/hooks/pre-commit`, wired via `core.hooksPath`) regenerates and stages
the map on any commit touching `.ts`/`.tsx`/`.prisma`, so it cannot silently fall behind.
