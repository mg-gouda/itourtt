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

**Reps and drivers answer the complaints that blame them** (changed 2026-11-20; before, they saw a
complaint only once it was terminal). `complaints/complaint-thread.service.ts`:
- A rep / driver sees a complaint **as soon as it names them** (`responsibleParties` has REP / DRIVER
  and the id is theirs), any status, open ones first — in the apps (Complaints tab) and the web portals
  (`/rep/complaints`, `/driver/complaints`; API `GET /{rep|driver}-portal/complaints[/:id]`).
- They see **the story, not the money**: job, route, guest, category, subject, description. The
  claimed / loss amounts never reach the portals; a deduction shows only once POSTED, as before.
- **One thread per party** (`ComplaintMessage.party`): the rep never sees the driver's answers and vice
  versa; admin sees both in the complaint view and replies in either (`POST /complaints/:id/messages`,
  `complaints.editButton`). The party answers with text and/or up to 10 images / PDF (≤15 MB each,
  e.g. WhatsApp screenshots) — `POST /{portal}/complaints/:id/messages`. Evidence is not stamped.
- Each file is a `ComplaintAttachment` (kind EVIDENCE, `messageId` set, `submittedBy` = who), stored on
  Drive in the job's Rep / Driver Evidence folder (local `uploads/complaints` when Drive is off), so it
  also appears in the complaint's attachment list. Files stream through
  `GET /complaints/attachments/:id/file` (`complaints.attachments.view`) or, for the party, only from
  their own thread.
- A resolved / cancelled complaint's threads are read-only.
- **Notifications:** the rep / driver (bell + push) when a complaint newly names them — on create, or
  on an edit that adds / swaps them (`notifyNamed`) — and when the office replies; the complaint's
  owner (`assignedTo`, else every active ADMIN) when the party answers; and the named party on
  **every** status change (`notifyStatus`, after the transition commits — replaces the old
  LOST-only, no-push notice). See "Rep / driver notifications" below.

## Rep / driver notifications (every event is pushed)

Since 2026-11-20 every rep / driver notification goes through
`push-notifications/party-notifications.service.ts` (`PartyNotificationsService`, global):
`notifyRep` / `notifyDriver` / `notifyAssignees` / `notifyUser` write the `repNotification` /
`driverNotification` row **and** push (web push to the portal, FCM where a device token exists). Never
write those rows directly. It never throws, and callers run it after their transaction commits.

- **How the phone hears it.** The rep / driver apps have no Firebase: their background sync polls
  `GET /{rep|driver}-portal/notifications` and raises a local notification for each new row. So the
  **row is the app push**; the web push covers the portal. Push data = `{ type: <event>, url,
  jobId?, complaintId? }`; the row carries `trafficJobId` / `complaintId` (column added 2026-11-20).
- **Taps:** `complaintId` → that complaint (app: Complaints tab with `complaintId`; portal:
  `/{portal}/complaints?id=`); else `jobId` → the job; else the notifications list.
- **Kept guards:** no job-change notice for jobs dated before today (Cairo) or for completed /
  cancelled jobs ("Job Updated" only); the person who made the change is not told.

| Event (`type`) | Who | Where it is raised |
|---|---|---|
| JOB_ASSIGNED | new driver / rep | dispatch `assignJob`, `reassignJob` |
| JOB_UPDATED | driver + rep | job edit with relevant changes (`notifyAssigneesOfJobUpdate`) |
| JOB_CANCELLED | driver + rep | job cancelled (`notifyAssigneesOfCancellation`) |
| JOB_REMOVED | the person taken off | unassign, swapped in reassign, job deleted (`traffic-jobs › remove`) |
| CAR_CHANGED | driver | reassign keeps the driver but changes the car |
| STATUS_SET | driver + rep | office `forceControl` sets job / driver / rep status |
| FLIGHT_DELAY | driver | the rep reports a flight delay on their shared job |
| JOB_SCORED | driver / rep | office records the job score (`upsertDriverScore` / `upsertRepScore`) |
| COMPLAINT_NAMED | named party | complaint created / edited to name them |
| COMPLAINT_<STATUS> | named parties | every complaint transition (review, replied, escalated, won, lost, cancelled…) |
| COMPLAINT_REPLY | the party | office replies in their complaint thread |
| DEDUCTION_POSTED / DEDUCTION_REVERSED | rep / driver charged | complaint charge posted / voided after posting |
| ACCOUNT_ACTIVATED / ACCOUNT_DEACTIVATED | rep / driver | rep / driver status toggle, user deactivate / reactivate |
| PASSWORD_RESET | rep / driver | driver password reset, user password change |
| CHAT, broadcast | recipient | `chat.service` (own push path, unchanged) |

Not notified on purpose: the bulk driver-fee re-price (`recalculateDriverFees`, hundreds of rows — the
recalc report goes to finance instead), and no-show disputes (the dispute service only builds the
PDF for the customer; there is no decision step to report).

