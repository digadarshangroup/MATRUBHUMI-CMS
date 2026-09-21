"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Clock, Search, ChevronLeft, ChevronRight,
    RefreshCw, X, ChevronDown, ChevronRight as ExpandIco,
    LogIn, LogOut as LogOutIcon, Coffee, Utensils,
    Sun, Sparkles, TrendingUp, Briefcase,
    AlertCircle, CalendarDays, CheckCircle2, AlertTriangle,
    Users,
} from "lucide-react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Panel, PanelHead, PageHead, Button, Input, Select, Chip, EmptyState,
} from "@/components/ceo/ui/Primitives";

// ─── API ──────────────────────────────────────────────────────────────────────
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/employee")
    .replace("/api/employee", "");

function getHeaders() {
    const t = typeof window !== "undefined"
        ? (localStorage.getItem("hr_token") || localStorage.getItem("token") || "") : "";
    return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers }, credentials: "include" });
    const d = await res.json();
    if (!res.ok) throw new Error(d.message || `HTTP ${res.status}`);
    return d;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMonthRange(ym) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
        from: `${ym}-01`,
        to: `${ym}-${String(last).padStart(2, "0")}`,
        label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    };
}

const fmtTime = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
};
const minsToHM = (m) => {
    if (!m || m <= 0) return null;
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
};

const TODAY_STR = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

// ─── Status config — state tokens, no raw hex ─────────────────────────────────
const wash = (token, pct = 22) =>
    `color-mix(in srgb, var(--state-${token}) ${pct}%, transparent)`;
const washInk = (token) => `var(--state-${token}-ink)`;
const def = (token, label, pct) => ({
    label,
    bg: wash(token, pct),
    text: washInk(token),
    border: wash(token, (pct ?? 22) + 18),
});

const STATUS_DEF = {
    P: def("positive", "Present"),
    "P*": def("extension", "Late"),
    "P~": def("extension", "Early Out", 14),
    HD: def("rework", "Half Day"),
    AB: def("overdue", "Absent"),
    MP: def("blocked", "Miss Punch"),
    WO: { label: "Week Off", bg: "var(--surface-sunken)", text: "var(--ink-muted)", border: "var(--color-hairline)" },
    FH: def("risk", "Festival Hol"),
    NH: def("risk", "National Hol"),
    OH: def("positive", "Optional Hol", 14),
    RH: def("rework", "Restricted", 14),
    "L-CL": def("blocked", "Casual Leave", 16),
    "L-SL": def("blocked", "Sick Leave", 16),
    "L-EL": def("blocked", "Earned Leave", 16),
    LWP: def("overdue", "LWP", 16),
    WFH: def("risk", "Work From Home", 14),
    CO: def("positive", "Comp Off", 14),
    UNSYNCED: { label: "Not synced", bg: "var(--control)", text: "var(--ink-faint)", border: "var(--color-hairline)" },
    FUTURE: { label: "—", bg: "transparent", text: "var(--ink-faint)", border: "transparent" },
};

function Badge({ status, displayLabels }) {
    const d = STATUS_DEF[status] || STATUS_DEF.UNSYNCED;
    if (status === "FUTURE") return <span className="text-xs text-ink-faint">—</span>;
    const label = (displayLabels && displayLabels[status]) ? displayLabels[status] : d.label;
    return (
        <span style={{ background: d.bg, color: d.text, border: `1px solid ${d.border}` }}
            className="inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-medium whitespace-nowrap">
            {label}
        </span>
    );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const hueFor = (name = "") =>
    name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name = "", size = "md" }) {
    const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
    const sz = size === "lg" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
    return (
        <div className={`matrubhoomi-avatar ${sz} shrink-0 font-medium`} data-avatar-hue={hueFor(name)}>
            {initials}
        </div>
    );
}

