# Sales — Customers, Schemes, Follow-ups and Approval

How a farmer goes from a knock on the door to a completed scheme, and why the
system is shaped the way it is. Read this before touching anything under
`models/Sales_Models/`, `services/salesPipeline.js`, `services/salesProgression.js`
or `routes/Sales_Routes/`.

## The one sentence

**A customer belongs to one scheme, stands on one of its steps, and moves up one
step each time the desk approves a submission for the step they are on.**

Everything else follows from that. In particular: an employee pressing *Submit*
is a claim, and the customer does not move until somebody with the `approver`
role accepts it.

## The story, end to end

```
Desk configures       New Customer form (one, global)
                      Scheme A: Step 1 → Form A1, Step 2 → Form A2, Step 3 → Form A3
                      Scheme B: its own steps and forms

Desk assigns          NEW CUSTOMER task · Ramesh · target 10 · today
                      (no customers chosen — they do not exist yet)

Ramesh, in the field  fills the New Customer form, CHOOSES Scheme A, submits
                      → SalesLead created, status pending_approval, on Scheme A's first step
                      → SalesFormSubmission kind=new_customer, approval.status=pending

Approver              APPROVE → customer status open, still on step 1, now assignable
                      REJECT  → customer status rejected, record kept, reason kept

Desk assigns          FOLLOW-UP task · picks the CUSTOMER
                      server resolves: Scheme A → current step → that step's form + version
                      all four are frozen onto the task (schemeVersion, stageKey, templateId, templateVersion)

Sunita, in the field  opens the task; sees customer / scheme / step; chooses nothing
                      fills the step's form, submits
                      → submission approval.status=pending; customer does NOT move

Approver              APPROVE → advanceLeadForSubmission(): exactly one step up
                      REJECT  → customer stays; task reopens as rework with the reason on the handset

…repeat…              until the approved step's successor is a terminal `won` step
                      → customer status won, isCustomer true, scheme complete
```

Every one of those arrows writes a `SalesEvent`, and the customer's `timeline`
gets a readable line.

## Models

| Model | What it is | What changed |
|---|---|---|
| `SalesScheme` | **A scheme is the `pipelineKey`.** Its `key` equals the `pipelineKey` every other sales document already stores. | New. `isLegacy` marks the one migration created from pre-scheme data. |
| `SalesStage` | A step of a scheme. Scoped by `pipelineKey`; `schemeId` is the referential half of the same fact. | +`schemeId`, +`requiresApproval` (default **on**), +`isArchived`. |
| `SalesFormTemplate` | A versioned form. One engine, three attachment points. | +`purpose`: `new_customer` \| `scheme_step` \| `standalone`. Exactly one active `new_customer`. |
| `SalesLead` | Lead and customer are the same row (`isCustomer` flips at a `won` step). | +`schemeId`, `schemeAssignedAt`, `stageEnteredAt`, `schemeHistory[]`; `status` gains `pending_approval` and `rejected`. |
| `SalesTask` | One employee's work. Quota (`targetCount`) or targeted (`targets[]`). | +scheme snapshot (`schemeId/Version/Name`, `stageName`), +`pendingCount`, `rejectedCount`; target status gains `pending_approval`, `rework`; task status gains `pending_approval`, `rework`. |
| `SalesFormSubmission` | One filled form, never edited. | +`kind`, +`approval{required,status,decidedBy,decidedAt,note,supersededBy}`, +`conflict{detected,expectedStageKey,actualStageKey}`, +`schemeId/Version`. |
| `SalesEvent` | Append-only audit row. | New. The lead's `timeline` stays as the capped readable summary; this is the record. |
| `SalesOtp` | | +purpose `portal_login`, the one purpose with no employee behind it. |

### Four states that are not the same state

```
Customer status      pending_approval | rejected | open | in_progress | won | lost | on_hold
Customer step        lead.stageKey  (a key of their scheme)
Submission approval  pending | approved | rejected | auto
Task status          assigned | accepted | in_progress | pending_approval | rework | completed | partial | cancelled | expired
```