## Mobile app updates (sideloaded APKs, no Google Play)

- The rep / driver APKs are served publicly at `/api/public/apps/{rep|driver}.apk` from
  `uploads/.apps/itour-<app>.apk`. **Publishing = `scripts/publish-apk.sh <app> "notes" [--required]`**
  (owner approval each time): copies the built APK in and records `versionName`, `versionCode`,
  `notes`, `size`, `publishedAt`, `minVersionCode` in `uploads/.apps/versions.json`, which
  `GET /api/public/apps/latest` returns.
- The apps (`AppUpdateHost`, from rep 1.2.8 / driver 1.2.7) check that endpoint at start and on every
  return to the foreground (at most every 30 min). If the published `versionCode` is higher than the
  installed APK's (native `BuildConfig`, module `AppUpdate`), a dialog offers it: download with
  progress (Android DownloadManager, also shown in the tray) → the system installer. Android asks
  once to allow "install unknown apps" for the app; the installer always asks the user to confirm.
- `--required` sets `minVersionCode` = this version: older installs get a dialog they cannot dismiss.
- **Android 11+ kills the app when "Install unknown apps" is switched on.** The 1.2.8 / 1.2.7
  updater downloaded first and asked for the permission after, so the kill threw the download away
  and the reopened app showed the same required dialog — reps read it as an endless "update again"
  loop (1.3.0 rollout, 2026-11-22). From 1.3.1 the permission is asked **before** downloading, the
  native module remembers the finished download (`pendingDownload`, SharedPreferences) so a restart
  goes straight to Install, the APK's own versionCode is checked before installing
  (`downloadedVersionCode`), and returning from the installer still on the old version shows "not
  installed yet" instead of silently re-offering.
- `publish-apk.sh` reads `versionName`/`versionCode` from the APK (aapt), not `build.gradle`, and
  refuses if they differ or the package is wrong — advertising a stale APK under a newer code would
  make phones update forever.
- **Gradle can ship a stale JS bundle.** `createBundleReleaseJsAndAssets` does not see changes in
  the hoisted `mobile/packages/*`, so `assembleRelease` may reuse the old bundle. Before building a
  release: `rm -rf apps/<app>/android/app/build/generated/{assets,res}/createBundleReleaseJsAndAssets`,
  then check the APK (`unzip -p … assets/index.android.bundle | grep -a <new string>`).
- Installs older than rep 1.2.8 / driver 1.2.7 have no updater — they need one manual install of the
  APK; every later version arrives in-app. Bump `versionCode` (+1) on every build or the update is
  not offered (see CLAUDE.md › version numbering).
- The visible version (`APP_VERSION`) now comes from the APK itself, so it cannot drift from
  `build.gradle` again.

## Supplier agreed cars (2026-11-21)

Supplier page › Car Types: next to each ticked type, the **number of cars** the supplier agreed to
provide (`supplier_car_types.quantity`, 1–99, default 1).
- **Car Dispatch:** *Add Supplier Car* can add that supplier type up to that many cards a day —
  "Supplier · 1/3", "2/3", "3/3"; the dialog shows how many are on the board; a 4th is refused.
  Saving a row on a supplier card now **assigns** the job to that supplier car type and car number
  (`traffic_assignments.supplier_car_no`), so after a reload the jobs come back on the same cards
  (supplier jobs assigned on Dispatch show on card 1). The server refuses a car number above the
  agreed quantity.
- **Dispatch:** supplier car choices read "Hi Ace ×3" (information).
- Saving a supplier's car types keeps the existing rows (jobs point at them). It used to delete and
  recreate them, which cleared the car type on every job using them (FK on delete SET NULL). A type
  that jobs use can no longer be removed.
