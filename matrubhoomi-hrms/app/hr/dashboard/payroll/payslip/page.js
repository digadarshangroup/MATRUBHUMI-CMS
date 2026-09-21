"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Search, Download, Printer, Loader2, FileText, AlertCircle,
    CheckCircle2, X, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
    Panel,
    PageHead,
    Button,
    Chip,
    Field,
    Input,
    Select,
    EmptyState,
    InlineError,
} from "@/components/ceo/ui/Primitives";
import { renderPayslipBody, PAYSLIP_CSS } from "@/lib/payslipTemplate";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getHeaders() {
    const t = typeof window !== "undefined"
        ? localStorage.getItem("hr_token") || localStorage.getItem("token") || ""
        : "";
    return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
async function api(path, opts = {}) {
    const r = await fetch(`${API}${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers }, credentials: "include" });
    const d = await r.json();
    if (!r.ok) {
        const err = new Error(d.message || `HTTP ${r.status}`);
        err.code = d.code;
        err.status = r.status;
        throw err;
    }
    return d;
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const fmtINR = (n) =>
    Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

// ─── Employee Picker ──────────────────────────────────────────────────
function EmployeePicker({ selected, onSelect }) {
    const [q, setQ] = useState("");
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const box = useRef(null);

    const load = useCallback(async (query) => {
        setLoading(true);
        try {
            const r = await api(`/api/hr/payslip/employees?search=${encodeURIComponent(query || "")}&limit=50`);
            setList(r.data || []);
        } catch { setList([]); } finally { setLoading(false); }
    }, []);

    useEffect(() => { const t = setTimeout(() => load(q), 250); return () => clearTimeout(t); }, [q, load]);
    useEffect(() => {
        const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);

    return (
        <div ref={box} className="relative">
            <span className="mb-1.5 block text-sm font-medium text-ink">Select Employee</span>
            {selected ? (
                <div className="flex items-center gap-3 rounded-inset bg-[var(--surface-raised)] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-[var(--body-bg)]">
                        {(selected.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{selected.name}</p>
                        <p className="truncate text-xs text-ink-faint">
                            <span data-figure>{selected.biometricId}</span> · {selected.department}
                        </p>
                    </div>
                    <button
                        onClick={() => onSelect(null)}
                        aria-label="Clear selected employee"
                        className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                        <Input type="text" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
                            placeholder="Search by name, ID, department..."
                            className="pl-9" />
                    </div>
                    {open && (
                        <div className="scroll-slim frost-bar absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-inset border border-hairline shadow-lg">
                            {loading ? (
                                <div className="flex items-center justify-center gap-2 p-4 text-center text-sm text-ink-muted"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>
                            ) : list.length === 0 ? (
                                <div className="p-4 text-center text-sm text-ink-muted">No employees found</div>
                            ) : list.map((e) => (
                                <button key={e.id} onClick={() => { onSelect(e); setOpen(false); setQ(""); }}
                                    className="flex w-full items-center gap-3 border-b border-hairline px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-[var(--row-hover)]">
                                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--control)] text-xs font-medium text-ink">
                                        {(e.name || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                                        <p className="truncate text-xs text-ink-faint">
                                            <span data-figure>{e.biometricId}</span> · {e.department} · {e.designation}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Payslip Template ──────────────────────────────────────────────────
//
// The markup and the stylesheet both come from lib/payslipTemplate.js, which
// is byte-identical to App/src/lib/payslipTemplate.js. That is the point: an
// employee downloading their payslip in the app and HR printing the same
// month here now produce the same document. They did not before — this page
// and the app each had their own copy, and the two had drifted.
//
// dangerouslySetInnerHTML is safe here in the strict sense that matters: every
// value the template interpolates goes through its own esc(), which the old
// hand-written template string in the app did not do at all.
function PayslipTemplate({ data }) {
    if (!data) return null;
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: PAYSLIP_CSS }} />
            <div
                id="payslip-printable"
                className="mx-auto"
                // No padding here and no logoUrl: both now live in the
                // template, so this container only sets the paper size. The
                // page margin had to move inside the slip because @page needs
                // margin:0 to stop Chrome printing its own date/URL header,
                // and the logo had to be embedded because a fetched one races
                // the print call.
                style={{
                    background: "white",
                    width: "210mm",
                    minHeight: "297mm",
                    boxSizing: "border-box",
                }}
                dangerouslySetInnerHTML={{ __html: renderPayslipBody(data) }}
            />
        </>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────
export default function PayslipPage() {
    const today = new Date();
    const [emp, setEmp] = useState(null);
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [year, setYear] = useState(today.getFullYear());
    const [payslip, setPayslip] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleGenerate = async () => {
        if (!emp) { setError({ message: "Please select an employee first" }); return; }
        setLoading(true); setError(null); setPayslip(null);
        try {
            const r = await api(`/api/hr/payslip/${emp.id}?month=${month}&year=${year}`);
            setPayslip(r.data);
        } catch (e) {
            setError({ message: e.message, code: e.code, status: e.status });
        } finally { setLoading(false); }
    };

    const handlePrint = () => window.print();

    // "Download PDF" used to call window.print(), so the button labelled
    // Download opened the print dialog and downloaded nothing. Then it built
    // the file with html2pdf, which works but rasterises the page through a
    // canvas — a picture of a payslip, figures nobody can select.
    //
    // Now the server renders it. Same template, one renderer for the whole
    // platform, and the text stays text. html2pdf is gone from this page.
    const [saving, setSaving] = useState(false);
    const handleDownload = async () => {
        if (!emp || saving) return;
        setSaving(true);
        try {
            const r = await fetch(
                `${API}/api/hr/payslip/${emp.id}/pdf?month=${month}&year=${year}`,
                { headers: getHeaders(), credentials: "include" },
            );
            if (!r.ok) {
                // The endpoint answers JSON on failure, so a readable reason
                // is usually right there — including PAYROLL_NOT_RUN.
                let msg = `HTTP ${r.status}`;
                try { msg = (await r.json()).message || msg; } catch {}
                throw new Error(msg);
            }
            const blob = await r.blob();
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            // The server sets Content-Disposition with the real name; this is
            // the fallback for the synthetic click, which ignores it.
            a.download = `Payslip-${emp.biometricId || emp.id}-${(payslip?.period?.label || "").replace(/\W+/g, "-")}.pdf`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 30000);
        } catch (e) {
            setError({ message: `Could not download the PDF: ${e.message}` });
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => { setPayslip(null); setError(null); }, [emp, month, year]);
    const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

    return (
        <DashboardLayout activeMenu="payslip">
            <style jsx global>{`
                @media print {
                    @page { size: A4; margin: 0; }
                    body * { visibility: hidden !important; }
                    #payslip-printable, #payslip-printable * { visibility: visible !important; }
                    #payslip-printable { position: absolute !important; left: 0; top: 0; width: 210mm !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div className="no-print mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Generate Payslip"
                    sub="Select an employee and pay period. Payroll must be processed for that month first."
                />

                <Panel label="Payslip parameters" className="mb-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        <div className="lg:col-span-6"><EmployeePicker selected={emp} onSelect={setEmp} /></div>
                        <div className="lg:col-span-2">
                            <Field label="Month">
                                <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </Select>
                            </Field>
                        </div>
                        <div className="lg:col-span-2">
                            <Field label="Year">
                                <Select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
                                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                                </Select>
                            </Field>
                        </div>
                        <div className="flex items-end lg:col-span-2">
                            <Button tone="primary" onClick={handleGenerate} disabled={loading || !emp} className="w-full">
                                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : <><FileText className="w-4 h-4" /> Generate</>}
                            </Button>
                        </div>
                    </div>

                    {error?.code === "PAYROLL_NOT_RUN" ? (
                        <div className="mt-4 flex items-start gap-3 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] p-4">
                            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--state-rework-ink)]" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-[var(--state-rework-ink)]">Payroll not yet processed</p>
                                <p className="mt-0.5 text-sm text-ink-muted">{error.message}</p>
                                <Link href="/hr/dashboard/payroll" className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                    Go to Payroll <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    ) : error && (
                        <div className="mt-4">
                            <InlineError message={error.message} />
                        </div>
                    )}
                </Panel>

                {payslip && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Chip tone={payslip.status === "paid" ? "positive" : "risk"}>
                                <CheckCircle2 className="w-3.5 h-3.5" /> {payslip.status === "paid" ? "Paid" : "Processed"}
                            </Chip>
                            <span className="text-xs text-ink-faint">{payslip.employee.name} · {payslip.period.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button tone="secondary" onClick={handlePrint}>
                                <Printer className="w-4 h-4" /> Print
                            </Button>
                            <Button tone="primary" onClick={handleDownload} disabled={saving}>
                                {saving
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Download className="w-4 h-4" />}
                                {saving ? "Building…" : "Download PDF"}
                            </Button>
                        </div>
                    </div>
                )}

                {!payslip && !loading && !error && (
                    <Panel label="No payslip loaded">
                        <EmptyState
                            title="No payslip loaded"
                            body="Pick an employee and period, then click Generate."
                        />
                    </Panel>
                )}
            </div>

            {payslip && (
                <div className="scroll-slim flex justify-center overflow-x-auto px-4 py-6" style={{ background: "var(--surface-sunken)" }}>
                    <div style={{ boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
                        <PayslipTemplate data={payslip} />
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}