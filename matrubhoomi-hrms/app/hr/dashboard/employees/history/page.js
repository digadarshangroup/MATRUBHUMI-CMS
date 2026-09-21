"use client";

// app/hr/dashboard/employees/history/page.js
//
// Employee change history — every create/update/delete recorded in the shared
// change_logs collection, surfaced for HR. Promotions and salary hikes show as
// field diffs (grossPay, designation, jobTitle, managers…). Reached from the
// small "Change history" link on the Employees page.

import { useState, useEffect, useMemo } from "react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  History, Loader2, Search, X, TrendingUp, TrendingDown, UserPlus,
  UserMinus, Pencil,
} from "lucide-react";
import {
  Panel, PanelHead, Chip, Input, PageHead, EmptyState, InlineError,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ACTION_META = {
  create: { label: "Created", icon: UserPlus, tone: "positive" },
  update: { label: "Updated", icon: Pencil, tone: "neutral" },
  delete: { label: "Deactivated", icon: UserMinus, tone: "overdue" },
};

const FIELD_LABELS = {
  department: "Department",
  designation: "Designation",
  jobTitle: "Job title",
  status: "Status",
  email: "Email",
  phone: "Phone",
  grossPay: "Gross salary",
  primaryManager: "Primary manager",
  secondaryManager: "Secondary manager",
  name: "Name",
  biometricId: "Biometric ID",
};

function fmtVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
}

function ChangeList({ entry }) {
  const keys = Object.keys(entry.after || {});
  if (!keys.length) {
    return <span className="text-xs text-ink-faint">{entry.summary || "—"}</span>;
  }
  return (
    <ul className="flex list-none flex-col gap-1 p-0">
      {keys.map((k) => {
        const from = entry.before?.[k];
        const to = entry.after?.[k];
        const isPay = k === "grossPay";
        const up = isPay && Number(to) > Number(from || 0);
        const down = isPay && Number(to) < Number(from || 0);
        return (
          <li key={k} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="min-w-[92px] text-[11px] font-medium tracking-[0.03em] text-ink-faint uppercase">
              {FIELD_LABELS[k] || k}
            </span>
            {entry.action === "create" ? (
              <span data-figure className="text-ink">{fmtVal(to)}</span>
            ) : (
              <>
                <span data-figure className="text-ink-faint line-through">
                  {fmtVal(from)}
                </span>
                <span aria-hidden="true" className="text-ink-faint">→</span>
                <span
                  data-figure
                  className={`inline-flex items-center gap-1 ${
                    up
                      ? "text-[var(--state-positive-ink)]"
                      : down
                        ? "text-[var(--state-overdue-ink)]"
                        : "text-ink"
                  }`}
                >
                  {isPay && up && <TrendingUp size={11} />}
                  {isPay && down && <TrendingDown size={11} />}
                  {fmtVal(to)}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function EmployeeHistoryPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/employees/history?limit=200`, {
          credentials: "include",
        });
        const d = await r.json();
        if (d.success) setEntries(d.data || []);
        else setError(d.message || "Failed to load history");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(
      (e) =>
        (e.entityLabel || "").toLowerCase().includes(query) ||
        (e.actorName || "").toLowerCase().includes(query) ||
        (e.summary || "").toLowerCase().includes(query),
    );
  }, [entries, q]);

  return (
    <Hr_DashboardLayout activeMenu="employees">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Human resources"
          title="Employee change history"
          sub="Promotions, hikes, transfers and every other change made to employee records."
        />

        <Panel padded={false} label="Employee change history">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3.5">
            <PanelHead
              className="mb-0 flex-1"
              title="Changes"
              sub={
                <>
                  <span data-figure>{filtered.length}</span> entr
                  {filtered.length === 1 ? "y" : "ies"}
                </>
              }
            />
            <div className="relative w-full sm:w-[320px]">
              <Search
                aria-hidden="true"
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <Input
                type="text"
                className="pl-9"
                placeholder="Filter by employee, editor or summary…"
                aria-label="Filter change history"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
                  onClick={() => setQ("")}
                  aria-label="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div
              className="flex flex-col items-center gap-2 py-14 text-ink-muted"
              role="status"
              aria-label="Loading history"
            >
              <Loader2 className="animate-spin" size={26} aria-hidden="true" />
              <p className="text-[15px] font-medium text-ink">Loading history…</p>
            </div>
          ) : error ? (
            <div className="px-5 py-5">
              <InlineError message={error} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No history yet"
              body="Changes to employees will appear here as they happen."
            />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {["When", "Employee", "Action", "What changed", "By"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] whitespace-nowrap text-ink-faint uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const meta = ACTION_META[e.action] || ACTION_META.update;
                    const Icon = meta.icon;
                    const dt = e.createdAt ? new Date(e.createdAt) : null;
                    return (
                      <tr key={e._id} className="transition-colors hover:bg-[var(--row-hover)]">
                        <td
                          data-figure
                          className="border-b border-hairline px-3 py-2.5 text-[11.5px] whitespace-nowrap text-ink-faint"
                        >
                          {dt
                            ? dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
                              " · " +
                              dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5 text-sm text-ink">
                          {e.entityLabel || "—"}
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5">
                          <Chip tone={meta.tone}>
                            <Icon size={11} aria-hidden="true" /> {meta.label}
                          </Chip>
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5">
                          <ChangeList entry={e} />
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted">
                          {e.actorName || "—"}
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
    </Hr_DashboardLayout>
  );
}
