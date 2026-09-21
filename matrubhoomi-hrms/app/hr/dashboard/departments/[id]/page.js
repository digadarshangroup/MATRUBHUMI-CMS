"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  ArrowLeft,
  Users,
  GitBranchPlus,
  Edit2,
  Briefcase,
  Loader2,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  EmptyState,
  SkeletonRows,
  PageHead,
} from "@/components/ceo/ui/Primitives";

export default function DepartmentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  useEffect(() => {
    if (params.id) fetchDepartment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const fetchDepartment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/hr/departments/${params.id}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) setDepartment(data.data);
      else setError(data.message);
    } catch (err) {
      console.error("Error fetching department:", err);
      setError("Failed to load department details");
    } finally {
      setLoading(false);
    }
  };

  const totalManagers = () =>
    department?.designations?.reduce(
      (total, d) => total + (d.managers?.length || 0),
      0,
    ) || 0;

  const designationsWithManagers = () =>
    department?.designations?.filter((d) => d.managers && d.managers.length > 0)
      .length || 0;

  const BackButton = (
    <Link
      href="/hr/dashboard/departments"
      className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
      title="Back to departments"
    >
      <ArrowLeft size={16} />
    </Link>
  );

  if (loading) {
    return (
      <DashboardLayout activeMenu="Departments">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <Panel label="Loading department">
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !department) {
    return (
      <DashboardLayout activeMenu="Departments">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <PageHead
            kicker="Human resources"
            title="Department not found"
            sub={error || "The department you're looking for doesn't exist."}
            actions={BackButton}
          />
        </div>
      </DashboardLayout>
    );
  }

  const active = department.status === "active";
  const kpis = [
    {
      key: "status",
      label: "Status",
      value: department.status.charAt(0).toUpperCase() + department.status.slice(1),
      icon: active ? UserCheck : UserX,
      tone: active ? "brand" : "ink",
    },
    {
      key: "designations",
      label: "Total designations",
      value: department.designations?.length || 0,
      icon: GitBranchPlus,
      tone: "ink",
    },
    {
      key: "withMgr",
      label: "Designations with managers",
      value: designationsWithManagers(),
      icon: Users,
      tone: "ink",
    },
    {
      key: "managers",
      label: "Total managers",
      value: totalManagers(),
      icon: Users,
      tone: "ink",
    },
  ];

  return (
    <DashboardLayout activeMenu="Departments">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* ── Header ── */}
        <PageHead
          kicker="Human resources"
          title={department.name}
          sub="Department details and management"
          actions={
            <>
              {BackButton}
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  onClick={() => router.push(`/hr/dashboard/departments/${params.id}/edit`)}
                >
                  <Edit2 size={15} /> Edit department
                </Button>
              </RoleGate>
            </>
          }
        />

        <div className="space-y-4">
          {/* ── KPI strip ── */}
          <Panel padded={false} label="Department totals">
            <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0">
              {kpis.map((s) => (
                <div key={s.key} className="px-5 py-4">
                  <span className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
                    <s.icon size={14} strokeWidth={2} className="shrink-0" />
                    {s.label}
                  </span>
                  <p
                    data-figure
                    className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* ── Designations with managers ── */}
          <Panel label="Designations and managers">
            <PanelHead
              title="Designations & managers"
              sub="All designations in this department and their assigned managers."
              aside={
                <>
                  <span data-figure>{department.designations?.length || 0}</span> designations
                </>
              }
            />

            <div className="flex flex-col gap-3">
              {department.designations?.length ? (
                department.designations.map((designation, index) => (
                  <div
                    key={index}
                    className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-4"
                  >
                    <div
                      className={`flex flex-wrap items-center justify-between gap-3 ${
                        designation.managers?.length > 0 ? "mb-4" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                          <Briefcase size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-ink">{designation.name}</p>
                          <p className="mt-0.5 text-xs text-ink-faint">
                            <span data-figure>{designation.managers?.length || 0}</span> manager
                            {designation.managers?.length === 1 ? "" : "s"} assigned
                          </p>
                        </div>
                      </div>
                      <Chip tone={designation.isActive ? "positive" : "neutral"}>
                        {designation.isActive ? "Active" : "Inactive"}
                      </Chip>
                    </div>

                    {designation.managers && designation.managers.length > 0 ? (
                      <div className="border-l-2 border-[var(--state-positive)] pl-3.5">
                        <p className="mb-2.5 text-xs font-medium text-ink">
                          Assigned managers
                        </p>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 deck:grid-cols-3">
                          {designation.managers.map((manager, mi) => (
                            <div
                              key={mi}
                              className="flex items-start gap-2.5 rounded-inset border border-hairline bg-[var(--surface-raised)] p-3"
                            >
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--control)] text-ink-muted">
                                <Users size={13} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">
                                  {manager.departmentName}
                                </p>
                                <p className="truncate text-xs text-ink-muted">
                                  {manager.designationName}
                                </p>
                                <p className="mt-0.5 text-[11px] text-ink-faint">
                                  Manager for this designation
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="border-l-2 border-hairline pl-3.5">
                        <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                          <Users size={14} /> No managers assigned for this designation
                        </p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState compact title="No designations yet" />
              )}
            </div>
          </Panel>

          {/* ── Info + summary (50 / 50) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel label="Department information">
              <PanelHead title="Department information" />
              <div className="flex flex-col gap-4">
                <Field label="Department name" value={department.name} />
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Created on"
                    value={
                      <span data-figure>
                        {department.createdAt ? new Date(department.createdAt).toLocaleDateString() : "—"}
                      </span>
                    }
                  />
                  <Field
                    label="Last updated"
                    value={
                      <span data-figure>
                        {department.updatedAt ? new Date(department.updatedAt).toLocaleDateString() : "—"}
                      </span>
                    }
                  />
                </div>
              </div>
            </Panel>

            <Panel label="Summary">
              <PanelHead title="Summary" />
              <div className="flex flex-col gap-2.5">
                <SummaryRow label="Total designations" value={department.designations?.length || 0} />
                <SummaryRow
                  label="Active designations"
                  value={department.designations?.filter((d) => d.isActive).length || 0}
                />
                <SummaryRow label="Designations with managers" value={designationsWithManagers()} />
                <SummaryRow label="Total managers assigned" value={totalManagers()} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">{label}</p>
      <p data-figure className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
