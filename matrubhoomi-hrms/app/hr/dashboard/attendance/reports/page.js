"use client";

import { useState, useEffect, useMemo } from "react";
import {
    FileBarChart, Calendar, Download, RefreshCw, Search, Check, X,
    FileText, FileSpreadsheet, ChevronDown, Users, Building2, User,
    AlertCircle, CheckCircle2, Info, Filter, Sparkles,
    TrendingUp, Clock, CalendarDays, Ban, Timer, AlertTriangle,
    Sun, Coffee, Star
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Panel as FrostPanel,
    PageHead,
    Button,
    Field,
    Input,
    Select,
    InlineError,
    SkeletonRows,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "";

const ymNow = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const REPORT_ICONS = {
    "month-performance": { icon: <FileBarChart className="w-4 h-4" /> },
    "month-absent": { icon: <AlertCircle className="w-4 h-4" /> },
    "month-in-out": { icon: <Clock className="w-4 h-4" /> },
    "month-summary": { icon: <FileText className="w-4 h-4" /> },
    "month-early-out": { icon: <Timer className="w-4 h-4" /> },
    "month-overtime": { icon: <Clock className="w-4 h-4" /> },
    "month-miss-punch": { icon: <AlertTriangle className="w-4 h-4" /> },
    "month-half-day": { icon: <CalendarDays className="w-4 h-4" /> },
    "month-coff": { icon: <Coffee className="w-4 h-4" /> },
    "month-special": { icon: <Star className="w-4 h-4" /> },
};


export default function ReportsPage() {
    // ── Form state ──
    const [yearMonth, setYearMonth] = useState(ymNow());
    const [sortBy, setSortBy] = useState("department");
    const [selectedReport, setSelectedReport] = useState("month-performance");
    const [format, setFormat] = useState("pdf");

    // Scope pickers
    const [allCompany, setAllCompany] = useState(false);
    const [allDepartments, setAllDepartments] = useState(false);
    const [allEmployees, setAllEmployees] = useState(false);
    const [selectedDepartments, setSelectedDepartments] = useState(new Set());
    const [selectedEmployees, setSelectedEmployees] = useState(new Set());

    // Search boxes for each panel
    const [deptSearch, setDeptSearch] = useState("");
    const [empSearch, setEmpSearch] = useState("");

    // Data
    const [filters, setFilters] = useState({ company: { name: "Matrubhoomi Farms & Developers" }, departments: [], employees: [] });
    const [reportTypes, setReportTypes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [banner, setBanner] = useState(null);

    // ── Load filters + report types ──
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [fRes, tRes] = await Promise.all([
                    fetch(`${API}/hr/reports/filters`, { credentials: "include" }).then(r => r.json()),
                    fetch(`${API}/hr/reports/types`, { credentials: "include" }).then(r => r.json()),
                ]);
                if (fRes.success) setFilters(fRes);
                if (tRes.success) setReportTypes(tRes.types);
            } catch (e) {
                setBanner({ type: "error", msg: "Failed to load: " + e.message });
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // ── Filtered employees (respects department filter if dept mode is "few") ──
    const visibleEmployees = useMemo(() => {
        let list = filters.employees || [];
        if (!allDepartments && selectedDepartments.size > 0) {
            list = list.filter(e => selectedDepartments.has(e.department));
        }
        if (empSearch) {
            const q = empSearch.toLowerCase();
            list = list.filter(e =>
                (e.name || "").toLowerCase().includes(q) ||
                (e.empCode || "").toLowerCase().includes(q) ||
                (e.biometricId || "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [filters.employees, allDepartments, selectedDepartments, empSearch]);

    const visibleDepartments = useMemo(() => {
        const list = filters.departments || [];
        if (!deptSearch) return list;
        const q = deptSearch.toLowerCase();
        return list.filter(d => (d.name || "").toLowerCase().includes(q));
    }, [filters.departments, deptSearch]);

    const toggleDept = (name) => {
        setSelectedDepartments((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleEmp = (bid) => {
        setSelectedEmployees((prev) => {
            const next = new Set(prev);
            if (next.has(bid)) next.delete(bid);
            else next.add(bid);
            return next;
        });
    };

    const selectAllVisibleDepts = () => {
        setSelectedDepartments(new Set(visibleDepartments.map(d => d.name)));
    };
    const clearDepts = () => setSelectedDepartments(new Set());

    const selectAllVisibleEmps = () => {
        setSelectedEmployees(new Set(visibleEmployees.map(e => e.biometricId)));
    };
    const clearEmps = () => setSelectedEmployees(new Set());

    // ── Scope summary for "Selected Emp:- N" footer ──
    const effectiveEmployeeCount = useMemo(() => {
        if (allEmployees) return filters.employees.length;
        return selectedEmployees.size;
    }, [allEmployees, selectedEmployees, filters.employees]);

    // ── Download ──
    const handleDownload = async () => {
        if (!yearMonth) {
            setBanner({ type: "error", msg: "Please select a month" });
            return;
        }
        if (!allEmployees && selectedEmployees.size === 0) {
            setBanner({ type: "error", msg: "Select at least one employee, or enable 'All Employees'" });
            return;
        }

        setGenerating(true);
        setBanner(null);
        try {
            const body = {
                yearMonth,
                format,
                sortBy,
                allCompany,
                allDepartments,
                allEmployees,
                departments: allDepartments ? [] : [...selectedDepartments],
                employeeIds: allEmployees ? [] : [...selectedEmployees],
            };

            const url = selectedReport === "month-performance"
                ? `${API}/hr/reports/month-performance`
                : `${API}/hr/reports/generate/${selectedReport}`;

            const r = await fetch(url, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!r.ok) {
                let msg = "Report generation failed";
                try { const err = await r.json(); msg = err.message || msg; } catch { }
                throw new Error(msg);
            }

            const blob = await r.blob();
            const ext = format === "excel" ? "xlsx" : "pdf";
            const reportDef = reportTypes.find(t => t.key === selectedReport);
            const filename = `${(reportDef?.label || selectedReport).replace(/\s+/g, "_")}_${yearMonth}.${ext}`;

            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);

            setBanner({ type: "success", msg: `${reportDef?.label || "Report"} downloaded successfully` });
            setTimeout(() => setBanner(null), 3500);
        } catch (e) {
            setBanner({ type: "error", msg: "Download failed: " + e.message });
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Hr_DashboardLayout activeMenu="attendance-reports">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Reports"
                    sub="Generate PDF or Excel reports for attendance analytics"
                />

                <div className="space-y-5">
                    {banner && (
                        banner.type === "success" ? (
                            <div role="status" className="flex items-start justify-between gap-3 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-positive-ink)]">
                                <span className="flex items-start gap-2">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                                    <span>{banner.msg}</span>
                                </span>
                                <button type="button" onClick={() => setBanner(null)} className="shrink-0 opacity-60 transition-opacity hover:opacity-100">✕</button>
                            </div>
                        ) : (
                            <InlineError message={banner.msg} onRetry={() => setBanner(null)} />
                        )
                    )}

                    {loading ? (
                        <FrostPanel label="Loading reports">
                            <SkeletonRows rows={6} />
                        </FrostPanel>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            {/* ─── LEFT PANEL: Date, Sort, Report Type ─────────────── */}
                            <div className="space-y-5">
                                {/* Date + Sort */}
                                <FrostPanel label="Report scope">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <Field label="Select Punch Date">
                                            <div className="relative">
                                                <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                                                <Input type="month" value={yearMonth}
                                                    onChange={(e) => setYearMonth(e.target.value)}
                                                    className="pl-9" data-figure />
                                            </div>
                                        </Field>

                                        <Field label="Sorting">
                                            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                                <option value="department">By Department Wise</option>
                                                <option value="name">By Employee Name</option>
                                                <option value="empcode">By Emp Code</option>
                                            </Select>
                                        </Field>
                                    </div>
                                </FrostPanel>

                                {/* Report type picker */}
                                <FrostPanel padded={false} label="Monthly Report" className="overflow-hidden">
                                    <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
                                        <FileBarChart className="h-4 w-4 text-ink-muted" />
                                        <h2 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Monthly Report</h2>
                                        <span className="ml-auto text-xs text-ink-faint"><span data-figure>{reportTypes.length}</span> available</span>
                                    </div>
                                    <div className="scroll-slim max-h-[460px] divide-y divide-hairline overflow-y-auto">
                                        {reportTypes.map((rt) => {
                                            const selected = selectedReport === rt.key;
                                            const meta = REPORT_ICONS[rt.key] || { color: "#64748b", icon: <FileBarChart className="w-4 h-4" /> };
                                            return (
                                                <button key={rt.key} type="button"
                                                    onClick={() => setSelectedReport(rt.key)}
                                                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${selected ? "bg-[var(--control-active)]" : "hover:bg-[var(--row-hover)]"}`}>
                                                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${selected ? "bg-ink" : "bg-[var(--control)] shadow-[inset_0_0_0_1.5px_var(--color-hairline)]"}`}>
                                                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--body-bg)]" />}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-2">
                                                            <span className="text-ink-muted">{meta.icon}</span>
                                                            <span className={`text-sm font-medium ${selected ? "text-ink" : "text-ink-muted"}`}>{rt.label}</span>
                                                        </span>
                                                        <span className="mt-0.5 block text-xs text-ink-faint">{rt.description}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </FrostPanel>

                                {/* Format toggle + download */}
                                <FrostPanel label="Output">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">Output format</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button type="button" onClick={() => setFormat("pdf")}
                                                    className={`flex items-center gap-2 rounded-inset px-3 py-2.5 transition-colors ${format === "pdf" ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : "bg-[var(--control)] hover:bg-[var(--control-hover)]"}`}>
                                                    <FileText className={`h-4 w-4 ${format === "pdf" ? "text-ink" : "text-ink-faint"}`} />
                                                    <span className={`text-sm font-medium ${format === "pdf" ? "text-ink" : "text-ink-muted"}`}>PDF</span>
                                                </button>
                                                <button type="button" onClick={() => setFormat("excel")}
                                                    className={`flex items-center gap-2 rounded-inset px-3 py-2.5 transition-colors ${format === "excel" ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : "bg-[var(--control)] hover:bg-[var(--control-hover)]"}`}>
                                                    <FileSpreadsheet className={`h-4 w-4 ${format === "excel" ? "text-ink" : "text-ink-faint"}`} />
                                                    <span className={`text-sm font-medium ${format === "excel" ? "text-ink" : "text-ink-muted"}`}>Excel</span>
                                                </button>
                                            </div>
                                        </div>

                                        <Button tone="primary" onClick={handleDownload} disabled={generating} className="w-full">
                                            {generating
                                                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating…</>
                                                : <><Download className="h-4 w-4" /> Download Report</>}
                                        </Button>

                                        <p className="text-center text-[11px] text-ink-faint">
                                            <Info className="mr-1 inline h-3 w-3" />
                                            <span data-figure>{effectiveEmployeeCount}</span> employee{effectiveEmployeeCount === 1 ? "" : "s"} selected · {format === "pdf" ? "Ready to print" : "Opens in Excel"}
                                        </p>
                                    </div>
                                </FrostPanel>
                            </div>

                            {/* ─── RIGHT PANEL: 3-column picker (Company / Dept / Employee) ─── */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {/* DEPARTMENTS */}
                                    <Panel
                                        title="Department"
                                        icon={Users}
                                        allSelected={allDepartments}
                                        onAllToggle={() => {
                                            const next = !allDepartments;
                                            setAllDepartments(next);
                                            if (next) setSelectedDepartments(new Set());
                                        }}
                                        allLabel="All Department"
                                        fewLabel="Few Department"
                                        subAction={
                                            !allDepartments && (
                                                <div className="flex items-center gap-1 text-[10px]">
                                                    <button type="button" onClick={selectAllVisibleDepts} className="rounded-full px-1.5 py-0.5 text-ink transition-colors hover:bg-[var(--control)]">All</button>
                                                    <span className="text-ink-faint">·</span>
                                                    <button type="button" onClick={clearDepts} className="rounded-full px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-[var(--control)]">None</button>
                                                </div>
                                            )
                                        }>
                                        {!allDepartments && (
                                            <>
                                                <div className="border-b border-hairline p-2">
                                                    <div className="relative">
                                                        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ink-faint" />
                                                        <Input type="text" placeholder="Search dept…" value={deptSearch}
                                                            onChange={(e) => setDeptSearch(e.target.value)}
                                                            className="py-1.5 pl-7 pr-2 text-xs" />
                                                    </div>
                                                </div>
                                                <div className="scroll-slim max-h-[260px] overflow-y-auto">
                                                    {visibleDepartments.length === 0 ? (
                                                        <p className="p-3 text-center text-[11px] text-ink-faint">No departments</p>
                                                    ) : visibleDepartments.map((d, i) => {
                                                        const sel = selectedDepartments.has(d.name);
                                                        return (
                                                            <label key={d.name}
                                                                className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors ${sel ? "bg-[var(--control-active)]" : "hover:bg-[var(--row-hover)]"}`}>
                                                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-inset ${sel ? "bg-ink" : "bg-[var(--control)] shadow-[inset_0_0_0_1.5px_var(--color-hairline)]"}`}>
                                                                    {sel && <Check className="h-2.5 w-2.5 text-[var(--body-bg)]" strokeWidth={3} />}
                                                                </span>
                                                                <input type="checkbox" className="hidden" checked={sel} onChange={() => toggleDept(d.name)} />
                                                                <span className="flex-1 truncate text-xs text-ink" onClick={() => toggleDept(d.name)}>
                                                                    <span data-figure>{i + 1}</span>-{d.name}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div className="border-t border-hairline bg-[var(--surface-sunken)] px-2 py-1.5 text-[10px] text-ink-faint">
                                                    Selected: <strong data-figure className="text-ink">{selectedDepartments.size}</strong> / <span data-figure>{visibleDepartments.length}</span>
                                                </div>
                                            </>
                                        )}
                                        {allDepartments && (
                                            <div className="p-4 text-center">
                                                <Sparkles className="mx-auto mb-1 h-4 w-4 text-ink-muted" />
                                                <p className="text-xs font-medium text-ink">All <span data-figure>{filters.departments.length}</span> departments</p>
                                                <p className="text-[10px] text-ink-faint">included in report</p>
                                            </div>
                                        )}
                                    </Panel>

                                    {/* EMPLOYEES */}
                                    <Panel
                                        title="Employee"
                                        icon={User}
                                        allSelected={allEmployees}
                                        onAllToggle={() => {
                                            const next = !allEmployees;
                                            setAllEmployees(next);
                                            if (next) setSelectedEmployees(new Set());
                                        }}
                                        allLabel="All Employee"
                                        fewLabel="Few Employee"
                                        subAction={
                                            !allEmployees && (
                                                <div className="flex items-center gap-1 text-[10px]">
                                                    <button type="button" onClick={selectAllVisibleEmps} className="rounded-full px-1.5 py-0.5 text-ink transition-colors hover:bg-[var(--control)]">All</button>
                                                    <span className="text-ink-faint">·</span>
                                                    <button type="button" onClick={clearEmps} className="rounded-full px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-[var(--control)]">None</button>
                                                </div>
                                            )
                                        }>
                                        {!allEmployees && (
                                            <>
                                                <div className="border-b border-hairline p-2">
                                                    <div className="relative">
                                                        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-ink-faint" />
                                                        <Input type="text" placeholder="Search employee…" value={empSearch}
                                                            onChange={(e) => setEmpSearch(e.target.value)}
                                                            className="py-1.5 pl-7 pr-2 text-xs" />
                                                    </div>
                                                </div>
                                                <div className="scroll-slim max-h-[260px] overflow-y-auto">
                                                    {visibleEmployees.length === 0 ? (
                                                        <p className="p-3 text-center text-[11px] text-ink-faint">No matching employees</p>
                                                    ) : visibleEmployees.map((e) => {
                                                        const sel = selectedEmployees.has(e.biometricId);
                                                        const shortCode = e.empCode || e.biometricId.replace(/^GR/, "");
                                                        return (
                                                            <label key={e.biometricId}
                                                                className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors ${sel ? "bg-[var(--control-active)]" : "hover:bg-[var(--row-hover)]"}`}>
                                                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-inset ${sel ? "bg-ink" : "bg-[var(--control)] shadow-[inset_0_0_0_1.5px_var(--color-hairline)]"}`}>
                                                                    {sel && <Check className="h-2.5 w-2.5 text-[var(--body-bg)]" strokeWidth={3} />}
                                                                </span>
                                                                <input type="checkbox" className="hidden" checked={sel} onChange={() => toggleEmp(e.biometricId)} />
                                                                <span className="flex-1 truncate text-xs text-ink" onClick={() => toggleEmp(e.biometricId)}>
                                                                    <span data-figure className="text-[10px] text-ink-faint">{shortCode}</span>
                                                                    <span className="ml-1.5">{e.name}</span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                <div className="border-t border-hairline bg-[var(--surface-sunken)] px-2 py-1.5 text-[10px] text-ink-faint">
                                                    Selected: <strong data-figure className="text-ink">{selectedEmployees.size}</strong> / <span data-figure>{visibleEmployees.length}</span>
                                                </div>
                                            </>
                                        )}
                                        {allEmployees && (
                                            <div className="p-4 text-center">
                                                <Sparkles className="mx-auto mb-1 h-4 w-4 text-ink-muted" />
                                                <p className="text-xs font-medium text-ink">All <span data-figure>{filters.employees.length}</span> employees</p>
                                                <p className="text-[10px] text-ink-faint">included in report</p>
                                            </div>
                                        )}
                                    </Panel>
                                </div>

                                {/* Selected summary */}
                                <FrostPanel label="Selection summary" className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Users className="h-4 w-4 text-ink-muted" />
                                        <span className="text-ink-muted">Selected Emp:</span>
                                        <strong data-figure className="text-ink">{effectiveEmployeeCount}</strong>
                                        <span className="text-ink-faint">of <span data-figure>{filters.employees.length}</span></span>
                                    </div>
                                    {(allDepartments || selectedDepartments.size > 0 || allEmployees || selectedEmployees.size > 0) && (
                                        <Button tone="ghost" size="sm" onClick={() => {
                                            setAllDepartments(false); setAllEmployees(false);
                                            setSelectedDepartments(new Set()); setSelectedEmployees(new Set());
                                        }}>
                                            Clear all filters
                                        </Button>
                                    )}
                                </FrostPanel>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Hr_DashboardLayout>
    );
}

// ─── Panel component — reusable for Department/Employee columns ────────

function Panel({ title, icon: Icon, allSelected, onAllToggle, allLabel, fewLabel, subAction, children }) {
    return (
        <FrostPanel padded={false} label={title} className="flex flex-col overflow-hidden">
            <div className="border-b border-hairline px-3 py-2">
                <div className="mb-2 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-ink-faint" />
                    <h4 className="flex-1 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">{title}</h4>
                    {subAction}
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="radio" checked={allSelected} onChange={onAllToggle}
                            className="h-3 w-3 accent-[var(--color-ink)]" />
                        <span className={allSelected ? "font-medium text-ink" : "text-ink-muted"}>{allLabel}</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="radio" checked={!allSelected} onChange={onAllToggle}
                            className="h-3 w-3 accent-[var(--color-ink)]" />
                        <span className={!allSelected ? "font-medium text-ink" : "text-ink-muted"}>{fewLabel}</span>
                    </label>
                </div>
            </div>
            <div className="flex flex-1 flex-col">
                {children}
            </div>
        </FrostPanel>
    );
}
