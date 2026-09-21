// components/onboarding/DepartmentPortal.js
//
// /onboarding renders this — the signed-in application launcher, and the
// gate that sends a signed-out visitor to /login.
//
// SQUARE-GRID LAUNCHER (12 Aug 2026). Replaces the honeycomb/hex-field
// launcher this file rendered for a few weeks — that design turned out to
// cost real GPU/VRAM on ordinary machines (see IridescentField's own doc
// comment) badly enough that it was reported as crashing a workstation, and
// separately read as visually broken rather than "a product." This restores
// the plain, light, business-software register (Odoo/Zoho family) the app
// used before the hex experiment: a bordered white page, a heading, and a
// responsive grid of square department tiles — the same register
// app/login/page.js's sign-in form now uses too, so the two screens read as
// one product rather than two different design eras stitched together.
//
// WHAT DIDN'T CHANGE
// -------------------
// Every real call this page already made: POST /api/auth/verify on mount,
// POST /api/auth/switch-department when a tile opens, POST /api/auth/logout on
// sign-out, saveSession()/clearSession(), the accountant-token bridge, and
// ChangePasswordCard (still posts to /api/auth/change-password, and no
// longer even asks for the current password — see that file). The
// session-establishment gate is unchanged: redirect to /login the moment
// `ready && !session`, so this route never renders a second sign-in card of
// its own.
//
// WHAT DID CHANGE, beyond the visual register: no more 18-slot cap or
// "+N more" overflow popover. That limit was a honeycomb-geometry constraint
// (two rings, six-then-twelve cells) with no equivalent in a plain grid — a
// grid just grows another row, so every department this account holds is
// shown, always, with no hidden ones to click through to.
//
// SECURITY
// --------
// The tile list itself is the access decision — it comes straight from the
// server-verified session, not a client-side filter over a larger set. There
// is nothing to "unlock" in devtools: a tile this account cannot open was
// never sent to the browser in the first place, and switch-department
// re-checks the grant against the database regardless.
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, LogOut, ShieldCheck, AlertCircle, ChevronRight, Check, Lock } from "lucide-react";
import ChangePasswordCard from "@/components/onboarding/ChangePasswordCard";
import DepartmentIcon, { colorFor } from "@/components/onboarding/DepartmentIcon";
import { saveSession, clearSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function initialsOf(name = "") {
  return (
    name
      .replace(/[^A-Za-z ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function BrandMark({ height = 30 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/matrubhoomi-logo-192.png" alt="Matrubhoomi Farms & Developers" style={{ height, width: "auto" }} className="shrink-0" />
  );
}

/**
 * One department tile. Every tile this page ever draws is one the account can
 * already open (see the SECURITY note above), so there is no "locked" state
 * here the way the pre-auth preview on /login has one — `busy` just disables
 * the whole grid while a switch-department round trip for another tile is in
 * flight, so a second click can't race the first.
 */
function DepartmentCard({ dept, index, busy, opening, onPick }) {
  const accent = colorFor(dept);
  const isOpening = opening === dept.slug;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onPick(dept)}
      style={{ animationDelay: `${60 + index * 35}ms` }}
      className={`portal-card group relative flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition-all duration-200 ${
        busy
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-slate-300 hover:shadow-[0_2px_12px_rgba(15,23,42,0.08)]"
      }`}
    >
      <DepartmentIcon dept={dept} size={40} flat />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[13.5px] font-semibold text-slate-800">{dept.name}</h3>
          {isOpening ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: accent }} />
          ) : (
            <Check className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: accent }} />
          )}
        </div>
        {dept.description && (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">{dept.description}</p>
        )}
      </div>

      {!busy && (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-500" />
      )}
    </button>
  );
}

