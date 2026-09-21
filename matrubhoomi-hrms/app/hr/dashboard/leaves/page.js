"use client";

import { useState, useEffect, useCallback } from "react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Settings,
  Search,
  Filter,
  ChevronDown,
  Download,
  RefreshCw,
  Eye,
  Check,
  X,
  AlertCircle,
  FileText,
  MoreHorizontal,
  CalendarDays,
  Briefcase,
  TrendingUp,
  Building2,
  Loader2,
  ChevronRight,
  ArrowUpRight,
  Info,
  Shield,
  Plus,
  Bell,
  BellOff,
  Mail,
  Coffee,
  LogOut,
  UserPlus,
  AlertTriangle,
  CheckCircle,
  Upload,
  Paperclip,
  Trash2,
  Award,
} from "lucide-react";
// ── NEW (round 6): Balances tab + PL sync modal ──
import BalancesTab from "./BalancesTab";
import PLSyncModal from "./PLSyncModal";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Input,
  Textarea,
  Select,
  Field,
  Tabs,
  EmptyState,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// ─── helpers ──────────────────────────────────────────────────────────────────
function apiFetch(url, opts = {}) {
  return fetch(`${API}${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || "Request failed");
    return d;
  });
}

// ─── constants ────────────────────────────────────────────────────────────────
const LEAVE_LABELS = { CL: "Casual", SL: "Sick", PL: "Privilege" };
// Leave types read in the flow palette; statuses read in the state palette, so
// colour always carries meaning rather than decoration.
const LEAVE_COLORS = {
  CL: { dot: "bg-[var(--flow-created)]", tone: "risk" },
  SL: { dot: "bg-[var(--flow-rework)]", tone: "rework" },
  PL: { dot: "bg-[var(--flow-approved)]", tone: "positive" },
  LWP: { dot: "bg-[var(--state-overdue)]", tone: "overdue" },
  CO: { dot: "bg-[var(--flow-assigned)]", tone: "extension" },
  WFH: { dot: "bg-[var(--flow-completed)]", tone: "neutral" },
};
const STATUS_META = {
  pending: {
    label: "Pending",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
  },
  manager_approved: {
    label: "Mgr. Approved",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
  },
  hr_approved: {
    label: "Approved",
    tone: "positive",
    dot: "bg-[var(--state-positive)]",
  },
  hr_rejected: {
    label: "Rejected",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
  },
  manager_rejected: {
    label: "Mgr. Rejected",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    dot: "bg-ink/40",
  },
};
const LEAVE_TYPE_DEFS = [
  { key: "CL", label: "Casual", color: "var(--flow-created)" },
  { key: "SL", label: "Sick", color: "var(--flow-rework)" },
  { key: "PL", label: "Privilege", color: "var(--flow-approved)" },
  { key: "LWP", label: "LWP", color: "var(--state-overdue)" },
  { key: "CO", label: "Comp-Off", color: "var(--flow-assigned)" },
  { key: "WFH", label: "WFH", color: "var(--flow-completed)" },
];

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESERVED DAYS
//
//  `available` = entitlement − consumed, and `consumed` counts only leave that
//  reached hr_approved. So an employee with 6 CL who has already applied for 3
//  and is still waiting on their manager still reads as "6 available" here —
//  and HR, seeing 6, adds another 3 on their behalf. Both get approved and the
//  employee is 6 CL down against a 6 CL entitlement, with the overage landing
//  as LWP in payroll.
//
//  The fix is disclosure, not recalculation: `available` keeps its exact
//  meaning (payroll and the paid/LWP split both read it), and the reserved
//  figure is shown beside it.
//
//  This mirrors BACKEND/utils/leaveReserve.js computeReserved() exactly:
//    · statuses pending + manager_approved only — withdraw_pending is excluded
//      because those days are already inside `consumed`
//    · CL / SL / PL only — QUICK has no bucket yet, LOP never deducts
//    · paidDays ?? totalDays, the codebase-wide convention for older rows
//
//  It is derived here rather than read off the API because
//  GET /api/hr/leaves/employee-balance/:id does not return it yet. The moment
//  it does, the endpoint value wins (see the effect above) and this can go.
// ─────────────────────────────────────────────────────────────────────────────
const RESERVING_STATUSES = ["pending", "manager_approved"];

async function deriveReserved(employee) {
  const empty = { CL: 0, SL: 0, PL: 0 };
  if (!employee?._id) return empty;
  const year = new Date().getFullYear();
  const name = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  try {
    // The HR list endpoint has no employeeId filter, so over-fetch by name and
    // then match exactly on the populated id — a name regex alone would fold in
    // namesakes.
    const d = await apiFetch(
      `/api/hr/leaves/?year=${year}&limit=200&search=${encodeURIComponent(name)}`,
    );
    const rows = d?.data || [];
    const out = { ...empty };
    for (const a of rows) {
      const owner = String(a.employeeId?._id || a.employeeId || "");
      if (owner !== String(employee._id)) continue;
      if (!RESERVING_STATUSES.includes(a.status)) continue;
      if (out[a.leaveType] === undefined) continue;
      const days = a.paidDays != null ? a.paidDays : a.totalDays || 0;
      if (days > 0) out[a.leaveType] += days;
    }
    return out;
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HR ADD LEAVE ON BEHALF MODAL — with SL document upload
// ─────────────────────────────────────────────────────────────────────────────
function HRAddLeaveModal({ onClose, onSuccess, config: pageConfig }) {
  const [employee, setEmployee] = useState(null);
  const [query, setQuery] = useState("");
  const [empResults, setEmpResults] = useState([]);
  const [balance, setBalance] = useState(null);
  // Days already spoken for by applications that are still moving through the
  // manager chain. NOT deducted from `available` — see deriveReserved().
  const [reserved, setReserved] = useState(null);
  const [form, setForm] = useState({
    leaveType: "CL",
    startDate: "",
    endDate: "",
    isHalfDay: false,
    reason: "",
    hrRemarks: "",
  });
  const [docFile, setDocFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const slThreshold = pageConfig?.slDocumentThreshold ?? 2;

  useEffect(() => {
    if (query.length < 2) {
      setEmpResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(
        `/api/employees/all?search=${encodeURIComponent(query)}&limit=8&status=active`,
      )
        .then((d) => setEmpResults(d.data?.employees || d.data || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!employee?._id) {
      setBalance(null);
      setReserved(null);
      return;
    }
    let live = true;
    apiFetch(`/api/hr/leaves/employee-balance/${employee._id}`)
      .then((d) => {
        if (!live) return;
        setBalance(d.data);
        // The server computes `reserved` with the same computeReserved() helper
        // the employee's own app screen reads, so it is authoritative and the
        // client-side derivation below never runs. The fallback exists only for
        // a frontend deployed ahead of the backend — it over-fetches by name and
        // is strictly worse, so it is not fired unless it is actually needed.
        if (d.data?.reserved) {
          setReserved(d.data.reserved);
          return;
        }
        deriveReserved(employee).then((r) => {
          if (live) setReserved((prev) => prev ?? r);
        });
      })
      .catch(() => {
        if (!live) return;
        deriveReserved(employee).then((r) => {
          if (live) setReserved((prev) => prev ?? r);
        });
      });
    return () => {
      live = false;
    };
  }, [employee?._id]);

  useEffect(() => {
    if (form.leaveType !== "SL") setDocFile(null);
  }, [form.leaveType]);

  const selectEmp = (emp) => {
    setEmployee(emp);
    setQuery(`${emp.firstName} ${emp.lastName}`);
    setEmpResults([]);
  };

  const days = (() => {
    if (!form.startDate || !form.endDate) return 0;
    if (form.isHalfDay) return 0.5;
    return Math.max(
      1,
      Math.round(
        (new Date(form.endDate) - new Date(form.startDate)) / 86400000,
      ) + 1,
    );
  })();

  const needsDoc =
    form.leaveType === "SL" && days > slThreshold && !form.isHalfDay;

  // Disclosure only — `available` is left exactly as the server computes it,
  // because payroll and the apply-time paid/LWP split both read that number.
  const reservedDays = reserved?.[form.leaveType] || 0;
  const rawAvailable = balance?.available?.[form.leaveType];
  const effectiveAvailable =
    rawAvailable === undefined ? null : Math.max(0, rawAvailable - reservedDays);

  const submit = async () => {
    setError("");
    if (!employee) return setError("Select an employee.");
    if (!form.startDate || !form.endDate) return setError("Select dates.");
    if (new Date(form.startDate) > new Date(form.endDate))
      return setError("End date must be after start date.");
    if (!form.reason.trim()) return setError("Enter a reason.");
    if (needsDoc && !docFile)
      return setError(
        "Please attach a supporting document for this Sick Leave.",
      );

    setLoading(true);
    try {
      const res = await apiFetch("/api/hr/leaves/add-on-behalf", {
        method: "POST",
        body: JSON.stringify({ employeeId: employee._id, ...form, days }),
      });

      const leaveId = res.data?._id || res.data?.leaveId;

      if (needsDoc && docFile && leaveId) {
        setDocUploading(true);
        const fd = new FormData();
        fd.append("document", docFile);
        try {
          const uploadRes = await fetch(
            `${API}/api/hr/leaves/${leaveId}/upload-document`,
            { method: "POST", credentials: "include", body: fd },
          );
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok || !uploadData.success) {
            console.warn("Doc upload failed:", uploadData.message);
          }
        } catch (uploadErr) {
          console.warn("Doc upload error:", uploadErr.message);
        } finally {
          setDocUploading(false);
        }
      }

      setDone(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1600);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setDocUploading(false);
    }
  };

  const selType = LEAVE_TYPE_DEFS.find((t) => t.key === form.leaveType);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/55"
        onClick={onClose}
      />
      <div className="frost-bar relative flex max-h-full min-h-0 w-full max-w-md flex-col rounded-panel border border-hairline">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
          <div className="w-9 h-9 rounded-inset bg-ink flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-4 h-4 text-[var(--body-bg)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.02em] text-ink">
              Add Leave on Behalf
            </h2>
            <p className="text-xs text-ink-faint">
              Auto-approved · bypasses HOD workflow
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full hover:bg-[var(--control)] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <div className="w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-[var(--state-positive-ink)]" />
            </div>
            <p className="text-[15px] font-medium text-ink">Leave Added ✓</p>
            <p className="text-xs text-ink-muted">
              {form.leaveType} for {employee?.firstName} approved immediately
            </p>
          </div>
        ) : (
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="relative">
              <span className="mb-1.5 block text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Employee
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setEmployee(null);
                    setBalance(null);
                  }}
                  placeholder="Search by name or biometric ID…"
                  aria-label="Employee"
                  className="pl-9"
                />
              </div>
              {empResults.length > 0 && (
                <div className="frost-bar scroll-slim absolute z-50 top-full mt-1 w-full rounded-card border border-hairline max-h-52 overflow-y-auto">
                  {empResults.map((emp) => (
                    <button
                      key={emp._id}
                      onClick={() => selectEmp(emp)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--row-hover)] text-left transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-[var(--control)] flex items-center justify-center text-[11px] font-medium text-ink-muted flex-shrink-0">
                        {initials(`${emp.firstName} ${emp.lastName}`)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-ink-faint truncate">
                          <span data-figure>{emp.biometricId}</span> · {emp.department}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {employee && (
                <div className="mt-2 px-3 py-2 bg-[var(--surface-sunken)] rounded-inset text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[var(--control)] flex items-center justify-center text-[10px] font-medium text-ink-muted flex-shrink-0">
                      {initials(`${employee.firstName} ${employee.lastName}`)}
                    </div>
                    <span className="font-medium text-ink">
                      {employee.firstName} {employee.lastName}
                    </span>
                    <span className="text-ink-faint">·</span>
                    <span className="text-ink-muted">{employee.department}</span>
                    {balance && (
                      <span className="ml-auto font-medium text-ink">
                        Balance:{" "}
                        <span data-figure>
                          {balance.available?.[form.leaveType] ?? "—"}
                        </span>{" "}
                        {form.leaveType}
                      </span>
                    )}
                  </div>
                  {reservedDays > 0 && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--state-rework-ink)]">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-[1px]" />
                      <span>
                        <span data-figure>{reservedDays}</span> day
                        {reservedDays !== 1 ? "s" : ""} of {form.leaveType} already
                        requested and awaiting approval. Counting those, only{" "}
                        <span data-figure>{effectiveAvailable}</span> {form.leaveType}{" "}
                        {effectiveAvailable === 1 ? "is" : "are"} really free.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Leave Type
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {LEAVE_TYPE_DEFS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setForm((f) => ({ ...f, leaveType: t.key }))}
                    aria-pressed={form.leaveType === t.key}
                    className="rounded-inset py-2.5 text-xs font-medium transition-colors"
                    style={{
                      boxShadow: `inset 0 0 0 ${form.leaveType === t.key ? "1.5px" : "1px"} ${
                        form.leaveType === t.key
                          ? t.color
                          : "var(--color-hairline)"
                      }`,
                      background:
                        form.leaveType === t.key
                          ? `color-mix(in srgb, ${t.color} 18%, transparent)`
                          : "var(--surface-raised)",
                      color:
                        form.leaveType === t.key ? t.color : "var(--ink-muted)",
                    }}
                  >
                    {t.key}
                    <span className="block text-[9px] font-normal mt-0.5 opacity-70">
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {["startDate", "endDate"].map((k, i) => (
                <Field key={k} label={i === 0 ? "From" : "To"}>
                  <Input
                    type="date"
                    value={form[k]}
                    min={k === "endDate" ? form.startDate : undefined}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [k]: e.target.value,
                        ...(k === "startDate" && !f.endDate
                          ? { endDate: e.target.value }
                          : {}),
                      }))
                    }
                  />
                </Field>
              ))}
            </div>

            {form.leaveType === "CL" &&
              form.startDate &&
              form.startDate === form.endDate && (
                <label className="flex items-center gap-3 cursor-pointer px-3 py-2.5 bg-[var(--surface-sunken)] rounded-inset">
                  <div
                    onClick={() =>
                      setForm((f) => ({ ...f, isHalfDay: !f.isHalfDay }))
                    }
                    className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.isHalfDay ? "bg-ink" : "bg-[var(--control-active)]"}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 bg-[var(--surface-raised)] rounded-full transition-transform ${form.isHalfDay ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </div>
                  <span className="text-sm text-ink">
                    Half Day{" "}
                    <span className="text-ink-faint">
                      (<span data-figure>0.5</span> CL)
                    </span>
                  </span>
                </label>
              )}

            {days > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-inset text-sm font-medium"
                style={{
                  background: `color-mix(in srgb, ${selType?.color || "var(--color-ink)"} 16%, transparent)`,
                  color: selType?.color,
                }}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span data-figure>{days}</span> day{days !== 1 ? "s" : ""} of{" "}
                {selType?.label} Leave
                {rawAvailable !== undefined && rawAvailable !== null && (
                  <span className="ml-auto text-xs opacity-70">
                    After:{" "}
                    <span data-figure>
                      {(rawAvailable - days).toFixed(1)}
                    </span>{" "}
                    remaining
                    {reservedDays > 0 && (
                      <>
                        {" "}
                        (
                        <span data-figure>
                          {(effectiveAvailable - days).toFixed(1)}
                        </span>{" "}
                        once the <span data-figure>{reservedDays}</span> pending
                        day{reservedDays !== 1 ? "s" : ""} clear)
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            {form.leaveType === "SL" && days > 0 && (
              <div
                className={`rounded-card p-3.5 space-y-3 transition-colors ${needsDoc ? "bg-[color-mix(in_srgb,var(--state-rework)_16%,transparent)]" : "bg-[var(--surface-sunken)]"}`}
              >
                <div className="flex items-start gap-2">
                  {needsDoc ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--state-rework-ink)] flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-ink-faint flex-shrink-0 mt-0.5" />
                  )}
                  <p
                    className={`text-xs leading-relaxed ${needsDoc ? "text-[var(--state-rework-ink)]" : "text-ink-muted"}`}
                  >
                    {needsDoc
                      ? `SL of ${days} days requires a supporting document (PDF or photo).`
                      : `Optionally attach a medical document for this Sick Leave.`}
                  </p>
                </div>
                {docFile ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface-raised)] rounded-inset border border-hairline">
                    <div className="w-8 h-8 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-[var(--state-positive-ink)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink truncate">
                        {docFile.name}
                      </p>
                      <p className="text-[10px] text-ink-faint">
                        <span data-figure>
                          {(docFile.size / 1024).toFixed(1)}
                        </span>{" "}
                        KB · Ready to upload
                      </p>
                    </div>
                    <button
                      onClick={() => setDocFile(null)}
                      aria-label="Remove document"
                      className="w-6 h-6 rounded-full bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] flex items-center justify-center flex-shrink-0 hover:bg-[color-mix(in_srgb,var(--state-overdue)_32%,transparent)]"
                    >
                      <Trash2 className="w-3 h-3 text-[var(--state-overdue-ink)]" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`flex items-center justify-center gap-2 px-4 py-3 bg-[var(--surface-raised)] rounded-card cursor-pointer transition-colors hover:bg-[var(--control)] ${needsDoc ? "shadow-[inset_0_0_0_1.5px_var(--state-rework)]" : "shadow-[inset_0_0_0_1px_var(--color-hairline)]"}`}
                  >
                    <Upload
                      className={`w-4 h-4 ${needsDoc ? "text-[var(--state-rework-ink)]" : "text-ink-faint"}`}
                    />
                    <span
                      className={`text-xs font-medium ${needsDoc ? "text-[var(--state-rework-ink)]" : "text-ink-muted"}`}
                    >
                      Attach document
                      <span className="font-normal ml-1 text-ink-faint">
                        (PDF, JPG, PNG)
                      </span>
                      {needsDoc && (
                        <span className="text-[var(--state-overdue-ink)] ml-1">
                          *
                        </span>
                      )}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            )}

            <Field label="Reason">
              <Textarea
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                rows={2}
                placeholder="Reason for leave…"
              />
            </Field>

            <Field label="HR Remarks" hint="Optional — visible only to HR">
              <Input
                value={form.hrRemarks}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hrRemarks: e.target.value }))
                }
                placeholder="Internal note visible only to HR…"
              />
            </Field>

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_16%,transparent)] text-xs text-[var(--state-rework-ink)]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              HR-added leaves are <strong>&nbsp;auto-approved</strong> and skip
              the manager / HOD workflow entirely.
            </div>

            {error && <InlineError compact message={error} />}

            <div className="flex gap-2 pt-1 pb-2">
              <Button onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <RoleGate min="editor">
              <Button
                tone="primary"
                onClick={submit}
                className="flex-[2]"
                disabled={
                  loading ||
                  docUploading ||
                  !employee ||
                  !form.startDate ||
                  !form.endDate ||
                  !form.reason.trim() ||
                  (needsDoc && !docFile)
                }
              >
                {docUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading doc…
                  </>
                ) : loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Add Leave
                  </>
                )}
              </Button>
              </RoleGate>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION PREFERENCES PANEL
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_TYPES = [
  {
    key: "checkin_missing",
    Icon: Clock,
    label: "Missing Check-In",
    desc: "Alert at 10:15 AM for employees who haven't punched in and have no approved leave",
    time: "10:15 AM",
  },
  {
    key: "lunch_missing",
    Icon: Coffee,
    label: "Lunch Punch Missing",
    desc: "Alert at 1:30 PM (lunch-in missing) and 2:30 PM (lunch-out missing) for operators",
    time: "1:30 + 2:30 PM",
  },
  {
    key: "checkout_missing",
    Icon: LogOut,
    label: "Missing Check-Out",
    desc: "Alert at 6:00 PM for employees who punched in but haven't checked out",
    time: "6:00 PM",
  },
  {
    key: "yesterday_digest",
    Icon: Mail,
    label: "Morning Digest Email",
    desc: "Email + push at 9:00 AM summarising all unresolved issues from the previous day",
    time: "9:00 AM",
  },
];

function NotificationPrefsPanel() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState("default");
  const [subscribing, setSubscribing] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [missed, setMissed] = useState(0);
  const [missedList, setMissedList] = useState([]);

  useEffect(() => {
    apiFetch("/api/hr/attendance/notification-settings")
      .then((d) => setSettings(d.data))
      .catch(() => {});
    if ("Notification" in window) setPushStatus(Notification.permission);
    apiFetch("/api/hr/attendance/missed-punches")
      .then((d) => {
        setMissed(d.count || 0);
        setMissedList(d.data || []);
      })
      .catch(() => {});
  }, []);

  const saveSettings = (updated) => {
    setSaving(true);
    apiFetch("/api/hr/attendance/notification-settings", {
      method: "PUT",
      body: JSON.stringify(updated),
    })
      .then((d) => {
        setSettings(d.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const toggle = (key) => {
    const u = { ...settings, [key]: !settings[key] };
    setSettings(u);
    saveSettings(u);
  };

  const enablePush = async () => {
    setSubscribing(true);
    try {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
      if (perm !== "granted") return;
      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, getToken } = await import("firebase/messaging");
      const app = getApps().length
        ? getApps()[0]
        : initializeApp({
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            messagingSenderId:
              process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          });
      const sw = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
      const token = await getToken(getMessaging(app), {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: sw,
      });
      if (token)
        await apiFetch("/api/hr/attendance/notification-subscribe", {
          method: "POST",
          body: JSON.stringify({ fcmToken: token }),
        });
    } catch (e) {
      console.error("Push enable:", e.message);
    } finally {
      setSubscribing(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    const d = await apiFetch("/api/hr/attendance/notification-test", {
      method: "POST",
    }).catch((e) => ({ message: e.message, success: false }));
    setTestMsg(d.message || "Done");
    setTimeout(() => setTestMsg(""), 3000);
    setTesting(false);
  };

  const ISSUE_LABEL = {
    no_checkin: "No Check-In",
    no_checkout: "No Check-Out",
    no_lunch_in: "No Lunch-In",
    no_lunch_out: "No Lunch-Out",
  };
  const ISSUE_COLOR = {
    no_checkin: "overdue",
    no_checkout: "rework",
    no_lunch_in: "extension",
    no_lunch_out: "extension",
  };

  if (!settings)
    return (
      <div className="flex justify-center py-12" role="status">
        <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
      </div>
    );

  return (
    <div className="space-y-5 max-w-2xl">
      {missed > 0 && (
        <Panel padded={false} label="Punch issues today">
          <div className="flex items-center gap-3 px-4 py-3 rounded-t-card bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)]">
            <AlertCircle className="w-4 h-4 text-[var(--state-overdue-ink)] flex-shrink-0" />
            <span className="text-sm font-medium text-[var(--state-overdue-ink)] flex-1">
              <span data-figure>{missed}</span> employee
              {missed > 1 ? "s" : ""} with punch issues today
            </span>
            <span
              data-figure
              className="w-6 h-6 bg-[var(--state-overdue)] text-[var(--body-bg)] text-xs font-medium rounded-full flex items-center justify-center flex-shrink-0"
            >
              {missed > 9 ? "9+" : missed}
            </span>
          </div>
          {missedList.length > 0 && (
            <div className="border-t border-hairline divide-y divide-hairline">
              {missedList.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--control)] flex items-center justify-center text-[10px] font-medium text-ink-muted flex-shrink-0">
                    {initials(item.name || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink truncate">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-ink-faint truncate">
                      <span data-figure>{item.biometricId}</span> ·{" "}
                      {item.department}
                    </p>
                  </div>
                  <Chip tone={ISSUE_COLOR[item.issueType] || "neutral"}>
                    {ISSUE_LABEL[item.issueType] || item.issueType}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel padded={false} label="Browser Push Notifications">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <Bell className="w-3.5 h-3.5 text-ink-faint" />
          <span className="text-[11px] font-medium text-ink-faint uppercase tracking-[0.09em]">
            Browser Push Notifications
          </span>
        </div>
        <div className="px-4 py-4 space-y-3">
          {pushStatus === "granted" ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[var(--state-positive-ink)] flex-shrink-0" />
              <span className="text-sm text-ink flex-1">
                Enabled for this browser ✓
              </span>
              <RoleGate min="editor">
              <Button size="sm" onClick={sendTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bell className="w-3 h-3" />
                )}{" "}
                Send test
              </Button>
              </RoleGate>
            </div>
          ) : pushStatus === "denied" ? (
            <p className="text-sm text-[var(--state-overdue-ink)] flex items-center gap-2">
              <BellOff className="w-4 h-4 flex-shrink-0" />
              Blocked in browser — update site settings then reload the page.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-ink-faint flex-shrink-0" />
              <span className="text-sm text-ink-muted flex-1">
                Enable to get real-time punch alerts in this browser
              </span>
              <RoleGate min="editor">
              <Button
                size="sm"
                tone="primary"
                onClick={enablePush}
                disabled={subscribing}
              >
                {subscribing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : null}{" "}
                Enable
              </Button>
              </RoleGate>
            </div>
          )}
          {testMsg && (
            <p className="text-xs text-[var(--state-positive-ink)] bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] px-3 py-1.5 rounded-inset">
              {testMsg}
            </p>
          )}
          <div className="flex items-start gap-2 text-xs text-ink-muted bg-[var(--surface-sunken)] px-3 py-2 rounded-inset">
            <Mail className="w-3 h-3 flex-shrink-0 mt-0.5" />
            If push fails or the browser is closed, a digest email is
            automatically sent to all active HR accounts.
          </div>
        </div>
      </Panel>

      <Panel padded={false} label="Alert Schedule">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <span className="text-[11px] font-medium text-ink-faint uppercase tracking-[0.09em]">
            Alert Schedule
          </span>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-[var(--state-positive-ink)] font-medium">
                Saved ✓
              </span>
            )}
            {saving && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-faint" />
            )}
          </div>
        </div>
        <div className="divide-y divide-hairline">
          {NOTIF_TYPES.map(({ key, Icon, label, desc, time }) => (
            <div key={key} className="flex items-center gap-4 px-4 py-4">
              <Icon className="w-4 h-4 text-ink-faint flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <span
                    data-figure
                    className="text-[9px] bg-[var(--control)] text-ink-muted px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                  >
                    {time}
                  </span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{desc}</p>
              </div>
              <RoleGate min="editor">
              <button
                onClick={() => toggle(key)}
                disabled={saving}
                role="switch"
                aria-checked={!!settings[key]}
                aria-label={label}
                className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${settings[key] ? "bg-ink" : "bg-[var(--control-active)]"} disabled:opacity-40`}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 bg-[var(--surface-raised)] rounded-full transition-transform ${settings[key] ? "translate-x-[21px]" : "translate-x-[3px]"}`}
                />
              </button>
              </RoleGate>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-card bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] text-xs text-[var(--state-risk-ink)]">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Smart fallback:</strong> Push is always tried first. If no
          tokens are registered or every send fails, a consolidated email digest
          is automatically sent to all HR accounts — so no alert is ever
          silently dropped.
        </span>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent }) {
  // Accent is meaning, not decoration: it tints the glyph and the figure from
  // the state palette so a red count reads as "rejected", never as styling.
  const accents = {
    slate: {
      icon: "bg-[var(--control)] text-ink-muted",
      val: "text-ink",
    },
    orange: {
      icon: "bg-[color-mix(in_srgb,var(--state-rework)_24%,transparent)] text-[var(--state-rework-ink)]",
      val: "text-[var(--state-rework-ink)]",
    },
    emerald: {
      icon: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
      val: "text-[var(--state-positive-ink)]",
    },
    red: {
      icon: "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]",
      val: "text-[var(--state-overdue-ink)]",
    },
    blue: {
      icon: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
      val: "text-[var(--state-risk-ink)]",
    },
  };
  const a = accents[accent] || accents.slate;
  return (
    <Panel label={label}>
      <div className="flex items-center justify-between mb-3">
        <p className="truncate text-[11px] font-medium text-ink-faint uppercase tracking-[0.09em]">
          {label}
        </p>
        <div
          className={`w-8 h-8 rounded-inset flex items-center justify-center shrink-0 ${a.icon}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p
        data-figure
        className={`text-[28px] leading-none tracking-[-0.025em] ${a.val}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-ink-faint mt-1.5">{sub}</p>}
    </Panel>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <Chip tone={m.tone}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </Chip>
  );
}

function LeaveChip({ type }) {
  const c = LEAVE_COLORS[type] || LEAVE_COLORS.CL;
  return (
    <Chip tone={c.tone}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {LEAVE_LABELS[type] || type}
    </Chip>
  );
}

function ConfigModal({ config, onClose, onSave }) {
  const [form, setForm] = useState({ ...config });
  const [saving, setSaving] = useState(false);
  const f = (k) => ({
    value: form[k],
    onChange: (e) => setForm((p) => ({ ...p, [k]: Number(e.target.value) })),
  });
  const fields = [
    { key: "clPerYear", label: "Casual Leave / year", suffix: "days" },
    { key: "slPerYear", label: "Sick Leave / year", suffix: "days" },
    { key: "plPerYear", label: "Privilege Leave / year", suffix: "days" },
    {
      key: "initialWaitingDays",
      label: "Waiting period (new joiners)",
      suffix: "working days",
    },
    {
      key: "daysRequiredForPL",
      label: "PL eligibility after",
      suffix: "working days",
    },
    {
      key: "slDocumentThreshold",
      label: "SL document required ≥",
      suffix: "days",
    },
    { key: "maxCLPerMonth", label: "Max CL days / month", suffix: "days" },
    {
      key: "maxLeaveDaysPerMonth",
      label: "Monthly cap (non-Odisha)",
      suffix: "days",
    },
    {
      key: "maxLeaveDaysPerMonthOdisha",
      label: "Monthly cap (Odisha)",
      suffix: "days",
    },
  ];
  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="frost-bar flex max-h-full min-h-0 w-full max-w-md flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-hairline">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-inset bg-[var(--control)] flex items-center justify-center shrink-0">
              <Settings className="w-4 h-4 text-ink-muted" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-medium tracking-[-0.02em] text-ink">
                Leave Configuration
              </h2>
              <p className="text-xs text-ink-faint">
                Policy applies company-wide
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full hover:bg-[var(--control)] transition-colors"
          >
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-6 space-y-3">
          {fields.map(({ key, label, suffix }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label className="text-sm text-ink flex-1">{label}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  data-figure
                  aria-label={label}
                  className="w-20 text-center"
                  {...f(key)}
                />
                <span className="text-xs text-ink-faint w-20">{suffix}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-hairline">
          <Button tone="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <RoleGate min="editor">
          <Button tone="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" /> Save
              </>
            )}
          </Button>
          </RoleGate>
        </div>
      </div>
    </div>
  );
}

function LeaveDrawer({ app, onClose, onApprove, onReject, actionLoading }) {
  const [remarks, setRemarks] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  if (!app) return null;

  const canAct = ["pending", "manager_approved"].includes(app.status);
  const primaryApproved = app.managerDecisions?.some(
    (d) => d.type === "primary" && d.decision === "approved",
  );
  const hasPrimary = app.managersNotified?.some((m) => m.type === "primary");
  const blockedByPrimary =
    hasPrimary && !primaryApproved && app.status === "pending";

  return (
    <div className="fixed inset-0 z-[80] flex overflow-hidden" onClick={onClose}>
      <div className="flex-1 bg-black/55" />
      <div
        className="frost-bar flex h-full min-h-0 w-full max-w-lg flex-col border-l border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4 border-b border-hairline">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[var(--control)] flex items-center justify-center text-sm font-medium text-ink-muted shrink-0">
              {initials(app.employeeName)}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-medium tracking-[-0.02em] text-ink truncate">
                {app.employeeName}
              </h2>
              <p className="text-xs text-ink-faint truncate">
                {app.designation} · {app.department}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={app.status} />
            {app.addedByHR && <Chip tone="risk">HR Added</Chip>}
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-full hover:bg-[var(--control)] transition-colors"
            >
              <X className="w-4 h-4 text-ink-muted" />
            </button>
          </div>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
          <div className="bg-[var(--surface-sunken)] rounded-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <LeaveChip type={app.leaveType} />
              <span className="text-sm font-medium text-ink">
                <span data-figure>{app.totalDays}</span>{" "}
                {app.totalDays === 0.5
                  ? "half day"
                  : app.totalDays === 1
                    ? "day"
                    : "days"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-faint mb-0.5">From</p>
                <p data-figure className="font-medium text-ink">
                  {fmt(app.fromDate || app.startDate?.slice(0, 10))}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-faint mb-0.5">To</p>
                <p data-figure className="font-medium text-ink">
                  {fmt(app.toDate || app.endDate?.slice(0, 10))}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Reason</p>
              <p className="text-sm text-ink">{app.reason}</p>
            </div>
            {app.hrRemarks && (
              <div>
                <p className="text-xs text-ink-faint mb-0.5">HR Remarks</p>
                <p className="text-sm text-ink italic">{app.hrRemarks}</p>
              </div>
            )}
            {app.isHalfDay && (
              <div className="inline-flex items-center gap-1.5 text-xs text-ink-muted bg-[var(--surface-raised)] rounded-inset px-2 py-1 border border-hairline">
                <Info className="w-3 h-3" />{" "}
                {app.halfDaySlot === "first_half"
                  ? "First half"
                  : "Second half"}
              </div>
            )}
          </div>

          {app.requiresDocument && (
            <div
              className={`flex items-center gap-3 p-3 rounded-card text-sm ${app.documentSubmitted ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)]" : "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)]"}`}
            >
              <FileText
                className={`w-4 h-4 flex-shrink-0 ${app.documentSubmitted ? "text-[var(--state-positive-ink)]" : "text-[var(--state-rework-ink)]"}`}
              />
              <div className="flex-1">
                {app.documentSubmitted ? (
                  <>
                    <p className="font-medium text-[var(--state-positive-ink)]">
                      Document submitted
                    </p>
                    {app.documentUrl && (
                      <a
                        href={app.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--state-positive-ink)] underline"
                      >
                        View document ↗
                      </a>
                    )}
                  </>
                ) : (
                  <p className="font-medium text-[var(--state-rework-ink)]">
                    Document pending submission
                  </p>
                )}
              </div>
            </div>
          )}

          {app.managersNotified?.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-ink-faint uppercase tracking-[0.09em] mb-2">
                Approval Flow
              </p>
              <div className="space-y-2">
                {app.managersNotified.map((mgr, i) => {
                  const decision = app.managerDecisions?.find(
                    (d) => String(d.managerId) === String(mgr.managerId),
                  );
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-inset bg-[var(--surface-sunken)]"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${decision?.decision === "approved" ? "bg-[var(--state-positive)]" : decision?.decision === "rejected" ? "bg-[var(--state-overdue)]" : "bg-[var(--control-active)]"}`}
                      >
                        {decision?.decision === "approved" ? (
                          <Check className="w-3 h-3 text-[var(--body-bg)]" />
                        ) : decision?.decision === "rejected" ? (
                          <X className="w-3 h-3 text-[var(--body-bg)]" />
                        ) : (
                          <Clock className="w-3 h-3 text-ink-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-ink truncate">
                          {mgr.managerName || "—"}
                        </p>
                        <p className="text-[10px] text-ink-faint capitalize">
                          {mgr.type} manager
                        </p>
                      </div>
                      {decision && (
                        <span
                          className={`text-[10px] font-medium uppercase tracking-[0.09em] ${decision.decision === "approved" ? "text-[var(--state-positive-ink)]" : "text-[var(--state-overdue-ink)]"}`}
                        >
                          {decision.decision}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 p-2.5 rounded-inset bg-[var(--surface-sunken)]">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${app.status === "hr_approved" ? "bg-[var(--state-positive)]" : app.status === "hr_rejected" ? "bg-[var(--state-overdue)]" : "bg-[var(--control-active)]"}`}
                  >
                    {app.status === "hr_approved" ? (
                      <Check className="w-3 h-3 text-[var(--body-bg)]" />
                    ) : app.status === "hr_rejected" ? (
                      <X className="w-3 h-3 text-[var(--body-bg)]" />
                    ) : (
                      <Shield className="w-3 h-3 text-ink-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-ink">
                      HR / Final Approval
                    </p>
                  </div>
                  {app.status === "hr_approved" && (
                    <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--state-positive-ink)]">
                      Approved
                    </span>
                  )}
                  {app.status === "hr_rejected" && (
                    <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--state-overdue-ink)]">
                      Rejected
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {app.status === "hr_approved" && (
            <div
              className={`flex items-center gap-2.5 p-3 rounded-card text-xs ${app.appliedToAttendance ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]" : "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]"}`}
            >
              {app.appliedToAttendance ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              {app.appliedToAttendance
                ? `Synced to attendance on ${app.appliedAt ? new Date(app.appliedAt).toLocaleDateString("en-IN") : "—"}`
                : "Pending attendance sync"}
            </div>
          )}
        </div>

        {canAct && (
          <div className="shrink-0 border-t border-hairline p-4 space-y-3">
            {blockedByPrimary && (
              <div className="flex items-center gap-2 p-3 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-xs text-[var(--state-rework-ink)]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Waiting for primary manager approval before HR can act.
              </div>
            )}
            {!showReject ? (
              <div className="flex items-center gap-2">
                <Input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Remarks (optional)…"
                  aria-label="Remarks"
                  className="flex-1"
                />
                <RoleGate min="editor">
                <Button
                  tone="primary"
                  onClick={() => onApprove(app._id, remarks)}
                  disabled={actionLoading || blockedByPrimary}
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}{" "}
                  Approve
                </Button>
                </RoleGate>
                <RoleGate min="editor">
                <Button
                  tone="destructive"
                  onClick={() => setShowReject(true)}
                  disabled={actionLoading}
                >
                  <X className="w-4 h-4" /> Reject
                </Button>
                </RoleGate>
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection (required)…"
                  aria-label="Reason for rejection"
                  rows={3}
                />
                <div className="flex items-center gap-2">
                  <Button
                    tone="ghost"
                    onClick={() => setShowReject(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <RoleGate min="editor">
                  <Button
                    tone="destructive"
                    onClick={() => onReject(app._id, rejectionReason)}
                    disabled={!rejectionReason.trim() || actionLoading}
                    className="flex-1"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}{" "}
                    Confirm Reject
                  </Button>
                  </RoleGate>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN PAGE
//  Round 6 changes:
//    • New tab "balances" between Applications and Calendar
//    • New "Sync PL" button in header (opens PLSyncModal)
//    • New state showPLSync
//    • Renders BalancesTab and PLSyncModal conditionally
// ─────────────────────────────────────────────────────────────────────────────
export default function LeaveManagementPage() {
  const [tab, setTab] = useState("applications");
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    manager_approved: 0,
    hr_approved: 0,
    hr_rejected: 0,
    byType: { CL: 0, SL: 0, PL: 0 },
  });
  const [config, setConfig] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerApp, setDrawerApp] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddLeave, setShowAddLeave] = useState(false);
  // ── NEW (round 6): PL sync modal ──
  const [showPLSync, setShowPLSync] = useState(false);
  const [banner, setBanner] = useState(null);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [holidayYear, setHolidayYear] = useState(
    String(new Date().getFullYear()),
  );

  const showBanner = (type, msg) => {
    setBanner({ type, msg });
    setTimeout(() => setBanner(null), 4000);
  };

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("leaveType", filterType);
      if (filterDept !== "all") params.set("department", filterDept);
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(`${API}/api/hr/leaves?${params}`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.success) {
        setApps(d.data.applications);
        setTotal(d.data.total);
        setPages(d.data.pages);
        setStats(d.data.stats);
      }
    } catch (_) {
      showBanner("error", "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterDept, search, page]);

  const loadConfig = async () => {
    try {
      const d = await apiFetch("/api/hr/leaves/config");
      setConfig(d.data);
    } catch (_) {}
  };
  const loadHolidays = async (y) => {
    try {
      const d = await apiFetch(`/api/hr/leaves/holidays?year=${y}`);
      setHolidays(d.data);
    } catch (_) {}
  };

  useEffect(() => {
    loadApps();
  }, [loadApps]);
  useEffect(() => {
    loadConfig();
  }, []);
  useEffect(() => {
    loadHolidays(holidayYear);
  }, [holidayYear]);

  const openDrawer = async (app) => {
    setDrawerApp(app);
    try {
      const d = await apiFetch(`/api/hr/leaves/${app._id}`);
      setDrawerApp(d.data);
    } catch (_) {}
  };

  const handleApprove = async (id, remarks) => {
    setActionLoading(true);
    try {
      const d = await apiFetch(`/api/hr/leaves/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ remarks }),
      });
      showBanner("success", d.message);
      setDrawerApp(null);
      loadApps();
    } catch (e) {
      showBanner("error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id, rejectionReason) => {
    setActionLoading(true);
    try {
      await apiFetch(`/api/hr/leaves/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ rejectionReason }),
      });
      showBanner("success", "Leave rejected.");
      setDrawerApp(null);
      loadApps();
    } catch (e) {
      showBanner("error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const saveConfig = async (form) => {
    try {
      const d = await apiFetch("/api/hr/leaves/config", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setConfig(d.data);
      showBanner("success", "Configuration saved");
    } catch (_) {
      showBanner("error", "Failed to save config");
    }
  };

  const configPills = config
    ? [
        { label: `CL/yr: ${config.clPerYear}` },
        { label: `SL/yr: ${config.slPerYear}` },
        { label: `PL/yr: ${config.plPerYear}` },
        { label: `Wait: ${config.initialWaitingDays}d` },
        { label: `PL after: ${config.daysRequiredForPL}d` },
        { label: `SL doc ≥: ${config.slDocumentThreshold}d` },
        { label: `Max CL/mo: ${config.maxCLPerMonth || 3}d` },
        { label: `Month (non-Odisha): ${config.maxLeaveDaysPerMonth || 10}d` },
        { label: `Month (Odisha): ${config.maxLeaveDaysPerMonthOdisha || 7}d` },
      ]
    : [];

  const depts = [...new Set(apps.map((a) => a.department).filter(Boolean))];
  const needsAttention = stats.pending + stats.manager_approved;

  return (
    <Hr_DashboardLayout activeMenu="leaves" pageTitle="Leave Management">
      <div className="mx-auto w-full max-w-[1480px] space-y-5 pb-10">
        <PageHead
          kicker="Human resources"
          title="Leave Management"
          sub="Manage applications, configure policy, manage holidays and alerts"
          actions={
            <>
              <RoleGate min="editor">
              <Button tone="primary" size="sm" onClick={() => setShowAddLeave(true)}>
                <UserPlus className="w-4 h-4" /> Add on Behalf
              </Button>
              </RoleGate>
              {/* ── NEW (round 6): Sync PL button ── */}
              <RoleGate min="editor">
              <Button size="sm" onClick={() => setShowPLSync(true)}>
                <Award className="w-4 h-4" /> Sync PL
              </Button>
              </RoleGate>
              <RoleGate min="editor">
              <Button size="sm" onClick={() => setShowConfig(true)}>
                <Settings className="w-4 h-4" /> Configure
              </Button>
              </RoleGate>
              <Button size="sm" tone="ghost">
                <Download className="w-4 h-4" /> Export
              </Button>
            </>
          }
        >
          {configPills.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {configPills.map((p, i) => (
                <Chip key={i}>
                  <span data-figure>{p.label}</span>
                </Chip>
              ))}
              <RoleGate min="editor">
              <Button tone="ghost" size="sm" onClick={() => setShowConfig(true)}>
                Edit
              </Button>
              </RoleGate>
            </div>
          )}
        </PageHead>

        {/* ── NEW (round 6): "balances" tab inserted between Applications and Calendar ── */}
        <Tabs
          label="Leave sections"
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { id: "applications", label: "Applications" },
            { id: "balances", label: "Balances" },
            { id: "holidays", label: "Calendar & Holidays" },
            { id: "notifications", label: "Notifications" },
          ]}
        />

        {banner && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-card text-sm ${banner.type === "success" ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]" : "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]"}`}
          >
            <div className="flex items-center gap-2">
              {banner.type === "success" ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {banner.msg}
            </div>
            <button onClick={() => setBanner(null)} aria-label="Dismiss">
              <X className="w-4 h-4 opacity-60" />
            </button>
          </div>
        )}

        {tab === "applications" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Total"
                value={stats.total}
                sub="All applications"
                icon={Users}
                accent="slate"
              />
              <StatCard
                label="Needs Action"
                value={needsAttention}
                sub={`${stats.pending} pending · ${stats.manager_approved} mgr. approved`}
                icon={Clock}
                accent={needsAttention > 0 ? "orange" : "slate"}
              />
              <StatCard
                label="Approved"
                value={stats.hr_approved}
                sub="HR approved"
                icon={CheckCircle2}
                accent="emerald"
              />
              <StatCard
                label="Rejected"
                value={stats.hr_rejected}
                sub="HR/Mgr rejected"
                icon={XCircle}
                accent="red"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel label="By Leave Type">
                <PanelHead title="By Leave Type" />
                <div className="space-y-3">
                  {Object.entries(stats.byType || {}).map(([type, count]) => {
                    const pct =
                      stats.total > 0
                        ? Math.round((count / stats.total) * 100)
                        : 0;
                    const c = LEAVE_COLORS[type];
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-ink">
                            {LEAVE_LABELS[type] || type} Leave
                          </span>
                          <span data-figure className="font-medium text-ink">
                            {count}
                          </span>
                        </div>
                        <div className="h-1.5 bg-[var(--control-active)] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${c?.dot || "bg-ink/40"} rounded-full transition-all duration-700`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel label="Status Distribution">
                <PanelHead title="Status Distribution" />
                {stats.total > 0 ? (
                  <div className="flex items-center gap-4">
                    <svg
                      viewBox="0 0 80 80"
                      className="w-20 h-20 flex-shrink-0"
                    >
                      {(() => {
                        const items = [
                          { v: stats.hr_approved, c: "var(--state-positive)" },
                          {
                            v: stats.pending + stats.manager_approved,
                            c: "var(--state-rework)",
                          },
                          {
                            v:
                              stats.hr_rejected + (stats.manager_rejected || 0),
                            c: "var(--state-overdue)",
                          },
                        ];
                        const total = items.reduce((a, b) => a + b.v, 0);
                        let offset = 0;
                        const r = 28,
                          cx = 40,
                          cy = 40,
                          circ = 2 * Math.PI * r;
                        return items.map((item, i) => {
                          const pct = total > 0 ? item.v / total : 0;
                          const el = (
                            <circle
                              key={i}
                              cx={cx}
                              cy={cy}
                              r={r}
                              fill="none"
                              stroke={item.c}
                              strokeWidth="12"
                              strokeDasharray={`${pct * circ} ${circ - pct * circ}`}
                              strokeDashoffset={-offset * circ}
                              transform="rotate(-90 40 40)"
                            />
                          );
                          offset += pct;
                          return el;
                        });
                      })()}
                      <text
                        x="40"
                        y="44"
                        textAnchor="middle"
                        fontSize="14"
                        fill="var(--ink)"
                        fontWeight="500"
                      >
                        {stats.total}
                      </text>
                    </svg>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--state-positive)]" />
                        <span className="text-ink-muted">Approved</span>
                        <span data-figure className="font-medium text-ink ml-auto pl-4">
                          {stats.hr_approved}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--state-rework)]" />
                        <span className="text-ink-muted">Pending</span>
                        <span data-figure className="font-medium text-ink ml-auto pl-4">
                          {stats.pending + stats.manager_approved}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--state-overdue)]" />
                        <span className="text-ink-muted">Rejected</span>
                        <span data-figure className="font-medium text-ink ml-auto pl-4">
                          {stats.hr_rejected}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState compact title="No applications yet" />
                )}
              </Panel>

              {config && (
                <Panel label="Active Policy">
                  <PanelHead
                    title="Active Policy"
                    aside={
                      <RoleGate min="editor">
                      <Button tone="ghost" size="sm" onClick={() => setShowConfig(true)}>
                        Edit
                      </Button>
                      </RoleGate>
                    }
                  />
                  <div className="space-y-2 text-sm">
                    {[
                      ["CL / year", `${config.clPerYear} days`],
                      ["SL / year", `${config.slPerYear} days`],
                      ["PL / year", `${config.plPerYear} days`],
                      [
                        "Waiting period",
                        `${config.initialWaitingDays} working days`,
                      ],
                      [
                        "PL eligibility after",
                        `${config.daysRequiredForPL} working days`,
                      ],
                      [
                        "SL doc required ≥",
                        `${config.slDocumentThreshold} days`,
                      ],
                      ["Max CL / month", `${config.maxCLPerMonth || 3} days`],
                      [
                        "Monthly cap (non-Odisha)",
                        `${config.maxLeaveDaysPerMonth || 10} days`,
                      ],
                      [
                        "Monthly cap (Odisha)",
                        `${config.maxLeaveDaysPerMonthOdisha || 7} days`,
                      ],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-ink-muted">{k}</span>
                        <span data-figure className="font-medium text-ink">
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>

            <Panel padded={false} label="Leave applications">
              <div className="px-5 py-3.5 border-b border-hairline flex items-center gap-3 flex-wrap">
                <div className="flex-1 relative min-w-48">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search name or department…"
                    aria-label="Search applications"
                    className="pl-9"
                  />
                </div>
                {[
                  {
                    val: filterStatus,
                    set: setFilterStatus,
                    options: [
                      ["all", "All Status"],
                      ["pending", "Pending"],
                      ["manager_approved", "Mgr. Approved"],
                      ["hr_approved", "Approved"],
                      ["hr_rejected", "Rejected"],
                      ["cancelled", "Cancelled"],
                    ],
                  },
                  {
                    val: filterType,
                    set: setFilterType,
                    options: [
                      ["all", "All Types"],
                      ["CL", "Casual Leave"],
                      ["SL", "Sick Leave"],
                      ["PL", "Privilege Leave"],
                    ],
                  },
                ].map((s, i) => (
                  <Select
                    key={i}
                    value={s.val}
                    aria-label={i === 0 ? "Filter by status" : "Filter by type"}
                    onChange={(e) => {
                      s.set(e.target.value);
                      setPage(1);
                    }}
                    className="w-auto"
                  >
                    {s.options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ))}
                {depts.length > 0 && (
                  <Select
                    value={filterDept}
                    aria-label="Filter by department"
                    onChange={(e) => {
                      setFilterDept(e.target.value);
                      setPage(1);
                    }}
                    className="w-auto"
                  >
                    <option value="all">All Depts</option>
                    {depts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                )}
                <button
                  onClick={loadApps}
                  className="p-2 rounded-full hover:bg-[var(--control)] transition-colors"
                  title="Refresh"
                  aria-label="Refresh"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-ink-muted ${loading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Employee",
                        "Leave",
                        "Period",
                        "Days",
                        "Status",
                        "Applied",
                        "",
                      ].map((h, i) => (
                        <th
                          key={i}
                          className={`border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase ${i === 3 ? "text-right" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink-faint" />
                        </td>
                      </tr>
                    ) : apps.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            title="No applications match your filters"
                            body="Try widening the status, type or department filter."
                          />
                        </td>
                      </tr>
                    ) : (
                      apps.map((app) => (
                        <tr
                          key={app._id}
                          className="cursor-pointer group hover:bg-[var(--row-hover)]"
                          onClick={() => openDrawer(app)}
                        >
                          <td className="border-b border-hairline px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[var(--control)] flex items-center justify-center text-xs font-medium text-ink-muted flex-shrink-0">
                                {initials(app.employeeName)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-ink truncate">
                                    {app.employeeName}
                                  </p>
                                  {app.addedByHR && <Chip tone="risk">HR</Chip>}
                                </div>
                                <p className="text-xs text-ink-faint truncate">
                                  {app.department}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <LeaveChip type={app.leaveType} />
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-ink-muted whitespace-nowrap"
                          >
                            {fmt(app.fromDate || app.startDate?.slice(0, 10))}
                            {(app.fromDate || app.startDate?.slice(0, 10)) !==
                            (app.toDate || app.endDate?.slice(0, 10))
                              ? ` – ${fmt(app.toDate || app.endDate?.slice(0, 10))}`
                              : ""}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-right font-medium text-ink"
                          >
                            {app.totalDays || app.numberOfDays}
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <StatusBadge status={app.status} />
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-ink-muted text-xs whitespace-nowrap"
                          >
                            {app.createdAt
                              ? new Date(app.createdAt).toLocaleDateString(
                                  "en-IN",
                                )
                              : "—"}
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink transition-colors" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="px-5 py-3 border-t border-hairline flex items-center justify-between gap-3 text-sm">
                  <p className="text-ink-muted">
                    Showing <span data-figure>{apps.length}</span> of{" "}
                    <span data-figure>{total}</span>
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
                      {page} / {pages}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      disabled={page === pages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          </>
        )}

        {/* ── NEW (round 6): Balances tab content ── */}
        {tab === "balances" && <BalancesTab showBanner={showBanner} />}

        {tab === "holidays" && (
          <HolidaysTab
            holidays={holidays}
            year={holidayYear}
            onYearChange={(y) => setHolidayYear(y)}
            onAdded={() => loadHolidays(holidayYear)}
            onDeleted={() => loadHolidays(holidayYear)}
            showBanner={showBanner}
          />
        )}

        {tab === "notifications" && <NotificationPrefsPanel />}
      </div>

      {showConfig && config && (
        <ConfigModal
          config={config}
          onClose={() => setShowConfig(false)}
          onSave={saveConfig}
        />
      )}
      {drawerApp && (
        <LeaveDrawer
          app={drawerApp}
          onClose={() => setDrawerApp(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          actionLoading={actionLoading}
        />
      )}

      {/* HRAddLeaveModal — pass config so modal knows the SL doc threshold */}
      {showAddLeave && (
        <HRAddLeaveModal
          onClose={() => setShowAddLeave(false)}
          config={config}
          onSuccess={() => {
            loadApps();
            showBanner("success", "Leave added and approved.");
          }}
        />
      )}

      {/* ── NEW (round 6): PL Sync modal ── */}
      {showPLSync && (
        <PLSyncModal
          onClose={() => setShowPLSync(false)}
          onSuccess={loadApps}
          showBanner={showBanner}
        />
      )}
    </Hr_DashboardLayout>
  );
}

// ─── Holidays tab ─────────────────────────────────────────────────────────────
function HolidaysTab({
  holidays,
  year,
  onYearChange,
  onAdded,
  onDeleted,
  showBanner,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    date: `${year}-01-01`,
    name: "",
    type: "company",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const TYPE_META = {
    national: {
      label: "National Holiday",
      tone: "risk",
      code: "NH",
    },
    company: {
      label: "Festival Holiday",
      tone: "extension",
      code: "FH",
    },
    optional: {
      label: "Optional Holiday",
      tone: "neutral",
      code: "OH",
    },
    restricted: {
      label: "Restricted Holiday",
      tone: "rework",
      code: "RH",
    },
    working_sunday: {
      label: "Working Sunday",
      tone: "overdue",
      code: "—",
    },
  };

  const addHoliday = async () => {
    if (!form.date || !form.name.trim()) {
      showBanner("error", "Date and name are required");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/hr/leaves/holidays", {
        method: "POST",
        body: JSON.stringify(form),
      });
      showBanner("success", `Holiday "${form.name}" added`);
      setShowAdd(false);
      setForm({
        date: `${year}-01-01`,
        name: "",
        type: "company",
        description: "",
      });
      onAdded();
    } catch (e) {
      showBanner("error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteHoliday = async (id, name) => {
    if (!confirm(`Remove "${name}"? The day's attendance will be re-synced.`))
      return;
    try {
      await apiFetch(`/api/hr/leaves/holidays/${id}`, { method: "DELETE" });
      showBanner("success", "Holiday removed");
      onDeleted();
    } catch (_) {
      showBanner("error", "Failed to remove holiday");
    }
  };

  const years = [
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
    new Date().getFullYear() + 1,
  ];

  return (
    <div className="space-y-4">
      <Panel padded={false} label={`Company Holidays ${year}`}>
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              Company Holidays · <span data-figure>{year}</span>
            </h3>
            <p className="text-xs text-ink-faint mt-1">
              <span data-figure>{holidays.length}</span> declared · applies to
              all employees
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={year}
              aria-label="Year"
              onChange={(e) => onYearChange(e.target.value)}
              className="w-auto"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <RoleGate min="editor">
            <Button tone="primary" size="sm" onClick={() => setShowAdd(!showAdd)}>
              {showAdd ? (
                <>
                  <X className="w-4 h-4" /> Cancel
                </>
              ) : (
                <>
                  <CalendarDays className="w-4 h-4" /> Add Holiday
                </>
              )}
            </Button>
            </RoleGate>
          </div>
        </div>
        {showAdd && (
          <div className="px-5 py-4 bg-[var(--surface-sunken)] border-b border-hairline">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {[
                {
                  label: "Date",
                  el: (
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, date: e.target.value }))
                      }
                      min={`${year}-01-01`}
                      max={`${year}-12-31`}
                    />
                  ),
                },
                {
                  label: "Name *",
                  el: (
                    <Input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="e.g. Diwali"
                    />
                  ),
                },
                {
                  label: "Type",
                  el: (
                    <Select
                      value={form.type}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, type: e.target.value }))
                      }
                    >
                      {Object.entries(TYPE_META)
                        .filter(([k]) => k !== "working_sunday")
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                    </Select>
                  ),
                },
                {
                  label: "Description",
                  el: (
                    <Input
                      type="text"
                      value={form.description}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, description: e.target.value }))
                      }
                      placeholder="Optional note"
                    />
                  ),
                },
              ].map(({ label, el }) => (
                <Field key={label} label={label}>
                  {el}
                </Field>
              ))}
            </div>
            <RoleGate min="editor">
            <Button tone="primary" size="sm" onClick={addHoliday} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Add Holiday
                </>
              )}
            </Button>
            </RoleGate>
          </div>
        )}
        {holidays.length === 0 ? (
          <div className="py-6">
            <CalendarDays className="w-10 h-10 text-ink-faint mx-auto" />
            <EmptyState
              compact
              title={`No holidays declared for ${year}`}
              body="Add one above and the day's attendance is re-synced automatically."
            />
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {holidays.map((h) => {
              const meta = TYPE_META[h.type] || TYPE_META.company;
              const [hy, hm, hd] = h.date.split("-").map(Number);
              const dow = new Date(hy, hm - 1, hd).toLocaleDateString("en-IN", {
                weekday: "long",
              });
              const mon = new Date(hy, hm - 1, hd).toLocaleDateString("en-IN", {
                month: "short",
              });
              return (
                <div
                  key={h._id}
                  className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--row-hover)] group"
                >
                  <div className="w-10 text-center flex-shrink-0">
                    <p className="text-[9px] font-medium uppercase text-ink-faint tracking-[0.09em]">
                      {mon}
                    </p>
                    <p
                      data-figure
                      className="text-xl font-medium text-ink leading-none"
                    >
                      {hd}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-ink">{h.name}</p>
                      <Chip tone={meta.tone}>
                        {meta.code} · {meta.label}
                      </Chip>
                    </div>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {dow}
                      {h.description ? ` · ${h.description}` : ""}
                    </p>
                  </div>
                  <RoleGate min="owner">
                  <button
                    onClick={() => deleteHoliday(h._id, h.name)}
                    aria-label={`Remove ${h.name}`}
                    className="p-1.5 rounded-full text-ink-faint hover:text-[var(--state-overdue-ink)] hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  </RoleGate>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <div className="flex items-start gap-2 p-3 rounded-card bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] text-xs text-[var(--state-risk-ink)]">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Adding or removing a holiday automatically re-syncs that day's
          attendance. Employees who didn't punch are marked with the holiday
          code. Anyone who punched keeps their P status.
        </span>
      </div>
    </div>
  );
}
