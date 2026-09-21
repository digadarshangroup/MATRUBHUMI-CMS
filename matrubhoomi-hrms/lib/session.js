// lib/session.js
//
// One place that owns the CMS session token on the browser side.
//
// ─── WHY THIS EXISTS ──────────────────────────────────────────────────────────
// middleware.js runs on the SERVER (the edge) before any dashboard page is sent,
// and its only job is to check that an `auth_token` cookie exists. In production
// the frontend (hrms.matrubhoomifarms.in) and the backend (NEXT_PUBLIC_API_URL) are DIFFERENT
// hosts, and the backend sets its `auth_token` cookie without a Domain attribute
// — so that cookie is scoped to the BACKEND host and is invisible to the
// frontend. The middleware never sees it, so it bounces every logged-in user
// back to "/?next=…". That is the "login succeeds but sends me back" loop.
//
// It "works" on localhost only because :3000 and :5000 share the cookie host
// `localhost`, so there the backend cookie is visible to the middleware.
//
// The middleware cannot read localStorage (it is server-side). So the fix is to
// have the browser set its OWN first-party `auth_token` cookie on the frontend
// host after a successful login — a cookie the middleware CAN read — and to keep
// the same token in localStorage as a Bearer fallback for the client-side guard
// (DepartmentGuard → /api/auth/verify), which the backend already honours.
//
// Two independent proofs of session, so a failure of either still authenticates:
//   1. first-party cookie  → lets the server middleware through
//   2. localStorage token  → sent as `Authorization: Bearer` so /verify passes
//      even when the cross-site backend cookie is blocked (Safari ITP, strict
//      third-party cookie settings, or a backend on a wholly different domain).
//
// This cookie is NOT HttpOnly (JS has to be able to write it) and carries the
// same JWT already stored in localStorage — no new exposure beyond what the
// accountant module's acc_token already does. The token is still verified
// server-side on every request; the cookie is only a "a session exists" hint.
// ──────────────────────────────────────────────────────────────────────────────

// Must match middleware.js COOKIE and the backend COOKIE_NAME.
const COOKIE = "auth_token";

// Separate localStorage slot from the accountant module's "acc_token", which is
// deliberately reserved for the accounting org token only (see lib/api.js).
export const CMS_TOKEN_KEY = "cms_token";

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days — matches the JWT lifetime.

function onHttps() {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

/** Write the first-party cookie. Split out so restore paths reuse it verbatim. */
function writeCookie(token) {
  // SameSite=Lax is enough: the only reader is our own middleware on a same-site
  // top-level navigation, and Lax is sent for exactly that. Secure only when
  // actually on https, so localhost http still sets it.
  const secure = onHttps() ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(
    token,
  )}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/**
 * Seconds left on a JWT, or null when it carries no readable `exp`.
 *
 * Read, never trusted: the server verifies the signature on every request. This
 * only exists so the browser can avoid re-arming a cookie for a token that has
 * already died — a dead cookie satisfies the middleware, which then lets the
 * page render, and the guard bounces it straight back to "/?next=…". That is
 * the same loop this file exists to end, arriving by a different door.
 */
function secondsRemaining(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    if (typeof exp !== "number") return null;
    return exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

/** True when the token carries an `exp` that has already passed. */
function isExpired(token) {
  const left = secondsRemaining(token);
  return left !== null && left <= 0;
}

/**
 * Persist a freshly issued CMS session token.
 *
 * Writes BOTH the first-party cookie (for the server middleware) and the
 * localStorage copy (for the Bearer fallback). Call this everywhere a login,
 * a department switch, or a password change hands back a new `token`.
 */
export function saveSession(token) {
  if (typeof window === "undefined" || !token) return;

  try {
    localStorage.setItem(CMS_TOKEN_KEY, token);
  } catch {
    /* private browsing / storage blocked — the cookie below still carries it */
  }

  // First-party cookie on the frontend host, for the server middleware.
  //
  // On localhost this write is a no-op and that is correct: :3000 and :5000
  // share the cookie host `localhost`, the backend has already set an HttpOnly
  // `auth_token` there, and the browser refuses to let script overwrite an
  // HttpOnly cookie. The middleware reads the backend's copy, which is the same
  // token. Only in production — where the hosts differ and no such cookie
  // exists on the frontend — does this actually create anything.
  writeCookie(token);
}

/**
 * Put the first-party cookie back when localStorage still holds a live token.
 *
 * The two copies can fall out of step: a browser that clears cookies but not
 * site data on restart, a cookie reaching its max-age before the JWT reaches
 * its `exp`, or a session opened before this code shipped. Whenever that
 * happens the middleware sees nothing and bounces a perfectly valid session to
 * "/?next=…", which is indistinguishable to the person using it from being
 * signed out. Re-arming the cookie from the token we already hold repairs it
 * silently on the next page load.
 *
 * @returns {"ok"|"restored"|"expired"|"none"} what the session was found to be.
 */
export function ensureSessionCookie() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "none";
  }

  let stored = null;
  try {
    stored = localStorage.getItem(CMS_TOKEN_KEY);
  } catch {
    /* storage blocked — the cookie, if any, is all we have */
  }

  // An expired token must not be re-armed: that hands the middleware a pass for
  // a session the server will refuse, which is the bounce loop again.
  if (stored && isExpired(stored)) {
    clearSession();
    return "expired";
  }

  const hasCookie = new RegExp(`(?:^|;\\s*)${COOKIE}=`).test(document.cookie);
  if (hasCookie) return "ok";
  if (!stored) return "none";

  writeCookie(stored);
  return "restored";
}

/**
 * `Authorization` header for the CMS session, or an empty object when there is
 * none — spread straight into a fetch `headers`.
 */
export function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The current session token, preferring localStorage and falling back to the
 * first-party cookie if localStorage was cleared. Used to attach an
 * `Authorization: Bearer` header so verification survives a blocked cookie.
 */
export function getSessionToken() {
  if (typeof window === "undefined") return null;

  try {
    const fromStorage = localStorage.getItem(CMS_TOKEN_KEY);
    if (fromStorage) return fromStorage;
  } catch {
    /* fall through to the cookie */
  }

  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`),
    );
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

/** Wipe both copies. Call on logout, alongside the server /logout request. */
export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CMS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  const secure = onHttps() ? "; Secure" : "";
  document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}
