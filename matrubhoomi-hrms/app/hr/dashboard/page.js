"use client";

// app/hr/dashboard/page.js
//
// Data only. The screen itself is components/hr/HrOverview.
//
// They are split because this route sits behind a department guard and a
// session, so the design could never be looked at by anyone verifying a change
// to it — and a design nobody can see gets rebuilt from guesses. app/preview/hr
// renders the same component with sample data and no guard, which means the
// preview cannot drift from what HR actually shows.

import { useEffect, useState } from "react";
import axios from "axios";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import HrOverview from "@/components/hr/HrOverview";
import {
  PageHead,
  Panel,
  Skeleton,
  SkeletonRows,
  ErrorState,
} from "@/components/ceo/ui/Primitives";

const API_URI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function HRDashboardPage() {
  const [dashboardData, setDashboardData] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardResponse, activitiesResponse] = await Promise.all([
        axios.get(`${API_URI}/api/hr/overview/dashboard`, { withCredentials: true }),
        axios.get(`${API_URI}/api/hr/overview/recent-activities?limit=6`, {
          withCredentials: true,
        }),
      ]);

      setDashboardData(dashboardResponse.data);
      setRecentActivities(activitiesResponse.data?.data || []);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeMenu="dashboard">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead
            kicker="Human resources"
            title="Overview"
            sub="Where people, attendance and leave stand today."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 deck:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Panel key={i} label="Loading">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-8 w-24" />
                <SkeletonRows rows={3} />
              </Panel>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout activeMenu="dashboard">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead kicker="Human resources" title="Overview" />
          <Panel label="Could not load the dashboard">
            <ErrorState
              title="Could not load the dashboard"
              body={error}
              onRetry={fetchDashboardData}
            />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="dashboard">
      <HrOverview
        data={dashboardData?.data}
        activities={recentActivities}
        onRefresh={fetchDashboardData}
      />
    </DashboardLayout>
  );
}
