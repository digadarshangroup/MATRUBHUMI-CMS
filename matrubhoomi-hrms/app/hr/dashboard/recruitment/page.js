"use client";

import { useMemo, useState, useEffect } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  MoreVertical,
  MapPin,
  CalendarDays,
  Plus,
  Briefcase,
  Users,
  Loader2,
  Eye,
  Archive,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EditJobSlider from "@/components/recuriment/EditJobSlider";
import {
  Panel,
  PanelHead,
  Chip,
  Tabs,
  EmptyState,
  SkeletonRows,
  PageHead,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const tabs = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "hold", label: "Hold" },
  { key: "closed", label: "Closed" },
  { key: "draft", label: "Drafts" },
];

function StatusBadge({ status }) {
  const getStatusInfo = (status) => {
    switch (status) {
      case "open":
        return {
          label: "Open",
          tone: "positive",
          icon: CheckCircle,
        };
      case "hold":
        return {
          label: "Hold",
          tone: "rework",
          icon: Clock,
        };
      case "closed":
        return {
          label: "Closed",
          tone: "neutral",
          icon: XCircle,
        };
      default:
        return {
          label: "Draft",
          tone: "neutral",
          icon: Clock,
        };
    }
  };

  const statusInfo = getStatusInfo(status);
  const Icon = statusInfo.icon;

  return (
    <Chip tone={statusInfo.tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {statusInfo.label}
    </Chip>
  );
}

export default function JobsPostingDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState(null);
  const [showEditSlider, setShowEditSlider] = useState(false);
  const [counts, setCounts] = useState({
    all: 0,
    open: 0,
    hold: 0,
    closed: 0,
    draft: 0,
  });

  // Fetch jobs from API
  useEffect(() => {
    fetchJobs();
  }, [activeTab]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/hr/job-postings/dashboard/jobs?status=${activeTab}`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        setJobs(data.data.jobs);
        setCounts(data.data.counts);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs based on active tab (now handled by API)
  const filteredJobs = useMemo(() => {
    return jobs;
  }, [jobs]);

  // Handle job actions
  const handleJobAction = async (jobId, action) => {
    try {
      let endpoint = "";
      let method = "PATCH";
      let body = {};

      switch (action) {
        case "view":
          router.push(`/hr/dashboard/recruitment/${jobId}`);
          return;
        case "archive":
          endpoint = `${API_URL}/api/hr/job-postings/${jobId}/status`;
          body = { status: "archived" };
          break;
        case "publish":
          endpoint = `${API_URL}/api/hr/job-postings/${jobId}/status`;
          body = { status: "published" };
          break;
        case "close":
          endpoint = `${API_URL}/api/hr/job-postings/${jobId}/status`;
          body = { status: "closed" };
          break;
        case "delete":
          endpoint = `${API_URL}/api/hr/job-postings/${jobId}`;
          method = "DELETE";
          break;
        default:
          return;
      }

      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: method !== "DELETE" ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (data.success) {
        // Refresh jobs list
        fetchJobs();
      } else {
        console.error("Action failed:", data.message);
      }
    } catch (error) {
      console.error("Error performing action:", error);
    }
  };

  // Get dropdown options for a job
  const getJobOptions = (job) => {
    const options = [
      {
        label: "View Details",
        icon: Eye,
        action: () => handleJobAction(job.id, "view"),
      },
    ];

    // Add status-specific options
    if (job.status === "draft") {
      options.push({
        label: "Publish",
        icon: CheckCircle,
        action: () => handleJobAction(job.id, "publish"),
      });
    } else if (job.status === "open") {
      options.push({
        label: "Close Job",
        icon: XCircle,
        action: () => handleJobAction(job.id, "close"),
      });
      options.push({
        label: "Put on Hold",
        icon: Archive,
        action: () => handleJobAction(job.id, "archive"),
      });
    } else if (job.status === "hold") {
      options.push({
        label: "Reactivate",
        icon: CheckCircle,
        action: () => handleJobAction(job.id, "publish"),
      });
    } else if (job.status === "closed") {
      options.push({
        label: "Reopen",
        icon: CheckCircle,
        action: () => handleJobAction(job.id, "publish"),
      });
    }

    // Add delete option for all except open jobs
    if (job.status !== "open") {
      options.push({
        label: "Delete",
        icon: Trash2,
        action: () => {
          if (confirm("Are you sure you want to delete this job posting?")) {
            handleJobAction(job.id, "delete");
          }
        },
        danger: true,
      });
    }

    return options;
  };

  return (
    <DashboardLayout activeMenu="recruitment">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Jobs"
          sub="Create, manage and track your job postings easily."
          actions={
            /* Creating a posting is an editor+ action — hidden from viewers. */
            <RoleGate min="editor">
              <Link
                href="/hr/dashboard/recruitment/new-job"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-[var(--body-bg)] transition-opacity duration-[180ms] ease-[var(--ease-deck)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New Job Posting
              </Link>
            </RoleGate>
          }
        >
          {/* Tabs */}
          <Tabs
            label="Job status"
            value={activeTab}
            onChange={(v) => setActiveTab(v)}
            options={tabs.map((tab) => ({
              id: tab.key,
              label: tab.label,
              count: counts[tab.key] || 0,
            }))}
          />
        </PageHead>

        {/* Loading State */}
        {loading ? (
          <Panel label="Loading jobs">
            <PanelHead title="Loading jobs" sub="Fetching your postings" />
            <SkeletonRows rows={5} />
          </Panel>
        ) : (
          <>
            {/* Job Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredJobs.map((job) => {
                const jobOptions = getJobOptions(job);

                return (
                  <Panel key={job.id} label={job.title} className="group">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <StatusBadge status={job.status} />

                      {/* Dropdown Menu */}
                      <div className="relative">
                        <button
                          className="rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                          title="More Options"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle dropdown logic here
                            const dropdownId = `dropdown-${job.id}`;
                            const dropdown =
                              document.getElementById(dropdownId);
                            if (dropdown) {
                              dropdown.classList.toggle("hidden");
                            }
                          }}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {/* Dropdown Content */}
                        <div
                          id={`dropdown-${job.id}`}
                          className="frost-bar absolute right-0 z-10 mt-1 hidden w-48 overflow-hidden rounded-inset border border-hairline"
                        >
                          {jobOptions.map((option, index) => {
                            const Icon = option.icon;
                            return (
                              <button
                                key={index}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  option.action();
                                  document
                                    .getElementById(`dropdown-${job.id}`)
                                    .classList.add("hidden");
                                }}
                                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--control)] ${
                                  option.danger
                                    ? "text-[var(--state-overdue-ink)]"
                                    : "text-ink-muted hover:text-ink"
                                }`}
                              >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="mt-4 text-[17px] leading-snug font-medium tracking-[-0.02em] text-ink">
                      {job.title}
                    </h3>

                    {/* Location + Date */}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-faint">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {job.location}
                      </span>
                      <span className="flex items-center gap-1.5" data-figure>
                        <CalendarDays
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {job.lastDate}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="my-5 h-px bg-hairline" />

                    {/* Available positions and applications */}
                    <div className="space-y-4">
                      {/* Available Positions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <div className="flex h-9 w-9 items-center justify-center rounded-inset bg-[var(--control)]">
                            <Briefcase
                              className="h-4 w-4 text-ink-muted"
                              aria-hidden="true"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-ink-faint">
                              Available Positions
                            </p>
                            <p data-figure className="text-ink">
                              {job.positions}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Applications Received */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <div className="flex h-9 w-9 items-center justify-center rounded-inset bg-[var(--control)]">
                            <Users
                              className="h-4 w-4 text-ink-muted"
                              aria-hidden="true"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-ink-faint">
                              Applications
                            </p>
                            <p className="text-ink">
                              <span data-figure>{job.applications || 0}</span>{" "}
                              Received
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleJobAction(job.id, "view")}
                          className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                        >
                          View details →
                        </button>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
                      <p className="text-xs text-ink-faint">
                        Created by{" "}
                        <span className="text-ink-muted">{job.createdBy}</span>
                      </p>
                    </div>
                  </Panel>
                );
              })}
            </div>

            {/* Empty state */}
            {filteredJobs.length === 0 && !loading && (
              <Panel label="No jobs found" className="mt-4">
                <EmptyState
                  title="No jobs found"
                  body="Try switching filters or create a new job posting."
                  action={
                    <RoleGate min="editor">
                      <Link
                        href="/hr/dashboard/recruitment/new-job"
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-[var(--body-bg)] transition-opacity duration-[180ms] ease-[var(--ease-deck)] hover:opacity-90"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Create Job
                      </Link>
                    </RoleGate>
                  }
                />
              </Panel>
            )}
          </>
        )}
      </div>
      {showEditSlider && editingJob && (
        <EditJobSlider
          job={editingJob}
          isOpen={showEditSlider}
          onClose={(refresh) => {
            setShowEditSlider(false);
            setEditingJob(null);
            if (refresh) {
              fetchJobs();
            }
          }}
          onUpdate={fetchJobs}
        />
      )}
    </DashboardLayout>
  );
}
