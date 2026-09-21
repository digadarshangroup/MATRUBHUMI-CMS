"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  HR — Regularization requests
//
//  This page was built against four fields that never existed on
//  RegularizationRequest: `requestType`, `proposedStatus`, and a pair of
//  `proposedInTime` / `proposedOutTime` that mongoose strict mode dropped on
//  every write. The consequences were all silent:
//
//    • TYPE_META[request.requestType] was ALWAYS undefined, so every row
//      rendered as the "Other" chip.
//    • The whole "what will be applied" summary rendered blank, so HR was
//      approving requests without ever seeing what they would do.
//    • ?requestType= on the list endpoint matched zero rows.
//
//  The real discriminator is `type`; the real target status is
//  `requestedStatus`; `proposedInTime` / `proposedOutTime` are now declared on
//  the schema and arrive as Dates.
//
//  The second half of the fix is the one the user actually reported —
//  "approving requests from here but in the HR side not updating the things
//  for the applicable employee". The backend applier now returns
//  { applied, skipped }, and a decision that changed NOTHING on the attendance
//  row is no longer reported to HR as a plain success. See SKIP_REASON and the
//  "approved but never applied" flag on the card.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Search, RefreshCw, X, Check, AlertTriangle,
    Clock, Calendar, FileText, Building2, ChevronRight,
    CheckCircle2, XCircle, Hourglass, Filter, MessageSquare,
    ArrowRight, LogIn, LogOut as LogOutIcon, Edit3, Users,
    UserCheck, UserX, Ban, ExternalLink, Briefcase, MapPin, Info,
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel,
    PageHead,
    Button,
    Chip,
    Field,
    Input,
    Select,
    Textarea,
    EmptyState,
    InlineError,
    SkeletonRows,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/* ── Formatting ─────────────────────────────────────────────────────────────
   proposedInTime / proposedOutTime are Dates materialised in IST by the
   backend (parseTimeOnDateIST). Attendance is read as 24-hour wall clock
   everywhere else in this module, so render HH:mm in Asia/Kolkata — never the
   viewer's local zone, which would shift the number for anyone abroad. */