export default function DepartmentPortal() {
  const router = useRouter();
  const [reduce, setReduce] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [opening, setOpening] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  /* -- establish the session, and only the session ------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/verify`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        }).catch(() => null);
        if (cancelled) return;

        if (res?.ok) {
          const me = await res.json().catch(() => null);
          if (me?.success) {
            setSession(me.user);
            setDepartments(me.departments || []);
          }
        }
      } catch {
        if (!cancelled) setLoadError("Cannot reach the server.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // /onboarding is the department chooser, not a login page. A visitor with
  // no session is sent to the single sign-in door instead of being shown a
  // second sign-in card here.
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setPwOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setPwOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* -- actions ---------------------------------------------------- */

  const open = useCallback(
    async (dept) => {
      setBusy(true);
      setOpening(dept.slug);
      setActionError("");
      try {
        const res = await fetch(`${API_URL}/api/auth/switch-department`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: dept.slug }),
        });
        const data = await res.json().catch(() => null);
        if (data?.success) {
          saveSession(data.token);
          try {
            if (data.accountantToken) localStorage.setItem("acc_token", data.accountantToken);
            else localStorage.removeItem("acc_token");
          } catch {
            /* private browsing */
          }
          // Client navigation: the switch above was awaited, so the browser
          // has already committed its Set-Cookie — safe, unlike at sign-in.
          router.push(data.redirectTo || dept.dashboardPath || `/d/${dept.slug}`);
          return;
        }
        // The switch is also the authorization check.
        setActionError(data?.message || "You do not have access to that application.");
      } catch {
        setActionError("Cannot reach the server.");
      } finally {
        setBusy(false);
        setOpening(null);
      }
    },
    [router],
  );

  const signOut = async () => {
    setMenuOpen(false);
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      /* clearing the cookie is best-effort */
    }
    try {
      localStorage.removeItem("acc_token");
    } catch {
      /* private mode */
    }
    clearSession();
    window.location.assign("/");
  };

  const grantedCount = departments.length;
  const captionText = session?.isAdmin
    ? "You are an administrator — every application is open to you."
    : grantedCount === 0
      ? "No application has been assigned to this account yet."
      : grantedCount === 1
        ? "One application is open to you."
        : `${grantedCount} applications are open to you.`;

  /* ================================================================ */
  /* Before the session is known, or while redirecting a signed-out    */
  /* visitor — neither the launcher nor a login card, so nothing wrong  */
  /* flashes on the most common visit there is.                        */
  /* ================================================================ */

  if (!ready || !session) {
    return (
      <div className="portal-sans grid min-h-screen place-items-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label={ready ? "Redirecting to sign in" : "Loading"} />
      </div>
    );
  }

  /* ================================================================ */
  /* Signed in — the launcher                                          */
  /* ================================================================ */

  return (
    <div className="portal-sans min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandMark height={26} />
            <div className="hidden leading-tight min-[420px]:block">
              <p className="text-[13.5px] font-semibold text-slate-900">Matrubhoomi Farms & Developers</p>
              <p className="text-[11px] text-slate-400">Manufacturing Suite</p>
            </div>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                {initialsOf(session.name)}
              </span>
              <span className="hidden text-sm font-medium text-slate-800 sm:block">{session.name}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {menuOpen && (
              <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                <div className="px-2.5 py-1.5">
                  <p className="truncate text-[13px] font-medium text-slate-800">{session.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{session.email}</p>
                  {session.isAdmin && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-700">
                      <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" /> Administrator
                    </span>
                  )}
                </div>

                <div className="my-1 border-t border-slate-200" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setPwOpen((v) => !v)}
                  aria-expanded={pwOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  Change password
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pwOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {pwOpen && (
                  <div className="px-1 pt-1 pb-1.5">
                    <ChangePasswordCard />
                  </div>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.01em] text-slate-900">Welcome back, {session.name}</h1>
            <p className="mt-1.5 text-[13.5px] text-slate-600">{captionText}</p>
          </div>
          {grantedCount > 0 && (
            <span className="text-[11.5px] text-slate-400">{grantedCount} available</span>
          )}
        </div>

        {actionError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {loadError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {grantedCount === 0 ? (
          <div className="max-w-md rounded-lg border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <Lock className="mx-auto h-5 w-5 text-slate-300" />
            <p className="mt-3 text-[13.5px] text-slate-500">
              No application has been assigned to this account yet. Ask an administrator to grant one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {departments.map((dept, i) => (
              <DepartmentCard
                key={dept.slug}
                dept={dept}
                index={reduce ? 0 : i}
                busy={busy}
                opening={opening}
                onPick={open}
              />
            ))}
          </div>
        )}
      </main>

      {opening && (
        <div role="status" className="fixed bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />
          Opening…
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: PORTAL_CSS }} />
    </div>
  );
}

/* Plain <style>, not styled-jsx — standard DOM cannot be miscompiled, and a
   sign-in-adjacent page must never fail to render. */
const PORTAL_CSS = `
.portal-sans {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.portal-card {
  animation: portal-rise .35s cubic-bezier(.16,1,.3,1) both;
}
@keyframes portal-rise {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .portal-card { animation: none; }
}
`;
