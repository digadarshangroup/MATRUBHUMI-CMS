// components/shell/DepartmentRail.js
//
// The department switcher that lives down the left edge of every dashboard.
//
// WHAT THIS REPLACES
// ------------------
// Opening a department used to mean leaving for a page with no way back except
// the browser, and switching meant returning to the portal first. The rail makes
// the set of departments a permanent part of the furniture: the icon you came
// in on stays visible, its neighbours are one click away, and the portal becomes
// somewhere you go on purpose rather than a toll gate.
//
// IT SHOWS ONLY WHAT YOU HOLD
// ---------------------------
// The portal shows all twelve departments, because it is also the explanation of
// what this system is. The rail shows the ones this account can actually open —
// two departments means two icons, not twelve with ten struck through. The list
// comes from /api/auth/verify, so it is the server's answer and not a guess.
//
// SWITCHING IS A SERVER OPERATION, NOT A LINK
// -------------------------------------------
// A session token carries ONE department, and every module reads its role from
// that token. So a click here re-issues the session through
// /api/auth/switch-department FIRST, and only then navigates — via router.push,
// a client-side transition, since this component lives in the root layout and
// survives the route change (see the comment at the push call below). That
// means nothing reloads the page for us, so `resetDeptRole()` is called
// explicitly right before the push: without it, useDeptRole()'s synchronous
// cache would hand the new department's first page the OLD department's
// role/isAdmin for at least one frame — and for anything gated behind its
// `loading` flag, that stale frame can be the only one anyone notices (this
// shipped once as exactly that bug: Settings and other approver-only nav items
// silently missing right after a switch, until something else forced a
// /verify refetch).

"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Loader2, LogOut } from "lucide-react";
import DepartmentIcon from "@/components/onboarding/DepartmentIcon";
import { signOut } from "@/lib/signOut";
import { saveSession } from "@/lib/session";
import { resetDeptRole } from "@/components/access/useDeptRole";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Long department names never fit under a 76px icon, and truncating them with an
 * ellipsis gives every long one the same unreadable ending. These are the names
 * people actually say out loud.
 */
const SHORT = {
  "Human Resources": "HR",
  "Executive Office": "Executive",
  "Project Manager": "Projects",
  "Store & Purchase": "Store",
  "MPC Measurement": "Measure",
  "Cutting Master": "Cutting",
  "Production Supervisor": "Production",
  "Quality Control": "Quality",
  "Packaging & Dispatch": "Dispatch",
};
function shortName(name = "") {
  return SHORT[name] || name;
}

/**
 * @param departments  tiles this account may open (from /api/auth/verify)
 * @param current      slug of the department currently open
 */
export default function DepartmentRail({ departments = [], current }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState("");
  // The logo toggles the department icons open/closed vertically — they drop
  // down from under the logo, not a width change. Shown by default; remembered.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("mb_rail_expanded") === "0") setExpanded(false); } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mb_rail_expanded", expanded ? "1" : "0"); } catch { /* private mode */ }
  }, [expanded]);

  const go = useCallback(
    async (dept) => {
      if (dept.slug === current || busy) return;
      setBusy(dept.slug);
      setFailed("");
      try {
        const res = await fetch(`${API_URL}/api/auth/switch-department`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: dept.slug }),
        });
        const data = await res.json().catch(() => null);

        if (data?.success) {
          // Replace the stored CMS token with the one just minted for the new
          // department. It travels as a Bearer header and outranks the cookie,
          // so a stale copy would keep naming the old department.
          saveSession(data.token);
          // Only the accounting module's own token belongs in this slot; the CMS
          // token verifies too but carries the DEPARTMENT role, which is what
          // made an Owner read as ACCOUNTANT. Absent means clear.
          try {
            if (data.accountantToken) localStorage.setItem("acc_token", data.accountantToken);
            else localStorage.removeItem("acc_token");
          } catch { /* private browsing */ }
          // Drop the cached role/isAdmin/deptSlug from the department we're
          // LEAVING — useDeptRole() reads its cache synchronously on mount, so
          // without this, every page in the new department renders its first
          // frame (and, for anything gated by `loading`, sometimes the only
          // frame anyone notices) with the OLD department's permissions. This
          // is a client-side route change (see below), not a full reload, so
          // nothing else clears that module-level cache for us.
          resetDeptRole();
          // Client navigation: this component is mounted in the root layout, so
          // it survives the route change and only the content beside it swaps.
          router.push(data.redirectTo || dept.dashboardPath || `/d/${dept.slug}`);
          return;
        }
        setFailed(data?.message || "Could not switch.");
      } catch {
        setFailed("Cannot reach the server.");
      } finally {
        setBusy(null);
      }
    },
    [current, busy],
  );

  // Always visible. The logo at the top toggles between a compact icon rail and
  // an expanded rail that shows every department's full name.

  return (
    <nav className={`g-rail g-sans ${expanded ? "is-expanded" : ""}`} aria-label="Departments">
      <button
        type="button"
        className="g-rail-logo"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Hide departments" : "Show departments"}
        aria-expanded={expanded}
        title="Departments"
      >
        <img src="/matrubhoomi-mark.svg" alt="Matrubhoomi" className="g-rail-logoimg" />
      </button>

      <div className="g-rail-list">
        <ul className="g-rail-items">
          {departments.map((dept) => {
            const active = dept.slug === current;
            return (
              <li key={dept.slug}>
                <button
                  type="button"
                  className={`g-rail-btn ${active ? "is-active" : ""}`}
                  onClick={() => go(dept)}
                  disabled={active || Boolean(busy)}
                  aria-current={active ? "page" : undefined}
                  aria-busy={busy === dept.slug || undefined}
                  title={active ? `${dept.name} — you are here` : `Switch to ${dept.name}`}
                >
                  {/* Named so the browser can morph THIS icon into the same icon
                      on the next page, across the full navigation. */}
                  <span
                    className="g-rail-ico"
                    style={{ viewTransitionName: `dept-${dept.slug}` }}
                  >
                    {/* flat: no plate, no tint — the glyph carries the colour */}
                    <DepartmentIcon dept={dept} size={18} flat bare />
                  </span>
                  {busy === dept.slug && (
                    <span className="g-rail-busy" aria-hidden="true">
                      <Loader2 size={14} className="g-spin" />
                    </span>
                  )}
                  {/* The name is ALWAYS on screen, under its icon. A rail of
                      bare glyphs makes people learn twelve pictograms; a hover
                      tooltip never appears on the tablets this runs on. */}
                  <span className="g-rail-name">{shortName(dept.name)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="g-rail-foot">
        <Link href="/onboarding" className="g-rail-btn is-plain">
          <span className="g-rail-glyph"><LayoutGrid size={16} /></span>
          <span className="g-rail-name">Apps</span>
        </Link>
        <button type="button" className="g-rail-btn is-plain" onClick={() => signOut()}>
          <span className="g-rail-glyph"><LogOut size={16} /></span>
          <span className="g-rail-name">Sign out</span>
        </button>
      </div>

      {failed && (
        <p className="g-rail-error" role="status">{failed}</p>
      )}

    </nav>
  );
}
