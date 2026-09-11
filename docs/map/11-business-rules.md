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

`common/utils/no-show-window.util.ts › checkNoShowWindow`, shared by both portals so nobody can
mis-tap the button the moment a job appears. A job with no resolvable job time has no guard at all.

**The wait is not one number.** It resolves per job, in this order: **the agent's own override →
the company default → the constants in the util** (the last only matters for a database with no
`CompanySettings` row). Only **DEP** is split out at 15 minutes — a guest who misses a hotel pick-up
is established far sooner than one who never comes out of an airport. Arrivals, day tours, going and
return all share the standard 80. A job with no agent (B2B carries a customer, not an agent) falls
to the company default, which is the whole reason `resolveNoShowWaitMinutes` takes a nullable agent.

**The portals must never compute this themselves.** `getMyJobs` stamps every job with
`noShowAvailableFrom`, and the driver and rep pages gate the button and print "available from" off
that field. They each used to carry their own `NO_SHOW_DELAY_MS = 80`, which could only stay correct
while there was exactly one number. Note the mobile apps have never gated this button at all — they
call the API and surface the error.

Two other 80-minute rules are **not** this one and do not move with it: the rep's IN PLACE window
(`arrival −10 to +80`, ARR only) and the driver portal's "can't complete until 15 min after job
time". Same numbers, unrelated policies.

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

## Complaints

A complaint is always attached to a job (`trafficJobId` is required) and carries the stage it arose
at. Only **during** and **after** are offered — `SELECTABLE_STAGES` in `frontend/src/lib/complaints.ts`
is what the form draws — while `BEFORE_JOB` stays in the enum and in `STAGE_LABELS` so the
complaints already logged against it still read, and can still be filtered for. The lifecycle is
`OPEN → UNDER_REVIEW → REPLIED → ESCALATED → WON / PARTIALLY_LOST / LOST / CANCELLED`, with the last
four terminal. `VALID_TRANSITIONS` in `complaints.service.ts` is the authority; the frontend's
`NEXT_STATUSES` only decides which buttons to draw.

**A complaint is several things at once, and several people's fault.** Both the categories and the
responsible parties are sets. The single columns did not go away: `categoryId` and `responsibleParty`
hold the **first** entry of each set, and everything downstream still reads them — analytics and the
reports group by them (counting each complaint once, so the slices never exceed the headline total),
the charge panel defaults from them, the exports lead with them. The full sets live in
`complaint_category_links` and in the `responsible_parties` enum array, and every *filter* matches
the set, not the primary: `categoryLinks: { some: … }` and `responsibleParties: { has: … }`, in
`complaints.service.ts`, `complaint-analytics.service.ts`, `reports.service.ts`, `export.service.ts`
**and both portals** — a complaint that blames the rep first and the driver second is still the
driver's to see on `/driver-portal/complaints`. Saving replaces a set wholesale (`deleteMany` then
`create`), or an unticked category would survive as a stale link.

**Nobody picks the responsible person any more.** Name DRIVER, REP or SUPPLIER and the backend reads
that person off the job's own `TrafficAssignment` (`resolveResponsible`), so a complaint can only
ever blame whoever actually worked the job; the form shows who that will be, read-only, and says so
when the job has nobody in that seat. The three id columns may now be set together — one per party
named — and the old exactly-one-FK rule is gone; what survives is that an id must belong to a party
the complaint actually names, or the charge panel would offer to deduct from someone nobody blamed.
Every party dropped from the set has its id cleared in the same write. An explicit id in the DTO
still wins over the assignment, for the API callers that send one.

