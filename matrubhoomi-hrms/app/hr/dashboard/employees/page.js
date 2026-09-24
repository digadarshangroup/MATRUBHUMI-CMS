"use client";

// app/hr/dashboard/employees/page.js
//
// The employees register, rebuilt onto the Matrubhoomi unified sheet.
//
// The look is the dashboard's: one full-bleed surface, a greeting/action bar, a
// KPI strip and every region below it divided by a hairline rather than boxed
// again. Emerald is the only accent; the old purple, the coloured stat squares
// and the blue info banner are gone. Department dots and avatars keep a stable
// per-name identification hue — the one place a colour other than emerald
// carries meaning — exactly as on the dashboard.
//
// NOTHING about the data changed. Every endpoint, query param, handler and
// piece of state is carried over verbatim; this is a reskin of the surface, not
// a change to what it does.

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import SearchableSelect from "@/components/hr/SearchableSelect";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Segmented,
  Input,
  Select,
  StatStrip,
  EmptyState,
  InlineError,
  SkeletonRows,
  PageHead,
  Meter,
  Ring,
} from "@/components/ceo/ui/Primitives";
import {
  Search, Plus, Eye, Trash2, ChevronLeft, ChevronRight, ChevronDown, Loader2, Users, X,
  UserCheck, UserX, Building2, Upload, Download, FileSpreadsheet, CheckCircle,
  AlertCircle, Check, AlertTriangle, Sparkles, Info, ArrowRight, XCircle,
  Paperclip, History, Edit3, ArrowUpDown, GraduationCap,
} from "lucide-react";

/**
 * Fetch a generated workbook and save it. (Unchanged — see the notes below for
 * the three bugs this consolidation fixed.)
 *
 *   - No cache bypass on the template URL served a stale zero-byte response.
 *   - A JSON error body saved as .xlsx became an unopenable file hiding its own
 *     error message.
 *   - Synchronous revokeObjectURL() could abort the download mid-write.
 *
 * @throws Error carrying the server's message, so callers can surface it.
 */
async function downloadWorkbook(url, filename) {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Download failed (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error("The server returned an empty file. Nothing was downloaded.");
  }
  if ((blob.type || "").includes("json")) {
    const body = await blob.text().catch(() => "");
    let message = "The server returned an error instead of a file.";
    try { message = JSON.parse(body).message || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

// ── Identification hue per name (dots + avatars), stable across renders ──────
const hueFor = (name = "") =>
  name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

const fmt = (n) =>
  typeof n === "number" && n > 0
    ? `₹${n.toLocaleString("en-IN")}`
    : n > 0
      ? `₹${n}`
      : "—";

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, photoUrl }) {
  const [err, setErr] = useState(false);
  const initials = (name || "?")
    .split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (!err && photoUrl) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-[var(--control)]">
        <img
          src={photoUrl}
          alt={name}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      data-avatar-hue={hueFor(name)}
      className="matrubhoomi-avatar h-9 w-9 shrink-0 text-[11px] font-medium"
    >
      {initials}
    </span>
  );
}

// ── Delete confirmation ────────────────────────────────────────────────────────
function DeleteModal({ employee, onConfirm, onCancel, deleting }) {
  const name = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onCancel}
    >
      <div
        className="frost-bar flex max-h-full w-full min-h-0 max-w-[420px] flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]">
            <Trash2 size={20} />
          </span>
          <h3 className="mt-3 text-[17px] font-medium tracking-[-0.02em] text-ink">
            Delete employee
          </h3>
          <p className="mx-auto mt-1.5 max-w-[40ch] text-sm text-ink-muted">
            Delete <strong className="text-ink">{name}</strong>? This can&rsquo;t be undone.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={onCancel} disabled={deleting} className="flex-1">
              Cancel
            </Button>
            <Button
              tone="destructive"
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import wizard ──────────────────────────────────────────────────────────────
const STEPS = ["Download", "Upload", "Review", "Done"];

