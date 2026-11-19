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

## Tap a stop to navigate

In the rep/driver portals (job card, history, job-detail popup with `navigable`) and the rep/driver
apps (job-detail From/To rows), origin and destination are links that open the **Google Maps app
with navigation already started**. Web: `lib/maps-nav.ts` + `components/route-nav-link.tsx` build a
universal `google.com/maps/dir/?api=1&…&dir_action=navigate` link. Apps:
`mobile/packages/shared/src/native/navigation.ts` fires Android's `google.navigation:` intent first,
falling back to the same universal link (iOS and Android without Google Maps). The two resolvers are
deliberate copies — keep them in step.

Target per end: exact `pickupLat/Lng` / `dropoffLat/Lng` → airport → hotel → zone → `fromZone`/`toZone`;
coordinates where the location has them, otherwise a place-name search (so it works before geocoding).
That needs coordinates in the response: the driver portal's slim `jobSummaryInclude` selects
`latitude/longitude` (and airport `code`) via `NAV_*_SELECT` — trim them and the links degrade to
name searches.

## Why was this status update refused for location?

Since 2026-11-16 the rep/driver geofence **blocks** (403): `common/geofence.util.ts ›
assertWithinGeofence`, radius **is a setting, not code**: `CompanySettings.geofenceAirportMeters` (default 2000) for an
airport target and `geofenceOtherMeters` (default 600) for everything else (hotel, exact pin). Edited
in System Parameters › Locations (card above the search; `GET/PATCH /settings/geofence`, edit needs
`locations.geofenceEdit`) and read by `getGeofenceRadii` on every check, so a change applies at once.
The target only says whether it is an airport (`GeofenceTarget.isAirport`). Was a flat 2 km and
log-only before 2026-11-16. GPS
itself is mandatory on every status route (DTO / controller), so it cannot be skipped by withholding
location.

Where each status is checked against:

| Who | Status | Target |
|---|---|---|
| Driver | IN_PROGRESS, NO_SHOW | pickup end — pin → airport → hotel → zone |
| Driver | COMPLETED | **drop-off** end (same order) — before 2026-11-16 it wrongly used the origin |
| Driver | CANCELLED | none |
| Rep | every other status | the job's airport — origin for ARR, **destination for DEP** (was origin-only, so DEP reps were never checked) |
| Rep | COMPLETED | decided by the rep's **escort answer** (`TrafficAssignment.repEscort`, asked right after IN PLACE, since 2026-11-18): **escorting → the drop-off end** (pin → hotel → zone); **not escorting → the airport**. Unanswered (older jobs) keeps the old rule: ARR completes at the drop-off (FT-3143 was blocked 22 km from the airport), others at the airport |

Only a **precise** target blocks: an exact pickup/drop-off pin, an airport, or a hotel with
coordinates. A zone centroid covers a whole area, so a miss against one is only logged. A location
with no coordinates at all has no check.

**Bypass = the leg's admin unlock** (`driverUnlockedAt` / `repUnlockedAt`, the same unlock that
lifts the 48h timelock and the rep IN PLACE window) — it is the fix for a wrong location pin or a
phone with a bad fix. Every miss is logged (`Geofence BLOCKED` / `bypassed` / `not enforced`).

The evidence routes call `precheckGeofence` in the controller **before** uploading photos, so a
refused submission leaves no orphan files in Drive; the submit method re-checks authoritatively.
Airport coordinates must point at the terminal, not the airfield centre — a large airport's
centroid can be well outside the airport radius from where reps actually stand.

## Rep escort question and job alarms

**Escort question.** After IN PLACE the rep portal (`components/rep-escort-dialog.tsx`) and the rep app
(`apps/rep/src/lib/escort.ts`) ask *"Will you escort this transfer?"* — not dismissable, re-asked until
answered, and Complete is held until it is. `POST /rep-portal/jobs/:id/escort` (only while IN_PLACE;
never for **DEP**, whose drop-off is the airport) stores `repEscort` + `repEscortAt`; the answer picks
the COMPLETED geofence (table above) and arms the drop-off alarm for an escorting rep.

**Job alarms** (`common/services/job-alerts.service.ts`, `GET /{rep,driver}-portal/alerts`, a
background poll): the server lists the person's jobs that qualify; clients only time and display them.
- `START_60` / `START_30` — 1 h and 30 min before the job **starts** (`jobStartsAt`: flight arrival
  for ARR, pickup time otherwise), only while that person's leg is still PENDING. The 30-min one
  supersedes a missed 1-h one.
- `DROPOFF_ARRIVED` / `DROPOFF_LEFT` — a driver whose leg is IN_PROGRESS, or a rep IN_PLACE with
  `repEscort = true`: inside the drop-off geofence (same target and radius as the COMPLETED check)
  → "complete before you leave"; inside earlier and now outside, still not completed → alarm. Only
  **precise** targets (pin / hotel / airport) arm it — a zone centroid is too coarse.
- Every alarm is a modal that only closes with **"I've seen it"** → `POST …/jobs/:id/alerts/ack`
  upserts `JobAlertAck` (job + user + kind, first ack wins) and, as a portal POST, writes the
  Activity Log row against the job (the audit interceptor words it "Rep acknowledged alarm: …").
