// lib/signOut.js
//
// One sign-out, used by every dashboard.
//
// There were eleven of these and they did not agree. Several removed a
// localStorage flag and navigated away — which signs nobody out: the session
// cookie is what the server reads, and it survived, so going back in the
// browser put you straight back in. One POSTed to the bare API root with no
// path at all, so it never reached the logout route.
//
// What actually has to happen, in order:
//
//   1. POST /api/auth/logout — the server revokes the session and clears BOTH
//      the CMS cookie and the accounting module's, which is derived from it.
//   2. Drop the module token this browser was holding. It is sent as a Bearer
//      header and outranks cookies, so leaving it behind keeps a signed-out
//      browser authenticated to the accounting module.
//   3. A HARD navigation, not router.push(). The cookies were just cleared on
//      another origin; a client-side transition can re-run a route guard
//      before the browser has committed that, which reads as a live session
//      and bounces the person back in.

import { clearSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** Legacy flags various dashboards set. Cleared so nothing reads them as truth. */
const LOCAL_FLAGS = ["isAuthenticated", "acc_token", "user", "userType", "matrubhoomi_dept_role"];

/**
 * End the session and go to the public home page.
 *
 * Home, not a login screen: signing out should land where a visitor lands,
 * not on something that immediately asks for the password again.
 *
 * @param destination  override for the rare caller that needs one
 */
export async function signOut(destination = "/") {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // The server being unreachable must not trap somebody in a signed-in UI.
    // Clearing locally and leaving is still the right move.
  }

  try {
    for (const key of LOCAL_FLAGS) localStorage.removeItem(key);
  } catch {
    /* private browsing / storage blocked */
  }

  // The CMS session proper: the localStorage token that is sent as a Bearer
  // header, and the first-party cookie the middleware reads. The server clearing
  // its own cookie above does not touch either — they live on THIS host — so
  // without this the middleware would keep waving a signed-out browser through
  // to dashboards, and the Bearer header would keep authenticating its requests
  // until the token expired a week later.
  clearSession();

  window.location.assign(destination);
}

export default signOut;
