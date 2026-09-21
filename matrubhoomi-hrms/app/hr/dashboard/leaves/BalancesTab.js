"use client";

// app/hr/dashboard/leaves/BalancesTab.js
// ─────────────────────────────────────────────────────────────────────────────
// LEAVE BALANCES TAB — one row per active employee with CL/SL/PL
// entitlement + consumed + available, sortable, searchable, filterable
// by department. Powered by GET /api/hr/leaves/all-balances.
//
// Used by app/hr/dashboard/leaves/page.js as the third tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { Panel, Input, Select } from "@/components/ceo/ui/Primitives";
import {
  Search,
  Loader2,
  Users,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function apiFetch(url) {
  return fetch(`${API}${url}`, { credentials: "include" }).then(async (r) => {
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || "Request failed");
    return d;
  });
}

function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function BalancesTab({ showBanner }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ rows: [], config: {} });
  const [sort, setSort] = useState({ col: "name", dir: "asc" });

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        year,
        ...(department !== "all" && { department }),
        ...(search.trim() && { search: search.trim() }),
      });
      const d = await apiFetch(`/api/hr/leaves/all-balances?${qs}`);
      setData(d.data);
    } catch (e) {
      showBanner?.("error", "Failed to load balances: " + e.message);
      setData({ rows: [], config: {} });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, department, search]);

  const departments = useMemo(() => {
    return [
      ...new Set((data.rows || []).map((r) => r.department).filter(Boolean)),
    ].sort();
  }, [data.rows]);

  // Aggregate stats
  const summary = useMemo(() => {
    const rows = data.rows || [];
    const cfg = data.config || {};
    const plEligibleByPolicy = rows.filter((r) => r.plEligibleByPolicy).length;
    const plAlreadyGranted = rows.filter((r) => r.plEligible).length;
    const plPendingGrant = rows.filter(
      (r) => r.plEligibleByPolicy && !r.plEligible,
    ).length;
    const noBalRecord = rows.filter((r) => !r.hasBalanceRecord).length;
    const fullyConsumed = rows.filter((r) => {
      // someone is at 0/0 if any of CL/SL/PL is at entitlement
      return (
        (r.entitlement.CL > 0 && r.consumed.CL >= r.entitlement.CL) ||
        (r.entitlement.SL > 0 && r.consumed.SL >= r.entitlement.SL) ||
        (r.entitlement.PL > 0 && r.consumed.PL >= r.entitlement.PL)
      );
    }).length;
    return {
      total: rows.length,
      plEligibleByPolicy,
      plAlreadyGranted,
      plPendingGrant,
      noBalRecord,
      fullyConsumed,
    };
  }, [data]);

  const sorted = useMemo(() => {
    const rows = [...(data.rows || [])];
    const getVal = (r) => {
      switch (sort.col) {
        case "name":
          return (r.name || "").toLowerCase();
        case "department":
          return (r.department || "").toLowerCase();
        case "cl_avail":
          return r.available.CL;
        case "sl_avail":
          return r.available.SL;
        case "pl_avail":
          return r.available.PL;
        case "cl_used":
          return r.consumed.CL;
        case "sl_used":
          return r.consumed.SL;
        case "pl_used":
          return r.consumed.PL;
        case "working":
          return r.workingDays;
        default:
          return 0;
      }
    };
    const isText = ["name", "department"].includes(sort.col);
    const mult = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const va = getVal(a),
        vb = getVal(b);
      if (isText) return mult * String(va).localeCompare(String(vb));
      return mult * (Number(va) - Number(vb));
    });
    return rows;
  }, [data.rows, sort]);

  const toggleSort = (col) => {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  };

  return (
    <div className="space-y-4">
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BalanceKPI
          label="Active Employees"
          value={summary.total}
          icon={Users}
          tone="slate"
        />
        <BalanceKPI
          label="PL Already Granted"
          value={summary.plAlreadyGranted}
          sub="have PL entitlement"
          icon={CheckCircle2}
          tone="emerald"
        />
        <BalanceKPI
          label="PL Sync Needed"
          value={summary.plPendingGrant}
          sub="eligible but no PL yet"
          icon={AlertCircle}
          tone={summary.plPendingGrant > 0 ? "amber" : "slate"}
        />
        <BalanceKPI
          label="At Full Limit"
          value={summary.fullyConsumed}
          sub="exhausted a leave type"
          icon={TrendingDown}
          tone={summary.fullyConsumed > 0 ? "rose" : "slate"}
        />
      </div>

      {/* ── Filters ── */}
      <Panel className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            type="text"
            placeholder="Search by name, ID, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-auto"
        >
          {[0, 1, 2].map((o) => {
            const y = new Date().getFullYear() - o;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </Select>
        <Select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="w-auto"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Panel>

      {/* ── Table ── */}
      <Panel padded={false}>
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortableTh
                  col="name"
                  current={sort}
                  onSort={toggleSort}
                  align="left"
                >
                  Employee
                </SortableTh>
                <SortableTh
                  col="department"
                  current={sort}
                  onSort={toggleSort}
                  align="left"
                >
                  Department
                </SortableTh>
                <SortableTh
                  col="working"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                >
                  Working Days
                </SortableTh>
                <th
                  colSpan={2}
                  className="border-b border-l border-hairline px-2 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"
                >
                  CL
                </th>
                <th
                  colSpan={2}
                  className="border-b border-l border-hairline px-2 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"
                >
                  SL
                </th>
                <th
                  colSpan={2}
                  className="border-b border-l border-hairline px-2 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"
                >
                  PL
                </th>
              </tr>
              <tr>
                <th colSpan={3} className="border-b border-hairline"></th>
                <SortableTh
                  col="cl_avail"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                  className="border-l border-hairline"
                >
                  Available
                </SortableTh>
                <SortableTh
                  col="cl_used"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                >
                  Used / Total
                </SortableTh>
                <SortableTh
                  col="sl_avail"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                  className="border-l border-hairline"
                >
                  Available
                </SortableTh>
                <SortableTh
                  col="sl_used"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                >
                  Used / Total
                </SortableTh>
                <SortableTh
                  col="pl_avail"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                  className="border-l border-hairline"
                >
                  Available
                </SortableTh>
                <SortableTh
                  col="pl_used"
                  current={sort}
                  onSort={toggleSort}
                  align="center"
                >
                  Used / Total
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-faint" />
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-16 text-center text-sm text-ink-muted"
                  >
                    No employees match the current filters
                  </td>
                </tr>
              ) : (
                sorted.map((r) => <BalanceRow key={r.employeeId} row={r} />)
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function SortableTh({
  col,
  current,
  onSort,
  align = "left",
  className = "",
  children,
}) {
  const isActive = current.col === col;
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
        ? "text-right"
        : "text-left";
  return (
    <th
      onClick={() => onSort(col)}
      className={`cursor-pointer border-b border-hairline px-3 py-2.5 text-[11px] font-medium tracking-[0.09em] uppercase transition-colors select-none hover:bg-[var(--control)] ${
        isActive ? "text-ink" : "text-ink-faint"
      } ${className} ${alignClass}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive ? (
          current.dir === "asc" ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : null}
      </span>
    </th>
  );
}

function BalanceRow({ row }) {
  const clPct =
    row.entitlement.CL > 0 ? (row.consumed.CL / row.entitlement.CL) * 100 : 0;
  const slPct =
    row.entitlement.SL > 0 ? (row.consumed.SL / row.entitlement.SL) * 100 : 0;
  const plPct =
    row.entitlement.PL > 0 ? (row.consumed.PL / row.entitlement.PL) * 100 : 0;

  return (
    <tr className="transition-colors hover:bg-[var(--row-hover)]">
      <td className="border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-[200px] items-center gap-2.5">
          {row.profilePhoto ? (
            <img
              src={row.profilePhoto}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-[var(--color-hairline)]"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--control)] text-xs font-medium text-ink-muted ring-1 ring-[var(--color-hairline)]">
              {initials(row.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.name}</p>
            <p className="truncate text-xs text-ink-faint">
              <span data-figure>{row.biometricId}</span>
              {row.designation ? ` · ${row.designation}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
        {row.department || "—"}
      </td>
      <td className="border-b border-hairline px-3 py-2.5 text-center">
        <div className="flex flex-col items-center">
          <span data-figure className="font-medium text-ink">
            {row.workingDays}
          </span>
          {row.plEligibleByPolicy && !row.plEligible && (
            <span className="mt-1 rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-rework-ink)]">
              PL DUE
            </span>
          )}
          {row.plEligible && (
            <span className="mt-1 rounded-full bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-positive-ink)]">
              PL OK
            </span>
          )}
        </div>
      </td>
      <BalanceCell
        available={row.available.CL}
        consumed={row.consumed.CL}
        entitlement={row.entitlement.CL}
        pct={clPct}
        leftBorder
      />
      <BalanceCell
        available={row.available.SL}
        consumed={row.consumed.SL}
        entitlement={row.entitlement.SL}
        pct={slPct}
        leftBorder
      />
      <BalanceCell
        available={row.available.PL}
        consumed={row.consumed.PL}
        entitlement={row.entitlement.PL}
        pct={plPct}
        leftBorder
        showNA={!row.plEligible}
      />
    </tr>
  );
}

function BalanceCell({
  available,
  consumed,
  entitlement,
  pct,
  leftBorder,
  showNA,
}) {
  if (showNA) {
    return (
      <>
        <td
          className={`border-b border-hairline px-2 py-2.5 text-center text-ink-faint ${leftBorder ? "border-l" : ""}`}
          colSpan={2}
        >
          —
        </td>
      </>
    );
  }
  const color =
    pct >= 100
      ? "text-[var(--state-overdue-ink)]"
      : pct >= 75
        ? "text-[var(--state-rework-ink)]"
        : "text-[var(--state-positive-ink)]";
  const barColor =
    pct >= 100
      ? "bg-[var(--state-overdue)]"
      : pct >= 75
        ? "bg-[var(--state-rework)]"
        : "bg-[var(--state-positive)]";
  return (
    <>
      <td
        className={`border-b border-hairline px-2 py-2.5 text-center ${leftBorder ? "border-l" : ""}`}
      >
        <span data-figure className={`font-medium ${color}`}>
          {available}
        </span>
      </td>
      <td className="border-b border-hairline px-2 py-2.5 text-center">
        <div className="flex flex-col items-center gap-1">
          <span data-figure className="text-xs text-ink-muted">
            {consumed} / {entitlement}
          </span>
          <div className="h-1 w-12 overflow-hidden rounded-full bg-[var(--control-active)]">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      </td>
    </>
  );
}

function BalanceKPI({ label, value, sub, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: { icon: "bg-[var(--control)] text-ink-muted" },
    emerald: {
      icon: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
    },
    amber: {
      icon: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    },
    rose: {
      icon: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    },
  };
  const t = tones[tone] || tones.slate;
  return (
    <Panel className="px-5 py-4" label={label}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
          {label}
        </p>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-inset ${t.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p
        data-figure
        className="text-[28px] leading-none tracking-[-0.025em] text-ink"
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-ink-faint">{sub}</p>}
    </Panel>
  );
}
