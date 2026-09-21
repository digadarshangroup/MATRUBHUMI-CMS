# Matrubhoomi HRMS

The workforce system for Matrubhoomi Farms & Developers Private Limited.
Next.js 16 App Router, React 19.

It has no backend of its own beyond two thin API routes. Everything comes from
**`matrubhoomi-hrms-backend`**, a separate repo normally cloned as a sibling
folder and run on `:5000`.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

The backend must be running on `:5000` — or `NEXT_PUBLIC_API_URL` pointed
somewhere else — for anything past the sign-in screen.

## The four surfaces

| Route | Who | What |
|---|---|---|
| `/hr/dashboard/*` | HR | employees, attendance, payroll, leave, recruitment, documents, policies, teams, vendors, reports |
| `/ceo/dashboard/*` | the executive office | an HR overview, and access control |
| `/sales/dashboard/*` | the sales desk | leads, customers, service requests, field assignments, the form designer, the pipeline, and the team on a map |
| `/employee/[identityID]` | any signed-in user | a person's profile card |

Plus the way in: `/` (landing) → `/onboarding` (the portal, which signs in
every kind of account and shows the departments a person may open) →
the dashboard. `/login` still exists as the direct department sign-in.

`middleware.js` bounces anything under `/hr`, `/ceo`, `/sales` or `/employee` to
the landing page when no session cookie is present. It checks only that a cookie
EXISTS — the signature and the department are re-verified one layer in by
`DepartmentGuard`, against the database, on every request.

The executive side is deliberately small. It is not a second copy of HR: every
figure on it is a count that links through to the HR screen that owns the
detail.

The sales side is where the field team's work is handed out and read back. It
has a client of its own: **`matrubhoomi-field-app`**, an Android app (Kotlin,
normally cloned as a sibling folder) that renders the form templates designed
here, records visits offline, and reports the team's position while they are on
duty. The two halves meet at `/api/sales/*` and `/api/field/*` in the backend.

## Environment

`.env.local` is gitignored; `.env.example` documents every key.

`NEXT_PUBLIC_API_URL` is the only one needed to run. The rest are the company's
own particulars and two optional integrations.

⚠ **`NEXT_PUBLIC_COMPANY_ADDRESS`, `NEXT_PUBLIC_COMPANY_PHONE` and
`NEXT_PUBLIC_COMPANY_CIN` ship as `TO BE CONFIRMED` placeholders and print on
appointment letters, experience letters and salary certificates.** Set them
before any letter is issued to a real employee. They are read from one place —
`lib/company.js` — so setting them is one edit, not six.

## Shape

```
app/
  page.js            the landing page
  login/             direct department sign-in
  onboarding/        the portal — the real front door
  hr/dashboard/      the HR module (~25 screens)
  ceo/dashboard/     overview, access control, HR read-only views
  employee/          the public profile card
  globals.css        the --g-* token layer: colour, in one place, per theme
  ui-kit.css         the measurement kit (.mb-ui) the attendance screens use
components/
  shell/             AppShell (the persistent rail), FrostShell (dashboard chrome)
  access/            access control, department guard, role gates
  hr/, onboarding/, recuriment/, department/, vendor/, employee/
lib/
  company.js         the company's own particulars — ONE place
  brandAssets.js     the mark, inlined for PDF generators
  theme.js           light/dark, applied before first paint
  session.js, authFetch.js, accessApi.js, roles.js
```

## Conventions

- Nearly every page is `"use client"`.
- `@/*` maps to the project root.
- Tailwind v4 via `@tailwindcss/postcss`. **There is no `tailwind.config`** —
  tokens live in `app/globals.css` and `app/ui-kit.css`.
- Colour is never hardcoded. `--g-*` (globals.css) governs most of the app;
  `--ck-*` / `--ink` / `--slab` (ui-kit.css, scoped to `.mb-ui`) govern the
  attendance and department screens. Both flip under `data-mb-theme="dark"`.
  Retune a token and every surface reading it follows.
- `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so
  **`next build` will not catch type errors**. Most files are `.js` anyway.
- shadcn/ui is configured (`components.json`) but nothing currently uses it —
  `npx shadcn@latest add <component>` will install into `components/ui/`.

## What is deliberately absent

No React Query (`app/providers.js` is a bare passthrough — don't reach for
`useQuery`). No test framework. No linter configured. No global voice assistant.