`auto` on a submission means the step did not ask for review. It is not
`approved` — nobody looked — and the migration labels every pre-approval
submission this way rather than inventing an approver.

## The one write path, split in two

`services/salesPipeline.js → recordSubmission()` still stores every submission
from the app and the desk. It now:

1. Freezes `approval.required` from the step's `requiresApproval` **at capture**,
   so changing the flag later never retroactively decides what is waiting.
2. Writes the visit's **facts** immediately (visit count, OTP verified, deposit
   collected, first geo fix) — a rejected form does not un-collect a deposit.
3. Detects a **conflict** when the submission's step is no longer the customer's
   current step, keeps the answers against the step they were captured for, and
   flags it. Nothing is applied automatically.
4. Only when approval is not required (and there is no conflict) calls the move.

The move itself lives in two functions and nowhere else:

- `activateCustomerForSubmission()` — a registration is accepted. Status → `open`,
  **step unchanged** (the scheme's first step). Registering is not climbing.
- `advanceLeadForSubmission()` — a follow-up is accepted. Exactly one rung:
  `nextStage()` (next working step) or `terminalAfter()` (the `won` ending, if
  the ladder has run out). A `lost` terminal is never entered by succeeding.

`services/salesProgression.js` owns the decisions: `approveSubmission`,
`rejectSubmission`, `changeScheme`, `overrideStep`, `resolveFollowUpContext`,
`assertAssignable`, `pendingQueue`. Routes are thin shells over it.

## Double-approval without transactions

Production is a standalone `mongod`; transactions are unavailable. The guard is
one atomic conditional update:

```js
SalesFormSubmission.findOneAndUpdate(
  { _id, "approval.status": "pending" },
  { $set: { "approval.status": "approved", ... } },
)
```

Exactly one caller moves the row out of `pending`. Everyone else gets `null`,
is answered `alreadyDecided: true`, and never reaches the code that moves the
customer. Writes after the claim are ordered to be individually safe: the
customer moves first, task counters are **recounted** from targets rather than
incremented (`recountTask()`), the audit row goes last and never fails the action.
Verified by CASE 16 with two genuinely concurrent requests.

## Counters

`recountTask()` is the only writer of `doneCount`, `pendingCount`,
`rejectedCount` and the statuses derived from them.

- `doneCount` = **approved** targets. Never submitted, never rejected.
- The denominator for a quota task is `targetCount`, **not** attempts — a
  refused registration must not raise the bar on the person redoing it.
- A task is `completed` when approved ≥ target; `rework` when anything came
  back refused; `pending_approval` when everything asked for is in and the desk
  is the holdup.

## Configuration safety

`services/salesSchemes.js` refuses, server-side:

- renaming a scheme's or step's **key** once it exists (everything stores it)
- two steps with one key, or one position
- a step pointing at a missing or inactive form
- **archiving** a scheme with live customers or open tasks; a step anybody is
  standing on; the last usable step of a scheme
- **deleting** anything ever referenced (offers archive instead); the legacy scheme
- turning a step terminal while customers are on it

Any change to a scheme's *shape* bumps `SalesScheme.version`. Tasks snapshot the
version at assignment. Reordering never moves a customer; it changes what comes
*next* for them, which is the intended meaning of a reorder.

Templates were already versioned and never edited in place; a submission
stores `templateVersion` and a frozen `labels` map. CASE 19 proves an old
submission still renders with its original labels after the form is rewritten.

## The two privileged corrections

Both are `approver`-only, both **demand a reason**, both write a `SalesEvent`,
neither touches an existing submission.

- **Change scheme** (`POST /api/sales/customers/:id/scheme`): closes the current
  `schemeHistory` chapter, opens a new one, puts the customer on the new
  scheme's first step, and cancels their open tasks under the old scheme (they
  were for steps that no longer apply).
- **Override step** (`POST /api/sales/customers/:id/step`): moves them by hand.

