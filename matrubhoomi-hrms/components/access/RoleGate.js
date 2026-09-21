// components/access/RoleGate.js
//
// The reusable role-check for any section of any department. Wrap an action (a
// button, a menu item, a whole panel) and it shows only when the signed-in
// person may perform it.
//
//   <RoleGate min="editor">      <AddButton /></RoleGate>
//   <RoleGate min="owner">       <DeleteButton /></RoleGate>
//   <RoleGate min="approver" mode="strict" fallback={<Locked/>}> … </RoleGate>
//
// Modes:
//   "open"   (default) — admins pass; a person WITH a role must reach `min`; a
//            person with NO role yet still passes, matching the server's
//            assign-first behaviour (nothing breaks until roles are assigned).
//   "strict" — admins pass; everyone else must reach `min` (used once a
//            department is fully assigned and you want the UI to hard-gate too).
//
// This is UX only. The server (requireDepartmentRole) is the real gate; this
// just keeps people from clicking things that would be refused.

"use client";

import { useDeptRole } from "./useDeptRole";

export default function RoleGate({ min = "editor", mode = "open", fallback = null, children }) {
  const { loading, isAdmin, role, atLeast } = useDeptRole();

  // Admins always pass.
  if (isAdmin) return <>{children}</>;

  // The role now resolves synchronously from the client cache (see useDeptRole),
  // so `loading` is only ever true on the very first page of a session, before
  // the cache is warm. In that one case fail CLOSED — hide the gated control
  // rather than flash it — because showing a viewer an Edit button that then
  // disappears is exactly the bug this guards against. It resolves within a tick.
  if (loading) return fallback;

  const pass = mode === "strict" ? atLeast(min) : (!role || atLeast(min));
  return pass ? <>{children}</> : fallback;
}
