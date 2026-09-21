"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Calendar, RefreshCw, Search, ChevronLeft, ChevronRight,
    Download, Filter, TrendingUp, Users, Clock,
    CheckCircle2, XCircle, AlertTriangle, Moon, Sun,
    Sparkles, Building2, Eye, EyeOff, Grid3x3, Layers,
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Panel, PanelHead, PageHead, Button, Input, Select, Chip,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "";

const ymNow = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const minsToHHMM = (m) => {
    if (!m || m <= 0) return "—";
    const h = Math.floor(m / 60), mm = m % 60;
    return h ? `${h}h ${String(mm).padStart(2, "0")}m` : `${mm}m`;
};

// ── Status display config ─────────────────────────────────────────────────
// Raw status (as stored in DB) → display props
// Labels come from backend via settings.displayLabels but we keep fallbacks here
// Colours are state tokens, never raw hex: each wash pairs with its own ink.
const wash = (token, pct = 26) =>
    `color-mix(in srgb, var(--state-${token}) ${pct}%, transparent)`;
const washInk = (token) => `var(--state-${token}-ink)`;
const washDot = (token) => `var(--state-${token})`;
const tone = (token, label, pct) => ({
    bg: wash(token, pct), fg: washInk(token), dot: washDot(token), label,
});

const STATUS_CONFIG = {
    P: tone("positive", "Present", 24),
    "P*": tone("extension", "Late"),
    "P~": tone("extension", "Early Out", 18),
    HD: tone("rework", "Half Day"),
    MP: tone("blocked", "Miss Punch"),
    AB: tone("overdue", "Absent"),
    LWP: tone("overdue", "LWP"),
    WO: { bg: "var(--control)", fg: "var(--ink-muted)", dot: "var(--ink-faint)", label: "Weekly Off" },
    PH: tone("risk", "Holiday", 24),
    FH: tone("risk", "Festival Holiday", 18),
    NH: tone("blocked", "National Holiday", 18),
    OH: tone("positive", "Optional Holiday", 16),
    RH: tone("rework", "Restricted Holiday", 18),
    "L-CL": tone("blocked", "Casual Leave", 22),
    "L-SL": tone("blocked", "Sick Leave", 22),
    "L-EL": tone("blocked", "Earned Leave", 22),
    WFH: tone("risk", "Work From Home", 20),
    CO: tone("positive", "Comp Off", 18),
    "—": { bg: "var(--control)", fg: "var(--ink-faint)", dot: "var(--ink-faint)", label: "—" },
};

