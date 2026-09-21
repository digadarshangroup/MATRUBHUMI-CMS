// app/ceo/dashboard/access/page.js
//
// Access Control, inside the CEO's own dashboard.
//
// The same panel as /admin, rendered in the CEO sidebar so the person who
// actually manages the company does not have to sign into a second console to
// add a department or reset somebody's password.
//
// Placing it here grants nothing on its own. Every call underneath goes to
// /api/admin/*, and that middleware re-reads `isAdmin` from the database on
// every request — so a CEO who has not been granted administration sees the
// "administrator access required" panel rather than a screen of controls that
// fail one by one.

"use client";

import CEO_DashboardLayout from "@/components/CEO_DashboardLayout";
import AccessManager from "@/components/access/AccessManager";
import { ShieldCheck } from "lucide-react";

export default function CeoAccessPage() {
  return (
    <CEO_DashboardLayout activeMenu="access">
      <div className="p-6 max-w-6xl">
        <div className="mb-5">
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ letterSpacing: ".04em" }}>
            <ShieldCheck className="w-5 h-5" style={{ color: "var(--ck-accent)" }} />
            Access Control
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--ck-ink-3)" }}>
            Departments, logins and permissions. Departments created here appear
            on the <a href="/onboarding" className="underline" style={{ color: "var(--ck-accent-2)" }}>onboarding page</a> immediately —
            no deployment required.
          </p>
        </div>

        <AccessManager showDepartmentLogins={false} />
      </div>
    </CEO_DashboardLayout>
  );
}
