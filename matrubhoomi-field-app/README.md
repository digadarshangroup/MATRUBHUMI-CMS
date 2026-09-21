# Matrubhoomi Field

The Android app the sales team carries. Kotlin, Jetpack Compose, minSdk 26.

It does three things:

1. **Shows the day's work** — the assignments the sales desk handed out, and the
   form each visit has to fill.
2. **Records the visit** — answers, photographs, the customer's OTP, and where
   the phone actually was when it was saved.
3. **Records the round** — continuous location while on duty, with the screen
   off, the app closed and the phone in a pocket.

Its backend is **`matrubhoomi-hrms-backend`** (`/api/field/*`), and its desk-side
counterpart is the Sales module in **`matrubhoomi-hrms`**.

## The screens

Five tabs along the bottom, and everything else pushed on top of them:

| Tab | What it answers |
|---|---|
| **Today** | What needs me before I set off, and what am I doing |
| **Work** | The full list, open and finished |
| **Leads** | Who is this farmer standing in front of me |
| **Route** | Where have I been today, and what did the office record |
| **More** | Permissions, the outbox, the server address, signing out |

A task, a form, a new lead and one farmer's history open ON TOP, with the bar
hidden and a back arrow. That split is deliberate: a form is a job you finish or
abandon, not a place you wander in and out of.

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

A command-line flag overrides it for a one-off build:

```bash
./gradlew :app:assembleDebug -PapiUrl=http://192.168.1.9:5000
```

And the app itself overrides both: **More → Server address**, or the "Cannot
connect?" link on the sign-in screen. That last one matters — the one moment the
address is needed is when a handset that has never signed in cannot reach the
server, and everything behind the sign-in screen is unreachable then. A phone
already in somebody's hand can be pointed at a new laptop with no rebuild. Debug
builds carry an application id of `com.matrubhoomi.field.debug` and a network
config that permits cleartext, so a debug and a release build can sit on the
same handset without one overwriting the other.

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

After installing, three things must be set or the recording will stop partway
through the day:

| Setting | Where | Why |
|---|---|---|
| Location: **Allow all the time** | app settings | Anything less stops the trail when the screen goes off. Android will not let the app ask for this in a dialog. |
| Battery: **Unrestricted** / exemption granted | app settings | Doze freezes the service otherwise. The app offers the system dialog for this. |
| **Autostart: ON** | phone settings, Xiaomi / Vivo / Oppo / Realme only | These OEM layers kill the app regardless of every permission above. Nothing in the app can request it. |

The Settings screen inside the app lists all of them with their consequences,
and the home screen refuses to be quiet about any that are missing.

## How it survives

The single hardest requirement is "keeps recording when the app is closed and
the phone is locked". Four mechanisms, in `location/`:

- A **foreground service** typed `location`, with a notification the user cannot
  dismiss. On Android 10+ that notification is the legal basis for background
  location, not decoration.
- A **`Prefs.onDuty` flag** that is the source of truth. The service is a
  consequence of it, so a killed service is a discrepancy something can notice.
- A **repeating exact alarm** every five minutes that re-asserts the flag. Exact
  because an inexact alarm cannot legally start a foreground service on
  Android 12+ — see the manifest.
- **Boot and package-replaced receivers** for the two cases the alarm cannot
  cover.

Read `location/Tracking.kt` first; its header explains what each one is
defending against.

## How nothing is lost

Every record is written to a local SQLite outbox (`data/FieldDb.kt`) before the
screen says "saved", and delivered afterwards by WorkManager
(`sync/SyncWorker.kt`). A visit taken in a dead spot survives a force-stop, a
reboot and a flat battery, and arrives when signal does — carrying the time it
was captured, not the time it was sent.

Retries are made safe by a `clientRef` generated on the handset: the server
stores the first arrival and returns the same answer for every duplicate.

## The shape of the code

```
core/Prefs.kt              session, duty flag, tracking cadence
data/Api.kt                every call to the server, with typed failures
data/Models.kt             the API's shapes, parsed from org.json
data/FieldDb.kt            the outbox — pings and submissions
data/Repository.kt         what the screens talk to
location/Tracking.kt       start/stop/keep-alive, and the permission facts
location/LocationService.kt the recording itself
location/CurrentLocation.kt one fresh fix, for a form being submitted
sync/SyncWorker.kt         drains the outbox
ui/Nav.kt                  the five tabs and the bottom bar
ui/screens/                login, today, work, leads, lead detail, route, more,
                           plus task, form and new-lead (pushed on top)
ui/theme/Theme.kt          the same palette as the web side
```

## What it deliberately does not do

- **No tiled map.** Route draws the day's SHAPE on a Canvas instead. Tiles cost
  a download per square on a 2G link and a map library in the APK, and the
  question an employee asks — "does that look like the round I did" — needs the
  shape, not the roads. The desk has the real map.
- **No filtering of location fixes.** Everything the provider reports is stored
  as-is. The judgement about which fixes count as travel is made once, on the
  server, where it can be reconsidered later — a fix discarded on the handset is
  gone for good.
- **No offline lead search.** The book lives on the server; a cached subset
  would answer "not in the book" when it means "not on this phone".
