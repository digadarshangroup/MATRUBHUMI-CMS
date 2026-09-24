// app/hr/dashboard/announcements/page.js — HR writing to the workforce.
// The panel is shared with the executive office; see its header.
"use client";

import HRDashboardLayout from "@/components/Hr_DashboardLayout";
import AnnouncementsPanel from "@/components/announcements/AnnouncementsPanel";

export default function HrAnnouncementsPage() {
  return (
    <HRDashboardLayout activeMenu="announcements">
      <AnnouncementsPanel apiBase="/api/hr/announcements" departmentsUrl="/api/hr/departments" />
    </HRDashboardLayout>
  );
}