- The database enforces it too: `traffic_assignments.supplier_car_type_id` is ON DELETE RESTRICT
  (set live 2026-11-21 after 214 jobs' car types were restored from backups; 9 lost before 14 Nov).

## Traffic Cover notes → Marsa Alam route (2026-11-21, list in the database since 2026-11-22)

Traffic Cover (formerly Car Dispatch) has a **Notes** column, saved as the job's notes and printed on the
customer report. The **RMF hotel list** lives in System Parameters › Routes › **RMF Hotels** (table `rmf_hotels`).
It started from the owner's "RMF HOTEL NEAMS.xlsx" and 4 hotels found on the web. It has three sections:
- **North of RMF** → NORTH-MARSA ALAM.
- **South of RMF** up to Marsa Alam town, including Port Ghalib → SOUTH MARSA ALAM.
- **Deep South**, beyond the town → SHAMS ALAM. Azur Wadi Lahmy → WADI LAHMI (its route area).

**Matching** (`frontend/src/lib/rmf-hotel-match.ts`):
- The notes are lower-cased, with accents and punctuation removed.
- *Match words* are comma-separated alternatives. An alternative matches when each of its words starts a word
  of the notes, in any order: "movenpick quseir" needs both words.
- *Not when notes say* blocks a match; for example, Sea World is blocked by "aqua blu, hurghada, sahl".
- The first active hotel in the order section → sort order wins.

**How the route is set:**
- A matched hotel sets the row's route to `<leg>-<route area>`. The leg (ARR / DEP / GOING TRIP / RETURN TRIP)
  comes from the current route, or from Type when Type was just changed.
- It applies only to unsaved rows: when the notes or the Type change, and on Excel paste. A toast names the
  route and the hotel.
- Picking another route afterwards overrides it.
- Wadi Lahmi has no going or return routes, so nothing is set for those legs.

**Who can change the list:** reading needs `driver-tariffs` or `dispatch`. Adding and editing need
`driver-tariffs.upsert`; deleting needs `driver-tariffs.delete`.

## Traffic Cover job pool (5.5.0, 2026-11-22)

- **What's in the pool:** the day's B2B and Online jobs with no car (no `assignment.vehicleId` and no
  supplier car type), except CANCELLED, COMPLETED and NO_SHOW. Three tables: Arrivals, Departures,
  Other (transfers, trips, tours), each sorted by pick-up time (else flight time).
- **Assigning:** tick one or more jobs (any table) and drag them onto a car card.
  - Own car: the job goes to that car with the car's **main driver**.
  - Supplier card: supplier, car type and car no. are set.
  - A job already assigned is re-assigned (PATCH), otherwise created (POST).
  - A car-type mismatch asks first, then retries with `allowTypeMismatch`.
  - The car is added to the visible selection.
- **Taking a job off a car:** drag it by its ⋮⋮ handle back onto the pool, or use Move › *Back to the
  job pool*. The assignment is deleted, so the job returns to PENDING and the driver is notified.
  Dragging it onto another car re-assigns it.
- **Hidden cars:** the car / car-type selectors only change which cards show; jobs stay assigned.
  When hidden own cars still carry live jobs, an amber note "N hidden cars have M jobs · Show"
  brings them back. Every reload also re-adds cars with jobs that day.
- The page header, selectors and pool stay pinned while the car cards scroll.
- **B2B job form:** no Origin/Destination (the route fills them), no rep meeting point/time and no
  car/driver/rep section. New B2B jobs wait in the pool, and editing a job no longer re-sends its
  assignment.

## Driver Time (5.8.0, 2026-11-23)

**Driver Time** is when the driver must be ready for a job: always **1 hour before the job time**,
for arrivals, departures and every other job. It is calculated, never stored or edited, so it
follows the job time whenever that changes (`lib/driver-time.ts`, `DRIVER_LEAD_MINUTES = 60`).

- **Traffic Cover:** a Driver Time column after Time in every car card. Job time = the row's pick-up
  time, else its flight time (departure for DEP, arrival otherwise).
- **Dispatch:** a Driver Time column in the jobs table, and "Drv HH:MM" beside each trip in the
  fleet overview cards (per car). Job time = the page's existing rule: ARR → flight arrival, else
  pick-up; others → pick-up, else the flight time. Times are in Cairo time.
- **Driver & rep apps (5.9.0):** on the job card, "Driver HH:MM" under the big time; on the job
  detail screen, a Driver Time block beside the job time (`driverTimeLabel` in each app's
  `job-rules.ts`). It ships with the next app release.
- **Driver & rep web portals (5.9.0):** "Driver Time: HH:MM" beside the arrival / pick-up time on
  each job.

The same 1-hour rule applies to every channel (B2B, Online and B2C), because it is worked out from
the job time alone.

## Chat unread counts (5.6.1, 2026-11-23)

The chat badge, inbox rows and the Announcements row count **unread items only**:
- **Messages:** messages from the other person newer than your last read of that thread.
- **Announcements:** deliveries to you with no read time.

Opening a thread (or the Announcements thread) marks it read: `POST
/chat/conversations/:id/read` / `POST /chat/announcements/read`.

**Bug fixed in 5.6.1:** the web chat and the phone apps send these requests with a `null` body. The
strict JSON parser rejected that with 400, so nothing was ever marked read and badges counted
everything. The server now accepts any JSON and treats a non-object body as `{}`, so the apps
already installed on phones work without an update. The clients now send `{}`.

## Route from origin / destination (5.6.0, 2026-11-23)

Online and B2C jobs are entered with an origin and a destination, not a route. The system finds the
route so the job shows one in the Traffic Cover pool, lists and reports
(`RouteResolverService`):

1. **Ends:** an airport counts as that airport, a zone as that zone, a hotel as its zone.
2. **Candidates:** active routes whose *default service type* is the job's, whose From end is the
   origin end and whose To end is the destination end.
3. **One candidate:** that route.
4. **Several** (e.g. RMF → Marsa Alam Center fits ARR-MARSA ALAM / NORTH / SOUTH): the **RMF notes
   rule** decides. If the job notes or the hotel name name an RMF hotel, the job gets that area's
   route for its leg. If nothing decides, there is no route, and staff pick it.
5. **Zone "Counts as (for routes)" (5.7.0):** a zone can point at another zone, set in Locations ›
   edit zone. The lookup then uses that zone's routes, including for hotels in it. Owner's
   mappings (2026-11-23):
   - Safaga → Safaga Center
   - Soma Bay → Safaga Center
   - HURGHADA → Hurghada Center
   - El Kawthar → Hurghada Center

   It is one hop only: a zone can't count as itself or as a zone that is itself mapped. Mappings
   take effect within a minute (the lookup cache).
6. Zones still not covered get no route. For example, Luxor as an arrival end stays empty, by the
   owner's choice, and staff pick TRANSFER-LUXOR or another route.

**When it runs:**
- **Saving a job without a route:** create, or an edit that doesn't send one. On an edit it runs
  again when the job has no route or its ends / type / notes changed, and an existing route is only
  replaced when the lookup finds one.
- **Converting a B2C booking.**
- **The online form, live:** while the route is empty or auto-filled, it follows the origin,
  destination, type and notes. A route picked by hand is never overwritten.
- **Backfill:** `POST /job-service-types/resolve/backfill {fromDate}` does today's and future jobs;
  it is repeatable and safe.

**Vice versa:** picking a route in the online form sets the service type and fills each empty end
from the route. An airport or zone that isn't the route's end is replaced; a hotel is kept, because
it is more precise.

**B2B form (5.6.0):** there is no Pricing & Customer Rep section. The price comes from the customer's
price list, and editing a job keeps its existing price and rep values.

## Brand: iTour GO vs the company brand (5.5.0, 2026-11-22)

- The product is **iTour Ground Operations (iTour GO)**. Logo kit: `frontend/public/brand/`.
  Colours: ink `#0E1A2B`, orange `#FF7A1A`, slate `#9FB0C6`.
- **Anything a guest or customer receives** (invoices, PDFs, the future excursion ticket, guest
  emails) carries the **company** logo and name from Company settings, never the app logo. Partner
  emails sign off as "Operations Team", not the product name.
- Staff-facing places use iTour GO: login, favicon / app icons, window title, footers, staff
  emails, 2FA label, Excel metadata.
- **Styling settings win:** colours and the login logo/background saved in System Parameters ›
  Styling override the built-in defaults. With nothing saved, the login page shows the iTour GO
  lockup on a plain ink background (there is no bundled background photo any more).
- Sidebar (5.6.0): the full iTour GO logo with its mark when open, the mark only when collapsed
  (mobile menu: full logo). The company logo is no longer shown there; it stays on guest /
  customer documents.
- **Styling saves (5.5.1):** removing an image (dashboard background, login background, login
  logo) saves at once (PATCH `/settings/system` with the field set to `null`); Save also sends
  the current images. The API accepts only `null` or an existing `/uploads/` path for them.
  In dark mode the saved Primary colour drives `--primary`, `--ring` and the active sidebar item,
  with ink or white text picked by contrast; light mode keeps the ivory / ink palette.

## Traffic Cover (Car Dispatch) highlight colours (2026-11-21)

Each car card has a colour picker (palette button in the header): select a cell in that card, pick a
swatch (or a custom colour), then **Colour cell** / **Colour row** / **Clear cell** / **Clear row**. A
cell colour wins over its row colour; colours are drawn semi-transparent so text stays readable.
Saved on the job (`traffic_jobs.dispatch_colors` = `{ row?, cells?: { <column key>: "#RRGGBB" } }`,
`PATCH /dispatch/jobs/:jobId/colors`), shared by every user and kept until someone changes it.
Colours put on a new row are saved right after the row's first save.

## Car Dispatch customer report (2026-11-21)

Under the date on Car Dispatch: **Customer report** — a searchable customer box, then **PDF** (the branded
print view, save as PDF) and **Excel**. For the chosen customer on the board's date, cancelled jobs left
out, sorted by time: the customer's name once, then Customer Job ID (the customer's own ref, else our
booking no.), Route, Time (Cairo; ARR = flight arrival), Driver Name, Driver Number, Car Number
(plate, or "Supplier · type"), Extra Driver (name · phone, if any), Notes.
`GET /dispatch/customer-report` (JSON) and `/dispatch/customer-report/xlsx`; dispatch permission.
The data loads when the customer is picked so the PDF window opens straight from the click.

