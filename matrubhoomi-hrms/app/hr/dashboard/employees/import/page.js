"use client";

import { useState, useRef, useCallback } from "react";
import {
    Download, Upload, CheckCircle, XCircle, AlertTriangle,
    FileSpreadsheet, ArrowRight, X, Loader2, Users, Info,
} from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import {
    Button, Chip, PanelHead, EmptyState, InlineError,
} from "@/components/ceo/ui/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ── Small helpers ─────────────────────────────────────────────────────────────
const fmt = (n) =>
    typeof n === "number" ? `₹${n.toLocaleString("en-IN")}` : "–";

const StatusPill = ({ ok, label }) => (
    <Chip tone={ok ? "positive" : "overdue"}>
        {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {label}
    </Chip>
);

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Download Template", "Fill & Upload", "Review", "Confirm Import"];

function StepBar({ current }) {
    return (
        <div className="mb-8 flex items-center gap-0">
            {STEPS.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <div key={i} className="flex flex-1 items-center last:flex-none">
                        <div className="flex flex-col items-center">
                            <div
                                data-figure
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors duration-[180ms] ${done
                                    ? "bg-ink text-[var(--body-bg)]"
                                    : active
                                        ? "bg-[var(--control-active)] text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                                        : "bg-[var(--control)] text-ink-faint"
                                    }`}
                            >
                                {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                            </div>
                            <span
                                className={`mt-1 text-[11px] font-medium whitespace-nowrap ${active || done ? "text-ink" : "text-ink-faint"
                                    }`}
                            >
                                {label}
                            </span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div
                                className={`mx-1 mb-5 h-[2px] flex-1 rounded-full transition-colors ${done ? "bg-ink/70" : "bg-[var(--control-active)]"
                                    }`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Preview table ─────────────────────────────────────────────────────────────
function PreviewTable({ rows }) {
    const [showAll, setShowAll] = useState(false);
    const display = showAll ? rows : rows.slice(0, 10);

    const NUMERIC = new Set(["Row", "Gross", "Basic", "EPF", "ESIC", "Net Salary"]);

    return (
        <div>
            <div className="scroll-slim overflow-x-auto rounded-inset border border-hairline">
                <table className="w-full">
                    <thead>
                        <tr>
                            {["Row", "Employee Name", "Biometric ID", "Department",
                                "Designation", "Gross", "Basic", "EPF", "ESIC", "Net Salary",
                                "Status"].map((h) => (
                                    <th
                                        key={h}
                                        className={`border-b border-hairline px-3 py-2.5 text-[11px] font-medium tracking-[0.09em] whitespace-nowrap text-ink-faint uppercase ${NUMERIC.has(h) ? "text-right" : "text-left"
                                            }`}
                                    >
                                        {h}
                                    </th>
                                ))}
                        </tr>
                    </thead>
                    <tbody>
                        {display.map((row, idx) => {
                            const hasError = row._errors && row._errors.length > 0;
                            const s = row.salary || {};
                            return (
                                <tr
                                    key={idx}
                                    className={
                                        hasError
                                            ? "bg-[color-mix(in_srgb,var(--state-overdue)_12%,transparent)]"
                                            : "transition-colors hover:bg-[var(--row-hover)]"
                                    }
                                >
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink-faint">{row._excelRow}</td>
                                    <td className="border-b border-hairline px-3 py-2.5 text-xs font-medium text-ink">
                                        {[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}
                                    </td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-xs text-ink">{row.biometricId || "—"}</td>
                                    <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink">{row.department || "—"}</td>
                                    <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink">{row.designation || "—"}</td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink">{fmt(s.gross)}</td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink">{fmt(s.basic)}</td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink">{fmt(s.epf)}</td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink">{fmt(s.eeesic)}</td>
                                    <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-xs font-medium text-[var(--state-positive-ink)]">{fmt(s.netSalary)}</td>
                                    <td className="border-b border-hairline px-3 py-2.5">
                                        {hasError ? (
                                            <div className="flex flex-col items-start gap-1">
                                                <StatusPill ok={false} label="Error" />
                                                {row._errors.map((e, ei) => (
                                                    <span key={ei} className="text-[10px] text-[var(--state-overdue-ink)]">{e}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <StatusPill ok label="Ready" />
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {rows.length > 10 && (
                <Button
                    tone="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setShowAll(!showAll)}
                >
                    {showAll ? "Show less" : <>Show all <span data-figure>{rows.length}</span> rows</>}
                </Button>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EmployeeBulkImport({ onClose, onImportComplete }) {
    const [step, setStep] = useState(0);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);   // { total, valid, invalid, rows, errors }
    const [result, setResult] = useState(null);   // { created, failed, errors }
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef(null);

    // ── Download template ───────────────────────────────────────────────────────
    //
    // `cache: "no-store"` matters here. This URL has no query string, so a
    // browser that cached the old zero-byte response would keep handing out
    // that broken file no matter how many times the server was fixed — Excel
    // reporting "the file format or file extension is not valid" every time.
    //
    // A JSON error body is also never saved as .xlsx: doing that hides the
    // server's explanation inside a file nobody can open.
    const downloadTemplate = async () => {
        try {
            setError("");

            const res = await fetch(`${API_URL}/api/employees/import-export/template`, {
                credentials: "include",
                cache: "no-store",
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.message || `Could not download template (HTTP ${res.status}).`);
            }

            const blob = await res.blob();

            if (blob.size === 0) {
                throw new Error("The server returned an empty template file.");
            }
            if ((blob.type || "").includes("json")) {
                const text = await blob.text().catch(() => "");
                let message = "The server returned an error instead of a file.";
                try { message = JSON.parse(text).message || message; } catch { /* keep default */ }
                throw new Error(message);
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "employee_import_template.xlsx";
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Deferred: revoking in the same tick can abort the save mid-write.
            setTimeout(() => URL.revokeObjectURL(url), 10_000);

            setStep(1);
        } catch (err) {
            setError(err.message);
        }
    };

    // ── File selection ──────────────────────────────────────────────────────────
    const handleFile = (f) => {
        if (!f) return;
        if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
            setError("Only .xlsx, .xls or .csv files are supported.");
            return;
        }
        setFile(f);
        setError("");
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files[0]);
    }, []);

    // ── Upload & preview ────────────────────────────────────────────────────────
    const uploadForPreview = async () => {
        if (!file) return;
        setLoading(true);
        setError("");
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(`${API_URL}/api/employees/import-export/import/preview`, {
                method: "POST",
                credentials: "include",
                body: fd,
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || "Preview failed.");
            setPreview(data.data);
            setStep(2);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Confirm import ──────────────────────────────────────────────────────────
    const confirmImport = async () => {
        if (!preview) return;
        const validRows = preview.rows.filter(r => !r._errors || r._errors.length === 0);
        if (validRows.length === 0) {
            setError("No valid rows to import.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_URL}/api/employees/import-export/import/confirm`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: validRows }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || "Import failed.");
            setResult(data.data);
            setStep(3);
            if (onImportComplete) onImportComplete();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
            <div className="frost-bar flex max-h-full min-h-0 w-full max-w-5xl flex-col rounded-panel border border-hairline">

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inset bg-[var(--control)]">
                            <FileSpreadsheet className="h-5 w-5 text-ink-muted" />
                        </div>
                        <PanelHead
                            className="mb-0 min-w-0"
                            title="Bulk Employee Import"
                            sub="Upload filled Excel template to add multiple employees at once"
                        />
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-6">
                    <StepBar current={step} />

                    {/* Error banner */}
                    {error && (
                        <div className="mb-4">
                            <InlineError message={error} />
                        </div>
                    )}

                    {/* ── STEP 0: Download ─────────────────────────────────────────── */}
                    {step === 0 && (
                        <div className="flex flex-col items-center gap-6 py-6 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)]">
                                <FileSpreadsheet className="h-10 w-10 text-[var(--state-positive-ink)]" />
                            </div>
                            <div>
                                <h3 className="mb-2 text-[17px] font-medium tracking-[-0.02em] text-ink">Step 1: Download the Template</h3>
                                <p className="max-w-md text-sm text-ink-muted">
                                    Download the official HR import template. Fill in employee details
                                    and enter only the Gross Salary — all other salary columns calculate automatically.
                                </p>
                            </div>
                            {/* Template info cards */}
                            <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    { label: "Basic Details", color: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] text-[var(--state-risk-ink)]", count: "12 fields" },
                                    { label: "Employment", color: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]", count: "9 fields" },
                                    { label: "Salary (auto-calc)", color: "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]", count: "7 fields" },
                                    { label: "Statutory IDs", color: "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]", count: "4 fields" },
                                ].map(({ label, color, count }) => (
                                    <div key={label} className={`rounded-inset p-3 ${color}`}>
                                        <p className="text-xs font-medium">{label}</p>
                                        <p className="mt-0.5 text-[11px] opacity-75" data-figure>{count}</p>
                                    </div>
                                ))}
                            </div>
                            <Button tone="primary" onClick={downloadTemplate}>
                                <Download className="h-4 w-4" />
                                Download Template
                            </Button>
                            <Button tone="ghost" size="sm" onClick={() => setStep(1)}>
                                I already have the template →
                            </Button>
                        </div>
                    )}

                    {/* ── STEP 1: Upload ───────────────────────────────────────────── */}
                    {step === 1 && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <h3 className="mb-1 text-[17px] font-medium tracking-[-0.02em] text-ink">Step 2: Upload Filled Template</h3>
                                <p className="text-sm text-ink-muted">
                                    Fill in the downloaded template and upload it here. Required fields are marked with *.
                                </p>
                            </div>

                            {/* Info note */}
                            <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-extension)_16%,transparent)] p-3 text-xs text-[var(--state-extension-ink)]">
                                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                <span>
                                    Only enter <strong>Gross Salary</strong>. Basic, HRA, EPF, ESIC, Net Salary and CTC
                                    are auto-calculated by the system during import using your Salary Config settings.
                                    Profile photos and document scans must be uploaded individually via each employee's profile.
                                </span>
                            </div>

                            {/* Drop zone */}
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                onClick={() => fileRef.current?.click()}
                                className={`relative flex cursor-pointer flex-col items-center rounded-card border-2 border-dashed p-10 transition-colors duration-[180ms] ${dragging
                                    ? "border-ink bg-[var(--control-active)]"
                                    : file
                                        ? "border-[var(--state-positive)] bg-[color-mix(in_srgb,var(--state-positive)_14%,transparent)]"
                                        : "border-hairline bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                                    }`}
                            >
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="hidden"
                                    onChange={(e) => handleFile(e.target.files[0])}
                                />
                                {file ? (
                                    <>
                                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--state-positive)_22%,transparent)]">
                                            <CheckCircle className="h-7 w-7 text-[var(--state-positive-ink)]" />
                                        </div>
                                        <p className="text-sm font-medium text-[var(--state-positive-ink)]">{file.name}</p>
                                        <p className="mt-1 text-xs text-ink-muted">
                                            <span data-figure>{(file.size / 1024).toFixed(1)} KB</span> · Click to change file
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-card bg-[var(--control)]">
                                            <Upload className="h-7 w-7 text-ink-muted" />
                                        </div>
                                        <p className="text-sm font-medium text-ink">Drop your Excel file here</p>
                                        <p className="mt-1 text-xs text-ink-faint">or click to browse · .xlsx / .xls only</p>
                                    </>
                                )}
                            </div>

                            {file && (
                                <RoleGate min="editor">
                                    <Button tone="primary" onClick={uploadForPreview} disabled={loading}>
                                        {loading ? (
                                            <><Loader2 className="h-4 w-4 animate-spin" /> Parsing file…</>
                                        ) : (
                                            <><ArrowRight className="h-4 w-4" /> Preview Import</>
                                        )}
                                    </Button>
                                </RoleGate>
                            )}
                        </div>
                    )}

                    {/* ── STEP 2: Review ──────────────────────────────────────────── */}
                    {step === 2 && preview && (
                        <div className="flex flex-col gap-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="mb-1 text-[17px] font-medium tracking-[-0.02em] text-ink">Step 3: Review Before Importing</h3>
                                    <p className="text-sm text-ink-muted">
                                        Check the parsed data below. Only rows without errors will be imported.
                                    </p>
                                </div>
                                {/* Summary chips */}
                                <div className="flex flex-shrink-0 flex-wrap gap-2">
                                    <Chip tone="neutral">
                                        <Users className="h-3.5 w-3.5" /> <span data-figure>{preview.total}</span> total
                                    </Chip>
                                    {preview.willCreate > 0 && (
                                        <Chip tone="positive">
                                            <CheckCircle className="h-3.5 w-3.5" /> <span data-figure>{preview.willCreate}</span> new
                                        </Chip>
                                    )}
                                    {preview.willUpdate > 0 && (
                                        <Chip tone="risk">
                                            <Users className="h-3.5 w-3.5" /> <span data-figure>{preview.willUpdate}</span> to update
                                        </Chip>
                                    )}
                                    {preview.unchanged > 0 && (
                                        <Chip tone="neutral">
                                            <span data-figure>{preview.unchanged}</span> unchanged
                                        </Chip>
                                    )}
                                    {preview.invalid > 0 && (
                                        <Chip tone="overdue">
                                            <XCircle className="h-3.5 w-3.5" /> <span data-figure>{preview.invalid}</span> errors
                                        </Chip>
                                    )}
                                </div>
                            </div>

                            {/* Error summary */}
                            {preview.errors && preview.errors.length > 0 && (
                                <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] p-3">
                                    <p className="mb-1.5 text-xs font-medium text-[var(--state-overdue-ink)]">
                                        Rows with errors (will be skipped):
                                    </p>
                                    <div className="scroll-slim flex max-h-24 flex-col gap-1 overflow-y-auto">
                                        {preview.errors.map((e, i) => (
                                            <p key={i} className="text-xs text-[var(--state-overdue-ink)]">
                                                Row <span data-figure>{e.row}</span>: {Array.isArray(e.errors) ? e.errors.join(", ") : e.errors}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* What an update run will actually do — worth stating
                                before the user commits, not after. */}
                            {preview.upsertNote && (preview.willUpdate > 0 || preview.unchanged > 0) && (
                                <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                    <span>{preview.upsertNote}</span>
                                </div>
                            )}

                            {/* Doc upload note */}
                            <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                <span>{preview.docUploadNote}</span>
                            </div>

                            {/* Preview table */}
                            <PreviewTable rows={preview.rows} />
                        </div>
                    )}

                    {/* ── STEP 3: Done ────────────────────────────────────────────── */}
                    {step === 3 && result && (
                        <div className="flex flex-col items-center gap-5 py-8 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-positive)_22%,transparent)]">
                                <CheckCircle className="h-10 w-10 text-[var(--state-positive-ink)]" />
                            </div>
                            <EmptyState
                                compact
                                title="Import Complete"
                                body="New employees were added, and rows matching someone already on record updated them instead of creating a duplicate."
                            />
                            <div className="flex flex-wrap justify-center gap-4">
                                <div className="rounded-card bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-6 py-4 text-center">
                                    <p data-figure className="text-[28px] leading-none tracking-[-0.025em] text-[var(--state-positive-ink)]">{result.created}</p>
                                    <p className="mt-1.5 text-xs text-ink-muted">Employees Created</p>
                                </div>
                                {result.updated > 0 && (
                                    <div className="rounded-card bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-6 py-4 text-center">
                                        <p data-figure className="text-[28px] leading-none tracking-[-0.025em] text-[var(--state-risk-ink)]">{result.updated}</p>
                                        <p className="mt-1.5 text-xs text-ink-muted">Employees Updated</p>
                                    </div>
                                )}
                                {result.unchanged > 0 && (
                                    <div className="rounded-card bg-[var(--control)] px-6 py-4 text-center">
                                        <p data-figure className="text-[28px] leading-none tracking-[-0.025em] text-ink">{result.unchanged}</p>
                                        <p className="mt-1.5 text-xs text-ink-muted">Already Up To Date</p>
                                    </div>
                                )}
                                {result.failed > 0 && (
                                    <div className="rounded-card bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-6 py-4 text-center">
                                        <p data-figure className="text-[28px] leading-none tracking-[-0.025em] text-[var(--state-overdue-ink)]">{result.failed}</p>
                                        <p className="mt-1.5 text-xs text-ink-muted">Failed</p>
                                    </div>
                                )}
                            </div>

                            {/* Exactly which fields changed on whom — the point of an
                                update run is being able to check it did what you meant. */}
                            {result.updatedDetails?.length > 0 && (
                                <div className="scroll-slim max-h-40 w-full overflow-y-auto rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_14%,transparent)] p-3 text-left">
                                    <p className="mb-1 text-xs font-medium text-[var(--state-risk-ink)]">Updated fields</p>
                                    {result.updatedDetails.map((u, i) => (
                                        <p key={i} className="text-xs text-[var(--state-risk-ink)]">
                                            {u.name || u.biometricId}
                                            {u.biometricId ? ` (${u.biometricId})` : ""}:{" "}
                                            {u.fields.join(", ")}
                                        </p>
                                    ))}
                                </div>
                            )}
                            {result.failed > 0 && result.errors && (
                                <div className="scroll-slim max-h-32 w-full overflow-y-auto rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_14%,transparent)] p-3 text-left">
                                    {result.errors.map((e, i) => (
                                        <p key={i} className="text-xs text-[var(--state-overdue-ink)]">
                                            Row <span data-figure>{e.row}</span>{e.biometricId ? ` (${e.biometricId})` : ""}: {Array.isArray(e.errors) ? e.errors.join(", ") : e.errors}
                                        </p>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-ink-faint">
                                Visit each employee's profile to upload photos and document scans.
                            </p>
                            {onClose && (
                                <Button tone="primary" onClick={onClose}>
                                    Done
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                {(step === 1 || step === 2) && (
                    <div className="flex shrink-0 items-center justify-between border-t border-hairline px-5 py-4">
                        <Button
                            tone="ghost"
                            onClick={() => { setStep(s => s - 1); setError(""); }}
                        >
                            ← Back
                        </Button>
                        {step === 2 && preview && preview.valid > 0 && (
                            <RoleGate min="editor">
                                <Button tone="primary" onClick={confirmImport} disabled={loading}>
                                    {loading ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                                    ) : (
                                        <><CheckCircle className="h-4 w-4" /> Import <span data-figure>{preview.valid}</span> Employee{preview.valid !== 1 ? "s" : ""}</>
                                    )}
                                </Button>
                            </RoleGate>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
