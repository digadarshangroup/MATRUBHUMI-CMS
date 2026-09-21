// components/access/RequireRole.js
//
// PAGE-LEVEL role guard. RoleGate hides a single control; this hides a whole
// screen (or a tab/section) from anyone below `min`. Use it to wrap the content
// of pages a viewer must not see at all — Security, Settings, and the like:
//
//   export default function SettingsPage() {
//     return <RequireRole min="editor"><Settings/></RequireRole>;
//   }
//
// Behaviour: admins always pass; otherwise the department role must reach `min`.
// While the role is still resolving (only the very first cold load — useDeptRole
// caches it synchronously after that) a neutral loader shows, so the access
// notice never flashes before the answer is known. This is the UX layer; the
// server still enforces every write.

"use client";

import { useDeptRole } from "./useDeptRole";
import { ROLE_LABELS } from "@/lib/roles";
import { ShieldAlert, Loader2 } from "lucide-react";

function AccessDenied({ min, role }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-card border border-border rounded-xl p-6 text-center shadow-sm">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Not available to your role</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This section needs {ROLE_LABELS?.[min] || min} access
          {role ? ` — you are ${ROLE_LABELS?.[role] || role}.` : "."} Ask an
          administrator if you need it.
        </p>
      </div>
    </div>
  );
}

export default function RequireRole({ min = "editor", children, fallback }) {
  const { loading, isAdmin, role, atLeast } = useDeptRole();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }
  if (isAdmin || atLeast(min)) return <>{children}</>;
  return fallback !== undefined ? fallback : <AccessDenied min={min} role={role} />;
}
