// app/hr/dashboard/departments/page.js
"use client";

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import SearchableSelect from "@/components/hr/SearchableSelect";
import Link from "next/link";
import {
  Panel,
  Chip,
  Button,
  Field,
  Select,
  Input,
  EmptyState,
  SkeletonRows,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";
import {
  Building2,
  Users,
  GitBranchPlus,
  Search,
  Plus,
  Loader2,
  Eye,
  Edit2,
  X,
  UserCog,
  Check,
  AlertCircle,
} from "lucide-react";

// ── Assign department managers ────────────────────────────────────────────────
// Pick the person in charge of a department (optionally filtered by their
// designation). Saving stores them on the department, pushes them onto every
// existing employee of the department as their reporting manager, and new
// employees created under the department inherit them automatically.
//
// ONE manager: the reporting manager's approval is final, so there is no
// second approver to assign here (the backend clears any it finds).
function AssignManagersModal({ dept, API_URL, onClose, onSaved }) {
  const [emps, setEmps] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [primaryDesig, setPrimaryDesig] = useState(dept.primaryManager?.designation || "");
  const [primaryId, setPrimaryId] = useState(dept.primaryManager?.managerId || "");
  const [applyToExisting, setApplyToExisting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API_URL}/api/employees/all?page=1&limit=500&status=active`,
          { credentials: "include" },
        );
        const d = await r.json();
        if (d.success) setEmps(d.data?.employees || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEmps(false);
      }
    })();
  }, [API_URL]);

  const label = (e) => {
    const n = `${e.firstName || ""} ${e.lastName || ""}`.trim();
    return e.biometricId ? `${n} (${e.biometricId})` : n;
  };
  const designations = (dept.designations || []).map((d) => d.name);
  const byDesig = (desig) =>
    desig
      ? emps.filter(
          (e) =>
            (e.designation || "").toLowerCase() === desig.toLowerCase() ||
            (e.jobTitle || "").toLowerCase() === desig.toLowerCase(),
        )
      : emps;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/api/hr/departments/${dept._id}/managers`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryManagerId: primaryId || null,
          applyToExisting,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || "Failed to save managers");
      onSaved(d.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Rendered as a plain function call, not <MgrPicker />: a component declared
  // inside a render body is a new type every render, which remounts the selects
  // and loses focus mid-interaction.
  const renderPicker = (title, desig, setDesig, personId, setPersonId) => {
    const pool = byDesig(desig);
    return (
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
          {title}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
          <Field label="Designation (filter)">
            <Select
              value={desig}
              onChange={(e) => { setDesig(e.target.value); setPersonId(""); }}
            >
              <option value="">Any designation</option>
              {designations.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </Field>
          <div className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-ink">Manager</span>
            <SearchableSelect
              options={pool.map((e) => ({
                value: e._id,
                label: label(e),
                sub: [e.designation || e.jobTitle, e.department].filter(Boolean).join(" · "),
              }))}
              value={personId}
              onChange={setPersonId}
              placeholder="— None —"
              emptyLabel="— None —"
              loading={loadingEmps}
              ariaLabel={title}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="frost-bar flex max-h-full w-full min-h-0 max-w-[34rem] flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
              <UserCog size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                Managers — {dept.name}
              </h2>
              <p className="mt-1 text-xs text-ink-faint">
                Applied to everyone in {dept.name}; new joiners inherit automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {renderPicker("Reporting manager", primaryDesig, setPrimaryDesig, primaryId, setPrimaryId)}
          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-ink)]"
            />
            <span>
              Apply to all <strong className="font-medium text-ink">existing</strong> employees of {dept.name} now
              (their current managers are overwritten)
            </span>
          </label>
          {error && (
            <InlineError compact message={error} />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <Button tone="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button tone="primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save managers
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mgrDept, setMgrDept] = useState(null);
  const [notice, setNotice] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/hr/departments`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) setDepartments(data.data);
    } catch (error) {
      console.error("Error fetching departments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const totalManagers = (dept) =>
    dept.designations?.reduce(
      (total, d) => total + (d.managers?.length || 0),
      0,
    ) || 0;

  const filteredDepartments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(q) ||
        dept.designations?.some((des) => des.name.toLowerCase().includes(q)),
    );
  }, [departments, searchQuery]);

  const kpis = [
    {
      key: "depts",
      label: "Total departments",
      value: departments.length,
      icon: Building2,
      tone: "brand",
    },

    {
      key: "designations",
      label: "Total designations",
      value: departments.reduce(
        (acc, d) => acc + (d.designations?.length || 0),
        0,
      ),
      icon: GitBranchPlus,
      tone: "ink",
    },
    {
      key: "withMgr",
      label: "Designations with managers",
      value: departments.reduce(
        (acc, d) =>
          acc +
          (d.designations?.filter((x) => x.managers && x.managers.length > 0)
            .length || 0),
        0,
      ),
      icon: Users,
      tone: "ink",
    },
    {
      key: "managers",
      label: "Managers assigned",
      value: departments.reduce((acc, d) => acc + totalManagers(d), 0),
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
          title="Departments"
          sub="Manage departments, designations, and their managers."
          actions={
            /* Creating a department is an editor+ action; a viewer never sees
               this button, and the server refuses it regardless. */
            <RoleGate min="editor">
              <Link
                href="/hr/dashboard/departments/new"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-[var(--body-bg)] transition-opacity duration-[180ms] ease-[var(--ease-deck)] hover:opacity-90"
              >
                <Plus size={15} /> Add department
              </Link>
            </RoleGate>
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
                    {loading ? "—" : s.value}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {notice && (
            <div className="flex items-center gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-positive-ink)]">
              <Check size={14} className="shrink-0" /> {notice}
              <button
                type="button"
                onClick={() => setNotice("")}
                className="ml-auto shrink-0 rounded-full p-1 text-current transition-opacity hover:opacity-70"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* ── Main card: toolbar + table ── */}
          <Panel padded={false} label="All departments">
            <div className="border-b border-hairline px-4 py-3">
              <div className="relative max-w-[26rem]">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
                  size={15}
                />
                <Input
                  type="text"
                  className="pl-9"
                  placeholder="Search departments or designations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="px-4 py-2">
                <SkeletonRows rows={5} />
              </div>
            ) : filteredDepartments.length === 0 ? (
              <EmptyState
                title="No departments found"
                body={
                  searchQuery
                    ? "Try a different search term."
                    : "Add your first department to get started."
                }
              />
            ) : (
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Department</th>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Designations</th>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Managers</th>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Status</th>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepartments.map((dept) => {
                      const mgrs = totalManagers(dept);
                      const withMgr =
                        dept.designations?.filter((d) => d.managers?.length > 0)
                          .length || 0;
                      return (
                        <tr key={dept._id} className="transition-colors hover:bg-[var(--row-hover)]">
                          <td className="border-b border-hairline px-3 py-2.5">
                            <div className="text-sm font-medium text-ink">{dept.name}</div>
                            <div className="mt-0.5 text-[11px] text-ink-faint">
                              <span data-figure>{dept.designations?.length || 0}</span> designations
                            </div>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <div className="flex max-w-[22rem] flex-wrap gap-1">
                              {dept.designations?.slice(0, 4).map((des, idx) => (
                                <Chip key={idx}>
                                  {des.name}
                                  {des.managers?.length > 0 && (
                                    <span data-figure className="text-ink-faint">{des.managers.length}</span>
                                  )}
                                </Chip>
                              ))}
                              {dept.designations?.length > 4 && (
                                <Chip>
                                  <span data-figure>+{dept.designations.length - 4}</span> more
                                </Chip>
                              )}
                              {(!dept.designations || dept.designations.length === 0) && (
                                <span className="text-sm text-ink-faint">—</span>
                              )}
                            </div>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            {dept.primaryManager?.managerName ? (
                              <div className="text-sm font-medium text-ink">
                                {dept.primaryManager.managerName}
                              </div>
                            ) : (
                              <div className="whitespace-nowrap">
                                <span data-figure className="text-sm font-medium text-ink">{mgrs}</span>{" "}
                                <span className="text-xs text-ink-faint">
                                  {mgrs === 1 ? "manager" : "managers"}
                                </span>
                              </div>
                            )}
                            {mgrs > 0 && !dept.primaryManager?.managerName && (
                              <div className="mt-0.5 text-[11px] text-ink-faint">
                                across <span data-figure>{withMgr}</span> designation{withMgr === 1 ? "" : "s"}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <Chip tone={dept.status === "active" ? "positive" : "neutral"}>
                              {dept.status === "active" ? "Active" : "Inactive"}
                            </Chip>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/hr/dashboard/departments/${dept._id}`}
                                className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                                title="View details"
                              >
                                <Eye size={15} />
                              </Link>
                              {/* Editing is editor+; hidden from viewers. */}
                              <RoleGate min="editor">
                                <button
                                  type="button"
                                  className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                                  title="Assign managers"
                                  onClick={() => setMgrDept(dept)}
                                >
                                  <UserCog size={15} />
                                </button>
                                <Link
                                  href={`/hr/dashboard/departments/${dept._id}/edit`}
                                  className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                                  title="Edit"
                                >
                                  <Edit2 size={15} />
                                </Link>
                              </RoleGate>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {mgrDept && (
        <AssignManagersModal
          dept={mgrDept}
          API_URL={API_URL}
          onClose={() => setMgrDept(null)}
          onSaved={(msg) => {
            setMgrDept(null);
            setNotice(msg || "Managers saved");
            fetchDepartments();
          }}
        />
      )}
    </DashboardLayout>
  );
}