**The 48-hour reply window flags, it never decides.** `replyDueAt = complaintDate + slaHours`
(stored per row, so a later policy change can't rewrite history). `complaint-sla.service.ts` runs
hourly and does exactly two things: flip `slaBreached` and write notifications. It must **never**
touch `status` — a missed deadline is a flag, not an outcome. Note `CronRunLock.runDate` is
`@db.Date` and cannot separate hours, so the sweep puts the hour in the `jobName` instead;
reverting that would leave only the day's first run ever executing.

**The reply date can be logged by hand.** `repliedAt` is normally stamped by the REPLIED
transition, but the complaint form sets it directly for a reply that went out by email or phone.
Saving recomputes `slaBreached` from it — replied late is breached, clearing it drops the complaint
back into the countdown. A new complaint that is merely overdue is *not* flagged on create: the
hourly sweep is what both flags and notifies, and pre-flagging it would silence the notification.
The form's "time left" field is the same maths as the sweep, computed client-side from the dates
still being edited.

**`outcome` (WON / LOST) is what reveals the amounts.** It sits beside the money on the complaint
and gates the Amounts section of the form — nothing can be typed until a loss is admitted, and
choosing WON clears any provisional `lossAmount`, exactly as the WON transition does. Transitions
keep it in step (WON → `WON`, LOST / PARTIALLY_LOST → `LOST`), and a plain PATCH that contradicts a
terminal status is rejected, or the charge and adjustment already raised would no longer match the
row. It records the outcome; `status` remains the lifecycle authority. The same radios appear in the
detail dialog (`ComplaintOutcomeRadios`, shared by both), where they PATCH the complaint directly and
turn read-only once a transition has settled it.

**The exchange rate is stored, not typed.** No screen asks for it any more — it stays on the row at
its default of 1, and is still what converts a foreign-currency claim into the EGP-equivalent totals
on the analytics screen. Removing the input did not remove the field, and the transition and update
DTOs still accept one.

**Analytics is one pass, redacted like everything else.** `complaint-analytics.service.ts` reads the
complaints in range once and aggregates in memory rather than issuing a dozen `groupBy` queries, so
every breakdown agrees with the headline totals. Without `complaints.financial.viewAmounts` the whole
money block and every per-slice `lossAmount` is absent from the response — not zeroed. `GET
/complaints/analytics` is declared before `GET /complaints/:id` so the word is never parsed as an id,
and it is gated by the new `complaints.analytics` key.

**Money moves in two directions and never automatically.**
- Against the party at fault: a `ComplaintCharge` is raised, approved and posted as three separately
  permissioned acts. Only *posting* writes anything — a negative, still-unposted row in `RepFee`,
  `DriverTripFee` or `SupplierCost` against the same job, so it flows through existing totals and
  exports untouched. Voiding deletes that row while unposted, or writes a compensating positive row
  once it has been paid out.
- Toward the agent: a LOST / PARTIALLY_LOST outcome with a conceded amount creates one PENDING
  `AgentAdjustment` **inside the transition's own transaction**, so an outcome can never be recorded
  without its debt. Finance then settles it as a negative invoice line, a standalone `CREDIT_NOTE`
  invoice, or a waiver. `updateInvoiceLines` deletes and recreates every line, so it releases
  attached adjustments back to PENDING first — otherwise they would read `ON_INVOICE` while their
  `invoiceLineId` was nulled by cascade.

**Settled pay is never rewritten.** A category's `defaultPenaltyPoints` is deducted from the rep or
driver job score, which moves the pay band — so it is applied *only* while that job's fee row is
still `isPosted: false`. With a set of categories the penalty is the **highest** of them, never their
sum: tagging one incident with three labels describes it better, it does not make it three times
worse. It is applied to *every* party blamed, so a rep and a driver who both let the guest down both
lose the points — and `scorePenaltyApplied` records what each of them took, not the two added up. If the fee is posted, the penalty is skipped and the reason recorded in
`Complaint.scorePenaltyNote`. Seeded categories default to `0` so nothing touches pay until someone
deliberately configures it. Re-scoring a job reads the penalty back off the saved row, so the
scoring form can't wipe it.

**Amounts are stripped server-side.** Without `complaints.financial.viewAmounts`,
`redactAmounts` removes `claimedAmount`, `lossAmount`, `currency`, `exchangeRate`, the charge and the
adjustments from the payload — they are absent, not null. Hiding them in the UI alone is not the
rule.

Reps and drivers see a complaint **only once it is terminal** and only where they are the
responsible party (`/driver-portal/complaints`, `/rep-portal/complaints`). A dispute still being
argued is internal, and the claimed/conceded amounts never reach the portals.

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

### A service date is never in the past

`TrafficJob.jobDate` is when the transfer actually happens, so it can only ever be today or later.
Jobs entered late used to be back-dated (FT-2108 / FT-2109 were booked on 08/09 for a service date
of 07/09), which keeps them off the dispatch board for the day they were needed and distorts driver
pay and period totals.

- Pickers floor at today via `lib/utils.ts › serviceDateMin(savedValue?)`. Pass the job's **saved**
  date when editing — an already-past date stays selectable so old jobs remain editable, while a
  *new* past date cannot be chosen. Pass nothing when creating.
- The authoritative guard is `common/utils/service-date.util.ts › isPastServiceDate`, enforced in
  `traffic-jobs.service.ts` (`create`, and `update` only when the date is actually changing),
  `partner.service.ts › createJob` (after its idempotency short-circuit) and
  `b2c.service.ts › amendBooking`. `bulkCreate` inherits it by calling `create`.
- The car-dispatch board's day selector is **both** a view filter and the new job's service date, so
  browsing a past day stays allowed but creating on one is blocked with an inline notice.
- Report ranges, activity-log filters and `complaintDate` are *not* service dates and must keep
  accepting past dates — do not apply the floor to them.
- Comparison is on the **Cairo** calendar, so a job dated today in Cairo never reads as yesterday
  because the server is elsewhere.

## Scheduled work

- `supplier-auto-complete.service.ts` — midnight cron that auto-completes **only** the driver leg of
  supplier-car assignments (a `supplierId` is set and there is no own vehicle/driver). It must never
  be widened to rep status, supplier status, or `TrafficJob.status`.
- `invoice-scheduler.service.ts` — generates invoices on each agent's cycle.
- `activity-logs.service.ts › purgeOldActivityLogs` — audit retention.
- All cron work serialises through `CronRunLock` so only one pod runs it.

## Storage & integrations

- Evidence photos are **stamped server-side** (`common/utils/stamp-image.ts`) before upload, so the
  overlay can't be forged. The photo is burned *before* the status transaction runs, so the two
  portal `getJobStampMeta` methods take the **target** status and project both overlay lines forward
  (`job-completion.service.ts › projectJobStatus` mirrors the roll-up rules). Reading the stored
  status instead is what made a rep's COMPLETE photo read "Rep: IN PLACE".
- `GoogleDriveService` returns **null instead of throwing** when unconfigured or when OAuth expires,
  which is why a dead Drive grant appears as silent local-disk fallback rather than an error.
- Email transport prefers env `SMTP_*` over the DB settings row — an env host silently overrides
  whatever the admin UI shows.
- An invalid licence hard-blocks every portal (`LicenseGate`). Production needs both
  `LICENSE_SERVER_URL` and `LICENSE_PUBLIC_KEY`.
