# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The API behind the Matrubhoomi Farms & Developers workforce system — Express 5 +
Mongoose 8, CommonJS, no build step. Its frontend is **`matrubhoomi-hrms`**, a
separate repo normally cloned as a sibling folder and run on `:3000`.

Read `README.md` first — it covers the boot sequence, the three kinds of
identity, the token scheme, and the environment. This file adds only what is
easy to get wrong.

## Commands

```bash
npm run dev     # nodemon server.js → http://localhost:5000
npm start       # node server.js
```

No tests, no linter. Verification is: does the server boot, and does the route
answer.

One exception, and it is worth knowing about before changing anything in the
sales module: `scripts/salesFlow_test.js` runs the whole round end to end — the
desk assigns, the phone records, the desk reads it back — against a real server
and a **scratch** database. Forty expectations, and it has already caught
two bugs that no unit test would have seen. Its header carries the two commands.
`scripts/salesSchemeFlow_test.js` is its sibling for schemes and approvals — 35
cases, 143 expectations — and both must be green before a sales change ships.

## Scope — read this before adding anything

This deployment has **four surfaces**: HR, the executive office (an HR overview
plus access control), the employee self-service portal, and **Sales** — leads,
field assignments, form templates and the field team's location trail, with its
own Android app talking to `/api/field/*`.

Sales is the newest and the only one with a mobile client of its own. Its shape
is set out under "The sales module" below; read that before touching anything
under `routes/Sales_Routes/`, `routes/Field_Routes/` or `models/Sales_Models/`.

It descends from a much larger ERP, and the shape of that history is still
visible — `LEGACY_MODELS` in `routes/auth/deptAuth.js`, the `legacyRole` /
`legacyUserType` columns on `AccessDepartment`, the dual v1/v2 token read in
`/verify`. Those exist so a database written by the older login keeps working.
**Do not "clean them up"** without checking what is actually in the database
first; every one of them is a compatibility path, not dead code.

Equally: do not add a fifth module here because a route looks like it wants one.
Departments are created from Access Control at runtime — a new department needs a
row, not a folder. Sales earned a folder because it has a domain (a pipeline,
forms, submissions, a location trail) and a second client; a department that only
needs screens does not.

## Where the sharp edges are

**`server.js` is the whole route map.** Every mount is in one file, in order.
Express matches in registration order, and that matters in one place:
`routes/auth/deptAuth.js` is mounted on `/api/auth` BEFORE `routes/login.js`, so
`login`, `verify` and `logout` come from deptAuth and anything it does not
define falls through to the older router.

**Salary is encrypted at rest** (`utils/salaryEncryption.js`, keyed by
`SALARY_ENCRYPTION_KEY`) via a pre-save hook on `Employee`. Two consequences:
- `Employee.updateOne` BYPASSES the hook — which is why
  `utils/employeePassword.js` writes passwords that way on purpose.
- Loading a full employee document just to change one unrelated field
  re-encrypts the salary fields, and on some documents that has thrown. Prefer
  a targeted `updateOne` unless you actually need the document.

**Attendance is the source of truth for payroll**, never the reverse. If a
figure looks wrong, the bug is almost always upstream in
`Attendance_section.js` or the shift policy, not in `Payroll_section.js`.

**`Middlewear/` is spelled that way.** It is the real directory name;
`middleware/` also exists and holds something different. Check which one you
mean.

**There is no Firebase and no Google Drive.** Both were removed. Browser push
is plain VAPID Web Push (`utils/webPush.js`, keys in `VAPID_*`), and every
stored byte lives in Cloudinary. If you find a `firebase-admin` or `googleapis`
import, it is from a stale branch — neither package is installed.

**Cloudinary, and the two things this account refuses.** Both were found by
probing it, and both shape `services/mediaUpload.service.js`:
- PUBLIC delivery of PDFs and ZIPs answers **401** "deny or ACL failure".
- `.apk` and `.bin` are rejected **on upload**.

So the rule is: images go public and get a CDN URL; everything else uploads as
`type: "private"` with the extension stripped, and is served from
`/api/files/<token>` (`routes/files.js`), which mints a signed URL per request.
Do not "simplify" a document upload back to a public `secure_url` — it will
upload fine and produce a link that never opens.

