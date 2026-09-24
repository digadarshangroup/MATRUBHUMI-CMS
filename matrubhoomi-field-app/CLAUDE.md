# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The Android app for Matrubhoomi's WHOLE workforce — Kotlin, Jetpack Compose,
minSdk 26, no annotation processors. Everybody uses it for attendance, leave,
corrections, overtime, payslips, letters and approvals; field SALES staff also
get assignments, visit forms and the location round. Its backend is
**`matrubhoomi-hrms-backend`** (`/api/employee/*`, `/api/field/*`) and its
desk-side counterpart is **`matrubhoomi-hrms`**, both normally cloned as sibling
folders.

Read `README.md` first — it covers the build, the installation steps a field
handset needs, and the shape of the code. This file adds only what is easy to
get wrong.

## Commands

```bash
./gradlew :app:assembleDebug -PapiUrl=http://<your-lan-ip>:5000
./gradlew :app:assembleRelease
```

No tests. Verification is: does it build, does it install, does the trail still
appear on the desk's map after the phone has been in a pocket for an hour.

## Who sees what is the SERVER's decision

`Bootstrap.capabilities` (field, tracking, fieldAttendance, manager, overtime,
standings) decides the bottom bar, the menu and whether location is ever asked
for. Never infer a role from a department name on the handset, and never ask for
location unless `caps.tracking` — an accountant must never see a location
prompt. `Prefs.trackingEnabled` defaults to FALSE for the same reason, and
`Tracking.startDuty` refuses anybody who is not field staff.

**One manager.** Requests go to the reporting manager and their decision is
final; there is no second approver in the app or on the server.

## The three things the field side exists to do

Everything in the field half serves one of them, and a change that makes one of
them less certain is not an improvement whatever else it does:

1. Record a visit that **cannot be lost**.
2. Record a route that **does not stop** when the phone is pocketed.
3. Be usable **with no signal at all**, from the moment after sign-in.

## The sharp edges

**`Prefs.onDuty` is the source of truth, not the service.** The service running
is a consequence of that flag. Never invert it — code that reads "is the service
alive" to decide whether recording should be happening cannot tell the
difference between "the user stopped it" and "MIUI killed it", and those need
opposite responses.

**Do not filter location fixes on the handset.** Every fix goes into the outbox
as reported, accuracy and all. The accuracy, jitter and speed filters live in
`services/fieldTracking.js` on the server, where a rule that turns out to be
wrong can be corrected against data that was kept. A fix discarded here is gone.

**`startForeground()` is the first statement in `onStartCommand`.** The system
gives a service started with `startForegroundService` five seconds to show its
notification and treats a miss as a crash. Anything that can throw must come
after it.

**The heartbeat alarm must stay EXACT.** An inexact alarm is deferred into a
Doze maintenance window and — the part that actually matters — cannot legally
start a foreground service on Android 12+. The alarm exists precisely to restart
a service that was killed, so an inexact one would be unable to do the only
thing it is for.

**Background location cannot be requested in the same call as foreground
location.** Asking for both together silently drops the background one.
`MainActivity` asks for the foreground pair; the "all the time" upgrade is asked
for from the home screen, in context. Do not "simplify" them into one request.

**Photographs are uploaded before the submission that references them.** Four
photos on a bad line become four small independent attempts rather than one
all-or-nothing one, and a partially delivered submission remembers which already
went up (`SyncWorker`, `db.updatePhotos`).

**`clientRef` is what makes a retry safe.** Generated on the handset, stored on
the server with a unique index. Removing it would mean every timed-out request
that actually succeeded creates a second record for the same farmer.

**The app never resolves a scheme or a step.** A follow-up task arrives with
the customer, the scheme, the step and the form version already frozen on it
(`FieldTask.schemeName / stageName / templateVersion`); the screens SHOW those.
The one choice an employee makes is the scheme at registration, from the
`schemes[]` list the bootstrap sent — never from a name in this code.

