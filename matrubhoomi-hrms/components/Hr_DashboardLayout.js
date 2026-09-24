// ./components/Hr_DashboardLayout.js
//
// HR's navigation. The chrome itself lives in FrostShell, shared with the CEO
// side — so this file is a nav config, not a layout.
//
// HR opens with the effects OFF: these desks run modest machines, and the field
// is the single largest rendering cost in the system. The toggle stays in the
// top bar, and once someone chooses, their choice is remembered and wins.
"use client";

import {
  LayoutDashboard,
  Building2,
  UserSearch,
  Fingerprint,
  Plane,
  Wallet,
  ClipboardCheck,
  TrendingUp,
  ShieldCheck,
  Users,
  CalendarDays,
  ClipboardList,
  SlidersHorizontal,
  CreditCard as TimecardIcon,
  FileBarChart,
  FileText,
  Network,
  ShieldAlert,
  FileSignature,
  Inbox,
  Megaphone,
  Smartphone,
} from "lucide-react";
import FrostShell from "@/components/shell/FrostShell";
import { useDeptRole } from "@/components/access/useDeptRole";

// `minRole` items are hidden from viewers. Kept as data next to the nav so the
// gating travels with the item rather than living in the render.
const NAV = [
  { key: "dashboard", name: "HR dashboard", href: "/hr/dashboard", icon: LayoutDashboard },
  { key: "employees", name: "Employees", href: "/hr/dashboard/employees", icon: Users },
  { key: "Departments", name: "Departments", href: "/hr/dashboard/departments", icon: Building2 },
  { key: "teams", name: "Team structure", href: "/hr/dashboard/teams", icon: Network, badge: "NEW" },
  { key: "recruitment", name: "Recruitment", href: "/hr/dashboard/recruitment", icon: UserSearch },

  { section: "Time" },
  {
    key: "attendance-group",
    name: "Attendance",
    icon: Fingerprint,
    children: [
      { key: "attendance", name: "Overview", href: "/hr/dashboard/attendance", icon: LayoutDashboard },
      { key: "attendance-daily", name: "Daily", href: "/hr/dashboard/attendance/daily", icon: CalendarDays },
      { key: "attendance-muster", name: "Muster roll", href: "/hr/dashboard/attendance/muster-roll", icon: ClipboardList },
      { key: "attendance-timecard", name: "Timecard", href: "/hr/dashboard/attendance/timecard", icon: TimecardIcon },
      { key: "attendance-reports", name: "Reports", href: "/hr/dashboard/attendance/reports", icon: FileBarChart },
      { key: "attendance-settings", name: "Settings", href: "/hr/dashboard/attendance/settings", icon: SlidersHorizontal, minRole: "editor" },
    ],
  },
  { key: "leaves", name: "Leaves", href: "/hr/dashboard/leaves", icon: Plane },

  { section: "Pay & policy" },
  {
    key: "payroll-group",
    name: "Payroll",
    icon: Wallet,
    children: [
      { key: "payroll", name: "Overview", href: "/hr/dashboard/payroll", icon: LayoutDashboard },
      { key: "payslip", name: "Payslip", href: "/hr/dashboard/payroll/payslip", icon: FileText },
      { key: "payroll-settings", name: "Settings", href: "/hr/dashboard/payroll/settings", icon: SlidersHorizontal, minRole: "editor" },
    ],
  },
  {
    key: "sop-group",
    name: "SOP compliance",
    icon: ClipboardCheck,
    children: [
      { key: "sop", name: "Point deductions", href: "/hr/dashboard/sop", icon: FileText },
      { key: "policies", name: "Policies", href: "/hr/dashboard/sop/policies", icon: ShieldAlert },
    ],
  },
  // The two `key`s below BYTE-MATCH the `activeMenu` each page passes
  // (`documents` / `document-requests`). Several existing items in this file do
  // not — those pages simply never highlight. Do not add another.
  //
  // No `minRole`: a viewer should be able to SEE the queue and the library. The
  // generate/release/withdraw controls inside the pages are wrapped in RoleGate,
  // and the server re-checks regardless.
  {
    key: "documents-group",
    name: "Documents",
    icon: FileSignature,
    children: [
      { key: "documents", name: "Issued documents", href: "/hr/dashboard/documents", icon: FileText },
      { key: "document-requests", name: "Requests", href: "/hr/dashboard/documents/requests", icon: Inbox },
    ],
  },
  { key: "performance", name: "Performance", href: "/hr/dashboard/performance", icon: TrendingUp },
  { key: "announcements", name: "Announcements", href: "/hr/dashboard/announcements", icon: Megaphone, badge: "NEW" },
  { key: "mobile-app", name: "Mobile app", href: "/hr/dashboard/mobile-app", icon: Smartphone, badge: "NEW" },

  { section: "System" },
  {
    key: "Password management",
    name: "Security",
    href: "/hr/dashboard/Passwordmanagement",
    icon: ShieldCheck,
    minRole: "editor",
  },
];

export default function HRDashboardLayout({ children, activeMenu }) {
  // Hide role-restricted sections from viewers. Fail closed while the role is
  // still resolving, so a restricted item never flashes for someone who may not
  // be allowed to see it.
  const { isAdmin, atLeast, loading } = useDeptRole();
  const canSee = (minRole) => !minRole || isAdmin || (!loading && atLeast(minRole));

  const nav = NAV.filter((item) => canSee(item.minRole)).map((item) =>
    item.children
      ? { ...item, children: item.children.filter((c) => canSee(c.minRole)) }
      : item,
  );

  return (
    <FrostShell
      guardSlug="hr"
      scope="hr"
      brand="Matrubhoomi Farms & Developers"
      department="Human resources"
      badge="HR"
      nav={nav}
      activeMenu={activeMenu}
      defaultPerf="low"
    >
      {children}
    </FrostShell>
  );
}
