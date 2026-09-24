# Matrubhoomi — the employee app

The Android app the whole workforce carries. Kotlin, Jetpack Compose, minSdk 26.

Everybody uses it for their working life: attendance, leave, fixing a day,
overtime, payslips, HR letters, holidays, standings and notifications — and a
manager for their team's approvals. **Field sales staff** get three more things
on top, and nobody else ever sees them:

1. **The day's work** — the assignments the sales desk handed out, and the form
   each visit has to fill.
2. **The visit record** — answers, photographs, the customer's OTP, and where the
   phone actually was when it was saved.
3. **The round** — continuous location while on duty, with the screen off, the
   app closed and the phone in a pocket: where they are, how fast they are going,
   where they stopped and for how long ("Stayed in Kalmeshwar 10:42–11:27, 45
   min"). Ending duty files the day's field attendance for their manager to
   confirm in one tap.

Its backend is **`matrubhoomi-hrms-backend`** (`/api/employee/*` and
`/api/field/*`), and its desk-side counterpart is **`matrubhoomi-hrms`** — HR,
and the Sales module's *Team on the map*.

## Who sees what

The SERVER decides, in the `capabilities` block of `/api/field/bootstrap`; the
app never works out a role from a department name. Location is asked for ONLY
when `tracking` is true — an accountant's phone is never asked where it is.

| Capability | Decided by | What it adds |
|---|---|---|
| `field` / `tracking` | HR department "Sales", or the Sales access grant (`services/fieldAccess.js`) | Duty switch, Work, Customers, Route, the location service |
| `fieldAttendance` | same | Ending duty files the day for the manager |
| `manager` | has active direct reports | Approvals in the menu, badges |
| `overtime`, `standings` | on for everybody | the menu entries |

Two shapes of bottom bar, and a menu (the burger) that lists every place this
person may go and nothing they may not:

| | Bottom bar | In the menu |
|---|---|---|
| **Field staff** | Today · Work · Customers · Route · Me | Attendance, Leave, Fix attendance, Overtime, Holidays, Payslips, Documents, Approvals*, Standings, Notifications, Profile, Settings |
| **Everybody else** | Home · Attendance · Leave · Pay · Me | Fix attendance, Overtime, Holidays, Documents, Approvals*, Standings, Notifications, Profile, Settings |

\* managers only. A task, a form, a new customer, one farmer's history and the
full-screen map open ON TOP, with the bar hidden and a back arrow.

**One manager.** Every request goes to the employee's reporting manager, whose
decision is final — there is no second approver anywhere in the app.

## Building

The Android SDK and a JDK 17 are the only prerequisites.

```bash
./gradlew :app:assembleDebug
```

**The API address lives in `gradle.properties`** — change `apiUrl` there and
rebuild, no source edit:

```properties
apiUrl=http://192.168.1.9:5000
```

A command-line flag overrides it for a one-off build (the emulator reaches the
host as `10.0.2.2`):

```bash
./gradlew :app:assembleDebug -PapiUrl=http://10.0.2.2:5000
```

And the app itself overrides both: the "Cannot connect?" link on the sign-in
screen, or a long press on the version line in **Settings**. Debug builds carry
an application id of `com.matrubhoomi.field.debug` and permit cleartext, so a
debug and a release build can sit on the same handset.

Release:

```bash
./gradlew :app:assembleRelease -PapiUrl=https://api.matrubhoomifarms.in
```

R8 is on for release. There are no keep rules to maintain because nothing here
maps JSON by reflection — see `data/Models.kt` for why.

## Installing on a field handset

This app is **not distributed through Play**. It is installed by the company
onto company-used handsets, which is what makes the battery-exemption and exact-
alarm permissions appropriate — both are restricted for Play-distributed apps.

For FIELD staff, three things must be set or the recording will stop partway
through the day (nobody else is asked for any of them):

| Setting | Where | Why |
|---|---|---|
| Location: **Allow all the time** | app settings | Anything less stops the trail when the screen goes off. Android will not let the app ask for this in a dialog. |
| Battery: **Unrestricted** / exemption granted | app settings | Doze freezes the service otherwise. The app offers the system dialog for this. |
| **Autostart: ON** | phone settings, Xiaomi / Vivo / Oppo / Realme only | These OEM layers kill the app regardless of every permission above. Nothing in the app can request it. |

Settings lists whatever is missing with its consequence, and the home screen
refuses to be quiet about it.

## How the round is recorded

- A **foreground service** typed `location`, with a notification the user cannot
  dismiss; it shows the office's own reading — "At Kalmeshwar · 25 min" — and the
  server's distance for the day.
- **`Prefs.onDuty` is the source of truth.** The service is a consequence of it,
  so a killed service is a discrepancy something can notice.
- A **heartbeat**: a phone that has not moved still reports every
  `heartbeatSeconds`, which is what lets the server see a forty-minute stop.
- A **watchdog** that re-requests updates when the provider falls silent, and a
  **repeating exact alarm** that restarts a killed service. **Boot and
  package-replaced receivers** cover the rest — recording resumes by itself after
  an app update mid-day.
- Fixes are uploaded every `batchIntervalSeconds` (60 by default, set by the
  server), so the desk's live board is about a minute behind the phone.

The server decides what the fixes mean (`services/fieldTracking.js`): distance
(conservatively — vague, jittery and impossible fixes are stored but never
counted), speed, stops ("stays" of five minutes within sixty metres, carried
across uploads), and place names. The Route screen shows the employee exactly
what the desk sees.

## How nothing is lost

Every field record is written to a local SQLite outbox (`data/FieldDb.kt`)
before the screen says "saved", and delivered afterwards by WorkManager
(`sync/SyncWorker.kt`). A visit taken in a dead spot survives a force-stop, a
reboot and a flat battery, and arrives when signal does — carrying the time it
was captured, not the time it was sent. The outbox is keyed by employee, so what
one person queued is never sent as the next person to sign in on that phone.

Retries are made safe by a `clientRef` generated on the handset: the server
stores the first arrival and returns the same answer for every duplicate.

HR records (leave, corrections, overtime, letters) are ONLINE-only on purpose:
they carry rules only the server can check, and queuing one would tell somebody
they had booked a day the server was always going to refuse.

## When the server ends the session

HR deactivating somebody takes effect on their phone's next request: every
route answers `EMPLOYEE_INACTIVE`, and `core/Session.kt` stops the recording,
clears the session and returns to sign-in with the reason on screen. The server
closes their open duty itself (the phone can no longer tell it).

## Notifications

The server's push is Expo-only, which a native app cannot receive, so the server
keeps an inbox (`/api/employee/notifications`) and `sync/InboxWorker.kt` reads it
every fifteen minutes and on opening the app, raising a notification that opens
the screen it is about. For instant delivery, add a Firebase project and FCM.

## Signing in, updates and announcements

- **The first sign-in.** HR issues the phone number as the password (a new
  hire, or a reset). The server says so (`mustChangePassword`), and the app
  opens nothing until the person has chosen their own
  (`ui/screens/SetPasswordScreen.kt`).
- **Updates.** Every request carries `X-App-Version`, `X-App-Build`,
  `X-Device` and `X-OS`, so HR's CMS shows who has the app and on which build.
  When HR publishes a newer release there, the home screen and Settings say
  "Update available" and the download opens in the browser.
- **Announcements** from HR or the executive office arrive in the inbox like
  any notification, with their own icon, and open in full when tapped.

## Every popup looks the same

`ui/components/Dialogs.kt` is the one dialog (`AppDialog`): a tinted icon that
says what kind of moment it is, a title, a sentence, full-width buttons. A
write in progress keeps it open with a spinner, and a refusal is shown inside
it, so nothing typed is lost. Results are a toast (`LocalToast`), not a line
written into a form that may be off screen. Lists pull down to refresh.

## The shape of the code

```
core/Prefs.kt               session, role, duty flag, tracking cadence, update check
core/Session.kt             the server ending a session, and a role change
core/Format.kt              how minutes, km, rupees and dates are written
data/Api.kt                 every call to the server, with typed failures
data/Models.kt              field shapes (tasks, forms, the day, stops)
data/EmployeeModels.kt      HR shapes (leave, corrections, payslips, inbox…)
data/FieldDb.kt             the outbox — pings, submissions, duty events
data/Repository.kt          what the screens talk to
location/Tracking.kt        start/stop/keep-alive, and the permission facts
location/LocationService.kt the recording itself
sync/SyncWorker.kt          drains the outbox
sync/InboxWorker.kt         the notification inbox
MainActivity.kt             the shell: drawer, tabs, routes, app lock
ui/Nav.kt, ui/Drawer.kt     the bottom bar per role, and the menu
ui/components/              shared controls, dialogs and toasts, the tile map, visuals
ui/screens/                 every screen; RouteParts.kt is the day as the desk sees it
ui/theme/Theme.kt           the same palette as the web side
```

## What it deliberately does not do

- **No filtering of location fixes on the handset.** Everything the provider
  reports is stored as-is; the judgement about which fixes count is made once, on
  the server, where it can be reconsidered later.
- **No call features.** It records the round, not the phone.
- **No team map in the app.** The whole team's positions are on the desk
  (*Team on the map*), where the people allowed to see them work.
- **No offline lead search.** The book lives on the server; a cached subset
  would answer "not in the book" when it means "not on this phone".