const fmtHM = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false,
        timeZone: "Asia/Kolkata",
    });
};
const fmtDate = (s) => {
    if (!s) return "—";
    const d = new Date(s + "T00:00:00");
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
};
const fmtDateTime = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
};
const ago = (d) => {
    if (!d) return "—";
    const past = new Date(d).getTime();
    if (isNaN(past)) return "—";
    const diff = Math.floor((Date.now() - past) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};
const mins = (n) => `${Math.floor((n || 0) / 60)}h ${(n || 0) % 60}m`;

/* ── Status ─────────────────────────────────────────────────────────────────
   This is the HR surface, so the labels stay HR-shaped: "HR approved" is
   accurate here and is what HR expects to read. The employee-facing rename
   ("Request approved") lives in the mobile app's StatusTag and deliberately
   does not propagate to this page. */
const STATUS_META = {
    pending: { label: "Pending", tone: "rework", icon: Hourglass, dot: "bg-[var(--state-rework)]" },
    manager_approved: { label: "Manager approved", tone: "risk", icon: UserCheck, dot: "bg-[var(--state-risk)]" },
    manager_rejected: { label: "Manager rejected", tone: "overdue", icon: UserX, dot: "bg-[var(--state-overdue)]" },
    hr_approved: { label: "HR approved", tone: "positive", icon: CheckCircle2, dot: "bg-[var(--state-positive)]" },
    hr_rejected: { label: "HR rejected", tone: "overdue", icon: XCircle, dot: "bg-[var(--state-overdue)]" },
    cancelled: { label: "Cancelled", tone: "neutral", icon: Ban, dot: "bg-ink/40" },
};

/* The actual `type` enum on regularizationRequestSchema. `late_arrival` and
   `early_departure` used to be listed here and were never members of it —
   they could only ever count zero. */
const TYPE_META = {
    miss_punch: { label: "Miss punch", tone: "blocked", icon: AlertTriangle },
    forgot_punch: { label: "Forgot punch", tone: "extension", icon: Clock },
    wrong_status: { label: "Wrong status", tone: "risk", icon: Edit3 },
    client_visit: { label: "Client visit", tone: "neutral", icon: MapPin },
    other: { label: "Other", tone: "neutral", icon: MessageSquare },
};

/* Why an approval may have changed nothing. The backend applier returns these
   verbatim; HR must see the sentence, not the enum. */
const SKIP_REASON = {
    already_applied: "it was already applied to attendance earlier",
    no_attendance_row: "there is no attendance record for that employee on that date",
    rest_day: "that day is a week-off or holiday, which is never overwritten",
    no_biometric_id: "the request carries no biometric ID",
    no_request: "the request could not be read back",
    apply_failed: "writing to the attendance record failed",
};
const skipSentence = (code) => SKIP_REASON[code] || `the applier reported "${code}"`;

/* ── Derivations shared by the card and the drawer ──────────────────────────── */

/** The concrete edits an approval will make to DailyAttendance.employees[i]. */
function plannedChanges(r) {
    const out = [];
    const i = fmtHM(r.proposedInTime);
    const o = fmtHM(r.proposedOutTime);
    if (i) out.push({ key: "in", label: "Set IN time to", value: i, icon: LogIn });
    if (o) out.push({ key: "out", label: "Set OUT time to", value: o, icon: LogOutIcon });
    if (r.requestedStatus) out.push({ key: "status", label: "Set status to", value: r.requestedStatus, icon: Edit3 });
    return out;
}

/**
 * Where the request sits in the primary → secondary manager chain.
 * Read from the frozen managersNotified snapshot plus the decisions recorded
 * against it — the same two arrays the app's approve/reject handlers key off.
 */
function chain(r) {
    const notified = r.managersNotified || [];
    const primary = notified.find((m) => m.type === "primary");
    const secondary = notified.find((m) => m.type === "secondary");
    const decisions = r.managerDecisions || [];
    const rejection = decisions.find((d) => d.decision === "rejected");
    const nameOf = (m, fallback) => m?.managerName || fallback;

    let summary;
    switch (r.status) {
        case "pending":
            summary = primary
                ? `Awaiting ${nameOf(primary, "primary manager")}`
                : "No manager assigned — HR must decide";
            break;
        case "manager_approved":
            summary = `${nameOf(primary, "Primary")} approved · awaiting ${nameOf(secondary, "secondary manager")}`;
            break;
        case "hr_approved":
            summary = `Approved by ${r.finalApprovedByName || r.hrApprovedByName || "HR"}`;
            break;
        case "manager_rejected":
            summary = `Rejected by ${nameOf(rejection, "manager")}`;
            break;
        case "hr_rejected":
            summary = "Rejected by HR";
            break;
        case "cancelled":
            summary = "Cancelled by the employee";
            break;
        default:
            summary = "—";
    }
    return { primary, secondary, decisions, summary };
}

/** The backend gate, mirrored. Anything else 400s with INVALID_TRANSITION. */
const canDecide = (r) => ["pending", "manager_approved"].includes(r?.status);

/** hr_approved with nothing written to the day — the reported bug, made visible. */
const approvedButNotApplied = (r) =>
    r.status === "hr_approved" && !r.appliedToAttendance;

// ─── Page ──────────────────────────────────────────────────────────────────

export default function RegularizationsPage() {
    const [statusFilter, setStatusFilter] = useState("pending");
    const [typeFilter, setTypeFilter] = useState("all");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [data, setData] = useState({ data: [], stats: null });
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [page, setPage] = useState(1);
    const [banner, setBanner] = useState(null);
    const PER_PAGE = 25;

    useEffect(() => {
        fetch(`${API}/hr/attendance/departments`, { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setDepartments(d.data || []))
            .catch(() => { });
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({
                ...(statusFilter !== "all" && { status: statusFilter }),
                // `type`, not `requestType` — the old param matched zero rows.
                ...(typeFilter !== "all" && { type: typeFilter }),
                ...(departmentFilter !== "all" && { department: departmentFilter }),
                page: String(page),
                limit: String(PER_PAGE),
            });
            const r = await fetch(`${API}/hr/attendance/regularizations?${qs}`, { credentials: "include" });
            const d = await r.json();
            if (d.success) setData(d);
            else throw new Error(d.message || "Request failed");
        } catch (e) {
            setBanner({ type: "error", msg: "Load failed: " + e.message });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, departmentFilter, page]);

    useEffect(() => { load(); }, [load]);

    const filteredList = useMemo(() => {
        let list = data.data || [];
        if (search) {
            const q = search.toLowerCase();
            list = list.filter((r) =>
                (r.employeeName || "").toLowerCase().includes(q) ||
                (r.biometricId || "").toLowerCase().includes(q) ||
                (r.department || "").toLowerCase().includes(q) ||
                (r.reason || "").toLowerCase().includes(q) ||
                (r.dateStr || "").includes(q),
            );
        }
        return list;
    }, [data.data, search]);

    // Keep the open drawer bound to the freshly loaded row rather than a stale
    // copy, so the applied/skipped outcome shows up without reopening it.
    const selectedRequest = useMemo(
        () => (data.data || []).find((r) => r._id === selectedId) || null,
        [data.data, selectedId],
    );

    const handleApprove = async (id, remarks = "") => {
        try {
            const res = await fetch(`${API}/hr/attendance/regularizations/${id}/hr-approve`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ remarks }),
            });
            const d = await res.json();
            if (!res.ok || !d.success) throw new Error(d.message || "Approve failed");

            // The approval and the attendance write are separate outcomes. Saying
            // "approved" when the day was untouched is exactly how a correction
            // silently goes missing.
            if (d.applied === false) {
                setBanner({
                    type: "warn",
                    msg: `Approved, but the attendance record was NOT updated — ${skipSentence(d.skipped)}. Fix the day directly under Attendance → Daily.`,
                });
            } else {
                setBanner({ type: "success", msg: "Approved. The employee's attendance record has been updated." });
                setTimeout(() => setBanner(null), 4000);
            }
            setSelectedId(null);
            await load();
        } catch (e) {
            setBanner({ type: "error", msg: "Approve failed: " + e.message });
        }
    };

    const handleReject = async (id, rejectionReason) => {
        try {
            const res = await fetch(`${API}/hr/attendance/regularizations/${id}/hr-reject`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rejectionReason }),
            });
            const d = await res.json();
            if (!res.ok || !d.success) throw new Error(d.message || "Reject failed");
            setBanner({ type: "success", msg: "Request rejected. The employee has been notified." });
            setTimeout(() => setBanner(null), 3500);
            setSelectedId(null);
            await load();
        } catch (e) {
            setBanner({ type: "error", msg: "Reject failed: " + e.message });
        }
    };

    const stats = data.stats || {};

    return (
        // NOTE: `attendance-regularizations` is not a key in Hr_DashboardLayout's
        // NAV, so nothing in the sidebar highlights and nothing links here. The
        // entry point is the "Regularizations" button on Attendance → Overview.
        // Adding the sidebar item is a one-line change to components/Hr_DashboardLayout.js.
        <Hr_DashboardLayout activeMenu="attendance-regularizations">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Regularization requests"
                    sub="Attendance corrections raised in the mobile app. Approving here writes straight onto the employee's day."
                    actions={
                        <Button tone="secondary" onClick={load} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    }
                />

                <div className="space-y-5">
                    {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

                    {/* Status filter cards */}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                        <SummaryCard active={statusFilter === "all"} onClick={() => { setStatusFilter("all"); setPage(1); }}
                            icon={Users} label="All" value={stats.total || 0} tone="gray" />
                        <SummaryCard active={statusFilter === "pending"} onClick={() => { setStatusFilter("pending"); setPage(1); }}
                            icon={Hourglass} label="Pending" value={stats.pending || 0} tone="amber" highlight={!!stats.pending} />
                        <SummaryCard active={statusFilter === "manager_approved"} onClick={() => { setStatusFilter("manager_approved"); setPage(1); }}
                            icon={UserCheck} label="Mgr approved" value={stats.manager_approved || 0} tone="blue" />
                        <SummaryCard active={statusFilter === "manager_rejected"} onClick={() => { setStatusFilter("manager_rejected"); setPage(1); }}
                            icon={UserX} label="Mgr rejected" value={stats.manager_rejected || 0} tone="rose" />
                        <SummaryCard active={statusFilter === "hr_approved"} onClick={() => { setStatusFilter("hr_approved"); setPage(1); }}
                            icon={CheckCircle2} label="HR approved" value={stats.hr_approved || 0} tone="emerald" />
                        <SummaryCard active={statusFilter === "hr_rejected"} onClick={() => { setStatusFilter("hr_rejected"); setPage(1); }}
                            icon={XCircle} label="HR rejected" value={stats.hr_rejected || 0} tone="rose" />
                        <SummaryCard active={statusFilter === "cancelled"} onClick={() => { setStatusFilter("cancelled"); setPage(1); }}
                            icon={Ban} label="Cancelled" value={stats.cancelled || 0} tone="gray" />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col gap-3 lg:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                            <Input type="text" placeholder="Search by name, ID, department, reason, or date…"
                                value={search} onChange={(e) => setSearch(e.target.value)}
                                className="pl-9" />
                        </div>
                        <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                            aria-label="Filter by type" className="lg:w-52">
                            <option value="all">All types</option>
                            {Object.entries(TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                        </Select>
                        <Select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                            aria-label="Filter by department" className="lg:w-52">
                            <option value="all">All departments</option>
                            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                        </Select>
                    </div>

                    {/* Active filter chips */}
                    {(statusFilter !== "pending" || typeFilter !== "all" || departmentFilter !== "all") && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="flex items-center gap-1.5 text-ink-faint"><Filter className="h-3.5 w-3.5" /> Filters:</span>
                            {statusFilter !== "pending" && (
                                <Chip tone="neutral">
                                    Status: {STATUS_META[statusFilter]?.label || statusFilter}
                                    <button type="button" onClick={() => setStatusFilter("pending")} aria-label="Clear status filter"><X className="h-3 w-3" /></button>
                                </Chip>
                            )}
                            {typeFilter !== "all" && (
                                <Chip tone="neutral">
                                    Type: {TYPE_META[typeFilter]?.label || typeFilter}
                                    <button type="button" onClick={() => setTypeFilter("all")} aria-label="Clear type filter"><X className="h-3 w-3" /></button>
                                </Chip>
                            )}
                            {departmentFilter !== "all" && (
                                <Chip tone="neutral">
                                    Dept: {departmentFilter}
                                    <button type="button" onClick={() => setDepartmentFilter("all")} aria-label="Clear department filter"><X className="h-3 w-3" /></button>
                                </Chip>
                            )}
                        </div>
                    )}

                    {/* List */}
                    {loading ? (
                        <Panel label="Loading requests">
                            <SkeletonRows rows={6} />
                        </Panel>
                    ) : filteredList.length === 0 ? (
                        <Panel label="Requests">
                            <EmptyState
                                title={statusFilter === "pending" ? "No pending requests" : "No requests match the filters"}
                                body={statusFilter === "pending" ? "Corrections submitted from the mobile app land here once the manager chain has run." : "Try changing or clearing the filters above"}
                            />
                        </Panel>
                    ) : (
                        <div className="space-y-2">
                            {filteredList.map((req) => (
                                <RequestCard key={req._id} request={req} onClick={() => setSelectedId(req._id)} />
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {data.pages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-ink-muted">
                                Page <strong data-figure className="text-ink">{data.page}</strong> of <strong data-figure className="text-ink">{data.pages}</strong> · <span data-figure>{data.total}</span> total
                            </p>
                            <div className="flex items-center gap-1">
                                <Button tone="secondary" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                                    Previous
                                </Button>
                                <Button tone="secondary" size="sm" onClick={() => setPage(Math.min(data.pages, page + 1))} disabled={page === data.pages}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedRequest && (
                <RequestDrawer
                    request={selectedRequest}
                    onClose={() => setSelectedId(null)}
                    onApprove={handleApprove}
                    onReject={handleReject} />
            )}
        </Hr_DashboardLayout>
    );
}

// ─── Banner ────────────────────────────────────────────────────────────────

function Banner({ banner, onClose }) {
    if (banner.type === "error") return <InlineError message={banner.msg} onRetry={onClose} />;

    const positive = banner.type === "success";
    const Icon = positive ? CheckCircle2 : AlertTriangle;
    const wash = positive
        ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] text-[var(--state-positive-ink)]"
        : "bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] text-[var(--state-rework-ink)]";
    return (
        <div role="status" className={`flex items-start justify-between gap-3 rounded-inset px-3.5 py-2.5 text-sm ${wash}`}>
            <span className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{banner.msg}</span>
            </span>
            <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-60 transition-opacity hover:opacity-100">✕</button>
        </div>
    );
}

// ─── Request card (list item) ──────────────────────────────────────────────

function RequestCard({ request, onClick }) {
    const status = STATUS_META[request.status] || STATUS_META.pending;
    const type = TYPE_META[request.type] || TYPE_META.other;
    const TypeIcon = type.icon;
    const changes = plannedChanges(request);
    const link = chain(request);
    const open = canDecide(request);
    const stranded = approvedButNotApplied(request);

    return (
        <button type="button" onClick={onClick}
            className={`frost-panel w-full rounded-card p-4 text-left transition-colors hover:bg-[var(--frost-bar)] ${stranded ? "shadow-[inset_0_0_0_1px_var(--state-overdue)]" : open ? "shadow-[inset_0_0_0_1px_var(--state-rework)]" : ""}`}>
            <div className="flex items-start gap-3">
                <Avatar name={request.employeeName} />

                <div className="min-w-0 flex-1">
                    {/* Top row: employee + type + status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-medium text-ink">{request.employeeName || "Unknown"}</h3>
                                <span data-figure className="text-[10px] text-ink-faint">{request.biometricId}</span>
                            </div>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                                <Briefcase className="h-3 w-3" />
                                {request.designation || "—"}
                                <span>·</span>
                                <Building2 className="h-3 w-3" />
                                {request.department || "—"}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Chip tone={type.tone}>
                                <TypeIcon className="h-3 w-3" /> {type.label}
                            </Chip>
                            <Chip tone={status.tone}>
                                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                                {status.label}
                            </Chip>
                        </div>
                    </div>

                    {/* Date + the concrete change being asked for */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-inset bg-[var(--control)] px-2 py-0.5 font-medium text-ink">
                            <Calendar className="h-3 w-3 text-ink-faint" />
                            <span data-figure>{fmtDate(request.dateStr)}</span>
                        </span>
                        {changes.length === 0 ? (
                            <span className="text-ink-faint">No attendance change requested</span>
                        ) : (
                            changes.map((c) => (
                                <span key={c.key} className="inline-flex items-center gap-1 font-medium text-ink">
                                    <c.icon className="h-3 w-3 text-ink-faint" />
                                    <span data-figure>{c.value}</span>
                                </span>
                            ))
                        )}
                        {request.documentUrl && (
                            <span className="inline-flex items-center gap-1 font-medium text-[var(--state-risk-ink)]">
                                <FileText className="h-3 w-3" /> Document attached
                            </span>
                        )}
                    </div>

                    {/* Approval chain */}
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                        <UserCheck className="h-3 w-3 shrink-0 text-ink-faint" />
                        {link.summary}
                    </p>

                    {/* Reason preview */}
                    {request.reason && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">
                            <MessageSquare className="mr-1 inline h-3 w-3 text-ink-faint" />
                            {request.reason}
                        </p>
                    )}

                    {/* Footer: submitted + applied state */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-ink-faint">
                            Submitted <span data-figure>{ago(request.createdAt)}</span> · <span data-figure>{fmtDateTime(request.createdAt)}</span>
                        </p>
                        {request.appliedToAttendance ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--state-positive-ink)]">
                                <CheckCircle2 className="h-3 w-3" /> Applied to attendance
                            </span>
                        ) : stranded ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--state-overdue-ink)]">
                                <AlertTriangle className="h-3 w-3" /> Approved but never applied to the day
                            </span>
                        ) : null}
                    </div>
                </div>

                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
            </div>
        </button>
    );
}