## Car Dispatch card colours (2026-11-21)

Each car card's header has a fixed colour so cars are told apart at a glance: chosen per car on the
vehicle page (**Car Dispatch card colour**, `vehicles.card_color`, `PATCH /vehicles/:id/card-color`,
saved straight away) or, when none is chosen, an automatic colour from the car's id
(`frontend/src/lib/card-color.ts`) — it never changes. Supplier cards always use the automatic colour.

## Main driver of a car (dispatch suggestions, 2026-11-21)

Owner rule: a car can have **one main driver** (`driver_vehicles.is_primary`), set on the driver page
(assign a car as *primary*) or on the vehicle page (**Main driver**, saved straight away; `PATCH
/vehicles/:id/main-driver`). Making someone the main driver takes the mark off the car's previous main
driver and off that driver's previous primary car. Drivers and cars stay freely paired — this only
*suggests*.
- **Dispatch:** picking a car for a job with no driver fills the car's main driver (saved with the car).
  Picking a driver whose main car is a different car shows "X's main car is … · Use …" (one click).
  A chosen driver is never overwritten.
- **Car Dispatch:** the card header shows "Main: name · mobile" and, when other drivers work that car's
  jobs, "Also: name · mobile" (no job refs). New rows start with the main driver; a row driven by
  someone else reads "Driver (main: X)". The board opens on today's **Cairo** date.