// ─── Punch breakdown ──────────────────────────────────────────────────────────
function PunchBreakdown({ row, employeeType }) {
    const expected = employeeType === "operator" ? 6 : 2;
    const slots = expected === 6
        ? ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"]
        : ["in", "out"];
    const punches = row.rawPunches || [];
    const slotMeta = {
        in: { label: "Check In", Icon: LogIn, color: "var(--state-positive-ink)" },
        lunch_out: { label: "Lunch Out", Icon: Utensils, color: "var(--state-extension-ink)" },
        lunch_in: { label: "Lunch In", Icon: Utensils, color: "var(--state-extension-ink)" },
        tea_out: { label: "Tea Out", Icon: Coffee, color: "var(--state-rework-ink)" },
        tea_in: { label: "Tea In", Icon: Coffee, color: "var(--state-rework-ink)" },
        out: { label: "Check Out", Icon: LogOutIcon, color: "var(--state-overdue-ink)" },
    };
    return (
        <div className="space-y-3">
            {/* Meta row */}
            <div className="flex flex-wrap gap-4 text-xs text-ink-faint">
                <span>Shift: <strong data-figure className="text-ink">{row.shiftStart} – {row.shiftEnd}</strong></span>
                {row.totalSpanMins > 0 && <span>Span: <strong data-figure className="text-ink">{minsToHM(row.totalSpanMins)}</strong></span>}
                {row.totalBreakMins > 0 && <span>Break: <strong data-figure className="text-ink">{minsToHM(row.totalBreakMins)}</strong></span>}
                {(row.appliedExtraGraceMins || 0) > 0 && <span className="text-[var(--state-risk-ink)]">+<span data-figure>{row.appliedExtraGraceMins}</span>m OT grace</span>}
            </div>
            {/* Punch slots */}
            <div className={`grid gap-2 ${expected === 6 ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2"}`}>
                {slots.map(slot => {
                    const punch = punches.find(p => p.punchType === slot) || null;
                    const m = slotMeta[slot]; const Icon = m.Icon;
                    const has = !!punch?.time;
                    return (
                        <div key={slot}
                            className={`rounded-inset border border-hairline p-3 ${has ? "bg-[var(--surface-raised)]" : "border-dashed bg-[var(--surface-sunken)]"}`}>
                            <div className="mb-1.5 flex items-center gap-1.5">
                                <Icon size={12} style={{ color: has ? m.color : "var(--ink-faint)" }} />
                                <span className="text-[10px] font-medium tracking-[0.09em] text-ink-faint uppercase">{m.label}</span>
                                {punch?.source === "manual" && (
                                    <span className="ml-auto rounded-full bg-[var(--control)] px-1.5 text-[9px] font-medium text-ink-muted">Manual</span>
                                )}
                            </div>
                            <p data-figure className={`text-sm font-medium ${has ? "text-ink" : "text-ink-faint italic"}`}>
                                {has ? fmtTime(punch.time) : "Missing"}
                            </p>
                        </div>
                    );
                })}
            </div>
            {row.hrRemarks && (
                <p className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-risk-ink)]">
                    <strong>HR note:</strong> {row.hrRemarks}
                </p>
            )}
        </div>
    );
}