## Migration

`scripts/migrateSalesSchemes.js` — idempotent, `--dry-run` supported.

- Creates one `SalesScheme` per existing `pipelineKey` (normally just
  `default`, named "Default pipeline", `isLegacy: true`). **Nobody changes step.**
- Backfills `schemeId` on stages, customers, tasks, submissions.
- Sets `requiresApproval: true` on existing steps, and **prints a loud warning**:
  from that day, existing steps wait for an approver. Reversible per step from
  the Scheme Builder.
- Marks pre-approval submissions `approval.status: "auto"`.
- `stageEnteredAt` is backfilled from the row's own `updatedAt`, never "now".

`services/ensureSalesDefaults.js` creates the same default scheme row on a fresh
database, so both paths agree.

## Offline (Android)

`/api/field/bootstrap` ships, in one response: the employee's open tasks with
their frozen scheme/step/form snapshot, every template those tasks need, **the
registration form** (`newCustomerTemplateId`), and **every active scheme with its
steps** (`schemes[]`). An employee who bootstraps and drives out of signal can
register a customer into any scheme and open any assigned follow-up without a
further request.

The outbox, `clientRef` idempotency (unique partial index; CASE 22 sends the
same record ten times), photo-before-submission and WorkManager sync are
unchanged.

The app never resolves a scheme or step. A follow-up task *tells* it the
customer, scheme, step and form version; the app shows them. The one choice an
employee makes is the scheme at registration, from the list the server sent.

### Late submissions

A form captured for step 2 that arrives after the customer has moved to step 3
is stored against step 2, flagged `conflict.detected`, and shown in the desk's
queue under *Conflicts*. Approving it keeps the record **without** moving the
customer in either direction (CASE 25). The employee's data is never discarded.

## The customer's own view

`/api/customer/*` — a fourth identity, the narrowest. Phone + OTP
(`purpose: "portal_login"`), token scoped to one lead, read-only, 30 minutes,
no `:id` in any path. `services/customerPortal.js` builds a deliberately smaller
object: steps as done / current / upcoming with dates, one headline sentence,
the next booked visit. It **hides** rejection reasons, approver notes, other
customers and internal ids; a pending or rejected registration has no portal.
Unknown phone numbers get a byte-identical response so the login page cannot
enumerate customers. Page: `matrubhoomi-hrms/app/track`.

## APIs

Desk (`/api/sales`, CMS session + sales role):

```
GET/POST        /schemes                      PATCH/DELETE /schemes/:id
GET             /schemes/:id                  (with steps, forms and validation problems)
GET             /schemes/:id/references       POST /schemes/:id/archive | /restore
GET/POST        /schemes/:id/steps            POST /schemes/:id/steps/reorder   (approver)
PATCH           /steps/:id                    GET /steps/:id/references         POST /steps/:id/archive (approver)
GET/POST        /config/new-customer
GET             /approvals                    GET /approvals/:id
POST            /approvals/:id/approve        POST /approvals/:id/reject        (approver)
GET             /customers/search             (server-side, with eligibility + reason per row)
GET             /customers/:id/workflow       GET /customers/:id/history
POST            /customers/:id/scheme         POST /customers/:id/step          (approver)
POST            /tasks/:id/reassign
```

Field (`/api/field`, employee token): `bootstrap` gains `schemes[]` and
`newCustomerTemplateId`; `submissions` returns `approvalStatus`,
`pendingApproval`, `conflicted`, `taskPending`, `taskRejected`.

Customer (`/api/customer`): `POST /otp`, `POST /verify`, `GET /me`.

All answer `{ success, data, message }`.

## Testing

Two suites, both against a real server and a **scratch** database:

- `scripts/salesFlow_test.js` — the original round, 40 expectations.
- `scripts/salesSchemeFlow_test.js` — the 30 acceptance cases plus 5 for the
  customer portal, 143 expectations. Every case is about something *not*
  happening as much as something happening.

Run them per the headers in each file. Never against production.
