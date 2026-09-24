// app/ceo/dashboard/announcements/page.js — the executive office writing to
// the workforce. Same panel and same records as HR's; either office may send.
"use client";

import CEO_DashboardLayout from "@/components/CEO_DashboardLayout";
import AnnouncementsPanel from "@/components/announcements/AnnouncementsPanel";

export default function CeoAnnouncementsPage() {
  return (
    <CEO_DashboardLayout activeMenu="announcements">
      <AnnouncementsPanel apiBase="/api/ceo/announcements" departmentsUrl="/api/ceo/hr/departments" />
    </CEO_DashboardLayout>
  );
}
