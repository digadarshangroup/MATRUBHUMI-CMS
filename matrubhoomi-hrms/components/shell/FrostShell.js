// components/shell/FrostShell.js
//
// THE shell. One implementation, every department.
//
// This is the "change it once" layer the CMS was missing: HR and the CEO side
// render the same component with different nav configs, so a change to the
// chrome — spacing, the theme toggle, the mobile drawer, the way the field is
// mounted — lands on both at once. Converting the next department means writing
// a nav array, not another layout.
//
// It provides the two upper materials of "Chrome Under Frost" (app/mb-ui.css):
// the FIELD behind everything, mounted exactly once, and the FROST bars that
// carry the navigation. Pages supply the content.
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowLeft, ChevronDown, LogOut, Menu, Moon, Sun, Zap, ZapOff } from "lucide-react";
import DepartmentGuard from "@/components/access/DepartmentGuard";
import DepartmentIcon from "@/components/onboarding/DepartmentIcon";
import { signOut } from "@/lib/signOut";
import { setThemeAttribute } from "@/lib/theme";
import { IridescentField } from "@/components/ceo/ui/IridescentField";

/**
 * Theme + performance for a department subtree.
 *
 * Both live on the shell element rather than <html>: only these subtrees use
 * this system, and the app already runs its own `data-mb-theme` bootstrap for
 * everything else.
 *
 * `defaultPerf` matters. HR runs on low-end machines, so it opens with the
 * effects off and the field never mounts; the CEO side opens with them on. The
 * kit is explicit that this is offered, never imposed — a core count says
 * nothing about the GPU — so whatever the person chooses is remembered and wins
 * over the default from then on.
 *
 * `forcePerf` is the escape hatch from that last sentence, for a shell that
 * removed the control entirely (Sales — see Sales_DashboardLayout.js). With
 * no toggle in the UI, an old stored preference can never be changed back,
 * so it must never be read either: forcing pins `perf` to the given value
 * and skips the localStorage lookup and the toggle both, rather than merely
 * overriding the read result — a `sales_perf: "low"` written before the
 * toggle was removed would otherwise still silently win.
 */
// Light/dark is ONE app-wide preference, shared across every scope (onboarding,
// login, and each department shell). Picking dark on the onboarding launcher
// carries into every page you open (13 Aug 2026). `perf` stays per-scope — only
// the theme is unified. This changes only where the shell reads/writes its own
// theme choice; the per-view `setThemeAttribute` (and its accountant-module
// safeguard) below is untouched.
const SHARED_THEME_KEY = "mb_theme";

export function useShellChrome({ scope, defaultTheme = "light", defaultPerf = "low", forcePerf }) {
  const themeKey = SHARED_THEME_KEY;
  const perfKey = `${scope}_perf`;

  // Read the stored preference in the useState INITIALIZER, not in an effect.
  // An effect runs AFTER the first paint, so the page briefly rendered with
  // `defaultTheme`/`defaultPerf` and then, a frame later, flipped to whatever
  // was actually stored — a visible flash on every single navigation for
  // anyone whose saved theme differed from the default. A lazy initializer
  // runs synchronously during the FIRST render, before anything paints, so
  // the correct value is what shows up in the first place.
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(themeKey);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* storage blocked */
    }
    return defaultTheme;
  });
  const [perf, setPerf] = useState(() => {
    if (forcePerf) return forcePerf;
    try {
      const saved = localStorage.getItem(perfKey);
      if (saved === "low" || saved === "high") return saved;
    } catch {
      /* storage blocked */
    }
    return defaultPerf;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `theme-ready` arms the colour-transition CSS class. Arming it in the
    // same tick as the initial paint would let the transition catch that
    // paint and animate it, so it still waits one frame — but that's the
    // only thing left in this effect; theme/perf themselves are already
    // correct from the lazy initializers above.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * Mirror the department's theme onto the APP theme — for this view only.
   *
   * The 64px department rail down the left edge is mounted by the root layout,
   * outside this shell, and reads the flat `--g-*` palette that flips on
   * `<html data-mb-theme>`. Without this the rail stayed white next to a dark
   * department — one screen, two themes.
   *
   * Deliberately NOT persisted. This used to call `applyTheme`, which also
   * writes the choice to storage, and that pushed dark onto every module still
   * on the flat system — including the accountant module, which has no dark
   * design, so its hardcoded greys landed on dark surfaces and ledger figures
   * washed out. The rail follows the department; the CMS-wide preference stays
   * whatever the user actually chose in a department that supports both.
   */
  useEffect(() => {
    setThemeAttribute(theme);
  }, [theme]);

  // Seed the app-wide theme from the FIRST page a user opens if none is stored
  // yet — so onboarding/login's dark default becomes the shared preference and
  // carries into the department pages, not just an explicit toggle. Runs once.
  useEffect(() => {
    try {
      if (localStorage.getItem(SHARED_THEME_KEY) == null) {
        localStorage.setItem(SHARED_THEME_KEY, theme);
      }
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  };

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      write(themeKey, next);
      return next;
    });

  const togglePerf = () => {
    // No control drives this while perf is forced (Sales' header has no
    // effects button to call it from) — a no-op rather than a toggle that
    // would quietly start reading from storage again.
    if (forcePerf) return;
    setPerf((p) => {
      const next = p === "low" ? "high" : "low";
      write(perfKey, next);
      return next;
    });
  };

  return { theme, toggleTheme, perf: forcePerf || perf, togglePerf, ready };
}

function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span data-figure className="hidden text-xs text-ink-faint sm:block" suppressHydrationWarning>
      {now
        ? `${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${now.toLocaleTimeString("en-IN", { hour12: false })}`
        : ""}
    </span>
  );
}

