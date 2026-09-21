// MATRUBHOOMI-HRMS/app/providers.js
//
// Wraps every route, so this is where the browser-side session is armed.
//
// Two things have to happen before any page runs its first fetch:
//
//   1. window.fetch is wrapped so requests to the backend carry the session as
//      an `Authorization: Bearer` header, not only as a cookie. In production
//      the backend is a different host, so that cookie is third-party and
//      Safari blocks it outright — see lib/authFetch.js.
//   2. The first-party `auth_token` cookie the server middleware reads is put
//      back if it went missing while the token itself is still live — see
//      lib/session.js.
//
// Both run at MODULE scope rather than in an effect. Child effects fire before
// a parent's, so a dashboard mounted inside this provider would already have
// sent its first unauthenticated request by the time an effect here ran. At
// module scope this executes when the client bundle is evaluated, which is
// before React renders anything.
"use client";

import { installSession } from "@/lib/authFetch";

/**
 * Send a recovered session back to the page it was originally trying to reach.
 *
 * The middleware bounces an unauthenticated request to "/?next=<path>". If the
 * only thing missing was the cookie — the token in localStorage is still good —
 * then arming the cookie has just made that request valid, and leaving the
 * person on the marketing home page after they typed a dashboard URL is the
 * same failure by a quieter route.
 *
 * Guarded three ways, because a redirect loop here would be worse than the bug:
 *   • only when the cookie was genuinely missing and has just been restored,
 *     never when it was already present — that bounce came from the server
 *     rejecting the token, and retrying it would loop;
 *   • only for a same-site absolute path — "//evil.example" is not one;
 *   • at most once per tab per destination.
 */
function recoverIntendedRoute(sessionState) {
  if (sessionState !== "restored") return;

  const { pathname, search } = window.location;
  if (pathname !== "/") return;

  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return;

  try {
    const KEY = "matrubhoomi_route_recovered";
    if (sessionStorage.getItem(KEY) === next) return;
    sessionStorage.setItem(KEY, next);
  } catch {
    // Storage blocked, so the once-only guard is not available. Decline the
    // convenience rather than risk a loop; the portal still works.
    return;
  }

  window.location.replace(next);
}

if (typeof window !== "undefined") {
  recoverIntendedRoute(installSession());
}

export function Providers({ children }) {
  return <div>{children}</div>;
}