- Web: `components/job-alarms.tsx` in both portal layouts (chime + vibrate, system notification
  when the tab is hidden; GPS `watchPosition` only while a drop-off is armed — a closed tab can't
  alarm). Apps: `shared/native/job-alerts.ts` schedules the start reminders as
  `SET_AND_ALLOW_WHILE_IDLE` trigger notifications (ring with the app closed, may drift a few minutes
  in Doze), the sync service re-polls every 30 s and reads GPS for armed drop-offs, and
  `JobAlarmHost` (kit) shows the modal queue with vibration.

---

## Why is this rep/driver not on the tracking map (or in the wrong place)?

Rep Tracking / Driver Tracking (`/dashboard/rep-tracking`, `/dashboard/driver-tracking`) show the
**last-known** fix per person from `user_locations` — one row per user, no history. Fixes arrive from:

- the web portal heartbeat (`lib/use-location-heartbeat.ts`) — once a minute **only while the portal
  is open and visible** (browsers can't track a closed tab), and
- every GPS-stamped portal request (`tracking/record-location.interceptor.ts`, on the rep/driver
  portal controllers) — including the native mobile apps, and including submissions the geofence
  refused (the phone was still there).

So "never reported" = no portal account, or never opened the portal since 2026-11-16. Colours are age:
live ≤ 5 min, amber ≤ 1 h, grey older. `POST /tracking/ping` is excluded from the audit log and counts
as a background poll — it must never keep an idle session alive (see *Concurrent login* / 3 h logout).
Perms `rep-tracking` / `driver-tracking`: admin gets them automatically; other roles need a manual
`rolePermissionV2` grant in prod (deploy skips the permission seed).

## Native rep/driver apps — reading API responses and the rep flow

**Every portal response is wrapped `{ success, data }`, and the list endpoints nest again:**
`GET /rep-portal/jobs` and `/jobs/history` → `data.jobs`, `GET /*-portal/notifications` →
`data.notifications` (+ `unreadCount`). The apps used to read `data.data` as an array: Jobs showed
"No jobs" for days that had jobs, and History / Notifications crashed (`.filter` on an object). Always
go through `mobile/packages/shared/src/utils/response.ts › unwrapList / unwrapData` — the background
sync poller too.

**The rep app mirrors the web rep portal's flow, it does not invent one.** `PATCH …/status` only
accepts COMPLETED / CANCELLED and the server's transitions are `PENDING → IN_PLACE → COMPLETED`, so
the old "Complete Job" button (PENDING → COMPLETED, no photos, no GPS) could never succeed. Now:
IN PLACE = `POST …/in-place` (exactly 2 photos + GPS, ARR window), Complete = `POST …/completed`
(1–10 photos + GPS), No Show = `POST …/no-show` (1–10 photos + GPS, after `noShowAvailableFrom`),
Cancel = `PATCH …/status` CANCELLED with GPS, plus flight delay, free-text update and the arrival
survey. Gating lives in `mobile/apps/rep/src/lib/job-rules.ts`; keep it in step with
`frontend/src/app/(rep-portal)/rep/page.tsx`.

**The driver app likewise mirrors the web driver portal** (`mobile/apps/driver/src/lib/job-rules.ts`):
Start Trip = `POST …/in-progress` (1–10 photos + GPS, from job time), Complete Trip = `POST …/completed`
(1–10 photos + GPS, job time +15 min, cash collected — the CollectionCard sits above the button),
No Show after `noShowAvailableFrom`, Cancel via `PATCH …/status`. Completing through the evidence
endpoint (not the generic PATCH) is what runs `JobCompletionService.reconcileJobStatus`.
Both apps share one design kit in `mobile/packages/ui/src/kit/`.

**History → Deductions shows only POSTED charges** (`GET /*-portal/deductions`, ComplaintCharge rows
naming that rep/driver, filtered by the *job's* date). A PENDING or APPROVED charge can still be
changed or voided, so like the complaints list it never reaches the portal.

**Display language is app-local.** `useLocaleStore` (EncryptedStorage `app_locale`) drives `t()`;
since `t()` is not reactive, the app root keys `NavigationContainer` on the locale and restores the
saved nav state. **Arabic is right-to-left:** `applyDirection` calls `I18nManager.forceRTL` and, when
the direction actually changes, restarts the app through the native `AppRestart` module
(`android/app/src/main/java/com/itour/<app>/AppRestartModule.kt`, registered in `MainApplication`).
**It is a full process restart** (`RestartActivity` in a `:restart` process kills the main process and
relaunches) — never `recreateReactContextInBackground()`: that in-place JS reload left the foreground
sync service and native modules tied to the dead context, and after switching to Arabic the apps
stopped loading data (v1.2.5 fix). `shared/utils/date.ts › addDays` is pure UTC calendar maths —
the old local-midnight + `toISOString()` version slipped a day on Cairo-timezone phones.
It runs at startup too, so an Arabic-language phone using the app in English is forced back to LTR.
Directional icons (chevrons, arrows, send, log-out) mirror inside `Icon`; the day strip is pinned
`direction: 'ltr'` and holds its days reversed, because horizontal-list offsets misbehave under RTL.

**Rep coverage zones (`RepZone`) are display-only** — nothing in dispatch, fees or assignment reads
them — so the app no longer shows them on Profile.

**The chat composer pads itself by the bottom safe-area inset** (threads are root-stack screens with
no tab bar under them); the inset is dropped while the keyboard is open. **`adjustResize` cannot be
trusted:** targetSdk 35 on Android 15 is forced edge-to-edge and the translucent status bar has the
same effect on older phones, so the window does not shrink for the keyboard. `ChatThreadScreen`
measures how far the keyboard overlaps it (`keyboardDidShow` `screenY` vs `measureInWindow`) and pads
by exactly that (0 where the window did resize). Other screens with inputs may need the same.

**Chat notifications are cleared once read.** Reading a thread / the announcements cancels its
`chat-<id>` notification, and a `/chat/me` poll with `unreadTotal` 0 clears them all — otherwise the
tray and launcher badge kept "unread" after the messages were read in the app.

**Popups use the app's dialog, not `Alert.alert`.** Call `appAlert` / `showDialog`
(`shared/utils/dialog.ts`); `DialogHost` (kit `AppDialog.tsx`, mounted in each `App.tsx`) renders it as
a branded card and queues overlaps. Without a host it falls back to the native Alert (supplier/guest).

**Evidence photos are camera-only** (no gallery — a picked photo could be old or not taken on site).
`takePhoto` shrinks to the same rule as the web (`lib/compress-image.ts`): ≤1600 px, JPEG 0.82. The
server stamp's date line reads `November, 18-2026  14:05:33` (Cairo; `stamp-image.ts › formatStampDate`).

**WhatsApp needs the country code.** `openWhatsApp` runs `toWhatsAppNumber`: local Egyptian mobiles
(`010…`, `10…`, `0020…`, `+20 010…`) become `2010…`; numbers already carrying a code are kept.

**Permissions are asked together at launch** (`requestStartupPermissions`: camera, location,
microphone, notifications), memoised per launch so the signed-in sync start awaits it instead of
overlapping. Once, it also offers the battery-optimisation exemption — without it Doze pauses the
foreground poller and job/chat notifications arrive late. Alerts use a HIGH-importance channel with
sound (heads-up banners). There is still **no FCM**: notifications come from the app's own
foreground-service poller (every 30 s), so a phone that force-stops the app or reboots gets nothing
until the app is opened again.

**The jobs header month label opens `DatePickerModal`** (kit) to jump to any date; the day strip
and its week chevrons are unchanged.

**Icons need the fonts.** `react-native-vector-icons` glyphs render as empty rectangles unless the
app's `android/app/build.gradle` applies `fonts.gradle` (monorepo path `../../../../node_modules`).
A tab with no `tabBarIcon` also renders a placeholder box.

## In-app chat — who can message whom?

`chat/chat.service.ts`. Every thread is **1:1 between one REP/DRIVER portal user and one staff user**
(`ChatConversation`, unique per pair). Nobody else can read it — not admins, not other dispatchers:
`participant()` 404s anyone who isn't one of the two.

**The contact lists are a setting, not code** — `CompanySettings.chatDriverContactRoles` /
`chatRepContactRoles` (Role **slugs**), edited on the Company page (`ChatSettingsCard`,
`PATCH /chat/settings`, perm `company.editSettings`). Defaults: drivers →
`dispatcher, dispatch-operator, dispatch-manager`; reps → `online-manager, online-operator`.
- A staff user whose role slug is in a list sees the floating chat button (`ChatWidget`) and may
  **start** chats with that portal role. One with history but no longer in a list keeps read access.
- **Admins are not in either list by default** — eligibility is by role slug, *not* permissions (the
  admin role holds every permission key, which would have put every admin in every driver's list).
- Sending re-checks the pair every time: if the staff user left the role / was deactivated, the
  portal side gets 403 *"no longer available"* and must pick someone else.

**Attachments** live on the uploads PVC under `uploads/.chat/<conversationId>/` — a dot-folder, which
`express.static` (the public `/uploads` route) refuses, and which `res.sendFile` refuses too unless
`dotfiles: 'allow'` (that is set only in `GET /chat/messages/:id/attachment`, after the participant
check). Images are re-encoded by sharp (≤1600 px JPEG, EXIF/GPS stripped); voice notes are sniffed by
magic bytes (webm/ogg/mp4/mp3/wav), 1 s–5 min, 10 MB cap. Messages are immutable.

**Message status (ticks)** — ✓ sent · ✓✓ delivered · highlighted ✓✓ seen. Both are per-side
"up to" timestamps on `ChatConversation`, not a row per message: `*LastReadAt` (set by
`POST …/read` and by sending) and `*LastDeliveredAt`. **Delivered = the recipient's app fetched chat
state** — `ChatService.markDelivered` runs on every `/chat/me` poll, inbox load and announcements load.
A rep with the portal closed who only got the phone push stays at ✓ until the portal is opened (a
service worker can't call the API: auth is a bearer token). Reading implies delivered.

**Location messages** (`kind LOCATION`): lat/lng (Decimal 10,7) + `accuracyM` on the message, no file.
Browser GPS fix (high accuracy, 15 s timeout) — needs `geolocation=(self)` in the ingress
Permissions-Policy (already there for tracking). Shown as a Leaflet/OSM mini-map + Google Maps
open/directions links.

**Screenshots**: pasting an image (Ctrl+V) or dropping one on the composer stages it with a preview
so a caption can be typed; the file-picker path still sends at once (phone behaviour).

**Broadcasts / announcements** (`ChatBroadcast` + `ChatBroadcastRecipient`). Perm **`chat-broadcast`**
(admin gets it dynamically; any other role needs a manual prod `rolePermissionV2` grant). Audiences:
all reps, all drivers, all reps & drivers, all office staff (every live user whose role is not
REP/DRIVER/SUPPLIER/B2C_CLIENT). Reps/drivers need an active Rep/Driver profile, as for contacts.
- Recipients are **snapshotted at send time**, one row each carrying `deliveredAt` / `readAt`; the
  sender is never a recipient. Someone hired later does not see old announcements.
- Recipients see a pinned read-only **Announcements** row at the top of their inbox
  (`?c=announcements`, push tag `chat-announcements`); opening it marks all read. Unread announcements
  count toward `/chat/me` `unreadTotal`, and receiving one turns the staff chat button on for staff
  who otherwise have no chat.
- The broadcast console (megaphone in the staff chat widget) asks for confirmation with the
  recipient count, then shows each broadcast with live Delivered x/y · Seen x/y and per-person receipts.
  Every holder of `chat-broadcast` sees every broadcast, not just their own.
- Attachments live under `uploads/.chat/broadcasts/<id>/`, streamed only to recipients, the sender
  and `chat-broadcast` holders. `POST /chat/announcements/read` is excluded from the audit log.

**Native rep/driver apps** (`mobile/apps/{rep,driver}`) have a **Chat** tab built from the shared
screens in `packages/ui/src/chat` over `chatApi` (`packages/shared`): text, photos (camera/gallery),
location, **voice notes** (record AAC/M4A, play with the bearer token via
`react-native-audio-recorder-player`), ✓/✓✓/seen ticks, Announcements.

**The apps use no Firebase** (the owner's decision): they talk only to the iTour API and database.
`@itour/shared › background-sync` runs an Android **foreground service** (notifee, persistent
"Connected to iTour" notification) that polls every 30 s: `/{portal}-portal/notifications` and
`/chat/me`, and shows **local** notifications. It also sends `POST /tracking/ping` every 60 s,
which is what puts native users on the tracking maps. The service type is `location` when location
permission is granted, otherwise `dataSync` (Android 14 throws if `location` is used without the
permission). On iOS, background polling isn't allowed, so it only runs while the app is open; real
background alerts on iPhone would need APNs, which is Apple's service, not Firebase. The backend's
FCM path (`PushNotificationsService`) is unused: `device_tokens` stays empty.

**Voice-note format.** Server side, `ChatService.storeVoice` converts WebM/Ogg Opus (what Chrome and
Firefox record) to **AAC .m4a** with ffmpeg (installed in the backend image), because iOS can't play
Opus. M4A/MP3/WAV are stored as uploaded. If ffmpeg fails, the original is kept.

**Building.** React Native 0.76.9 / React 18.3.1, old architecture, Yarn workspaces with hoisted
`node_modules`. The Gradle and Podfile paths point at `mobile/node_modules`. Release signing reads
`android/keystore.properties` (git-ignored); on the server it is a symlink to
`/root/itour-mobile-keys/`. **Back that key up: losing it means a Play Store app can never be
updated.** Android SDK is at `/opt/android-sdk`. iOS needs macOS (the `mobile-release` workflow on a
macOS runner) plus an Apple Developer account.

**Real-time is polling** (two backend pods, no Redis/websockets): `/chat/me` every 10 s,
an open thread every 4 s. All timer polls send `X-Background-Poll` and `/api/chat/me` is in
`BACKGROUND_POLL_PATHS`, so chat never keeps an idle rep/driver logged in. Read receipts
(`POST …/read`) are excluded from the audit log; sent messages are audited.

## Browser push (rep/driver web portals)

`push-notifications/web-push.service.ts` + `frontend/public/sw.js`. Needs `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`) in `backend-secret`; without them push is
silently off (warning at boot). **Every** `PushNotificationsService.sendToUser` call now fans out to
both FCM (native apps) and Web Push (browsers) — so any new native push to a rep/driver reaches the
browser too. What sends one:
- new job assigned (`dispatch.service › assignJob / reassignJob`)
- job edited in a way that matters to the trip — date, pick-up time, pax, guest, places, flight,
  notes — computed from a before/after diff (`assigneeRelevantChanges`), **not** `changedFields`,
  which flags pick-up time / flight / route on every save
- job cancelled; driver/rep taken off a job (unassigned or swapped)
- a staff chat message (tag `chat-<id>`, so a burst replaces rather than stacks)

Not for past-dated or finished jobs. Each also writes the portal's Driver/RepNotification row.
Subscriptions are removed on logout (`auth-store › logout`), on 404/410 from the push service, and
move to whoever subscribes the same browser next. **iPhone:** Web Push only reaches a site added to
the Home Screen (iOS 16.4+) — the portal shows instructions. The ingress `Permissions-Policy` must
allow `microphone=(self)` or voice notes fail silently.


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

**Nobody picks the responsible person, for any party.** Name DRIVER, REP or SUPPLIER and the backend
reads that person off the job's own `TrafficAssignment` (`resolveResponsible`), so a complaint can
only ever blame whoever actually worked the job. The remaining parties are resolved for *display*
only, off the job rather than stored, because there is nothing to store that the job does not
already say: **AGENT** is the job's agent, **CLIENT** is its guest, and **OFFICE** is two people —
whoever entered the job (`TrafficJob.createdBy`) and whoever dispatched the car
(`TrafficAssignment.assignedBy`). `responsibleDetails` in `frontend/src/lib/complaints.ts` is the
one place that mapping lives for the UI; `complaintResponsibleNames` mirrors it in
`reports.service.ts` and `export.service.ts`. The form shows who each tick will name, read-only, and
says so when the job has nobody in that seat. The three id columns may now be set together — one per party
named — and the old exactly-one-FK rule is gone; what survives is that an id must belong to a party
the complaint actually names, or the charge panel would offer to deduct from someone nobody blamed.
Every party dropped from the set has its id cleared in the same write. An explicit id in the DTO
still wins over the assignment, for the API callers that send one.

**The owner is who answers it, not who caused it.** `assignedToId` is a member of staff, and it is
the only thing that makes the SLA sweep speak: `complaint-sla.service.ts` sends the "due in Nh" nudge
and the "deadline missed" notice to the owner and nobody else, so an unowned complaint breaches in
silence. The log form therefore defaults it to **whoever is logging the complaint**, and the picker
is fed by `GET /complaints/assignable-users` — active back-office users only, portal roles excluded,
id and name only. It exists because `GET /users` is ADMIN-only, which used to make the detail
dialog's owner control vanish for every other role that may legitimately assign one. Naming the owner
while *logging* is part of logging (`complaints.addButton` covers it); moving a complaint off someone
else's desk afterwards needs `complaints.assign`, on the PATCH as well as in the UI.

**The reply window flags, it never decides.** The standard window is **24 hours** (`DEFAULT_SLA_HOURS`);
it was 48 until 2026-09-11, and only the default moved — `slaHours` is stored per row precisely so a
policy change cannot rewrite history, so every complaint logged before keeps its 48 and its original
deadline. Nothing may quote a literal window at a user: the SLA sweep's notification reads
`c.slaHours` off the row. `replyDueAt = complaintDate + slaHours`
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
- **A deduction belongs to the job; the complaint is what it may acquire.** `ComplaintCharge`
  carries a required `trafficJobId` and a *nullable* `complaintId`, and lives on its own routes
  (`/complaint-charges`, addressed by charge id) — the nested `/complaints/:id/charge/…` routes are
  gone. Money can only be taken from someone the job's own `TrafficAssignment` actually names
  (`assertWorkedTheJob`), and when a `complaintId` is given it must be that job's complaint *and*
  must blame the party being docked — the same rule the responsible ids obey.
- **The complaint adopts what the grid already docked.** `ComplaintChargesService.attachToComplaint`
  runs straight after `complaints.service.ts › create` and claims every unattached, non-void charge
  on the job whose party the new complaint blames. So a dispatcher docks the driver the moment it
  goes wrong, the write-up follows an hour later, and the amount appears on the complaint's party
  charge without being typed twice. It only ever adopts parties the complaint names, and only
  charges no other complaint has claimed.
- **One charge per party per job, not one per complaint.** `Complaint.charges` is a list, and each
  charge is approved, posted and voided on its own. What is forbidden is two *live* charges against
  the same party on the same job; a voided one is history, so that party becomes chargeable again.
  Consumers that show one number per complaint add the non-void charges up (`reports.service.ts ›
  chargeTotalOf`); the portals show a driver or rep only the posted charges raised against **them by
  name**, never the other leg's.
- **The discount mark on the dispatch grid is always there.** Every trip card in Fleet Overview and
  Rep Overview carries it, complaint or no complaint — that is the point of anchoring the deduction
  to the job. What gates it is the **`dispatch.deductionButton`** key, so it can be turned off per
  user without touching the complaint permissions. `JobDeductionDialog` reads the job's standing
  deductions from `GET /complaint-charges?trafficJobId=…`; the day view itself carries complaint ids
  and numbers so the dialog can link back, and no money at all. What it saves is an ordinary PENDING
  charge, so the complaint's own panel shows it pre-filled and can override it —
  `PATCH /complaint-charges/:id`, and only while PENDING. What was approved is what stands; changing
  it after that means voiding it.
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

Airport and hotel coordinates are the enforced geofence targets (zones only log), so editing a
location's lat/lng changes who can update status from where.

## B2B Excel import — why was this row skipped / why didn't the job update?

`b2b-excel-import/b2b-excel-import.service.ts` (UI: `components/b2b-excel-import-dialog.tsx`, the
**Import from Excel** button on the B2B page, key `traffic-jobs.b2b.importExcel`). It loads the
traffic team's daily sheet: one sheet row = one B2B job. Rules agreed with the operator 2026-11-18:

- **The server parses the file on every step.** Preview and commit both upload the same `.xlsx`;
  the commit re-evaluates everything and never trusts client-side matching. A file may hold many
  days; the dialog lists the dates and the user picks which to import.
- **Columns:** B date · C Arabic route · D car no · E car category · F customer · G order no ·
  H carrier · I carrier type · K notes (A and J ignored). Pax is always **1 adult**.
- **The route carries the locations.** The job takes the route's *defaults* —
  `JobServiceType.defaultServiceType` + one of `fromAirportId/fromZoneId` + one of
  `toAirportId/toZoneId` (zones, never hotels), edited in Driver Tariffs › Manage Service Types.
  A route without all three is skipped. Routes are matched on the **Arabic half** of their
  `"EN | AR"` name, so two routes sharing an Arabic name make that name ambiguous (skipped).
- **Car numbers 2000–2004 are supplier cars**; any other number is an own car matched to a
  vehicle by the plate's digits (`plateDigits`). The car number wins over column I — a disagreement
  is only a warning. Supplier rows need the supplier (col H, legal or trade name) *and* one of its
  `SupplierCarType`s, chosen by column E (`Limo→Sedan`, `Hi Ace 15→Hi Ace`, `Hi Ace 7→Minivan 7`,
  `Coaster`, `Bus`). Own rows need the driver (col H).
- **Skip the row, never the file.** Anything that resolves to zero or several records (customer,
  route, car, driver, supplier, supplier car type) skips that row with a reason; the rest import and
  the result screen lists every skipped row so it can be fixed and the day re-imported. **Nothing is
  created on the fly** — customers, cars, drivers and suppliers are added by people.
- **Remembered aliases.** Names are compared through `common/utils/import-name.util.ts ›
  normalizeImportName` (case, spaces, أ/إ/آ, ى, ة, tatweel). An unmatched name can be mapped in the
  preview; that writes an `ImportNameAlias` (kind + normalised name → record id) used by every later
  import. Changing the normaliser orphans saved aliases. A car number that matches several plates
  is settled by a **VEHICLE** alias (normalised car number → vehicle id; e.g. 9863 → "9863-ه ن ط",
  set 2026-11-19).
- **Past service dates are allowed here, and only here** — the import writes jobs directly, so the
  `isPastServiceDate` guard in `traffic-jobs.service.ts › create` and the dispatcher 48h lock do not
  apply. No driver push / WhatsApp is sent for imported jobs.
- **Every imported job is COMPLETED** (owner's rule, 2026-11-18 — the sheet records trips that ran,
  own or supplier car). `b2b-excel-import.service.ts › completeJob` closes every assigned leg and calls
  `JobCompletionService.reconcileJobStatus`, so the driver trip fee / rep fee are created exactly as
  for a portal completion; a supplier-only job (no own driver or rep leg) has its status set directly.
  This is what makes imported jobs invoiceable — customer invoicing only fetches COMPLETED,
  uninvoiced jobs.
- **Re-uploading a day.** A row matches an existing B2B job on **date + customer + order no**, paired
  in sheet order with the oldest job first (one order can have several jobs). A blank order no is
  always a new job. A match may change the **route** (with its service type and locations), the car
  source, the car / supplier car type and the driver/supplier and completes the job if it is still open (CANCELLED / NO_SHOW are never touched). Changed
  rows are shown old → new and only the ticked ones are written. Jobs that are not in the sheet are
  left alone. `customerJobId` is therefore **not unique** any more (migration
  `20261118_b2b_excel_import`).
- **Activity Log:** the endpoints are excluded from `AuditInterceptor`; the commit writes one
  `B2BExcelImport` summary row (file, dates, counts, every skipped row and why) plus one
  `TrafficJob` CREATE/UPDATE row per job, the update carrying the before-snapshot.
- `GET /job-service-types` is readable with the B2B/Online route-field keys too, so non-admin
  roles get a populated Route dropdown (it used to need `driver-tariffs`).

## Supplier price lists — where does a supplier job's cost come from?

`supplier-price-lists/` (page **Supplier Price Lists**, keys `supplier-price-lists` / `.edit`).
Replaced the zone-based `SupplierTripPrice` on 2026-11-18 (it had no rows and could not hold
per-route prices: ten route groups collapse onto the same zone pair with different prices).

- **A price list is shared.** `SupplierPriceList` (List A, B, C, D…) holds one price per
  **route** (`JobServiceType`) × **vehicle type**; every supplier points at one list
  (`Supplier.priceListId`). Editing a list re-prices every supplier on it. The sheet's car
  columns map Limo→Sedan, Hi Ace 7→Minivan 7, Hi Ace 15→Hi Ace, Coaster, Bus (`PRICE_COLUMNS`).
- **Two exclusive flags.** `isDefaultForNew` — a supplier created without a list starts on it
  (`suppliers.service.ts › create`). `isOwnCarList` — own-car jobs are *reported* at its prices.
  At most one list carries each flag; setting it clears the other lists.
- **Automatic supplier cost** — `supplier-costing.service.ts › syncJobCost`. A job whose assignment
  is a supplier car (supplier + `SupplierCarType`, no own vehicle) gets **one** `SupplierCost` with
  `source = 'PRICE_LIST'`, priced by its route × the car type's vehicle type on the supplier's list.
  It is recomputed after `dispatch.service › assignJob / reassignJob / unassignJob`, after the B2B
  Excel import creates or updates a job, and when `traffic-jobs.service › update` changes the route.
  No list / no price for that cell → no cost row (the job simply has no automatic cost).
- **What the recompute never touches:** a *posted* PRICE_LIST row (settled pay — the recompute stops
  and leaves it), manual supplier costs and complaint charges (both `source = null`). Old jobs are
  not back-filled; costs appear as jobs are assigned or changed from 2026-11-18 on.
- **Own cars are never a `SupplierCost`** — those rows become Odoo vendor bills. Their notional cost
  is `supplier-costing.service.ts › ownCarCostTotal` (route × the vehicle's type on the
  `isOwnCarList` list) and appears only in the revenue report's cost breakdown as `ownCarCosts`,
  where it is included in total costs.
- **Excel in the sheet's own layout.** Export/import use the "Supplier R-T" columns
  (Price List | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | Coaster | Bus). OPERATION matches the
  **English half** of route names; a code shared by the ذهاب / عوده pair prices both. For a row in
  the file, a number sets the price and an empty cell clears it. Unknown lists are created; unknown
  operations are reported, not guessed.

## Customer prices — what does a B2B job charge?

`job-pricing/` (`customer-pricing.service.ts`, `route-prices.service.ts`; UI: the customer page's
**Prices** tab). Replaced the zone-based `CustomerPriceItem` on 2026-11-18 (1 row in production).
Agents (online channel) keep their own zone price lists — untouched.

- **Per customer, per route × car type** — `CustomerRoutePrice`. The car type a job is priced at is
  its own vehicle's type → else its supplier car type → else the requested vehicle type
  (`pricedVehicleTypeId`).
- **Automatic job price** — `CustomerPricingService.syncJobPrice` writes `TrafficJob.priceAmount`
  (B2B only) on create, on the B2B Excel import, on dispatch assign/reassign/unassign and when the
  route or requested car type changes. It **stops** once `priceManual` is true (someone typed a
  price — set by `traffic-jobs.service.ts` create/update; clearing the price hands the job back) or
  the job has any invoice line. No price for that cell → `priceAmount` is cleared, not guessed.
  Prices that existed before 2026-11-18 were marked manual by the migration.
- **One call per job write.** Every hook calls `JobPricingService.syncJob`, which runs the supplier
  cost ([Supplier price lists](#supplier-price-lists--where-does-a-supplier-jobs-cost-come-from))
  and the customer price together. Both halves guard themselves and never throw.
- **Driver tips billed to customers are one global table** — `DriverTipRate`, same route × car-type
  key, used by the driver-tip invoices.
- **Invoicing** (`finance.service.ts › generateCustomerInvoices` and the invoice suggestions) reads
  `CustomerPricingService.quote`: transfer = the job's own `priceAmount` if set, else the customer's
  route price; tip = the global rate; missing → 0.
- **Excel in the traffic team's layouts.** Customer prices: `CUST | OPERATION | Limo | Hi Ace 7 |
  Hi Ace 15 | Coaster | Bus` (all customers in one file; CUST matched like the B2B import, incl.
  remembered CUSTOMER aliases). Driver tips: `No. | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | H-1 |
  Bus`. For a row in the file, a number sets the price and an empty cell clears it. The tip import
  prefers a sheet named "…tip…" and never reads a sheet with a CUST or Price List column, so the
  whole traffic workbook can be uploaded.
- **H-1** is its own vehicle type (own car 517, 2026-11-19) because the Driver Tips sheet tips it
  differently from Hi Ace 7. Everywhere else it has no column, so a car type without a price of its
  own is priced as its fallback (`PRICE_FALLBACK_TYPE`: H-1 → Minivan 7) — customer prices, tips,
  supplier lists and the own-car cost. Car Category "H-1"/"H1" in the B2B import maps to it.
- **Sheet spellings of a route** that differ from the route's English code ("ARR-QUSEIR",
  "… 2 WAYS", "ROUND CITY TRIP…") are `ImportNameAlias` rows of kind **ROUTE** whose `targetId` is
  the canonical route *code* (not an id — the ذهاب / عوده pair shares one code). All three sheet
  importers resolve OPERATION through `common/utils/route-price-sheet.util.ts › loadRouteIndex`.

## References

- `traffic-jobs.service.ts › generateInternalRef` — `PREFIX-nnnn`, prefix from the company initials.
  The sequence is cast to integer **in SQL on purpose**: a text sort ranks `PREFIX-9999` above
  `PREFIX-10000` and would wedge generation permanently past 10k.
- Agent references are validated against the agent's own regex `refPattern` and must be unique;
  the error names the job already using it.
- B2C bookings use `GB-YYMMDD-XXXX`; B2C invoices use `INV-B2C-NNNNN`.

## Access control

- The API is **deny-by-default**: `JwtAuthGuard` is registered globally; `@Public()` is the only opt-out.
- `/dashboard` is **staff-only** (ADMIN, DISPATCHER, ACCOUNTANT, AGENT_MANAGER, VIEWER). The `(dashboard)` layout shows REP/DRIVER/SUPPLIER a bilingual warning (`StaffOnlyWarning`) with their correct portal link instead of the dashboard, and signs out any other role, via `lib/role-home.ts`. Being logged in is not enough.
- Job extras live in the `TrafficJobExtra` relation, so they are **not** returned unless you load them. Every query that feeds the dispatch grid or the job-detail modal (dispatch day view, rep/driver/supplier portal list and detail) must include `jobExtras`, or extras silently vanish from the screen.
- `PermissionsGuard` caches each user's permission set **statically for 5 minutes**. Code that
  changes roles or permissions must invalidate it, or the change appears not to apply.
- `RolesGuard` is legacy and yields to `PermissionsGuard` whenever the user has a `roleId` — i.e.
  for **every staff user**. So `@UseGuards(RolesGuard)` + `@Roles('DRIVER')` on its own does **not**
  keep staff out. `PermissionsGuard` is what enforces `@Roles` (it compares against the account's
  role enum when no `@Permissions` is set), so a role-restricted controller must use **both**. Until
  2026-11-16 the driver, rep and supplier portal controllers used `RolesGuard` alone and any staff
  token could call them (the services then 403'd for want of a linked profile).
- The partner API authenticates by **shared API key**, not JWT — the only controller that does.
- REP/DRIVER logins are **single-device**: a second device gets 409 and **only the super-admin
  (`mggouda@gmail.com`, `common/utils/super-admin.util.ts`) is notified** — the blocked-login alert is
  hidden from every other admin, role and user, in the backend recipient list and the frontend popup.
  Sessions free themselves after `SESSION_IDLE_MINUTES` (default 30) of *no requests at all*; admin
  **Clear** is the manual fix.
- **REP/DRIVER are logged out after 3 hours of inactivity** (`SESSION_INACTIVITY_MINUTES`, default
  180). The catch: the portals poll their notification badge every 30s, so "any request" never goes
  idle while the app is open. `UserSession.lastActivityAt` is therefore separate from `lastSeenAt`:
  background polls (`GET …/notifications`, or any request with `X-Background-Poll: 1` —
  `sessions.service.ts › isBackgroundRequest`) refresh only `lastSeenAt`. Matching the path
  server-side is deliberate: it covers mobile builds already installed that cannot send the header.
  `› sweepInactive` runs every 5 min, ends idle sessions with `endReason = IDLE_TIMEOUT` and clears
  the user's `sessionId` + refresh token; `› findActive` also expires them at login, so the lock
  never waits for the sweep. `JwtStrategy` then answers `SESSION_IDLE_TIMEOUT` (not
  `SESSION_DISPLACED`) and the web portal shows `/login?reason=idle`. A new timer-driven poll must
  be marked background, or it silently keeps every rep/driver logged in forever.
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
- Car-dispatch cards show every job assigned to the car that day: the day view returns
  `arrivals`, `departures` and `cityJobs` (day tours, going, return). Rows are coloured
  Departure green, Arrival blue, Cancelled red (status wins over type), white text. Cards per row
  (2/3), hidden columns and column widths are one per-user setting for the whole board
  (user-preferences key `car_dispatch_view`).
- Report ranges, activity-log filters and `complaintDate` are *not* service dates and must keep
  accepting past dates — do not apply the floor to them.
- Every report on the Reports page opens with **From and To both set to today** (not the last 30
  days); users go back in time themselves. `today` there is a function so it is read at mount.
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
  It also returns null after `UPLOAD_TIMEOUT_MS` (30s), so a stalled Drive degrades to disk instead of
  holding the submit open. Folder lookups are cached as *promises* so parallel uploads for a new
  job share one lookup — caching the resolved ID let two uploads each create a job folder.
- The portal `uploadFiles` helpers stamp and upload photos **in parallel** and put the index in the
  file name (iOS names every camera shot `image.jpg`). The web evidence dialogs shrink photos
  in the browser first (`lib/compress-image.ts`, 1600px JPEG). Full-size phone originals sent over
  mobile data overran Traefik's 60s request-read timeout and came back as a bare "Failed to submit
  completed evidence" with no server message (FT-2669).
- Email transport prefers env `SMTP_*` over the DB settings row — an env host silently overrides
  whatever the admin UI shows.
- An invalid licence hard-blocks every portal (`LicenseGate`). Production needs both
  `LICENSE_SERVER_URL` and `LICENSE_PUBLIC_KEY`.

## Why does editing a rep or driver change their portal login?

The REP/DRIVER login is keyed on the mobile number (`users.phone` is unique, email is
`rep.<mobile>@portal.itour.local` / `driver.<mobile>@…`). `RepsService.update` and
`DriversService.update` therefore carry name and mobile edits onto the linked login in the same
transaction, and refuse a mobile number that another login already holds. Before this, reusing an
old rep record for a new person left the old login holding the old number, so "Create account" for
the next person with that number failed with "a user with this mobile number already exists".

