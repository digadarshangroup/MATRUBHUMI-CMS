"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
    Users, Search, Loader2, X, Mail, Phone, MapPin,
    ChevronUp, ChevronDown, Minus, Plus, Maximize2, Briefcase,
} from "lucide-react";
import HRDashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Panel,
    Input,
    PageHead,
    EmptyState,
    ErrorState,
} from "@/components/ceo/ui/Primitives";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiFetch(url) {
    const res = await fetch(`${API_BASE}${url}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W = 240;
const NODE_H = 76;
const LEVEL_GAP = 110;
const SIBLING_GAP = 24;
const TOP_PAD = 32;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

// ─── Color helpers ────────────────────────────────────────────────────────────
// Department hues come from the flow palette so the chart reads in the same
// colour language as every other surface, in both themes.
const DEPT_COLORS = {
    Design: { dot: "bg-[var(--flow-created)]", hex: "var(--flow-created)" },
    Sales: { dot: "bg-[var(--flow-assigned)]", hex: "var(--flow-assigned)" },
    Marketing: { dot: "bg-[var(--flow-approved)]", hex: "var(--flow-approved)" },
    Development: { dot: "bg-[var(--flow-completed)]", hex: "var(--flow-completed)" },
    Leadership: { dot: "bg-[var(--flow-rework)]", hex: "var(--flow-rework)" },
    "Human Resources": { dot: "bg-[var(--state-extension)]", hex: "var(--state-extension)" },
    Accounting: { dot: "bg-[var(--flow-cancelled)]", hex: "var(--flow-cancelled)" },
    Production: { dot: "bg-[var(--state-risk)]", hex: "var(--state-risk)" },
    Cutting: { dot: "bg-[var(--state-rework)]", hex: "var(--state-rework)" },
    Manufacturing: { dot: "bg-[var(--state-blocked)]", hex: "var(--state-blocked)" },
};
const FALLBACK_COLORS = Object.values(DEPT_COLORS);

function deptColor(name = "") {
    if (DEPT_COLORS[name]) return DEPT_COLORS[name];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

const AVATAR_BG = [
    "bg-[var(--flow-created)]",
    "bg-[var(--flow-assigned)]",
    "bg-[var(--flow-approved)]",
    "bg-[var(--flow-rework)]",
    "bg-[var(--flow-completed)]",
    "bg-[var(--flow-cancelled)]",
    "bg-[var(--state-extension)]",
    "bg-[var(--state-risk)]",
];
function avatarBg(name = "") {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

function initials(firstName = "", lastName = "") {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ emp, size = 40 }) {
    const photo = emp?.profilePhoto?.url;
    const name = `${emp?.firstName || ""} ${emp?.lastName || ""}`;
    if (photo) {
        return (
            <img
                src={photo}
                alt={name}
                className="rounded-full object-cover flex-shrink-0"
                style={{ width: size, height: size }}
                onError={(e) => { e.target.style.display = "none"; }}
            />
        );
    }
    return (
        <div className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarBg(name)}`}
            style={{ width: size, height: size, fontSize: size * 0.36 }}>
            {initials(emp?.firstName, emp?.lastName)}
        </div>
    );
}

