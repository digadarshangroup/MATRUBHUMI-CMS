// components/access/DepartmentGuard.js
//
// The authoritative half of the route guard.
//
// middleware.js already bounced anyone with no session cookie. That check is
// cheap and runs before the page is sent, but it only proves a cookie exists —
// not that it is valid, not that the account is still active, and not that this
// person belongs in THIS department.
//
// So this calls /api/auth/verify, which re-reads the user, their department and
// their assignment from the database on every request. A cookie copied from
// another machine, a session for someone who was deactivated ten seconds ago,
// or a Sales employee who typed /hr/dashboard all fail here.
//
// Wrap the body of each department's DashboardLayout:
//
//   <DepartmentGuard slug="hr">…</DepartmentGuard>
//
// `slug` is optional. Omitted, it only requires a valid session — useful for
// shared pages. Given, it also requires the session to belong to that
// department, which is the case that matters.
//
// DEPARTMENT CONTEXT
// ------------------
// Somebody can hold several departments. A session is only ever in ONE of them
// at a time, because the token carries a single role and the modules read it —
// which is why an employee whose primary department was HR arrived at
// Accounting and was told "You are: hr_manager" even though their accounting
// role was Owner.
//
// So a mismatch between the session's department and the one this dashboard
// belongs to is not automatically a denial. If they hold this department, the
// guard re-issues the session into it and carries on. Going back to HR switches
// back. The check that matters is unchanged and still happens on the server:
// switch-department re-reads the grant from the database and refuses a
// department they do not hold.

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { resetDeptRole } from "@/components/access/useDeptRole";
import { saveSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Keep the accounting module's token slot honest.
 *
 * The accounting client reads this key and sends it as an Authorization: Bearer
 * header. NEVER put the CMS token here as a fallback — it verifies, so the
 * module accepts it, and its role is the DEPARTMENT role ("accountant"), which
 * is how an Owner's sidebar came to read ACCOUNTANT. No accounting token means
 * the slot must be EMPTY, so the module falls back to its own cookie rather
 * than to a token that answers the wrong question.
 */
function syncAccountantToken(token) {
  try {
    if (token) localStorage.setItem("acc_token", token);
    else localStorage.removeItem("acc_token");
  } catch {
    /* private browsing / storage blocked */
  }
}

/**
 * @param softFail  Render the children when there is NO CMS session at all,
 *   instead of refusing. For areas that carry their own authentication — the
 *   accounting module, which can be signed into directly at /accountant/login
 *   by people who have no CMS session. There the guard's job is only to line
 *   the department context up when a CMS session DOES exist; refusing would
 *   break the module's own login. It still denies a session that exists and
 *   does not hold the department.
 */
export default function DepartmentGuard({ slug, softFail = false, children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState("checking"); // checking | ok | denied
  const [message, setMessage] = useState("");
  const [correctPath, setCorrectPath] = useState(null);

  // One switch attempt per mount. A second would be a loop: if the server
  // declines, verify still reports the old department and we would ask again.
  const switching = useRef(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        if (softFail) {
          // No CMS session — hand over to whatever authentication this area
          // runs itself.
          setState("ok");
          return;
        }
        // No valid session — back to the portal, remembering where they were
        // trying to go.
        //
        // The state is set to "denied" as well as redirecting. Leaving it on
        // "checking" left the spinner running forever whenever the navigation
        // did not actually move — a stale cookie on a protected route showed
        // "Confirming your access…" indefinitely with a 401 in the console and
        // no way out.
        setMessage(
          data?.message ||
            "Your session has expired or is not valid. Please sign in again.",
        );
        setState("denied");
        router.replace(`/?next=${encodeURIComponent(pathname)}`);
        return;
      }

      // A platform administrator can open any department. Everyone else is
      // held to their assignment.
      if (!slug || data.user?.isAdmin || data.user?.deptSlug === slug) {
        // /verify re-mints the module token every time, so this is where a
        // stale one gets replaced — including the case where the session was
        // ALREADY in this department and no switch ever ran.
        syncAccountantToken(data.accountantToken);
        setState("ok");
        return;
      }

      // They hold this department but the session is currently in another one.
      // Move it, rather than refusing access they actually have.
      const holdsIt = (data.departments || []).some((d) => d.slug === slug);
      if (holdsIt && !switching.current) {
        switching.current = true;
        const moved = await fetch(`${API_URL}/api/auth/switch-department`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        })
          .then((r) => r.json())
          .catch(() => null);

        if (moved?.success) {
          // The switch re-mints the CMS token for the NEW department. It has to
          // replace the stored one: that copy is sent as a Bearer header, which
          // the backend reads ahead of the cookie, so leaving the old one in
          // place would keep announcing the previous department and bounce the
          // person straight back out of the area they just switched into.
          saveSession(moved.token);
          syncAccountantToken(moved.accountantToken);
          // The session is now in a different department, so the cached role no
          // longer describes it — drop it and let the new screen re-resolve.
          resetDeptRole();
          setState("ok");
          return;
        }
      }

      setMessage(
        `You are signed in to ${data.user?.department || "another department"}, ` +
          `which does not have access to this area.`,
      );
      setCorrectPath(data.department?.dashboardPath || null);
      setState("denied");
    } catch {
      // The API being unreachable is not proof of anything, so do not sign the
      // user out over it — say so and let them retry.
      if (softFail) {
        setState("ok");
        return;
      }
      setMessage("Could not reach the server to confirm your session.");
      setState("denied");
    }
  }, [router, pathname, slug, softFail]);

  useEffect(() => {
    check();
  }, [check]);

  /**
   * OPTIMISTIC, NOT BLOCKING.
   *
   * This used to render a full-screen "Confirming your access…" spinner for
   * "checking" — on EVERY department switch, not just the first page load,
   * because a new DepartmentGuard mounts each time a different department's
   * layout does. For an admin (or anyone re-opening a department they were
   * already just in) that check almost always comes back "ok", so the
   * spinner was pure friction: a guaranteed flash of nothing between every
   * two clicks, for a check that was going to pass anyway.
   *
   * So "checking" now renders the children immediately, the same as "ok" —
   * the verify() call still runs, still re-reads the database, still is the
   * real enforcement (nothing about who is allowed to see what changed, see
   * the file header). It just no longer BLOCKS the page on a check that is
   * about to succeed. Only "denied" — the actual, comparatively rare case of
   * someone landing somewhere they don't hold — still interrupts, replacing
   * whatever was showing with the denial screen. The one thing given up is
   * that a genuinely unauthorized visit shows this department's CHROME for
   * the fraction of a second the check takes, rather than nothing; the
   * department's own data still comes from separately-guarded API calls
   * that refuse them regardless, so nothing real is exposed by that frame.
   */
  if (state === "denied") {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--aurora)" }}
      >
        <div className="max-w-sm w-full bg-card border border-border rounded-xl p-6 text-center shadow-sm">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">
            {correctPath ? "Not your department" : "Sign in required"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>

          <div className="mt-5 flex items-center justify-center gap-2">
            {correctPath && (
              <button
                onClick={() => router.replace(correctPath)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
              >
                Go to my dashboard
              </button>
            )}
            <button
              onClick={() => router.replace("/")}
              className="px-4 py-2 border border-border text-foreground rounded-lg text-sm hover:bg-muted"
            >
              Sign in as someone else
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Just the guard. The rail moved to the root layout (AppShell) so it survives
  // a client-side navigation — mounted here it was torn down and rebuilt on
  // every department change, which is exactly what made switching require a
  // full page load.
  return children;
}