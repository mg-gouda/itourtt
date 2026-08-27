# 11 — Business Rules → Where They Live

Hand-written. The generator never touches this file.

Every rule below is enforced in code. When behaviour surprises you, this is the fastest path from
symptom to source. Locations are given as `file › symbol`, never line numbers, so they don't rot.

---

## The one rule that catches everyone

**`TrafficJob.status` is a stored column, not a derived one.**

Every write that can move a portal leg to COMPLETED must afterwards call
`common/services/job-completion.service.ts › reconcileJobStatus`. Before that service existed the
roll-up was duplicated inline in the two `/completed` handlers only, which stranded jobs at ASSIGNED
— both legs done, no driver or rep fee — whenever the final write arrived through the generic PATCH
status endpoints or admin Force Control.

Paths that correctly call it today: `driver-portal.service.ts › submitCompleted`,
`rep-portal.service.ts › submitCompleted` and `updateJobStatus`, `traffic-jobs.service.ts ›
forceControl`. If you add another path that completes a leg, call it too.

---

## Why can't the driver complete this job?

Checked in this order by `driver-portal.service.ts › submitCompleted`:

| # | Gate | Where | Bypass |
|---|---|---|---|
| 1 | Driver leg must be `IN_PROGRESS` | `DRIVER_VALID_TRANSITIONS` | none |
| 2 | ≥ 15 minutes after job time | inline in `submitCompleted` | none |
| 3 | Within 48h of `jobDate` | `› checkDriverTimelock` | `TrafficJob.driverUnlockedAt` |
| 4 | Collection settled if required | inline in `submitCompleted` | mark collected |

Gate 4 is the usual answer: `collectionRequired = true` with `collectionCollected = false`. The
portal disables the Complete button rather than erroring, so it reads as a dead button. The driver
fixes it with **Mark Collected** (`› markCollected`); an admin can also flip it.

Job time means flight arrival for ARR, `pickUpTime` otherwise — consistently, everywhere.

## Why can't the rep mark IN PLACE?

`rep-portal.service.ts › submitInPlace` enforces a window of **arrival − 10 min to arrival + 80 min**,
but **only for ARR jobs**, and skipped entirely when `TrafficJob.repUnlockedAt` is set. Re-submitting
while already IN_PLACE is idempotent, not an error.

The rep leg runs `PENDING → IN_PLACE → COMPLETED`. Note **IN_PLACE**, not IN_PROGRESS — that's the
driver leg. Mixing them up is a common misreading.

## Why can't anyone report NO SHOW yet?

`common/utils/no-show-window.util.ts › checkNoShowWindow` — **80 minutes after job time**, shared by
both portals so nobody can mis-tap the button the moment a job appears. A job with no resolvable job
time has no guard at all.

## GPS is captured but never blocks

`common/geofence.util.ts` computes the target; both `checkDriverGeofence` and `checkRepGeofence`
**log a warning and return** when the device is outside the 2 km radius. They never throw.

The in-app help text claims "GPS proximity (500m radius) is required" — that is **not** what the code
does. GPS is mandatory to *capture*, not to *match*. A location with no coordinates disables the
check entirely, since `resolveDriverGeofenceTarget` returns null.

---

## Money

| Rule | Where |
|---|---|
| Drivers are paid **per trip**, by route | `driver-tariffs.service.ts › resolveJobTripFee` |
| Tariff match is airport-aware | `› lookup` — ORs the four zone/airport shapes; the unused side must be NULL |
| No tariff match ⇒ fee of **0**, not an error | `› resolveJobTripFee` |
| Reps are paid **only for completed jobs** | `job-completion.service.ts › ensureRepFee` |
| Rep fee comes from their score | `common/utils/rep-score.util.ts › scoreToFeeAndEval` |
| Score weights sum to 100 | `REP_SCORE_WEIGHTS` — attendance 20, appearance 15, work 15, survey 15, review 35 |
| Fee bands (EGP) | ≥90 Excellent 50 · ≥75 Good 40 · ≥61 Average 30 · else Poor 20 |
| Submitting the guest survey awards its 15 points | `rep-portal.service.ts › submitGuestSurvey` |
| **No commission logic anywhere** | by design |
| Tax follows Egyptian law | `finance.service.ts › calculateLineTax` |
| Every transaction stores its exchange rate | `Payment`, `PaymentTransaction` |
| Financial records are immutable once posted | `finance.service.ts › updateInvoiceStatus` |
| Odoo exports must import into **stock** Odoo | `finance/odoo-export.service.ts` — no customisation allowed |

