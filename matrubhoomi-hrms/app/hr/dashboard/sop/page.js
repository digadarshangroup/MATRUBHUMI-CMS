"use client";
import { useState, useEffect, useCallback } from "react";
import HRDashboardLayout from "../../../../components/Hr_DashboardLayout";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Field,
  Input,
  Select,
  EmptyState,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";
import {
  X,
  History,
  Users,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Shared fetch for the policy API (dashboard + employee history).
const policyFetch = async (path, opts = {}) => {
  const res = await fetch(`${BASE}/api/hr/policy${path}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

// ── Details Sidebar — one employee's history, by category, paginated ─────────
function DetailsSidebar({ emp, year, onClose }) {
  const [activeType, setActiveType] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const LIMIT = 20;

  const TYPE_TONES = {
    C1: "risk",
    C2: "extension",
    C3: "rework",
    C4: "blocked",
    Other: "neutral",
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await policyFetch(
        `/employee-history/${encodeURIComponent(emp.biometricId)}?year=${year}&type=${activeType}&page=${page}&limit=${LIMIT}`,
      );
      setData(d);
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [emp.biometricId, year, activeType, page]);

  useEffect(() => {
    load();
  }, [load]);

  const selectType = (t) => {
    setActiveType(t);
    setPage(1);
  };
  const counts = data?.counts || {};
  const tabs = ["all", "C1", "C2", "C3", "C4", "Other"];

  return (
    <div
      className="fixed inset-0 z-[80] flex overflow-hidden bg-black/55"
      onClick={onClose}
    >
      <div className="flex-1" />
      <div
        className="frost-bar flex h-full min-h-0 w-full max-w-lg flex-col border-l border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              {emp.name}
            </h2>
            <p className="mt-1 truncate text-xs text-ink-faint">
              {(data && data.employee && data.employee.department) || "—"} ·{" "}
              <span data-figure>{emp.biometricId}</span>
              {data ? (
                <>
                  {" · Score "}
                  <span data-figure>
                    {data.score > 0 ? "+" : ""}
                    {data.score}
                  </span>
                </>
              ) : (
                ""
              )}
            </p>
          </div>
          <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Category tabs */}
        <div
          role="tablist"
          aria-label="Point category"
          className="rail flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline px-3 py-2"
        >
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={activeType === t}
              onClick={() => selectType(t)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[color,background-color] duration-[180ms] ease-[var(--ease-deck)] ${activeType === t ? "bg-ink text-[var(--body-bg)]" : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"}`}
            >
              {t === "all" ? "All" : t}
              <span
                data-figure
                className={`text-[11px] ${activeType === t ? "opacity-70" : "text-ink-faint"}`}
              >
                {t === "all" ? counts.all || 0 : counts[t] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-xs text-ink-faint">Loading…</p>
          ) : err ? (
            <InlineError message={err} compact />
          ) : !data || data.items.length === 0 ? (
            <div className="py-4">
              <History
                aria-hidden="true"
                className="mx-auto mb-2 h-8 w-8 text-ink-faint"
              />
              <EmptyState title="No entries in this category" compact />
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((b, i) => {
                const isReward = b.bleachType === "debit";
                return (
                  <div
                    key={i}
                    className={`rounded-inset border border-hairline p-3 ${isReward ? "bg-[color-mix(in_srgb,var(--state-positive)_10%,var(--surface-raised))]" : "bg-[var(--surface-raised)]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-1.5">
                          <Chip tone={TYPE_TONES[b.type] || TYPE_TONES.Other}>
                            {b.type}
                          </Chip>
                          <span className="truncate text-xs font-medium text-ink">
                            {b.name}
                          </span>
                        </div>
                        {b.description && (
                          <p className="text-[11px] text-ink-muted">
                            {b.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-ink-faint">
                          <span data-figure>{b.date}</span> · by {b.by || "—"}
                        </p>
                        {b.recheckStatus === "pending" && (
                          <Chip tone="rework" className="mt-1">
                            Recheck pending
                          </Chip>
                        )}
                        {b.recheckStatus === "confirmed" && (
                          <Chip tone="positive" className="mt-1">
                            Removed
                          </Chip>
                        )}
                      </div>
                      <span
                        data-figure
                        className={`shrink-0 text-sm font-medium ${isReward ? "text-[var(--state-positive-ink)]" : "text-[var(--state-overdue-ink)]"}`}
                      >
                        {isReward ? `+${b.points}` : `−${b.points}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-xs text-ink-faint">
              Page <span data-figure>{data.page}</span> of{" "}
              <span data-figure>{data.totalPages}</span> ·{" "}
              <span data-figure>{data.total}</span> total
            </span>
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard Tab — read-only points overview across C1–C4 ──────────────────
// Pulls from /api/hr/policy/points-summary. Backend stores negative = better;
// this screen shows `score` (= -net), so higher = better.
function DashboardTab() {
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedEmp, setSelectedEmp] = useState(null); // {biometricId, name} for sidebar

  // Filters + pagination (all applied SERVER-SIDE so fetches stay small)
  const [dept, setDept] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced copy of search
  const [empPage, setEmpPage] = useState(1);
  const EMP_LIMIT = 20;

  // Collapsible sections
  const [openScores, setOpenScores] = useState(true);
  const [openRecent, setOpenRecent] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setEmpPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        year: String(year),
        empPage: String(empPage),
        empLimit: String(EMP_LIMIT),
        recentLimit: "50",
      });
      if (dept !== "all") qs.set("department", dept);
      if (query.trim()) qs.set("search", query.trim());
      const d = await policyFetch(`/points-summary?${qs.toString()}`);
      setData(d);
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, dept, query, empPage]);

  useEffect(() => {
    load();
  }, [load]);

  const TYPE_TONES = {
    C1: "risk",
    C2: "extension",
    C3: "rework",
    C4: "blocked",
    Other: "neutral",
  };
  const scoreColor = (s) =>
    s > 0
      ? "text-[var(--state-positive-ink)]"
      : s < 0
        ? "text-[var(--state-overdue-ink)]"
        : "text-ink-faint";
  const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

  if (loading && !data)
    return (
      <div className="flex items-center justify-center py-20 text-sm text-ink-faint">
        Loading dashboard…
      </div>
    );
  if (err) return <InlineError message={err} />;
  if (!data) return null;

  const years = [];
  for (let y = now; y >= now - 3; y--) years.push(y);
  const cardTypes = data.types.filter(
    (t) => ["C1", "C2", "C3", "C4"].includes(t.type) || t.count > 0,
  );

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Year" className="w-[7.5rem]">
          <Select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setEmpPage(1);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" className="w-[13rem]">
          <Select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setEmpPage(1);
            }}
          >
            <option value="all">All departments</option>
            {(data.departments || []).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" className="w-[13rem]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or ID…"
          />
        </Field>
        <span className="pb-2.5 text-xs text-ink-faint">
          <span data-figure>{data.employeeCount}</span> employee
          {data.employeeCount !== 1 ? "s" : ""} with points
        </span>
        <Button size="sm" onClick={load} className="ml-auto mb-1">
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </Button>
      </div>

      {/* Category cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {cardTypes.map((t) => (
          <Panel key={t.type} label={`Category ${t.type}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <Chip tone={TYPE_TONES[t.type] || TYPE_TONES.Other}>
                {t.type}
              </Chip>
              <span className="text-xs text-ink-faint">
                <span data-figure>{t.count}</span> event
                {t.count !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-ink-faint">Penalties</p>
                <p
                  data-figure
                  className="mt-1 text-[17px] leading-none tracking-[-0.025em] text-[var(--state-overdue-ink)]"
                >
                  −{t.penaltyPts}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-faint">Rewards</p>
                <p
                  data-figure
                  className="mt-1 text-[17px] leading-none tracking-[-0.025em] text-[var(--state-positive-ink)]"
                >
                  +{t.rewardPts}
                </p>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {/* Employee scores */}
      <Panel padded={false} label="Employee scores" className="mb-6">
        <button
          type="button"
          aria-expanded={openScores}
          onClick={() => setOpenScores((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-hairline px-5 py-3.5 text-left transition-colors hover:bg-[var(--control)]"
        >
          <Users aria-hidden="true" className="h-4 w-4 text-ink-faint" />
          <span className="text-[15px] font-medium text-ink">
            Employee Scores
          </span>
          <span className="text-xs text-ink-faint">
            · higher = better ·{" "}
            <span data-figure>
              {data.employeeTotal ?? data.employees.length}
            </span>{" "}
            shown-total
          </span>
          <span className="ml-auto text-ink-faint">
            {openScores ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>
        {openScores &&
          (data.employees.length === 0 ? (
            <EmptyState title={`No points recorded for ${year}`} compact />
          ) : (
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
                    {["C1", "C2", "C3", "C4"].map((c) => (
                      <th
                        key={c}
                        className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"
                      >
                        {c}
                      </th>
                    ))}
                    <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map((e) => (
                    <tr
                      key={e.biometricId}
                      onClick={() =>
                        setSelectedEmp({
                          biometricId: e.biometricId,
                          name: e.name,
                        })
                      }
                      className="cursor-pointer hover:bg-[var(--row-hover)]"
                    >
                      <td className="border-b border-hairline px-3 py-2.5">
                        <p className="text-sm text-ink">{e.name}</p>
                        <p data-figure className="text-[11px] text-ink-faint">
                          {e.biometricId}
                        </p>
                      </td>
                      <td className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
                        {e.department || "—"}
                      </td>
                      {["C1", "C2", "C3", "C4"].map((c) => {
                        const v = e.byType[c];
                        if (v === undefined)
                          return (
                            <td
                              key={c}
                              className="border-b border-hairline px-3 py-2.5 text-right"
                            >
                              <span className="text-ink-faint">—</span>
                            </td>
                          );
                        const cs = +(-v).toFixed(2); // invert so higher = better
                        return (
                          <td
                            key={c}
                            className="border-b border-hairline px-3 py-2.5 text-right text-xs"
                          >
                            <span
                              data-figure
                              className={
                                cs > 0
                                  ? "font-medium text-[var(--state-positive-ink)]"
                                  : cs < 0
                                    ? "font-medium text-[var(--state-overdue-ink)]"
                                    : "text-ink-faint"
                              }
                            >
                              {fmt(cs)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-hairline px-3 py-2.5 text-right">
                        <span
                          data-figure
                          className={`text-sm font-medium ${scoreColor(e.score)}`}
                        >
                          {fmt(e.score)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {openScores && (data.empTotalPages || 1) > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
            <Button
              size="sm"
              onClick={() => setEmpPage((p) => Math.max(1, p - 1))}
              disabled={empPage <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-xs text-ink-faint">
              Page <span data-figure>{data.empPage}</span> of{" "}
              <span data-figure>{data.empTotalPages}</span> ·{" "}
              <span data-figure>{data.employeeTotal}</span> employees
            </span>
            <Button
              size="sm"
              onClick={() =>
                setEmpPage((p) => Math.min(data.empTotalPages, p + 1))
              }
              disabled={empPage >= data.empTotalPages}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </Panel>

      {/* Recent activity */}
      <Panel padded={false} label="Recent activity">
        <button
          type="button"
          aria-expanded={openRecent}
          onClick={() => setOpenRecent((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-hairline px-5 py-3.5 text-left transition-colors hover:bg-[var(--control)]"
        >
          <History aria-hidden="true" className="h-4 w-4 text-ink-faint" />
          <span className="text-[15px] font-medium text-ink">
            Recent Activity
          </span>
          <span className="text-xs text-ink-faint">
            · latest <span data-figure>{data.recent.length}</span>
          </span>
          <span className="ml-auto text-ink-faint">
            {openRecent ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>
        {openRecent &&
          (data.recent.length === 0 ? (
            <EmptyState title="Nothing recorded yet" compact />
          ) : (
            <div className="scroll-slim max-h-96 divide-y divide-hairline overflow-y-auto">
              {data.recent.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <Chip tone={TYPE_TONES[r.type] || TYPE_TONES.Other}>
                    {r.type}
                  </Chip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {r.employeeName} · <span data-figure>{r.date}</span> · by{" "}
                      {r.by || "—"}
                    </p>
                  </div>
                  <span
                    data-figure
                    className={`shrink-0 text-sm font-medium ${r.bleachType === "debit" ? "text-[var(--state-positive-ink)]" : "text-[var(--state-overdue-ink)]"}`}
                  >
                    {r.bleachType === "debit" ? `+${r.points}` : `−${r.points}`}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </Panel>

      {selectedEmp && (
        <DetailsSidebar
          emp={selectedEmp}
          year={year}
          onClose={() => setSelectedEmp(null)}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HrSopPage() {
  return (
    <HRDashboardLayout activeMenu="sop">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Human resources"
          title="SOP & Compliance"
          sub="Compliance points across all categories. Click an employee for their full history."
        />
        <DashboardTab />
      </div>
    </HRDashboardLayout>
  );
}
