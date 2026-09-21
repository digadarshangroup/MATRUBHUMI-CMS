// components/shell/AppShell.js
//
// The persistent application frame. Mounted once, in the root layout.
//
// WHY IT IS HERE AND NOT INSIDE EACH DASHBOARD
// --------------------------------------------
// The rail used to live inside DepartmentGuard, which lives inside each
// department layout. That meant every department change unmounted the rail and
// mounted a new one — so the only way to move between departments was a full
// page load, and sliding the sidebar across was impossible by construction.
//
// Mounted at the root, the rail is OUTSIDE the part of the tree that swaps.
// Next keeps it mounted across a client-side navigation, so switching
// departments swaps only the content beside it. Nothing reloads, the rail never
// blinks, and the department slides in where the launcher was.
//
// WHY A CLIENT NAVIGATION IS SAFE HERE, WHEN IT WAS NOT AT SIGN-IN
// ----------------------------------------------------------------
// Sign-in still needs a hard navigation: the login response sets the session
// cookie, and a client transition can reach the next route's guard before the
// browser has committed it. Switching departments is different — the caller
// AWAITS the switch-department response, and by the time that promise resolves
// the browser has already processed its Set-Cookie. The cookie is in place
// before anything navigates, so there is no race left to lose.

"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import DepartmentRail from "@/components/shell/DepartmentRail";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Routes that are the door rather than a room. The rail is the furniture of the
 * signed-in application; on the way in it would be a switcher for somewhere the
 * visitor has not arrived yet.
 */
const BARE_PATHS = ["/", "/login", "/onboarding"];

function isBare(pathname) {
  if (!pathname) return true;
  return BARE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const bare = isBare(pathname);

  const [departments, setDepartments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.success) {
        setDepartments(data.departments || []);
        setCurrent(data.user?.deptSlug || null);
      } else {
        setDepartments([]);
        setCurrent(null);
      }
    } catch {
      setDepartments([]);
      setCurrent(null);
    } finally {
      setChecked(true);
    }
  }, []);

  // Re-read on every route change. The session's department changes as part of
  // switching, so the rail's "you are here" marker has to follow the route
  // rather than whatever was true when the app first loaded.
  useEffect(() => {
    load();
  }, [load, pathname]);

  // Release any leftover body scroll lock on route change. Many modals across
  // the app set document.body.style.overflow = "hidden" while open; if one is
  // open during a client-side navigation its cleanup never runs, and the next
  // page (which has no modal) arrives with scrolling permanently locked.
  useEffect(() => {
    if (document.body.style.overflow === "hidden")
      document.body.style.overflow = "";
  }, [pathname]);

  // The launcher and the sign-in pages render alone. So does anything reached
  // before the session check has answered — drawing a rail and then removing it
  // is worse than drawing it a moment late.
  if (bare || !checked || departments.length === 0) {
    return <>{children}</>;
  }

  return (
    <div className="g-shell">
      <DepartmentRail departments={departments} current={current} />
      {/* Keyed on the path so the content re-runs its entrance on each switch:
          the department that arrives moves in from the side the launcher left
          towards, which is what makes a swap read as one continuous place. */}
      <div key={pathname} className="g-shell-body g-enter">
        {children}
      </div>
    </div>
  );
}