// ─── Detail drawer with approve/reject ─────────────────────────────────────

function RequestDrawer({ request, onClose, onApprove, onReject }) {
    const [tab, setTab] = useState("details"); // details | approve | reject
    const [approveRemarks, setApproveRemarks] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [working, setWorking] = useState(false);

    const status = STATUS_META[request.status] || STATUS_META.pending;
    const type = TYPE_META[request.type] || TYPE_META.other;
    const StatusIcon = status.icon;
    const TypeIcon = type.icon;

    const decidable = canDecide(request);
    const link = chain(request);
    const changes = plannedChanges(request);
    const original = request.originalSnapshot || {};

    // Approving while the request still sits at `pending` overrides a manager
    // who has not yet looked at it. That is legitimate — HR is the final
    // authority — but it should never happen by accident.
    const bypassesManager = request.status === "pending" && !!link.primary;

    const doApprove = async () => {
        setWorking(true);
        await onApprove(request._id, approveRemarks);
        setWorking(false);
    };
    const doReject = async () => {
        if (!rejectReason.trim()) return;
        setWorking(true);
        await onReject(request._id, rejectReason);
        setWorking(false);
    };

    return (
        <div className="fixed inset-0 z-[80] flex overflow-hidden bg-black/55" onClick={onClose}>
            <div className="flex-1" />
            <div className="frost-bar animate-slide-in flex min-h-0 w-full max-w-2xl flex-col border-l border-hairline" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-5">
                    <div className="flex min-w-0 items-start gap-4">
                        <Avatar name={request.employeeName} size="lg" />
                        <div className="min-w-0">
                            <h2 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">{request.employeeName || "Unknown"}</h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                                <span data-figure>{request.biometricId}</span>
                                <span>·</span>
                                <span>{request.designation || "—"}</span>
                                <span>·</span>
                                <span>{request.department || "—"}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Chip tone={type.tone}>
                                    <TypeIcon className="h-3 w-3" /> {type.label}
                                </Chip>
                                <Chip tone={status.tone}>
                                    <StatusIcon className="h-3 w-3" /> {status.label}
                                </Chip>
                                {request.appliedToAttendance && (
                                    <Chip tone="positive">
                                        <CheckCircle2 className="h-3 w-3" /> Applied
                                    </Chip>
                                )}
                            </div>
                        </div>
                    </div>
                    <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Tabs — only where a decision is still legal */}
                {decidable && (
                    <div className="shrink-0 border-b border-hairline px-6 py-2">
                        <div className="rail flex items-center gap-1 overflow-x-auto">
                            {[
                                { id: "details", label: "Details", on: "bg-[var(--control)] text-ink" },
                                { id: "approve", label: "Approve", on: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]" },
                                { id: "reject", label: "Reject", on: "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]" },
                            ].map((t) => (
                                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.id ? t.on : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                    {tab === "details" || !decidable ? (
                        <>
                            {/* The stranded-approval warning, first thing */}
                            {approvedButNotApplied(request) && (
                                <div className="flex items-start gap-3 rounded-card bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] p-4">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-overdue-ink)]" />
                                    <div className="text-xs leading-relaxed text-[var(--state-overdue-ink)]">
                                        <p className="text-sm font-medium">Approved, but the attendance record was never changed</p>
                                        <p className="mt-1">
                                            The decision is recorded, yet nothing was written onto{" "}
                                            <strong data-figure>{fmtDate(request.dateStr)}</strong> — usually because no
                                            attendance row exists for that employee on that date, or the day is a week-off
                                            or holiday. Correct the day by hand under <strong>Attendance → Daily</strong>;
                                            re-approving here will not re-run it.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Date */}
                            <div className="flex items-center gap-3 rounded-card bg-[var(--surface-sunken)] p-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-inset bg-[var(--control)]">
                                    <Calendar className="h-5 w-5 text-ink-muted" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Regularization for</p>
                                    <p data-figure className="mt-0.5 text-base font-medium text-ink">{fmtDate(request.dateStr)}</p>
                                </div>
                            </div>

                            {/* Reason */}
                            <Section title="Employee's reason" icon={MessageSquare}>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{request.reason || "—"}</p>
                            </Section>

                            {/* Approval chain */}
                            <Section title="Approval chain" icon={UserCheck}>
                                <ChainTrack request={request} link={link} />
                            </Section>

                            {/* Document */}
                            {request.documentUrl && (
                                <Section title="Supporting document" icon={FileText}>
                                    <a href={request.documentUrl} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-full bg-[var(--control)] px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]">
                                        <FileText className="h-4 w-4" />
                                        {request.documentFileName || "View document"}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {request.documentUploadedAt && (
                                        <p className="mt-1 text-[11px] text-ink-faint">Uploaded <span data-figure>{fmtDateTime(request.documentUploadedAt)}</span></p>
                                    )}
                                </Section>
                            )}

                            {/* Current vs proposed */}
                            <Section title="What changes if approved" icon={ArrowRight}>
                                <div className="scroll-slim overflow-x-auto rounded-inset border border-hairline">
                                    <table className="w-full">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Field</th>
                                                <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Current</th>
                                                <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Proposed</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <ComparisonRow label="In time" icon={LogIn}
                                                current={fmtHM(original.inTime)}
                                                proposed={fmtHM(request.proposedInTime)} />
                                            <ComparisonRow label="Out time" icon={LogOutIcon}
                                                current={fmtHM(original.finalOut)}
                                                proposed={fmtHM(request.proposedOutTime)} />
                                            <ComparisonRow label="Status" icon={Edit3}
                                                current={original.hrFinalStatus || original.systemPrediction || null}
                                                proposed={request.requestedStatus || null} />
                                            <tr>
                                                <td className="px-3 py-2.5 text-xs font-medium text-ink">Punches</td>
                                                <td colSpan={2} className="px-3 py-2.5 text-xs text-ink-muted">
                                                    <span data-figure>{original.punchCount || 0}</span> recorded · net work <span data-figure>{mins(original.netWorkMins)}</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                {changes.length === 0 && (
                                    <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                                        <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
                                        Nothing will change on the attendance record — the request carries no time and no
                                        target status. Approving it only records the decision.
                                    </p>
                                )}
                            </Section>

                            {/* HR decision history */}
                            {(request.hrApprovedAt || request.rejectedAt) && (
                                <Section title="HR decision" icon={StatusIcon}>
                                    <div className={`rounded-inset p-3 ${request.hrApprovedAt ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)]" : "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)]"}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-ink">
                                                {request.hrApprovedAt ? "Approved" : "Rejected"}
                                                {request.hrApprovedByName ? ` by ${request.hrApprovedByName}` : ""}
                                            </span>
                                            <span data-figure className="text-[10px] text-ink-faint">
                                                {fmtDateTime(request.hrApprovedAt || request.rejectedAt)}
                                            </span>
                                        </div>
                                        {request.hrRemarks && <p className="mt-1 text-xs text-ink-muted"><strong className="text-ink">Remarks:</strong> {request.hrRemarks}</p>}
                                        {request.rejectionReason && <p className="mt-1 text-xs text-ink-muted"><strong className="text-ink">Reason:</strong> {request.rejectionReason}</p>}
                                        {request.appliedAt && (
                                            <p className="mt-1 text-[11px] text-ink-faint">Written onto the attendance record <span data-figure>{fmtDateTime(request.appliedAt)}</span></p>
                                        )}
                                    </div>
                                </Section>
                            )}

                            {/* Cancellation */}
                            {request.status === "cancelled" && (
                                <Section title="Cancelled" icon={Ban}>
                                    <div className="rounded-inset bg-[var(--surface-sunken)] p-3">
                                        <p className="text-xs text-ink-faint">Cancelled <span data-figure>{fmtDateTime(request.cancelledAt)}</span></p>
                                        {request.cancelReason && <p className="mt-1 text-sm text-ink-muted">{request.cancelReason}</p>}
                                    </div>
                                </Section>
                            )}

                            {/* Decision shortcut — only where the backend would accept it */}
                            {decidable ? (
                                <RoleGate min="editor">
                                    <div className="flex gap-2 pt-2">
                                        <Button tone="destructive" onClick={() => setTab("reject")} className="flex-1">
                                            <XCircle className="h-4 w-4" /> Reject
                                        </Button>
                                        <Button tone="primary" onClick={() => setTab("approve")} className="flex-1">
                                            <CheckCircle2 className="h-4 w-4" /> Approve
                                        </Button>
                                    </div>
                                </RoleGate>
                            ) : (
                                <p className="flex items-start gap-1.5 rounded-inset bg-[var(--surface-sunken)] px-3 py-2 text-xs text-ink-muted">
                                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
                                    This request is {status.label.toLowerCase()} and can no longer be approved or
                                    rejected. The server refuses any further decision on it.
                                </p>
                            )}
                        </>
                    ) : tab === "approve" ? (
                        <div className="space-y-4">
                            <div className="rounded-card bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[var(--state-positive)]">
                                        <CheckCircle2 className="h-5 w-5 text-slab-ink" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-[var(--state-positive-ink)]">Confirm approval</h3>
                                        <p className="mt-1 text-xs text-[var(--state-positive-ink)]">
                                            This is the final decision. The changes below are written onto{" "}
                                            <strong data-figure>{fmtDate(request.dateStr)}</strong> immediately and the
                                            employee's net work, late and OT minutes are recalculated.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {bypassesManager && (
                                <div className="flex items-start gap-2 rounded-card bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-3 text-xs text-[var(--state-rework-ink)]">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>
                                        <strong>{link.primary?.managerName || "The primary manager"}</strong> has not
                                        decided on this yet. Approving now closes the request without their review.
                                    </span>
                                </div>
                            )}

                            <div className="rounded-inset bg-[var(--surface-sunken)] p-3">
                                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Will apply:</p>
                                {changes.length === 0 ? (
                                    <p className="text-xs text-ink-muted">Nothing will change on the attendance record.</p>
                                ) : (
                                    <ul className="space-y-1 text-xs text-ink-muted">
                                        {changes.map((c) => (
                                            <li key={c.key}>• {c.label} <strong data-figure className="text-ink">{c.value}</strong></li>
                                        ))}
                                        {(request.proposedInTime || request.proposedOutTime) && (
                                            <li>• Recompute net work, late, early-departure and OT minutes</li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            <Field label="HR remarks (optional)">
                                <Textarea value={approveRemarks} onChange={(e) => setApproveRemarks(e.target.value)}
                                    rows={3} placeholder="Add any notes about this approval…" />
                            </Field>

                            <div className="flex gap-2 pt-2">
                                <Button tone="secondary" onClick={() => setTab("details")} disabled={working} className="flex-1">
                                    Cancel
                                </Button>
                                <RoleGate min="editor">
                                    <Button tone="primary" onClick={doApprove} disabled={working} className="flex-1">
                                        {working ? <><RefreshCw className="h-4 w-4 animate-spin" /> Approving…</> : <><Check className="h-4 w-4" /> Confirm approve</>}
                                    </Button>
                                </RoleGate>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-card bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[var(--state-overdue)]">
                                        <XCircle className="h-5 w-5 text-slab-ink" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-[var(--state-overdue-ink)]">Reject request</h3>
                                        <p className="mt-1 text-xs text-[var(--state-overdue-ink)]">
                                            The employee is notified on their phone and sees this reason in the app.
                                            The attendance record is left untouched.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Field label="Rejection reason" required>
                                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                    rows={4} placeholder="Why is this being rejected? e.g. punch already present, day is a week-off, no supporting evidence…" />
                            </Field>

                            <div className="flex gap-2 pt-2">
                                <Button tone="secondary" onClick={() => setTab("details")} disabled={working} className="flex-1">
                                    Cancel
                                </Button>
                                <RoleGate min="editor">
                                    <Button tone="destructive" onClick={doReject} disabled={working || !rejectReason.trim()} className="flex-1">
                                        {working ? <><RefreshCw className="h-4 w-4 animate-spin" /> Rejecting…</> : <><X className="h-4 w-4" /> Confirm reject</>}
                                    </Button>
                                </RoleGate>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-slide-in { animation: slideIn 0.25s ease-out; }
            `}</style>
        </div>
    );
}

// ─── Approval chain track ──────────────────────────────────────────────────
//
// Read-only. The primary → secondary chain is actioned in the mobile app by
// the managers themselves; the CMS has no manager identity to act as, and the
// backend gates each step on membership in the frozen managersNotified list.
// What HR gets here is visibility plus their own final override.

function ChainTrack({ request, link }) {
    const { primary, secondary, decisions } = link;
    const decisionFor = (m) =>
        decisions.find((d) => String(d.managerId) === String(m?.managerId)) ||
        decisions.find((d) => d.type === m?.type);

    const steps = [];
    if (primary) steps.push({ role: "Primary manager", m: primary });
    if (secondary) steps.push({ role: "Secondary manager", m: secondary });

    return (
        <div className="space-y-2">
            <p className="text-sm text-ink">{link.summary}</p>

            {steps.length === 0 ? (
                <p className="rounded-inset bg-[var(--surface-sunken)] px-3 py-2 text-xs text-ink-muted">
                    No manager was recorded on this request, so it can only be decided here.
                </p>
            ) : (
                <ol className="space-y-1.5">
                    {steps.map((s, i) => {
                        const d = decisionFor(s.m);
                        const approved = d?.decision === "approved";
                        const rejected = d?.decision === "rejected";
                        const wash = approved
                            ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)]"
                            : rejected
                                ? "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)]"
                                : "bg-[var(--surface-sunken)]";
                        return (
                            <li key={i} className={`rounded-inset p-3 ${wash}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                        {approved ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--state-positive-ink)]" />
                                            : rejected ? <XCircle className="h-4 w-4 shrink-0 text-[var(--state-overdue-ink)]" />
                                                : <Hourglass className="h-4 w-4 shrink-0 text-ink-faint" />}
                                        <span className="truncate text-sm font-medium text-ink">{s.m.managerName || "Unnamed manager"}</span>
                                        <span className="shrink-0 text-[10px] uppercase tracking-[0.09em] text-ink-faint">{s.role}</span>
                                    </span>
                                    <span data-figure className="shrink-0 text-[10px] text-ink-faint">
                                        {d?.decidedAt ? ago(d.decidedAt) : "no decision yet"}
                                    </span>
                                </div>
                                {d?.remarks && <p className="mt-1 text-xs text-ink-muted">{d.remarks}</p>}
                            </li>
                        );
                    })}
                </ol>
            )}

            {request.status === "hr_approved" && (request.finalApprovedByName || request.hrApprovedByName) && (
                <p className="text-xs text-ink-muted">
                    Finalised by <strong className="text-ink">{request.finalApprovedByName || request.hrApprovedByName}</strong>
                    {request.hrApprovedAt && <> · <span data-figure>{fmtDateTime(request.hrApprovedAt)}</span></>}
                </p>
            )}
        </div>
    );
}

// ─── Comparison row ────────────────────────────────────────────────────────

function ComparisonRow({ label, current, proposed, icon: Icon }) {
    const changed = !!proposed && proposed !== current;
    return (
        <tr className={changed ? "bg-[var(--control)]" : ""}>
            <td className="border-b border-hairline px-3 py-2.5 text-xs font-medium text-ink">
                <span className="flex items-center gap-1.5">
                    {Icon && <Icon className="h-3 w-3 text-ink-faint" />}
                    {label}
                </span>
            </td>
            <td data-figure className="border-b border-hairline px-3 py-2.5 text-xs text-ink-muted">{current || "—"}</td>
            <td className="border-b border-hairline px-3 py-2.5 text-xs">
                {proposed ? (
                    <span data-figure className="inline-flex items-center gap-1 font-medium text-ink">
                        <ArrowRight className="h-3 w-3 opacity-50" /> {proposed}
                    </span>
                ) : (
                    <span className="text-ink-faint">no change</span>
                )}
            </td>
        </tr>
    );
}

// ─── Section wrapper ───────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                {Icon && <Icon className="h-3.5 w-3.5 text-ink-faint" />}
                <h4 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">{title}</h4>
            </div>
            {children}
        </div>
    );
}

// ─── Summary card ──────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, tone, active, onClick, highlight }) {
    const tints = {
        emerald: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
        rose: "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]",
        amber: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
        blue: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
        gray: "bg-[var(--control)] text-ink-faint",
    };
    return (
        <button type="button" onClick={onClick} aria-pressed={!!active}
            className={`frost-panel cursor-pointer rounded-card p-4 text-left transition-colors hover:bg-[var(--frost-bar)] ${active ? "shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : highlight ? "shadow-[inset_0_0_0_1px_var(--state-rework)]" : ""}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">{label}</p>
                    <p data-figure className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink">{value}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-inset ${tints[tone] || tints.gray}`}>
                    <Icon className="h-4 w-4" />
                </div>
            </div>
        </button>
    );
}

// ─── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ name = "", size = "md" }) {
    const initials = (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
    const sizeClass = size === "lg" ? "h-12 w-12 text-sm" : "h-10 w-10 text-xs";
    return <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[var(--control-active)] font-medium text-ink`}>{initials}</div>;
}
