"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
  CreditCard,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Play,
  RefreshCw,
  Search,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Eye,
  X,
  FileText,
  Download,
  Sparkles,
  AlertTriangle,
  IndianRupee,
  Lock,
  Calculator,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Pencil,
  Save,
  Undo2,
  CalendarDays,
  Info,
  Trash2,
  CheckSquare,
  Square,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PageHead,
  Button,
  Chip,
  Field,
  Input,
  Textarea,
  EmptyState,
  InlineError,
  StatStrip,
  Tabs,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getHeaders() {
  const t =
    typeof window !== "undefined"
      ? localStorage.getItem("hr_token") || localStorage.getItem("token") || ""
      : "";
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}
async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...getHeaders(), ...opts.headers },
    credentials: "include",
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
  return d;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const fmtINR = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// The three internship arrangements. Only "paid" carries a stipend; the other
// two appear on the Interns tab with their attendance and a payout of nothing,
// because they are still people HR is tracking for the month.
const ARRANGEMENT = {
  paid: "Paid",
  unpaid: "Unpaid",
  self_paid: "Self-paid",
};

// Attendance categories carry meaning, so they read from the state palette:
// worked → positive, partial/adjusted → extension, leave & holidays → risk,
// unpaid absence → overdue, non-working days → neutral.
const WASH_POSITIVE =
  "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]";
const WASH_EXTENSION =
  "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]";
const WASH_REWORK =
  "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]";
const WASH_RISK =
  "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]";
const WASH_OVERDUE =
  "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]";
const WASH_NEUTRAL = "bg-[var(--control)] text-ink-muted";

const CATEGORY_COLORS = {
  P: WASH_POSITIVE,
  "P*": WASH_EXTENSION,
  "P~": WASH_EXTENSION,
  HD: WASH_EXTENSION,
  MP: WASH_REWORK,
  AB: WASH_OVERDUE,
  "AB-OFFSET": WASH_EXTENSION,
  WO: WASH_NEUTRAL,
  FH: WASH_RISK,
  NH: WASH_RISK,
  OH: WASH_RISK,
  RH: WASH_RISK,
  PH: WASH_RISK,
  "L-CL": WASH_RISK,
  "L-SL": WASH_RISK,
  "L-EL": WASH_RISK,
  LWP: WASH_OVERDUE,
  WFH: WASH_RISK,
  CO: WASH_RISK,
  "PRE-JOINING": `${WASH_NEUTRAL} border-2 border-dashed border-hairline`,
};

// ── Bulk edit panel ──────────────────────────────────────────────────────────
const BULK_FIELDS = [
  { key: "overtime", label: "Overtime (₹)", section: "earnings" },
  { key: "bonus", label: "Bonus (₹)", section: "earnings" },
  { key: "incentives", label: "Incentives (₹)", section: "earnings" },
  { key: "otherEarnings", label: "Other Earnings (₹)", section: "earnings" },
  { key: "loanDeduction", label: "Loan Deduction (₹)", section: "deductions" },
  {
    key: "advanceDeduction",
    label: "Advance Deduction (₹)",
    section: "deductions",
  },
  {
    key: "otherDeductions",
    label: "Other Deductions (₹)",
    section: "deductions",
  },
];