export default function MusterRollPage() {
    const [yearMonth, setYearMonth] = useState(ymNow());
    const [department, setDepartment] = useState("all");
    const [departments, setDepartments] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [exporting, setExporting] = useState(false);
    const [density, setDensity] = useState("normal"); // compact | normal

    useEffect(() => {
        fetch(`${API}/hr/attendance/departments`, { credentials: "include" })
            .then(r => r.json())
            .then(d => setDepartments(d.data || []))
            .catch(() => { });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ yearMonth, ...(department !== "all" && { department }) });
            const r = await fetch(`${API}/hr/attendance/muster-roll?${qs}`, { credentials: "include" });
            const d = await r.json();
            if (d.success) setData(d);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [yearMonth, department]);

    useEffect(() => { load(); }, [load]);

    const monthNav = (delta) => {
        const [y, m] = yearMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };

    const filteredEmployees = useMemo(() => {
        if (!data?.employees) return [];
        if (!search) return data.employees;
        const q = search.toLowerCase();
        return data.employees.filter(e =>
            (e.employeeName || "").toLowerCase().includes(q) ||
            (e.biometricId || "").toLowerCase().includes(q) ||
            (e.department || "").toLowerCase().includes(q));
    }, [data, search]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const qs = new URLSearchParams({ yearMonth, ...(department !== "all" && { department }) });
            const url = `${API}/hr/attendance/export-muster-roll?${qs}`;
            const r = await fetch(url, { credentials: "include" });
            if (!r.ok) throw new Error("Export failed");
            const blob = await r.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `attendance_${yearMonth}${department !== "all" ? `_${department}` : ""}.xlsx`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e) {
            alert("Export failed: " + e.message);
        } finally {
            setExporting(false);
        }
    };

    const displayLabel = (rawStatus) => {
        const customLabel = data?.displayLabels?.[rawStatus];
        return customLabel || STATUS_CONFIG[rawStatus]?.label || rawStatus;
    };

    const cellSize = density === "compact" ? 22 : 28;

    return (
        <Hr_DashboardLayout activeMenu="attendance-muster">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Muster Roll"
                    sub={
                        <span className="flex flex-wrap items-center gap-x-1.5">
                            <span>{data?.monthLabel || "Loading…"}</span>
                            {data?.grand && (
                                <span className="text-ink-faint">
                                    · <span data-figure>{data.grand.totalEmployees}</span> employees · <span data-figure>{data.grand.workingDays}</span> working days
                                    {data.grand.holidayCount > 0 && (
                                        <> · <span data-figure>{data.grand.holidayCount}</span> holiday{data.grand.holidayCount === 1 ? "" : "s"}</>
                                    )}
                                </span>
                            )}
                        </span>
                    }
                    actions={
                        <>
                            <Button tone="secondary" size="sm" onClick={load} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                            </Button>
                            <Button tone="primary" size="sm" onClick={handleExport} disabled={exporting || !data}>
                                {exporting ? <><RefreshCw className="h-4 w-4 animate-spin" /> Exporting…</> : <><Download className="h-4 w-4" /> Export Excel</>}
                            </Button>
                        </>
                    }
                />

                <div className="space-y-4">
                    {/* Filters */}
                    <Panel label="Filters" className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1 py-1">
                            <button type="button" onClick={() => monthNav(-1)}
                                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <input type="month" value={yearMonth}
                                onChange={(e) => setYearMonth(e.target.value)}
                                data-figure
                                className="bg-transparent px-2 py-1.5 text-sm font-medium text-ink focus:outline-none" />
                            <button type="button" onClick={() => monthNav(1)}
                                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setYearMonth(ymNow())}
                                className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                This Month
                            </button>
                        </div>

                        <Select value={department} onChange={(e) => setDepartment(e.target.value)}
                            aria-label="Department" className="w-auto min-w-[180px]">
                            <option value="all">All Departments</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </Select>

                        <div className="relative min-w-[200px] flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                            <Input type="text" placeholder="Search employee, ID or department…"
                                aria-label="Search employees"
                                value={search} onChange={(e) => setSearch(e.target.value)}
                                className="pl-9" />
                        </div>

                        <Button tone="secondary" size="sm"
                            onClick={() => setDensity(density === "normal" ? "compact" : "normal")}>
                            <Grid3x3 className="h-3.5 w-3.5" />
                            {density === "normal" ? "Normal" : "Compact"}
                        </Button>
                    </Panel>

                    {/* Holiday banner */}
                    {data?.holidays?.length > 0 && (
                        <Panel label="Holidays this month" className="flex items-start gap-2.5">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-risk-ink)]" />
                            <div className="min-w-0 flex-1">
                                <div className="mb-1.5 flex items-center gap-2">
                                    <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                                        <span data-figure>{data.holidays.length}</span> Holiday{data.holidays.length === 1 ? "" : "s"} This Month
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {data.holidays.map(h => {
                                        const cfg = STATUS_CONFIG[{
                                            national: "NH", company: "FH", optional: "OH", restricted: "RH",
                                        }[h.type] || "PH"];
                                        const day = Number(h.date.slice(-2));
                                        return (
                                            <span key={h.date}
                                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                                                style={{ background: cfg.bg, color: cfg.fg }}>
                                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
                                                <strong data-figure>{day}</strong> {h.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        </Panel>
                    )}

                    {/* Summary tiles */}
                    {data?.grand && (
                        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                            <MiniTile label="Present" value={data.grand.totalPresent} color="var(--state-positive-ink)" />
                            <MiniTile label="Late" value={data.grand.totalLate} color="var(--state-extension-ink)" />
                            <MiniTile label="Half Day" value={data.grand.totalHD} color="var(--state-rework-ink)" />
                            <MiniTile label="Absent" value={data.grand.totalAbsent} color="var(--state-overdue-ink)" />
                            <MiniTile label="Leaves" value={data.grand.totalLeaves} color="var(--state-blocked-ink)" />
                            <MiniTile label="Total OT" value={minsToHHMM(data.grand.totalOtMins)} color="var(--state-risk-ink)" small />
                        </div>
                    )}

                    {/* Muster table */}
                    {loading ? (
                        <Panel label="Muster roll" className="py-20 text-center">
                            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-ink-muted" />
                            <p className="text-sm text-ink-faint">Loading muster roll…</p>
                        </Panel>
                    ) : !data || !data.employees?.length ? (
                        <Panel label="Muster roll" className="py-20 text-center">
                            <p className="text-sm text-ink-faint">No data for this month.</p>
                        </Panel>
                    ) : (
                        <Panel label="Muster roll" padded={false} className="overflow-hidden">
                            <div className="scroll-slim overflow-x-auto">
                                <table className="border-collapse text-xs">
                                    <thead>
                                        {/* Day number row */}
                                        <tr className="bg-slab text-slab-ink">
                                            <th className="sticky left-0 z-20 min-w-[200px] border-r border-hairline-slab bg-slab px-3 py-2 text-left">
                                                <span className="text-[10px] font-medium tracking-[0.09em] uppercase">Employee</span>
                                            </th>
                                            <th className="sticky left-[200px] z-20 min-w-[110px] border-r border-hairline-slab bg-slab px-2 py-2 text-left">
                                                <span className="text-[10px] font-medium tracking-[0.09em] uppercase">Dept</span>
                                            </th>
                                            {data.days.map(cal => (
                                                <th key={cal.dateStr}
                                                    className="border-r border-hairline-slab px-0.5 text-center"
                                                    style={{
                                                        minWidth: cellSize + 2,
                                                        width: cellSize + 2,
                                                        background: cal.holiday
                                                            ? "color-mix(in srgb, var(--state-risk) 30%, transparent)"
                                                            : cal.isSunday
                                                                ? "color-mix(in srgb, var(--state-overdue) 30%, transparent)"
                                                                : undefined,
                                                    }}>
                                                    <div className="text-[8px] leading-none font-medium opacity-70">{cal.dayName.charAt(0)}</div>
                                                    <div data-figure className="text-[11px] leading-tight font-medium">{cal.day}</div>
                                                </th>
                                            ))}
                                            <th className="min-w-[50px] border-l border-hairline-slab px-2 py-2 text-center"
                                                style={{ background: "color-mix(in srgb, var(--state-positive) 34%, transparent)" }}>
                                                <span className="text-[9px] font-medium tracking-[0.09em] uppercase">Total</span>
                                            </th>
                                            <th className="min-w-[40px] bg-[var(--slab-screen)] px-2 py-2 text-center">P</th>
                                            <th className="min-w-[40px] bg-[var(--slab-screen)] px-2 py-2 text-center">A</th>
                                            <th className="min-w-[40px] bg-[var(--slab-screen)] px-2 py-2 text-center">HD</th>
                                            <th className="min-w-[40px] bg-[var(--slab-screen)] px-2 py-2 text-center">LV</th>
                                            <th className="min-w-[60px] bg-[var(--slab-screen)] px-2 py-2 text-center">WORK</th>
                                            <th className="min-w-[60px] bg-[var(--slab-screen)] px-2 py-2 text-center">OT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEmployees.map((emp, empIdx) => {
                                            const bgEven = empIdx % 2 === 0
                                                ? "bg-[var(--surface-raised)]"
                                                : "bg-[var(--surface-sunken)]";
                                            return (
                                                <tr key={emp.biometricId} className="hover:bg-[var(--row-hover)]">
                                                    <td className={`sticky left-0 z-10 border-r border-b border-hairline px-3 py-1.5 ${bgEven}`}>
                                                        <div className="flex items-center gap-2">
                                                            <Avatar name={emp.employeeName} />
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-ink">{emp.employeeName}</p>
                                                                <p data-figure className="truncate text-[10px] text-ink-faint">
                                                                    {emp.biometricId} · {emp.designation}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className={`sticky left-[200px] z-10 border-r border-b border-hairline px-2 py-1.5 ${bgEven}`}>
                                                        <span className="block max-w-[100px] truncate text-[11px] font-medium text-ink-muted">{emp.department}</span>
                                                    </td>
                                                    {data.days.map(cal => {
                                                        const d = emp.days[cal.dateStr] || { status: "—" };
                                                        const cfg = STATUS_CONFIG[d.status] || STATUS_CONFIG["—"];
                                                        const hasContent = d.status !== "—" && !d.isFuture && !d.unsynced;
                                                        return (
                                                            <td key={cal.dateStr}
                                                                title={hasContent ? `${cal.dateStr} · ${displayLabel(d.status)}${d.lateMins ? ` · Late ${d.lateMins}m` : ""}${d.otMins ? ` · OT ${d.otMins}m` : ""}${cal.holiday ? ` · ${cal.holiday.name}` : ""}` : cal.dateStr}
                                                                className="border-r border-b border-hairline p-0 text-center"
                                                                style={{
                                                                    width: cellSize + 2,
                                                                    height: cellSize + 2,
                                                                    background: hasContent
                                                                        ? cfg.bg
                                                                        : (cal.isSunday
                                                                            ? "color-mix(in srgb, var(--state-overdue) 10%, transparent)"
                                                                            : "transparent"),
                                                                }}>
                                                                {hasContent ? (
                                                                    <div data-figure className="flex h-full items-center justify-center font-medium"
                                                                        style={{ color: cfg.fg, fontSize: density === "compact" ? 9 : 10 }}>
                                                                        {displayShort(d.status, data?.displayLabels)}
                                                                        {d.hrOverride && <span className="ml-0.5 text-[var(--state-risk-ink)]">●</span>}
                                                                        {d.wasPromoted && !d.hrOverride && <span className="ml-0.5 text-[var(--state-extension-ink)]">↑</span>}
                                                                    </div>
                                                                ) : d.isFuture ? (
                                                                    <span className="text-[10px] text-ink-faint opacity-50">—</span>
                                                                ) : d.unsynced ? (
                                                                    <span className="text-[10px] text-ink-faint">·</span>
                                                                ) : null}
                                                            </td>
                                                        );
                                                    })}
                                                    {/* Total Attendance column */}
                                                    <td className="border-r border-b border-l border-hairline px-2 py-1.5 text-center"
                                                        style={{ background: "color-mix(in srgb, var(--state-positive) 12%, transparent)" }}>
                                                        <span data-figure className="text-sm font-medium text-[var(--state-positive-ink)]">
                                                            {emp.totals.totalAttendance || 0}
                                                        </span>
                                                    </td>
                                                    <td className="border-r border-b border-hairline px-2 py-1.5 text-center">
                                                        <span data-figure className="text-sm font-medium text-[var(--state-positive-ink)]">
                                                            {(emp.totals.P + emp.totals["P*"] + emp.totals["P~"]) || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="border-r border-b border-hairline px-2 py-1.5 text-center">
                                                        <span data-figure className="text-sm font-medium text-[var(--state-overdue-ink)]">
                                                            {emp.totals.AB || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="border-r border-b border-hairline px-2 py-1.5 text-center">
                                                        <span data-figure className="text-sm font-medium text-[var(--state-rework-ink)]">
                                                            {emp.totals.HD || "—"}
                                                        </span>
                                                    </td>
                                                    <td className="border-r border-b border-hairline px-2 py-1.5 text-center">
                                                        <span data-figure className="text-sm font-medium text-[var(--state-blocked-ink)]">
                                                            {emp.totals.leaves || "—"}
                                                        </span>
                                                    </td>
                                                    <td data-figure className="border-r border-b border-hairline px-2 py-1.5 text-center text-[11px] text-ink-muted">
                                                        {minsToHHMM(emp.totals.totalNetWorkMins)}
                                                    </td>
                                                    <td data-figure className="border-b border-hairline px-2 py-1.5 text-center text-[11px] font-medium text-[var(--state-risk-ink)]">
                                                        {minsToHHMM(emp.totals.totalOtMins)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    )}

                    {/* Legend */}
                    <Panel label="Legend">
                        <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Legend</p>
                        <div className="flex flex-wrap gap-1.5">
                            {["P", "P*", "P~", "HD", "MP", "AB", "WO", "FH", "NH", "OH", "RH", "L-CL", "L-SL", "L-EL", "WFH", "CO"].map(k => {
                                const cfg = STATUS_CONFIG[k];
                                return (
                                    <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
                                        style={{ background: cfg.bg, color: cfg.fg }}>
                                        <strong>{displayShort(k, data?.displayLabels)}</strong>
                                        <span className="opacity-70">{cfg.label}</span>
                                    </span>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-[10px] text-ink-faint">
                            <span className="flex items-center gap-1"><span className="font-medium text-[var(--state-risk-ink)]">●</span> HR Override</span>
                            <span className="flex items-center gap-1"><span className="font-medium text-[var(--state-extension-ink)]">↑</span> Auto-promoted to HD (cumulative late)</span>
                        </div>
                    </Panel>
                </div>
            </div>
        </Hr_DashboardLayout>
    );
}

// Convert raw status → compact symbol for grid cells
function displayShort(status, displayLabels) {
    if (displayLabels && displayLabels[status]) return displayLabels[status];
    // Fallbacks (match backend defaults)
    const fallback = {
        P: "P", "P*": "L", "P~": "EO", HD: "HD", MP: "MP", AB: "A", LWP: "LWP",
        WO: "WO", PH: "PH", FH: "FH", NH: "NH", OH: "OH", RH: "RH",
        "L-CL": "CL", "L-SL": "SL", "L-EL": "EL", WFH: "WFH", CO: "CO",
    };
    return fallback[status] || status;
}

function MiniTile({ label, value, color, small }) {
    return (
        <Panel className="!px-3 !py-2.5">
            <p className="text-[10px] font-medium tracking-[0.09em] text-ink-faint uppercase">{label}</p>
            <p data-figure className={`${small ? "text-sm" : "text-lg"} mt-1 leading-none tracking-[-0.025em]`} style={{ color }}>{value}</p>
        </Panel>
    );
}

const hueFor = (name = "") =>
    name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

function Avatar({ name = "" }) {
    const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
    return (
        <div className="matrubhoomi-avatar h-8 w-8 shrink-0 text-[10px] font-medium" data-avatar-hue={hueFor(name)}>
            {initials}
        </div>
    );
}
