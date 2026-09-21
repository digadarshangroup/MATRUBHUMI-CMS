"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  HR — Document requests (the queue)
//
//  Employees ask for a letter from the app; the ask lands here. There is no
//  push notification to HR and there deliberately never will be: sendExpoPush
//  resolves recipients from the Employee collection, and HR CMS users live in
//  HRDepartment with no row there — a notifyEmployee(hrUserId) call would be
//  dropped silently. THIS PAGE is the mechanism by which HR learns of a
//  request.
//
//  Two cases, and telling them apart in one glance is the entire job of the
//  card:
//
//    (a) readyToRelease   — requested, generated, not released.
//                           HR already has the document. ONE CLICK finishes it.
//    (b) needsGeneration  — requested, nothing generated.
//                           HR has to go make it. The card opens the generate
//                           modal pre-filled with employeeId, type and
//                           requestId, so the file attaches to THIS row rather
//                           than creating a second one.
//
//  Modelled on app/hr/dashboard/attendance/regularizations/page.js — summary
//  strip → filter row → cards → right-hand drawer, with `selectedId` held in
//  state (never the row object) so the drawer re-renders from freshly loaded
//  data after a mutation.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Search, RefreshCw, X, Filter, Inbox, Send, Hourglass, FileSignature,
    ChevronRight, Building2, Briefcase, MessageSquare, CheckCircle2,
    AlertTriangle, EyeOff, Loader2, Clock,
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel, PageHead, Button, Chip, Input, Select, EmptyState, SkeletonRows,
} from "@/components/ceo/ui/Primitives";
import {
    DOC_TYPE_META, REQUEST_META,
    docLabel, typeIcon, fmtDate, fmtDateTime, ago, apiJson,
    canRelease, needsGeneration, readyToRelease,
    Banner, SummaryCard, Avatar, GenerateModal, DocumentDrawer,
    useDepartments,
} from "../documentKit";

const PER_PAGE = 25;

/* The `status` param of GET /api/hr/documents/requests, byte-exact. "all" is
   every row carrying an employee ask of any kind — never the whole library. */
const STATUS_TABS = [
    { id: "requested", label: "Open" },
    { id: "fulfilled", label: "Released" },
    { id: "declined", label: "Declined" },
    { id: "cancelled", label: "Cancelled" },
    { id: "all", label: "All requests" },
];

