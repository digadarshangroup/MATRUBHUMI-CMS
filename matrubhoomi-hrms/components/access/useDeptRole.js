// components/access/useDeptRole.js
//
// The current user's role IN THE DEPARTMENT they are currently in — the data
// half of the role-check structure.
//
// WHY IT RESOLVES SYNCHRONOUSLY
// -----------------------------
// The role is decided once, at sign-in, and returned by /api/auth/verify as
// `user.deptRole`. Re-fetching it on every page — and starting each RoleGate in
// a "loading" state — meant a viewer briefly saw edit controls that then
// vanished (the gate optimistically rendered its children until the fetch came
// back). That flash is the whole complaint.
//
// So the role is cached on the client the moment it is known — in module memory
// for this tab and in localStorage across reloads — and read back
// SYNCHRONOUSLY as the hook's initial state. Every navigation after the first
// therefore has the answer before the first paint: no network round-trip on the
// hot path, no flash. A background /verify still runs to keep the cache honest
// (a revoked or promoted role corrects itself on the next screen), because this
// is a convenience cache, never the security boundary — the server re-checks the
// role on every write regardless of what the client believes.

"use client";

import { useState, useEffect } from "react";
import { roleAtLeast } from "@/lib/roles";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const LS_KEY = "matrubhoomi_dept_role";

/** Synchronous, same-tab cache of the resolved identity. */
let _mem; // undefined = never resolved this tab; null/object = resolved value

function readCache() {
  if (_mem !== undefined) return _mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    _mem = raw ? JSON.parse(raw) : null;
  } catch {
    _mem = null;
  }
  return _mem;
}

function writeCache(value) {
  _mem = value;
  try {
    if (value) localStorage.setItem(LS_KEY, JSON.stringify(value));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* private browsing / storage blocked — module memory still serves this tab */
  }
}

let _session; // in-flight /verify promise, shared by every hook this page load
function loadSession() {
  if (!_session) {
    _session = fetch(`${API_URL}/api/auth/verify`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return _session;
}

/**
 * Drop every cached answer. Call on sign-in, sign-out and switch-department, so
 * the next read reflects the new session rather than the previous one.
 */
export function resetDeptRole() {
  _session = undefined;
  writeCache(null);
  _mem = undefined;
}

function shape(data) {
  const u = data && data.success ? data.user : null;
  if (!u) return null;
  return {
    role: u.deptRole || null,
    isAdmin: Boolean(u.isAdmin),
    deptSlug: u.deptSlug || null,
  };
}

export function useDeptRole() {
  // Seed from the synchronous cache so the very first render already knows the
  // answer on every navigation after the first. `known` distinguishes "cache
  // says no role" from "cache is empty" — RoleGate fails closed only when the
  // role is genuinely unknown, never merely absent.
  const cached = readCache();
  const [s, setS] = useState({
    role: cached?.role ?? null,
    isAdmin: cached?.isAdmin ?? false,
    deptSlug: cached?.deptSlug ?? null,
    loading: !cached,
    known: Boolean(cached),
  });

  useEffect(() => {
    let off = false;
    loadSession().then((data) => {
      if (off) return;
      const next = shape(data);
      writeCache(next);
      setS({
        role: next?.role ?? null,
        isAdmin: next?.isAdmin ?? false,
        deptSlug: next?.deptSlug ?? null,
        loading: false,
        known: true,
      });
    });
    return () => { off = true; };
  }, []);

  // Strict: admins pass, otherwise the role must reach `min`.
  const atLeast = (min) => s.isAdmin || roleAtLeast(s.role, min);
  // Assign-first: also pass when the person has NO role yet, mirroring the
  // server guard that only enforces once a department has roles assigned.
  const can = (min) => s.isAdmin || !s.role || roleAtLeast(s.role, min);

  return { ...s, atLeast, can };
}
