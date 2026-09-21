"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  HR — Issued documents · shared kit
//
//  WHY THIS FILE EXISTS (and why it is not "single file per HR page")
//
//  The two document pages — the library (/hr/dashboard/documents) and the queue
//  (/hr/dashboard/documents/requests) — are two views onto ONE feature. Both
//  open the same generate modal, both open the same drawer, both must mirror
//  the same backend gate, and both key off the same field names. Duplicating
//  that into two files is exactly the failure the regularizations page is a
//  post-mortem of: a field name drifts in one copy, `TYPE_META[r.requestType]`
//  is permanently undefined, and nothing catches it — `npm run lint` is broken,
//  `next.config.mjs` sets typescript.ignoreBuildErrors, and there is no test
//  framework.
//
//  So the drift-dangerous parts live here, once. Each page still owns its own
//  composition, its own local Banner/Card helpers and its own load plumbing.
//
//  This is NOT a route. Next's App Router only treats page.js / route.js /
//  layout.js as routes; a sibling module is just a module.
//
//  THE FEATURE, IN ONE PARAGRAPH: an EmployeeDocument carries two independent
//  booleans — `generated` (the file exists on the HR side) and `released` (the
//  employee may see it). HR may generate a letter and it stays invisible until
//  they release it. The employee's ask is a third, orthogonal axis,
//  `requestStatus`. Nothing here may treat those three as one enum.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    // `File` is deliberately aliased: lucide exports an icon by that name, and
    // importing it bare shadows the DOM's File constructor for the whole
    // module. `new File([blob], …)` in compose() then throws
    // "…lucide-react… is not a constructor" — a genuinely baffling error,
    // because the line that breaks is nowhere near the import that broke it.
    FileSignature, FileText, ShieldAlert, Award, LogOut, Wallet, File as FileIcon,
    X, Check, Upload, ExternalLink, Loader2, AlertTriangle, CheckCircle2,
    XCircle, Hourglass, Ban, EyeOff, Info, History, Trash2, Undo2, Send,
    Sparkles, RefreshCw, PenLine, Image as ImageIcon, Trash,
} from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import SearchableSelect from "@/components/hr/SearchableSelect";
import {
    Button, Chip, Field, Input, Select, Textarea, InlineError,
} from "@/components/ceo/ui/Primitives";
import { renderLetterPdf } from "./letterPdf";
import {
    APPOINTMENT_VARIANTS, APPOINTMENT_DEFAULTS, DEFAULT_VARIANT,
    buildAppointmentLetter, suggestVariant, salaryBreakdown, inr,
    honorific, guardianRelation, addressLines,
} from "./appointmentTemplate";

/* The HR pages are on raw fetch with credentials: "include" — `@/lib/api` is
   not used anywhere under app/hr/ and injecting it here would be the only call
   in the subtree carrying an acc_token Bearer header. */
export const API = process.env.NEXT_PUBLIC_API_URL || "";

/** Where the authorised signature image is remembered, per browser. */
export const SIGNATURE_KEY = "hr_letter_signature";
/** Signatures are line art — anything past this is a photo, and a mistake. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
//  Metadata — module-scope const maps, never inline conditionals
//
//  Keys are the byte-exact `type` enum from
//  models/HR_Models/EmployeeDocument.js. Verify by hand before changing one:
//  a typo here renders every row as "Other" and nothing complains.
// ─────────────────────────────────────────────────────────────────────────────

export const DOC_TYPE_META = {
    appointment: { label: "Appointment letter", icon: FileSignature },
    offer: { label: "Offer letter", icon: FileText },
    warning: { label: "Warning letter", icon: ShieldAlert },
    experience: { label: "Experience letter", icon: Award },
    relieving: { label: "Relieving letter", icon: LogOut },
    salary_certificate: { label: "Salary certificate", icon: Wallet },
    other: { label: "Other", icon: FileIcon },
};

/** The `requestStatus` enum. "none" is HR-generated with nobody asking. */
export const REQUEST_META = {
    none: { label: "No request", tone: "neutral" },
    requested: { label: "Open", tone: "rework" },
    fulfilled: { label: "Released", tone: "positive" },
    declined: { label: "Declined", tone: "overdue" },
    cancelled: { label: "Cancelled", tone: "risk" },
};

/** The `state` param of GET /api/hr/documents, byte-exact. Tiles pass their own
    key straight back as the filter, which is why the labels live beside it. */
export const STATE_META = {
    awaiting_generation: { label: "Awaiting generation", tone: "amber" },
    generated_unreleased: { label: "Generated, not released", tone: "blue" },
    released: { label: "Released", tone: "emerald" },
    revoked: { label: "Withdrawn", tone: "rose" },
};

export const HISTORY_META = {
    requested: { label: "Requested", icon: Send },
    generated: { label: "Generated", icon: FileSignature },
    file_replaced: { label: "File replaced", icon: Upload },
    released: { label: "Released to the employee", icon: CheckCircle2 },
    revoked: { label: "Withdrawn", icon: Undo2 },
    declined: { label: "Declined", icon: XCircle },
    cancelled: { label: "Cancelled by the employee", icon: Ban },
};

/** The letter title HR sees. `other` carries its own free-text label. */
export const docLabel = (d) =>
    (d?.type === "other" ? d?.otherTypeLabel : "") ||
    d?.title ||
    DOC_TYPE_META[d?.type]?.label ||
    d?.type ||
    "Document";

export const typeIcon = (t) => DOC_TYPE_META[t]?.icon || FileIcon;

// ─────────────────────────────────────────────────────────────────────────────
//  The backend gate, mirrored
//
//  Every predicate here has a twin in routes/HrRoutes/EmployeeDocuments_section.js. The
//  UI must never offer an action the server would refuse — and it must never
//  hide one the server would allow. RoleGate is UX; these are correctness.
// ─────────────────────────────────────────────────────────────────────────────

/** §C.5 releaseBlocker(), inverted. NOT_GENERATED / ALREADY_RELEASED / INVALID_TRANSITION. */
export const canRelease = (d) =>
    !!d?.generated &&
    hasFile(d?.file) &&
    !d?.released &&
    !["declined", "cancelled"].includes(d?.requestStatus);

/** Case (b): they asked, nothing exists yet. HR must go make it. */
export const needsGeneration = (d) =>
    d?.requestStatus === "requested" && !d?.generated;

/**
 * THE WHOLE FEATURE IN ONE PREDICATE — case (a).
 * A document HR has already made, for an employee who has now asked for it,
 * which the employee still cannot see. One click finishes the job.
 */
export const readyToRelease = (d) =>
    d?.requestStatus === "requested" && !!d?.generated && !d?.released;

/** A row is revoked iff released === false AND revokedAt is set. Never a boolean. */
export const isRevoked = (d) => !d?.released && !!d?.revokedAt;

/** §C.6: you can only take back what is out there. */
export const canRevoke = (d) => !!d?.released;

/** §C.7 DELETE: only while it has NEVER been released. Then it is a record. */
export const canDelete = (d) => !d?.released && (d?.releaseCount || 0) === 0;

/** The decline route: terminal, and only from an open ask. */
export const canDecline = (d) => d?.requestStatus === "requested";

/**
 * The one sentence describing what the EMPLOYEE can see right now. HR reads
 * this constantly, so it is written as a fact, not an enum.
 */
export function visibilityLine(d) {
    if (d?.released) return "Visible to the employee.";
    if (isRevoked(d)) return "Withdrawn — the employee can no longer open it.";
    if (d?.generated) return "Not released. The employee cannot see this.";
    if (d?.requestStatus === "requested") return "Requested. Nothing generated yet.";
    return "Nothing generated, nothing released.";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Formatting
// ─────────────────────────────────────────────────────────────────────────────

export const fmtDate = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const fmtDateTime = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
    });
};

export const ago = (v) => {
    if (!v) return "—";
    const past = new Date(v).getTime();
    if (isNaN(past)) return "—";
    const diff = Math.floor((Date.now() - past) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

export const fmtBytes = (n) => {
    const b = Number(n) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

/** yyyy-mm-dd for an <input type="date"> from any date-ish value. */
export const toDateInput = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────────
//  Fetch helpers
//
//  Every response in this feature is { success, message, ... }. Branching on
//  res.ok alone would treat a 200 { success: false } as a win, and a 400 with a
//  useful `code`/`message` as an opaque failure.
// ─────────────────────────────────────────────────────────────────────────────

/** JSON call. Returns the parsed envelope; throws with the server's message. */
export async function apiJson(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        credentials: "include",
        signal,
        ...(body !== undefined
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : {}),
    });
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new Error(`The server returned a non-JSON response (${res.status}).`);
    }
    if (!res.ok || data?.success === false) {
        const err = new Error(data?.message || `Request failed (${res.status})`);
        err.code = data?.code || null;
        throw err;
    }
    return data;
}

/** multipart call. No Content-Type header — the browser must set the boundary. */
export async function apiForm(path, formData, { method = "POST" } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        credentials: "include",
        body: formData,
    });
    let data = null;
    try {
        data = await res.json();
    } catch {
        throw new Error(`The server returned a non-JSON response (${res.status}).`);
    }
    if (!res.ok || data?.success === false) {
        const err = new Error(data?.message || `Upload failed (${res.status})`);
        err.code = data?.code || null;
        throw err;
    }
    return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared chrome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One banner state, three tones. Successes auto-dismiss in the caller;
 * warnings and errors never do — §C.6's revoke caveat is a warning HR must
 * read, and a warning that vanishes is a warning that was not given.
 */