// ─── Tree builders ────────────────────────────────────────────────────────────
function buildTree(employees) {
    const byId = {};
    employees.forEach(e => { byId[String(e._id)] = { ...e, children: [] }; });

    const roots = [];
    Object.values(byId).forEach(emp => {
        const pmid = emp.primaryManager?.managerId ? String(emp.primaryManager.managerId) : null;
        if (pmid && byId[pmid] && pmid !== String(emp._id)) {
            byId[pmid].children.push(emp);
        } else {
            roots.push(emp);
        }
    });

    Object.values(byId).forEach(emp => {
        emp.children.sort((a, b) =>
            `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        );
    });
    roots.sort((a, b) => {
        if (b.children.length !== a.children.length) return b.children.length - a.children.length;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    return roots;
}

function layoutTree(roots, collapsed) {
    const positions = {};
    const visited = new Set();
    let nextLeaf = 0;

    function assignPos(node, depth) {
        const id = String(node._id);
        if (visited.has(id)) return null;
        visited.add(id);

        const isCollapsed = collapsed.has(id);

        if (isCollapsed || !node.children.length) {
            const col = nextLeaf;
            nextLeaf += 1;
            positions[id] = { col, depth, node };
            return col;
        }

        const childCols = node.children
            .map(c => assignPos(c, depth + 1))
            .filter(c => c !== null);

        if (!childCols.length) {
            const col = nextLeaf;
            nextLeaf += 1;
            positions[id] = { col, depth, node };
            return col;
        }

        const col = (Math.min(...childCols) + Math.max(...childCols)) / 2;
        positions[id] = { col, depth, node };
        return col;
    }

    roots.forEach((r, i) => {
        if (i > 0) nextLeaf += 0.5;
        assignPos(r, 0);
    });

    const stepX = NODE_W + SIBLING_GAP;
    const stepY = NODE_H + LEVEL_GAP;
    const pixelPositions = {};
    let maxDepth = 0;
    let maxCol = 0;

    Object.entries(positions).forEach(([id, p]) => {
        const cx = p.col * stepX + NODE_W / 2;
        const cy = p.depth * stepY + NODE_H / 2 + TOP_PAD;
        pixelPositions[id] = {
            x: cx - NODE_W / 2,
            y: cy - NODE_H / 2,
            cx, cy,
            node: p.node,
        };
        if (p.depth > maxDepth) maxDepth = p.depth;
        if (p.col > maxCol) maxCol = p.col;
    });

    const totalWidth = (maxCol + 1) * stepX;
    const totalHeight = (maxDepth + 1) * stepY + TOP_PAD * 2;

    return { positions: pixelPositions, totalWidth, totalHeight };
}

// ─── Node Card ───────────────────────────────────────────────────────────────
function NodeCard({ emp, selected, onClick, collapsed, hasChildren, hiddenCount, onToggleCollapse }) {
    const dc = deptColor(emp.department || "");
    return (
        <div className="relative" style={{ width: NODE_W }}>
            <button
                onClick={onClick}
                className={`frost-panel rounded-card w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-shadow ${selected
                    ? "shadow-[0_0_0_2px_var(--color-ink)]"
                    : "shadow-[0_0_0_1px_var(--color-hairline)]"
                    }`}
                style={{ height: NODE_H }}
            >
                <Avatar emp={emp} size={42} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate leading-tight">
                        {emp.firstName} {emp.lastName}
                    </p>
                    <p className="text-xs text-ink-muted truncate leading-tight mt-0.5">
                        {emp.designation || emp.jobTitle || "Employee"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dc.dot}`} />
                        <span className="text-[10px] text-ink-faint truncate">{emp.department || "—"}</span>
                    </div>
                </div>
            </button>

            {hasChildren && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                    className="frost-bar absolute left-1/2 -translate-x-1/2 -bottom-3 z-20 border border-hairline rounded-full px-2.5 py-0.5 text-[10px] font-medium text-ink hover:bg-[var(--control)] flex items-center gap-1 whitespace-nowrap"
                >
                    {collapsed ? (
                        <>
                            <span data-figure>+{hiddenCount}</span>
                            <ChevronDown size={10} />
                        </>
                    ) : (
                        <>
                            <span>Collapse</span>
                            <ChevronUp size={10} />
                        </>
                    )}
                </button>
            )}
        </div>
    );
}