- Source for both boards: `GET /dispatch/main-drivers` (active drivers and cars only).
- Re-linking a car that was unlinked from a driver re-activates the old link (the pair is unique).

## Job alarms ring like an alarm clock (apps, 2026-11-20)

Owner rule: the 1 h / 30 min start alarms must ring **with the screen off, in standby, and after the
rep / driver signs out** (`mobile/packages/shared/src/native/job-alerts.ts`, `background-sync.ts`).
- **Exact:** scheduled with `SET_EXACT_AND_ALLOW_WHILE_IDLE` (`USE_EXACT_ALARM`; Android ≤ 12 uses
  `SCHEDULE_EXACT_ALARM`), so Doze cannot delay them. Restored after a reboot (`RECEIVE_BOOT_COMPLETED`).
- **Alarm clock:** full-screen over the lock screen (`USE_FULL_SCREEN_INTENT`, MainActivity
  `showWhenLocked` / `turnScreenOn`), channel `itour_job_alarms_v2` (bypasses Do Not Disturb), sound
  looping until **I've seen it** — on the notification itself or in the app — at most 15 minutes.
  The startup check asks the user to allow "Alarms & reminders" / "Full-screen notifications" when off.
- **After sign-out:** at sign-in the phone gets an alarm key (`POST /{portal}-portal/alarm-device`;
  table `alarm_devices`, only the SHA-256 is stored, 3 active per user). Signing out keeps the
  scheduled start reminders and a light service ("Job alarms are on") re-syncs them every 5 minutes
  with `GET /api/public/alarms` (header `X-Alarm-Key`; start reminders only — no GPS drop-off alarms
  without a session); acknowledgements go to `POST /api/public/alarms/jobs/:id/ack`.
- **Off:** login screen › "Job alarms on this phone: <name> · Turn off" (`POST /api/public/alarms/off`).
  A key stops working when revoked, when the account is deactivated / deleted, or when a different
  person signs in on the phone (their own key replaces it).

## Car Dispatch: changing a saved job's driver / car

Owner request 2026-11-20. Saved rows on Car Dispatch stay read-only **except who drives them**, while
the job is live (not COMPLETED / CANCELLED / NO_SHOW) and on an owned car:
- **Driver**, **Extra Driver** and **Extra Driver Phone** cells are editable; each change is saved at
  once with `PATCH /dispatch/assignments/:id` (`{ driverId }` or `{ externalDriverName,
  externalDriverPhone }`).
- **Move to car…** (Act column, ⇄) lists the other owned cars on the board and PATCHes `{ vehicleId }`;
  the board reloads and the row appears on the new card.
- Same backend as the Dispatch page (`dispatch.service › reassignJob`): 48 h dispatcher lock,
  availability / conflict checks, notifications (new driver assigned, removed driver, car changed)
  and pricing sync. A refusal shows the server message and rolls the cell back.
- Supplier cards: saved supplier jobs are not on the board (no vehicle); they are re-assigned on the
  Dispatch page (hint on the card).

## Job type badge (drivers / reps)

Owner request 2026-11-20: drivers (and reps, for consistency) see each job's type as a badge next
to the service type — `TrafficJob.bookingChannel`: **Online** (tour-operator jobs), **B2B** (business
customers), **B2C** (public-site bookings; tooltip "public site booking"). Web portals:
`components/booking-channel-badge.tsx` on job cards and history (navy / orange / green in the light
palette, soft tints in dark). Apps: `ChannelPill` (packages/ui kit) on the job card, job detail and
history. The portal job payloads already include the channel (full job include); labels EN / AR.

## Trip kilometres (odometer at completion)

Owner decisions 2026-11-20 (`backend/src/trip-km`, model `TripOdometer`):
- **Which jobs:** completing a job whose assigned car is **OWNED** needs an odometer photo, in the
  driver app (Evidence › COMPLETED) and the driver web portal (completion dialog). Rented /
  contracted cars complete as before.