**"Done" means approved.** `TaskTarget.isDone` is `status == "done"` only. A
submitted-but-unreviewed visit is `isWaiting`; a refused one is `isRework` with
the desk's note in `rejectionNote`. Never tell the employee a step is finished
because they pressed save — the wording on FormScreen and TaskDetailScreen is
deliberate.

**The server ends sessions; `core/Session.kt` obeys.** A 401, or a 403 with
`EMPLOYEE_INACTIVE` / `INTERN_NO_APP_ACCESS`, from ANY request (a screen, the sync
worker, the location batch) stops duty, clears the session and keeps the reason
for the sign-in screen. `NOT_FIELD_STAFF` keeps the session but stops the
recording. Do not handle these per screen.

**The outbox is keyed by employee.** Pings, submissions and duty events carry
`employee_id`; the worker sends only the signed-in person's. Dropping that would
send one person's queued positions as the next person to sign in on the phone.

**Map tiles are OpenStreetMap (streets) and Esri (satellite), drawn at 512px.**
Carto's keyless tiles now come back blurred and stamped "API KEY REQUIRED". The
256px images are drawn at twice their size (`TILE_SIZE` in TileMap.kt) so street
names stay readable on a dense screen; `metresPerPixel` accounts for it.

**Screens that warn about a permission read `UiState.permissionsVersion`.**
Android announces nothing when a permission changes; the version is bumped when
the system dialog closes and on every resume, and a warning that does not read it
stays on screen after the tap that fixed it.

**The SDK is the default one.** `ANDROID_HOME` points at
`C:/Users/soumy/AppData/Local/Android/Sdk` and no `local.properties` is needed.
(An older note here sent builds to an SDK on D:, which no longer exists.)

## Dialogs, toasts, and what the server is told

**Every dialog is `AppDialog`** (`ui/components/Dialogs.kt`) — confirmations,
reasons, forms. Do not add a bare `AlertDialog`: the look, the busy state and
the in-dialog refusal are the point. `ReasonDialog(submit = …)` runs the write
itself and stays open on a refusal. Say a result with `LocalToast.current`.

**A 401 ends the session everywhere** (`core/Session.kt`), so a server route
the app calls must never answer a user's typo with one. Change-password
answers a wrong current password with 400 `WRONG_PASSWORD` for this reason.

**`X-App-Version` / `X-App-Build` go on every request** (`Api.builder`). HR's
Mobile app page and the update prompt depend on them; bump `versionCode` for
every build handed out, or the phones cannot be told apart.

## Colour and type

The palette in `ui/theme/Theme.kt` is copied from `app/globals.css` in the web
repo — the paper ground, the field green, the neutral ink. Duplicated rather than
fetched because a phone must render correctly with no network. If the web palette
is retuned, retune this to match; they are meant to read as one system.

Type is one step larger than Material's defaults throughout, deliberately. This
is read at arm's length in sunlight by somebody standing in a field.

Dynamic colour (Material You) is off on purpose — this is a company tool used
alongside a company web app.

## Backend coupling

`data/Api.kt` is the only file that knows a server exists. Field endpoints are
under `/api/field/*` and are documented at the top of
`routes/Field_Routes/fieldApp.js` in the backend repo — including WHY that
router returns the whole working set in one `/bootstrap` call rather than in
several smaller ones. HR endpoints are the employee portal's own
(`/api/employee/*`) — the same rolls and records, never a copy. Notifications
come from the server's inbox (`/api/employee/notifications`), polled by
`sync/InboxWorker.kt`, because the server's push is Expo-only.

`scripts/employeeAppFlow_test.js` in the backend repo runs this app's whole life
against a scratch database — sign-in, capabilities, a recorded day, field
attendance, one-manager approvals, the inbox, and HR letting somebody go.

Sign-in uses the EMPLOYEE credentials the portal already issues
(`/api/employee/auth/login`). There is one workforce and one password; do not add
a second identity for the same people.
