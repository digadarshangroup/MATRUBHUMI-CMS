# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The Matrubhoomi Farms & Developers workforce system frontend — Next.js 16 App
Router, React 19. Its backend is **`matrubhoomi-hrms-backend`**, a separate repo
normally cloned as a sibling folder, running on `:5000`.

Read `README.md` first — it covers the three surfaces, the environment, and the
conventions. This file adds only what is easy to get wrong.

## Commands

```bash
npm run dev
npm run build
npm start
```

No tests, no linter. `next.config.mjs` sets `typescript.ignoreBuildErrors: true`
and `images.unoptimized: true`, so a green build proves the app compiles and
routes resolve — nothing more.

## Scope — read this before adding a folder under app/

Four surfaces: **HR**, the **executive office** (HR overview + access control),
the **employee portal**, and **Sales** (`app/sales/`) — leads, field
assignments, the form designer, and the field team on a map.

The executive side is NOT a mirror of HR. Every number on `/ceo/dashboard` is a
count that links through to the HR screen owning the detail. The moment a screen
here starts explaining a figure rather than pointing at it, there are two
implementations of the same question and they will drift apart. The same rule
governs `/sales/dashboard`, and the backend helps: `/api/sales/overview` returns
the FILTER that produced each figure, and the page turns that into the link — so
a count and the list it opens cannot disagree about what "overdue" meant.

**The sales module has a third client.** `matrubhoomi-field-app` (Kotlin,
sibling folder) renders the same form templates this designer produces. A field
type added to `components/sales/FormBuilder.js` that the app cannot draw is a
form the field team cannot fill — check `ui/screens/FormScreen.kt` before adding
one.

**`components/sales/TrackMap.js` draws a real map with no mapping library** —
web-mercator arithmetic, `<img>` tiles and one `<svg>` overlay. Do not replace it
with Leaflet to add a feature it already has; read its header first. The tile
host is `NEXT_PUBLIC_MAP_TILE_URL`, and it defaults to OpenStreetMap's, which is
fine for a handful of internal users and explicitly not fine at scale.

## Colour, and why not to hardcode it

Two token layers, one rule: **never write a hex value in a component.**

- `app/globals.css` declares `--g-*` — brand, ground, surfaces, ink, lines,
  status. It also aliases the shadcn names (`--background`, `--primary`, …) onto
  them, so there is a single source of colour truth. Retune `--g-brand` and
  every surface reading it follows, in both themes.
- `app/ui-kit.css` declares the measurement kit, scoped to `.mb-ui`. The
  attendance and department screens are built on it via
  `components/ceo/ui/Primitives.tsx` and read `--ck-*`, which alias onto the
  kit's own `--ink` / `--slab` / `--frost-*` tokens.

The palette comes off the company logo: deep field green is the brand and
carries every primary action; brick, water and harvest are accents, chart series
and status only. The ground is a neutral near-white and the surfaces are pure
white — it was a warm cream until the sales module landed, and the cream is not
coming back. See DESIGN.md for why, and do not reintroduce a tinted ground
"for warmth": it puts a yellow cast on every screen and makes white cards float
on the page instead of sitting in it.

Both layers flip under `data-mb-theme="dark"`, set on `<html>` by a blocking
script in the root layout before first paint. Dark is not an inversion: the
green lifts, because `#1F6B33` on a near-black ground is unreadable as a button
fill. Everything else in dark is neutral, for the same reason light is.

## The sharp edges

**Sign-in needs a HARD navigation.** The login response sets the session cookie,
and a client-side transition can reach the next route's guard before the browser
has committed it. Switching departments is different — the caller awaits the
switch-department response, so the cookie is in place before anything navigates.
`components/shell/AppShell.js` explains the distinction; do not "optimise" a
`window.location` into a `router.push` at sign-in.

**The rail lives in the ROOT layout, not in the dashboards.** Mounted inside a
department layout it unmounts on every navigation, which forces a full page load
on every department switch.

**`lib/company.js` is the only place the company's particulars live.** Name,
address, phone, CIN. They print on appointment letters, experience letters,
salary certificates and payslips. Every value is environment-overridable, and
several ship as `TO BE CONFIRMED` placeholders. Never add a second copy —
that is how two letterheads quietly start disagreeing.

**`lib/brandAssets.js` inlines the mark as base64 on purpose.** Every PDF
generator here composes in the BROWSER, and `pdf-lib`'s `embedPng` takes bytes,
never a URL. Inlining removes the fetch, so a letter looks the same offline.
`NEXT_PUBLIC_COMPANY_LOGO_BASE64` overrides it — that is how the full
illustrated logo should be supplied.

**PDF generation is spread across `pdf-lib` and `html2canvas`.** Check what a
neighbouring screen already uses before adding a third library.

## Backend coupling

Adding a department means touching BOTH repos — except it usually does not:
departments are created at runtime from Access Control, and a new one needs a
database row, not a folder here. Only a department that needs its own bespoke
screens needs code, and that is a product decision, not a routine one.

Every call goes to `NEXT_PUBLIC_API_URL` with `credentials: "include"`.
`lib/authFetch.js` additionally replays the token as `Authorization: Bearer`,
which is the path that actually works in development — Chrome refuses to store a
cross-origin cookie for `localhost:3000` → `localhost:5000`. Screens that use a
bare `fetch(..., { credentials: "include" })` work locally on the same host and
are the first suspect when auth fails only in production or only on one browser.