// ─── Detail Card ─────────────────────────────────────────────────────────────
function DetailCard({ emp, onClose }) {
    if (!emp) return null;
    const dc = deptColor(emp.department || "");
    const city = emp.address?.current?.city;
    const country = emp.address?.current?.country;
    const location = [city, country].filter(Boolean).join(", ");
    return (
        <Panel
            padded={false}
            label={`${emp.firstName} ${emp.lastName}`}
            className="absolute top-4 left-4 z-30 w-80 overflow-hidden"
        >
            <div
                className="p-4 flex items-start gap-3 border-b border-hairline"
                style={{ background: `color-mix(in srgb, ${dc.hex} 10%, transparent)` }}
            >
                <Avatar emp={emp} size={52} />
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink truncate">
                        {emp.firstName} {emp.lastName}
                    </p>
                    <p className="text-xs text-ink-muted truncate">
                        {emp.designation || emp.jobTitle || "Employee"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dc.dot}`} />
                        <span className="text-[10px] text-ink-faint font-medium">{emp.department || "—"}</span>
                    </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full bg-[var(--control)] hover:bg-[var(--control-hover)] flex items-center justify-center transition-colors flex-shrink-0">
                    <X size={14} className="text-ink-muted" />
                </button>
            </div>
            <div className="p-4 space-y-2.5">
                {emp.email && (
                    <div className="flex items-center gap-2.5 text-xs text-ink">
                        <Mail size={13} className="text-ink-faint flex-shrink-0" />
                        <span className="truncate">{emp.email}</span>
                    </div>
                )}
                {emp.phone && (
                    <div className="flex items-center gap-2.5 text-xs text-ink">
                        <Phone size={13} className="text-ink-faint flex-shrink-0" />
                        <span data-figure>{emp.phone}</span>
                    </div>
                )}
                {location && (
                    <div className="flex items-center gap-2.5 text-xs text-ink">
                        <MapPin size={13} className="text-ink-faint flex-shrink-0" />
                        <span className="truncate">{location}</span>
                    </div>
                )}
                {emp.biometricId && (
                    <div className="flex items-center gap-2.5 text-xs text-ink">
                        <Briefcase size={13} className="text-ink-faint flex-shrink-0" />
                        <span data-figure>{emp.biometricId}</span>
                    </div>
                )}
            </div>
        </Panel>
    );
}

// ─── Search dropdown ─────────────────────────────────────────────────────────
function SearchDropdown({ results, onSelect }) {
    if (!results.length) {
        return (
            <div className="frost-bar absolute top-full left-0 right-0 mt-2 rounded-panel border border-hairline z-30 px-4 py-3">
                <p className="text-xs text-ink-faint text-center">No matches</p>
            </div>
        );
    }
    return (
        <div className="frost-bar scroll-slim absolute top-full left-0 right-0 mt-2 rounded-panel border border-hairline overflow-hidden z-30 max-h-80 overflow-y-auto">
            {results.map(emp => (
                <button
                    key={emp._id}
                    onMouseDown={(e) => { e.preventDefault(); onSelect(emp); }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--row-hover)] transition-colors text-left border-b border-hairline last:border-b-0"
                >
                    <Avatar emp={emp} size={32} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                            {emp.firstName} {emp.lastName}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                            {emp.designation || "—"} · {emp.department || "—"}
                        </p>
                    </div>
                </button>
            ))}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function OrganizationChartPage() {
    const [allEmployees, setAllEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [collapsed, setCollapsed] = useState(new Set());
    const [selected, setSelected] = useState(null);

    const [search, setSearch] = useState("");
    const [showResults, setShowResults] = useState(false);

    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });

    // ── Load all employees ───────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                let all = [], page = 1, hasMore = true;
                while (hasMore) {
                    const data = await apiFetch(`/api/employees/all?page=${page}&limit=100`);
                    const emps = data.data?.employees || [];
                    all = [...all, ...emps];
                    hasMore = data.data?.pagination?.hasNextPage || false;
                    page++;
                    if (page > 30) break;
                }
                setAllEmployees(all);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // ── Build tree + layout ──────────────────────────────────────────────────
    const { roots, layout } = useMemo(() => {
        if (!allEmployees.length) {
            return { roots: [], layout: { positions: {}, totalWidth: 0, totalHeight: 0 } };
        }
        const r = buildTree(allEmployees);
        const l = layoutTree(r, collapsed);
        return { roots: r, layout: l };
    }, [allEmployees, collapsed]);

    // ── Center / fit view ────────────────────────────────────────────────────
    const centerView = useCallback(() => {
        if (!containerRef.current || !layout.totalWidth) return;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const padX = 80, padY = 80;
        const k = Math.min(
            1,
            (cw - padX) / layout.totalWidth,
            (ch - padY) / layout.totalHeight
        );
        const x = (cw - layout.totalWidth * k) / 2;
        const y = 24;
        setTransform({ x, y, k: Math.max(MIN_ZOOM, k) });
    }, [layout.totalWidth, layout.totalHeight]);

    useEffect(() => {
        if (!loading && layout.totalWidth) {
            centerView();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, layout.totalWidth]);

    // ── Wheel-to-zoom (zooms toward cursor, plain scroll, no modifier) ───────
    // Attached natively with { passive: false } so preventDefault is reliable —
    // React's synthetic onWheel can be passive in some setups, breaking zoom.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onWheel = (e) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            setTransform(t => {
                const delta = -e.deltaY * 0.0015;
                const newK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k + delta));
                if (newK === t.k) return t;
                // Keep the world-point under the cursor stationary
                const scale = newK / t.k;
                const newX = cursorX - (cursorX - t.x) * scale;
                const newY = cursorY - (cursorY - t.y) * scale;
                return { x: newX, y: newY, k: newK };
            });
        };

        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    // ── Pan handlers ─────────────────────────────────────────────────────────
    const handleMouseDown = (e) => {
        if (e.target.closest("button") || e.target.closest("input")) return;
        isDragging.current = true;
        dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
        if (containerRef.current) containerRef.current.style.cursor = "grabbing";
    };
    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        setTransform(t => ({
            ...t,
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y,
        }));
    };
    const handleMouseUp = () => {
        isDragging.current = false;
        if (containerRef.current) containerRef.current.style.cursor = "grab";
    };

    // ── Zoom buttons (zoom toward viewport center) ───────────────────────────
    const zoom = (delta) => {
        const el = containerRef.current;
        setTransform(t => {
            const newK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.k + delta));
            if (newK === t.k || !el) return { ...t, k: newK };
            const cw = el.clientWidth;
            const ch = el.clientHeight;
            const scale = newK / t.k;
            const newX = cw / 2 - (cw / 2 - t.x) * scale;
            const newY = ch / 2 - (ch / 2 - t.y) * scale;
            return { x: newX, y: newY, k: newK };
        });
    };

    // ── Collapse toggle ──────────────────────────────────────────────────────
    const toggleCollapse = (id) => {
        setCollapsed(c => {
            const n = new Set(c);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };

    // ── Search ───────────────────────────────────────────────────────────────
    const searchResults = useMemo(() => {
        if (!search.trim()) return [];
        const q = search.toLowerCase();
        return allEmployees.filter(e =>
            `${e.firstName || ""} ${e.lastName || ""} ${e.designation || ""} ${e.department || ""} ${e.biometricId || ""}`
                .toLowerCase().includes(q)
        ).slice(0, 8);
    }, [search, allEmployees]);

    const focusEmployee = (emp) => {
        const empById = {};
        allEmployees.forEach(e => { empById[String(e._id)] = e; });

        const newCollapsed = new Set(collapsed);
        let current = emp;
        const safety = new Set();
        while (current && !safety.has(String(current._id))) {
            safety.add(String(current._id));
            const pmid = current.primaryManager?.managerId
                ? String(current.primaryManager.managerId) : null;
            if (pmid && empById[pmid]) {
                newCollapsed.delete(pmid);
                current = empById[pmid];
            } else break;
        }
        setCollapsed(newCollapsed);
        setSelected(emp);
        setSearch("");
        setShowResults(false);

        setTimeout(() => {
            const newLayout = layoutTree(buildTree(allEmployees), newCollapsed);
            const pos = newLayout.positions[String(emp._id)];
            if (pos && containerRef.current) {
                const cw = containerRef.current.clientWidth;
                const ch = containerRef.current.clientHeight;
                setTransform(t => ({
                    k: t.k,
                    x: cw / 2 - pos.cx * t.k,
                    y: ch / 3 - pos.cy * t.k,
                }));
            }
        }, 60);
    };

    // ── Build SVG connectors ─────────────────────────────────────────────────
    const connections = useMemo(() => {
        const lines = [];
        Object.values(layout.positions).forEach(({ node, cx, cy }) => {
            const id = String(node._id);
            if (collapsed.has(id) || !node.children.length) return;

            const parentBottom = { x: cx, y: cy + NODE_H / 2 };

            node.children.forEach(child => {
                const cp = layout.positions[String(child._id)];
                if (!cp) return;
                const childTop = { x: cp.cx, y: cp.cy - NODE_H / 2 };
                const midY = (parentBottom.y + childTop.y) / 2;

                const isHighlighted = selected && (
                    String(selected._id) === String(child._id) ||
                    String(selected._id) === id
                );

                lines.push({
                    d: `M ${parentBottom.x} ${parentBottom.y} L ${parentBottom.x} ${midY} L ${childTop.x} ${midY} L ${childTop.x} ${childTop.y}`,
                    highlighted: isHighlighted,
                    key: `${id}-${child._id}`,
                });
            });
        });
        return lines.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
    }, [layout, collapsed, selected]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const departments = new Set(allEmployees.map(e => e.department).filter(Boolean));
        const managerIds = new Set(
            allEmployees
                .map(e => e.primaryManager?.managerId ? String(e.primaryManager.managerId) : null)
                .filter(Boolean)
        );
        return {
            total: allEmployees.length,
            leaders: managerIds.size,
            departments: departments.size,
        };
    }, [allEmployees]);

    return (
        <HRDashboardLayout activeMenu="teams">
            <div
                className="-m-6 flex flex-col"
                style={{ height: "calc(100vh - 72px)", userSelect: "none" }}
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex-shrink-0 px-4 pt-6 deck:px-8">
                    <PageHead
                        kicker="Human resources"
                        title="Organization chart"
                        sub={
                            loading ? null : (
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span><span data-figure className="text-ink">{stats.total}</span> employees</span>
                                    <span className="text-ink-faint">·</span>
                                    <span><span data-figure className="text-ink">{stats.leaders}</span> leaders</span>
                                    <span className="text-ink-faint">·</span>
                                    <span><span data-figure className="text-ink">{stats.departments}</span> departments</span>
                                </span>
                            )
                        }
                        actions={
                            <div className="relative w-full sm:w-80">
                                <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                                <Input
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setShowResults(true); }}
                                    onFocus={() => setShowResults(true)}
                                    onBlur={() => setTimeout(() => setShowResults(false), 150)}
                                    placeholder="Search for an employee"
                                    aria-label="Search for an employee"
                                    className="pl-9 pr-9"
                                />
                                {search && (
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setSearch("");
                                            setShowResults(false);
                                        }}
                                        aria-label="Clear search"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                                {showResults && search && (
                                    <SearchDropdown results={searchResults} onSelect={focusEmployee} />
                                )}
                            </div>
                        }
                    />
                </div>

                {/* ── Canvas ──────────────────────────────────────────────── */}
                <div
                    ref={containerRef}
                    className="scroll-slim relative mx-4 mb-6 flex-1 cursor-grab overflow-hidden rounded-card border border-hairline bg-[var(--surface-sunken)] deck:mx-8"
                    style={{
                        // Theme-aware dot grid — reads the token so the dots stay
                        // faint on both the light and dark ground.
                        backgroundImage:
                            "radial-gradient(circle, var(--g-line-strong) 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {selected && (
                        <DetailCard emp={selected} onClose={() => setSelected(null)} />
                    )}

                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" role="status">
                            <Loader2 size={28} className="animate-spin text-ink-faint" />
                            <p className="text-sm text-ink-muted">Loading organization chart…</p>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex items-center justify-center p-6">
                            <ErrorState title="That didn't load" body={error} />
                        </div>
                    ) : !roots.length ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Users size={32} className="text-ink-faint" />
                            <EmptyState
                                compact
                                title="No employees found"
                                body="Add employees and assign managers to build the org chart"
                            />
                        </div>
                    ) : (
                        <div
                            className="origin-top-left"
                            style={{
                                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                                width: layout.totalWidth,
                                height: layout.totalHeight,
                                position: "relative",
                                willChange: "transform",
                            }}
                        >
                            <svg
                                className="absolute top-0 left-0 pointer-events-none"
                                width={layout.totalWidth}
                                height={layout.totalHeight}
                                style={{ overflow: "visible" }}
                            >
                                {connections.map(line => (
                                    <path
                                        key={line.key}
                                        d={line.d}
                                        // Theme-aware via style so the CSS var resolves: the brand
                                        // green marks the highlighted path to a searched person, a
                                        // faint line token for the rest — both correct in either theme.
                                        style={{ stroke: line.highlighted ? "var(--g-brand)" : "var(--g-line-strong)" }}
                                        strokeWidth={line.highlighted ? 2 : 1.5}
                                        fill="none"
                                        strokeLinejoin="round"
                                    />
                                ))}
                            </svg>

                            {Object.values(layout.positions).map(({ node, x, y }) => {
                                const id = String(node._id);
                                const hasChildren = node.children.length > 0;
                                return (
                                    <div
                                        key={id}
                                        style={{ position: "absolute", left: x, top: y }}
                                    >
                                        <NodeCard
                                            emp={node}
                                            selected={selected && String(selected._id) === id}
                                            onClick={() => setSelected(node)}
                                            collapsed={collapsed.has(id)}
                                            hasChildren={hasChildren}
                                            hiddenCount={node.children.length}
                                            onToggleCollapse={() => toggleCollapse(id)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Bottom toolbar ──────────────────────────────── */}
                    {!loading && !error && roots.length > 0 && (
                        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
                            <div className="frost-bar hidden sm:flex items-center gap-1.5 text-[11px] text-ink-muted px-3 py-2 rounded-full border border-hairline">
                                <span className="text-ink-faint uppercase font-medium tracking-[0.09em]">Tip</span>
                                <span>Scroll to zoom · Drag to pan</span>
                            </div>
                            <button
                                onClick={centerView}
                                title="Center view"
                                aria-label="Center view"
                                className="frost-bar w-9 h-9 rounded-full border border-hairline flex items-center justify-center hover:bg-[var(--control)] transition-colors"
                            >
                                <Maximize2 size={14} className="text-ink-muted" />
                            </button>
                            <div className="frost-bar flex items-center rounded-full border border-hairline">
                                <button
                                    onClick={() => zoom(-0.1)}
                                    aria-label="Zoom out"
                                    className="w-9 h-9 flex items-center justify-center hover:bg-[var(--control)] transition-colors rounded-l-full"
                                >
                                    <Minus size={14} className="text-ink-muted" />
                                </button>
                                <span data-figure className="text-xs font-medium text-ink w-12 text-center select-none">
                                    {Math.round(transform.k * 100)}%
                                </span>
                                <button
                                    onClick={() => zoom(0.1)}
                                    aria-label="Zoom in"
                                    className="w-9 h-9 flex items-center justify-center hover:bg-[var(--control)] transition-colors rounded-r-full"
                                >
                                    <Plus size={14} className="text-ink-muted" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </HRDashboardLayout>
    );
}