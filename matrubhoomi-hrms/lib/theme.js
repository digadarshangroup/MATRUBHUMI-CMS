// lib/theme.js
//
// The light/dark choice, and the script that applies it before first paint.
//
// WHY THIS LIVES IN THE ROOT LAYOUT AND NOT IN THE PORTAL
// ------------------------------------------------------
// The script was originally rendered inside the portal component. That works on
// a cold load of /onboarding and fails on a client-side transition into it —
// following a <Link> from the landing page does not re-run a component's inline
// script, so <html> never receives the attribute, the dark rules never match,
// and a dark-theme user gets the light page plus a toggle that reports "light".
// Run once from the document, it is correct however the visitor arrives.
//
// It has to be blocking and inline: anything deferred paints the wrong theme
// first, which is the flash this exists to prevent.

export const THEME_KEY = "mb_theme";

/**
 * Route prefixes pinned to light whatever the visitor remembers.
 *
 * Empty here, and the machinery is kept rather than deleted: the moment one
 * screen needs to be light-only — a printed register, a signed document
 * preview — the correction has to happen in this blocking script and not in
 * the component. A layout can only fix the theme after it mounts, which is one
 * painted frame too late: long enough to see the page flash dark first.
 */
export const LIGHT_ONLY_PREFIXES = [];

export const THEME_BOOTSTRAP =
  `(function(){try{` +
  `var p=location.pathname;` +
  `if(${JSON.stringify(LIGHT_ONLY_PREFIXES)}.some(function(x){return p===x||p.indexOf(x+"/")===0;})){` +
  `document.documentElement.setAttribute("data-mb-theme","light");return;}` +
  `var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}` +
  `document.documentElement.setAttribute("data-mb-theme",t);}catch(e){` +
  `document.documentElement.setAttribute("data-mb-theme","light");}})();`;

/** What the document currently says. Safe to call before hydration settles. */
export function currentTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-mb-theme") || "light";
}

/** Apply and remember a choice. */
export function applyTheme(next) {
  setThemeAttribute(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* private browsing / storage blocked — the session still gets the theme */
  }
}

/**
 * Apply a theme for THIS VIEW ONLY, without remembering it.
 *
 * The department shells mirror their own theme onto <html> so the global rail
 * matches the department beside it. Remembering that choice would push a theme
 * onto screens that were never designed for it — their hardcoded greys end up
 * on the wrong ground and the text washes out.
 */
export function setThemeAttribute(next) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-mb-theme", next);
}

/** The remembered choice, ignoring whatever a view has pinned on top of it. */
export function storedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}
