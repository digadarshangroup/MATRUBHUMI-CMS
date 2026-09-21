"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import CEO_DashboardLayout from "@/components/CEO_DashboardLayout";
import {
    RefreshCw, ChevronLeft, ChevronRight, Search, X,
    AlertCircle, CheckCircle, RefreshCcw, Download,
    Info, BarChart3, List, LogIn, LogOut, Utensils, Coffee,
    Clock, AlertTriangle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const todayStr = () => new Date().toISOString().split("T")[0];
const ymNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// ── Status config ─────────────────────────────────────────────────────────────
const S = {
    P: { label: "Present", chip: "is-ok", dot: "bg-emerald-500", cell: "var(--ck-wash)", cellFg: "var(--ck-accent)" },
    "P*": { label: "Late", chip: "is-warn", dot: "bg-amber-400", cell: "var(--ck-warn-wash)", cellFg: "var(--ck-warn)" },
    "P~": { label: "Early Dep.", chip: "is-warn", dot: "bg-yellow-400", cell: "var(--ck-warn-wash)", cellFg: "var(--ck-warn)" },
    HD: { label: "Half Day", chip: "is-warn", dot: "bg-orange-400", cell: "var(--ck-warn-wash)", cellFg: "var(--ck-warn)" },
    AB: { label: "Absent", chip: "is-danger", dot: "bg-red-500", cell: "var(--ck-danger-wash)", cellFg: "var(--ck-danger)" },
    MP: { label: "Miss Punch", chip: "is-danger", dot: "bg-pink-400", cell: "rgba(236,72,153,.16)", cellFg: "#ec4899" },
    WO: { label: "Week Off", chip: "", dot: "bg-slate-400", cell: "var(--ck-panel-2)", cellFg: "var(--ck-ink-3)" },
    PH: { label: "Public Holiday", chip: "is-info", dot: "bg-blue-400", cell: "rgba(56,189,248,.14)", cellFg: "var(--ck-accent-2)" },
    FH: { label: "Festival Hol.", chip: "is-info", dot: "bg-indigo-400", cell: "rgba(56,189,248,.14)", cellFg: "var(--ck-accent-2)" },
    NH: { label: "Nat. Holiday", chip: "is-info", dot: "bg-indigo-400", cell: "rgba(56,189,248,.14)", cellFg: "var(--ck-accent-2)" },
    OH: { label: "Opt. Holiday", chip: "", dot: "bg-violet-400", cell: "rgba(168,85,247,.16)", cellFg: "var(--ck-purple)" },
    RH: { label: "Rest. Holiday", chip: "", dot: "bg-violet-400", cell: "rgba(168,85,247,.16)", cellFg: "var(--ck-purple)" },
    "L-CL": { label: "Casual Leave", chip: "is-info", dot: "bg-cyan-400", cell: "rgba(56,189,248,.14)", cellFg: "var(--ck-accent-2)" },
    "L-SL": { label: "Sick Leave", chip: "is-info", dot: "bg-cyan-400", cell: "rgba(56,189,248,.14)", cellFg: "var(--ck-accent-2)" },
    "L-EL": { label: "Earned Leave", chip: "", dot: "bg-purple-400", cell: "rgba(168,85,247,.16)", cellFg: "var(--ck-purple)" },
    LWP: { label: "LWP", chip: "is-danger", dot: "bg-rose-400", cell: "var(--ck-danger-wash)", cellFg: "var(--ck-danger)" },
    WFH: { label: "WFH", chip: "is-ok", dot: "bg-teal-400", cell: "var(--ck-wash)", cellFg: "var(--ck-accent)" },
    CO: { label: "Comp Off", chip: "is-ok", dot: "bg-teal-400", cell: "var(--ck-wash)", cellFg: "var(--ck-accent)" },
};

function StatusChip({ status, overwritten }) {
    const m = S[status] || { label: status || "—", chip: "", dot: "bg-gray-300" };
    return (
        <span className={`ck-chip gap-1 ${m.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
            {m.label}
            {overwritten && <span className="ml-0.5 px-0.5 rounded text-[8px] font-bold" style={{background:"var(--ck-warn-wash)",color:"var(--ck-warn)"}}>HR</span>}
        </span>
    );
}

const minsToHM = (m) => { if (!m) return "—"; const h = Math.floor(m / 60), mn = m % 60; return h > 0 ? `${h}h ${mn}m` : `${mn}m`; };
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;

// ── Profile photo ─────────────────────────────────────────────────────────────
function getPhotoUrl(emp) {
    const url = emp?.profilePhoto?.url || emp?.profilePhoto;
    if (url && typeof url === "string" && url.trim()) {
        if (url.includes("cloudinary.com") && url.includes("/upload/")) {
            const parts = url.split("/upload/");
            if (parts.length === 2) return `${parts[0]}/upload/w_100,h_100,c_fill,g_face,q_auto,f_auto/${parts[1]}`;
        }
        return url;
    }
    return null;
}

function EmpAvatar({ name = "?", emp, size = "md" }) {
    const [imgErr, setImgErr] = useState(false);
    const url = getPhotoUrl(emp);
    const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
    const colors = ["bg-violet-400", "bg-blue-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400", "bg-teal-400", "bg-indigo-400", "bg-pink-400"];
    const ci = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
    const sz = { sm: "w-7 h-7 text-[9px]", md: "w-10 h-10 text-xs", lg: "w-14 h-14 text-lg" }[size];

    if (url && !imgErr)
        return <div className={`${sz} rounded-full overflow-hidden flex-shrink-0`} style={{boxShadow:"0 0 0 1px var(--ck-line)"}}><img src={url} alt={name} className="w-full h-full object-cover" onError={() => setImgErr(true)} /></div>;
    return <div className={`${sz} rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${colors[ci]}`}>{initials}</div>;
}

// ── Punch slot definitions ────────────────────────────────────────────────────
// Operators (6 punches): In → Lunch Out → Lunch In → Tea Out → Tea In → Out
// Executives (2 punches): In → Out
const SLOT_META = {
    in: { label: "Check In", Icon: LogIn, tone: "emerald", timeField: "inTime" },
    lunch_out: { label: "Lunch Out", Icon: Utensils, tone: "amber", timeField: "lunchOut" },
    lunch_in: { label: "Lunch In", Icon: Utensils, tone: "amber", timeField: "lunchIn" },
    tea_out: { label: "Tea Out", Icon: Coffee, tone: "orange", timeField: "teaOut" },
    tea_in: { label: "Tea In", Icon: Coffee, tone: "orange", timeField: "teaIn" },
    out: { label: "Check Out", Icon: LogOut, tone: "red", timeField: "finalOut" },
};

const TONE_STYLES = {
    emerald: { background: "var(--ck-wash)", borderColor: "var(--ck-line-strong)" },
    amber: { background: "var(--ck-warn-wash)", borderColor: "var(--ck-line-strong)" },
    orange: { background: "var(--ck-warn-wash)", borderColor: "var(--ck-line-strong)" },
    red: { background: "var(--ck-danger-wash)", borderColor: "var(--ck-line-strong)" },
    gray: { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)" },
};

const TONE_ICON = {
    emerald: "var(--ck-accent)", amber: "var(--ck-warn)", orange: "var(--ck-warn)", red: "var(--ck-danger)", gray: "var(--ck-ink-3)",
};

// ── Record Detail Drawer ──────────────────────────────────────────────────────
function RecordDrawer({ record, onClose }) {
    if (!record) return null;

    const status = record.effectiveStatus || record.hrFinalStatus || record.systemPrediction || "AB";
    const isExec = record.employeeType === "executive";

    // Slot layout: executives get 2 (in/out), operators get 6 (full set)
    const slotKeys = isExec
        ? ["in", "out"]
        : ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"];

    const expectedPunches = isExec ? 2 : 6;
    const actualPunches = record.punchCount || 0;
    const punchShortfall = expectedPunches - actualPunches;

    // Get time for a slot — first try the named field, then scan rawPunches
    const getSlotTime = (slotKey) => {
        const meta = SLOT_META[slotKey];
        // Direct field (inTime, finalOut, etc.)
        const direct = record[meta.timeField];
        if (direct) return { time: direct, source: null };
        // Scan rawPunches array
        const punch = (record.rawPunches || []).find(p => p.punchType === slotKey);
        if (punch?.time) return { time: punch.time, source: punch.source };
        return null;
    };

    // Get source label for a slot
    const getSource = (slotKey) => {
        const punch = (record.rawPunches || []).find(p => p.punchType === slotKey);
        return punch?.source || null;
    };

    return (
        <>
            <div className="fixed inset-0 z-50" style={{background:"rgba(2,5,10,.7)",backdropFilter:"blur(6px)"}} onClick={onClose} />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] flex flex-col overflow-hidden animate-slide-in" style={{background:"var(--ck-solid)",borderLeft:"1px solid var(--ck-line)",boxShadow:"var(--ck-shadow)"}}>

                {/* Header */}
                <div className="flex items-start gap-4 px-6 py-5 flex-shrink-0" style={{background:"var(--ck-panel-2)",borderBottom:"1px solid var(--ck-line)"}}>
                    <EmpAvatar name={record.employeeName || "?"} size="lg" />
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold" style={{letterSpacing:".04em"}}>{record.employeeName || "—"}</h2>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs" style={{color:"var(--ck-ink-3)"}}>
                            <span className="ck-mono">{record.identityId || record.biometricId}</span>
                            <span>·</span>
                            <span>{record.designation || "—"}</span>
                            <span>·</span>
                            <span>{record.department || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <StatusChip status={status} overwritten={record.isOverwritten} />
                            <span className="ck-chip" style={isExec ? {color:"var(--ck-purple)"} : undefined}>
                                {isExec ? "Executive" : "Operator"} · {expectedPunches} punches
                            </span>
                            {record.isGhost && <span className="ck-chip is-warn">GHOST</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="ck-icon-btn flex-shrink-0"><X className="w-4 h-4" /></button>
                </div>

                {/* HR override notice */}
                {record.isOverwritten && (
                    <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0" style={{background:"var(--ck-warn-wash)",borderBottom:"1px solid var(--ck-line)"}}>
                        <Info className="w-3.5 h-3.5 flex-shrink-0" style={{color:"var(--ck-warn)"}} />
                        <p className="text-[11px] font-medium" style={{color:"var(--ck-warn)"}}>
                            HR edited: device showed <span className="font-bold">{S[record.systemPrediction]?.label || record.systemPrediction}</span>
                            {" → "}
                            <span className="font-bold">{S[status]?.label || status}</span>
                            {record.hrRemarks ? <span style={{opacity:.8}}> · "{record.hrRemarks}"</span> : ""}
                        </p>
                    </div>
                )}

                {/* Missing punch warning */}
                {punchShortfall > 0 && !["AB", "WO", "PH", "FH", "NH", "OH", "RH", "L-CL", "L-SL", "L-EL", "LWP", "WFH", "CO"].includes(status) && (
                    <div className="flex items-start gap-2 px-5 py-2.5 flex-shrink-0" style={{background:"var(--ck-warn-wash)",borderBottom:"1px solid var(--ck-line)"}}>
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{color:"var(--ck-warn)"}} />
                        <p className="text-[11px] font-medium" style={{color:"var(--ck-warn)"}}>
                            {punchShortfall} missing punch{punchShortfall > 1 ? "es" : ""} detected.
                            {record.missingPunchType && <span> System detected missing: <strong className="capitalize">{record.missingPunchType.replace(/_/g, " ")}</strong>.</span>}
                            {" "}Working hours may be inaccurate.
                        </p>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* Shift info bar */}
                    <div className="flex items-center justify-between px-5 py-3" style={{background:"var(--ck-panel-2)",borderBottom:"1px solid var(--ck-line)"}}>
                        <div className="flex items-center gap-2 text-xs" style={{color:"var(--ck-ink-2)"}}>
                            <Clock className="w-3.5 h-3.5" style={{color:"var(--ck-ink-3)"}} />
                            <span>Shift: <strong className="ck-mono">{record.shiftStart || "09:30"} – {record.shiftEnd || "18:30"}</strong></span>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-wrap" style={{color:"var(--ck-ink-2)"}}>
                            <span>Punches: <strong className="ck-mono" style={{color:punchShortfall > 0 ? "var(--ck-warn)" : "var(--ck-accent)"}}>{actualPunches}/{expectedPunches}</strong></span>
                            {record.isLate && <span className="font-semibold ck-mono" style={{color:"var(--ck-warn)"}}>Late {record.lateDisplay || minsToHM(record.lateMins)}</span>}
                            {record.isEarlyDeparture && <span className="font-semibold ck-mono" style={{color:"var(--ck-warn)"}}>Early -{minsToHM(record.earlyDepartureMins)}</span>}
                            {record.otMins > 0 && <span className="font-semibold ck-mono" style={{color:"var(--ck-purple)"}}>OT {minsToHM(record.otMins)}</span>}
                            {(record.appliedExtraGraceMins || 0) > 0 && <span className="ck-mono" style={{color:"var(--ck-accent-2)"}}>+{record.appliedExtraGraceMins}m grace</span>}
                        </div>
                    </div>

                    <div className="px-5 py-4 space-y-5">
                        {/* ── PUNCH TIMELINE ─────────────────────────────────────────── */}
                        <div>
                            <h4 className="ck-label mb-3">
                                Punch Timeline — {isExec ? "Executive (In / Out)" : "Operator (6-punch cycle)"}
                            </h4>
                            <div className={`grid gap-2 ${isExec ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
                                {slotKeys.map(slotKey => {
                                    const meta = SLOT_META[slotKey];
                                    const Icon = meta.Icon;
                                    const slotData = getSlotTime(slotKey);
                                    const has = !!slotData;
                                    const source = has ? (slotData.source || getSource(slotKey)) : null;

                                    return (
                                        <div key={slotKey}
                                            className={`rounded-xl border p-3 transition-colors ${has ? "" : "border-dashed"}`}
                                            style={has ? TONE_STYLES[meta.tone] : {background:"var(--ck-panel-2)",borderColor:"var(--ck-line)"}}>
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Icon size={12} style={{color: has ? TONE_ICON[meta.tone] : "var(--ck-ink-3)"}} />
                                                <span className="text-[9px] font-bold uppercase tracking-wide" style={has ? undefined : {color:"var(--ck-ink-3)"}}>
                                                    {meta.label}
                                                </span>
                                            </div>
                                            {has ? (
                                                <div>
                                                    <p className="text-sm font-bold ck-mono">{fmtTime(slotData.time)}</p>
                                                    {source && (
                                                        <span className="text-[9px] font-semibold px-1 py-0.5 rounded mt-1 inline-block" style={source === "manual" ? {background:"var(--ck-warn-wash)",color:"var(--ck-warn)"} : {background:"var(--ck-panel-2)",color:"var(--ck-ink-3)"}}>
                                                            {source}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs italic font-medium" style={{color:"var(--ck-ink-3)"}}>Missing</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── WORK SUMMARY ───────────────────────────────────────────── */}
                        <div>
                            <h4 className="ck-label mb-3">Work Summary</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { l: "Net Work", v: minsToHM(record.netWorkMins), c: record.netWorkMins > 0 ? { background: "var(--ck-wash)", borderColor: "var(--ck-line-strong)", color: "var(--ck-accent)" } : { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)", color: "var(--ck-ink-3)" } },
                                    { l: "Total Span", v: minsToHM(record.totalSpanMins), c: { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)" } },
                                    { l: "Break", v: minsToHM(record.totalBreakMins), c: { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)" } },
                                    { l: "OT", v: record.otMins > 0 ? minsToHM(record.otMins) : "—", c: record.otMins > 0 ? { background: "rgba(168,85,247,.16)", borderColor: "var(--ck-line-strong)", color: "var(--ck-purple)" } : { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)", color: "var(--ck-ink-3)" } },
                                    { l: "Late", v: record.isLate ? (record.lateDisplay || minsToHM(record.lateMins)) : "No", c: record.isLate ? { background: "var(--ck-warn-wash)", borderColor: "var(--ck-line-strong)", color: "var(--ck-warn)" } : { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)", color: "var(--ck-ink-3)" } },
                                    { l: "Early Dep.", v: record.isEarlyDeparture ? minsToHM(record.earlyDepartureMins) : "No", c: record.isEarlyDeparture ? { background: "var(--ck-warn-wash)", borderColor: "var(--ck-line-strong)", color: "var(--ck-warn)" } : { background: "var(--ck-panel-2)", borderColor: "var(--ck-line)", color: "var(--ck-ink-3)" } },
                                ].map(({ l, v, c }) => (
                                    <div key={l} className="rounded-lg border p-2.5" style={c}>
                                        <p className="text-[10px] font-semibold opacity-60 uppercase tracking-wide">{l}</p>
                                        <p className="text-sm font-bold ck-mono mt-0.5">{v || "—"}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── ALL RAW PUNCHES (as logged by device) ──────────────────── */}
                        {(record.rawPunches || []).length > 0 && (
                            <div>
                                <h4 className="ck-label mb-3">
                                    Raw Device Log ({record.rawPunches.length} punch{record.rawPunches.length !== 1 ? "es" : ""})
                                </h4>
                                <div className="space-y-1.5">
                                    {record.rawPunches.map((p, i) => {
                                        const sm2 = SLOT_META[p.punchType];
                                        const Icon2 = sm2?.Icon || Clock;
                                        return (
                                            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{background:"var(--ck-panel-2)",borderColor:"var(--ck-line)"}}>
                                                <div className="flex items-center gap-2.5">
                                                    <Icon2 size={13} style={{color: sm2 ? TONE_ICON[sm2.tone] : "var(--ck-ink-3)"}} />
                                                    <span className="ck-mono text-sm font-bold">{fmtTime(p.time) || "—"}</span>
                                                </div>
                                                <span className="text-[11px] capitalize" style={{color:"var(--ck-ink-3)"}}>{(p.punchType || "unknown").replace(/_/g, " ")}</span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={p.source === "manual" ? {background:"var(--ck-warn-wash)",color:"var(--ck-warn)"} : {background:"var(--ck-panel-2)",color:"var(--ck-ink-3)"}}>
                                                    {p.source || "device"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── HR REMARKS ─────────────────────────────────────────────── */}
                        {record.hrRemarks && (
                            <div className="rounded-xl p-3.5" style={{background:"var(--ck-warn-wash)",border:"1px solid var(--ck-line-strong)"}}>
                                <p className="ck-label mb-1" style={{color:"var(--ck-warn)"}}>HR Remarks</p>
                                <p className="text-xs leading-relaxed" style={{color:"var(--ck-warn)"}}>{record.hrRemarks}</p>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-3" style={{borderTop:"1px solid var(--ck-line)",background:"var(--ck-panel-2)"}}>
                    <p className="text-[11px] text-center" style={{color:"var(--ck-ink-3)"}}>Read only · Status & punches computed by HR sync · Edit via HR portal</p>
                </div>
            </div>

            <style jsx>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-in { animation: slideIn 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
      `}</style>
        </>
    );
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ summary, total }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {[
                { k: "presentCount", l: "Present", c: "is-ok" },
                { k: "AB", l: "Absent", c: "is-danger" },
                { k: "P*", l: "Late", c: "is-warn" },
                { k: "HD", l: "Half Day", c: "is-warn" },
                { k: "MP", l: "Miss Punch", c: "is-danger" },
                { k: "WO", l: "Week Off", c: "" },
            ].map(({ k, l, c }) => (
                <div key={k} className={`ck-chip gap-1 ${c}`}>
                    {l}: <span className="ck-mono">{summary?.[k] || 0}</span>
                </div>
            ))}
            {total > 0 && <div className="ck-chip gap-1">Total: <span className="ck-mono">{total}</span></div>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DAILY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DailyView({ departments }) {
    const today = todayStr();
    const [date, setDate] = useState(today);
    const [records, setRecords] = useState([]);
    const [summary, setSummary] = useState({});
    const [holiday, setHoliday] = useState(null);
    const [meta, setMeta] = useState({ synced: false, syncedAt: null, hrFinalised: false });
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [banner, setBanner] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [deptFilter, setDeptFilter] = useState("all");
    const [drawer, setDrawer] = useState(null);

    const STATUS_GROUPS = {
        present: ["P", "P*", "P~"], late: ["P*"], absent: ["AB"], halfday: ["HD"],
        misspunch: ["MP"], weekoff: ["WO", "FH", "NH", "OH", "RH", "PH"],
        leave: ["L-CL", "L-SL", "L-EL", "LWP", "CO", "WFH"],
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ date, ...(deptFilter !== "all" && { department: deptFilter }) });
            const res = await fetch(`${API}/api/ceo/hr/attendance/daily?${qs}`, { credentials: "include" });
            const d = await res.json();
            if (d.success) {
                setRecords(d.data || []);
                setSummary(d.summary || {});
                setHoliday(d.holiday || null);
                setMeta({ synced: d.synced, syncedAt: d.syncedAt, hrFinalised: d.hrFinalised });
            }
        } catch { }
        setLoading(false);
    }, [date, deptFilter]);

    useEffect(() => { load(); setBanner(null); }, [load]);

    const handleSync = async () => {
        setSyncing(true); setBanner(null);
        try {
            const res = await fetch(`${API}/api/ceo/hr/attendance/sync`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date }),
            });
            const d = await res.json();
            setBanner(d.success ? { ok: true, msg: d.message || "Sync completed" } : { ok: false, msg: d.message || "Sync failed" });
            if (d.success) await load();
        } catch (e) { setBanner({ ok: false, msg: "Network error: " + e.message }); }
        setSyncing(false);
    };

    const changeDate = (delta) => {
        const d = new Date(date + "T00:00:00");
        d.setDate(d.getDate() + delta);
        setDate(d.toISOString().split("T")[0]);
    };

    const filtered = useMemo(() => {
        let list = records;
        if (search) { const q = search.toLowerCase(); list = list.filter(r => (r.employeeName || "").toLowerCase().includes(q) || (r.biometricId || "").toLowerCase().includes(q) || (r.department || "").toLowerCase().includes(q)); }
        if (statusFilter !== "all") { const allowed = STATUS_GROUPS[statusFilter] || [statusFilter]; list = list.filter(r => allowed.includes(r.effectiveStatus || r.systemPrediction || "AB")); }
        if (typeFilter !== "all") list = list.filter(r => r.employeeType === typeFilter);
        return list.sort((a, b) => (a.employeeName || "").localeCompare(b.employeeName || ""));
    }, [records, search, statusFilter, typeFilter]);

    return (
        <div className="flex flex-col h-full space-y-3 overflow-hidden">
            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                <div className="flex items-center rounded-lg overflow-hidden" style={{border:"1px solid var(--ck-line)",background:"var(--ck-panel)"}}>
                    <button onClick={() => changeDate(-1)} className="p-2" style={{color:"var(--ck-ink-3)",borderRight:"1px solid var(--ck-line)"}}><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
                        className="text-xs bg-transparent font-semibold ck-mono focus:outline-none px-2.5 py-2" style={{color:"var(--ck-ink)"}} />
                    <button onClick={() => changeDate(1)} disabled={date >= today} className="p-2 disabled:opacity-30" style={{color:"var(--ck-ink-3)",borderLeft:"1px solid var(--ck-line)"}}><ChevronRight className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDate(today)} className="text-[11px] font-bold px-3 py-2" style={{color:"var(--ck-accent)",borderLeft:"1px solid var(--ck-line)"}}>Today</button>
                </div>
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    className="ck-select px-2.5 py-2 text-xs">
                    <option value="all">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="ml-auto">
                    <button onClick={handleSync} disabled={syncing}
                        className="ck-btn is-primary flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 disabled:opacity-50">
                        <RefreshCcw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                        {syncing ? "Syncing…" : "Re-sync"}
                    </button>
                </div>
            </div>

            {banner && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 border" style={banner.ok ? {background:"var(--ck-wash)",color:"var(--ck-accent)",borderColor:"var(--ck-line-strong)"} : {background:"var(--ck-danger-wash)",color:"var(--ck-danger)",borderColor:"var(--ck-danger)"}}>
                    {banner.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="flex-1">{banner.msg}</span>
                    <button onClick={() => setBanner(null)}><X className="w-3 h-3" /></button>
                </div>
            )}

            {/* Day info */}
            <div className="ck-panel px-4 py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 flex-shrink-0">
                <div>
                    <p className="text-sm font-bold">
                        {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {holiday && <span className="ck-chip is-info">🎉 {holiday.name}</span>}
                        {meta.hrFinalised && <span className="ck-chip is-ok">✓ HR Finalised</span>}
                        {!meta.synced && !loading && <span className="ck-chip is-warn">⚠ Not synced</span>}
                        {meta.syncedAt && <span className="text-[11px] ck-mono" style={{color:"var(--ck-ink-3)"}}>Synced {new Date(meta.syncedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                </div>
                <SummaryBar summary={summary} total={records.length} />
            </div>

            {/* Table */}
            <div className="ck-panel flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap flex-shrink-0" style={{borderBottom:"1px solid var(--ck-line)"}}>
                    <div className="relative max-w-xs flex-1 min-w-[140px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10" style={{color:"var(--ck-ink-3)"}} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, biometric ID, dept…"
                            className="ck-input w-full pl-8 pr-3 py-1.5 text-xs" />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="ck-select px-2.5 py-1.5 text-xs">
                        <option value="all">All Status</option>
                        <option value="present">Present</option><option value="late">Late</option>
                        <option value="absent">Absent</option><option value="halfday">Half Day</option>
                        <option value="misspunch">Miss Punch</option><option value="weekoff">Week Off / Holiday</option>
                        <option value="leave">On Leave</option>
                    </select>
                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                        className="ck-select px-2.5 py-1.5 text-xs">
                        <option value="all">All Types</option>
                        <option value="operator">Operator (6 punches)</option>
                        <option value="executive">Executive (2 punches)</option>
                    </select>
                    <span className="text-[11px] ml-auto" style={{color:"var(--ck-ink-3)"}}><span className="ck-mono">{filtered.length}</span> records</span>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="ck-table w-full text-xs">
                        <thead className="sticky top-0 z-10" style={{background:"var(--ck-solid)"}}>
                            <tr>
                                {["Employee", "Type", "Status", "In", "Out", "Net Work", "OT", "Late", "Punches"].map(h => (
                                    <th key={h} className="px-3 py-2.5 text-left whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [...Array(10)].map((_, i) => <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-6 rounded animate-pulse" style={{background:"var(--ck-panel-2)"}} /></td></tr>)
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="px-3 py-12 text-center">
                                    {records.length === 0
                                        ? <div className="flex flex-col items-center gap-2"><RefreshCcw className="w-7 h-7" style={{color:"var(--ck-ink-3)",opacity:.4}} /><p className="text-xs" style={{color:"var(--ck-ink-3)"}}>No data — click Re-sync to fetch from device</p></div>
                                        : <p className="text-xs" style={{color:"var(--ck-ink-3)"}}>No records match the active filters</p>}
                                </td></tr>
                            ) : filtered.map(r => {
                                const status = r.effectiveStatus || "AB";
                                const isExec = r.employeeType === "executive";
                                const expected = isExec ? 2 : 6;
                                const punches = r.punchCount || 0;
                                const punchOk = punches >= expected;
                                return (
                                    <tr key={r.biometricId} onClick={() => setDrawer(r)}
                                        className="cursor-pointer transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <EmpAvatar name={r.employeeName || "?"} size="sm" />
                                                <div>
                                                    <p className="font-semibold leading-tight">
                                                        {r.employeeName || "—"}
                                                        {r.isGhost && <span className="ml-1 text-[8px] px-0.5 rounded font-bold" style={{background:"var(--ck-warn-wash)",color:"var(--ck-warn)"}}>GHOST</span>}
                                                    </p>
                                                    <p className="text-[10px] ck-mono" style={{color:"var(--ck-ink-3)"}}>{r.identityId || r.biometricId} · {r.department}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="ck-chip" style={isExec ? {color:"var(--ck-purple)"} : {color:"var(--ck-accent-2)"}}>
                                                {isExec ? "EXE" : "OPR"}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5"><StatusChip status={status} overwritten={r.isOverwritten} /></td>
                                        <td className="px-3 py-2.5 ck-mono whitespace-nowrap">
                                            {fmtTime(r.inTime) || <span style={{color:"var(--ck-ink-3)"}}>—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 ck-mono whitespace-nowrap">
                                            {fmtTime(r.finalOut) || <span style={{color:"var(--ck-ink-3)"}}>—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold ck-mono">{minsToHM(r.netWorkMins)}</td>
                                        <td className="px-3 py-2.5 font-semibold ck-mono" style={{color:"var(--ck-purple)"}}>{r.otMins > 0 ? minsToHM(r.otMins) : <span style={{color:"var(--ck-ink-3)"}}>—</span>}</td>
                                        <td className="px-3 py-2.5">
                                            {r.isLate ? <span className="font-bold ck-mono" style={{color:"var(--ck-warn)"}}>{r.lateMins}m</span> : <span style={{color:"var(--ck-ink-3)"}}>—</span>}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="font-semibold ck-mono" style={{color: punchOk ? "var(--ck-accent)" : "var(--ck-warn)"}}>
                                                {punches}/{expected}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {drawer && <RecordDrawer record={drawer} onClose={() => setDrawer(null)} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MONTHLY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function MonthlyView({ departments }) {
    const [yearMonth, setYearMonth] = useState(ymNow());
    const [deptFilter, setDeptFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({ yearMonth, ...(deptFilter !== "all" && { department: deptFilter }) });
            const res = await fetch(`${API}/api/ceo/hr/attendance/muster-roll?${qs}`, { credentials: "include" });
            const d = await res.json();
            if (d.success) setData(d);
        } catch { }
        setLoading(false);
    }, [yearMonth, deptFilter]);

    useEffect(() => { load(); }, [load]);

    const monthNav = (delta) => {
        const [y, m] = yearMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const qs = new URLSearchParams({ yearMonth, ...(deptFilter !== "all" && { department: deptFilter }) });
            const res = await fetch(`${API}/api/ceo/hr/attendance/export?${qs}`, { credentials: "include" });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `attendance_${yearMonth}${deptFilter !== "all" ? `_${deptFilter}` : ""}.xlsx`;
            a.click(); URL.revokeObjectURL(a.href);
        } catch (e) { alert("Export failed: " + e.message); }
        setExporting(false);
    };

    const filteredEmps = useMemo(() => {
        if (!data?.employees) return [];
        if (!search) return data.employees;
        const q = search.toLowerCase();
        return data.employees.filter(e =>
            (e.employeeName || "").toLowerCase().includes(q) ||
            (e.biometricId || "").toLowerCase().includes(q) ||
            (e.department || "").toLowerCase().includes(q)
        );
    }, [data, search]);

    const days = data?.days || [];

    return (
        <div className="flex flex-col h-full space-y-3 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                <div className="flex items-center rounded-lg overflow-hidden" style={{border:"1px solid var(--ck-line)",background:"var(--ck-panel)"}}>
                    <button onClick={() => monthNav(-1)} className="p-2" style={{color:"var(--ck-ink-3)",borderRight:"1px solid var(--ck-line)"}}><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)}
                        className="text-xs bg-transparent font-semibold ck-mono focus:outline-none px-2.5 py-2" style={{color:"var(--ck-ink)"}} />
                    <button onClick={() => monthNav(1)} className="p-2" style={{color:"var(--ck-ink-3)",borderLeft:"1px solid var(--ck-line)"}}><ChevronRight className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setYearMonth(ymNow())} className="text-[11px] font-bold px-3 py-2" style={{color:"var(--ck-accent)",borderLeft:"1px solid var(--ck-line)"}}>This Month</button>
                </div>
                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                    className="ck-select px-2.5 py-2 text-xs">
                    <option value="all">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="relative max-w-xs flex-1 min-w-[140px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10" style={{color:"var(--ck-ink-3)"}} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
                        className="ck-input w-full pl-8 pr-3 py-2 text-xs" />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <button onClick={load} disabled={loading}
                        className="ck-btn flex items-center gap-1.5 text-xs font-semibold px-3 py-2 disabled:opacity-50">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
                    </button>
                    <button onClick={handleExport} disabled={exporting || !data}
                        className="ck-btn is-primary flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 disabled:opacity-50">
                        {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {exporting ? "Exporting…" : "Export Excel"}
                    </button>
                </div>
            </div>

            {data?.grand && (
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2 flex-shrink-0">
                    {[
                        { l: "Employees", v: data.grand.totalEmployees, c: "var(--ck-ink)" },
                        { l: "Synced Days", v: `${data.syncedDays}/${data.grand.workingDays}`, c: "var(--ck-accent-2)" },
                        { l: "Total Present", v: data.grand.totalPresent, c: "var(--ck-accent)" },
                        { l: "Total Absent", v: data.grand.totalAbsent, c: "var(--ck-danger)" },
                        { l: "Total Late", v: data.grand.totalLate, c: "var(--ck-warn)" },
                        { l: "Half Day", v: data.grand.totalHD, c: "var(--ck-warn)" },
                        { l: "On Leave", v: data.grand.totalLeaves, c: "var(--ck-accent-2)" },
                    ].map(k => (
                        <div key={k.l} className="ck-panel px-3 py-2 text-center">
                            <p className="text-sm font-bold ck-mono" style={{color:k.c}}>{k.v}</p>
                            <p className="ck-label mt-0.5">{k.l}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="ck-panel flex-1 overflow-hidden">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2"><RefreshCw className="w-6 h-6 animate-spin" style={{color:"var(--ck-ink-3)"}} /><p className="text-xs" style={{color:"var(--ck-ink-3)"}}>Loading muster roll…</p></div>
                    </div>
                ) : !filteredEmps.length ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-xs" style={{color:"var(--ck-ink-3)"}}>No data for this period</p>
                    </div>
                ) : (
                    <div className="overflow-auto h-full">
                        <table className="text-[10px] border-collapse min-w-full">
                            <thead className="sticky top-0 z-20">
                                <tr style={{background:"var(--ck-solid)",color:"var(--ck-ink)"}}>
                                    <th className="sticky left-0 z-30 text-left px-3 py-2 min-w-[190px] border-r" style={{background:"var(--ck-solid)",borderColor:"var(--ck-line)"}}>EMPLOYEE</th>
                                    <th className="sticky left-[190px] z-30 text-left px-2 py-2 min-w-[90px] border-r" style={{background:"var(--ck-solid)",borderColor:"var(--ck-line)"}}>DEPT</th>
                                    {days.map(day => (
                                        <th key={day.dateStr}
                                            style={{ minWidth: 30, width: 30, borderColor: "var(--ck-line)", background: day.holiday ? "rgba(168,85,247,.25)" : day.dayOfWeek === 0 ? "var(--ck-panel-2)" : undefined }}
                                            className="text-center border-r py-1">
                                            <div className="text-[9px] font-bold ck-mono">{day.dateStr.slice(-2)}</div>
                                            <div className="text-[8px] opacity-50">{["S", "M", "T", "W", "T", "F", "S"][day.dayOfWeek]}</div>
                                        </th>
                                    ))}
                                    {["P", "Lat", "HD", "AB", "WO", "Lv"].map(h => (
                                        <th key={h} className="text-center px-1 py-2 border-l min-w-[28px] text-[9px] font-bold" style={{borderColor:"var(--ck-line)"}}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmps.map((emp, idx) => (
                                    <tr key={emp.biometricId} className="transition-colors" style={{background:"var(--ck-solid)"}}>
                                        <td className="sticky left-0 bg-inherit z-10 px-3 py-1.5 border-r border-b min-w-[190px]" style={{borderColor:"var(--ck-line)"}}>
                                            <div className="flex items-center gap-2">
                                                <EmpAvatar name={emp.employeeName || "?"} size="sm" />
                                                <div className="min-w-0">
                                                    <p className="font-semibold truncate max-w-[140px] leading-tight">{emp.employeeName}</p>
                                                    <p className="text-[9px] ck-mono" style={{color:"var(--ck-ink-3)"}}>{emp.identityId || emp.biometricId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="sticky left-[190px] bg-inherit z-10 px-2 py-1.5 border-r border-b min-w-[90px]" style={{borderColor:"var(--ck-line)"}}>
                                            <p className="text-[10px] truncate max-w-[85px]" style={{color:"var(--ck-ink-3)"}}>{emp.department}</p>
                                        </td>
                                        {days.map(day => {
                                            const cell = emp.days[day.dateStr];
                                            const status = cell?.status || (day.holiday ? "FH" : day.dayOfWeek === 0 ? "WO" : "AB");
                                            const cfg = S[status] || { cell: "var(--ck-panel-2)", cellFg: "var(--ck-ink-3)" };
                                            return (
                                                <td key={day.dateStr} style={{ minWidth: 30, width: 30, background: cfg.cell, color: cfg.cellFg, borderColor: "var(--ck-line)" }}
                                                    className="text-center border-r border-b py-1.5 select-none relative"
                                                    title={`${emp.employeeName} · ${day.dateStr} · ${S[status]?.label || status}`}>
                                                    <span className="text-[9px] font-bold ck-mono">{status}</span>
                                                    {cell?.isOverwritten && <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-400 rounded-bl-sm" title="HR edited" />}
                                                </td>
                                            );
                                        })}
                                        {[
                                            [emp.totals.P, "var(--ck-accent)"],
                                            [emp.totals["P*"], "var(--ck-warn)"],
                                            [emp.totals.HD, "var(--ck-warn)"],
                                            [emp.totals.AB, "var(--ck-danger)"],
                                            [emp.totals.WO, "var(--ck-ink-3)"],
                                            [emp.totals.leaves, "var(--ck-accent-2)"],
                                        ].map(([v, clr], i) => (
                                            <td key={i} className="text-center px-1 py-1.5 border-l border-b text-[10px] font-bold ck-mono" style={{borderColor:"var(--ck-line)",color:clr}}>
                                                {v || <span style={{color:"var(--ck-ink-3)",opacity:.4}}>—</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function CEOAttendancePage() {
    const [view, setView] = useState("daily");
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        fetch(`${API}/api/ceo/hr/attendance/departments`, { credentials: "include" })
            .then(r => r.json()).then(d => { if (d.success) setDepartments(d.data || []); }).catch(() => { });
    }, []);

    return (
        <CEO_DashboardLayout activeMenu="employees">
            <div className="h-full flex flex-col overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between flex-shrink-0" style={{borderBottom:"1px solid var(--ck-line)"}}>
                    <div>
                        <h1 className="text-sm font-bold" style={{letterSpacing:".04em"}}>Attendance</h1>
                        <p className="ck-label mt-0.5">Live from MongoDB · Operators 6 punches · Executives 2 punches · Click row for details</p>
                    </div>
                    <div className="ck-tabs">
                        <button onClick={() => setView("daily")}
                            className={`ck-tab flex items-center gap-1.5 ${view === "daily" ? "is-on" : ""}`}>
                            <List className="w-3.5 h-3.5" />Daily
                        </button>
                        <button onClick={() => setView("monthly")}
                            className={`ck-tab flex items-center gap-1.5 ${view === "monthly" ? "is-on" : ""}`}>
                            <BarChart3 className="w-3.5 h-3.5" />Monthly
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden p-4">
                    {view === "daily" ? <DailyView departments={departments} /> : <MonthlyView departments={departments} />}
                </div>
            </div>
        </CEO_DashboardLayout>
    );
}