**A private Cloudinary URL is not a protected one.** For a private or
authenticated RAW asset, the `secure_url` the upload returns already carries a
working signature and serves 200 to anyone holding it. What makes HR letters
private is that the URL never leaves the process — `EmployeeDocument.file.url`
is deliberately `""`. Keep it that way.

## Domain notes

- **Departments and roles are data.** `services/ensureAccessDepartments.js`
  registers the two built-in departments at boot; everything after that is
  created from the Access Control screen. `services/departmentRoles.js` holds
  the one role vocabulary (owner / approver / editor / viewer) and the guard
  that enforces it — and it deliberately fails open for a department with no
  roles assigned yet.
- **The approval queue** (`routes/Access/changeRequests.js` +
  `services/changeRequests.js`) holds an editor's write and replays it on
  approval. It spans departments, so it authenticates the session itself rather
  than sitting behind any one department's middleware.
- **Letters and payslips are PDFs rendered from HTML** by headless Chromium.
  `lib/payslipTemplate.mjs` carries the masthead name and the logo as a literal
  data URI — deliberately, so the document is identical online and offline.
  Changing the company's printed identity means changing that file AND
  `lib/company.js` in the frontend.

## The sales module

Four ideas, and everything else follows from them.

**The pipeline is data.** Stages are rows (`SalesStage`), and so are the forms
attached to them (`SalesFormTemplate`). The desk adds a rung or a question
without a deploy, and the Android app renders whatever it is handed. Never
hardcode a stage key or a field name in a route.

**One write path.** Every advance of a lead goes through
`services/salesPipeline.js → recordSubmission()`, from both the app and the
desk. It touches five documents — the submission, the lead's stage and timeline,
the task's target row and counters, the template's usage count, and the day's
rollup — and spreading that across two callers is how they drift within a month.

**Templates are versioned, never edited in place.** A submission stores the
version AND a frozen copy of the field labels it was answered against, so an old
record still renders after the template has been rewritten five times. Renaming
a field key once answers exist is refused, not migrated.

**Location is stored raw and counted conservatively.** `FieldLocationPing` keeps
every fix the handset reports; `services/fieldTracking.js` decides at INGEST
which of them count as travel (accuracy limit, jitter floor, speed ceiling) and
folds the result into `FieldDay`. Pings expire after ninety days; the rollup does
not. Nothing computes distance at read time — that query gets slower every week
the company operates.

**Submitting is a claim; approving moves the customer.** A scheme is a
`SalesScheme` row whose `key` IS the `pipelineKey`, and its steps are the
`SalesStage` rows scoped to it. A step's `requiresApproval` (default on) means a
submission is stored PENDING and the customer does not move until
`services/salesProgression.js → approveSubmission()` accepts it — guarded by one
atomic conditional update, not a transaction. Registration puts a customer AT a
scheme's first step; approval of a follow-up moves them up exactly one. Read
`docs/SALES_SCHEME_ARCHITECTURE.md` before touching any of it, and run
`scripts/salesSchemeFlow_test.js` (143 expectations) after.

**A fourth identity exists: the customer.** `/api/customer/*` signs a farmer in
by OTP to their own phone and shows them their steps. It deliberately hides
rejection reasons and approver notes — see `services/customerPortal.js`.

Two more things worth knowing:

- **`/api/sales/*` and `/api/field/*` are different identities.** The first is a
  CMS session with a role in the `sales` department; the second is the employee
  token the mobile app carries. They are separate mounts for that reason, not
  for tidiness.
- **The OTP is the one signal an employee cannot manufacture.** Codes are hashed
  (`services/salesOtp.js`), spendable once, and when no SMS provider is
  configured the code is handed back for the employee to read out — recorded as
  `delivery.status: "manual"` so the weaker path is visible rather than
  disguised.

## The company's own particulars

The registered name, address, phone and CIN print on legal documents. On the
frontend they live in one place (`lib/company.js`, environment-overridable). On
this side the masthead lives in `lib/payslipTemplate.mjs`. Keep the two in step,
and never hardcode a third copy anywhere else.