function BulkEditPanel({ selectedIds, onClose, onApplied }) {
  const [values, setValues] = useState({});
  const [remarks, setRemarks] = useState("");
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState("");

  const upd = (k) => (e) => {
    const v = e.target.value === "" ? "" : Number(e.target.value);
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const patch = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== "" && v !== undefined),
  );
  if (remarks.trim()) patch.remarks = remarks.trim();

  const handleApply = async () => {
    if (Object.keys(patch).length === 0) {
      setErr("Enter at least one value to apply.");
      return;
    }
    setApplying(true);
    setErr("");
    try {
      await api("/api/hr/payroll/items/bulk-override", {
        method: "PATCH",
        body: JSON.stringify({ itemIds: selectedIds, patch }),
      });
      await onApplied();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setApplying(false);
    }
  };

  const earningFields = BULK_FIELDS.filter((f) => f.section === "earnings");
  const deductionFields = BULK_FIELDS.filter((f) => f.section === "deductions");

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit payroll items"
        className="frost-bar flex max-h-full min-h-0 w-full max-w-2xl flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 shrink-0 text-ink-muted" />
            <h3 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              Bulk Edit — <span data-figure>{selectedIds.length}</span> employee
              {selectedIds.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-2.5 text-xs text-[var(--state-risk-ink)]">
            Only fields you fill in will be updated. Empty fields are left as-is
            for each employee. Remarks will be appended to any existing remark.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Earnings
              </p>
              <div className="space-y-2.5">
                {earningFields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      data-figure
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Leave blank to skip"
                      value={values[f.key] ?? ""}
                      onChange={upd(f.key)}
                    />
                  </Field>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Additional Deductions
              </p>
              <div className="space-y-2.5">
                {deductionFields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      data-figure
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Leave blank to skip"
                      value={values[f.key] ?? ""}
                      onChange={upd(f.key)}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-2.5">
                <Field label="Remarks (appended)">
                  <Textarea
                    rows={2}
                    placeholder="Optional note for all selected"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-ink-faint">
            PF and ESIC are auto-computed on full monthly basic and cannot be
            changed here.
          </p>

          {err && <InlineError message={err} compact />}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-4">
          <Button tone="secondary" onClick={onClose}>
            Cancel
          </Button>
          <RoleGate min="editor">
          <Button tone="primary" onClick={handleApply} disabled={applying}>
            {applying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Applying…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Apply to{" "}
                <span data-figure>{selectedIds.length}</span>{" "}
                employee{selectedIds.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
          </RoleGate>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const [mode, setMode] = useState("saved");
  const [previewData, setPreviewData] = useState(null);
  const [savedData, setSavedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [recalcId, setRecalcId] = useState(null);

  // Staff or interns. One payroll run per month either way — the run doc's
  // totals are still the company-wide cost, which is what the accountant
  // module reads off it. This splits what HR sees and pays out: separate
  // rosters, separate totals, separate export, so an intern's stipend never
  // lands in the staff payout figure.
  const [segment, setSegment] = useState("staff");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api(`/api/hr/payroll/items?month=${month}&year=${year}`);
      setSavedData(r.data);
      setMode("saved");
      setSelectedIds(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  const handleRecalculate = useCallback(
    async (item) => {
      if (!item?._id) {
        setError("This item hasn't been saved yet. Save Draft first.");
        return;
      }
      if (
        !confirm(
          `Recalculate ${item.employeeName}'s pay against their current salary? This refreshes Gross, Basic, HRA, PF, ESIC and Net Pay from the latest salary on file, and is saved immediately.`,
        )
      )
        return;
      setRecalcId(item._id);
      setError("");
      try {
        await api(`/api/hr/payroll/item/${item._id}/recalculate`, {
          method: "PATCH",
        });
        await loadSaved();
      } catch (e) {
        setError(e.message);
      } finally {
        setRecalcId(null);
      }
    },
    [loadSaved],
  );

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const handlePreview = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api(
        `/api/hr/payroll/preview?month=${month}&year=${year}`,
      );
      setPreviewData(r.data);
      setMode("preview");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Save preview as draft (persisted, status=draft, editable)
  const handleSaveDraft = async () => {
    if (
      !confirm(
        `Save payroll draft for ${MONTHS[month - 1]} ${year}? You can edit individual items after this, then click Process Payroll when ready.`,
      )
    )
      return;
    setSavingDraft(true);
    setError("");
    try {
      await api("/api/hr/payroll/run/save-draft", {
        method: "POST",
        body: JSON.stringify({ month, year }),
      });
      setPreviewData(null);
      await loadSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Process payroll — promotes draft → processed, visible to accountant
  const handleRun = async () => {
    if (
      !confirm(
        `Process payroll for ${MONTHS[month - 1]} ${year}? This will finalize all payslips and make them visible to the accountant. No more editing after this (except via Override).`,
      )
    )
      return;
    setRunning(true);
    setError("");
    try {
      await api("/api/hr/payroll/run", {
        method: "POST",
        body: JSON.stringify({ month, year }),
      });
      setPreviewData(null);
      await loadSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleMarkPaid = async () => {
    if (
      !confirm(
        `Mark all processed items as paid for ${MONTHS[month - 1]} ${year}?`,
      )
    )
      return;
    try {
      await api("/api/hr/payroll/mark-paid", {
        method: "PATCH",
        body: JSON.stringify({ month, year }),
      });
      await loadSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete the entire payroll run for ${MONTHS[month - 1]} ${year}? This cannot be undone.`,
      )
    )
      return;
    setLoading(true);
    setError("");
    try {
      await api(`/api/hr/payroll/run?month=${month}&year=${year}`, {
        method: "DELETE",
      });
      setSavedData(null);
      setMode("saved");
      setSelectedIds(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Revert processed run back to draft for further editing
  const [reverting, setReverting] = useState(false);
  const handleRevertToDraft = async () => {
    if (
      !confirm(
        `Send ${MONTHS[month - 1]} ${year} payroll back to draft? It will be hidden from the accountant until you re-process it. Any edits you made in draft are preserved.`,
      )
    )
      return;
    setReverting(true);
    setError("");
    try {
      await api("/api/hr/payroll/run/revert-to-draft", {
        method: "PATCH",
        body: JSON.stringify({ month, year }),
      });
      await loadSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setReverting(false);
    }
  };

  // Remove a single employee's payroll item from draft/processed run
  const [removingId, setRemovingId] = useState(null);
  const handleRemoveItem = useCallback(
    async (it) => {
      if (!it?._id) return;
      if (
        !confirm(
          `Remove ${it.employeeName} from ${MONTHS[month - 1]} ${year} payroll? This only deletes their payslip entry — it does not affect their employment record.`,
        )
      )
        return;
      setRemovingId(it._id);
      setError("");
      try {
        await api(`/api/hr/payroll/item/${it._id}`, { method: "DELETE" });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(String(it._id));
          return next;
        });
        await loadSaved();
      } catch (e) {
        setError(e.message);
      } finally {
        setRemovingId(null);
      }
    },
    [month, year, loadSaved],
  );

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/api/hr/payroll/export?month=${month}&year=${year}&segment=${segment}`,
        { credentials: "include", headers: getHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        segment === "interns"
          ? `intern_stipends_${year}-${String(month).padStart(2, "0")}.xlsx`
          : `salary_register_${year}-${String(month).padStart(2, "0")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 100);
    } catch (e) {
      setError("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  const changeMonth = (delta) => {
    let m = month + delta,
      y = year;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setMonth(m);
    setYear(y);
  };

  const allItems = useMemo(() => {
    if (mode === "preview") return previewData?.items || [];
    return savedData?.items || [];
  }, [mode, previewData, savedData]);

  const items = useMemo(
    () =>
      allItems.filter((i) => (segment === "interns" ? !!i.isIntern : !i.isIntern)),
    [allItems, segment],
  );

  const internCount = useMemo(
    () => allItems.filter((i) => i.isIntern).length,
    [allItems],
  );

  const isInternTab = segment === "interns";

  const byArrangement = useMemo(() => {
    const out = { paid: 0, unpaid: 0, self_paid: 0 };
    for (const i of allItems) {
      if (!i.isIntern) continue;
      out[i.internshipType || "paid"] = (out[i.internshipType || "paid"] || 0) + 1;
    }
    return out;
  }, [allItems]);

  const run = savedData?.run;
  // Always aggregated from the rows ON SCREEN, in both modes. The server also
  // returns a summary for the preview, but it covers the whole run — using it
  // here would show staff totals with intern stipends folded in, which is the
  // mixing this tab exists to stop.
  const summary = items.length ? aggregateSummary(items) : null;

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        (i.employeeName || "").toLowerCase().includes(q) ||
        (i.biometricId || "").toLowerCase().includes(q) ||
        (i.department || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  // Multi-select helpers — scoped to the visible tab, so "select all" on the
  // Interns tab cannot quietly pick up staff rows.
  const savedItems = (savedData?.items || []).filter((i) =>
    segment === "interns" ? !!i.isIntern : !i.isIntern,
  );
  const editableItems = savedItems.filter((i) => i._id && i.status !== "paid");
  const allEditableSelected =
    editableItems.length > 0 &&
    editableItems.every((i) => selectedIds.has(String(i._id)));

  const toggleSelectAll = () => {
    if (allEditableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(editableItems.map((i) => String(i._id))));
    }
  };

  // Switching tabs clears the selection: the bulk panel acts on ids, and
  // carrying a staff selection into the Interns tab would edit rows that are
  // no longer on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [segment]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Status helpers
  const isDraft = run?.status === "draft";
  const isProcessed = run?.status === "processed";
  const isPaid = run?.status === "paid";
  const canEdit = mode === "saved" && isDraft;

  return (
    <DashboardLayout activeMenu="payroll">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Payroll"
          sub={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span data-figure>
                {MONTHS[month - 1]} {year}
              </span>
              {run && (
                <Chip
                  tone={
                    isPaid
                      ? "positive"
                      : isProcessed
                        ? "risk"
                        : isDraft
                          ? "rework"
                          : "neutral"
                  }
                >
                  {isPaid && <Lock className="w-3 h-3" />}
                  {run.status}
                </Chip>
              )}
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Month/year picker */}
              <div className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] p-[3px]">
                <button
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  aria-label="Month"
                  className="rounded-full bg-transparent px-2 py-1 text-sm font-medium text-ink focus:outline-none"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  data-figure
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  aria-label="Year"
                  className="rounded-full bg-transparent px-2 py-1 text-sm font-medium text-ink focus:outline-none"
                >
                  {Array.from(
                    { length: 5 },
                    (_, i) => today.getFullYear() - i,
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Preview button — always available */}
              <Button tone="secondary" size="sm" onClick={handlePreview} disabled={loading}>
                <Calculator className="w-4 h-4" />
                Preview
              </Button>

              {/* Leaving preview. Every other button on this bar is gated on
                  mode === "saved", so without this the only way out of a
                  preview was to reload the page — and the numbers on screen
                  were not saved anywhere, so it looked like work being lost. */}
              {mode === "preview" && (
                <Button
                  tone="secondary"
                  size="sm"
                  onClick={() => {
                    setPreviewData(null);
                    setMode("saved");
                  }}
                >
                  <Undo2 className="w-4 h-4" /> Close Preview
                </Button>
              )}

              {/* Save Draft — only when a draft can actually be saved. A
                  processed run has to be reverted first and a paid one is
                  locked for good, so offering the button on either is
                  offering a click that can only end in an error. */}
              {mode === "preview" && !isProcessed && !isPaid && (
                <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={handleSaveDraft} disabled={savingDraft}>
                  {savingDraft ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Saving Draft…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save Draft
                    </>
                  )}
                </Button>
                </RoleGate>
              )}

              {/* Process Payroll — only available when draft is saved */}
              {mode === "saved" && isDraft && (
                <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={handleRun} disabled={running}>
                  {running ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Processing…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Process Payroll
                    </>
                  )}
                </Button>
                </RoleGate>
              )}

              {/* Export — after processing */}
              {mode === "saved" &&
                items.length > 0 &&
                (isProcessed || isPaid) && (
                  <Button tone="secondary" size="sm" onClick={handleExport} disabled={exporting}>
                    {exporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Exporting…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Export Excel
                      </>
                    )}
                  </Button>
                )}

              {/* Mark Paid — only when processed, not already paid */}
              {mode === "saved" && isProcessed && !isPaid && (
                <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={handleMarkPaid}>
                  <CheckCircle2 className="w-4 h-4" /> Mark as Paid
                </Button>
                </RoleGate>
              )}

              {/* Revert processed → draft — hidden for paid runs */}
              {mode === "saved" && isProcessed && !isPaid && (
                <RoleGate min="editor">
                <Button
                  tone="secondary"
                  size="sm"
                  onClick={handleRevertToDraft}
                  disabled={reverting}
                  title="Send back to draft so you can edit individual items"
                >
                  {reverting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Reverting…
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4" /> Revert to Draft
                    </>
                  )}
                </Button>
                </RoleGate>
              )}

              {/* Delete run */}
              {mode === "saved" &&
                run &&
                !["paid", "approved"].includes(run.status) && (
                  <RoleGate min="owner">
                  <Button tone="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                    <Trash2 className="w-4 h-4" /> Remove Run
                  </Button>
                  </RoleGate>
                )}
            </div>
          }
        />

        <div className="space-y-4">
        {error && (
          <InlineError message={error} />
        )}

        {/* Preview banner */}
        {mode === "preview" && previewData && (
          <div className="flex items-start gap-3 rounded-card bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] p-3">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--state-rework-ink)]" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-[var(--state-rework-ink)]">
                Preview — nothing saved yet
              </p>
              <p className="mt-0.5 text-ink-muted">
                {isPaid ? (
                  <>
                    Numbers are computed from attendance + leaves. This month is
                    already <strong>paid</strong> and locked, so nothing here can
                    be saved — it is a read-only recalculation, useful for
                    checking what the figures would be today.{" "}
                  </>
                ) : isProcessed ? (
                  <>
                    Numbers are computed from attendance + leaves but not
                    persisted. This month is already{" "}
                    <strong>processed</strong>, so to change it use{" "}
                    <strong>Revert to Draft</strong> on the saved run first.{" "}
                  </>
                ) : (
                  <>
                    Numbers are computed from attendance + leaves but not
                    persisted. Click <strong>Save Draft</strong> to persist and
                    start editing, then <strong>Process Payroll</strong> to
                    finalise.{" "}
                  </>
                )}
                {previewData.summary?.autoAdjustedCount > 0 &&
                  ` ${previewData.summary.autoAdjustedCount} employee(s) will have AB auto-adjusted to CL.`}
                {previewData.summary?.unsyncedCount > 0 &&
                  ` ${previewData.summary.unsyncedCount} employee(s) have unsynced attendance days.`}
                {previewData.items?.filter((i) => i.preJoiningDays > 0).length >
                  0 &&
                  ` ${previewData.items.filter((i) => i.preJoiningDays > 0).length} mid-month joiner(s) — pre-joining days excluded from pay.`}
              </p>
            </div>
          </div>
        )}

        {/* Draft banner */}
        {mode === "saved" && isDraft && (
          <div className="flex items-start gap-3 rounded-card bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] p-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--state-rework-ink)]" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-[var(--state-rework-ink)]">
                Draft — not yet visible to accountant
              </p>
              <p className="mt-0.5 text-ink-muted">
                Review and edit individual or multiple employees below. When
                done, click <strong>Process Payroll</strong> to finalise and
                send to accountant.
              </p>
            </div>
          </div>
        )}

        {/* Processed/Paid banner */}
        {mode === "saved" && isProcessed && !isPaid && (
          <div className="flex items-start gap-3 rounded-card bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--state-risk-ink)]" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-[var(--state-risk-ink)]">
                Processed — visible to accountant, editing locked
              </p>
              <p className="mt-0.5 text-ink-muted">
                Payroll is finalised and visible to the accountant. To make
                changes, click <strong>Revert to Draft</strong> to hide it from
                the accountant until you re-process.
              </p>
            </div>
          </div>
        )}

        {/* Paid banner */}
        {mode === "saved" && isPaid && (
          <div className="flex items-start gap-3 rounded-card bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] p-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--state-positive-ink)]" />
            <div className="flex-1 text-xs">
              <p className="font-medium text-[var(--state-positive-ink)]">
                Paid — locked permanently
              </p>
              <p className="mt-0.5 text-ink-muted">
                This payroll has been marked as paid. No edits, reversions, or
                deletions are possible. Contact admin if a correction is
                required.
              </p>
            </div>
          </div>
        )}

        {/* Empty state — an empty TAB is a different thing from an
            unprocessed month, and telling HR to run payroll when they have
            already run it just sends them round again. */}
        {mode === "saved" && !loading && allItems.length === 0 && (
          <Panel label="Payroll not yet processed">
            <EmptyState
              title={`Payroll not yet processed for ${MONTHS[month - 1]} ${year}`}
              body="Click Preview to compute numbers from attendance data, then Save Draft to persist and edit, then Process Payroll to finalise."
              action={
                <Button tone="primary" onClick={handlePreview} disabled={loading}>
                  <Calculator className="w-4 h-4" /> Preview Payroll
                </Button>
              }
            />
          </Panel>
        )}
        {!loading && allItems.length > 0 && items.length === 0 && (
          <Panel label={isInternTab ? "No interns" : "No employees"}>
            <EmptyState
              title={
                isInternTab
                  ? `No interns in the ${MONTHS[month - 1]} ${year} payroll`
                  : `No employees in the ${MONTHS[month - 1]} ${year} payroll`
              }
              body={
                isInternTab
                  ? "Anyone whose employment type is Intern appears here with their stipend. Set that on their record under Employees."
                  : "Every other employment type appears here."
              }
            />
          </Panel>
        )}

        {/* Staff / Interns */}
        {allItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              label="Payroll segment"
              value={segment}
              onChange={setSegment}
              options={[
                {
                  id: "staff",
                  label: `Employees (${allItems.length - internCount})`,
                },
                { id: "interns", label: `Interns (${internCount})` },
              ]}
            />
          </div>
        )}

        {/* Summary stats — for the visible segment only */}
        {summary && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatStrip
              items={[
                {
                  label: isInternTab ? "Interns" : "Employees",
                  value: String(summary.totalEmployees),
                },
                {
                  label: isInternTab ? "Stipend Total" : "Gross Total",
                  value: fmtINR(summary.totalGross),
                },
                ...(isInternTab
                  ? []
                  : [
                      {
                        label: "Deductions",
                        value: fmtINR(summary.totalDeductions),
                      },
                    ]),
                { label: "Net Payout", value: fmtINR(summary.totalNetPay) },
              ]}
            />
            {/* PF and ESIC have no meaning on the Interns tab — a pair of
                zeroed strips would read as a bug rather than as "they are not
                enrolled". The arrangement breakdown is the useful figure. */}
            {isInternTab ? (
              <StatStrip
                items={[
                  { label: "Paid", value: String(byArrangement.paid) },
                  { label: "Unpaid", value: String(byArrangement.unpaid) },
                  { label: "Self-paid", value: String(byArrangement.self_paid) },
                ]}
              />
            ) : (
              <StatStrip
                items={[
                  { label: "Total PF", value: fmtINR(summary.totalPF) },
                  { label: "Total ESIC", value: fmtINR(summary.totalESIC) },
                ]}
              />
            )}
          </div>
        )}

        {/* Search + bulk action bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="text"
                placeholder="Search employee, biometric ID, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {mode === "saved" && isDraft && selectedIds.size > 0 && (
              <RoleGate min="editor">
              <Button tone="primary" onClick={() => setShowBulkPanel(true)}>
                <Layers className="w-4 h-4" />
                Edit <span data-figure>{selectedIds.size}</span> selected
              </Button>
              </RoleGate>
            )}
            {mode === "saved" && isDraft && selectedIds.size > 0 && (
              <Button tone="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {items.length > 0 && (
          <Panel padded={false} label="Payroll items" className="overflow-hidden">
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {mode === "saved" && isDraft && (
                      <th className="w-8 border-b border-hairline py-2.5 pl-3 pr-1 text-left">
                        <button
                          onClick={toggleSelectAll}
                          aria-label="Select all editable rows"
                          className="text-ink-muted transition-colors hover:text-ink"
                        >
                          {allEditableSelected ? (
                            <CheckSquare className="h-4 w-4 text-ink" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                    )}
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Employee</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Days</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">P / L / A</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">{isInternTab ? "Stipend" : "Gross"}</th>
                    {/* Interns are enrolled in nothing, so this column would be
                        0.00 for every row. A column of zeros reads as a broken
                        export, not as "no deductions" — the arrangement is the
                        useful thing to show in its place. */}
                    <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">{isInternTab ? "Arrangement" : "Deductions"}</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">{isInternTab ? "Paid" : "Net Pay"}</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-center text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Flags</th>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const gross = it.earnings?.grossEarnings || 0;
                    const ded = it.deductions?.totalDeductions || 0;
                    const net = it.roundedNetPay ?? it.netPay ?? 0;
                    const present = it.presentDays || 0;
                    const leaves = it.paidLeaveDays || 0;
                    const absent = it.absentDays || 0;
                    const rowId = String(it._id);
                    const isSelected = selectedIds.has(rowId);
                    const rowEditable =
                      mode === "saved" &&
                      isDraft &&
                      it._id &&
                      it.status !== "paid";

                    return (
                      <tr
                        key={it._id || it.employeeId}
                        className={`cursor-pointer transition-colors hover:bg-[var(--row-hover)] ${isSelected ? "bg-[var(--control-active)]" : ""}`}
                        onClick={() => {
                          if (rowEditable) toggleSelect(rowId);
                          else setSelectedItem(it);
                        }}
                      >
                        {mode === "saved" && isDraft && (
                          <td
                            className="border-b border-hairline py-2.5 pl-3 pr-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => rowEditable && toggleSelect(rowId)}
                              disabled={!rowEditable}
                              aria-label="Select row"
                              className="text-ink-muted transition-colors hover:text-ink disabled:opacity-30"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-ink" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        )}
                        <td className="border-b border-hairline px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--control)] text-[10px] font-medium text-ink">
                              {(it.employeeName || "?")
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink">
                                {it.employeeName}
                              </p>
                              <p className="truncate text-[11px] text-ink-faint">
                                <span data-figure>
                                  {it.biometricId}
                                </span>
                                {it.department && ` · ${it.department}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5 text-center text-xs">
                          <span data-figure className="text-ink">
                            {it.payableDays ?? "—"}
                          </span>
                          <span data-figure className="text-ink-faint">
                            /{it.workingDays || 31}
                          </span>
                          {(it.preJoiningDays || 0) > 0 && (
                            <div className="mt-0.5 text-[10px] text-[var(--state-risk-ink)]">
                              DOJ day <span data-figure>{it.firstActiveDayInMonth}</span>
                            </div>
                          )}
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5 text-center text-xs">
                          <span data-figure className="text-[var(--state-positive-ink)]">
                            {present}
                          </span>
                          <span className="text-ink-faint"> / </span>
                          <span data-figure className="text-[var(--state-risk-ink)]">
                            {leaves}
                          </span>
                          <span className="text-ink-faint"> / </span>
                          <span
                            data-figure
                            className={
                              absent > 0
                                ? "text-[var(--state-overdue-ink)]"
                                : "text-ink-faint"
                            }
                          >
                            {absent}
                          </span>
                        </td>
                        <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink">
                          {fmtINR(gross)}
                        </td>
                        {isInternTab ? (
                          <td className="border-b border-hairline px-3 py-2.5 text-right text-sm">
                            <Chip
                              tone={
                                (it.internshipType || "paid") === "paid"
                                  ? "positive"
                                  : "neutral"
                              }
                            >
                              {ARRANGEMENT[it.internshipType] || "Paid"}
                            </Chip>
                          </td>
                        ) : (
                          <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm text-[var(--state-overdue-ink)]">
                            {fmtINR(ded)}
                          </td>
                        )}
                        <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm font-medium text-ink">
                          {fmtINR(net)}
                        </td>
                        <td className="border-b border-hairline px-3 py-2.5 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {(it.preJoiningDays || 0) > 0 && (
                              <Chip
                                tone="risk"
                                className="px-1.5 py-0.5 text-[10px]"
                                title={`Joined day ${it.firstActiveDayInMonth} — ${it.preJoiningDays} pre-joining day(s) excluded`}
                              >
                                DOJ+<span data-figure>{it.preJoiningDays}</span>
                              </Chip>
                            )}
                            {it.clEligible === false && (
                              <Chip
                                tone="rework"
                                className="px-1.5 py-0.5 text-[10px]"
                                title={`CL not eligible yet — only ${it.daysSinceDOJ ?? 0}/24 days since joining`}
                              >
                                Probation
                              </Chip>
                            )}
                            {it.sundayOffsetApplied > 0 && (
                              <Chip
                                tone="extension"
                                className="px-1.5 py-0.5 text-[10px]"
                                title={`${it.sundayOffsetApplied} AB offset by Sunday worked`}
                              >
                                Sun-off
                              </Chip>
                            )}
                            {it.autoAdjustedCL > 0 && (
                              <Chip
                                tone="extension"
                                className="px-1.5 py-0.5 text-[10px]"
                                title={`Auto-adjusted ${it.autoAdjustedCL} AB → CL`}
                              >
                                CL-adj
                              </Chip>
                            )}
                            {it.isManuallyOverridden && (
                              <Chip tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                                Edited
                              </Chip>
                            )}
                            {it.unsyncedDays > 0 && (
                              <Chip
                                tone="rework"
                                className="px-1.5 py-0.5 text-[10px]"
                                title={`${it.unsyncedDays} unsynced days`}
                              >
                                !<span data-figure>{it.unsyncedDays}</span>
                              </Chip>
                            )}
                            {isPaid && (
                              <Lock className="h-3 w-3 text-[var(--state-positive-ink)]" />
                            )}
                          </div>
                        </td>
                        <td
                          className="border-b border-hairline px-3 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {/* Recalculate — draft only */}
                            {isDraft && it._id && it.status !== "paid" && (
                              <RoleGate min="editor">
                              <button
                                onClick={() => handleRecalculate(it)}
                                disabled={recalcId === it._id}
                                title="Recalculate against current salary"
                                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-4 h-4 ${recalcId === it._id ? "animate-spin" : ""}`}
                                />
                              </button>
                              </RoleGate>
                            )}
                            {/* Edit — draft only */}
                            {isDraft && it._id && it.status !== "paid" && (
                              <RoleGate min="editor">
                              <button
                                onClick={() =>
                                  setSelectedItem({ ...it, _openTab: "edit" })
                                }
                                aria-label="Edit payroll item"
                                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              </RoleGate>
                            )}
                            {/* View — always visible */}
                            <button
                              onClick={() => setSelectedItem(it)}
                              aria-label="View payslip detail"
                              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {/* Remove — draft only */}
                            {isDraft && it._id && it.status !== "paid" && (
                              <RoleGate min="owner">
                              <button
                                onClick={() => handleRemoveItem(it)}
                                disabled={removingId === it._id}
                                title="Remove this employee from payroll"
                                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)] disabled:opacity-50"
                              >
                                {removingId === it._id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin text-[var(--state-overdue-ink)]" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                              </RoleGate>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedItem && (
        <PayrollDetailDrawer
          item={selectedItem}
          initialTab={selectedItem._openTab || "summary"}
          onClose={() => setSelectedItem(null)}
          onSaved={async () => {
            await loadSaved();
            setSelectedItem(null);
          }}
          canEdit={
            mode === "saved" &&
            isDraft &&
            !!selectedItem._id &&
            selectedItem.status !== "paid"
          }
        />
      )}

      {/* Bulk edit panel */}
      {showBulkPanel && (
        <BulkEditPanel
          selectedIds={Array.from(selectedIds)}
          onClose={() => setShowBulkPanel(false)}
          onApplied={loadSaved}
        />
      )}
    </DashboardLayout>
  );
}

function aggregateSummary(items) {
  return items.reduce(
    (a, i) => ({
      totalEmployees: a.totalEmployees + 1,
      totalGross: a.totalGross + (i.earnings?.grossEarnings || 0),
      totalDeductions: a.totalDeductions + (i.deductions?.totalDeductions || 0),
      totalNetPay: a.totalNetPay + (i.roundedNetPay ?? i.netPay ?? 0),
      totalPF: a.totalPF + (i.deductions?.providentFund || 0),
      totalESIC: a.totalESIC + (i.deductions?.esic || 0),
    }),
    {
      totalEmployees: 0,
      totalGross: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      totalPF: 0,
      totalESIC: 0,
    },
  );
}

function StatCard({ label, value, tone = "gray", big }) {
  const tones = {
    purple: "text-ink",
    blue: "text-ink",
    amber: "text-ink",
    emerald: "text-ink",
    indigo: "text-ink",
    teal: "text-ink",
    gray: "text-ink",
  };
  return (
    <Panel className="!px-4 !py-3">
      <p className="truncate text-xs text-ink-faint">{label}</p>
      <p
        data-figure
        className={`mt-1 ${big ? "text-[18px]" : "text-[22px]"} leading-none tracking-[-0.025em] ${tones[tone]}`}
      >
        {value}
      </p>
    </Panel>
  );
}

function DOJPanel({ item }) {
  if (!item.preJoiningDays && !item.dateOfJoining) return null;
  if ((item.preJoiningDays || 0) === 0 && item.clEligible !== false)
    return null;
  const doj = item.dateOfJoining
    ? new Date(item.dateOfJoining).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  return (
    <div className="space-y-3 rounded-card bg-[color-mix(in_srgb,var(--state-risk)_14%,transparent)] p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-[var(--state-risk-ink)]" />
        <h4 className="text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--state-risk-ink)]">
          Date of Joining — Mid-Month Entry
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {doj && (
          <div className="rounded-inset bg-[var(--surface-raised)] p-3">
            <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
              Joined On
            </p>
            <p data-figure className="mt-1 text-sm text-ink">{doj}</p>
          </div>
        )}
        {(item.preJoiningDays || 0) > 0 && (
          <div className="rounded-inset bg-[var(--surface-raised)] p-3">
            <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
              Pre-joining Days
            </p>
            <p data-figure className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink">
              {item.preJoiningDays}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              excluded from pay
            </p>
          </div>
        )}
        {item.activeDaysInMonth != null && (
          <div className="rounded-inset bg-[var(--surface-raised)] p-3">
            <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
              Active Days
            </p>
            <p data-figure className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink">
              {item.activeDaysInMonth}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              of <span data-figure>{item.daysInMonth}</span> in month
            </p>
          </div>
        )}
        <div className="rounded-inset bg-[var(--surface-raised)] p-3">
          <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
            CL Eligible
          </p>
          <p
            className={`mt-1 text-sm font-medium ${item.clEligible !== false ? "text-[var(--state-positive-ink)]" : "text-[var(--state-rework-ink)]"}`}
          >
            {item.clEligible !== false ? "Yes" : "Not yet"}
          </p>
          {item.clEligible === false && item.daysSinceDOJ != null && (
            <p data-figure className="mt-0.5 text-[10px] text-ink-faint">
              {item.daysSinceDOJ}/24 days
            </p>
          )}
        </div>
      </div>
      {item.clEligible === false && (
        <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-2.5 text-xs text-[var(--state-rework-ink)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>
            <strong>CL auto-adjustment disabled:</strong> employee has not
            completed 24 calendar days since joining. Absent days are counted as
            LOP until the threshold is crossed.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Detail drawer (unchanged from original, kept complete) ───────────────────
function PayrollDetailDrawer({
  item,
  onClose,
  onSaved,
  initialTab = "summary",
  canEdit = false,
}) {
  const [tab, setTab] = useState(initialTab);
  const breakdown = item.dayBreakdown || [];

  const workingDays = item.workingDays || 31;
  const activeCap =
    item.preJoiningDays > 0 && item.activeDaysInMonth != null
      ? item.activeDaysInMonth
      : workingDays;

  const computedPayable =
    item.payableDays ?? (item.presentDays || 0) + (item.paidLeaveDays || 0);
  const computedLop = item.lopDays ?? Math.max(0, activeCap - computedPayable);

  const [form, setForm] = useState({
    payableDays: computedPayable,
    lopDays: computedLop,
    clUsedDays: item.clUsedDays || 0,
    slUsedDays: item.slUsedDays || 0,
    plUsedDays: item.plUsedDays || 0,
    overtime: item.earnings?.overtime || 0,
    bonus: item.earnings?.bonus || 0,
    incentives: item.earnings?.incentives || 0,
    otherEarnings: item.earnings?.otherEarnings || 0,
    loanDeduction: item.deductions?.loanDeduction || 0,
    advanceDeduction: item.deductions?.advanceDeduction || 0,
    otherDeductions: item.deductions?.otherDeductions || 0,
    remarks: item.remarks || "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const upd = (k) => (e) => {
    const v =
      e.target.type === "number"
        ? e.target.value === ""
          ? 0
          : Number(e.target.value)
        : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const preview = useMemo(() => {
    const divisor = workingDays;
    const fullGross = item.rateGross || 0;
    const fullBasic = item.rateBasic || fullGross * 0.5;
    const fullHra = item.rateHra || fullGross * 0.5;
    const basicRatio = fullGross > 0 ? fullBasic / fullGross : 0.5;
    const hraRatio = fullGross > 0 ? fullHra / fullGross : 0.5;
    const perDay = fullGross / Math.max(1, divisor);

    const days = Math.max(
      0,
      Math.min(Number(form.payableDays) || 0, activeCap),
    );
    const grossBase = Math.round(perDay * days);
    const basicEarned = Math.round(grossBase * basicRatio);
    const hraEarned = Math.round(grossBase * hraRatio);
    const grossTotal =
      grossBase +
      Number(form.overtime || 0) +
      Number(form.bonus || 0) +
      Number(form.incentives || 0) +
      Number(form.otherEarnings || 0);

    const epf = Math.round(Math.min(basicEarned * 0.12, 1800));
    // Mirror the backend's computeEsi(): eligibility is decided by the FULL
    // monthly basic (the wage rate — same test the Employee form makes), the
    // contribution amount by the earned basic. Testing eligibility on the
    // prorated figure made anyone with LOP or a mid-month join drop under the
    // ceiling and pick up an ESIC they aren't liable for.
    const esiApplicable = fullBasic > 0 && fullBasic <= 21000 && basicEarned > 0;
    const esic = esiApplicable ? Math.ceil(basicEarned * 0.0075) : 0;

    const totalDed =
      epf +
      esic +
      Number(form.loanDeduction || 0) +
      Number(form.advanceDeduction || 0) +
      Number(form.otherDeductions || 0);
    const net = grossTotal - totalDed;

    return {
      days,
      perDay,
      grossBase,
      grossTotal,
      basicEarned,
      hraEarned,
      epf,
      esic,
      esiApplicable,
      totalDed,
      net,
    };
  }, [form, item, activeCap, workingDays]);

  const hasChanges =
    Number(form.payableDays) !== computedPayable ||
    Number(form.lopDays) !== computedLop ||
    Number(form.clUsedDays) !== (item.clUsedDays || 0) ||
    Number(form.slUsedDays) !== (item.slUsedDays || 0) ||
    Number(form.plUsedDays) !== (item.plUsedDays || 0) ||
    Number(form.overtime) !== (item.earnings?.overtime || 0) ||
    Number(form.bonus) !== (item.earnings?.bonus || 0) ||
    Number(form.incentives) !== (item.earnings?.incentives || 0) ||
    Number(form.otherEarnings) !== (item.earnings?.otherEarnings || 0) ||
    Number(form.loanDeduction) !== (item.deductions?.loanDeduction || 0) ||
    Number(form.advanceDeduction) !==
      (item.deductions?.advanceDeduction || 0) ||
    Number(form.otherDeductions) !== (item.deductions?.otherDeductions || 0) ||
    (form.remarks || "") !== (item.remarks || "");

  const reset = () =>
    setForm({
      payableDays: computedPayable,
      lopDays: computedLop,
      clUsedDays: item.clUsedDays || 0,
      slUsedDays: item.slUsedDays || 0,
      plUsedDays: item.plUsedDays || 0,
      overtime: item.earnings?.overtime || 0,
      bonus: item.earnings?.bonus || 0,
      incentives: item.earnings?.incentives || 0,
      otherEarnings: item.earnings?.otherEarnings || 0,
      loanDeduction: item.deductions?.loanDeduction || 0,
      advanceDeduction: item.deductions?.advanceDeduction || 0,
      otherDeductions: item.deductions?.otherDeductions || 0,
      remarks: item.remarks || "",
    });

  const handleSave = async () => {
    if (!item._id) {
      setSaveError("This item hasn't been saved yet. Click Save Draft first.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(
        `${API}/api/hr/payroll/item/${item._id}/override`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const [recalculating, setRecalculating] = useState(false);
  const handleRecalc = async () => {
    if (!item._id) {
      setSaveError("This item hasn't been saved yet. Click Save Draft first.");
      return;
    }
    if (
      !confirm(
        `Recalculate ${item.employeeName}'s pay against their current salary? Saved immediately.`,
      )
    )
      return;
    setRecalculating(true);
    setSaveError("");
    try {
      const res = await fetch(
        `${API}/api/hr/payroll/item/${item._id}/recalculate`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...getHeaders() },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      if (onSaved) await onSaved();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  const daysInMonth =
    item.daysInMonth ||
    (item.month && item.year
      ? new Date(item.year, item.month, 0).getDate()
      : 31);
  const regRow = {
    basicRate: item.rateBasic || 0,
    hraRate: item.rateHra || 0,
    totalSalary: item.rateGross || 0,
  };

  const tabs = [
    { k: "summary", l: "Summary" },
    { k: "earnings", l: "Earnings & Deductions" },
    { k: "register", l: "Salary Register" },
    {
      k: "days",
      l: `Day Breakdown${breakdown.length ? ` (${breakdown.length})` : ""}`,
    },
  ];
  if (canEdit) tabs.splice(1, 0, { k: "edit", l: "Edit" });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-end overflow-hidden bg-black/55"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Payroll detail for ${item.employeeName}`}
        className="frost-bar flex max-h-full min-h-0 w-full max-w-3xl flex-col border-l border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-[22px] leading-tight font-light tracking-[-0.03em] text-ink">
              {item.employeeName}
              {item.isManuallyOverridden && (
                <Chip tone="neutral" className="text-[10px]">
                  Edited
                </Chip>
              )}
              {item.status === "paid" && (
                <Chip tone="positive" className="text-[10px]">
                  <Lock className="w-3 h-3" /> Paid
                </Chip>
              )}
              {(item.preJoiningDays || 0) > 0 && (
                <Chip tone="risk" className="text-[10px]">
                  <CalendarDays className="w-3 h-3" /> Mid-month joiner
                </Chip>
              )}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span data-figure className="text-xs">{item.biometricId}</span>
              <span className="text-ink-faint">·</span>
              <span>{item.designation}</span>
              <span className="text-ink-faint">·</span>
              <span>{item.department}</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint" data-figure>{item.payPeriod}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-hairline bg-[var(--surface-sunken)] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
              Net Pay
            </p>
            <p data-figure className="mt-0.5 text-[30px] leading-none tracking-[-0.03em] text-ink">
              {fmtINR(item.roundedNetPay ?? item.netPay)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Gross <span data-figure>{fmtINR(item.earnings?.grossEarnings)}</span> − Deductions{" "}
              <span data-figure>{fmtINR(item.deductions?.totalDeductions)}</span>
            </p>
          </div>
          <div className="space-y-0.5 text-right text-xs text-ink-muted">
            <p>
              Payable: <span data-figure className="text-ink">{item.payableDays}</span> / <span data-figure>{workingDays}</span>
            </p>
            <p>Per day: <span data-figure>{fmtINR(item.perDayRate)}</span></p>
            {(item.preJoiningDays || 0) > 0 && (
              <p className="text-[var(--state-risk-ink)]">
                Joined day <span data-figure>{item.firstActiveDayInMonth}</span> · <span data-figure>{item.preJoiningDays}</span>d
                pre-join excluded
              </p>
            )}
            <div className="mt-1 flex flex-col items-end gap-0.5">
              {item.sundayOffsetApplied > 0 && (
                <Chip tone="extension">
                  <Sparkles className="w-3 h-3" /> Offset{" "}
                  <span data-figure>{item.sundayOffsetApplied}</span> Sun→AB
                </Chip>
              )}
              {item.autoAdjustedCL > 0 && (
                <Chip tone="extension">
                  <Sparkles className="w-3 h-3" /> Auto-adjusted{" "}
                  <span data-figure>{item.autoAdjustedCL}</span> CL
                </Chip>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-hairline px-6 py-2">
          <Tabs
            label="Payslip sections"
            value={tab}
            onChange={setTab}
            options={tabs.map((t) => ({ id: t.k, label: t.l }))}
          />
        </div>

        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {tab === "summary" && (
            <div className="space-y-4">
              <DOJPanel item={item} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricTile
                  label="Present"
                  value={item.presentDays}
                  tone="emerald"
                />
                <MetricTile
                  label="Half Days"
                  value={item.halfDays}
                  tone="yellow"
                />
                <MetricTile
                  label="Miss Punch"
                  value={item.missPunchDays || 0}
                  tone="pink"
                />
                <MetricTile
                  label="Absent"
                  value={item.absentDays}
                  tone="rose"
                />
                <MetricTile
                  label="Paid Leaves"
                  value={item.paidLeaveDays}
                  tone="purple"
                />
                <MetricTile
                  label="Week Offs"
                  value={item.weekOffDays || 0}
                  tone="gray"
                />
                <MetricTile
                  label="Holidays"
                  value={item.holidayDays || 0}
                  tone="indigo"
                />
                <MetricTile
                  label="LOP Days"
                  value={item.lopDays || 0}
                  tone="amber"
                />
                {(item.sundayWorkedDays || 0) > 0 && (
                  <MetricTile
                    label="Sundays Worked"
                    value={item.sundayWorkedDays}
                    tone="orange"
                  />
                )}
                {(item.sundayOffsetApplied || 0) > 0 && (
                  <MetricTile
                    label="Sun-Off AB Rescue"
                    value={item.sundayOffsetApplied}
                    tone="orange"
                  />
                )}
                {(item.holidayWorkedDays || 0) > 0 && (
                  <MetricTile
                    label="Worked on Holiday"
                    value={item.holidayWorkedDays}
                    tone="indigo"
                  />
                )}
                {(item.autoAdjustedCL || 0) > 0 && (
                  <MetricTile
                    label="Auto-Adj CL"
                    value={item.autoAdjustedCL}
                    tone="purple"
                  />
                )}
                {(item.unsyncedDays || 0) > 0 && (
                  <MetricTile
                    label="Unsynced"
                    value={item.unsyncedDays}
                    tone="amber"
                  />
                )}
                {(item.preJoiningDays || 0) > 0 && (
                  <MetricTile
                    label="Pre-joining (excl.)"
                    value={item.preJoiningDays}
                    tone="sky"
                  />
                )}
              </div>
            </div>
          )}

          {tab === "edit" && (
            <div className="space-y-5">
              <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                <strong>Manual override:</strong> change any field below and the
                system will re-derive Gross, EPF, ESIC and Net Pay
                automatically. PF and ESIC are computed on the{" "}
                <em>earned</em> basic for the days paid; ESI <em>eligibility</em>{" "}
                is decided by the full monthly basic (₹
                {(item.rateBasic || 0).toLocaleString("en-IN")}) against the
                ₹21,000 ceiling, so fewer paid days never make an
                over-the-ceiling employee ESI-liable.
              </div>
              {item.leaveBalanceSnapshot && (
                <div className="rounded-card bg-[var(--surface-sunken)] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                      Leave Balance (<span data-figure>{item.year}</span>)
                    </h4>
                    {!item.leaveBalanceSnapshot.hasRecord && (
                      <Chip tone="rework" className="text-[10px]">
                        Using schema defaults (no record yet)
                      </Chip>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    {["CL", "SL", "PL"].map((type) => {
                      const ent =
                        item.leaveBalanceSnapshot.entitlement?.[type] ?? 0;
                      const con =
                        item.leaveBalanceSnapshot.consumed?.[type] ?? 0;
                      const avail =
                        item.leaveBalanceSnapshot.available?.[type] ?? 0;
                      const isClIneligible =
                        type === "CL" &&
                        item.leaveBalanceSnapshot.clEligible === false;
                      return (
                        <div
                          key={type}
                          className={`rounded-inset p-3 ${isClIneligible ? "bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)]" : "bg-[var(--surface-raised)]"}`}
                        >
                          <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
                            {type === "CL"
                              ? "Casual"
                              : type === "SL"
                                ? "Sick"
                                : "Privilege"}
                          </p>
                          <div className="mt-1 flex items-baseline gap-1.5">
                            <p
                              data-figure
                              className={`text-[22px] leading-none tracking-[-0.025em] ${isClIneligible ? "text-[var(--state-rework-ink)]" : "text-ink"}`}
                            >
                              {isClIneligible ? "—" : avail}
                            </p>
                            <p className="text-xs text-ink-faint">
                              {isClIneligible ? "probation" : "remaining"}
                            </p>
                          </div>
                          <p data-figure className="mt-1 text-[10px] text-ink-faint">
                            {isClIneligible
                              ? `${item.leaveBalanceSnapshot.daysSinceDOJ ?? 0}/24 days`
                              : `${con} used of ${ent}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {item.leaveBalanceSnapshot.clEligible === false && (
                    <div className="mt-3 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-2.5 text-xs text-[var(--state-rework-ink)]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <p>
                        <strong>CL not yet eligible:</strong> employee has been
                        at the company for only{" "}
                        <strong data-figure>
                          {item.leaveBalanceSnapshot.daysSinceDOJ ?? 0}
                        </strong>{" "}
                        calendar days. CL auto-adjustment requires ≥ 24 days.
                        Any absent days in this month are LOP.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Days & Leaves
                </h4>
                {(item.preJoiningDays || 0) > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-2.5 text-xs text-[var(--state-risk-ink)]">
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <p>
                      Mid-month joiner (day {item.firstActiveDayInMonth}).
                      Divisor = <strong>{daysInMonth}</strong> (full calendar
                      month). {item.preJoiningDays} pre-joining day(s) are
                      excluded (not LOP). Payable + LOP = {activeCap} active
                      days.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <NumField
                    label="Payable Days"
                    value={form.payableDays}
                    onChange={upd("payableDays")}
                    hint={`Computed: ${computedPayable} · max ${activeCap} · drives gross`}
                    max={activeCap}
                  />
                  <NumField
                    label="LOP Days"
                    value={form.lopDays}
                    onChange={upd("lopDays")}
                    hint={`= ${activeCap} − Payable Days`}
                    max={activeCap}
                  />
                  <div className="hidden md:block" />
                  <NumField
                    label="CL Used"
                    value={form.clUsedDays}
                    onChange={upd("clUsedDays")}
                    hint="Casual leave (paid)"
                  />
                  <NumField
                    label="SL Used"
                    value={form.slUsedDays}
                    onChange={upd("slUsedDays")}
                    hint="Sick leave (paid)"
                  />
                  <NumField
                    label="PL Used"
                    value={form.plUsedDays}
                    onChange={upd("plUsedDays")}
                    hint="Privilege leave (paid)"
                  />
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Earnings
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <NumField
                    label="Overtime (₹)"
                    value={form.overtime}
                    onChange={upd("overtime")}
                    hint="Added to gross"
                  />
                  <NumField
                    label="Bonus (₹)"
                    value={form.bonus}
                    onChange={upd("bonus")}
                    hint="Added to gross"
                  />
                  <NumField
                    label="Incentives (₹)"
                    value={form.incentives}
                    onChange={upd("incentives")}
                    hint="Added to gross"
                  />
                  <NumField
                    label="Other Earnings (₹)"
                    value={form.otherEarnings}
                    onChange={upd("otherEarnings")}
                  />
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Additional Deductions
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <NumField
                    label="Loan Deduction (₹)"
                    value={form.loanDeduction}
                    onChange={upd("loanDeduction")}
                  />
                  <NumField
                    label="Advance Deduction (₹)"
                    value={form.advanceDeduction}
                    onChange={upd("advanceDeduction")}
                  />
                  <NumField
                    label="Other Deductions (₹)"
                    value={form.otherDeductions}
                    onChange={upd("otherDeductions")}
                  />
                </div>
                <p className="mt-2 text-[11px] text-ink-faint">
                  PF ({fmtINR(preview.epf)}) and ESIC (
                  {preview.esiApplicable
                    ? fmtINR(preview.esic)
                    : "not applicable — basic exceeds ₹21,000"}
                  ) are auto-computed on the earned basic and cannot be changed
                  here.
                </p>
              </div>
              <div>
                <Field label="Remarks">
                  <Textarea
                    value={form.remarks}
                    onChange={upd("remarks")}
                    placeholder="e.g. Adjusted for 1 day leave without balance"
                    rows={2}
                  />
                </Field>
              </div>
              <div className="rounded-card bg-[var(--surface-sunken)] p-4">
                <h4 className="mb-3 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Preview — What will be saved
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="truncate text-xs text-ink-faint">
                      Payable Days
                    </p>
                    <p data-figure className="mt-1 text-[18px] leading-none tracking-[-0.025em] text-ink">
                      {preview.days}
                      <span className="text-xs text-ink-faint">
                        {" "}
                        / {workingDays}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="truncate text-xs text-ink-faint">
                      Gross Earned
                    </p>
                    <p data-figure className="mt-1 text-[18px] leading-none tracking-[-0.025em] text-ink">
                      {fmtINR(preview.grossTotal)}
                    </p>
                  </div>
                  <div>
                    <p className="truncate text-xs text-ink-faint">
                      PF + ESIC
                    </p>
                    <p data-figure className="mt-1 text-[18px] leading-none tracking-[-0.025em] text-[var(--state-overdue-ink)]">
                      {fmtINR(preview.epf + preview.esic)}
                    </p>
                    <p className="mt-1 text-[9px] text-ink-faint">
                      on earned basic <span data-figure>₹
                      {(preview.basicEarned || 0).toLocaleString("en-IN")}</span>
                    </p>
                  </div>
                  <div>
                    <p className="truncate text-xs text-ink-faint">
                      Total Ded
                    </p>
                    <p data-figure className="mt-1 text-[18px] leading-none tracking-[-0.025em] text-[var(--state-overdue-ink)]">
                      {fmtINR(preview.totalDed)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
                  <p className="text-xs text-ink-muted" data-figure>
                    EPF {fmtINR(preview.epf)} + ESIC {fmtINR(preview.esic)}
                    {Number(form.loanDeduction) +
                      Number(form.advanceDeduction) +
                      Number(form.otherDeductions) >
                      0 &&
                      ` + other ${fmtINR(Number(form.loanDeduction) + Number(form.advanceDeduction) + Number(form.otherDeductions))}`}
                  </p>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.09em] text-ink-faint">
                      Net Pay
                    </p>
                    <p data-figure className="mt-1 text-[24px] leading-none tracking-[-0.03em] text-[var(--state-positive-ink)]">
                      {fmtINR(preview.net)}
                    </p>
                    {hasChanges && (
                      <p className="mt-1 text-[11px] text-ink-faint" data-figure>
                        was {fmtINR(item.roundedNetPay ?? item.netPay)}
                        {preview.net !==
                          (item.roundedNetPay ?? item.netPay) && (
                          <span
                            className={
                              preview.net > (item.roundedNetPay ?? item.netPay)
                                ? "ml-1 text-[var(--state-positive-ink)]"
                                : "ml-1 text-[var(--state-overdue-ink)]"
                            }
                          >
                            (
                            {preview.net > (item.roundedNetPay ?? item.netPay)
                              ? "+"
                              : ""}
                            {fmtINR(
                              preview.net - (item.roundedNetPay ?? item.netPay),
                            )}
                            )
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {saveError && <InlineError message={saveError} />}
              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 pt-2">
                <RoleGate min="editor">
                <Button
                  tone="secondary"
                  onClick={handleRecalc}
                  disabled={recalculating || saving}
                  title="Pull the employee's current salary and recompute this payslip"
                >
                  {recalculating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />{" "}
                      Recalculating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" /> Recalculate from current
                      salary
                    </>
                  )}
                </Button>
                </RoleGate>
                <div className="flex items-center gap-2">
                  <Button
                    tone="secondary"
                    onClick={reset}
                    disabled={!hasChanges || saving}
                  >
                    <Undo2 className="w-4 h-4" /> Reset
                  </Button>
                  <RoleGate min="editor">
                  <Button
                    tone="primary"
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" /> Save & Recompute
                      </>
                    )}
                  </Button>
                  </RoleGate>
                </div>
              </div>
            </div>
          )}

          {tab === "earnings" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Earnings
                </h4>
                <div className="overflow-hidden rounded-inset border border-hairline">
                  {/* A stipend is one figure. Showing a Basic of ₹0 and an HRA
                      of ₹0 above a gross that equals the stipend invites the
                      reading that two components failed to compute, rather
                      than that there are none. */}
                  {item.isIntern ? (
                    <LineItem
                      label="Stipend (earned)"
                      value={
                        item.earnings?.stipend ?? item.earnings?.grossEarnings
                      }
                    />
                  ) : (
                    <>
                      <LineItem
                        label="Basic Salary (earned)"
                        value={item.earnings?.basicSalary}
                      />
                      <LineItem
                        label="House Rent Allowance (earned)"
                        value={item.earnings?.houseRentAllowance}
                      />
                      <LineItem
                        label="Special Allowance"
                        value={item.earnings?.specialAllowance}
                      />
                    </>
                  )}
                  <LineItem label="Overtime" value={item.earnings?.overtime} />
                  <LineItem label="Bonus" value={item.earnings?.bonus} />
                  <LineItem
                    label="Incentives"
                    value={item.earnings?.incentives}
                  />
                  <LineItem
                    label="Other Earnings"
                    value={item.earnings?.otherEarnings}
                  />
                  <LineItem
                    label="Gross Earnings"
                    value={item.earnings?.grossEarnings}
                    bold
                  />
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  Deductions
                </h4>
                <div className="overflow-hidden rounded-inset border border-hairline">
                  {item.isIntern ? (
                    <div className="px-3.5 py-3 text-xs text-ink-muted">
                      Interns are not enrolled in provident fund or ESI, and no
                      professional tax applies. Nothing is withheld from a
                      stipend.
                    </div>
                  ) : (
                    <>
                      <LineItem
                        label={`Provident Fund (on earned basic ₹${(item.earnings?.basicSalary || 0).toLocaleString("en-IN")})`}
                        value={item.deductions?.providentFund}
                      />
                      <LineItem
                        label={
                          (item.rateBasic || 0) > 21000
                            ? "ESIC (not applicable — basic exceeds ₹21,000)"
                            : `ESIC (on earned basic ₹${(item.earnings?.basicSalary || 0).toLocaleString("en-IN")})`
                        }
                        value={item.deductions?.esic}
                      />
                      <LineItem
                        label="Professional Tax"
                        value={item.deductions?.professionalTax}
                      />
                    </>
                  )}
                  {/* The working, not just the figure. "Other Deductions
                      ₹2,600" on its own invites "where did that come from";
                      the label answers it before anyone has to ask. */}
                  {(item.otherDeductionFull || 0) > 0 && (
                    <LineItem
                      label={
                        `Other Deduction (₹${Number(item.otherDeductionFull).toLocaleString("en-IN")}` +
                        ` × ${item.otherDeductionChargeableDays ?? 0}/${item.daysInMonth ?? 0} payable days)`
                      }
                      value={item.otherDeductionRecurring}
                    />
                  )}
                  {/* Said out loud rather than left as a quiet difference
                      between the amount on the employee and the amount taken.
                      It happens when the month earned less than the
                      deduction — an unpaid intern, or a month of no pay. */}
                  {(item.otherDeductionUncollected || 0) > 0 && (
                    <LineItem
                      label="  …not collected — no pay to take it from"
                      value={item.otherDeductionUncollected}
                    />
                  )}
                  <LineItem
                    label="Loan Deduction"
                    value={item.deductions?.loanDeduction}
                  />
                  <LineItem
                    label="Advance Deduction"
                    value={item.deductions?.advanceDeduction}
                  />
                  <LineItem
                    label="Other Deductions"
                    value={item.deductions?.otherDeductions}
                  />
                  <LineItem
                    label="Total Deductions"
                    value={item.deductions?.totalDeductions}
                    bold
                  />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] p-3">
                  <p className="text-sm font-medium text-[var(--state-positive-ink)]">
                    Net Pay
                  </p>
                  <p data-figure className="text-[20px] leading-none tracking-[-0.025em] text-[var(--state-positive-ink)]">
                    {fmtINR(item.roundedNetPay ?? item.netPay)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === "register" && (
            <div>
              <h4 className="mb-3 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Salary Register Row — matches Excel export
              </h4>
              {(item.preJoiningDays || 0) > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-2.5 text-xs text-[var(--state-risk-ink)]">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <p>
                    Mid-month joiner (day {item.firstActiveDayInMonth}). Divisor
                    = <strong>{daysInMonth}</strong> (full calendar month).{" "}
                    {item.preJoiningDays} pre-joining day(s) excluded.
                  </p>
                </div>
              )}
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full min-w-[380px] text-[12px]">
                  <thead>
                    <tr>
                      <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                        Field
                      </th>
                      <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Name of Employee
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {item.employeeName}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">Designation</td>
                      <td className="px-2 py-1.5 text-right">
                        {item.designation}
                      </td>
                    </tr>
                    <tr className="bg-[var(--surface-sunken)]">
                      <td className="border-b border-hairline px-3 py-2.5 font-medium text-ink">
                        Rate of wages payable
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline py-2.5 pl-6 pr-3 text-ink-muted">
                        — Basic
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {fmtINR(regRow.basicRate)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline py-2.5 pl-6 pr-3 text-ink-muted">— HRA</td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {fmtINR(regRow.hraRate)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline py-2.5 pl-6 pr-3 text-ink-muted">
                        — Total Salary
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right font-medium text-ink">
                        {fmtINR(regRow.totalSalary)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Total No. of Days of the Month
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {daysInMonth}
                        {(item.preJoiningDays || 0) > 0 && (
                          <span className="ml-1 text-[10px] text-[var(--state-risk-ink)]">
                            (joined day {item.firstActiveDayInMonth})
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Total attendance units of work done
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right font-medium text-[var(--state-positive-ink)]">
                        {computedPayable}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Loss of Pay (LOP) Days
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right font-medium text-[var(--state-overdue-ink)]">
                        {computedLop || 0}
                      </td>
                    </tr>
                    <tr className="bg-[var(--surface-sunken)]">
                      <td className="border-b border-hairline px-3 py-2.5 font-medium text-ink">
                        Wages actually paid
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline py-2.5 pl-6 pr-3 text-ink-muted">
                        — Basic (earned)
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {fmtINR(item.earnings?.basicSalary)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline py-2.5 pl-6 pr-3 text-ink-muted">
                        — HRA (earned)
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {fmtINR(item.earnings?.houseRentAllowance)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Overtime worked
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-ink">
                        {fmtINR(item.earnings?.overtime)}
                      </td>
                    </tr>
                    <tr className="bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)]">
                      <td className="border-b border-hairline px-3 py-2.5 font-medium text-ink">
                        Gross Wages Payable
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right font-medium text-[var(--state-positive-ink)]">
                        {fmtINR(item.earnings?.grossEarnings)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Employee's contribution to P.F
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-[var(--state-overdue-ink)]">
                        {fmtINR(item.deductions?.providentFund)}
                        <span className="ml-1 text-[9px] text-ink-faint">
                          (on ₹{(item.rateBasic || 0).toLocaleString("en-IN")})
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">E.S.I</td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-[var(--state-overdue-ink)]">
                        {fmtINR(item.deductions?.esic)}
                        <span className="ml-1 text-[9px] text-ink-faint">
                          (on ₹{(item.rateBasic || 0).toLocaleString("en-IN")})
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Salary Advance
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-[var(--state-overdue-ink)]">
                        {fmtINR(item.deductions?.advanceDeduction)}
                      </td>
                    </tr>
                    <tr>
                      <td className="border-b border-hairline px-3 py-2.5 text-ink-muted">
                        Other Deductions
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-[var(--state-overdue-ink)]">
                        {fmtINR(item.deductions?.otherDeductions)}
                      </td>
                    </tr>
                    <tr className="bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)]">
                      <td className="border-b border-hairline px-3 py-2.5 font-medium text-ink">
                        Total Deductions
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right font-medium text-[var(--state-overdue-ink)]">
                        {fmtINR(item.deductions?.totalDeductions)}
                      </td>
                    </tr>
                    <tr className="bg-[color-mix(in_srgb,var(--state-positive)_22%,transparent)]">
                      <td className="border-b border-hairline px-3 py-2.5 font-medium text-[var(--state-positive-ink)]">
                        Net Wages Paid
                      </td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm font-medium text-[var(--state-positive-ink)]">
                        {fmtINR(item.roundedNetPay ?? item.netPay)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "days" && (
            <div className="space-y-3">
              {breakdown.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Day-by-day breakdown is only shown in preview mode
                </p>
              ) : (
                <>
                  {breakdown.some((d) => d.category === "PRE-JOINING") && (
                    <div className="flex items-center gap-2 rounded-inset border border-dashed border-hairline bg-[var(--surface-sunken)] px-3 py-2 text-xs text-ink-muted">
                      <Info className="h-3 w-3 shrink-0" />
                      <span>
                        Dashed cells = before date of joining — excluded from
                        pay &amp; leave calculations entirely
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-7 gap-1">
                    {breakdown.map((d) => {
                      const isPreJoining = d.category === "PRE-JOINING";
                      const tone = isPreJoining
                        ? `${WASH_NEUTRAL} border-2 border-dashed border-hairline`
                        : CATEGORY_COLORS[d.category] || WASH_NEUTRAL;
                      const dayNum = parseInt(d.dateStr.slice(-2));
                      return (
                        <div
                          key={d.dateStr}
                          title={
                            isPreJoining
                              ? `${d.dateStr} — Before joining date`
                              : `${d.dateStr} — ${d.category}${d.note ? ` (${d.note})` : ""}`
                          }
                          className={`relative rounded-inset ${tone} py-2 text-center text-xs ${isPreJoining ? "opacity-40" : ""}`}
                        >
                          <div className="text-[9px] opacity-70">
                            {
                              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                                d.dayOfWeek
                              ]
                            }
                          </div>
                          <div data-figure className="font-medium">{dayNum}</div>
                          <div className="text-[9px] font-semibold">
                            {isPreJoining ? "—" : d.category}
                          </div>
                          {d.autoAdjusted && (
                            <div
                              className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[var(--state-extension)]"
                              title="Auto-adjusted"
                            />
                          )}
                          {d.sundayOffsetApplied && (
                            <div
                              className="absolute left-0 top-0 h-2 w-2 rounded-full bg-[var(--state-risk)]"
                              title="Sunday offset"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, hint, max }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        data-figure
        type="number"
        min="0"
        max={max}
        step="any"
        value={value ?? 0}
        onChange={onChange}
      />
    </Field>
  );
}

function MetricTile({ label, value, tone }) {
  // Tone carries meaning: worked days read positive, partial or adjusted days
  // read extension, unpaid absence reads overdue, everything else stays neutral.
  const tones = {
    emerald: "text-[var(--state-positive-ink)]",
    yellow: "text-[var(--state-extension-ink)]",
    pink: "text-[var(--state-rework-ink)]",
    rose: "text-[var(--state-overdue-ink)]",
    purple: "text-[var(--state-risk-ink)]",
    indigo: "text-[var(--state-risk-ink)]",
    amber: "text-[var(--state-rework-ink)]",
    orange: "text-[var(--state-extension-ink)]",
    sky: "text-[var(--state-risk-ink)]",
    gray: "text-ink",
  };
  return (
    <div className="rounded-inset bg-[var(--surface-sunken)] p-2.5">
      <p className="truncate text-[11px] uppercase tracking-[0.09em] text-ink-faint">
        {label}
      </p>
      <p
        data-figure
        className={`mt-0.5 text-[22px] leading-none tracking-[-0.025em] ${tones[tone] || tones.gray}`}
      >
        {value || 0}
      </p>
    </div>
  );
}

function LineItem({ label, value, bold }) {
  const amount = Number(value || 0);
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-hairline px-3 py-2 last:border-0 ${bold ? "bg-[var(--surface-sunken)] font-medium" : ""}`}
    >
      <span className="text-xs text-ink">{label}</span>
      <span
        data-figure
        className={`shrink-0 text-xs ${amount > 0 ? "text-ink" : "text-ink-faint"}`}
      >
        {fmtINR(amount)}
      </span>
    </div>
  );
}