/**
 * @param {object}   props
 * @param {string}   props.scope        storage prefix, e.g. "ceo" | "hr" | "store"
 * @param {string}   props.brand        product name in the shell head
 * @param {string}   props.department   department name under it
 * @param {string}   props.badge        the pill in the top bar, e.g. "CEO access"
 * @param {Array}    props.nav          nav config (see below)
 * @param {string}   props.activeMenu   key of the current page
 * @param {string}   [props.defaultPerf] "low" to open with effects off — a
 *        rememberable default; the person can still change it. See
 *        `forcePerf` for a shell that has removed the means to.
 * @param {string}   [props.forcePerf] pins performance mode to this value —
 *        "high" or "low" — ignoring and never reading any stored
 *        preference. For a shell with no effects toggle in its header
 *        (Sales — see Sales_DashboardLayout.js): a stored value from before
 *        the toggle was removed must not be able to silently reassert
 *        itself with nothing left in the UI to undo it. Takes over
 *        `defaultPerf` entirely when set.
 * @param {"side"|"top"} [props.variant] where the navigation lives
 * @param {ReactNode} [props.extras]    extra top-bar controls, before the toggles
 * @param {string}   [props.appLogoSlug]     opt-in, top-nav only. A department
 *        slug (matching components/onboarding/DepartmentIcon's BY_SLUG) draws
 *        that department's own mark at the header's far left. It normally
 *        shows the mark; on hover/focus it swaps to a back-arrow that links to
 *        `/onboarding` ("Back to apps"), Odoo's app-switcher interaction, not
 *        its visuals — the mark, colours, radius and motion are this kit's
 *        own. Omitted (the default, every consumer but Sales) renders nothing
 *        here, exactly as before this prop existed.
 * @param {boolean}  [props.minimalControls] opt-in, top-nav only. Keeps the
 *        light/dark toggle on the right plus any explicit `extras`; drops the
 *        clock, `badge` and the effects/sign-out buttons. Off by default, so
 *        every consumer but the one that opts in is unaffected. See
 *        `showPerfToggle` to keep the effects button even with this on.
 * @param {boolean}  [props.showPerfToggle] whether the effects on/off button
 *        renders, independent of `minimalControls`. Defaults to
 *        `!minimalControls` (unset ⇒ follows minimalControls exactly as
 *        before this prop existed), so pass `true` explicitly to show the
 *        toggle alongside an otherwise-minimal control set — Sales does this
 *        so people can turn effects off on a slower machine without getting
 *        the clock/badge/sign-out back too. Has no effect if `forcePerf` is
 *        also set — `togglePerf` is a no-op in that case regardless of
 *        whether the button is visible.
 * @param {boolean}  [props.spreadNav] opt-in, top-nav only. Widens the gap
 *        between nav items (a fixed larger `gap`, not `justify-between` —
 *        see the comment at its one call site for why) so a short nav set
 *        reads as filling the bar instead of bunching at the left edge with
 *        empty space before the right-side controls. Off by default; every
 *        existing consumer keeps the packed `gap-1` layout it already has.
 *
 * Nav config — one array, three shapes:
 *   { key, name, href, icon }                              a link
 *   { key, name, icon, children:[{key,name,href,icon}] }    a group
 *   { section: "People" }                                   a heading (side only)
 *
 * `variant` is a layout choice, not a second implementation: both variants read
 * the same nav config and the same chrome, so a department can move its
 * navigation from the side to the top by changing one prop.
 */