---

## Dispatch

| Rule | Where |
|---|---|
| Assignment order Vehicle → Driver → Rep | `dispatch.service.ts › assignJob`, each field permission-gated |
| Pax must never exceed vehicle capacity | `VehicleType.seatCapacity`; B2C also counts seat-occupying extras |
| Vehicle double-booking — **warning only** | `› detectAssignmentConflicts`; a car may do ARR then DEP the same day |
| Driver double-booking — **warning only** | `› validateDriverAvailability` is deliberately a no-op |
| Rep double-booking — **hard conflict** | `› validateRepAvailability`: same flight+time OK, different flight at same time conflicts |
| A rep needs ≥1 zone to appear at all | `reps.service.ts › assignZone` |
| Dispatcher 48h timelock | `› checkDispatcherTimelock` — **DISPATCHER role only**, bypassed by `dispatchUnlockedAt` |
| Second assignment must use reassign | `› assignJob` throws Conflict if one exists |

## Locations & pricing

Country → Airport → City → Zone → Hotel. **Zones are the pricing unit**; hotels must cascade from a
zone; there are no flat or free-text locations. A job must have **exactly one** origin FK and one
destination FK — setting both a zone and a hotel breaks later edit/cancel validation
(`guest-bookings.service.ts › convertToJob` documents this precisely).

Zone coordinates are also the geofence targets, so editing a location's lat/lng changes portal
behaviour.

## References

- `traffic-jobs.service.ts › generateInternalRef` — `PREFIX-nnnn`, prefix from the company initials.
  The sequence is cast to integer **in SQL on purpose**: a text sort ranks `PREFIX-9999` above
  `PREFIX-10000` and would wedge generation permanently past 10k.
- Agent references are validated against the agent's own regex `refPattern` and must be unique;
  the error names the job already using it.
- B2C bookings use `GB-YYMMDD-XXXX`; B2C invoices use `INV-B2C-NNNNN`.

## Access control

- The API is **deny-by-default**: `JwtAuthGuard` is registered globally; `@Public()` is the only opt-out.
- `PermissionsGuard` caches each user's permission set **statically for 5 minutes**. Code that
  changes roles or permissions must invalidate it, or the change appears not to apply.
- `RolesGuard` is legacy and yields to `PermissionsGuard` whenever the user has a `roleId`.
- The partner API authenticates by **shared API key**, not JWT — the only controller that does.
- REP/DRIVER logins are **single-device**: a second device gets 409 and managers are notified.
  Sessions free themselves after `SESSION_IDLE_MINUTES` (default 30); admin **Clear** is the manual fix.
- In production, deploys run with `SKIP_PERMISSION_SEED=true`. ADMIN resolves all keys dynamically,
  but granting a **new** key to a non-admin role needs a manual `rolePermissionV2` insert.

## Time

Everything user-facing is pinned to **Africa/Cairo** — never the server or device zone. Frontend
helpers live in `lib/utils.ts` (`APP_TZ`, `formatTimeCairo`, `cairoWallclockToISO`); exports use
`export.service.ts › cairoDate/cairoTime/cairoDateTime`. Bypassing these is what made flight times
render wrong on non-Cairo devices.

## Scheduled work

- `supplier-auto-complete.service.ts` — midnight cron that auto-completes **only** the driver leg of
  supplier-car assignments (a `supplierId` is set and there is no own vehicle/driver). It must never
  be widened to rep status, supplier status, or `TrafficJob.status`.
- `invoice-scheduler.service.ts` — generates invoices on each agent's cycle.
- `activity-logs.service.ts › purgeOldActivityLogs` — audit retention.
- All cron work serialises through `CronRunLock` so only one pod runs it.

## Storage & integrations

- Evidence photos are **stamped server-side** (`common/utils/stamp-image.ts`) before upload, so the
  overlay can't be forged.
- `GoogleDriveService` returns **null instead of throwing** when unconfigured or when OAuth expires,
  which is why a dead Drive grant appears as silent local-disk fallback rather than an error.
- Email transport prefers env `SMTP_*` over the DB settings row — an env host silently overrides
  whatever the admin UI shows.
- An invalid licence hard-blocks every portal (`LicenseGate`). Production needs both
  `LICENSE_SERVER_URL` and `LICENSE_PUBLIC_KEY`.