export function Banner({ banner, onClose }) {
    if (!banner) return null;
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
            <button type="button" onClick={onClose} aria-label="Dismiss"
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100">✕</button>
        </div>
    );
}

export function SummaryCard({ icon: Icon, label, value, tone, active, onClick, highlight }) {
    const tints = {
        emerald: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
        rose: "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]",
        amber: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
        blue: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
        gray: "bg-[var(--control)] text-ink-faint",
    };
    return (
        <button type="button" onClick={onClick} aria-pressed={!!active}
            className={`frost-panel cursor-pointer rounded-card p-4 text-left transition-colors hover:bg-[var(--frost-bar)] ${active ? "shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : highlight ? "shadow-[inset_0_0_0_1px_var(--state-rework)]" : ""
                }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">{label}</p>
                    <p data-figure className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink">{value}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-inset ${tints[tone] || tints.gray}`}>
                    <Icon className="h-4 w-4" />
                </div>
            </div>
        </button>
    );
}

export function Avatar({ name = "", size = "md" }) {
    const initials =
        (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
    const sizeClass = size === "lg" ? "h-12 w-12 text-sm" : "h-10 w-10 text-xs";
    return (
        <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[var(--control-active)] font-medium text-ink`}>
            {initials}
        </div>
    );
}

export function Section({ title, icon: Icon, children }) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                {Icon && <Icon className="h-3.5 w-3.5 text-ink-faint" />}
                <h4 className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">{title}</h4>
            </div>
            {children}
        </div>
    );
}

/**
 * The release-state chip. Deliberately its own component: "generated" and
 * "released" are two booleans and every place in this UI that flattens them
 * into one word has to flatten them the same way.
 */
export function ReleaseChip({ doc }) {
    if (doc?.released) {
        return (
            <Chip tone="positive" title={`Released ${fmtDateTime(doc.releasedAt)}`}>
                <CheckCircle2 className="h-3 w-3" /> Released {fmtDate(doc.releasedAt)}
            </Chip>
        );
    }
    if (isRevoked(doc)) {
        return (
            <Chip tone="overdue" title={doc.revokeReason || "Withdrawn"}>
                <Undo2 className="h-3 w-3" /> Withdrawn
            </Chip>
        );
    }
    if (doc?.generated) {
        return (
            <Chip tone="rework" title="Generated on the HR side only. The employee cannot see it.">
                <EyeOff className="h-3 w-3" /> Not released
            </Chip>
        );
    }
    return (
        <Chip tone="neutral" title="No file has been generated for this row yet.">
            <Hourglass className="h-3 w-3" /> Not generated
        </Chip>
    );
}

/** Does this row have bytes behind it, on either storage backend? */
export const hasFile = (file) => !!(file?.driveFileId || file?.url);

/**
 * Open a stored letter in a new tab.
 *
 * Letters live in PRIVATE Google Drive now, so there is no URL to put in an
 * href — the backend mints a short-lived signed one per click. The window is
 * opened FIRST and pointed afterwards: a window.open() that happens after an
 * await is no longer inside the user gesture, and every popup blocker kills
 * it. Legacy Cloudinary rows come back from the same endpoint with their
 * public URL, so this one path covers both.
 */
export async function openLetter(docId) {
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
        const out = await apiJson(`/api/hr/documents/${docId}/link`);
        const url = out?.data?.url;
        if (!url) throw new Error("No file on this document.");
        if (tab) tab.location.href = url;
        else window.location.href = url;   // popup blocked — go in this tab
    } catch (e) {
        if (tab) tab.close();
        throw e;
    }
}

/** The attached PDF, as the pill-and-anchor pattern used elsewhere in HR. */
export function FileLink({ file, docId, onError }) {
    if (!hasFile(file)) return null;
    return (
        <div>
            <button type="button"
                onClick={() => openLetter(docId).catch((e) => onError?.(e.message))}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--control)] px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]">
                <FileText className="h-4 w-4" />
                {file.fileName || "Open the document"}
                <ExternalLink className="h-3 w-3" />
            </button>
            {file.bytes ? (
                <p className="mt-1 text-[11px] text-ink-faint">
                    <span data-figure>{fmtBytes(file.bytes)}</span> · {file.mimeType || "application/pdf"}
                </p>
            ) : null}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Employee directory — loaded once per page, shared by the picker
// ─────────────────────────────────────────────────────────────────────────────

export function useEmployees(enabled = true) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        setLoading(true);
        (async () => {
            try {
                const d = await apiJson("/api/employees/all?page=1&limit=500&status=active");
                if (alive) setEmployees(d.data?.employees || []);
            } catch {
                if (alive) setEmployees([]);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [enabled]);

    const options = useMemo(
        () =>
            employees.map((e) => {
                const name = [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ").trim();
                return {
                    value: e._id,
                    label: e.biometricId ? `${name} (${e.biometricId})` : name,
                    sub: [e.designation || e.jobTitle, e.department].filter(Boolean).join(" · "),
                };
            }),
        [employees],
    );

    return { employees, options, loading };
}

/** The department filter list. Same endpoint the regularizations page uses. */
export function useDepartments() {
    const [departments, setDepartments] = useState([]);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const d = await apiJson("/hr/attendance/departments");
                if (alive) setDepartments(d.data || []);
            } catch {
                if (alive) setDepartments([]);
            }
        })();
        return () => { alive = false; };
    }, []);
    return departments;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF composition
//
//  The block model and the pdf-lib renderer now live in letterPdf.js, and the
//  two appointment letters — which are real transcribed contracts, not a
//  paragraph of generated prose — live in appointmentTemplate.js.
//
//  What is left here is the mapping from THIS FORM to those blocks. Every type
//  goes through the same renderer, so every letter gets the same letterhead,
//  the same running header and the same signature treatment; the short types
//  simply produce a shorter block list.
// ─────────────────────────────────────────────────────────────────────────────

// `appointment` is deliberately absent. It is not a paragraph of prose — it is
// a seven-page contract with two variants, an annexure of computed salary and
// an annexure of clauses, and it is built by appointmentTemplate.js. Adding a
// one-paragraph fallback here would let a typo in the type string silently
// issue a three-line appointment letter.
const LETTER_BODY = {
    offer: (v) => `We are pleased to offer you the position of ${v.designation || "an employee"} in the ${v.department || "company"} department at Matrubhoomi Farms & Developers.

Your engagement is proposed to commence on ${v.effectiveDate || v.dateOfJoining || "the agreed date"}${v.annualCTC ? `, at an annual cost to company of ${v.annualCTC}` : ""}.

This offer is subject to verification of the documents and references you have provided.`,

    warning: (v) => `This letter is issued to place on record the concern noted below.

${v.remarks || "Your conduct has been found to be inconsistent with the standards expected of you."}

You are advised to correct this with immediate effect. A recurrence may attract further action under the company's policies. A copy of this letter is placed in your personnel file.`,

    experience: (v) => `This is to certify that ${v.fullName || "the employee named above"} was employed with Matrubhoomi Farms & Developers${v.designation ? ` as ${v.designation}` : ""}${v.department ? ` in the ${v.department} department` : ""}.

The period of employment was from ${v.dateOfJoining || "the date of joining"} to ${v.lastWorkingDay || "the last working day"}.

During this period their conduct and performance were found to be satisfactory. This certificate is issued at their request.`,

    relieving: (v) => `This is to confirm that ${v.fullName || "the employee named above"}${v.designation ? `, ${v.designation}` : ""} has been relieved from the services of Matrubhoomi Farms & Developers with effect from the close of business on ${v.lastWorkingDay || "the last working day"}.

${v.resignationDate ? `The resignation was tendered on ${v.resignationDate}${v.noticePeriodDays ? ` and the notice period of ${v.noticePeriodDays} days has been accounted for` : ""}.` : "All company property in their possession has been returned and all dues have been settled."}

We wish them well in their future endeavours.`,

    salary_certificate: (v) => `This is to certify that ${v.fullName || "the employee named above"} is employed with Matrubhoomi Farms & Developers${v.designation ? ` as ${v.designation}` : ""}${v.department ? ` in the ${v.department} department` : ""}${v.dateOfJoining ? `, since ${v.dateOfJoining}` : ""}.

${v.annualCTC ? `Their annual cost to company is ${v.annualCTC}.` : "Their remuneration is as recorded in the company's payroll."}

This certificate is issued at the request of the employee for their own records and carries no obligation on the part of the company.`,

    other: (v) => v.remarks ||
        `This letter is issued to ${v.fullName || "the employee named above"} at their request.`,
};

/**
 * Compose the letter as a real PDF and hand back a Blob.
 *
 * This is HR's convenience path. A signed PDF that HR already holds is the
 * other path, and both end at the same place: a multipart POST where the
 * BACKEND does the Cloudinary upload. Nothing here ever uploads directly —
 * a browser that can post a URL into an employee-visible record is a browser
 * that can post any URL.
 */
export async function composeLetterPdf({ type, title, employee, meta, signatureImage }) {
    const heading = title || DOC_TYPE_META[type]?.label || "Letter";

    // ── The appointment letter: its own transcribed template, either variant ──
    if (type === "appointment") {
        const variant = meta.variant || suggestVariant(employee) || DEFAULT_VARIANT;
        const { blocks } = buildAppointmentLetter(variant, appointmentView(employee, meta));
        return renderLetterPdf(blocks, {
            headerLabel: "Appointment Letter",
            signatureImage,
        });
    }

    // ── Every other type: the short form, same letterhead and renderer ───────
    const vars = {
        fullName: employee.fullName || "",
        designation: employee.designation || employee.jobTitle || "",
        department: employee.department || "",
        dateOfJoining: employee.dateOfJoining ? fmtDate(employee.dateOfJoining) : "",
        effectiveDate: meta.effectiveDate ? fmtDate(meta.effectiveDate) : "",
        lastWorkingDay: meta.lastWorkingDay ? fmtDate(meta.lastWorkingDay) : "",
        resignationDate: meta.resignationDate ? fmtDate(meta.resignationDate) : "",
        noticePeriodDays: meta.noticePeriodDays || "",
        annualCTC: meta.annualCTC || "",
        remarks: meta.remarks || "",
    };

    const blocks = [
        { t: "p", text: `Date: ${meta.issueDate ? fmtDate(meta.issueDate) : fmtDate(new Date())}`, size: 10.5 },
    ];
    if (meta.referenceNo) blocks.push({ t: "p", text: `Ref: ${meta.referenceNo}`, size: 10.5 });
    blocks.push({ t: "space", h: 10 });
    blocks.push({ t: "h1", text: heading.toUpperCase() });
    blocks.push({ t: "space", h: 8 });
    blocks.push({ t: "p", text: `To: ${employee.fullName || ""}` });
    if (employee.biometricId) blocks.push({ t: "p", text: `Employee ID: ${employee.biometricId}`, size: 10 });
    if (employee.designation || employee.department) {
        blocks.push({
            t: "p", size: 10,
            text: [employee.designation, employee.department].filter(Boolean).join(", "),
        });
    }
    blocks.push({ t: "space", h: 8 });

    for (const para of (LETTER_BODY[type] || LETTER_BODY.other)(vars).split("\n\n")) {
        if (para.trim()) blocks.push({ t: "p", text: para.trim() });
    }

    // Remarks, when they are not already the body.
    if (meta.remarks && type !== "warning" && type !== "other") {
        blocks.push({ t: "space", h: 6 }, { t: "h3", text: "Remarks" }, { t: "p", text: meta.remarks });
    }

    blocks.push({ t: "space", h: 16 });
    blocks.push({
        t: "sign",
        company: APPOINTMENT_DEFAULTS.companyName,
        name: meta.signatoryName || "Authorised signatory",
        designation: meta.signatoryDesignation || "",
    });

    return renderLetterPdf(blocks, { headerLabel: heading, signatureImage });
}

/**
 * Form + employee record → the view model appointmentTemplate.js expects.
 *
 * Every field falls back to the employee record and then to a sane default, so
 * a half-filled form still produces a complete letter rather than one with
 * "undefined" where the department should be. HR's typed values always win.
 */
export function appointmentView(employee = {}, meta = {}) {
    const person = {
        title: meta.honorific || employee.title,
        gender: employee.gender,
        maritalStatus: employee.maritalStatus,
    };
    return {
        // Identity
        fullName: employee.fullName || "",
        firstName: employee.firstName || String(employee.fullName || "").split(/\s+/)[0] || "",
        honorific: honorific(person),
        guardianRelation: meta.guardianRelation || guardianRelation(person),
        guardianName: meta.guardianName || employee.guardianName || "",
        addressLines: meta.addressText
            ? String(meta.addressText).split("\n").map((l) => l.trim()).filter(Boolean)
            : addressLines(employee.address),

        // Position
        designation: employee.designation || employee.jobTitle || "",
        department: employee.department || "",
        dateOfJoining: employee.dateOfJoining ? fmtDate(employee.dateOfJoining) : "",
        effectiveDate: meta.effectiveDate ? fmtDate(meta.effectiveDate) : "",
        issueDate: meta.issueDate ? fmtDate(meta.issueDate) : fmtDate(new Date()),
        referenceNo: meta.referenceNo || "",

        // Money.
        //
        // `storedSalary` is the employee's actual payroll row and it WINS over
        // everything derived — the letter has to agree with the figures the
        // employee already sees on their profile. It is dropped the moment HR
        // types a different gross, because at that point they are deliberately
        // issuing a letter at a new salary and the old breakdown no longer
        // describes it.
        storedSalary:
            meta.grossSalary === "" || meta.grossSalary === undefined ||
                Number(meta.grossSalary) === Number(employee.salary?.gross)
                ? employee.salary || null
                : null,
        grossSalary: meta.grossSalary === "" || meta.grossSalary === undefined
            ? Number(employee.salary?.gross) || 0
            : Number(meta.grossSalary) || 0,
        foodAllowance: meta.foodAllowance,
        professionalTax: Number(meta.professionalTax) || 0,
        esicApplicable: meta.esicApplicable,

        // Company
        placeOfPosting: meta.placeOfPosting || APPOINTMENT_DEFAULTS.placeOfPosting,
        signatoryName: meta.signatoryName || "",
        signatoryDesignation: meta.signatoryDesignation || APPOINTMENT_DEFAULTS.signatoryDesignation,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Generate modal
//
//  Not a portal and not a shadcn Dialog — a plain fixed overlay rendered as a
//  sibling at the end of the page, opened by holding state. That is the house
//  pattern (departments/page.js).
//
//  TWO FOOTER BUTTONS, AND THE ORDER MATTERS:
//    "Save (not released)"  — primary, the safe default
//    "Save and release"     — secondary, an explicit opt-in
//  The gate IS the feature. A default of "released" quietly deletes it.
// ─────────────────────────────────────────────────────────────────────────────

const META_FOR_TYPE = {
    // The appointment letter takes the whole set: it prints an addressee block,
    // a computed Annexure I and a signatory line, so every one of these ends up
    // visible on the page rather than merged into a sentence.
    appointment: [
        "variant", "referenceNo", "issueDate", "effectiveDate",
        "guardian", "address", "salary", "placeOfPosting", "signatory",
    ],
    offer: ["referenceNo", "issueDate", "effectiveDate", "annualCTC", "signatory", "remarks"],
    warning: ["referenceNo", "issueDate", "signatory", "remarks"],
    experience: ["referenceNo", "issueDate", "lastWorkingDay", "signatory", "remarks"],
    relieving: ["referenceNo", "issueDate", "lastWorkingDay", "resignationDate", "noticePeriodDays", "signatory", "remarks"],
    salary_certificate: ["referenceNo", "issueDate", "annualCTC", "signatory", "remarks"],
    other: ["referenceNo", "issueDate", "signatory", "remarks"],
};

const EMPTY_META = {
    referenceNo: "",
    issueDate: toDateInput(new Date()),
    effectiveDate: "",
    lastWorkingDay: "",
    resignationDate: "",
    noticePeriodDays: "",
    annualCTC: "",
    signatoryName: "",
    signatoryDesignation: "",
    remarks: "",

    // ── Appointment-letter fields ──────────────────────────────────────────
    // "" is meaningfully different from 0 for every figure here: "" means
    // "fall back to the employee record or the standing default", 0 means "HR
    // typed a zero". appointmentView() depends on that distinction, so these
    // must stay strings and must not be seeded with numbers.
    variant: "",
    honorific: "",
    guardianRelation: "",
    guardianName: "",
    addressText: "",
    grossSalary: "",
    foodAllowance: "",
    professionalTax: "",
    esicApplicable: undefined,      // undefined = decide from the wage ceiling
    placeOfPosting: "",
};

/**
 * @param preset  { employeeId, type, requestId, employeeName } — set when the
 *                queue opens this against an existing request row. `requestId`
 *                makes the backend attach the file to THAT row instead of
 *                creating a second one.
 * @param onSaved (envelope) => void  — the server's own response, so the caller
 *                reads `released` off the outcome rather than assuming it.
 */
export function GenerateModal({ preset = null, onClose, onSaved }) {
    const { options: employeeOptions, loading: loadingEmployees } = useEmployees(true);

    const [employeeId, setEmployeeId] = useState(preset?.employeeId || "");
    const [kind, setKind] = useState(preset?.type || "");   // `type` shadows nothing here, but the app calls it `kind`; keep the vocabulary aligned across repos.
    const [otherTypeLabel, setOtherTypeLabel] = useState(preset?.otherTypeLabel || "");
    const [title, setTitle] = useState("");
    const [meta, setMeta] = useState(EMPTY_META);
    const [hrNotes, setHrNotes] = useState("");

    const [source, setSource] = useState("compose");        // compose | upload
    const [file, setFile] = useState(null);
    const [dragging, setDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState("");
    const [composing, setComposing] = useState(false);

    // The authorised signature, as a data URI.
    //
    // IT IS NEVER UPLOADED. It is read in the browser, drawn into the PDF, and
    // remembered in localStorage so HR does not re-pick the same PNG for every
    // letter — the only copy that leaves this machine is the one baked into the
    // rendered page. Storing it server-side would make a signature image an
    // API-reachable object, which is exactly what a signature must not be.
    const [signature, setSignature] = useState("");
    const signatureRef = useRef(null);

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(SIGNATURE_KEY);
            if (saved) setSignature(saved);
        } catch { /* private mode, or storage disabled — just ask again */ }
    }, []);

    const [prefill, setPrefill] = useState(null);
    const [prefilling, setPrefilling] = useState(false);
    const [saving, setSaving] = useState("");               // "" | "hold" | "release"
    const [error, setError] = useState("");

    const fileRef = useRef(null);

    // Revoke the object URL on replace and on unmount — an <iframe src> holding
    // a blob URL pins the whole PDF in memory for the life of the document.
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    // Merge fields. Re-read when the subject or the type changes: salary is
    // returned ONLY for a salary certificate, so switching type must re-ask.
    useEffect(() => {
        if (!employeeId) { setPrefill(null); return; }
        let alive = true;
        setPrefilling(true);
        (async () => {
            try {
                const qs = kind ? `?type=${encodeURIComponent(kind)}` : "";
                const d = await apiJson(`/api/hr/documents/prefill/${employeeId}${qs}`);
                if (!alive) return;
                setPrefill(d.data || null);
            } catch (e) {
                if (alive) { setPrefill(null); setError(e.message); }
            } finally {
                if (alive) setPrefilling(false);
            }
        })();
        return () => { alive = false; };
    }, [employeeId, kind]);

    // Seed the fields the letter needs from whatever the employee record knows.
    // `m.x || …` throughout: a value HR has already typed is never overwritten
    // by a later prefill, which is what makes changing the type mid-form safe.
    useEffect(() => {
        if (!prefill) return;
        setMeta((m) => ({
            ...m,
            annualCTC: m.annualCTC || ctcFromPrefill(prefill),
            variant: m.variant || suggestVariant(prefill),
            guardianName: m.guardianName || prefill.guardianName || "",
            guardianRelation: m.guardianRelation || guardianRelation(prefill),
            honorific: m.honorific || honorific(prefill),
            addressText: m.addressText || addressLines(prefill.address).join("\n"),
            grossSalary: m.grossSalary || (prefill.salary?.gross ? String(prefill.salary.gross) : ""),
            signatoryDesignation: m.signatoryDesignation || APPOINTMENT_DEFAULTS.signatoryDesignation,
        }));
    }, [prefill]);

    // The composed PDF is stale the moment any input feeding it changes.
    // Silently posting a preview that no longer matches the form is worse than
    // making HR press the button again.
    /**
     * A VALUE fingerprint of everything the composed PDF is built from.
     *
     * This used to be a dependency list containing `meta` itself, and that was
     * a real bug: `meta` is an object, so any setMeta — including the prefill
     * seeder writing back values identical to the ones already there — minted
     * a new reference, the effect below fired, and the freshly built PDF was
     * thrown away. HR then pressed Save and got "Build the letter first, then
     * save it" while looking at the preview of the letter they had just built.
     *
     * Comparing values instead of references means the file is discarded when
     * the letter would actually come out different, and not otherwise. The
     * signature is in the fingerprint too — swapping it changes the page
     * without touching a single form field, which is the one stale state HR
     * would never think to check.
     */
    const buildKey = useMemo(
        () => JSON.stringify([
            kind, title, employeeId, otherTypeLabel, meta,
            // A prefix plus the length, not the whole data URI: two different
            // signature images agreeing on both is not a real scenario, and
            // re-stringifying 200 KB of base64 on every keystroke is.
            `${signature.length}:${signature.slice(0, 128)}`,
        ]),
        [kind, title, employeeId, otherTypeLabel, meta, signature],
    );

    useEffect(() => {
        if (source !== "compose") return;
        setFile(null);
        setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return ""; });
    }, [buildKey, source]);

    const shownMeta = META_FOR_TYPE[kind] || [];
    const typeLocked = !!preset?.type;
    const employeeLocked = !!preset?.employeeId;

    // The Annexure I figures, live.
    //
    // Deliberately routed through appointmentView() + salaryBreakdown() — the
    // SAME two functions the PDF calls — rather than recomputing the table for
    // the screen. A preview with its own arithmetic is a preview that will
    // eventually disagree with the letter it is previewing.
    const salaryPreview = useMemo(() => {
        if (kind !== "appointment") return null;
        const v = appointmentView(prefill || {}, meta);
        return salaryBreakdown(v.grossSalary, {
            stored: v.storedSalary,
            foodAllowance: v.foodAllowance,
            professionalTax: v.professionalTax,
            esic: v.esicApplicable,
        });
    }, [kind, prefill, meta]);

    const variant = meta.variant || DEFAULT_VARIANT;

    const validate = () => {
        if (!employeeId) return "Pick the employee this letter is for.";
        if (!kind) return "Pick which document this is.";
        if (kind === "other" && !otherTypeLabel.trim()) return "Say which document this is.";
        if (!file) return source === "compose"
            ? "Build the letter first, then save it."
            : "Choose the signed PDF you want to issue.";
        return "";
    };

    const compose = async () => {
        setError("");
        if (!employeeId) return setError("Pick the employee this letter is for.");
        if (!kind) return setError("Pick which document this is.");
        if (kind === "other" && !otherTypeLabel.trim()) return setError("Say which document this is.");
        // Annexure I is derived entirely from gross. Building at zero produces a
        // letter that is complete, plausible and states a salary of nothing —
        // the one failure mode here that would not look like a failure.
        if (kind === "appointment" && !(salaryPreview?.gross > 0)) {
            return setError("Enter the monthly gross salary — Annexure I would otherwise print zeros.");
        }
        setComposing(true);
        try {
            const resolvedTitle =
                title.trim() ||
                (kind === "other" ? otherTypeLabel.trim() : DOC_TYPE_META[kind]?.label || kind);
            const blob = await composeLetterPdf({
                type: kind,
                title: resolvedTitle,
                employee: prefill || { fullName: preset?.employeeName || "" },
                meta,
                signatureImage: signature,
            });
            const name = `${resolvedTitle}${prefill?.biometricId ? ` - ${prefill.biometricId}` : ""}.pdf`
                .replace(/[\\/:*?"<>|]/g, "-");
            const built = new File([blob], name, { type: "application/pdf" });
            setFile(built);
            setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob); });
        } catch (e) {
            setError(e?.message || "The letter could not be built.");
        } finally {
            setComposing(false);
        }
    };

    const takeSignature = (f) => {
        setError("");
        if (!f) return;
        // pdf-lib embeds PNG and JPEG and nothing else — an SVG or a WEBP here
        // would fail inside embedPng and lose the signature silently.
        if (!/^image\/(png|jpe?g)$/i.test(f.type)) {
            setError("The signature must be a PNG or JPG image. A PNG with a transparent background looks best.");
            return;
        }
        if (f.size > MAX_SIGNATURE_BYTES) {
            setError("That signature image is over 2 MB. A scan of the signature alone is usually well under 200 KB.");
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => setError("That image could not be read.");
        reader.onload = () => {
            const uri = String(reader.result || "");
            setSignature(uri);
            try { window.localStorage.setItem(SIGNATURE_KEY, uri); } catch { /* not fatal */ }
        };
        reader.readAsDataURL(f);
    };

    const clearSignature = () => {
        setSignature("");
        try { window.localStorage.removeItem(SIGNATURE_KEY); } catch { /* not fatal */ }
        if (signatureRef.current) signatureRef.current.value = "";
    };

    const takeFile = (f) => {
        setError("");
        if (!f) return;
        if (f.type !== "application/pdf") {
            setError("Only a PDF can be issued as a letter.");
            return;
        }
        if (f.size > 10 * 1024 * 1024) {
            setError("That file is over the 10 MB limit.");
            return;
        }
        setFile(f);
        setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f); });
    };

    const onDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        takeFile(e.dataTransfer?.files?.[0]);
    };

    const save = async (releaseNow) => {
        setError("");
        const problem = validate();
        if (problem) { setError(problem); return; }

        setSaving(releaseNow ? "release" : "hold");
        try {
            const fd = new FormData();
            fd.append("document", file, file.name);          // field name is `document` — §C.3
            fd.append("employeeId", employeeId);
            fd.append("type", kind);
            if (kind === "other") fd.append("otherTypeLabel", otherTypeLabel.trim());
            if (title.trim()) fd.append("title", title.trim());
            if (hrNotes.trim()) fd.append("hrNotes", hrNotes.trim());
            if (preset?.requestId) fd.append("requestId", preset.requestId);
            fd.append("letterMeta", JSON.stringify(cleanMeta(meta)));
            if (releaseNow) fd.append("releaseNow", "true");

            const out = await apiForm("/api/hr/documents", fd);
            onSaved(out);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving("");
        }
    };

    const busy = !!saving;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
            onClick={busy ? undefined : onClose}>
            <div className="frost-bar flex max-h-full min-h-0 w-full max-w-[46rem] flex-col rounded-panel border border-hairline"
                onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                            <FileSignature size={16} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                                {preset?.requestId ? "Generate for a request" : "Generate a document"}
                            </h2>
                            <p className="mt-1 text-xs text-ink-faint">
                                {preset?.requestId
                                    ? `Attaches to ${preset.employeeName || "the employee"}'s open request.`
                                    : "Saved to the HR library. The employee sees nothing until you release it."}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
                        className="shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:opacity-40">
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">

                    {/* Subject + type */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="min-w-0">
                            <span className="mb-1.5 block text-sm font-medium text-ink">Employee</span>
                            {employeeLocked ? (
                                <div className="rounded-inset bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm text-ink">
                                    {preset.employeeName || "Selected employee"}
                                </div>
                            ) : (
                                <SearchableSelect
                                    options={employeeOptions}
                                    value={employeeId}
                                    onChange={setEmployeeId}
                                    placeholder="Search by name or ID…"
                                    emptyLabel="— None —"
                                    loading={loadingEmployees}
                                    ariaLabel="Employee"
                                />
                            )}
                        </div>
                        <Field label="Document type" required>
                            <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={typeLocked}>
                                <option value="">Choose a type…</option>
                                {Object.entries(DOC_TYPE_META).map(([v, m]) => (
                                    <option key={v} value={v}>{m.label}</option>
                                ))}
                            </Select>
                        </Field>
                    </div>

                    {kind === "warning" && (
                        <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-3 text-xs text-[var(--state-rework-ink)]">
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                                A warning letter is issued by HR and can never be requested by an
                                employee — the employee endpoint refuses the type outright. It still
                                stays hidden until you release it.
                            </span>
                        </div>
                    )}

                    {kind === "appointment" && (
                        <div>
                            <span className="mb-1.5 block text-sm font-medium text-ink">
                                Which appointment letter
                            </span>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {Object.entries(APPOINTMENT_VARIANTS).map(([key, v]) => {
                                    const on = variant === key;
                                    return (
                                        <button key={key} type="button"
                                            onClick={() => setMeta({ ...meta, variant: key })}
                                            aria-pressed={on}
                                            className={`rounded-card border p-3 text-left transition-colors ${on
                                                ? "border-ink bg-[var(--control-active)]"
                                                : "border-hairline bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                                                }`}>
                                            <span className="flex items-center gap-2 text-sm font-medium text-ink">
                                                {on ? <Check className="h-3.5 w-3.5" /> : null}
                                                {v.label}
                                            </span>
                                            <span className="mt-1 block text-xs text-ink-muted">{v.hint}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 text-xs text-ink-faint">
                                Both letters share clauses 1&ndash;9 and Annexure&nbsp;I. They differ in the
                                reporting line and in Annexure&nbsp;II
                                {variant === "worker"
                                    ? " — this one carries the factory terms, including shift hours and overtime."
                                    : " — this one carries the office terms."}
                            </p>
                        </div>
                    )}

                    {kind === "other" && (
                        <Field label="What is this document?" required
                            hint="Free text. It becomes the letter's title unless you set one below.">
                            <Input value={otherTypeLabel} onChange={(e) => setOtherTypeLabel(e.target.value)}
                                placeholder="e.g. Address proof, No-objection certificate" maxLength={120} />
                        </Field>
                    )}

                    <Field label="Title" hint={`Shown to the employee. Defaults to "${kind ? (kind === "other" ? (otherTypeLabel.trim() || "Other") : DOC_TYPE_META[kind]?.label) : "the type name"}".`}>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)}
                            placeholder={kind ? DOC_TYPE_META[kind]?.label : "Letter title"} maxLength={160} />
                    </Field>

                    {/* Merge fields for this type */}
                    {kind && (
                        <div className="rounded-card bg-[var(--surface-sunken)] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                                    Letter details
                                </p>
                                {prefilling && (
                                    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Reading the employee record…
                                    </span>
                                )}
                            </div>

                            {prefill && (
                                <p className="mb-3 text-xs text-ink-muted">
                                    {prefill.fullName}
                                    {prefill.biometricId ? <> · <span data-figure>{prefill.biometricId}</span></> : null}
                                    {prefill.designation ? ` · ${prefill.designation}` : ""}
                                    {prefill.department ? ` · ${prefill.department}` : ""}
                                    {prefill.dateOfJoining ? <> · joined <span data-figure>{fmtDate(prefill.dateOfJoining)}</span></> : null}
                                </p>
                            )}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {shownMeta.includes("referenceNo") && (
                                    <Field label="Reference number">
                                        <Input value={meta.referenceNo}
                                            onChange={(e) => setMeta({ ...meta, referenceNo: e.target.value })}
                                            placeholder="Matrubhoomi/HR/2026/001" />
                                    </Field>
                                )}
                                {shownMeta.includes("issueDate") && (
                                    <Field label="Issue date">
                                        <Input type="date" value={meta.issueDate}
                                            onChange={(e) => setMeta({ ...meta, issueDate: e.target.value })} />
                                    </Field>
                                )}
                                {shownMeta.includes("effectiveDate") && (
                                    <Field label="Effective from">
                                        <Input type="date" value={meta.effectiveDate}
                                            onChange={(e) => setMeta({ ...meta, effectiveDate: e.target.value })} />
                                    </Field>
                                )}
                                {/* lastWorkingDay / resignationDate / noticePeriodDays are NOT on the
                                    Employee model — that is precisely why letterMeta exists. */}
                                {shownMeta.includes("lastWorkingDay") && (
                                    <Field label="Last working day"
                                        hint="Not stored on the employee record — captured here.">
                                        <Input type="date" value={meta.lastWorkingDay}
                                            onChange={(e) => setMeta({ ...meta, lastWorkingDay: e.target.value })} />
                                    </Field>
                                )}
                                {shownMeta.includes("resignationDate") && (
                                    <Field label="Resignation date">
                                        <Input type="date" value={meta.resignationDate}
                                            onChange={(e) => setMeta({ ...meta, resignationDate: e.target.value })} />
                                    </Field>
                                )}
                                {shownMeta.includes("noticePeriodDays") && (
                                    <Field label="Notice period (days)">
                                        <Input type="number" min="0" value={meta.noticePeriodDays}
                                            onChange={(e) => setMeta({ ...meta, noticePeriodDays: e.target.value })} />
                                    </Field>
                                )}
                                {shownMeta.includes("annualCTC") && (
                                    <Field label="Annual CTC"
                                        hint={prefill?.salary ? "Read from payroll. Confirm before issuing." : "Type the figure exactly as it should read."}>
                                        <Input value={meta.annualCTC}
                                            onChange={(e) => setMeta({ ...meta, annualCTC: e.target.value })}
                                            placeholder="INR 4,80,000" />
                                    </Field>
                                )}
                                {shownMeta.includes("guardian") && (
                                    <>
                                        <Field label="Relation"
                                            hint="Printed under the name, as on the signed letters.">
                                            <Select value={meta.guardianRelation || "S/o"}
                                                onChange={(e) => setMeta({ ...meta, guardianRelation: e.target.value })}>
                                                <option value="S/o">S/o — son of</option>
                                                <option value="D/o">D/o — daughter of</option>
                                                <option value="W/o">W/o — wife of</option>
                                                <option value="C/o">C/o — care of</option>
                                            </Select>
                                        </Field>
                                        <Field label="Father's / husband's name"
                                            hint="Leave blank to omit the line entirely.">
                                            <Input value={meta.guardianName}
                                                onChange={(e) => setMeta({ ...meta, guardianName: e.target.value })}
                                                placeholder="As it should read on the letter" />
                                        </Field>
                                    </>
                                )}
                                {shownMeta.includes("placeOfPosting") && (
                                    <Field label="Place of posting">
                                        <Input value={meta.placeOfPosting}
                                            onChange={(e) => setMeta({ ...meta, placeOfPosting: e.target.value })}
                                            placeholder={APPOINTMENT_DEFAULTS.placeOfPosting} />
                                    </Field>
                                )}
                                {shownMeta.includes("signatory") && (
                                    <>
                                        <Field label="Signed by">
                                            <Input value={meta.signatoryName}
                                                onChange={(e) => setMeta({ ...meta, signatoryName: e.target.value })}
                                                placeholder="Name on the signature line" />
                                        </Field>
                                        <Field label="Signatory designation">
                                            <Input value={meta.signatoryDesignation}
                                                onChange={(e) => setMeta({ ...meta, signatoryDesignation: e.target.value })}
                                                placeholder={APPOINTMENT_DEFAULTS.signatoryDesignation} />
                                        </Field>
                                    </>
                                )}
                            </div>

                            {shownMeta.includes("address") && (
                                <Field className="mt-3" label="Address"
                                    hint="One line per line, exactly as it should print. Prefilled from the employee record.">
                                    <Textarea rows={3} value={meta.addressText}
                                        onChange={(e) => setMeta({ ...meta, addressText: e.target.value })}
                                        placeholder={"At- Village, PO- Post office\nDist- District, State- 000000"} />
                                </Field>
                            )}

                            {shownMeta.includes("salary") && salaryPreview && (
                                <div className="mt-3 rounded-card border border-hairline bg-[var(--surface)] p-3">
                                    <p className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                                        Annexure I — salary
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <Field label="Monthly gross (INR)"
                                            hint={prefill?.salary?.gross ? "From payroll. Confirm it." : "Everything below is derived from this."}>
                                            <Input type="number" min="0" value={meta.grossSalary}
                                                onChange={(e) => setMeta({ ...meta, grossSalary: e.target.value })}
                                                placeholder="12406" />
                                        </Field>
                                        <Field label="Food allowance (INR)">
                                            <Input type="number" min="0" value={meta.foodAllowance}
                                                onChange={(e) => setMeta({ ...meta, foodAllowance: e.target.value })}
                                                placeholder={String(APPOINTMENT_DEFAULTS.foodAllowance)} />
                                        </Field>
                                        <Field label="Professional tax (INR)">
                                            <Input type="number" min="0" value={meta.professionalTax}
                                                onChange={(e) => setMeta({ ...meta, professionalTax: e.target.value })}
                                                placeholder="0" />
                                        </Field>
                                    </div>

                                    {/* The table that will print, computed by the code that prints it. */}
                                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                                        {[
                                            ["Basic (50%)", salaryPreview.basic],
                                            ["HRA (50%)", salaryPreview.hra],
                                            ["EPF (12%)", salaryPreview.epf],
                                            ...(salaryPreview.edli > 0 ? [["EDLI", salaryPreview.edli]] : []),
                                            ...(salaryPreview.adminCharges > 0 ? [["Admin charges", salaryPreview.adminCharges]] : []),
                                            ...(salaryPreview.esicApplies ? [["ESIC (0.75%)", salaryPreview.eeEsic]] : []),
                                            ["Deductions", salaryPreview.totalDeduction],
                                            ["Net salary", salaryPreview.netSalary],
                                            ["Employer EPF", salaryPreview.erEpf],
                                            ...(salaryPreview.esicApplies ? [["Employer ESIC", salaryPreview.erEsic]] : []),
                                            ...(salaryPreview.foodAllowance > 0 ? [["Food allowance", salaryPreview.foodAllowance]] : []),
                                            ["Monthly CTC", salaryPreview.ctc],
                                        ].map(([label, val]) => (
                                            <div key={label} className="flex items-baseline justify-between gap-2 border-b border-hairline py-1">
                                                <dt className="text-ink-faint">{label}</dt>
                                                <dd className="text-ink" data-figure>{inr(val)}</dd>
                                            </div>
                                        ))}
                                    </dl>

                                    {salaryPreview.fromPayroll ? (
                                        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                            These are the employee&rsquo;s stored payroll figures, printed as-is, so
                                            Annexure&nbsp;I matches their profile and payslip exactly. Changing the
                                            gross above switches to a computed breakdown.
                                        </p>
                                    ) : salaryPreview.gross > 0 ? (
                                        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                            Computed, not read from payroll &mdash; this employee has no salary on
                                            record, or you changed the gross. Check it against payroll before issuing.
                                        </p>
                                    ) : null}

                                    {!salaryPreview.esicApplies && salaryPreview.gross > 0 && (
                                        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                            Gross is above the INR 21,000 ESIC ceiling, so both ESIC rows are
                                            left off the letter entirely rather than printed as zero.
                                        </p>
                                    )}
                                    {salaryPreview.pfCapped && (
                                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-muted">
                                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                            EPF is computed on the statutory basic ceiling of INR 15,000, as the
                                            letter states.
                                        </p>
                                    )}
                                </div>
                            )}

                            {shownMeta.includes("remarks") && (
                                <Field className="mt-3"
                                    label={kind === "warning" ? "What is being warned about" : "Remarks"}
                                    hint={kind === "warning" || kind === "other"
                                        ? "This becomes the body of the letter."
                                        : "Added to the letter under a Remarks heading."}>
                                    <Textarea rows={3} value={meta.remarks} maxLength={1000}
                                        onChange={(e) => setMeta({ ...meta, remarks: e.target.value })}
                                        placeholder={kind === "warning"
                                            ? "State the conduct, the date it occurred, and what must change."
                                            : "Anything that must appear in the letter."} />
                                </Field>
                            )}
                        </div>
                    )}

                    {/* The PDF itself */}
                    <div>
                        <div className="mb-2 flex items-center gap-1">
                            {[
                                { id: "compose", label: "Build the letter" },
                                { id: "upload", label: "Upload a signed PDF" },
                            ].map((t) => (
                                <button key={t.id} type="button"
                                    onClick={() => {
                                        setSource(t.id);
                                        setFile(null);
                                        setError("");
                                        setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return ""; });
                                    }}
                                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${source === t.id
                                        ? "bg-[var(--control)] text-ink"
                                        : "text-ink-muted hover:bg-[var(--surface-sunken)] hover:text-ink"
                                        }`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {source === "compose" ? (
                            <div className="rounded-card border border-hairline bg-[var(--surface-sunken)] p-4">
                                <p className="text-xs text-ink-muted">
                                    Builds a PDF from the details above, on the Matrubhoomi letterhead. Check the
                                    preview before you save — once a document is released it is a record and
                                    cannot be deleted, only withdrawn.
                                </p>

                                {/* Signature. Sits with the Build button because it is an input to the
                                    page, not a property of the record — nothing here is ever posted. */}
                                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-inset bg-[var(--surface)] p-3">
                                    <input ref={signatureRef} type="file" accept="image/png,image/jpeg" className="hidden"
                                        onChange={(e) => takeSignature(e.target.files?.[0])} />
                                    {signature ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={signature} alt="Authorised signature"
                                                className="h-10 w-auto max-w-[140px] object-contain" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-medium text-ink">Signature ready</p>
                                                <p className="text-[11px] text-ink-faint">
                                                    Remembered on this browser. It is drawn into the PDF and never uploaded.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Button tone="ghost" onClick={() => signatureRef.current?.click()}>
                                                    <RefreshCw className="h-3.5 w-3.5" /> Replace
                                                </Button>
                                                <button type="button" onClick={clearSignature}
                                                    aria-label="Remove the signature"
                                                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink">
                                                    <Trash className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                                                <PenLine size={15} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-medium text-ink">Add the authorised signature</p>
                                                <p className="text-[11px] text-ink-faint">
                                                    PNG or JPG — a transparent PNG sits best on the page. Without one the
                                                    letter prints a blank signing space.
                                                </p>
                                            </div>
                                            <Button tone="ghost" onClick={() => signatureRef.current?.click()}>
                                                <ImageIcon className="h-3.5 w-3.5" /> Upload
                                            </Button>
                                        </>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <Button tone="secondary" onClick={compose} disabled={composing || !kind || !employeeId}>
                                        {composing
                                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</>
                                            : <><Sparkles className="h-4 w-4" /> {file ? "Rebuild the letter" : "Build the letter"}</>}
                                    </Button>
                                    {file && (
                                        <span className="text-xs text-ink-faint">
                                            {file.name} · <span data-figure>{fmtBytes(file.size)}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={onDrop}
                                onClick={() => fileRef.current?.click()}
                                className={`relative flex cursor-pointer flex-col items-center rounded-card border-2 border-dashed p-8 transition-colors duration-[180ms] ${dragging
                                    ? "border-ink bg-[var(--control-active)]"
                                    : file
                                        ? "border-[var(--state-positive)] bg-[color-mix(in_srgb,var(--state-positive)_14%,transparent)]"
                                        : "border-hairline bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                                    }`}>
                                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                                    onChange={(e) => takeFile(e.target.files?.[0])} />
                                {file ? (
                                    <>
                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-[color-mix(in_srgb,var(--state-positive)_22%,transparent)]">
                                            <CheckCircle2 className="h-6 w-6 text-[var(--state-positive-ink)]" />
                                        </div>
                                        <p className="text-sm font-medium text-[var(--state-positive-ink)]">{file.name}</p>
                                        <p className="mt-1 text-xs text-ink-muted">
                                            <span data-figure>{fmtBytes(file.size)}</span> · click to choose another
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-[var(--control)]">
                                            <Upload className="h-6 w-6 text-ink-muted" />
                                        </div>
                                        <p className="text-sm font-medium text-ink">Drop the signed PDF here</p>
                                        <p className="mt-1 text-xs text-ink-faint">or click to browse · PDF only, up to 10 MB</p>
                                    </>
                                )}
                            </div>
                        )}

                        {previewUrl && (
                            <div className="mt-3 overflow-hidden rounded-card border border-hairline">
                                <iframe title="Document preview" src={previewUrl} className="h-[26rem] w-full bg-white" />
                            </div>
                        )}
                    </div>

                    <Field label="Internal note" hint="HR-only. Never shown to the employee, in any response.">
                        <Textarea rows={2} value={hrNotes} maxLength={2000}
                            onChange={(e) => setHrNotes(e.target.value)}
                            placeholder="Why this was issued, who asked for it, anything the next person needs." />
                    </Field>

                    {error && <InlineError compact message={error} />}
                </div>

                {/* Footer — the safe action is the primary one */}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline px-5 py-3">
                    <Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                    <RoleGate min="editor">
                        <Button tone="secondary" onClick={() => save(true)} disabled={busy}>
                            {saving === "release"
                                ? <><Loader2 size={14} className="animate-spin" /> Releasing…</>
                                : <><Send size={14} /> Save and release</>}
                        </Button>
                    </RoleGate>
                    <RoleGate min="editor">
                        <Button tone="primary" onClick={() => save(false)} disabled={busy}>
                            {saving === "hold"
                                ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                                : <><Check size={14} /> Save (not released)</>}
                        </Button>
                    </RoleGate>
                </div>
            </div>
        </div>
    );
}

/** Drop the blanks so an untouched field never overwrites a stored value. */
function cleanMeta(meta) {
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
        if (v === "" || v === null || v === undefined) continue;
        out[k] = k === "noticePeriodDays" ? Number(v) : v;
    }
    return out;
}

