// ./components/CEO_DashboardLayout.js
//
// The executive side's navigation. The chrome itself lives in FrostShell, which
// HR and every future department share — so this file is a nav config, not a
// layout. Change the shell, both sides change.
//
// DELIBERATELY SHORT.
//
// The executive office has exactly two jobs in this system: see the state of
// the workforce, and decide who may open what. Everything operational belongs
// to the department that owns it, where the people doing the work already are.
// A second, read-only copy of HR's screens here would be one more thing to keep
// in step and one more place for the two to disagree — so the entries below
// point at purpose-built summaries, not at duplicates.
"use client";

import { LayoutDashboard, Users, ClipboardList, ShieldCheck } from "lucide-react";
import FrostShell from "@/components/shell/FrostShell";

const NAV = [
  { key: "overview", name: "Overview", href: "/ceo/dashboard", icon: LayoutDashboard },

  { section: "People" },
  { key: "hr-employees", name: "Employees", href: "/ceo/dashboard/hr/employees", icon: Users },
  { key: "hr-attendance", name: "Attendance", href: "/ceo/dashboard/hr/attendance", icon: ClipboardList },

  { section: "System" },
  // Visible to every executive user; /api/admin/* re-checks isAdmin per request,
  // so the menu entry is a signpost and never the access decision itself.
  { key: "access", name: "Access control", href: "/ceo/dashboard/access", icon: ShieldCheck },
];

export default function CEO_DashboardLayout({ children, activeMenu }) {
  return (
    <FrostShell
      guardSlug="ceo"
      scope="ceo"
      brand="Matrubhoomi Farms & Developers"
      department="Executive office"
      badge="Executive access"
      nav={NAV}
      activeMenu={activeMenu}
    >
      {children}
    </FrostShell>
  );
}