- **Reading:** `POST /driver-portal/jobs/:id/odometer` (photo) → Gemini (`gemini-2.5-flash`, key
  `GEMINI_API_KEY`) reads the TOTAL odometer in km into a read-only field. Not legible → retake;
  after **two** failed reads the driver may type the km (`source = MANUAL`, flagged "typed by
  driver — check the photo"). `submitCompleted` refuses an owned-car completion without a reading
  and confirms it (`confirmedAt`) when the completion succeeds.
- **Distance belongs to the car:** drivers and cars are freely paired, so a trip's distance is its
  reading minus the **same vehicle's** previous confirmed reading, whichever driver took it
  (window `LAG … PARTITION BY vehicle_id ORDER BY confirmed_at`, computed on read — never stored).
  The first reading of a car has no distance. Lower than the previous, or a jump > 1,500 km, is flagged.
- **Where it is shown:** Vehicles › a car › **Trips Kilometer** tab (that car, all drivers), and
  Fleet › **Trip Kilometers** (`/dashboard/trip-km`, all cars). The office can correct a misread value
  (`PATCH /trip-km/:id`, clears the flag, notes who).
- **Odoo:** `GET /trip-km/export` — Excel whose first sheet "Odometer" is exactly the Odoo Fleet ›
  Odometers import (Vehicle = `Brand/Model/Plate` as Odoo names fleet vehicles, Date, Odometer Value,
  Driver); sheet "Details" is the check list. Exporting stamps `exportedAt`. No API integration.
- **Morning reminder:** users with `trip-km.reminder` (Transportation Accountant) get a centred
  pop-up the first time they open the system after 08:00 Cairo: yesterday's trips, km, to-check,
  not-exported and own-fleet completions missing a reading; "Open & export" opens the page on that day.
- Permissions `trip-km`, `trip-km.export`, `trip-km.reminder` — granted by the migration to
  Transportation Accountant (all three) and Admin (first two).

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

### Routes (System Parameters › Routes)

`JobServiceType` rows named "English | Arabic"; the English part is the code every traffic sheet uses
(B2B Excel import, customer / supplier price lists, driver tariffs — `routeCode`). Managed on
`/dashboard/routes` (permissions `driver-tariffs`, `.upsert`, `.delete`) as a DataSheet: the ✱ row
(Down on the last row) adds a route, a row saves when you leave it.

- **A route in use is never deleted** — delete would strip it from its jobs and tariffs (SET NULL) and
  wipe its customer prices, supplier prices and driver tariffs (CASCADE). `remove` refuses with a 409
  naming the usage; the page offers **Deactivate** (hidden from dropdowns, history and prices kept).
- Renaming the English part moves the remembered ROUTE import aliases to the new code, unless the
  ذهاب / عوده partner still has the old code.
- "Missing defaults": no default type, From or To — the B2B Excel import skips such rows.

### Location pins — why did a hotel's pin move / why does it say "Check pin"?

A wrong hotel pin blocks reps and drivers at the geofence (FT-3161, 2026-11-19: Sunrise Royal Makadi
pinned 5.7 km off). So hotel pins are checked against Google Places by
`locations/pin-verifier.service.ts`, with the rules in `common/utils/place-match.util.ts`:
Google's place must match the **name** (>= 0.85, no extra distinctive word — "Rixos *Radamis*" is
not "Rixos"), be in Egypt and within 100 km of the hotel's city. `Hotel.pinStatus`:

- **VERIFIED** — the pin is within 250 m of Google's match. **CORRECTED** — it was missing or
  further off and was moved (`pinNote` says how far). **REVIEW** — no confident match; nothing was
  changed and the Locations page shows "Check pin" (filter: *Pins to check*). **MANUAL** — a person
  set the pin (edit with new coordinates, or the batch-geocode candidate picker): it is trusted and
  **never** moved or re-checked. Null = not checked yet.
- Checked after create, rename / zone change and Excel import (in the background — saving never
  waits on Google), and nightly at 03:30 for new or changed hotels (150 per night, one pod only).
- **One hotel per name**: create / rename / import refuse a name that already exists after folding
  case, accents and punctuation (`placeNameKey`). Never merge on a shared Google place_id alone —
  wrong picks share IDs. The 2026-11-19 clean-up (pins + 110 duplicates) is recorded row by row in
  table `loc_audit_20261119`.

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

- **A price list is shared and seasonal.** `SupplierPriceList` (List A, B… or "List A Winter 2026")
  holds one price per **route** (`JobServiceType`) × **vehicle type** and has a validity
  (`validFrom`, `validTo`; empty end = until changed). Seasons, market or fuel / tax increases are a
  **new list**; the old one is kept. Once its end date has passed a list is **read-only** (prices,
  name, flags) — only its dates can change, to extend it. A list with supplier history can't be
  deleted. The sheet's car columns map Limo→Sedan, Hi Ace 7→Minivan 7, Hi Ace 15→Hi Ace, H-1, Coaster,
  Bus (`PRICE_COLUMNS`).