export default function DocumentRequestsPage() {
    const [statusFilter, setStatusFilter] = useState("requested");
    const [typeFilter, setTypeFilter] = useState("all");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const [data, setData] = useState({ data: [], counts: {}, page: 1, pages: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [banner, setBanner] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [genPreset, setGenPreset] = useState(null);
    const [releasingId, setReleasingId] = useState(null);

    const departments = useDepartments();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({
                status: statusFilter,
                ...(typeFilter !== "all" && { type: typeFilter }),
                ...(departmentFilter !== "all" && { department: departmentFilter }),
                page: String(page),
                limit: String(PER_PAGE),
            });
            const d = await apiJson(`/api/hr/documents/requests?${qs}`);
            setData(d);
        } catch (e) {
            setBanner({ type: "error", msg: "Load failed: " + e.message });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, departmentFilter, page]);

    useEffect(() => { load(); }, [load]);

    /* Free-text is client-side over the loaded page. The server also accepts
       `q`, but a filter that re-fetches on every keystroke fights the drawer;
       the page size is 25. */
    const visible = useMemo(() => {
        const list = data.data || [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((r) =>
            (r.employeeName || "").toLowerCase().includes(q) ||
            (r.biometricId || "").toLowerCase().includes(q) ||
            (r.department || "").toLowerCase().includes(q) ||
            (r.requestReason || "").toLowerCase().includes(q) ||
            docLabel(r).toLowerCase().includes(q),
        );
    }, [data.data, search]);

    const selected = useMemo(
        () => (data.data || []).find((r) => r._id === selectedId) || null,
        [data.data, selectedId],
    );

    useEffect(() => {
        if (selectedId && !loading && !selected) setSelectedId(null);
    }, [selectedId, selected, loading]);

    const counts = data.counts || {};

    const say = (type, msg) => {
        setBanner({ type, msg });
        if (type === "success") setTimeout(() => setBanner(null), 3500);
    };

    const afterMutation = async (out, fallback) => {
        if (out?.warning) say("warn", `${out.message || fallback} ${out.warning}`);
        else say("success", out?.message || fallback);
        await load();
    };

    /* Case (a) in one click, straight off the card. The gate is re-checked on
       the server; canRelease() here only stops us offering a refused action. */
    const releaseNow = async (doc) => {
        setReleasingId(doc._id);
        try {
            const out = await apiJson(`/api/hr/documents/${doc._id}/release`, {
                method: "PATCH",
                body: { note: "Released from the request queue" },
            });
            say("success", out?.message || "Released to the employee.");
            await load();
        } catch (e) {
            say("error", "Release failed: " + e.message);
        } finally {
            setReleasingId(null);
        }
    };

    const openGenerateFor = (doc) => {
        setGenPreset({
            employeeId: String(doc.employeeId),
            employeeName: doc.employeeName || "",
            type: doc.type,
            otherTypeLabel: doc.otherTypeLabel || "",
            requestId: doc._id,
        });
    };

    const filtersOn = typeFilter !== "all" || departmentFilter !== "all";

    return (
        <Hr_DashboardLayout activeMenu="document-requests">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Document requests"
                    sub="Letters employees have asked for. Releasing one is what makes it visible in their app."
                    actions={
                        <Button tone="secondary" onClick={load} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    }
                />

                <div className="space-y-4">
                    {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

                    {/* The three numbers that matter. `readyToRelease` is the
                        feature: documents that exist and are still invisible. */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <SummaryCard
                            icon={Inbox} tone="amber" label="Open requests"
                            value={loading ? "—" : (counts.requested ?? 0)}
                            active={statusFilter === "requested"}
                            highlight={!!counts.requested}
                            onClick={() => { setStatusFilter("requested"); setPage(1); }}
                        />
                        <SummaryCard
                            icon={Send} tone="emerald" label="Ready to release"
                            value={loading ? "—" : (counts.readyToRelease ?? 0)}
                            onClick={() => { setStatusFilter("requested"); setPage(1); }}
                        />
                        <SummaryCard
                            icon={Hourglass} tone="blue" label="Awaiting generation"
                            value={loading ? "—" : (counts.awaitingGeneration ?? 0)}
                            onClick={() => { setStatusFilter("requested"); setPage(1); }}
                        />
                    </div>

                    {/* Status tabs */}
                    <div className="rail flex items-center gap-1 overflow-x-auto">
                        {STATUS_TABS.map((t) => (
                            <button key={t.id} type="button"
                                onClick={() => { setStatusFilter(t.id); setPage(1); }}
                                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${statusFilter === t.id
                                    ? "bg-[var(--control)] text-ink"
                                    : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
                                    }`}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col gap-3 lg:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                            <Input type="text" className="pl-9"
                                placeholder="Search by name, employee ID, department, or reason…"
                                value={search} onChange={(e) => setSearch(e.target.value)} />
                            {search && (
                                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <Select value={typeFilter} aria-label="Filter by type" className="lg:w-56"
                            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                            <option value="all">All types</option>
                            {/* `warning` is in the map because HR can generate one; it can
                                never appear as a REQUEST, so it is filtered out here. */}
                            {Object.entries(DOC_TYPE_META)
                                .filter(([v]) => v !== "warning")
                                .map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                        </Select>
                        <Select value={departmentFilter} aria-label="Filter by department" className="lg:w-52"
                            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}>
                            <option value="all">All departments</option>
                            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                        </Select>
                    </div>

                    {filtersOn && (
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="flex items-center gap-1.5 text-ink-faint">
                                <Filter className="h-3.5 w-3.5" /> Filters:
                            </span>
                            {typeFilter !== "all" && (
                                <Chip tone="neutral">
                                    {DOC_TYPE_META[typeFilter]?.label || typeFilter}
                                    <button type="button" aria-label="Clear type filter"
                                        onClick={() => { setTypeFilter("all"); setPage(1); }}>
                                        <X className="h-3 w-3" />
                                    </button>
                                </Chip>
                            )}
                            {departmentFilter !== "all" && (
                                <Chip tone="neutral">
                                    <Building2 className="h-3 w-3" /> {departmentFilter}
                                    <button type="button" aria-label="Clear department filter"
                                        onClick={() => { setDepartmentFilter("all"); setPage(1); }}>
                                        <X className="h-3 w-3" />
                                    </button>
                                </Chip>
                            )}
                        </div>
                    )}

                    {/* List */}
                    {loading ? (
                        <Panel label="Loading requests"><SkeletonRows rows={6} /></Panel>
                    ) : visible.length === 0 ? (
                        <Panel label="Requests">
                            <EmptyState
                                title={statusFilter === "requested" ? "Nothing waiting" : "No requests match the filters"}
                                body={statusFilter === "requested"
                                    ? "Requests raised from the mobile app land here. There is no notification — this queue is the mechanism."
                                    : "Try a different status, or clear the filters above."}
                            />
                        </Panel>
                    ) : (
                        <div className="space-y-2">
                            {visible.map((r) => (
                                <RequestCard
                                    key={r._id}
                                    request={r}
                                    releasing={releasingId === r._id}
                                    onOpen={() => setSelectedId(r._id)}
                                    onRelease={() => releaseNow(r)}
                                    onGenerate={() => openGenerateFor(r)}
                                />
                            ))}
                        </div>
                    )}

                    {data.pages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-ink-muted">
                                Page <strong data-figure className="text-ink">{data.page}</strong> of{" "}
                                <strong data-figure className="text-ink">{data.pages}</strong> ·{" "}
                                <span data-figure>{data.total}</span> total
                            </p>
                            <div className="flex items-center gap-1">
                                <Button tone="secondary" size="sm" disabled={page === 1}
                                    onClick={() => setPage(Math.max(1, page - 1))}>Previous</Button>
                                <Button tone="secondary" size="sm" disabled={page >= data.pages}
                                    onClick={() => setPage(Math.min(data.pages, page + 1))}>Next</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {genPreset && (
                <GenerateModal
                    preset={genPreset}
                    onClose={() => setGenPreset(null)}
                    onSaved={async (out) => {
                        setGenPreset(null);
                        say(
                            out?.released ? "success" : "warn",
                            out?.message ||
                            (out?.released
                                ? "Generated and released to the employee."
                                : "Generated. The employee still cannot see it — release it when you are ready."),
                        );
                        await load();
                    }}
                />
            )}

            {selected && (
                <DocumentDrawer
                    doc={selected}
                    onClose={() => setSelectedId(null)}
                    onReleased={(out) => afterMutation(out, "Released to the employee.")}
                    onRevoked={(out) => afterMutation(out, "Withdrawn from the employee.")}
                    onDeclined={(out) => afterMutation(out, "Request declined.")}
                    onFileReplaced={(out) => afterMutation(out, "File replaced.")}
                    onDeleted={async (out) => {
                        setSelectedId(null);
                        say("success", out?.message || "Document deleted.");
                        await load();
                    }}
                />
            )}
        </Hr_DashboardLayout>
    );
}

// ─── Request card ──────────────────────────────────────────────────────────
//
// The card's whole job is to make the (a)/(b) split visible without opening
// anything. A ready-to-release card wears a positive inset ring and carries the
// finishing button inline; a needs-generation card wears the rework wash and
// carries the button that starts the work.

function RequestCard({ request, releasing, onOpen, onRelease, onGenerate }) {
    const TypeIcon = typeIcon(request.type);
    const req = REQUEST_META[request.requestStatus] || REQUEST_META.none;
    const ready = readyToRelease(request);
    const blank = needsGeneration(request);

    // Other rows of the same type for the same employee. `otherExisting` comes
    // decorated from the server — one query for the whole page, never per row.
    const priorReleased = (request.otherExisting || []).filter((s) => s.released).length;

    const ring = ready
        ? "shadow-[inset_0_0_0_1px_var(--state-positive)]"
        : blank
            ? "shadow-[inset_0_0_0_1px_var(--state-rework)]"
            : "";

    return (
        <div className={`frost-panel rounded-card p-4 transition-colors ${ring}`}>
            <div className="flex items-start gap-3">
                <Avatar name={request.employeeName} />

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-sm font-medium text-ink">
                                    {request.employeeName || "Unknown"}
                                </h3>
                                {request.biometricId && (
                                    <span data-figure className="text-[10px] text-ink-faint">{request.biometricId}</span>
                                )}
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
                            <Chip tone="neutral"><TypeIcon className="h-3 w-3" /> {docLabel(request)}</Chip>
                            <Chip tone={req.tone}>{req.label}</Chip>
                        </div>
                    </div>

                    {/* The one line that says which case this is */}
                    <div className={`mt-2.5 flex flex-wrap items-center gap-2 rounded-inset px-3 py-2 text-xs ${ready
                        ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] text-[var(--state-positive-ink)]"
                        : blank
                            ? "bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] text-[var(--state-rework-ink)]"
                            : "bg-[var(--surface-sunken)] text-ink-muted"
                        }`}>
                        {ready ? (
                            <>
                                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <strong className="font-medium">This document already exists</strong> and the employee
                                    still cannot see it. One click releases it.
                                </span>
                            </>
                        ) : blank ? (
                            <>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <strong className="font-medium">Nothing generated yet.</strong> Make the letter, then
                                    release it.
                                </span>
                            </>
                        ) : request.released ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--state-positive-ink)]" />
                                <span className="min-w-0 flex-1">
                                    Released {fmtDate(request.releasedAt)}
                                    {request.releasedByName ? ` by ${request.releasedByName}` : ""}.
                                </span>
                            </>
                        ) : (
                            <>
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1">
                                    {request.requestStatus === "declined"
                                        ? `Declined${request.declinedByName ? ` by ${request.declinedByName}` : ""}${request.declineReason ? ` — ${request.declineReason}` : ""}.`
                                        : request.requestStatus === "cancelled"
                                            ? "The employee cancelled this request."
                                            : "Withdrawn from the employee."}
                                </span>
                            </>
                        )}
                    </div>

                    {request.requestReason && (
                        <p className="mt-2 line-clamp-2 text-xs text-ink-muted">
                            <MessageSquare className="mr-1 inline h-3 w-3 text-ink-faint" />
                            {request.requestReason}
                        </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-ink-faint">
                            Requested <span data-figure>{ago(request.requestedAt || request.createdAt)}</span> ·{" "}
                            <span data-figure>{fmtDateTime(request.requestedAt || request.createdAt)}</span>
                            {priorReleased > 0 && (
                                <> · <span data-figure>{priorReleased}</span> of this type released before</>
                            )}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {ready && (
                                <RoleGate min="editor">
                                    <Button tone="primary" size="sm" onClick={onRelease}
                                        disabled={releasing || !canRelease(request)}>
                                        {releasing
                                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Releasing…</>
                                            : <><Send className="h-3.5 w-3.5" /> Release now</>}
                                    </Button>
                                </RoleGate>
                            )}
                            {blank && (
                                <RoleGate min="editor">
                                    <Button tone="primary" size="sm" onClick={onGenerate}>
                                        <FileSignature className="h-3.5 w-3.5" /> Generate
                                    </Button>
                                </RoleGate>
                            )}
                            <Button tone="ghost" size="sm" onClick={onOpen}>
                                Open <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
