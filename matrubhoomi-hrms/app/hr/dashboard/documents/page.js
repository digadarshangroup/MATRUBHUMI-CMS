"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  HR — Issued documents (the library)
//
//  Every letter HR has made, INCLUDING the ones no employee can see. That is
//  the point of the page: a document has two independent states,
//
//      generated  — the file exists on the HR side
//      released   — the employee may see it
//
//  and this is the only surface in the product where the first without the
//  second is visible. An employee-facing response never carries a
//  generated-but-unreleased row, by any endpoint, by any id.
//
//  The four summary tiles ARE the state filter (the `state` param of
//  GET /api/hr/documents) — they pass their own key straight back, which is why
//  STATE_META's keys are byte-exact against the backend's STATE_FILTERS.
//
//  Field names were checked by hand against models/HR_Models/EmployeeDocument.js.
//  Nothing here will catch a typo for you: `npm run lint` is broken,
//  next.config.mjs sets typescript.ignoreBuildErrors, and there is no test
//  framework. The regularizations page is the post-mortem of exactly that.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Search, RefreshCw, X, Filter, Plus, EyeOff, CheckCircle2, Undo2,
    Hourglass, FileText, ChevronRight, Building2,
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel, PageHead, Button, Chip, Input, Select, EmptyState, SkeletonRows,
} from "@/components/ceo/ui/Primitives";
import {
    DOC_TYPE_META, REQUEST_META, STATE_META,
    docLabel, typeIcon, fmtDate, apiJson, hasFile, openLetter,
    Banner, SummaryCard, ReleaseChip, GenerateModal, DocumentDrawer,
    useDepartments,
} from "./documentKit";

const PER_PAGE = 25;

const TILES = [
    { state: "awaiting_generation", icon: Hourglass, tone: "amber" },
    { state: "generated_unreleased", icon: EyeOff, tone: "blue" },
    { state: "released", icon: CheckCircle2, tone: "emerald" },
    { state: "revoked", icon: Undo2, tone: "rose" },
];