// ─── Day row ──────────────────────────────────────────────────────────────────
function DayRow({ row: r, employeeType, displayLabels, isToday }) {
    const [open, setOpen] = useState(false);
    const isFuture = !!r.isFuture;
    const isEmpty = r.status === "FUTURE";
    const isLeave = ["L-CL", "L-SL", "L-EL", "LWP", "WFH", "CO"].includes(r.status);
    const isRest = ["WO", "FH", "NH", "OH", "RH", "PH"].includes(r.status);
    const hasDetail = !isFuture && r.synced && (r.rawPunches?.length > 0);
    const expected = employeeType === "operator" ? 6 : 2;
    const isSun = r.isSunday;

    // Subtle row tinting
    let rowBg = "";
    if (isToday) rowBg = "bg-[color-mix(in_srgb,var(--state-extension)_14%,transparent)]";
    else if (isFuture && isLeave) rowBg = "bg-[color-mix(in_srgb,var(--state-blocked)_8%,transparent)]";
    else if (isFuture && isRest) rowBg = "bg-[var(--surface-sunken)]";
    else if (isEmpty) rowBg = "";
    else if (isLeave) rowBg = "bg-[color-mix(in_srgb,var(--state-blocked)_7%,transparent)]";
    else if (r.holiday) rowBg = "bg-[color-mix(in_srgb,var(--state-risk)_8%,transparent)]";
    else if (isSun && !r.isSundayWorked) rowBg = "bg-[var(--surface-sunken)]";

    const dimText = isEmpty;

    return (
        <>
            <tr
                className={`${rowBg} border-b border-hairline transition-colors ${hasDetail ? "cursor-pointer hover:bg-[var(--row-hover)]" : ""} ${isToday ? "border-l-2 border-l-[var(--state-extension)]" : ""}`}
                onClick={() => hasDetail && setOpen(o => !o)}
            >
                {/* Expand */}
                <td className="w-8 py-2.5 pr-1 pl-4">
                    {hasDetail && (
                        open
                            ? <ChevronDown size={13} className="text-ink-faint" />
                            : <ExpandIco size={13} className="text-ink-faint" />
                    )}
                </td>

                {/* Day */}
                <td className="w-28 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <span data-figure className={`w-5 text-right text-sm font-medium ${dimText ? "text-ink-faint" : isSun ? "text-[var(--state-overdue-ink)]" : "text-ink"}`}>
                            {r.dayNum}
                        </span>
                        <span className={`w-8 text-xs ${dimText ? "text-ink-faint" : isSun ? "text-[var(--state-overdue-ink)]" : "text-ink-faint"}`}>
                            {r.dayName}
                        </span>
                        {r.isSundayWorked && <Sun size={12} className="text-[var(--state-extension-ink)]" title="Worked on Sunday" />}
                        {r.holiday && !isFuture && <Sparkles size={12} className="text-[var(--state-risk-ink)]" title={r.holiday?.name} />}
                    </div>
                </td>

                {/* Status */}
                <td className="w-44 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge status={r.status} displayLabels={displayLabels} />
                        {isFuture && isLeave && (
                            <span className="text-[10px] font-medium text-[var(--state-blocked-ink)]">approved</span>
                        )}
                        {r.wasPromotedToHalfDay && (
                            <span className="text-[10px] font-medium text-[var(--state-rework-ink)]">↑HD</span>
                        )}
                        {r.hrFinalStatus && (
                            <span className="text-[10px] font-medium text-ink-muted">HR</span>
                        )}
                        {isToday && (
                            <span className="rounded-full bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] px-2 py-px text-[10px] font-medium text-[var(--state-extension-ink)]">Today</span>
                        )}
                    </div>
                    {r.holiday?.name && (
                        <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-ink-faint">{r.holiday.name}</p>
                    )}
                </td>

                {/* IN */}
                <td className="px-3 py-2.5 text-right">
                    {!isEmpty && !isRest && !isLeave && fmtTime(r.inTime) ? (
                        <span data-figure className={`text-xs font-medium ${r.isLate ? "text-[var(--state-extension-ink)]" : "text-ink"}`}>
                            {fmtTime(r.inTime)}
                            {r.isLate && r.lateMins > 0 && <span className="ml-1 text-[10px] text-[var(--state-extension-ink)]">+{r.lateMins}m</span>}
                        </span>
                    ) : <span className="text-xs text-ink-faint">—</span>}
                </td>

                {/* OUT */}
                <td className="px-3 py-2.5 text-right">
                    {!isEmpty && !isRest && !isLeave && fmtTime(r.finalOut) ? (
                        <span data-figure className={`text-xs font-medium ${r.isEarlyDeparture ? "text-[var(--state-rework-ink)]" : "text-ink"}`}>
                            {fmtTime(r.finalOut)}
                            {r.isEarlyDeparture && r.earlyDepartureMins > 0 && <span className="ml-1 text-[10px] text-[var(--state-rework-ink)]">-{r.earlyDepartureMins}m</span>}
                        </span>
                    ) : <span className="text-xs text-ink-faint">—</span>}
                </td>

                {/* Work */}
                <td className="px-3 py-2.5 text-right">
                    {!isEmpty && r.netWorkMins > 0 ? (
                        <span data-figure className={`text-xs font-medium ${r.netWorkMins >= 480 ? "text-[var(--state-positive-ink)]" : "text-ink"}`}>
                            {minsToHM(r.netWorkMins)}
                        </span>
                    ) : <span className="text-xs text-ink-faint">—</span>}
                </td>

                {/* Late / OT */}
                <td className="px-3 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        {r.lateMins > 0 && <span data-figure className="text-[11px] text-[var(--state-extension-ink)]">{r.lateMins}m late</span>}
                        {r.otMins > 0 && <span data-figure className="text-[11px] text-[var(--state-risk-ink)]">OT {r.otMins}m</span>}
                        {!r.lateMins && !r.otMins && <span className="text-xs text-ink-faint">—</span>}
                    </div>
                </td>

                {/* Punches */}
                <td className="px-4 py-2.5 text-center">
                    {r.synced && r.punchCount > 0 ? (
                        <span data-figure className={`text-xs font-medium ${r.punchCount < expected ? "text-[var(--state-extension-ink)]" : "text-ink-muted"}`}>
                            {r.punchCount}/{expected}
                        </span>
                    ) : <span className="text-xs text-ink-faint">—</span>}
                </td>
            </tr>

            {open && hasDetail && (
                <tr className="bg-[var(--surface-sunken)]">
                    <td colSpan={8} className="border-b border-hairline px-6 py-4">
                        <PunchBreakdown row={r} employeeType={employeeType} />
                    </td>
                </tr>
            )}
        </>
    );
}