- **Which list a supplier is on is a dated history** — `SupplierPriceListAssignment` (supplier, list,
  from, to). `moveSuppliers` (Supplier Price Lists › *Move suppliers to this list*, multi-select, or the
  supplier page › *Change list*) cuts the history at the date and opens a new period; **backdating is
  allowed** and re-costs the suppliers' jobs from that date. `Supplier.priceListId` only mirrors
  today's list for display. A new supplier starts on the "default for new" list from today.
- **An ended list keeps pricing** suppliers still on it (it may have been agreed to continue). Admins
  and roles with `supplier-price-lists.alerts` (finance) get a daily 08:00 notification (once a week per
  list) and a banner on the page: extend the list or move the suppliers.
- **Flags.** `isDefaultForNew` — exclusive. `isOwnCarList` — one per season allowed: own-car jobs are
  *reported* at the own-car list in force on their date (latest one started by then).
- **Automatic supplier cost** — `supplier-costing.service.ts › syncJobCost`. A job whose assignment
  is a supplier car (supplier + `SupplierCarType`, no own vehicle) gets **one** `SupplierCost` with
  `source = 'PRICE_LIST'`, priced by its route × the car type's vehicle type on the list the supplier
  was on **on the job's date**. Recomputed after dispatch assign / reassign / unassign, the B2B Excel
  import, a route change, a list price edit or import (every job priced from that list), and a
  supplier list change (jobs from the date). No list / no price for that cell → no cost row.
- **What a recompute never touches:** a *posted* PRICE_LIST row (settled pay) — `recalculate` leaves it
  and **reports** it when the new price differs (`PostedDifference`, shown with a CSV download for a
  manual adjustment); manual supplier costs and complaint charges (both `source = null`).
- **Own cars are never a `SupplierCost`** — those rows become Odoo vendor bills. Their notional cost
  is `supplier-costing.service.ts › ownCarCostTotal` and appears only in the revenue report's cost
  breakdown as `ownCarCosts`, where it is included in total costs.
- **Excel in the sheet's own layout.** Export/import use the "Supplier R-T" columns
  (Price List | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | Coaster | Bus). OPERATION matches the
  **English half** of route names; a code shared by the ذهاب / عوده pair prices both. For a row in
  the file, a number sets the price and an empty cell clears it. Unknown lists are created (starting
  today); ended (read-only) lists are skipped and reported; unknown operations are reported, not guessed.

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
- **There are no customer driver tips** (removed 2026-11-19): the `DriverTipRate` amounts became the
  driver tariffs and the table was dropped; customer invoicing makes only the transfer invoice (CIT-).
  The 2 DRIVER_TIP invoices issued before stay as records. Agent price lists and the website's public
  prices still have their own `driverTip` column (separate features).
- **Invoicing** (`finance.service.ts › generateCustomerInvoices` and the invoice suggestions) reads
  `CustomerPricingService.quote`: transfer = the job's own `priceAmount` if set, else the customer's
  route price; missing → 0.
