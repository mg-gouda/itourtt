# 00 — Architecture

Hand-written. The generator never touches this file.

## The two systems

```
  ┌──────────────────────── /opt/itour  (repo: mg-gouda/itourtt) ────────────────────────┐
  │                                                                                       │
  │   frontend/  Next.js         backend/  NestJS  ──────▶  PostgreSQL  (k3s, itour-prod) │
  │   ├─ /dashboard  admin        ├─ 444 endpoints, /api prefix                           │
  │   ├─ /driver     portal       ├─ 84 Prisma models                                     │
  │   ├─ /rep        portal       └─ deny-by-default JWT + RBAC v2                        │
  │   └─ /supplier   portal                                                               │
  │   mobile/   4 React Native apps (driver, rep, supplier, guest)                        │
  │                                        ▲                                              │
  └────────────────────────────────────────┼──────────────────────────────────────────────┘
                                           │  /api/partner  (shared API key, not JWT)
                                           │  PartnerService: reference · pricing · jobs
  ┌────────────────────────────────────────┼──────────────────────────────────────────────┐
  │  31.97.45.33  transfera.ae  (repo: mg-gouda/iTourTT-B2CSite)                           │
  │   src/  Next.js storefront + admin      backend/  NestJS FORK ──▶ PostgreSQL (b2c_db)  │
  └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Ownership split:** B2C owns bookings; iTourTT owns operational job status. See
`10-b2c-site.md` — the B2C backend is a *fork*, not a shared library, and is missing several
features that exist here.

## Request lifecycle (backend)

```
HTTP → JwtAuthGuard (global, deny-by-default; @Public opts out)
     → RolesGuard      (legacy; yields when the user has a roleId)
     → PermissionsGuard(@Permissions keys, 5-min static cache)
     → Controller      (DTO validation via class-validator)
     → Service         (all business logic lives here)
     → PrismaService   (no business logic in the database)
     → AuditInterceptor writes an ActivityLog row with a field-level diff
     → ApiResponse / PaginatedResponse envelope
```

## The job lifecycle

A job carries **three independent legs** on its single `TrafficAssignment`, plus its own status:

```
  TrafficJob.status   PENDING → ASSIGNED → COMPLETED | CANCELLED | NO_SHOW   (stored, not derived)
        ▲
        │  reconcileJobStatus()  ← every path that completes a leg MUST call this
        │
  driverStatus   PENDING → IN_PROGRESS → COMPLETED
  repStatus      PENDING → IN_PLACE    → COMPLETED     ← IN_PLACE, not IN_PROGRESS
  supplierStatus PENDING → COMPLETED
```

Completion materialises money: `DriverTripFee` from the tariff table, `RepFee` from the rep's score.
Details in `11-business-rules.md`.

## Layout

| Path | What |
|---|---|
| `backend/src/<module>/` | One NestJS module each: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/` |
| `backend/src/common/` | Guards, decorators, interceptors, and the shared rule utilities |
| `backend/prisma/schema.prisma` | The single schema. UUID string ids, soft deletes, audit fields |
| `frontend/src/app/(dashboard)/` | Admin screens |
| `frontend/src/app/(driver-portal)/` etc. | The three web portals |
| `frontend/src/components/ui/` | shadcn primitives; everything above it is project-specific |
| `mobile/apps/<app>/` | One React Native app each, over `mobile/packages/{shared,ui}` |

## Conventions worth knowing before you write code

- **Business logic lives in services.** Controllers validate and delegate; the database holds none.
- **Soft delete everywhere** — `deletedAt`, never a hard delete. Every list query filters it.
- **Shared rules live in `common/utils`** and have exactly one home: service types, rep scoring,
  the no-show window, geofencing. Never hard-code a service-type string.
- **Africa/Cairo, always.** Use the timezone helpers; never format with the device zone.
- **Excel pipelines come in threes**: `exportToExcel`, `generateImportTemplate`, `importFromExcel`.
  Templates are pre-filled with real zones and vehicle types so imported names resolve to ids.
- **Permission keys are hierarchical** and mirrored between `backend/src/permissions/
  permission-registry.ts` and `frontend/src/lib/permission-registry.ts`. Keep them in sync.

## Where do I add…?

| Task | Start here |
|---|---|
| A new endpoint | the module's `*.controller.ts`, then its service; add `@Permissions` |
| A new permission | both permission registries, then a `rolePermissionV2` insert in prod |
| A new table | `schema.prisma` → migration → the owning service |
| A new admin screen | `frontend/src/app/(dashboard)/dashboard/<name>/page.tsx` + a sidebar entry |
| A new report | `reports.service.ts` (JSON) **and** `export.service.ts` (xlsx) — they pair up |
| A rule that both portals share | `backend/src/common/utils/`, not one portal |

## Deployment

k3s on the main VPS, namespace `itour-production`: 2 backend pods, 2 frontend pods, 1 postgres.
`./deploy.sh production` builds, imports images into containerd and applies migrations. Known traps
are recorded in `docs/deploy/` and the project memory: image pruning causing `ErrImageNeverPull`,
`prisma migrate deploy` failing without halting the script, and `SKIP_PERMISSION_SEED=true` in prod.