/**
 * A top-bar group and its dropdown.
 *
 * The menu is PORTALLED to <body> rather than positioned inside the bar. The
 * nav strip carries `overflow-x-auto` so a long nav set scrolls instead of
 * wrapping — and an overflow container clips absolutely-positioned
 * descendants, so the dropdown was being cut to nothing. It opened, it just
 * could not be seen, which read as "the pages are gone".
 *
 * Portalling means the menu is positioned against the viewport, so it also
 * has to be re-placed on scroll and resize, and flipped when it would run off
 * the right edge.
 */
function TopGroup({ item, openMenu, setOpenMenu, activeMenu, groupHoldsActive, theme, perf }) {
  const btnRef = useRef(null);
  const open = openMenu === item.key;
  const active = groupHoldsActive(item);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 240;
      const left = Math.min(r.left, window.innerWidth - width - 12);
      setPos({ top: r.bottom + 8, left: Math.max(12, left), width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div className="shrink-0" data-topmenu>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenMenu(open ? null : item.key)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium tracking-[-0.012em] transition-[color,background-color] duration-[180ms] ${
          active || open
            ? "bg-ink text-[var(--body-bg)]"
            : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
        }`}
      >
        {item.icon ? <item.icon size={14} className="shrink-0" /> : null}
        {item.name}
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-[180ms] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            /* The portalled node leaves the shell, so it carries `.mb-ui`
               and the theme attributes itself — otherwise none of the tokens
               resolve out here. */
            <div className="mb-ui" data-theme={theme} data-perf={perf === "low" ? "low" : undefined}>
              <div
                role="menu"
                data-topmenu
                style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
                className="frost-bar z-[70] rounded-inset border border-hairline p-1.5"
              >
                {item.children.map((c) => (
                  <Link
                    key={c.key}
                    href={c.href}
                    role="menuitem"
                    onClick={() => setOpenMenu(null)}
                    aria-current={activeMenu === c.key ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-medium transition-colors ${
                      activeMenu === c.key
                        ? "bg-[var(--control)] text-ink"
                        : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"
                    }`}
                  >
                    {c.icon ? <c.icon size={14} className="shrink-0" /> : null}
                    <span className="truncate">{c.name}</span>
                  </Link>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Top header's far-left "back to apps" control (opt-in — see `appLogoSlug`
 * on FrostShell). Odoo's app-switcher puts the same idea in the same corner:
 * a home mark that swaps to a way out on hover. Only the INTERACTION is
 * borrowed — the mark itself is this department's own DepartmentIcon (same
 * glyph, colour and plate shape used on its rail button and onboarding tile),
 * and the reveal is this kit's own control styling (`--control` wash, the
 * header's existing icon-button size), not Odoo's.
 */
function BackToAppsControl({ slug }) {
  return (
    <Link
      href="/onboarding"
      aria-label="Back to apps"
      title="Back to apps"
      className="group relative inline-flex h-9 w-9 shrink-0"
    >
      <DepartmentIcon
        dept={{ slug }}
        size={36}
        flat
        className="transition-opacity duration-[180ms] group-hover:opacity-0 group-focus-visible:opacity-0"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center rounded-[10px] bg-[var(--control)] text-ink-muted opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 group-hover:text-ink group-focus-visible:opacity-100 group-focus-visible:text-ink"
      >
        <ArrowLeft size={16} />
      </span>
    </Link>
  );
}