- **Excel in the traffic team's layouts.** Customer prices: `CUST | OPERATION | Limo | Hi Ace 7 |
  Hi Ace 15 | Coaster | Bus` (all customers in one file; CUST matched like the B2B import, incl.
  remembered CUSTOMER aliases). Driver tariffs: `No. | OPERATION | Limo | Hi Ace 7 | Hi Ace 15 | H-1 |
  Coaster | Bus`. For a row in the file, a number sets the price and an empty cell clears it. The
  tariff import reads only a sheet named "…tariff…" (a lone sheet is always read) and never a sheet
  with a CUST or Price List column, so the whole traffic workbook can be uploaded.
- **H-1** is its own vehicle type (own car 517, 2026-11-19) because the drivers' sheet pays it
  differently from Hi Ace 7. Where it has no price of its own a car type is priced as its fallback
  (`PRICE_FALLBACK_TYPE`: H-1 → Minivan 7) — customer prices, driver tariffs, supplier lists and the
  own-car cost. Car Category "H-1"/"H1" in the B2B import maps to it.
- **Sheet spellings of a route** that differ from the route's English code ("ARR-QUSEIR",
  "… 2 WAYS", "ROUND CITY TRIP…") are `ImportNameAlias` rows of kind **ROUTE** whose `targetId` is
  the canonical route *code* (not an id — the ذهاب / عوده pair shares one code). All three sheet
  importers resolve OPERATION through `common/utils/route-price-sheet.util.ts › loadRouteIndex`.

## Driver tariffs — what does a driver earn for a trip?

- **One route × car-type table for every driver** — `DriverTariffRate` (System Parameters › Driver
  Tariffs; keys `driver-tariffs` / `.upsert`; `job-pricing/route-rate-table.ts`). Replaced the
  zone-based `DriverPriceTariff` on 2026-11-19: it never had a row, so every one of the 3,095 trip
  fees until then was 0. Seeded the same day from the former driver-tip amounts (283 cells).
- **A trip fee** = the job's route × the assigned vehicle's type (H-1 falls back to Hi Ace 7),
  `driver-tariffs.service › resolveJobTripFee`, used by every completion path (portal roll-up,
  dispatcher status change). A job without a route gets no fee row; no tariff for the cell → 0.
- **Recalculate** (`POST /traffic-jobs/recalculate-driver-fees`, admin, button on the page): for completed
  jobs in a date range it creates missing fees and re-prices **unposted** fees nobody edited
  (`amount == tariffAmount`). Posted fees, manual fees (`tariffAmount` null) and complaint deductions
  (negative) are never touched.

## Guest surveys and Guest Analytics (Quality Control)

- **Guest Surveys** (`/dashboard/guest-surveys`, moved out of Reports on 2026-11-19) lists the arrival
  surveys reps submit, by job date, with PDF / Excel. **Guest Analytics** (`/dashboard/guest-analytics`,
  `GET /reports/guest-analytics`, `reports.service › guestAnalytics`) aggregates the same surveys. Both
  use the `reports.guestSurveys` permission and sit in the Quality Control sidebar group.
- Survey answers are free text; analytics fold them without changing what was stored
  (`common/utils/survey-normalize.util.ts`): nationality (country → nationality, typos, Arabic script,
  first word of a sentence), stay length → days (weeks ×7, "one week"), buckets. Extend the alias map
  rather than editing stored answers.
- **Coverage** = surveys ÷ arrivals (ARR) in the period with a rep, not cancelled / no-show — per rep
  and overall. Hotel = the job's destination hotel when set (consistent names), else the typed one.
  Tour operator = the job's agent / customer.

## Editing grids — DataSheet (Access-style datasheet)

Every tabular editing screen uses `frontend/src/components/data-sheet.tsx` (price grids via
`route-price-grid.tsx`: customer prices, supplier price lists, driver tariffs; Car Dispatch cards; Routes).
Price grids have no ✱ row — their rows are the routes; Car Dispatch and Routes add rows. Keyboard: arrows / Tab / Enter move (Enter = next field, Access-style), typing or F2 edits, Esc
cancels, Delete clears, Shift extends a range, Ctrl+C / Ctrl+V copy / paste blocks with Excel (pasting
past the last row creates rows where the screen allows new rows). Down on the last row reaches the ✱
new-record row. **A row saves when you leave it** (`onRowLeave`) and the screen's Save button saves
everything pending; a failed save keeps the edits and marks the row ⚠. Read-only report tables are not
DataSheets.

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
- REP/DRIVER logins are **single-device with takeover** (since 5.4.0, 2026-11-22). If another
  device or the web portal still holds an active session, `POST /auth/login` answers **409** with
  `code: SESSION_ACTIVE_ELSEWHERE` and `details: { deviceName, lastSeenAt }` (the exception filter
  passes `code`/`details` through). The web login page and the rep/driver apps (1.3.0) then ask
  "Continue here?" and retry with `takeover: true`; `issueSession` replaces `user.sessionId` (old
  tokens answer `SESSION_DISPLACED`) and ends **every** other open session with
  `endReason = TAKEOVER`. Nobody is notified — the super-admin blocked-login alert
  (`REP_LOGIN_CONFLICT`, `SessionConflictModal`, `super-admin.util.ts`) was removed on purpose.
  App builds older than 1.3.0 can't send `takeover`, so they just show the 409 message (EN + AR,
  "update the app or log out there"). Admin **Clear** still exists but should rarely be needed.
- **Real client IPs:** Traefik runs with `externalTrafficPolicy: Local` (`k8s/traefik-config.yaml`,
  copied into `/var/lib/rancher/k3s/server/manifests/`) and `main.ts` sets Express `trust proxy` to
  the private ranges, so `req.ip` (sessions, activity log, per-IP throttles) is the phone's address.
  Before this every request looked like `10.42.0.x`, and the 10/min login throttle was shared by
  all users.
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
  `arrivals`, `departures` and `cityJobs` (day tours, going, return). The **Cust. Job ID cell** (not
  the row) is coloured from the row's Type: Departure green, Arrival blue, Cancelled red (status wins
  over type), white text; it changes as soon as the Type is picked. Hiding that column hides the colour.
  Each card is a DataSheet (below): type in the ✱ row to add a job, a new row is saved to the B2B pool
  when you leave it; saved jobs are read-only there. Cust. Rep and Extra Driver are name + phone columns.
  Rows take a **Route** (no Origin / Destination columns): picking one fills Type with the route's
  default and the origin / destination from its From / To; a route without both ends can't be saved.
  A saved, still-open job can be cancelled from the card's Act column (confirmation, then
  `PATCH /traffic-jobs/:id/status` CANCELLED — the same action and permission as the B2B/Online pages). Cards per row
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
- `supplier-price-lists.service.ts › notifyEndedLists` — 08:00 alert about ended price lists still in use.
- `pin-verifier.service.ts › nightly` — 03:30 Google check of new/changed hotel pins (see Location pins).
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

