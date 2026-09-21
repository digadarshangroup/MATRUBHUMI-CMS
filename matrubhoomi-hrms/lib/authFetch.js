// lib/authFetch.js
//
// Attaches the CMS session token to every request this app makes to the backend.
//
// ─── WHY A WRAPPER AND NOT 1,000 EDITS ────────────────────────────────────────
// Roughly a thousand call sites in this repo do the same thing:
//
//     fetch(`${API_URL}/api/…`, { credentials: "include" })
//
// which is to say: they authenticate with the `auth_token` cookie and nothing
// else. That works when the frontend and the backend share a host — as they do
// on localhost, where :3000 and :5000 are both `localhost` — and it fails
// everywhere else, because in production hrms.matrubhoomifarms.in and the backend are
// different hosts and that cookie is a THIRD-PARTY cookie.
//
// Safari has blocked third-party cookies outright for years (which is why "it
// breaks on Mac"), Chrome blocks them for anyone who has ever ticked the
// setting, and every browser drops them if the response is not
// `SameSite=None; Secure`. When it is blocked the request arrives with no
// credentials at all and the backend answers 401 — so the dashboard loads and
// then every panel on it fails.
//
// The backend already accepts `Authorization: Bearer <token>` ahead of the
// cookie on its auth paths. So rather than edit a thousand call sites — and
// rather than miss the ones added tomorrow — this wraps `window.fetch` once and
// adds that header to requests aimed at the backend. Nothing calls this
// directly; every existing `fetch` keeps working and simply starts carrying
// credentials that survive a blocked cookie.
//
// ─── WHAT IT DELIBERATELY DOES NOT TOUCH ──────────────────────────────────────
//   • Requests to anywhere other than NEXT_PUBLIC_API_URL — Cloudinary, Google,
//     Firebase, the app's own /api routes. Leaking a session token to a third
//     party would be a far worse bug than the one being fixed.
//   • /api/accountant/* — that module carries its OWN token (localStorage
//     "acc_token", sent by lib/api.js). Sending the CMS token there is exactly
//     what once made an Owner's sidebar read the department role instead of
//     "owner"; the Bearer header outranks the accountant_token cookie.
//   • Any request that already set an Authorization header. A caller that chose
//     a credential outranks a default.
//   • Request objects (as opposed to URL strings). Rebuilding one to inject a
//     header risks disturbing a streaming or multipart body, and no call site
//     here passes one.

import { getSessionToken, ensureSessionCookie } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** Module-owned paths that must never receive the CMS token. */
const SKIP_PREFIXES = ["/api/accountant"];

let installed = false;

/** The backend's origin, resolved once against the current page. */
function backendOrigin() {
  try {
    return new URL(API_URL, window.location.href).origin;
  } catch {
    return null;
  }
}

function shouldAttach(url, origin) {
  if (!origin || url.origin !== origin) return false;
  return !SKIP_PREFIXES.some(
    (p) => url.pathname === p || url.pathname.startsWith(`${p}/`),
  );
}

/**
 * Wrap `window.fetch`. Safe to call repeatedly — only the first call binds, so
 * a re-render or a second import cannot stack wrappers on top of each other.
 */
export function installAuthFetch() {
  if (installed) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const origin = backendOrigin();
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function authedFetch(input, init) {
    // Any failure in here must fall through to a normal request rather than
    // break the page: this sits in front of every network call in the app.
    try {
      if (typeof input !== "string" && !(input instanceof URL)) {
        return nativeFetch(input, init);
      }

      const url = new URL(String(input), window.location.href);
      if (!shouldAttach(url, origin)) return nativeFetch(input, init);

      const headers = new Headers(init?.headers || undefined);
      if (headers.has("authorization")) return nativeFetch(input, init);

      const token = getSessionToken();
      if (!token) return nativeFetch(input, init);
      headers.set("Authorization", `Bearer ${token}`);

      // credentials first so an explicit `init.credentials` still wins; it is a
      // default for the handful of call sites that forgot it, not an override.
      return nativeFetch(input, { credentials: "include", ...init, headers });
    } catch {
      return nativeFetch(input, init);
    }
  };
}

/**
 * Everything the browser has to do once, at boot, for the session to hold.
 *
 * Called from app/providers.js, which wraps every route.
 *
 * @returns {"ok"|"restored"|"expired"|"none"} the state the session was found
 *   in, so the caller can tell a genuine cookie/token desync ("restored") from
 *   a session that was already intact or already gone.
 */
export function installSession() {
  const state = ensureSessionCookie();
  installAuthFetch();
  return state;
}

export default installAuthFetch;