function FrostShellInner({
  scope,
  brand,
  department,
  badge,
  nav,
  activeMenu,
  defaultPerf,
  forcePerf,
  variant = "side",
  extras,
  appLogoSlug,
  minimalControls = false,
  showPerfToggle,
  spreadNav = false,
  children,
}) {
  const topNav = variant === "top";
  const { theme, toggleTheme, perf, togglePerf, ready } = useShellChrome({
    scope,
    defaultPerf,
    forcePerf,
  });
  // Independent of minimalControls' clock/badge/sign-out bundle — a consumer
  // can keep those simplified while still giving people a way to turn effects
  // off (see Sales_DashboardLayout.js, which does exactly that). Defaults to
  // following minimalControls, so every other existing consumer is unaffected.
  const resolvedShowPerfToggle = showPerfToggle ?? !minimalControls;

  const groupHoldsActive = (item) => item.children?.some((c) => c.key === activeMenu);

  // Groups open when they contain the current page. Held in one map so adding a
  // group to a nav config needs no extra state here.
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    for (const item of nav) if (item.children && groupHoldsActive(item)) initial[item.key] = true;
    return initial;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  // Top-nav dropdowns are one-at-a-time and close on an outside click or Escape,
  // which a hover menu cannot do accessibly.
  const [openMenu, setOpenMenu] = useState(null);
  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (e) => {
      if (!e.target.closest?.("[data-topmenu]")) setOpenMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);


  const NavLink = ({ href, icon: Icon, label, active, sub, badge: itemBadge }) => (
    <Link
      href={href}
      onClick={closeDrawer}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-full px-3 ${
        sub ? "py-1.5 text-[13px]" : "py-2 text-sm"
      } font-medium tracking-[-0.012em] transition-[color,background-color] duration-[180ms] ease-[var(--ease-deck)] ${
        active
          ? "bg-[var(--control)] text-ink"
          : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
      }`}
    >
      {Icon ? <Icon size={sub ? 14 : 15} className="shrink-0" /> : null}
      <span className="truncate">{label}</span>
      {itemBadge ? (
        <span className="ml-auto shrink-0 rounded-full bg-[var(--control-active)] px-1.5 py-px text-[10px] font-medium text-ink">
          {itemBadge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div
      className={`mb-ui relative min-h-screen ${ready ? "theme-ready" : ""}`}
      data-theme={theme}
      data-perf={perf === "low" ? "low" : undefined}
    >
      {/* The ground and the field, mounted exactly once. The ground carries the
          backdrop because <body> belongs to the departments still on --g-*. */}
      <div className="mb-ground" aria-hidden="true" />
      <IridescentField />

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-black/45 deck:hidden"
        />
      )}

      {/* ══════════════════ TOP-NAV VARIANT ══════════════════
          One bar carries brand, navigation and controls. Groups become
          dropdowns rather than the sidebar's inline expansion, because a
          horizontal bar has no room to push siblings down. */}
      {topNav && (
        <div className="flex min-h-screen flex-col">
          {/* Floating, not docked — the kit's own bar is inset from the top
              AND both sides with visible field/gap around it, no border, and
              rounded all the way round. A full-bleed bar flush to all three
              edges reads as an attached panel no matter how the fill/border
              is tuned; the inset is what actually makes it float. `mt-3`
              covers the resting position, `top-3` keeps the same inset once
              `sticky` engages on scroll. */}
          <header className="frost-bar sticky top-3 z-40 mx-3 mt-3 rounded-panel">
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5 deck:px-6">
              {/* Opt-in only (see `appLogoSlug` on FrostShell) — every other
                  consumer of this header renders nothing here, unchanged. */}
              {appLogoSlug && <BackToAppsControl slug={appLogoSlug} />}

              <button
                type="button"
                onClick={() => setDrawerOpen((v) => !v)}
                aria-label="Toggle navigation"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink deck:hidden"
              >
                <Menu size={16} />
              </button>

              {/* No brand mark here otherwise, deliberately — it duplicated
                  the breadcrumb below and the department rail to the left,
                  and that bar spends its space on nav, not identity.
                  `brand`/`department` still reach the mobile drawer, which
                  has no other persistent context when it's open full-screen. */}

              {/* The nav itself. `rail` hides the scrollbar so a long nav set
                  scrolls without chrome rather than wrapping the bar.
                  `spreadNav` (opt-in) widens the gap between items instead of
                  the default packed `gap-1`, so a short nav set reads as
                  filling the bar rather than bunched at the left. A plain
                  wider `gap` on purpose, not `justify-between`: with only a
                  few items of uneven width (a plain link next to the wider
                  "Customers ⌄" group), space-between's own logic put more air
                  in the middle than at the ends, which read as lopsided
                  rather than "full". A fixed gap is even everywhere by
                  construction. Every other consumer keeps `gap-1` exactly as
                  before. */}
              <nav
                className={`rail flex min-w-0 flex-1 items-center overflow-x-auto max-deck:hidden ${
                  spreadNav ? "gap-7" : "gap-1"
                }`}
              >
                {nav
                  .filter((i) => !i.section)
                  .map((item) => {
                    if (!item.children)
                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          aria-current={activeMenu === item.key ? "page" : undefined}
                          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium tracking-[-0.012em] transition-[color,background-color] duration-[180ms] ${
                            activeMenu === item.key
                              ? "bg-ink text-[var(--body-bg)]"
                              : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
                          }`}
                        >
                          {item.icon ? <item.icon size={14} className="shrink-0" /> : null}
                          {item.name}
                        </Link>
                      );

                    return (
                      <TopGroup
                        key={item.key}
                        item={item}
                        openMenu={openMenu}
                        setOpenMenu={setOpenMenu}
                        activeMenu={activeMenu}
                        groupHoldsActive={groupHoldsActive}
                        theme={theme}
                        perf={perf}
                      />
                    );
                  })}
              </nav>

              <div className="flex-1 deck:hidden" />

              <div className="flex shrink-0 items-center gap-1.5">
                {/* `minimalControls` (opt-in) keeps only the theme toggle plus
                    any explicit `extras` a consumer chose to add — every other
                    consumer renders this whole row exactly as before. */}
                {!minimalControls && <Clock />}
                {!minimalControls && badge ? (
                  <span className="rounded-full bg-[var(--control)] px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase max-deck:hidden">
                    {badge}
                  </span>
                ) : null}
                {extras}
                {resolvedShowPerfToggle && (
                  <button
                    type="button"
                    onClick={togglePerf}
                    aria-pressed={perf === "low"}
                    aria-label={perf === "low" ? "Turn on visual effects" : "Turn off visual effects for speed"}
                    title={
                      perf === "low"
                        ? "Effects off — tap for the full look"
                        : "Effects on — tap for faster scrolling on a slower machine"
                    }
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--control)] hover:text-ink ${
                      perf === "low" ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    {perf === "low" ? <ZapOff size={15} /> : <Zap size={15} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
                  title={theme === "dark" ? "Light" : "Dark"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                >
                  {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                {!minimalControls && (
                  <button
                    type="button"
                    onClick={() => signOut()}
                    aria-label="Sign out"
                    title="Sign out"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                  >
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* Below `deck` the same nav config becomes a drawer, so a phone gets
              the full set rather than a truncated bar. */}
          <aside
            className={`frost-bar fixed top-0 bottom-0 left-0 z-50 flex w-[min(288px,86vw)] flex-col border-r border-hairline transition-transform duration-[280ms] ease-[var(--ease-out-expo)] deck:hidden ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[15px] font-medium text-[var(--body-bg)]">
                G
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium tracking-[-0.02em] text-ink">{brand}</p>
                <p className="truncate text-[10px] tracking-[0.12em] text-ink-faint uppercase">
                  {department}
                </p>
              </div>
            </div>
            <nav className="rail flex-1 overflow-y-auto px-3 pt-3 pb-5">
              {nav.map((item, i) => {
                if (item.section)
                  return (
                    <p
                      key={`sec-${i}`}
                      className="px-3 pt-5 pb-1.5 text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase"
                    >
                      {item.section}
                    </p>
                  );
                if (!item.children)
                  return (
                    <NavLink
                      key={item.key}
                      href={item.href}
                      icon={item.icon}
                      label={item.name}
                      active={activeMenu === item.key}
                    />
                  );
                return (
                  <div key={item.key}>
                    <p className="px-3 pt-4 pb-1 text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase">
                      {item.name}
                    </p>
                    <div className="ml-2 flex flex-col gap-0.5 border-l border-hairline pl-2.5">
                      {item.children.map((c) => (
                        <NavLink
                          key={c.key}
                          href={c.href}
                          icon={c.icon}
                          label={c.name}
                          active={activeMenu === c.key}
                          sub
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      )}

      {/* ══════════════════ SIDE-NAV VARIANT ══════════════════ */}
      {!topNav && (
      <>
      <aside
        className={`frost-bar fixed top-0 bottom-0 left-[var(--g-rail-w,64px)] z-50 flex w-[252px] flex-col border-r border-hairline transition-transform duration-[280ms] ease-[var(--ease-out-expo)] max-deck:left-0 max-deck:w-[min(288px,86vw)] ${
          drawerOpen ? "translate-x-0" : "max-deck:-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[15px] font-medium text-[var(--body-bg)]">
            G
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium tracking-[-0.02em] text-ink">{brand}</p>
            <p className="truncate text-[10px] tracking-[0.12em] text-ink-faint uppercase">
              {department}
            </p>
          </div>
        </div>

        <nav className="rail flex-1 overflow-y-auto px-3 pt-3 pb-5">
          {nav.map((item, i) => {
            if (item.section)
              return (
                <p
                  key={`sec-${i}`}
                  className="px-3 pt-5 pb-1.5 text-[10px] font-medium tracking-[0.14em] text-ink-faint uppercase"
                >
                  {item.section}
                </p>
              );

            if (item.children) {
              const open = Boolean(openGroups[item.key]);
              const Icon = item.icon;
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenGroups((g) => ({ ...g, [item.key]: !g[item.key] }))}
                    className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium tracking-[-0.012em] transition-[color,background-color] duration-[180ms] ease-[var(--ease-deck)] ${
                      groupHoldsActive(item)
                        ? "text-ink"
                        : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
                    }`}
                  >
                    {Icon ? <Icon size={15} className="shrink-0" /> : null}
                    <span className="flex-1 truncate text-left">{item.name}</span>
                    <ChevronDown
                      size={13}
                      className={`shrink-0 transition-transform duration-[180ms] ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="mt-1 ml-4 flex flex-col gap-0.5 border-l border-hairline pl-2.5">
                      {item.children.map((c) => (
                        <NavLink
                          key={c.key}
                          href={c.href}
                          icon={c.icon}
                          label={c.name}
                          active={activeMenu === c.key}
                          sub
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.key}
                href={item.href}
                icon={item.icon}
                label={item.name}
                badge={item.badge}
                active={activeMenu === item.key}
              />
            );
          })}
        </nav>

        <div className="border-t border-hairline px-3 py-3">
          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col deck:ml-[252px]">
        {/* Same reasoning as the top-nav header: no border-bottom, so the bar
            floats over the field rather than reading as a docked panel. */}
        <header className="frost-bar sticky top-0 z-40 flex items-center gap-3 px-4 py-2.5 deck:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Toggle navigation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink deck:hidden"
          >
            <Menu size={16} />
          </button>
          <div className="flex-1" />
          <Clock />
          {badge ? (
            <span className="rounded-full bg-[var(--control)] px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">
              {badge}
            </span>
          ) : null}
          {extras}
          <button
            type="button"
            onClick={togglePerf}
            aria-pressed={perf === "low"}
            aria-label={perf === "low" ? "Turn on visual effects" : "Turn off visual effects for speed"}
            title={
              perf === "low"
                ? "Effects off — tap for the full look"
                : "Effects on — tap for faster scrolling on a slower machine"
            }
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--control)] hover:text-ink ${
              perf === "low" ? "text-ink" : "text-ink-muted"
            }`}
          >
            {perf === "low" ? <ZapOff size={15} /> : <Zap size={15} />}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
            title={theme === "dark" ? "Light" : "Dark"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * The shell plus its access check. DepartmentGuard verifies the session against
 * the server before any chrome is drawn, so nothing renders to someone who only
 * knows the URL.
 */
export default function FrostShell({ guardSlug, ...props }) {
  return (
    <DepartmentGuard slug={guardSlug}>
      <FrostShellInner {...props} />
    </DepartmentGuard>
  );
}
