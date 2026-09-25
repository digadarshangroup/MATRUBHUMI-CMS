// ./components/Sales_DashboardLayout.js
//
// Sales's navigation. Like HR's, this is a nav config rather than a layout —
// the chrome itself is FrostShell, shared with HR and the executive side.
//
// EFFECTS ARE OFF AND THERE IS NO TOGGLE.
// The sales desk runs on the same modest machines HR does, and half its screens
// draw a live map that redraws on a timer. Two moving surfaces at once is one
// too many, so the field never mounts here — `forcePerf` pins it rather than
// merely defaulting it, because a shell with no toggle can never let anybody
// change a stale stored preference back (FrostShell's own comment explains it).
"use client";

import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileSpreadsheet,
  GitBranch,
  MapPin,
  LifeBuoy,
  UserCheck,
  CheckSquare,
  SlidersHorizontal,
  BookOpen,
  Globe,
} from "lucide-react";
import FrostShell from "@/components/shell/FrostShell";
import { useDeptRole } from "@/components/access/useDeptRole";

// `minRole` items are hidden from viewers, the same convention HR uses. The
// server re-checks every one of them — this only avoids showing somebody a door
// they cannot open.
const NAV = [
  { key: "dashboard", name: "Sales overview", href: "/sales/dashboard", icon: LayoutDashboard },
  // Plain-language guide to the whole workflow. Above the fold, because the
  // first question on a new user's first day is "what is all this for".
  { key: "help", name: "How it works", href: "/sales/dashboard/help", icon: BookOpen },

  { section: "The book" },
  { key: "leads", name: "Leads", href: "/sales/dashboard/leads", icon: Users },
  { key: "customers", name: "Customers", href: "/sales/dashboard/customers", icon: UserCheck },
  { key: "service", name: "Service requests", href: "/sales/dashboard/service", icon: LifeBuoy },

  { section: "The field" },
  { key: "tasks", name: "Assignments", href: "/sales/dashboard/tasks", icon: ClipboardList },
  // Sits with the work rather than under Setup: clearing it is a daily job, not
  // a configuration one, and a queue nobody passes on the way to the board is a
  // queue that grows.
  { key: "approvals", name: "Approvals", href: "/sales/dashboard/approvals", icon: CheckSquare },
  { key: "team", name: "Team on the map", href: "/sales/dashboard/team", icon: MapPin },

  { section: "Setup" },
  // The two configuration categories live behind one door, because the whole
  // point is that a reader sees New Customer and Schemes as one hierarchy.
  { key: "configuration", name: "Configuration", href: "/sales/dashboard/configuration", icon: SlidersHorizontal, minRole: "editor" },
  { key: "forms", name: "Form templates", href: "/sales/dashboard/forms", icon: FileSpreadsheet, minRole: "editor" },
  { key: "pipeline", name: "Pipeline stages", href: "/sales/dashboard/pipeline", icon: GitBranch, minRole: "editor" },

  // Its own section rather than a fourth item under Setup, because what it
  // edits is not this dashboard: these rows are published to the public
  // marketing site, where anyone on the internet reads them. A heading that
  // says so is the cheapest way to stop somebody treating the form like an
  // internal note. "Schemes" here also means the government programmes on the
  // website, NOT the sales pipelines under Configuration — see
  // models/Website_Models/WebsiteScheme.js for why the two stay apart.
  { section: "Public website" },
  { key: "website-schemes", name: "Scheme listings", href: "/sales/dashboard/website-schemes", icon: Globe, minRole: "editor" },
];

export default function SalesDashboardLayout({ children, activeMenu }) {
  // Fail closed while the role resolves, so a restricted item never flashes for
  // somebody who may not be allowed to see it.
  const { isAdmin, atLeast, loading } = useDeptRole();
  const canSee = (minRole) => !minRole || isAdmin || (!loading && atLeast(minRole));

  const nav = NAV.filter((item) => canSee(item.minRole)).map((item) =>
    item.children ? { ...item, children: item.children.filter((c) => canSee(c.minRole)) } : item,
  );

  return (
    <FrostShell
      guardSlug="sales"
      scope="sales"
      brand="Matrubhoomi Farms & Developers"
      department="Sales"
      badge="Sales"
      nav={nav}
      activeMenu={activeMenu}
      forcePerf="low"
      showPerfToggle={false}
    >
      {children}
    </FrostShell>
  );
}