/** Best-effort annual figure out of whatever shape payroll returned. */
function ctcFromPrefill(prefill) {
    const s = prefill?.salary;
    if (!s || typeof s !== "object") return "";
    const annual = s.ctc ?? s.annualCTC ?? s.costToCompany;
    if (annual) return `INR ${Number(annual).toLocaleString("en-IN")}`;
    const monthly = s.grossSalary ?? s.gross ?? s.monthlyCTC;
    if (monthly) return `INR ${(Number(monthly) * 12).toLocaleString("en-IN")}`;
    return "";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Document drawer
//
//  Tabs are rendered ONLY where the corresponding gate passes, so the UI can
//  never offer an action the server would 400. Every mutating control is inside
//  a RoleGate as well — belt and braces; that is UX, the server is the real
//  gate.
// ─────────────────────────────────────────────────────────────────────────────

export function DocumentDrawer({
    doc,
    onClose,
    onReleased,
    onRevoked,
    onDeclined,
    onFileReplaced,
    onDeleted,
}) {
    const [tab, setTab] = useState("details");
    const [note, setNote] = useState("");
    const [revokeReason, setRevokeReason] = useState("");
    const [declineReason, setDeclineReason] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const replaceRef = useRef(null);

    const releasable = canRelease(doc);
    const revocable = canRevoke(doc);
    const declinable = canDecline(doc);
    const deletable = canDelete(doc);
    const TypeIcon = typeIcon(doc.type);

    // Any tab whose gate closed under us (a release happened, say) must fall
    // back rather than render a form the server would now refuse.
    useEffect(() => {
        if (tab === "release" && !releasable) setTab("details");
        if (tab === "revoke" && !revocable) setTab("details");
        if (tab === "decline" && !declinable) setTab("details");
    }, [tab, releasable, revocable, declinable]);

    const run = useCallback(async (fn) => {
        setWorking(true);
        setError("");
        try {
            await fn();
        } catch (e) {
            setError(e.message);
        } finally {
            setWorking(false);
        }
    }, []);

    const doRelease = () => run(async () => {
        const out = await apiJson(`/api/hr/documents/${doc._id}/release`, {
            method: "PATCH", body: { note: note.trim() },
        });
        setNote("");
        onReleased(out);
    });

    const doRevoke = () => run(async () => {
        const out = await apiJson(`/api/hr/documents/${doc._id}/revoke`, {
            method: "PATCH", body: { reason: revokeReason.trim() },
        });
        setRevokeReason("");
        onRevoked(out);
    });

    const doDecline = () => run(async () => {
        const out = await apiJson(`/api/hr/documents/${doc._id}/decline`, {
            method: "PATCH", body: { reason: declineReason.trim() },
        });
        setDeclineReason("");
        onDeclined(out);
    });

    const doDelete = () => run(async () => {
        const out = await apiJson(`/api/hr/documents/${doc._id}`, { method: "DELETE" });
        onDeleted(out);
    });

    const doReplace = (f) => {
        if (!f) return;
        if (f.type !== "application/pdf") { setError("Only a PDF can be issued as a letter."); return; }
        if (f.size > 10 * 1024 * 1024) { setError("That file is over the 10 MB limit."); return; }
        run(async () => {
            const fd = new FormData();
            fd.append("document", f, f.name);
            const out = await apiForm(`/api/hr/documents/${doc._id}/file`, fd);
            onFileReplaced(out);
        });
    };

    const tabs = [
        { id: "details", label: "Details", on: "bg-[var(--control)] text-ink", show: true },
        {
            id: "release", label: "Release", show: releasable,
            on: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
        },
        {
            id: "decline", label: "Decline", show: declinable,
            on: "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] text-[var(--state-overdue-ink)]",
        },
        {
            id: "revoke", label: "Withdraw", show: revocable,
            on: "bg-[color-mix(in_srgb,var(--state-rework)_24%,transparent)] text-[var(--state-rework-ink)]",
        },
    ].filter((t) => t.show);

    return (
        <div className="fixed inset-0 z-[80] flex overflow-hidden bg-black/55" onClick={working ? undefined : onClose}>
            <div className="flex-1" />
            <div className="frost-bar animate-slide-in flex min-h-0 w-full max-w-2xl flex-col border-l border-hairline"
                onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-5">
                    <div className="flex min-w-0 items-start gap-4">
                        <Avatar name={doc.employeeName} size="lg" />
                        <div className="min-w-0">
                            <h2 className="truncate text-[17px] font-medium tracking-[-0.02em] text-ink">
                                {doc.employeeName || "Unknown employee"}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                                {doc.biometricId ? <span data-figure>{doc.biometricId}</span> : null}
                                <span>·</span>
                                <span>{doc.designation || "—"}</span>
                                <span>·</span>
                                <span>{doc.department || "—"}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Chip tone="neutral"><TypeIcon className="h-3 w-3" /> {docLabel(doc)}</Chip>
                                <ReleaseChip doc={doc} />
                                {doc.requestStatus !== "none" && (
                                    <Chip tone={REQUEST_META[doc.requestStatus]?.tone || "neutral"}>
                                        Request: {REQUEST_META[doc.requestStatus]?.label || doc.requestStatus}
                                    </Chip>
                                )}
                            </div>
                        </div>
                    </div>
                    <Button tone="ghost" size="sm" onClick={onClose} disabled={working} aria-label="Close">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Tabs */}
                {tabs.length > 1 && (
                    <div className="shrink-0 border-b border-hairline px-6 py-2">
                        <div className="rail flex items-center gap-1 overflow-x-auto">
                            {tabs.map((t) => (
                                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${tab === t.id ? t.on : "text-ink-muted hover:bg-[var(--control)] hover:text-ink"
                                        }`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Body */}
                <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                    {error && <InlineError message={error} />}

                    {tab === "details" && (
                        <>
                            {/* Visibility, first — it is what the whole feature is about. */}
                            <div className={`flex items-start gap-3 rounded-card p-4 ${doc.released
                                ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)]"
                                : isRevoked(doc)
                                    ? "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)]"
                                    : "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)]"
                                }`}>
                                {doc.released
                                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-positive-ink)]" />
                                    : isRevoked(doc)
                                        ? <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-overdue-ink)]" />
                                        : <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-rework-ink)]" />}
                                <div className={`text-xs leading-relaxed ${doc.released
                                    ? "text-[var(--state-positive-ink)]"
                                    : isRevoked(doc) ? "text-[var(--state-overdue-ink)]" : "text-[var(--state-rework-ink)]"
                                    }`}>
                                    <p className="text-sm font-medium">{visibilityLine(doc)}</p>
                                    <p className="mt-1">
                                        {doc.released ? (
                                            <>
                                                Released {fmtDateTime(doc.releasedAt)}
                                                {doc.releasedByName ? ` by ${doc.releasedByName}` : ""}
                                                {doc.releaseCount > 1 ? ` · released ${doc.releaseCount} times in total` : ""}
                                            </>
                                        ) : isRevoked(doc) ? (
                                            <>
                                                Withdrawn {fmtDateTime(doc.revokedAt)}
                                                {doc.revokedByName ? ` by ${doc.revokedByName}` : ""}
                                                {doc.revokeReason ? ` — ${doc.revokeReason}` : ""}
                                            </>
                                        ) : doc.generated ? (
                                            "It sits in the HR library only. It appears in no employee-facing response, and cannot be reached by guessing its id."
                                        ) : (
                                            "Attach a PDF before it can be released."
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* The employee's ask */}
                            {doc.requestStatus !== "none" && (
                                <Section title="The employee's request" icon={Send}>
                                    <div className="rounded-inset bg-[var(--surface-sunken)] p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Chip tone={REQUEST_META[doc.requestStatus]?.tone || "neutral"}>
                                                {REQUEST_META[doc.requestStatus]?.label || doc.requestStatus}
                                            </Chip>
                                            <span data-figure className="text-[11px] text-ink-faint">
                                                {fmtDateTime(doc.requestedAt)}
                                            </span>
                                        </div>
                                        {doc.requestReason && (
                                            <p className="mt-2 text-sm whitespace-pre-wrap text-ink-muted">{doc.requestReason}</p>
                                        )}
                                        {doc.requestStatus === "declined" && (
                                            <p className="mt-2 text-xs text-ink-muted">
                                                Declined {fmtDateTime(doc.declinedAt)}
                                                {doc.declinedByName ? ` by ${doc.declinedByName}` : ""}
                                                {doc.declineReason ? ` — ${doc.declineReason}` : ""}
                                            </p>
                                        )}
                                        {doc.requestStatus === "cancelled" && (
                                            <p className="mt-2 text-xs text-ink-muted">
                                                Cancelled by the employee {fmtDateTime(doc.cancelledAt)}. Anything already
                                                generated stayed hidden.
                                            </p>
                                        )}
                                    </div>
                                </Section>
                            )}

                            {/* The file */}
                            <Section title="The document" icon={FileText}>
                                {hasFile(doc.file) ? (
                                    <div className="space-y-2">
                                        <FileLink file={doc.file} docId={doc._id} onError={setError} />
                                        <p className="text-[11px] text-ink-faint">
                                            Generated {fmtDateTime(doc.generatedAt)}
                                            {doc.generatedByName ? ` by ${doc.generatedByName}` : ""}
                                        </p>
                                        <RoleGate min="editor">
                                            <input ref={replaceRef} type="file" accept="application/pdf,.pdf" className="hidden"
                                                onChange={(e) => { doReplace(e.target.files?.[0]); e.target.value = ""; }} />
                                            <Button tone="secondary" size="sm" disabled={working}
                                                onClick={() => replaceRef.current?.click()}>
                                                <Upload className="h-3.5 w-3.5" /> Replace the file
                                            </Button>
                                            <p className="text-[11px] text-ink-faint">
                                                Replacing does not change whether it is released. A released document stays
                                                released, at the new file.
                                            </p>
                                        </RoleGate>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="rounded-inset bg-[var(--surface-sunken)] px-3 py-2 text-xs text-ink-muted">
                                            Nothing has been generated for this row yet.
                                        </p>
                                        <RoleGate min="editor">
                                            <input ref={replaceRef} type="file" accept="application/pdf,.pdf" className="hidden"
                                                onChange={(e) => { doReplace(e.target.files?.[0]); e.target.value = ""; }} />
                                            <Button tone="secondary" size="sm" disabled={working}
                                                onClick={() => replaceRef.current?.click()}>
                                                <Upload className="h-3.5 w-3.5" /> Attach a PDF
                                            </Button>
                                        </RoleGate>
                                    </div>
                                )}
                            </Section>

                            {/* Letter details */}
                            {doc.letterMeta && Object.values(doc.letterMeta).some((v) => v !== null && v !== "" && v !== undefined) && (
                                <Section title="Letter details" icon={FileSignature}>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-inset bg-[var(--surface-sunken)] p-3">
                                        {[
                                            ["Reference", doc.letterMeta.referenceNo],
                                            ["Issued", doc.letterMeta.issueDate && fmtDate(doc.letterMeta.issueDate)],
                                            ["Effective from", doc.letterMeta.effectiveDate && fmtDate(doc.letterMeta.effectiveDate)],
                                            ["Last working day", doc.letterMeta.lastWorkingDay && fmtDate(doc.letterMeta.lastWorkingDay)],
                                            ["Resigned", doc.letterMeta.resignationDate && fmtDate(doc.letterMeta.resignationDate)],
                                            ["Notice period", doc.letterMeta.noticePeriodDays && `${doc.letterMeta.noticePeriodDays} days`],
                                            ["Annual CTC", doc.letterMeta.annualCTC],
                                            ["Signed by", doc.letterMeta.signatoryName],
                                            ["Signatory role", doc.letterMeta.signatoryDesignation],
                                        ]
                                            .filter(([, v]) => v)
                                            .map(([k, v]) => (
                                                <div key={k} className="min-w-0">
                                                    <dt className="text-[11px] text-ink-faint">{k}</dt>
                                                    <dd data-figure className="truncate text-sm text-ink">{v}</dd>
                                                </div>
                                            ))}
                                    </dl>
                                    {doc.letterMeta.remarks && (
                                        <p className="mt-2 text-sm whitespace-pre-wrap text-ink-muted">{doc.letterMeta.remarks}</p>
                                    )}
                                </Section>
                            )}

                            {/* HR-only note */}
                            {doc.hrNotes && (
                                <Section title="Internal note" icon={Info}>
                                    <p className="rounded-inset bg-[var(--surface-sunken)] p-3 text-sm whitespace-pre-wrap text-ink-muted">
                                        {doc.hrNotes}
                                    </p>
                                    <p className="mt-1 text-[11px] text-ink-faint">HR-only. Never sent to the employee.</p>
                                </Section>
                            )}

                            {/* Timeline */}
                            <Section title="History" icon={History}>
                                {(doc.history || []).length === 0 ? (
                                    <p className="rounded-inset bg-[var(--surface-sunken)] px-3 py-2 text-xs text-ink-muted">
                                        Nothing recorded yet.
                                    </p>
                                ) : (
                                    <ol className="space-y-1.5">
                                        {[...(doc.history || [])].reverse().map((h, i) => {
                                            const m = HISTORY_META[h.action] || { label: h.action, icon: Info };
                                            const HIcon = m.icon;
                                            return (
                                                <li key={i} className="rounded-inset bg-[var(--surface-sunken)] p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="flex min-w-0 items-center gap-2">
                                                            <HIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                                                            <span className="truncate text-sm font-medium text-ink">{m.label}</span>
                                                            <span className="shrink-0 text-[10px] tracking-[0.09em] text-ink-faint uppercase">
                                                                {h.byRole === "hr" ? "HR" : "Employee"}
                                                            </span>
                                                        </span>
                                                        <span data-figure className="shrink-0 text-[10px] text-ink-faint">
                                                            {fmtDateTime(h.at)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-ink-muted">
                                                        {h.byName || "—"}{h.note ? ` — ${h.note}` : ""}
                                                    </p>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}
                            </Section>

                            {/* Shortcuts into the gated tabs */}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {releasable && (
                                    <RoleGate min="editor">
                                        <Button tone="primary" onClick={() => setTab("release")}>
                                            <Send className="h-4 w-4" /> Release to the employee
                                        </Button>
                                    </RoleGate>
                                )}
                                {declinable && (
                                    <RoleGate min="editor">
                                        <Button tone="destructive" onClick={() => setTab("decline")}>
                                            <XCircle className="h-4 w-4" /> Decline the request
                                        </Button>
                                    </RoleGate>
                                )}
                                {revocable && (
                                    <RoleGate min="editor">
                                        <Button tone="secondary" onClick={() => setTab("revoke")}>
                                            <Undo2 className="h-4 w-4" /> Withdraw
                                        </Button>
                                    </RoleGate>
                                )}
                            </div>

                            {/* Delete — only while it has never been released */}
                            <RoleGate min="editor">
                                <div className="border-t border-hairline pt-4">
                                    {deletable ? (
                                        confirmDelete ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-xs text-ink-muted">
                                                    Delete this document and its file for good?
                                                </span>
                                                <Button tone="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={working}>
                                                    Keep it
                                                </Button>
                                                <Button tone="destructive" size="sm" onClick={doDelete} disabled={working}>
                                                    {working
                                                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</>
                                                        : <><Trash2 className="h-3.5 w-3.5" /> Delete</>}
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button tone="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                                                <Trash2 className="h-3.5 w-3.5" /> Delete this document
                                            </Button>
                                        )
                                    ) : (
                                        <p className="flex items-start gap-1.5 text-xs text-ink-faint">
                                            <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                            This has been released at least once, so it is a record and cannot be
                                            deleted. Withdraw it instead.
                                        </p>
                                    )}
                                </div>
                            </RoleGate>
                        </>
                    )}

                    {tab === "release" && releasable && (
                        <div className="space-y-4">
                            <div className="rounded-card bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[var(--state-positive)]">
                                        <Send className="h-5 w-5 text-slab-ink" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-[var(--state-positive-ink)]">
                                            Release to {doc.employeeName || "the employee"}
                                        </h3>
                                        <p className="mt-1 text-xs text-[var(--state-positive-ink)]">
                                            The document becomes visible in their app immediately and they are notified
                                            on their phone.
                                            {doc.requestStatus === "requested" && " Their open request is marked fulfilled."}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-inset bg-[var(--surface-sunken)] p-3">
                                <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">Releasing</p>
                                <p className="text-sm text-ink">{docLabel(doc)}</p>
                                <p className="mt-0.5 text-xs text-ink-muted">{doc.file?.fileName || "the attached PDF"}</p>
                            </div>

                            <Field label="Note (optional)" hint="Recorded in the history. Not shown to the employee.">
                                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                                    placeholder="Anything worth recording about this release…" />
                            </Field>

                            <div className="flex gap-2 pt-2">
                                <Button tone="secondary" onClick={() => setTab("details")} disabled={working} className="flex-1">
                                    Cancel
                                </Button>
                                <RoleGate min="editor">
                                    <Button tone="primary" onClick={doRelease} disabled={working} className="flex-1">
                                        {working
                                            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Releasing…</>
                                            : <><Check className="h-4 w-4" /> Confirm release</>}
                                    </Button>
                                </RoleGate>
                            </div>
                        </div>
                    )}

                    {tab === "decline" && declinable && (
                        <div className="space-y-4">
                            <div className="rounded-card bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[var(--state-overdue)]">
                                        <XCircle className="h-5 w-5 text-slab-ink" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-[var(--state-overdue-ink)]">Decline the request</h3>
                                        <p className="mt-1 text-xs text-[var(--state-overdue-ink)]">
                                            Terminal for this ask, and the employee reads the reason in the app. Anything
                                            already generated stays exactly where it is — hidden.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Field label="Reason"
                                hint="Optional, but write one. Without it the app shows no explanation at all.">
                                <Textarea rows={4} value={declineReason} maxLength={500}
                                    onChange={(e) => setDeclineReason(e.target.value)}
                                    placeholder="e.g. An experience letter is issued only after the last working day." />
                            </Field>

                            <div className="flex gap-2 pt-2">
                                <Button tone="secondary" onClick={() => setTab("details")} disabled={working} className="flex-1">
                                    Cancel
                                </Button>
                                <RoleGate min="editor">
                                    <Button tone="destructive" onClick={doDecline} disabled={working} className="flex-1">
                                        {working
                                            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Declining…</>
                                            : <><X className="h-4 w-4" /> Confirm decline</>}
                                    </Button>
                                </RoleGate>
                            </div>
                        </div>
                    )}

                    {tab === "revoke" && revocable && (
                        <div className="space-y-4">
                            <div className="rounded-card bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[var(--state-rework)]">
                                        <Undo2 className="h-5 w-5 text-slab-ink" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-[var(--state-rework-ink)]">Withdraw from the employee</h3>
                                        <p className="mt-1 text-xs text-[var(--state-rework-ink)]">
                                            The document disappears from their app and they are notified. It stays in the
                                            HR library and can be released again.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] p-3 text-xs text-[var(--state-overdue-ink)]">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                    Withdrawing hides it — it does not unpublish the file. A link the employee
                                    already saved may still open.
                                </span>
                            </div>

                            <Field label="Reason" required hint="Recorded in the history and required by the server.">
                                <Textarea rows={4} value={revokeReason} maxLength={500}
                                    onChange={(e) => setRevokeReason(e.target.value)}
                                    placeholder="e.g. Superseded by a corrected copy." />
                            </Field>

                            <div className="flex gap-2 pt-2">
                                <Button tone="secondary" onClick={() => setTab("details")} disabled={working} className="flex-1">
                                    Cancel
                                </Button>
                                <RoleGate min="editor">
                                    <Button tone="destructive" onClick={doRevoke}
                                        disabled={working || !revokeReason.trim()} className="flex-1">
                                        {working
                                            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Withdrawing…</>
                                            : <><Undo2 className="h-4 w-4" /> Confirm withdraw</>}
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
