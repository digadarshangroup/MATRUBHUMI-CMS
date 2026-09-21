"use client";

// app/hr/dashboard/performance/page.js
// ─────────────────────────────────────────────────────────────────────────────
// HR PERFORMANCE — employee-level metrics list + detailed drawer view.
//
// Replaces the previous "Performance (Coming Soon)" placeholder. Two views:
//
//   Main list view
//     • One row per active employee
//     • Stats: Att%, Present, Absent, Late, Lv (CL+SL+PL), LOP, SOPs %
//     • Department + year filters, search
//     • Click "View" → opens detailed drawer for that employee
//     • "Open Full Profile" link in the drawer → existing /employees/[id]
//
//   Detail drawer (right side, slides in)
//     • Employee header (photo, name, role, contact, manager, tenure)
//     • Year-wide attendance breakdown
//     • Per-month attendance bars (12 months)
//     • Leave balance pills (available / consumed / entitlement)
//     • Recent leave applications table
//     • SOP acknowledgements (if SOP module is enabled)
//
// Data source: GET /hr/performance/overview, GET /hr/performance/:employeeId
// (both implemented in routes/HrRoutes/Performance_section.js)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Select as UiSelect,
  Input as UiInput,
  Meter,
  EmptyState,
  PageHead,
} from "@/components/ceo/ui/Primitives";
import {
  Award,
  Search,
  X,
  ChevronRight,
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Building2,
  Briefcase,
  Mail,
  Phone,
  ChevronLeft,
  FileText,
  BarChart3,
  Filter,
  Eye,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function apiFetch(path) {
  return fetch(`${API}${path}`, { credentials: "include" }).then(async (r) => {
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || "Request failed");
    return d;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ rows: [], total: 0, pages: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [depts, setDepts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        year,
        page,
        limit: 50,
        ...(department !== "all" && { department }),
        ...(search.trim() && { search: search.trim() }),
      });
      const d = await apiFetch(`/hr/performance/overview?${qs}`);
      setData(d.data);
    } catch (e) {
      console.error("[performance] load:", e);
      setData({ rows: [], total: 0, pages: 0 });
    } finally {
      setLoading(false);
    }
  }, [year, department, search, page]);

  useEffect(() => {
    setPage(1);
  }, [year, department, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Department list — derive from current rows so it stays in sync with whatever
  // the backend returned (won't show a dept that has no active employees).
  useEffect(() => {
    apiFetch(`/hr/performance/overview?year=${year}&limit=200`)
      .then((d) => {
        const set = new Set(
          (d.data?.rows || []).map((r) => r.department).filter(Boolean),
        );
        setDepts([...set].sort());
      })
      .catch(() => {});
  }, [year]);

  const summary = useMemo(() => {
    const rows = data.rows || [];
    if (!rows.length)
      return { avgAtt: 0, totalLeaves: 0, totalLop: 0, perfectAtt: 0 };
    const sumAtt = rows.reduce(
      (s, r) => s + (r.attendance?.attendancePct || 0),
      0,
    );
    const totalLeaves = rows.reduce(
      (s, r) => s + (r.leaves?.totalTaken || 0),
      0,
    );
    const totalLop = rows.reduce((s, r) => s + (r.attendance?.lopDays || 0), 0);
    const perfectAtt = rows.filter(
      (r) => (r.attendance?.attendancePct || 0) === 100,
    ).length;
    return {
      avgAtt: Math.round(sumAtt / rows.length),
      totalLeaves: Math.round(totalLeaves * 10) / 10,
      totalLop: Math.round(totalLop * 10) / 10,
      perfectAtt,
    };
  }, [data.rows]);

  return (
    <Hr_DashboardLayout activeMenu="performance" pageTitle="Performance">
      <div className="mx-auto w-full max-w-[1480px] space-y-5 px-4 py-6 pb-10 deck:px-8">
        {/* ── Header ── */}
        <PageHead
          kicker="Human resources"
          title="Performance"
          sub={
            <>
              Per-employee attendance, leave usage and SOP compliance for{" "}
              <span data-figure className="text-ink">
                {year}
              </span>
            </>
          }
          actions={
            <UiSelect
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
              data-figure
              className="w-28"
            >
              {[0, 1, 2].map((o) => {
                const y = new Date().getFullYear() - o;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </UiSelect>
          }
        />

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPI
            label="Active Employees"
            value={data.total || 0}
            icon={Users}
            tone="slate"
          />
          <KPI
            label="Avg Attendance %"
            value={`${summary.avgAtt}%`}
            sub={`${summary.perfectAtt} at 100%`}
            icon={TrendingUp}
            tone={summary.avgAtt >= 90 ? "emerald" : "amber"}
          />
          <KPI
            label="Total Leaves Taken"
            value={summary.totalLeaves}
            sub="CL + SL + PL"
            icon={Calendar}
            tone="blue"
          />
          <KPI
            label="Total LOP"
            value={summary.totalLop}
            sub="Loss of pay days"
            icon={TrendingDown}
            tone="rose"
          />
        </div>

        {/* ── Filters ── */}
        <Panel label="Filters" className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint"
            />
            <UiInput
              type="text"
              placeholder="Search by name, ID, department…"
              aria-label="Search employees"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <UiSelect
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Department"
            className="w-[13rem]"
          >
            <option value="all">All Departments</option>
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </UiSelect>
          {(search || department !== "all") && (
            <Button
              tone="ghost"
              onClick={() => {
                setSearch("");
                setDepartment("all");
              }}
            >
              Clear
            </Button>
          )}
        </Panel>

        {/* ── List ── */}
        <Panel padded={false} label="Employee performance">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Employee
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Department
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Att %
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Present
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Absent
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Late
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Lv
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    LOP
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    SOP %
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
                    </td>
                  </tr>
                ) : data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <EmptyState title="No employees match the current filters" />
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <PerfRow
                      key={r.employeeId}
                      row={r}
                      onClick={() => setSelectedId(r.employeeId)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3 text-sm">
              <p className="text-ink-muted">
                Showing <span data-figure>{data.rows.length}</span> of{" "}
                <span data-figure>{data.total}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Prev
                </Button>
                <span data-figure className="px-3 text-ink-muted">
                  {page} / {data.pages}
                </span>
                <Button
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {selectedId && (
        <PerformanceDrawer
          employeeId={selectedId}
          year={year}
          onClose={() => setSelectedId(null)}
        />
      )}
    </Hr_DashboardLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────────
function PerfRow({ row, onClick }) {
  const att = row.attendance?.attendancePct;
  const attColor =
    att == null
      ? "text-ink-faint"
      : att >= 95
        ? "text-[var(--state-positive-ink)]"
        : att >= 85
          ? "text-[var(--state-rework-ink)]"
          : "text-[var(--state-overdue-ink)]";
  const sopPct =
    row.sop?.assigned > 0
      ? Math.round((row.sop.acknowledged / row.sop.assigned) * 100)
      : null;

  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
    >
      <td className="border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-[220px] items-center gap-3">
          <Avatar src={row.profilePhoto} name={row.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-faint">
              <span data-figure>{row.biometricId}</span> ·{" "}
              {row.designation || "—"}
            </p>
          </div>
        </div>
      </td>
      <td className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
        {row.department || "—"}
      </td>
      <td
        data-figure
        className={`border-b border-hairline px-3 py-2.5 text-right text-sm font-medium ${attColor}`}
      >
        {att == null ? "—" : `${att}%`}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink"
      >
        {row.attendance?.presentDays || 0}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-[var(--state-overdue-ink)]"
      >
        {row.attendance?.absentDays || 0}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-[var(--state-rework-ink)]"
      >
        {row.attendance?.lateDays || 0}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink-muted"
      >
        {row.leaves?.totalTaken || 0}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-[var(--state-overdue-ink)]"
      >
        {row.attendance?.lopDays || 0}
      </td>
      <td
        data-figure
        className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink"
      >
        {sopPct == null ? "—" : `${sopPct}%`}
      </td>
      <td className="border-b border-hairline px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-ink-faint group-hover:text-ink" />
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail drawer
// ─────────────────────────────────────────────────────────────────────────────
function PerformanceDrawer({ employeeId, year, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/hr/performance/${employeeId}?year=${year}`)
      .then((d) => setData(d.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [employeeId, year]);

  const e = data?.employee;
  const ys = data?.yearStats;
  const monthly = data?.monthly || [];
  const bal = data?.balance;

  // Max value across months for scaling the bars.
  const maxBar = Math.max(
    1,
    ...monthly.map(
      (m) => m.presentDays + m.absentDays + m.halfDays + m.leaveDaysTotal,
    ),
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex overflow-hidden bg-black/55"
      onClick={onClose}
    >
      <div className="flex-1" />
      <div
        className="frost-bar flex h-full min-h-0 w-full max-w-2xl flex-col border-l border-hairline"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-6 py-4">
          <Button tone="ghost" size="sm" onClick={onClose}>
            <ChevronLeft className="h-4 w-4" /> Back to list
          </Button>
          {e && (
            <Link
              href={`/hr/dashboard/employees/${employeeId}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
            >
              Full Profile <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
            </div>
          ) : !data ? (
            <EmptyState title="Failed to load this employee's performance data" />
          ) : (
            <>
              {/* ── Employee header ── */}
              <div className="flex items-start gap-4">
                <Avatar src={e.profilePhoto} name={e.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[clamp(1.25rem,2vw,1.5rem)] leading-tight font-light tracking-[-0.03em] text-ink">
                    {e.name}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {e.designation || "—"} · {e.department || "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                    {e.biometricId && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase aria-hidden="true" className="h-3 w-3" />{" "}
                        <span data-figure>{e.biometricId}</span>
                      </span>
                    )}
                    {e.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail aria-hidden="true" className="h-3 w-3" />{" "}
                        {e.email}
                      </span>
                    )}
                    {e.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone aria-hidden="true" className="h-3 w-3" />{" "}
                        <span data-figure>{e.phone}</span>
                      </span>
                    )}
                    {e.tenureLabel && (
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden="true" className="h-3 w-3" />{" "}
                        <span data-figure>{e.tenureLabel}</span> tenure
                      </span>
                    )}
                  </div>
                  {e.manager && (
                    <p className="mt-2 text-xs text-ink-faint">
                      Reports to <b className="text-ink">{e.manager}</b>
                    </p>
                  )}
                </div>
              </div>

              {/* ── Year-wide attendance ── */}
              <Section title={`Attendance · ${year}`} icon={BarChart3}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Present" value={ys.presentDays} tone="emerald" />
                  <Stat label="Absent" value={ys.absentDays} tone="rose" />
                  <Stat label="Half Days" value={ys.halfDays} tone="amber" />
                  <Stat label="Late" value={ys.lateDays} tone="amber" />
                  <Stat
                    label="Leaves Total"
                    value={ys.leaveDaysTotal}
                    tone="purple"
                  />
                  <Stat label="CL Taken" value={ys.clDays} tone="sky" />
                  <Stat label="SL Taken" value={ys.slDays} tone="sky" />
                  <Stat label="PL Taken" value={ys.plDays} tone="sky" />
                </div>
                {ys.lopDays > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-overdue-ink)]">
                    <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>
                      <b data-figure>{ys.lopDays}</b> day
                      {ys.lopDays === 1 ? "" : "s"} of Loss of Pay this year
                    </span>
                  </div>
                )}
              </Section>

              {/* ── Monthly bars ── */}
              <Section title="Monthly Breakdown" icon={Calendar}>
                <div className="space-y-2">
                  {monthly.map((m) => {
                    const total =
                      m.presentDays +
                      m.absentDays +
                      m.halfDays +
                      m.leaveDaysTotal;
                    const present = (m.presentDays / maxBar) * 100;
                    const absent = (m.absentDays / maxBar) * 100;
                    const half = (m.halfDays / maxBar) * 100;
                    const lv = (m.leaveDaysTotal / maxBar) * 100;
                    return (
                      <div
                        key={m.month}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="w-9 font-medium text-ink-faint">
                          {m.monthLabel}
                        </span>
                        <div className="flex h-5 flex-1 overflow-hidden rounded-inset bg-[var(--control-active)]">
                          <div
                            className="h-full bg-[var(--flow-completed)]"
                            style={{ width: `${present}%` }}
                            title={`Present: ${m.presentDays}`}
                          />
                          <div
                            className="h-full bg-[var(--flow-rework)]"
                            style={{ width: `${half}%` }}
                            title={`Half Days: ${m.halfDays}`}
                          />
                          <div
                            className="h-full bg-[var(--flow-assigned)]"
                            style={{ width: `${lv}%` }}
                            title={`Leaves: ${m.leaveDaysTotal}`}
                          />
                          <div
                            className="h-full bg-[var(--flow-cancelled)]"
                            style={{ width: `${absent}%` }}
                            title={`Absent: ${m.absentDays}`}
                          />
                        </div>
                        <span
                          data-figure
                          className="w-10 text-right font-medium text-ink-muted"
                        >
                          {total || 0}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-faint">
                  <Legend color="bg-[var(--flow-completed)]" label="Present" />
                  <Legend color="bg-[var(--flow-rework)]" label="Half" />
                  <Legend color="bg-[var(--flow-assigned)]" label="Leave" />
                  <Legend color="bg-[var(--flow-cancelled)]" label="Absent" />
                </div>
              </Section>

              {/* ── Leave balance ── */}
              <Section title="Leave Balance" icon={CheckCircle2}>
                {bal ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <BalanceCard
                      title="CL"
                      consumed={bal.consumed?.CL || 0}
                      entitlement={bal.entitlement?.CL || 0}
                      available={bal.available?.CL || 0}
                    />
                    <BalanceCard
                      title="SL"
                      consumed={bal.consumed?.SL || 0}
                      entitlement={bal.entitlement?.SL || 0}
                      available={bal.available?.SL || 0}
                    />
                    <BalanceCard
                      title="PL"
                      consumed={bal.consumed?.PL || 0}
                      entitlement={bal.entitlement?.PL || 0}
                      available={bal.available?.PL || 0}
                      note={bal.plEligible ? null : "Not yet eligible"}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">
                    No leave balance record for <span data-figure>{year}</span>.
                  </p>
                )}
              </Section>

              {/* ── Recent leaves ── */}
              <Section title="Recent Leave Applications" icon={FileText}>
                {data.recentLeaves?.length === 0 ? (
                  <EmptyState title="No leave applications this year" compact />
                ) : (
                  <div className="scroll-slim overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Type
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            From
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            To
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Days
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentLeaves.map((l) => (
                          <tr key={l.id}>
                            <td className="border-b border-hairline px-3 py-2.5 text-sm font-medium text-ink">
                              {l.leaveType}
                            </td>
                            <td
                              data-figure
                              className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted"
                            >
                              {l.fromDate}
                            </td>
                            <td
                              data-figure
                              className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted"
                            >
                              {l.toDate}
                            </td>
                            <td
                              data-figure
                              className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink"
                            >
                              {l.totalDays}
                              {l.lwpDays > 0 && (
                                <span className="text-[10px] text-[var(--state-overdue-ink)]">
                                  {" "}
                                  ({l.lwpDays} LWP)
                                </span>
                              )}
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5">
                              <StatusPill status={l.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* ── SOP list (only if SOP module enabled) ── */}
              {data.sopList?.length > 0 && (
                <Section title="SOPs" icon={FileText}>
                  <ul className="space-y-1.5">
                    {data.sopList.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate text-ink">{s.title}</span>
                        <Chip tone={s.acknowledged ? "positive" : "rework"}>
                          {s.acknowledged ? "Acknowledged" : "Pending"}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = "md" }) {
  const sz = size === "lg" ? "w-16 h-16 text-lg" : "w-10 h-10 text-sm";
  if (src)
    return (
      <img
        src={src}
        alt={name}
        className={`${sz} shrink-0 rounded-full object-cover ring-1 ring-[var(--color-hairline)]`}
      />
    );
  const initials = (name || "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-[var(--control-active)] font-medium text-ink-muted`}
    >
      {initials || "—"}
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: { icon: "bg-[var(--control)] text-ink-muted" },
    emerald: {
      icon: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
    },
    amber: {
      icon: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    },
    blue: {
      icon: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    },
    rose: {
      icon: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    },
  };
  const t = tones[tone] || tones.slate;
  return (
    <Panel label={label}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
          {label}
        </p>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.icon}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </div>
      </div>
      <p
        data-figure
        className="text-[28px] leading-none tracking-[-0.03em] text-ink"
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-ink-faint">{sub}</p>}
    </Panel>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <Panel label={title}>
      <PanelHead
        title={title}
        aside={<Icon aria-hidden="true" className="h-4 w-4 text-ink-faint" />}
      />
      {children}
    </Panel>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-ink",
    emerald: "text-[var(--state-positive-ink)]",
    rose: "text-[var(--state-overdue-ink)]",
    amber: "text-[var(--state-rework-ink)]",
    purple: "text-[var(--state-extension-ink)]",
    sky: "text-[var(--state-risk-ink)]",
  };
  return (
    <div className="rounded-inset bg-[var(--surface-raised)] p-3 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      <p className="text-[10px] font-medium tracking-[0.09em] text-ink-faint uppercase">
        {label}
      </p>
      <p
        data-figure
        className={`mt-1 text-[20px] leading-none tracking-[-0.025em] ${tones[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 rounded-full ${color}`}
      />{" "}
      {label}
    </span>
  );
}

function BalanceCard({ title, consumed, entitlement, available, note }) {
  const pct = entitlement > 0 ? (consumed / entitlement) * 100 : 0;
  const meterTone = pct >= 100 ? "overdue" : pct >= 75 ? "risk" : "default";
  return (
    <div className="rounded-inset bg-[var(--surface-raised)] p-3 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span data-figure className="text-xs text-ink-faint">
          {consumed}/{entitlement}
        </span>
      </div>
      <Meter
        value={Math.min(100, pct)}
        tone={meterTone}
        label={`${title} consumed`}
      />
      <p className="mt-2 text-xs text-ink-faint">
        <b data-figure className="text-ink">
          {available}
        </b>{" "}
        available
      </p>
      {note && (
        <p className="mt-1 text-[10px] font-medium text-[var(--state-rework-ink)]">
          {note}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: { label: "Pending", tone: "rework" },
    manager_approved: {
      label: "Mgr. Approved",
      tone: "risk",
    },
    hr_approved: { label: "Approved", tone: "positive" },
    hr_rejected: { label: "Rejected", tone: "overdue" },
    manager_rejected: {
      label: "Mgr. Rejected",
      tone: "overdue",
    },
    cancelled: { label: "Cancelled", tone: "neutral" },
    withdraw_pending: {
      label: "Withdraw Req.",
      tone: "extension",
    },
  };
  const m = map[status] || {
    label: status,
    tone: "neutral",
  };
  return <Chip tone={m.tone}>{m.label}</Chip>;
}