function StepBar({ current }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex flex-1 items-center gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <span
                data-figure
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-medium ${
                  done || active
                    ? "bg-ink text-[var(--body-bg)]"
                    : "bg-[var(--control)] text-ink-faint"
                }`}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span
                className={`hidden text-xs sm:inline ${
                  active ? "font-medium text-ink" : "text-ink-faint"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`h-px flex-1 ${done ? "bg-ink/40" : "bg-hairline"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewTable({ rows }) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? rows : rows.slice(0, 8);
  return (
    <div>
      <div className="scroll-slim overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["#", "Employee name", "Biometric ID", "Dept", "Designation", "Gross", "Net salary", "Status"].map((h) => (
                <th
                  key={h}
                  className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, idx) => {
              const hasError = row._errors?.length > 0;
              const s = row.salary || {};
              const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || "—";
              return (
                <tr
                  key={idx}
                  className={
                    hasError
                      ? "bg-[color-mix(in_srgb,var(--state-overdue)_12%,transparent)]"
                      : ""
                  }
                >
                  <td data-figure className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
                    {row._employeeNum}
                  </td>
                  <td className="border-b border-hairline px-3 py-2.5">
                    <div className="text-sm font-medium text-ink">{name}</div>
                    {row._extraFields?.length > 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-ink-faint">
                        <Sparkles size={10} />
                        +<span data-figure>{row._extraFields.length}</span> extra field{row._extraFields.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </td>
                  <td data-figure className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
                    {row.biometricId || "—"}
                  </td>
                  <td className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
                    {row.department || "—"}
                  </td>
                  <td className="border-b border-hairline px-3 py-2.5 text-sm text-ink-muted">
                    {row.designation || "—"}
                  </td>
                  <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink-muted">
                    {fmt(s.gross)}
                  </td>
                  <td data-figure className="border-b border-hairline px-3 py-2.5 text-right text-sm font-medium text-ink">
                    {fmt(s.netSalary)}
                  </td>
                  <td className="border-b border-hairline px-3 py-2.5">
                    {hasError ? (
                      <div>
                        <Chip tone="overdue"><XCircle size={10} /> Error</Chip>
                        <div className="mt-1 space-y-0.5 text-[11px] text-[var(--state-overdue-ink)]">
                          {row._errors.map((e, ei) => <div key={ei}>{e}</div>)}
                        </div>
                      </div>
                    ) : (
                      <Chip tone="positive"><CheckCircle size={10} /> Ready</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <Button tone="ghost" size="sm" className="mt-2" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show less" : `Show all ${rows.length} employees`}
        </Button>
      )}
    </div>
  );
}

function EmployeeBulkImport({ onClose, onImportComplete, API_URL }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const downloadTemplate = async () => {
    try {
      setError("");
      await downloadWorkbook(
        `${API_URL}/api/employees/import-export/template`,
        "employee_import_template.xlsx",
      );
      setStep(1);
    } catch (err) { setError(err.message); }
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError("Only .xlsx or .xls files are supported.");
      return;
    }
    setFile(f);
    setError("");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const uploadForPreview = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/api/employees/import-export/import/preview`, {
        method: "POST", credentials: "include", body: fd,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Preview failed.");
      setPreview(data.data);
      setStep(2);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const confirmImport = async () => {
    if (!preview) return;
    const validRows = preview.rows.filter((r) => !r._errors?.length);
    if (!validRows.length) { setError("No valid employees to import."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/employees/import-export/import/confirm`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Import failed.");
      setResult(data.data);
      setStep(3);
      if (onImportComplete) onImportComplete();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="frost-bar flex max-h-full w-full min-h-0 max-w-[900px] flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
              <FileSpreadsheet size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">Bulk employee import</h2>
              <p className="truncate text-xs text-ink-faint">Upload a filled template to add many employees at once</p>
            </div>
          </div>
          <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <StepBar current={step} />

          {error && (
            <div className="mb-4"><InlineError message={error} /></div>
          )}

          {step === 0 && (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--control)] text-ink-muted"><FileSpreadsheet size={30} /></span>
              <div>
                <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Download the template</h3>
                <p className="mx-auto mt-1.5 max-w-[60ch] text-sm text-ink-muted">
                  Fill employee details in the official template. Enter only Gross Salary —
                  Basic, HRA, EPF, ESIC, Net Salary and CTC all auto-calculate. You can add
                  extra columns like <strong>Title</strong> or <strong>Religion</strong> and
                  they&rsquo;ll be imported automatically.
                </p>
              </div>
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                {[["Basic details", "12 fields"], ["Employment + bank", "13 fields"], ["Salary + statutory", "10 fields"]].map(
                  ([label, count]) => (
                    <div key={label} className="rounded-inset border border-hairline bg-[var(--surface-sunken)] px-3.5 py-3">
                      <p className="text-sm font-medium text-ink">{label}</p>
                      <p data-figure className="text-xs text-ink-faint">{count}</p>
                    </div>
                  ),
                )}
              </div>
              <div className="flex w-full items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-3.5 py-2.5 text-left text-sm text-[var(--state-risk-ink)]">
                <Sparkles size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong>Extra columns supported.</strong> Add columns like <em>Title</em>,{" "}
                  <em>Religion</em>, <em>Spouse Name</em> or <em>Confirmation Date</em> and the
                  system detects and fills those fields on import.
                </span>
              </div>
              <Button tone="primary" onClick={downloadTemplate}>
                <Download size={15} /> Download template
              </Button>
              <Button tone="ghost" size="sm" onClick={() => setStep(1)}>
                I already have the template →
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[15px] font-medium text-ink">Upload filled template</h3>
                <p className="mt-1 text-sm text-ink-muted">Fill in the template and upload it here. Required fields are marked *.</p>
              </div>
              <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-extension-ink)]">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>Enter <strong>Gross Salary</strong> as a plain number (e.g. <code>28000</code> — no ₹, no commas). Other salary fields calculate automatically.</span>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed px-5 py-10 text-center transition-colors ${
                  dragging || file
                    ? "border-ink/40 bg-[var(--control)]"
                    : "border-hairline bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                }`}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])} />
                {file ? (
                  <>
                    <CheckCircle size={34} className="text-[var(--state-positive-ink)]" />
                    <p className="text-sm font-medium text-ink">{file.name}</p>
                    <p data-figure className="text-xs text-ink-faint">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload size={34} className="text-ink-faint" />
                    <p className="text-sm font-medium text-ink">Drop Excel file here</p>
                    <p className="text-xs text-ink-faint">or click to browse · .xlsx / .xls</p>
                  </>
                )}
              </div>
              {file && (
                <Button tone="primary" onClick={uploadForPreview} disabled={loading} className="self-start">
                  {loading ? <><Loader2 size={15} className="animate-spin" /> Parsing…</> : <><ArrowRight size={15} /> Preview import</>}
                </Button>
              )}
            </div>
          )}

          {step === 2 && preview && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-medium text-ink">Review before importing</h3>
                  <p className="mt-1 text-sm text-ink-muted">Only rows without errors will be imported.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip><Users size={11} /> <span data-figure>{preview.total}</span> total</Chip>
                  <Chip tone="positive"><CheckCircle size={11} /> <span data-figure>{preview.valid}</span> valid</Chip>
                  {preview.invalid > 0 && (
                    <Chip tone="overdue"><XCircle size={11} /> <span data-figure>{preview.invalid}</span> errors</Chip>
                  )}
                </div>
              </div>
              {preview.extraDetected?.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-risk-ink)]">
                  <Sparkles size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <strong><span data-figure>{preview.extraDetected.length}</span> extra column{preview.extraDetected.length > 1 ? "s" : ""} detected and mapped:</strong>{" "}
                    {preview.extraDetected.map((e) => (
                      <span key={e.column} className="mr-1.5 inline-flex items-center rounded-full bg-[var(--control)] px-2 py-0.5 text-[11px] text-ink-muted">{e.column} → <em>{e.schemaField}</em></span>
                    ))}
                  </span>
                </div>
              )}
              {preview.errors?.length > 0 && (
                <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-overdue-ink)]">
                  <p className="font-medium">Rows with errors (will be skipped):</p>
                  <div className="scroll-slim mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {preview.errors.map((e, i) => (
                      <p key={i}>Employee #<span data-figure>{e.employeeNum}</span>: {Array.isArray(e.errors) ? e.errors.join(", ") : e.errors}</p>
                    ))}
                  </div>
                </div>
              )}
              {preview.docUploadNote && (
                <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-risk-ink)]"><Info size={14} className="mt-0.5 shrink-0" /><span>{preview.docUploadNote}</span></div>
              )}
              <PreviewTable rows={preview.rows} />
            </div>
          )}

          {step === 3 && result && (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]"><CheckCircle size={30} /></span>
              <div>
                <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">Import complete</h3>
                <p className="mt-1.5 text-sm text-ink-muted">Employees have been added to the system.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] px-6 py-4">
                  <p data-figure className="text-[26px] leading-none tracking-[-0.03em] text-[var(--state-positive-ink)]">{result.created}</p>
                  <p className="mt-1 text-xs text-ink-faint">Created</p>
                </div>
                {result.failed > 0 && (
                  <div className="rounded-inset border border-hairline bg-[var(--surface-sunken)] px-6 py-4">
                    <p data-figure className="text-[26px] leading-none tracking-[-0.03em] text-[var(--state-overdue-ink)]">{result.failed}</p>
                    <p className="mt-1 text-xs text-ink-faint">Failed</p>
                  </div>
                )}
              </div>
              {result.failed > 0 && result.errors?.length > 0 && (
                <div className="w-full rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3.5 py-2.5 text-left text-sm text-[var(--state-overdue-ink)]">
                  <div className="scroll-slim max-h-40 space-y-0.5 overflow-y-auto text-xs">
                    {result.errors.map((e, i) => (
                      <p key={i}>Employee #<span data-figure>{e.employeeNum}</span>{e.biometricId ? ` (${e.biometricId})` : ""}: {Array.isArray(e.errors) ? e.errors.join(", ") : e.errors}</p>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-faint">Visit each employee&rsquo;s profile to upload photos and document scans.</p>
            </div>
          )}
        </div>

        {(step === 1 || step === 2) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
            <Button tone="ghost" size="sm" onClick={() => { setStep((s) => s - 1); setError(""); }}>← Back</Button>
            {step === 2 && preview?.valid > 0 && (
              <Button tone="primary" size="sm" onClick={confirmImport} disabled={loading}>
                {loading ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><CheckCircle size={14} /> Import {preview.valid} employee{preview.valid !== 1 ? "s" : ""}</>}
              </Button>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="flex shrink-0 items-center justify-center border-t border-hairline px-5 py-3.5">
            <Button tone="primary" size="sm" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
// Defined at module scope, NOT inside BulkEditModal — a component declared
// inside a render body is a new type on every keystroke, so React unmounts and
// remounts it and the input loses focus after each character.
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

// ── Bulk edit ─────────────────────────────────────────────────────────────────
// The same field vocabulary as the employee form, grouped under the same
// section titles. Every field starts as "no change"; only the fields the user
// fills are sent, and each sent value OVERWRITES that field on every selected
// employee. Per-person identity fields (names, email, phone, biometric ID,
// account number, document numbers, files) are deliberately absent — writing
// one value onto many people would corrupt identity data, and the backend
// refuses them anyway.
function BulkEditModal({ API_URL, ids, departments, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [allEmps, setAllEmps] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [f, setF] = useState({
    // Work details
    departmentId: "", designation: "", jobTitle: "", employmentType: "",
    workLocation: "", workPhone: "", dateOfJoining: "", confirmationDate: "",
    // The one Shift field — what attendance judges these people against.
    // The free-text `shift` label is derived from it on save.
    workShiftMode: "", workShiftStart: "", workShiftEnd: "", workShiftPunches: "",
    probationPeriod: "", needsToOperate: "", status: "",
    primaryManagerId: "", secondaryManagerId: "",
    // Personal
    gender: "", bloodGroup: "", maritalStatus: "", nationality: "",
    religion: "", dateOfBirth: "",
    // Salary & bank
    gross: "", bankName: "", accountType: "", branchName: "",
    // Address
    curStreet: "", curCity: "", curState: "", curPincode: "", curCountry: "",
    permStreet: "", permCity: "", permState: "", permPincode: "", permCountry: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(
          `${API_URL}/api/employees/all?page=1&limit=500&status=active`,
          { credentials: "include" },
        );
        const d = await r.json();
        if (d.success) setAllEmps(d.data?.employees || []);
      } catch (e) { console.error(e); }
      finally { setLoadingEmps(false); }
    })();
  }, [API_URL]);

  const dept = departments.find((d) => d.id === f.departmentId);
  const designationOptions = dept
    ? dept.designations || []
    : [...new Set(departments.flatMap((d) => d.designations || []))];
  const mgrLabel = (e) => {
    const n = `${e.firstName || ""} ${e.lastName || ""}`.trim();
    return e.biometricId ? `${n} (${e.biometricId})` : n;
  };
  // Department + designation ride along as the dim second line so the search
  // box can match on them too ("cutting master" finds every cutting master).
  const mgrOptions = allEmps.map((e) => ({
    value: e._id,
    label: mgrLabel(e),
    sub: [e.designation || e.jobTitle, e.department].filter(Boolean).join(" · "),
  }));

  const buildUpdates = () => {
    const u = {};
    if (f.departmentId && dept) { u.departmentId = f.departmentId; u.department = dept.name; }
    if (f.designation) u.designation = f.designation;
    if (f.jobTitle) u.jobTitle = f.jobTitle;
    if (f.employmentType) u.employmentType = f.employmentType;
    if (f.workLocation) u.workLocation = f.workLocation;
    if (f.workPhone) u.workPhone = f.workPhone;
    // Blank means "no change" everywhere on this form, so an unset dropdown
    // must not overwrite a shift somebody already has.
    if (f.workShiftMode === "custom") {
      u.workShift = {
        mode: "custom",
        start: f.workShiftStart,
        end: f.workShiftEnd,
        punches: Number(f.workShiftPunches) || 2,
      };
      u.shift =
        f.workShiftStart && f.workShiftEnd
          ? `Custom ${f.workShiftStart}\u2013${f.workShiftEnd}`
          : "Custom";
    } else if (f.workShiftMode) {
      u.workShift = { mode: f.workShiftMode };
      // The free-text label is derived, never typed, so it cannot drift away
      // from the shift attendance actually uses.
      u.shift = f.workShiftMode === "core" ? "Core" : "General";
    }
    if (f.dateOfJoining) u.dateOfJoining = f.dateOfJoining;
    if (f.confirmationDate) u.confirmationDate = f.confirmationDate;
    if (f.probationPeriod !== "") u.probationPeriod = Number(f.probationPeriod);
    if (f.needsToOperate !== "") u.needsToOperate = f.needsToOperate === "yes";
    if (f.status) { u.status = f.status; u.isActive = f.status === "active"; }
    if (f.primaryManagerId) {
      const m = allEmps.find((e) => e._id === f.primaryManagerId);
      if (m) u.primaryManager = { managerId: m._id, managerName: mgrLabel(m) };
    }
    if (f.gender) u.gender = f.gender;
    if (f.bloodGroup) u.bloodGroup = f.bloodGroup;
    if (f.maritalStatus) u.maritalStatus = f.maritalStatus;
    if (f.nationality) u.nationality = f.nationality;
    if (f.religion) u.religion = f.religion;
    if (f.dateOfBirth) u.dateOfBirth = f.dateOfBirth;
    if (f.gross !== "") u.salary = { gross: Number(f.gross) };
    const bank = {};
    if (f.bankName) bank.bankName = f.bankName;
    if (f.accountType) bank.accountType = f.accountType;
    if (f.branchName) bank.branchName = f.branchName;
    if (Object.keys(bank).length) u.bankDetails = bank;
    const cur = {};
    if (f.curStreet) cur.street = f.curStreet;
    if (f.curCity) cur.city = f.curCity;
    if (f.curState) cur.state = f.curState;
    if (f.curPincode) cur.pincode = f.curPincode;
    if (f.curCountry) cur.country = f.curCountry;
    const perm = {};
    if (f.permStreet) perm.street = f.permStreet;
    if (f.permCity) perm.city = f.permCity;
    if (f.permState) perm.state = f.permState;
    if (f.permPincode) perm.pincode = f.permPincode;
    if (f.permCountry) perm.country = f.permCountry;
    if (Object.keys(cur).length || Object.keys(perm).length) {
      u.address = {};
      if (Object.keys(cur).length) u.address.current = cur;
      if (Object.keys(perm).length) u.address.permanent = perm;
    }
    return u;
  };

  const changedCount = Object.keys(buildUpdates()).length;

  const save = async () => {
    const updates = buildUpdates();
    if (!Object.keys(updates).length) {
      setError("Fill at least one field — empty fields are left unchanged.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/api/employees/bulk-update`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: ids, updates }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || "Bulk update failed");
      setResult(d.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="frost-bar flex max-h-full w-full min-h-0 max-w-[960px] flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted"><Edit3 size={16} /></span>
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">Bulk edit <span data-figure>{ids.length}</span> employee{ids.length === 1 ? "" : "s"}</h2>
              <p className="truncate text-xs text-ink-faint">Only the fields you fill in are applied — everything else stays as it is.</p>
            </div>
          </div>
          <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>

        {result ? (
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle size={34} className="text-[var(--state-positive-ink)]" />
              <h3 className="mt-3 text-[17px] font-medium tracking-[-0.02em] text-ink">Updated <span data-figure>{result.updated}</span> of <span data-figure>{ids.length}</span> employees</h3>
              {result.failed?.length > 0 && (
                <div className="mt-2.5 w-full text-left">
                  <InlineError
                    message={`${result.failed.length} failed: ${result.failed.slice(0, 5).map((x) => x.reason).join("; ")}`}
                  />
                </div>
              )}
              <Button tone="primary" className="mt-5" onClick={onDone}>Done</Button>
            </div>
          </div>
        ) : (
        <>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <h4 className="mb-3 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Work details</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Department">
              <Select value={f.departmentId} onChange={set("departmentId")}>
                <option value="">No change</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Designation">
              <Select value={f.designation} onChange={set("designation")}>
                <option value="">No change</option>
                {designationOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Job title">
              <Input value={f.jobTitle} onChange={set("jobTitle")} placeholder="No change" />
            </Field>
            <Field label="Employment type">
              <Select value={f.employmentType} onChange={set("employmentType")}>
                <option value="">No change</option>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </Select>
            </Field>
            {/* One reporting manager per employee, and their approval is
                final — there is no second approver to set. */}
            <Field label="Reporting manager">
              <SearchableSelect
                options={mgrOptions}
                value={f.primaryManagerId}
                onChange={(v) => setF((p) => ({ ...p, primaryManagerId: v }))}
                placeholder="No change"
                emptyLabel="No change"
                loading={loadingEmps}
                ariaLabel="Reporting manager"
              />
            </Field>
            <Field label="Work location">
              <Input value={f.workLocation} onChange={set("workLocation")} placeholder="No change" />
            </Field>
            {/* The company-issued number, not the personal one they sign into
                the app with — `phone` is deliberately not bulk-editable. */}
            <Field label="Corporate / job phone">
              <Input value={f.workPhone} onChange={set("workPhone")} placeholder="No change" />
            </Field>
            {/* One Shift field, three categories. The free-text box is gone:
                two things called Shift meant the one HR filled in was not the
                one attendance read. Blank still means "no change" here,
                because this form edits many people at once. */}
            <Field label="Shift">
              <Select value={f.workShiftMode} onChange={set("workShiftMode")}>
                <option value="">No change</option>
                <option value="core">Core — office hours from settings</option>
                <option value="general">General — production hours from settings</option>
                <option value="custom">Custom — set the hours below</option>
              </Select>
            </Field>
            {f.workShiftMode === "custom" && (
              <>
                <Field label="Shift starts">
                  <Input
                    type="time"
                    value={f.workShiftStart}
                    onChange={set("workShiftStart")}
                  />
                </Field>
                <Field label="Shift ends">
                  <Input
                    type="time"
                    value={f.workShiftEnd}
                    onChange={set("workShiftEnd")}
                  />
                </Field>
                {/* 2 = in and out, 4 = with lunch, 6 = with lunch and tea.
                    Blank means 2 — a day short of the expected count is
                    flagged as a miss-punch, so guessing high is the costly
                    way to be wrong. Core and General never ask: they are
                    always 2 and 6. */}
                <Field label="Punches per day">
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    placeholder="2"
                    value={f.workShiftPunches}
                    onChange={set("workShiftPunches")}
                  />
                </Field>
              </>
            )}
            <Field label="Date of joining">
              <Input type="date" value={f.dateOfJoining} onChange={set("dateOfJoining")} />
            </Field>
            <Field label="Confirmation date">
              <Input type="date" value={f.confirmationDate} onChange={set("confirmationDate")} />
            </Field>
            <Field label="Probation period (months)">
              <Input type="number" value={f.probationPeriod} onChange={set("probationPeriod")} placeholder="No change" />
            </Field>
            <Field label="Needs to operate">
              <Select value={f.needsToOperate} onChange={set("needsToOperate")}>
                <option value="">No change</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onChange={set("status")}>
                <option value="">No change</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>

          <h4 className="mt-6 mb-3 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Personal information</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Gender">
              <Select value={f.gender} onChange={set("gender")}>
                <option value="">No change</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field label="Blood group">
              <Select value={f.bloodGroup} onChange={set("bloodGroup")}>
                <option value="">No change</option>
                {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Marital status">
              <Select value={f.maritalStatus} onChange={set("maritalStatus")}>
                <option value="">No change</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </Select>
            </Field>
            <Field label="Nationality">
              <Input value={f.nationality} onChange={set("nationality")} placeholder="No change" />
            </Field>
            <Field label="Religion">
              <Input value={f.religion} onChange={set("religion")} placeholder="No change" />
            </Field>
            <Field label="Date of birth">
              <Input type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} />
            </Field>
          </div>

          <h4 className="mt-6 mb-3 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Salary &amp; bank details</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Gross salary (monthly)">
              <Input type="number" value={f.gross} onChange={set("gross")} placeholder="No change" />
            </Field>
            <Field label="Bank name">
              <Input value={f.bankName} onChange={set("bankName")} placeholder="No change" />
            </Field>
            <Field label="Account type">
              <Select value={f.accountType} onChange={set("accountType")}>
                <option value="">No change</option>
                <option value="Savings">Savings</option>
                <option value="Current">Current</option>
                <option value="Salary">Salary</option>
              </Select>
            </Field>
            <Field label="Branch name">
              <Input value={f.branchName} onChange={set("branchName")} placeholder="No change" />
            </Field>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-faint">
            <Info size={12} /> Basic, HRA, EPF, ESIC and net salary are recalculated automatically from Gross —
            exactly as in the employee form. Account numbers, IDs, names and files can&rsquo;t be bulk-edited.
          </p>

          <h4 className="mt-6 mb-3 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Address</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Current — street"><Input value={f.curStreet} onChange={set("curStreet")} placeholder="No change" /></Field>
            <Field label="Current — city"><Input value={f.curCity} onChange={set("curCity")} placeholder="No change" /></Field>
            <Field label="Current — state"><Input value={f.curState} onChange={set("curState")} placeholder="No change" /></Field>
            <Field label="Current — pincode"><Input value={f.curPincode} onChange={set("curPincode")} placeholder="No change" /></Field>
            <Field label="Current — country"><Input value={f.curCountry} onChange={set("curCountry")} placeholder="No change" /></Field>
            <Field label="Permanent — street"><Input value={f.permStreet} onChange={set("permStreet")} placeholder="No change" /></Field>
            <Field label="Permanent — city"><Input value={f.permCity} onChange={set("permCity")} placeholder="No change" /></Field>
            <Field label="Permanent — state"><Input value={f.permState} onChange={set("permState")} placeholder="No change" /></Field>
            <Field label="Permanent — pincode"><Input value={f.permPincode} onChange={set("permPincode")} placeholder="No change" /></Field>
            <Field label="Permanent — country"><Input value={f.permCountry} onChange={set("permCountry")} placeholder="No change" /></Field>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <span className="text-xs text-ink-faint">
            {error ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--state-overdue-ink)]"><AlertCircle size={13} /> {error}</span>
            ) : (
              `${changedCount} field group${changedCount === 1 ? "" : "s"} will be applied`
            )}
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button tone="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Apply to {ids.length} employee{ids.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const fileRef = useRef();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [deptOpen, setDeptOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [deptStats, setDeptStats] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  // Everyone / staff only / interns only. Separate from the active-inactive
  // segment above rather than folded into it: an intern can be inactive, and
  // collapsing the two would make "inactive" and "intern" mutually exclusive.
  const [peopleFilter, setPeopleFilter] = useState("all");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importError, setImportError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [statusCounts, setStatusCounts] = useState({ active: 0, inactive: 0 });
  const [sortBy, setSortBy] = useState("default");
  // Multi-select for bulk edit. Ids persist across pages so a selection can
  // span more than one page of results.
  const [selected, setSelected] = useState(() => new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const PER_PAGE = 15;

  useEffect(() => { fetchDepts(); }, []);
  useEffect(() => { setPage(1); }, [search, deptFilter, activeTab, sortBy, peopleFilter]);
  useEffect(() => { fetchEmployees(); }, [search, deptFilter, page, activeTab, sortBy, peopleFilter]);
  // Changing tab (active/inactive) invalidates the selection — the selected
  // rows are no longer visible and bulk-editing invisible rows is a trap.
  useEffect(() => { setSelected(new Set()); }, [activeTab]);

  const fetchDepts = async () => {
    try {
      const r = await fetch(`${API_URL}/api/hr/departments/with-designations`, { credentials: "include" });
      const d = await r.json();
      if (d.success) setDepartments(d.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: PER_PAGE });
      if (search) params.set("search", search);
      if (deptFilter !== "all") {
        const storedName =
          deptStats.find((s) => s._id?.toLowerCase() === deptFilter.toLowerCase())?._id ?? deptFilter;
        params.set("department", storedName);
      }
      params.set("status", activeTab);
      if (peopleFilter !== "all") params.set("employmentType", peopleFilter);
      if (sortBy !== "default") params.set("sort", sortBy);
      const r = await fetch(`${API_URL}/api/employees/all?${params}`, { credentials: "include" });
      const d = await r.json();
      if (d.success) {
        setEmployees(Array.isArray(d.data?.employees) ? d.data.employees : []);
        setTotalPages(d.data?.pagination?.totalPages || 1);
        setTotalEmployees(d.data?.pagination?.totalEmployees ?? d.data?.stats?.total ?? 0);
        setDeptStats(d.data?.stats?.departmentStats || []);
      } else {
        setEmployees([]);
      }
    } catch (e) {
      console.error(e);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API_URL}/api/employees/${toDelete._id}`, {
        method: "DELETE", credentials: "include",
      });
      const d = await r.json();
      if (d.success) { setToDelete(null); fetchEmployees(); }
      else alert(d.message || "Failed to delete");
    } catch { alert("Error deleting"); } finally { setDeleting(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      if (deptFilter !== "all") params.set("department", deptFilter);
      if (search) params.set("search", search);
      await downloadWorkbook(
        `${API_URL}/api/employees/import-export/export?${params}`,
        `employee_export_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
    } catch (err) {
      setExportError(err.message);
      setTimeout(() => setExportError(null), 3000);
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) return;
    setParsing(true);
    setImportError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_URL}/api/employees/import-export/import/preview`, {
        method: "POST", credentials: "include", body: fd,
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || "Parse failed");
      setShowImportModal(true);
    } catch (e) {
      setImportError(e.message);
    } finally {
      setParsing(false);
    }
  };

  const getName = (e) => `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Unknown";
  const getPhoto = (e) => e.profilePhoto?.url || (typeof e.profilePhoto === "string" ? e.profilePhoto : null);
  const getMgr = (e) => e.primaryManager?.managerName || "—";
  const getDate = (e) =>
    e.dateOfJoining
      ? new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
  const getBioId = (e) => e.biometricId || e.identityId || "EMP" + e._id?.toString().slice(-4).toUpperCase();
  const hasFilters = search || deptFilter !== "all" || peopleFilter !== "all";

  // ── Multi-select helpers ──
  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const pageIds = employees.map((e) => e._id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelectPage = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => n.delete(id));
      else pageIds.forEach((id) => n.add(id));
      return n;
    });

  const pageNums = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, "...", totalPages];
    if (page >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", page - 1, page, page + 1, "...", totalPages];
  };

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [activeRes, inactiveRes] = await Promise.all([
          fetch(`${API_URL}/api/employees/all?page=1&limit=1&status=active`, { credentials: "include" }),
          fetch(`${API_URL}/api/employees/all?page=1&limit=1&status=inactive`, { credentials: "include" }),
        ]);
        const [activeData, inactiveData] = await Promise.all([activeRes.json(), inactiveRes.json()]);
        setStatusCounts({
          active: activeData.data?.pagination?.totalEmployees ?? 0,
          inactive: inactiveData.data?.pagination?.totalEmployees ?? 0,
        });
      } catch (e) { console.error(e); }
    };
    fetchCounts();
  }, []);

  const kpis = [
    { key: "total", label: "Total employees", value: statusCounts.active + statusCounts.inactive, icon: Users, tone: "ink" },
    { key: "active", label: "Active", value: statusCounts.active, icon: UserCheck, tone: "brand" },
    { key: "inactive", label: "Inactive", value: statusCounts.inactive, icon: UserX, tone: "ink" },
    { key: "depts", label: "Departments", value: departments.length, icon: Building2, tone: "ink" },
  ];

  const legend = departments
    .map((d) => ({
      name: d.name,
      count: deptStats.find((s) => s._id?.toLowerCase() === d.name?.toLowerCase())?.count || 0,
    }))
    .filter((d) => d.count > 0)
    .slice(0, 8);
  const deptMax = Math.max(1, ...legend.map((d) => d.count));
  const totalStatus = statusCounts.active + statusCounts.inactive;
  const pctActive = totalStatus > 0 ? Math.round((statusCounts.active / totalStatus) * 100) : 0;

  return (
    <Hr_DashboardLayout activeMenu="employees">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <div className="flex flex-col gap-4">
          {/* ── Header ── */}
          <PageHead
            kicker="Human resources"
            title="Employees"
            sub={
              <>
                Manage and view everyone in the organization.{" "}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--control)] px-2.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink"
                  onClick={() => router.push("/hr/dashboard/employees/history")}
                >
                  <History size={11} /> Change history
                </button>
              </>
            }
            actions={
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }} />
                <RoleGate min="editor">
                <Button size="sm" onClick={() => setShowImportModal(true)} disabled={parsing}>
                  {parsing ? <><Loader2 size={14} className="animate-spin" /> Parsing…</> : <><Upload size={14} /> Import</>}
                </Button>
                </RoleGate>
                <Button size="sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><Download size={14} /> Export</>}
                </Button>
                {/* Same form, opened as the intern form — see EmployeeForm:
                    ?type=intern only seeds the employment type, and the form
                    reshapes around that field from there. A separate route
                    would have meant a second copy of name, address, documents
                    and bank details to keep in step. */}
                <RoleGate min="editor">
                <Button size="sm" onClick={() => router.push("/hr/dashboard/employees/new-employee?type=intern")}>
                  <GraduationCap size={15} /> Add intern
                </Button>
                </RoleGate>
                <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={() => router.push("/hr/dashboard/employees/new-employee")}>
                  <Plus size={15} /> Add employee
                </Button>
                </RoleGate>
              </>
            }
          />

          {/* Error banners */}
          {(exportError || importError) && (
            <div className="flex flex-col gap-2">
              {exportError && (
                <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-overdue-ink)]">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" /><span className="flex-1">{exportError}</span>
                  <button onClick={() => setExportError(null)} className="shrink-0 rounded-full p-0.5 hover:bg-[var(--control)]" aria-label="Dismiss"><X size={14} /></button>
                </div>
              )}
              {importError && (
                <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-overdue-ink)]">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" /><span className="flex-1">{importError}</span>
                  <button onClick={() => setImportError(null)} className="shrink-0 rounded-full p-0.5 hover:bg-[var(--control)]" aria-label="Dismiss"><X size={14} /></button>
                </div>
              )}
            </div>
          )}

          {/* Import/export hint */}
          <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] px-3.5 py-2.5 text-sm text-[var(--state-risk-ink)]">
            <FileSpreadsheet size={14} className="mt-0.5 shrink-0" />
            <span>
              Use <strong>Import</strong> to download the template, fill it, and bulk-create
              employees with live salary formulas — or <strong>Export</strong> current data.
            </span>
          </div>

          {/* ── KPI strip ── */}
          <StatStrip
            items={kpis.map((s) => ({
              label: s.label,
              value: String(s.value ?? "—"),
            }))}
          />

          {/* ── Workforce graphs (50 / 50) ── */}
          {legend.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel label="Workforce by department">
                <PanelHead
                  title="Workforce by department"
                  aside={<span data-figure>{totalStatus} people</span>}
                />
                <ul className="space-y-2.5">
                  {legend.map((d) => (
                    <li key={d.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3">
                      <span className="truncate text-xs text-ink-muted">{d.name}</span>
                      <Meter
                        label={`${d.name}: ${d.count} people`}
                        value={Math.max(4, Math.round((d.count / deptMax) * 100))}
                      />
                      <span data-figure className="text-xs text-ink">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel label="Active vs inactive">
                <PanelHead
                  title="Active vs inactive"
                  aside={<span data-figure>{departments.length} departments</span>}
                />
                <div className="flex flex-wrap items-center gap-6">
                  <Ring value={pctActive} label={`${pctActive}% active`} size={120}>
                    <span className="flex flex-col items-center">
                      <span data-figure className="text-[22px] leading-none tracking-[-0.025em] text-ink">
                        {pctActive}<i className="text-xs not-italic text-ink-faint">%</i>
                      </span>
                      <span className="mt-1 text-[11px] text-ink-faint">active</span>
                    </span>
                  </Ring>
                  <div className="min-w-0 flex-1 divide-y divide-hairline">
                    <div className="flex items-center justify-between gap-3 py-2 text-sm text-ink-muted">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--state-positive)]" /> Active
                      </span>
                      <b data-figure className="font-medium text-ink">{statusCounts.active}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 text-sm text-ink-muted">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--state-overdue)]" /> Inactive
                      </span>
                      <b data-figure className="font-medium text-ink">{statusCounts.inactive}</b>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 text-sm text-ink-faint">
                      <span>On record</span>
                      <b data-figure className="font-medium text-ink">{totalStatus}</b>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          <Panel padded={false} label="Employee register">
          {/* ── Toolbar ── */}
          <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline px-5 py-3.5">
            <Segmented
              label="Employee status"
              size="sm"
              value={activeTab}
              onChange={setActiveTab}
              options={["active", "inactive"].map((tab) => ({ id: tab, label: tab }))}
            />
            <Segmented
              label="Staff or interns"
              size="sm"
              value={peopleFilter}
              onChange={setPeopleFilter}
              options={[
                { id: "all", label: "Everyone" },
                { id: "staff", label: "Staff" },
                { id: "interns", label: "Interns" },
              ]}
            />
            <div className="relative">
              <button type="button" onClick={() => setDeptOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--control)] px-3.5 py-1.5 text-sm text-ink transition-colors hover:bg-[var(--control-hover)]"
                aria-haspopup="listbox" aria-expanded={deptOpen}>
                <span className="max-w-[12rem] truncate">{deptFilter === "all" ? "All departments" : deptFilter}</span>
                <ChevronDown size={14} className={`shrink-0 text-ink-faint transition-transform ${deptOpen ? "rotate-180" : ""}`} />
              </button>
              {deptOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-[40] cursor-default" aria-hidden="true" tabIndex={-1} onClick={() => setDeptOpen(false)} />
                  <div className="frost-bar scroll-slim absolute z-[50] mt-1.5 max-h-72 w-56 overflow-y-auto rounded-inset border border-hairline p-1" role="listbox">
                    <button type="button" className={`block w-full rounded-full px-3 py-1.5 text-left text-sm transition-colors ${deptFilter === "all" ? "bg-[var(--control-active)] text-ink" : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"}`}
                      onClick={() => { setDeptFilter("all"); setDeptOpen(false); }}>All departments</button>
                    {departments.map((d) => (
                      <button type="button" key={d.id} className={`block w-full truncate rounded-full px-3 py-1.5 text-left text-sm transition-colors ${deptFilter === d.name ? "bg-[var(--control-active)] text-ink" : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"}`}
                        onClick={() => { setDeptFilter(d.name); setDeptOpen(false); }}>{d.name}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-auto"
              aria-label="Sort employees"
              title="Sort"
            >
              <option value="default">Newest first</option>
              <option value="dob">DOB — oldest first</option>
              <option value="dob_desc">DOB — youngest first</option>
              <option value="doj">Joining date — earliest</option>
              <option value="doj_desc">Joining date — latest</option>
              <option value="name">Name A–Z</option>
            </Select>
            {hasFilters && (
              <Button tone="ghost" size="sm" onClick={() => { setSearch(""); setDeptFilter("all"); }}>
                <X size={13} /> Clear
              </Button>
            )}
            <div className="relative ml-auto min-w-[14rem] flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
              <Input type="text" placeholder="Search by name, ID, email…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="pr-9 pl-9" aria-label="Search employees" />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"><X size={13} /></button>
              )}
            </div>
          </div>

          {/* ── Bulk selection bar ── */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-[var(--surface-sunken)] px-5 py-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                <CheckCircle size={14} /> <span data-figure>{selected.size}</span> selected
              </span>
              <RoleGate min="editor">
                <Button tone="primary" size="sm" onClick={() => setShowBulkEdit(true)}>
                  <Edit3 size={13} /> Edit selected
                </Button>
              </RoleGate>
              <Button tone="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X size={13} /> Clear selection
              </Button>
            </div>
          )}

          {/* ── Table ── */}
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-10 border-b border-hairline px-3 py-2.5 text-left">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-ink)]"
                      checked={allOnPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Employee</th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Department</th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Job title</th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Manager</th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] whitespace-nowrap text-ink-faint uppercase">Date of joining</th>
                  <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Status</th>
                  <th aria-label="Actions" className="border-b border-hairline px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="px-5 py-4"><SkeletonRows rows={6} /></td></tr>
                )}
                {!loading && employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5">
                      <EmptyState
                        title="No employees found"
                        body={hasFilters ? "Try adjusting your filters" : undefined}
                      />
                    </td>
                  </tr>
                )}
                {!loading && employees.map((emp) => {
                  const id = emp._id;
                  const name = getName(emp);
                  const photo = getPhoto(emp);
                  const dept = emp.department || "—";
                  const job = emp.jobTitle || emp.designation || "—";
                  const status = emp.status || "active";
                  const needsDocs = !emp.profilePhoto?.url && !emp.documents?.aadharFile?.url && !emp.documents?.panFile?.url;
                  return (
                    <tr key={id} onClick={() => router.push(`/hr/dashboard/employees/new-employee?id=${id}`)}
                      className={`cursor-pointer transition-colors ${selected.has(id) ? "bg-[var(--control)]" : "hover:bg-[var(--row-hover)]"}`}>
                      <td className="border-b border-hairline px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--color-ink)]"
                          checked={selected.has(id)}
                          onChange={() => toggleSelect(id)}
                          aria-label={`Select ${name}`}
                        />
                      </td>
                      <td className="border-b border-hairline px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={name} photoUrl={photo} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-ink">{name}</span>
                            <span data-figure className="truncate text-[11px] text-ink-faint">{getBioId(emp)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-hairline px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 text-sm text-ink">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" data-avatar-hue={hueFor(dept)} />
                          {dept}
                        </span>
                      </td>
                      <td className="max-w-[14rem] truncate border-b border-hairline px-3 py-2.5 text-sm text-ink-muted" title={job}>{job}</td>
                      <td className="border-b border-hairline px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted">{getMgr(emp)}</td>
                      <td data-figure className="border-b border-hairline px-3 py-2.5 text-sm whitespace-nowrap text-ink-muted">{getDate(emp)}</td>
                      <td className="border-b border-hairline px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={status === "active" ? "positive" : "overdue"}>
                            {status === "active" ? "Active" : "Inactive"}
                          </Chip>
                          {needsDocs && (
                            <Chip tone="rework" title="Profile photo and document files not yet uploaded. Open to upload.">
                              <Paperclip size={11} /> Docs
                            </Chip>
                          )}
                        </div>
                      </td>
                      <td className="border-b border-hairline px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={(e) => { e.stopPropagation(); router.push(`/hr/dashboard/employees/new-employee?id=${id}`); }}
                            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink" aria-label="View / edit"><Eye size={15} /></button>
                          <RoleGate min="owner">
                          <button onClick={(e) => { e.stopPropagation(); setToDelete(emp); }}
                            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)]" aria-label="Delete"><Trash2 size={15} /></button>
                          </RoleGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
            <p className="text-xs text-ink-faint">
              Showing <span data-figure>{employees.length}</span> of <strong data-figure className="font-medium text-ink">{totalEmployees}</strong> employees
              {deptFilter !== "all" && <span> in {deptFilter}</span>}
            </p>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                {pageNums().map((p, i) =>
                  p === "..." ? (
                    <span key={`d${i}`} className="px-1.5 text-xs text-ink-faint">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)} data-figure
                      className={`min-w-8 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors ${page === p ? "bg-ink text-[var(--body-bg)]" : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"}`}>{p}</button>
                  ),
                )}
                <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
          </Panel>
        </div>
      </div>

      {showImportModal && (
        <EmployeeBulkImport
          API_URL={API_URL}
          onClose={() => { setShowImportModal(false); setImportError(null); }}
          onImportComplete={() => fetchEmployees()}
        />
      )}
      {toDelete && (
        <DeleteModal employee={toDelete} onConfirm={handleDelete} onCancel={() => setToDelete(null)} deleting={deleting} />
      )}
      {showBulkEdit && (
        <BulkEditModal
          API_URL={API_URL}
          ids={[...selected]}
          departments={departments}
          onClose={() => setShowBulkEdit(false)}
          onDone={() => {
            setShowBulkEdit(false);
            setSelected(new Set());
            fetchEmployees();
          }}
        />
      )}

    </Hr_DashboardLayout>
  );
}

