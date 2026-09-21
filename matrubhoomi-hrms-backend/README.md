# Matrubhoomi HRMS — Backend

The API behind the Matrubhoomi Farms & Developers workforce system. Express 5 +
MongoDB, one process, no build step.

Its frontend is **`matrubhoomi-hrms`**, normally cloned as a sibling folder and
run on `:3000`.

## Quick start

```bash
npm install
cp .env.example .env   # then fill it in — see below
npm run dev            # http://localhost:5000
```

Health check: `GET http://localhost:5000/api/health`

**Upgrading an existing Sales database?** Run `node scripts/migrateSalesSchemes.js --dry-run`
first, read what it prints, then run it without the flag. It turns the existing
pipeline into a "Default pipeline" scheme without moving anybody, and — the one
behaviour change — makes existing steps wait for an `approver` before a customer
moves. Grant somebody that role in the sales department before the field team
goes out. The whole design is in `docs/SALES_SCHEME_ARCHITECTURE.md`.

On a brand-new, empty database the first boot does two things and nothing else:

- creates ONE CEO account, from `CEO_SEED_EMAIL` / `CEO_SEED_PASSWORD`
- registers the two departments (Human Resources, Executive Office)

Sign in as that CEO, change the password, and create everyone else from
**Executive → Access Control**. Nothing else is ever seeded, and the seeding is
strictly additive: it inserts what is missing and modifies nothing that already
exists — no renames, no password changes, no reactivations.

## Environment

`.env` is gitignored; `.env.example` documents every key. Only four matter to
get the server running:

| Key | Why |
|---|---|
| `MONGODB_URI` | the database |
| `JWT_SECRET` | signs every session token; changing it signs everyone out |
| `SALARY_ENCRYPTION_KEY` | encrypts salary at rest — **losing it makes every stored salary unreadable** |
| `EXTRA_ALLOWED_ORIGINS` | any frontend origin beyond `localhost:3000` / `:3001` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | the only blob store — every photo, document, letter and APK |

Everything else is optional and degrades cleanly when unset: no Brevo key means
no email, no VAPID keys means no browser push, no TeamOffice credentials means
attendance runs on manual entry alone. Each logs a warning and carries on.

**A new frontend origin — a LAN address, a tunnel, a preview deployment — must
be added to `EXTRA_ALLOWED_ORIGINS`.** It gates both CORS and the Socket.IO
handshake, and an unlisted origin fails with an opaque `Not allowed by CORS`
with nothing in the logs pointing at the cause.

## Shape

```
server.js          every route mount, the DB connection, the boot seeding
routes/
  login.js         the HR / CEO login waterfall
  auth/            deptAuth (the real login, verify, switch-department),
                   passwordReset (email OTP)
  Admin/           access control: departments, users, employees, roles
  Access/          the change-request approval queue
  HrRoutes/        the HR module — 19 routers, one per screen
  Employee_Routes/ the employee self-service portal and mobile app
  CEO_Routes/hr.js the executive read-only view of HR
  Vendor_Routes/   the HR vendor directory
  Sales_Routes/    the sales desk — leads, assignments, forms, the field map
  Field_Routes/    the Android field app: one router, one identity
models/
  Employee.js      the single employee record everything hangs off
  HR_Models/       attendance, payroll, leave, candidates, documents, policy
  Access/          departments, dept users, roles, change requests, change log
  Sales_Models/    stages, form templates, leads, tasks, submissions, OTPs,
                   and the location trail (pings + the day rollup that outlives them)
services/          payslip rendering, email, push, shift policy, seeding,
                   the sales pipeline, and the location ingest
```

### The three kinds of identity

1. **Department accounts** — HR and the executive office. Live in
   `hrdepartments` / `ceodepartments`, mirrored into `dept_users`. Sign in at
   `POST /api/auth/login` with email + password.
2. **Employees** — everyone on the rolls. Live in `employees`. Sign in with
   their identity ID at `POST /api/employee/auth/login`, and reach only
   `/api/employee/*`.
3. **Platform administrators** — a flag (`isAdmin`) on a department account,
   not a separate account. `requirePlatformAdmin` re-reads it from the database
   on every request, so revoking it takes effect immediately.

The sales module uses the first two, and keeps them apart: `/api/sales/*` needs
a department account holding a role in `sales`, while `/api/field/*` — the
Android app — needs an EMPLOYEE token. Same company, same data, two different
proofs of who is asking.

### Tokens

Every response that establishes a session returns the token in the JSON body
**and** sets it as an HttpOnly cookie. Both are load-bearing: Chrome refuses to
store a cross-origin cookie for `localhost:3000` → `localhost:5000`, so in
development the body token — saved by the frontend and replayed as
`Authorization: Bearer` — is the only path that works. `config/jwt.js`'s
`readToken` checks the header before the cookie, so the header wins wherever it
is present.

## Things worth knowing before you change something

- **Attendance has a cron.** `routes/HrRoutes/Attendance_section.js` exports
  `startHourlyAttendanceSync`, called from `server.js` at boot. It pulls from
  the biometric vendor API at :05 past the hour and does nothing when the
  TeamOffice credentials are unset.
- **Payroll reads attendance, never the other way round.** A payroll run is a
  projection of what attendance already recorded. Editing a payroll figure by
  hand sets `isManuallyOverridden`, which is what stops the next recalculation
  from silently undoing it.
- **The payslip PDF is rendered by Chromium** (`services/pdfRender.service.js`,
  via puppeteer). It is a child process — the graceful-shutdown handler closes
  it, and skipping that leaves an orphaned Chromium behind on every restart.
- **HR documents have two independent states**: HR *generates* a letter, and HR
  separately *releases* it. Nothing unreleased is reachable through
  `/api/employee/documents` — not in a list, and not by guessing an `_id`.
- **Department roles fail open when a department has no roles at all.** That is
  deliberate (see `services/departmentRoles.js`), so turning the feature on does
  not lock out a department before anybody has been assigned. It starts
  enforcing the moment the first role is granted.

There is no test framework and no linter configured.