// ─── Leave applications panel ─────────────────────────────────────────────────
const LEAVE_STATUS_DEF = {
    pending: { label: "Pending", tone: "rework" },
    manager_approved: { label: "Mgr Approved", tone: "risk" },
    manager_rejected: { label: "Mgr Rejected", tone: "extension" },
    hr_approved: { label: "Approved", tone: "positive" },
    hr_rejected: { label: "Rejected", tone: "overdue" },
    cancelled: { label: "Cancelled", tone: "neutral" },
};

const LEAVE_TYPE_LABEL = { CL: "Casual", SL: "Sick", PL: "Privilege/Earned" };

function fmtDateShort(s) {
    if (!s) return "—";
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function LeaveApplicationsPanel({ apps }) {
    if (!apps || apps.length === 0) return null;
    return (
        <Panel label="Leave Applications This Month" padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
                <p className="flex items-center gap-2 text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                    <CalendarDays size={15} className="text-ink-faint" /> Leave Applications This Month
                </p>
                <span className="text-xs text-ink-faint"><span data-figure>{apps.length}</span> application{apps.length > 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-hairline">
                {apps.map(lv => {
                    const sd = LEAVE_STATUS_DEF[lv.status] || LEAVE_STATUS_DEF.cancelled;
                    const isApproved = lv.status === "hr_approved";
                    const isRejected = ["hr_rejected", "manager_rejected"].includes(lv.status);
                    return (
                        <div key={String(lv._id)} className={`flex items-start gap-4 px-5 py-3.5 ${isApproved ? "bg-[color-mix(in_srgb,var(--state-positive)_8%,transparent)]" : isRejected ? "bg-[color-mix(in_srgb,var(--state-overdue)_8%,transparent)]" : ""}`}>
                            {/* Leave type + dates */}
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-ink">
                                        {LEAVE_TYPE_LABEL[lv.leaveType] || lv.leaveType} Leave
                                    </span>
                                    <span data-figure className="text-xs text-ink-faint">
                                        {fmtDateShort(lv.fromDate)}
                                        {lv.fromDate !== lv.toDate && ` – ${fmtDateShort(lv.toDate)}`}
                                    </span>
                                    <span className="text-xs text-ink-faint">·</span>
                                    <span data-figure className="text-xs font-medium text-ink-faint">
                                        {lv.totalDays} {lv.isHalfDay ? "half day" : `day${lv.totalDays !== 1 ? "s" : ""}`}
                                    </span>
                                </div>
                                {lv.reason && (
                                    <p className="mt-0.5 truncate text-xs text-ink-muted">{lv.reason}</p>
                                )}
                                {/* Rejection reason */}
                                {isRejected && lv.rejectionReason && (
                                    <p className="mt-1 text-xs text-[var(--state-overdue-ink)]">
                                        <strong>Reason:</strong> {lv.rejectionReason}
                                    </p>
                                )}
                                {isRejected && lv.hrRemarks && !lv.rejectionReason && (
                                    <p className="mt-1 text-xs text-[var(--state-overdue-ink)]">
                                        <strong>HR note:</strong> {lv.hrRemarks}
                                    </p>
                                )}
                                {/* Manager decisions */}
                                {lv.managerDecisions?.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        {lv.managerDecisions.map((md, i) => (
                                            <Chip key={i} tone={md.decision === "approved" ? "positive" : "overdue"}>
                                                {md.managerName || "Manager"}: {md.decision}
                                                {md.remarks ? ` — ${md.remarks}` : ""}
                                            </Chip>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Status badge */}
                            <Chip tone={sd.tone}>
                                {isApproved && "✓ "}{isRejected && "✗ "}{sd.label}
                            </Chip>
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}

// ─── Timecard content ─────────────────────────────────────────────────────────
function TimecardContent({ data }) {
    const stats = data.stats || {};
    const rows = data.rows || [];
    const displayLabels = data.displayLabels || {};
    const empType = data.employee?.employeeType;
    const leaveApps = data.leaveApplications || [];

    const holidayCount = (stats.FH || 0) + (stats.NH || 0) + (stats.OH || 0) + (stats.RH || 0) + (stats.PH || 0);

    // Summary stats config
    const statItems = [
        { label: "Total Attendance", value: stats.totalAttendance || 0, accent: "var(--color-ink)", wide: true },
        { label: "Present", value: stats.effectivePresent || 0, accent: "var(--state-positive-ink)" },
        { label: "Late Days", value: stats["P*"] || 0, accent: "var(--state-extension-ink)" },
        { label: "Half Day", value: stats.HD || 0, accent: "var(--state-rework-ink)" },
        { label: "Absent", value: stats.AB || 0, accent: "var(--state-overdue-ink)" },
        { label: "Miss Punch", value: stats.MP || 0, accent: "var(--state-blocked-ink)" },
        { label: "Off Days", value: stats.WO || 0, accent: "var(--ink-muted)" },
        { label: "Holidays", value: holidayCount, accent: "var(--state-risk-ink)" },
        { label: "Leaves", value: stats.leaves || 0, accent: "var(--state-blocked-ink)" },
        { label: "Net Work", value: minsToHM(stats.totalNetWorkMins) || "—", accent: "var(--state-positive-ink)" },
        { label: "Late Total", value: minsToHM(stats.totalLateMins) || "—", accent: "var(--state-extension-ink)" },
        { label: "OT Total", value: minsToHM(stats.totalOtMins) || "—", accent: "var(--state-risk-ink)" },
    ];

    // Find separator position
    const firstFutureIdx = rows.findIndex(r => r.isFuture);

    return (
        <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {statItems.map(({ label, value, accent }) => (
                    <Panel key={label} className="!px-4 !py-3">
                        <p className="mb-1 text-[11px] font-medium text-ink-faint">{label}</p>
                        <p data-figure className="text-xl leading-none tracking-[-0.025em]" style={{ color: accent }}>{value}</p>
                    </Panel>
                ))}
            </div>

            {/* Calendar strip */}
            <Panel label="Monthly Overview">
                <p className="mb-4 flex items-center gap-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    <CalendarDays size={14} className="text-ink-faint" /> Monthly Overview
                </p>
                <div className="flex flex-wrap gap-1">
                    {rows.map(r => {
                        const d = STATUS_DEF[r.status] || STATUS_DEF.UNSYNCED;
                        const isFut = !!r.isFuture && r.status === "FUTURE";
                        const isT = r.dateStr === TODAY_STR;
                        return (
                            <div key={r.dateStr}
                                title={`${r.dateStr} · ${(displayLabels && displayLabels[r.status]) || d.label}${r.inTime ? ` · In ${fmtTime(r.inTime)}` : ""}${r.finalOut ? ` → ${fmtTime(r.finalOut)}` : ""}`}
                                className={`relative flex cursor-default flex-col items-center justify-center rounded-inset border select-none
                                    ${isT ? "ring-2 ring-[var(--state-extension)] ring-offset-1" : ""}
                                    ${isFut ? "border-dashed opacity-40" : ""}`}
                                style={{
                                    width: 40, height: 46,
                                    background: isFut ? "var(--surface-sunken)" : d.bg,
                                    borderColor: isFut ? "var(--color-hairline)" : d.border,
                                }}
                            >
                                <span className={`text-[9px] font-medium ${isFut ? "text-ink-faint" : r.isSunday ? "text-[var(--state-overdue-ink)]" : "text-ink-faint"}`}>
                                    {r.dayName}
                                </span>
                                <span data-figure className={`text-sm leading-tight font-medium ${isFut ? "text-ink-faint" : "text-ink"}`}
                                    style={!isFut ? { color: d.text } : undefined}>
                                    {r.dayNum}
                                </span>
                                {r.hasOT && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--state-risk)]" />}
                                {r.isSundayWorked && <Sun size={9} className="absolute -top-0.5 -left-0.5 rounded-full text-[var(--state-extension-ink)]" />}
                                {r.holiday?.name && <Sparkles size={9} className="absolute -top-0.5 -left-0.5 rounded-full text-[var(--state-risk-ink)]" />}
                                {r.wasPromotedToHalfDay && <TrendingUp size={8} className="absolute -right-0.5 -bottom-0.5 rounded-full text-[var(--state-rework-ink)]" />}
                            </div>
                        );
                    })}
                </div>
                {/* Legend */}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-hairline pt-3">
                    {[["P", "Present"], ["P*", "Late"], ["P~", "Early"], ["HD", "Half Day"], ["AB", "Absent"], ["MP", "Miss Punch"], ["WO", "Week Off"], ["FH", "Holiday"], ["L-CL", "Leave"]].map(([k, lbl]) => {
                        const d = STATUS_DEF[k]; if (!d) return null;
                        return (
                            <div key={k} className="flex items-center gap-1.5">
                                <span className="h-3 w-3 rounded-inset border" style={{ background: d.bg, borderColor: d.border }} />
                                <span className="text-[10px] text-ink-faint">{lbl}</span>
                            </div>
                        );
                    })}
                    <div className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-inset border border-dashed border-hairline" />
                        <span className="text-[10px] text-ink-faint">Future</span>
                    </div>
                </div>
            </Panel>

            {/* Punch log */}
            <Panel label="Punch Log" padded={false} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
                    <p className="flex items-center gap-2 text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                        <Clock size={15} className="text-ink-faint" /> Punch Log
                    </p>
                    <p className="text-xs text-ink-faint">Click a row to expand punch detail</p>
                </div>

                <div className="scroll-slim overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-hairline bg-[var(--surface-sunken)] text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                                <th className="w-8 py-2.5 pr-1 pl-4" />
                                <th className="w-28 px-3 py-2.5 text-left">Day</th>
                                <th className="w-44 px-3 py-2.5 text-left">Status</th>
                                <th className="px-3 py-2.5 text-right">In</th>
                                <th className="px-3 py-2.5 text-right">Out</th>
                                <th className="w-24 px-3 py-2.5 text-right">Work</th>
                                <th className="w-28 px-3 py-2.5 text-right">Late / OT</th>
                                <th className="w-16 px-4 py-2.5 text-center">Punch</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const isToday = r.dateStr === TODAY_STR;
                                // Insert visual divider before first future row
                                const insertDivider = r.isFuture && i > 0 && !rows[i - 1].isFuture;
                                return (
                                    <>
                                        {insertDivider && (
                                            <tr key={`div-${r.dateStr}`} className="bg-[var(--surface-sunken)]">
                                                <td colSpan={8} className="px-4 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-px flex-1 bg-hairline" />
                                                        <span className="text-[10px] font-medium whitespace-nowrap text-ink-faint">
                                                            Future dates — no punch data yet
                                                        </span>
                                                        <div className="h-px flex-1 bg-hairline" />
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        <DayRow
                                            key={r.dateStr}
                                            row={r}
                                            employeeType={empType}
                                            displayLabels={displayLabels}
                                            isToday={isToday}
                                        />
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between border-t border-hairline bg-[var(--surface-sunken)] px-5 py-3 text-xs text-ink-faint">
                    <span>
                        <span data-figure>{rows.filter(r => !r.isFuture).length}</span> past days ·{" "}
                        {rows.filter(r => r.isFuture && r.status !== "FUTURE").length > 0
                            ? `${rows.filter(r => r.isFuture && r.status !== "FUTURE").length} future with data ·`
                            : ""}
                        <span data-figure>{rows.filter(r => r.isFuture && r.status === "FUTURE").length}</span> future empty
                    </span>
                    <span>Net work: <strong data-figure className="text-ink">{minsToHM(stats.totalNetWorkMins) || "—"}</strong></span>
                </div>
            </Panel>

            {/* Leave applications panel */}
            <LeaveApplicationsPanel apps={leaveApps} />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function TimecardPage() {
    const [yearMonth, setYearMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    const [selectedBio, setSelectedBio] = useState("");
    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("all");
    const [departments, setDepartments] = useState([]);
    const [data, setData] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loading, setLoading] = useState(false);
    const [showPicker, setShowPicker] = useState(false);

    const range = useMemo(() => getMonthRange(yearMonth), [yearMonth]);

    useEffect(() => {
        (async () => {
            setLoadingList(true);
            try {
                const [list, depts] = await Promise.all([
                    api("/hr/attendance/employees-list"),
                    api("/hr/attendance/departments"),
                ]);
                setEmployees(list.data || []);
                setDepartments(depts.data || []);
                if (!selectedBio && list.data?.length) setSelectedBio(list.data[0].biometricId);
            } catch { } finally { setLoadingList(false); }
        })();
    }, []);

    const loadTimecard = useCallback(async () => {
        if (!selectedBio) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams({ biometricId: selectedBio, from: range.from, to: range.to });
            const r = await api(`/hr/attendance/timecard?${qs}`);
            setData(r);
        } catch { setData(null); } finally { setLoading(false); }
    }, [selectedBio, range.from, range.to]);

    useEffect(() => { loadTimecard(); }, [loadTimecard]);

    const changeMonth = (delta) => {
        const [y, m] = yearMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };

    const filteredEmps = useMemo(() => {
        let list = employees;
        if (deptFilter !== "all") list = list.filter(e => e.department === deptFilter);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                (e.employeeName || "").toLowerCase().includes(q) ||
                (e.biometricId || "").toLowerCase().includes(q) ||
                (e.designation || "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [employees, search, deptFilter]);

    const empMeta = data?.employee || employees.find(e => e.biometricId === selectedBio);

    return (
        <DashboardLayout activeMenu="attendance-timecard">
            <div className="mx-auto max-w-[1480px] px-4 py-6 pb-10 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Timecard"
                    sub={<span>{range.label} · full-month attendance</span>}
                    actions={
                        <>
                            <div className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] p-1">
                                <button type="button" onClick={() => changeMonth(-1)}
                                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                    <ChevronLeft size={15} />
                                </button>
                                <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)}
                                    data-figure
                                    className="bg-transparent px-2 py-1 text-sm font-medium text-ink focus:outline-none" />
                                <button type="button" onClick={() => changeMonth(1)}
                                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                    <ChevronRight size={15} />
                                </button>
                            </div>
                            <Button tone="secondary" size="sm" onClick={loadTimecard} disabled={loading || !selectedBio}>
                                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                            </Button>
                        </>
                    }
                />

                <div className="space-y-5">
                    {/* Employee picker */}
                    <Panel label="Employee" padded={false} className="overflow-hidden">
                        <button type="button" onClick={() => setShowPicker(!showPicker)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--control)]">
                            {empMeta ? (
                                <div className="flex min-w-0 items-center gap-3">
                                    <Avatar name={empMeta.employeeName} size="lg" />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-ink">{empMeta.employeeName}</p>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                                            <span data-figure className="text-ink-muted">{empMeta.biometricId}</span>
                                            {empMeta.designation && <><span>·</span><span>{empMeta.designation}</span></>}
                                            {empMeta.department && <><span>·</span><span>{empMeta.department}</span></>}
                                            {empMeta.shiftStart && <><span>·</span><span data-figure>Shift {empMeta.shiftStart} – {empMeta.shiftEnd}</span></>}
                                            <span className="rounded-full bg-[var(--control)] px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                                                {empMeta.employeeType === "executive" ? "Executive" : "Operator"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-ink-muted">
                                    <Users size={15} /><span className="text-sm">Select an employee…</span>
                                </div>
                            )}
                            <ChevronDown size={15} className={`shrink-0 text-ink-faint transition-transform ${showPicker ? "rotate-180" : ""}`} />
                        </button>

                        {showPicker && (
                            <div className="space-y-3 border-t border-hairline p-4">
                                <div className="flex flex-wrap gap-2">
                                    <div className="relative min-w-[200px] flex-1">
                                        <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
                                        <Input autoFocus type="text" placeholder="Name, ID or designation…"
                                            aria-label="Search employees"
                                            value={search} onChange={e => setSearch(e.target.value)}
                                            className="pl-9 pr-8" />
                                        {search && (
                                            <button type="button" onClick={() => setSearch("")} className="absolute top-1/2 right-2.5 -translate-y-1/2">
                                                <X size={12} className="text-ink-faint" />
                                            </button>
                                        )}
                                    </div>
                                    <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                                        aria-label="Department" className="w-auto min-w-[180px]">
                                        <option value="all">All Departments</option>
                                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                    </Select>
                                </div>
                                <div className="scroll-slim max-h-72 overflow-y-auto rounded-inset border border-hairline">
                                    {loadingList ? (
                                        <div className="py-8 text-center text-sm text-ink-faint">Loading…</div>
                                    ) : filteredEmps.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-ink-faint">No employees match</div>
                                    ) : filteredEmps.map(e => {
                                        const sel = e.biometricId === selectedBio;
                                        return (
                                            <button type="button" key={e.biometricId}
                                                onClick={() => { setSelectedBio(e.biometricId); setShowPicker(false); setSearch(""); }}
                                                className={`flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left transition-colors last:border-0 ${sel ? "bg-[var(--control-active)]" : "hover:bg-[var(--control)]"}`}>
                                                <Avatar name={e.employeeName} />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`truncate text-sm font-medium ${sel ? "text-ink" : "text-ink"}`}>{e.employeeName}</p>
                                                    <p className="truncate text-xs text-ink-faint">
                                                        <span data-figure>{e.biometricId}</span>
                                                        {e.department && ` · ${e.department}`}
                                                    </p>
                                                </div>
                                                {sel && <CheckCircle2 size={15} className="shrink-0 text-[var(--state-positive-ink)]" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </Panel>

                    {/* Content */}
                    {!selectedBio ? (
                        <Panel label="Timecard">
                            <EmptyState
                                title="Select an employee to view their timecard"
                                body="Shows full month including future approved leaves"
                            />
                        </Panel>
                    ) : loading && !data ? (
                        <Panel label="Timecard" className="py-16 text-center">
                            <RefreshCw size={22} className="mx-auto mb-3 animate-spin text-ink-muted" />
                            <p className="text-sm text-ink-faint">Loading timecard…</p>
                        </Panel>
                    ) : !data ? (
                        <Panel label="Timecard" className="py-14 text-center">
                            <AlertCircle size={24} className="mx-auto mb-3 text-[var(--state-overdue-ink)]" />
                            <p className="text-sm text-[var(--state-overdue-ink)]">Could not load timecard</p>
                        </Panel>
                    ) : (
                        <TimecardContent data={data} />
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