export default function IssuedDocumentsPage() {
    const [stateFilter, setStateFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const [data, setData] = useState({ data: [], counts: {}, page: 1, pages: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [banner, setBanner] = useState(null);
    const [genOpen, setGenOpen] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const departments = useDepartments();

    /* Every filter is in the dep array, so changing one reloads. Free text is
       client-side over the loaded page (below) AND sent as `q`, so a match on a
       later page still surfaces. */
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams({
                ...(stateFilter !== "all" && { state: stateFilter }),
                ...(typeFilter !== "all" && { type: typeFilter }),
                ...(departmentFilter !== "all" && { department: departmentFilter }),
                ...(search.trim() && { q: search.trim() }),
                page: String(page),
                limit: String(PER_PAGE),
            });
            const d = await apiJson(`/api/hr/documents?${qs}`);
            setData(d);
        } catch (e) {
            setBanner({ type: "error", msg: "Load failed: " + e.message });
        } finally {
            setLoading(false);
        }
    }, [stateFilter, typeFilter, departmentFilter, search, page]);

    // Debounced so typing in the search box is not one request per keystroke.
    useEffect(() => {
        const t = setTimeout(() => { load(); }, search.trim() ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    /* Hold the id, never the row. After a release the drawer must re-render
       from the freshly loaded object rather than the stale copy it opened with. */
    const selected = useMemo(
        () => (data.data || []).find((r) => r._id === selectedId) || null,
        [data.data, selectedId],
    );

    // The drawer's row vanished from the current page (a filter no longer
    // matches it) — close rather than leave a dead overlay.
    useEffect(() => {
        if (selectedId && !loading && !selected) setSelectedId(null);
    }, [selectedId, selected, loading]);

    const rows = data.data || [];
    const counts = data.counts || {};

    const say = (type, msg) => {
        setBanner({ type, msg });
        if (type === "success") setTimeout(() => setBanner(null), 3500);
    };

    /* Read the outcome off the SERVER's response, never off an optimistic
       assumption. `released` and `warning` are both fields the routes return. */
    const afterMutation = async (out, fallback) => {
        if (out?.warning) say("warn", `${out.message || fallback} ${out.warning}`);
        else say("success", out?.message || fallback);
        await load();
    };

    const setFilterState = (next) => {
        setStateFilter((cur) => (cur === next ? "all" : next));
        setPage(1);
    };

    const filtersOn =
        stateFilter !== "all" || typeFilter !== "all" || departmentFilter !== "all";

    return (
        <Hr_DashboardLayout activeMenu="documents">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Issued documents"
                    sub="Letters generated for employees. Nothing here is visible to an employee until it is released."
                    actions={
                        <>
                            <Button tone="secondary" onClick={load} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                            <RoleGate min="editor">
                                <Button tone="primary" onClick={() => setGenOpen(true)}>
                                    <Plus className="h-4 w-4" /> Generate document
                                </Button>
                            </RoleGate>
                        </>
                    }
                />

                <div className="space-y-4">
                    {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

                    {/* Totals — and the state filter. Clicking a live tile clears it. */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {TILES.map((t) => (
                            <SummaryCard
                                key={t.state}
                                icon={t.icon}
                                tone={t.tone}
                                label={STATE_META[t.state].label}
                                value={loading ? "—" : (counts[t.state] ?? 0)}
                                active={stateFilter === t.state}
                                highlight={t.state === "generated_unreleased" && !!counts.generated_unreleased}
                                onClick={() => setFilterState(t.state)}
                            />
                        ))}
                    </div>

                    <Panel padded={false} label="All documents">
                        {/* Toolbar */}
                        <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 lg:flex-row">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                                <Input type="text" className="pl-9"
                                    placeholder="Search by name, employee ID, or title…"
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                                {search && (
                                    <button type="button" aria-label="Clear search"
                                        onClick={() => { setSearch(""); setPage(1); }}
                                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <Select value={typeFilter} aria-label="Filter by type" className="lg:w-56"
                                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                                <option value="all">All types</option>
                                {Object.entries(DOC_TYPE_META).map(([v, m]) => (
                                    <option key={v} value={v}>{m.label}</option>
                                ))}
                            </Select>
                            <Select value={departmentFilter} aria-label="Filter by department" className="lg:w-52"
                                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}>
                                <option value="all">All departments</option>
                                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                            </Select>
                        </div>

                        {filtersOn && (
                            <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5 text-sm">
                                <span className="flex items-center gap-1.5 text-ink-faint">
                                    <Filter className="h-3.5 w-3.5" /> Filters:
                                </span>
                                {stateFilter !== "all" && (
                                    <Chip tone="neutral">
                                        {STATE_META[stateFilter]?.label || stateFilter}
                                        <button type="button" aria-label="Clear state filter"
                                            onClick={() => { setStateFilter("all"); setPage(1); }}>
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Chip>
                                )}
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

                        {/* Loading / empty / table — the house triad */}
                        {loading ? (
                            <div className="px-4 py-2"><SkeletonRows rows={5} /></div>
                        ) : rows.length === 0 ? (
                            <EmptyState
                                title={filtersOn || search ? "No documents match the filters" : "No documents yet"}
                                body={filtersOn || search
                                    ? "Try clearing a filter, or search by employee ID."
                                    : "Generate the first letter for an employee. It stays hidden from them until you release it."}
                            />
                        ) : (
                            <div className="scroll-slim overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr>
                                            {["Employee", "Type", "Title", "Generated", "Released", ""].map((h, i) => (
                                                <th key={i} className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((d) => {
                                            const TypeIcon = typeIcon(d.type);
                                            const hidden = d.generated && !d.released && !d.revokedAt;
                                            return (
                                                <tr key={d._id}
                                                    onClick={() => setSelectedId(d._id)}
                                                    className="cursor-pointer transition-colors hover:bg-[var(--row-hover)]">
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        <div className="truncate text-sm font-medium text-ink">
                                                            {d.employeeName || "Unknown"}
                                                        </div>
                                                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                                                            {d.biometricId ? <span data-figure>{d.biometricId}</span> : null}
                                                            {d.department ? <span>· {d.department}</span> : null}
                                                        </div>
                                                    </td>
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        <Chip tone="neutral">
                                                            <TypeIcon className="h-3 w-3" />
                                                            {DOC_TYPE_META[d.type]?.label || d.type}
                                                        </Chip>
                                                    </td>
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        <div className="max-w-[18rem] truncate text-sm text-ink">{docLabel(d)}</div>
                                                        {d.requestStatus !== "none" && (
                                                            <div className="mt-0.5 text-[11px] text-ink-faint">
                                                                Request: {REQUEST_META[d.requestStatus]?.label || d.requestStatus}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        {d.generated ? (
                                                            <>
                                                                <div data-figure className="text-sm text-ink">{fmtDate(d.generatedAt)}</div>
                                                                {d.generatedByName && (
                                                                    <div className="mt-0.5 truncate text-[11px] text-ink-faint">{d.generatedByName}</div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-sm text-ink-faint">—</span>
                                                        )}
                                                    </td>
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        <ReleaseChip doc={d} />
                                                        {hidden && (
                                                            <div className="mt-1 text-[11px] text-[var(--state-rework-ink)]">
                                                                Invisible to the employee
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="border-b border-hairline px-3 py-2.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {hasFile(d.file) && (
                                                                <button type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openLetter(d._id).catch((err) => setBanner({ type: "error", msg: err.message }));
                                                                    }}
                                                                    title="Open the PDF"
                                                                    className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                                                    <FileText size={15} />
                                                                </button>
                                                            )}
                                                            <ChevronRight className="h-4 w-4 text-ink-faint" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

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

            {genOpen && (
                <GenerateModal
                    onClose={() => setGenOpen(false)}
                    onSaved={async (out) => {
                        setGenOpen(false);
                        say(
                            out?.released ? "success" : "warn",
                            out?.message ||
                            (out?.released
                                ? "Generated and released to the employee."
                                : "Generated. The employee cannot see it until you release it."),
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
