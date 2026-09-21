"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Edit2,
  Save,
  X,
  Loader2,
  Upload,
  Check,
  Plus,
  Trash2,
  Search,
  AlertCircle,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import {
  uploadToCloudinary,
  uploadProfilePhoto,
  uploadDocument,
  uploadAdditionalDocument,
} from "@/lib/cloudinaryUpload";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PanelHead,
  Button,
  Field,
  InlineError,
} from "@/components/ceo/ui/Primitives";

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
// Same material as the kit's Input/Textarea/Select. Kept as class strings
// because several controls here need their own ref or a conditional border.
const INP =
  "w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint " +
  "shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow duration-[180ms] " +
  "focus:shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus:outline-none disabled:opacity-50";

const INP_DISABLED =
  "w-full rounded-inset bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm text-ink-muted " +
  "shadow-[inset_0_0_0_1px_var(--color-hairline)] cursor-not-allowed focus:outline-none";

const SEL = `${INP} cursor-pointer appearance-none pr-9`;

const SEL_ARROW = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23888' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
};

// ─── FIELD PRIMITIVES ─────────────────────────────────────────────────────────

// Fixed Val component with proper masking
function Val({ label, value, masked }) {
  const [show, setShow] = useState(false);

  const displayValue =
    value !== undefined && value !== null && value !== "" ? String(value) : "–";

  const getMaskedValue = () => {
    if (!masked || show || displayValue === "–") return displayValue;
    const len = displayValue.length;
    if (len <= 4) return "••••";
    return (
      displayValue.slice(0, 2) + "•".repeat(len - 4) + displayValue.slice(-2)
    );
  };

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
        {label}
      </p>
      <div className="flex min-h-[24px] items-center gap-1.5">
        <p data-figure className="text-sm font-medium break-all text-ink">
          {getMaskedValue()}
        </p>
        {masked && displayValue !== "–" && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShow((s) => !s);
            }}
            className="shrink-0 rounded-full p-0.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            aria-label={show ? "Hide value" : "Show value"}
          >
            {show ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Read-only display for an uploaded file. Shows "Uploaded" plus an eye button
// that opens the stored file URL in a new tab. The file object may carry the
// URL under `cloudinaryUrl`, `url`, or `viewUrl` (depending on whether it was
// just uploaded this session or loaded from the DB), so we fall back across
// all of them. When there's no file, it renders the same "–" placeholder Val
// uses, so the layout stays identical to the other fields.
function FileVal({ label, file }) {
  const url =
    file?.cloudinaryUrl ||
    file?.url ||
    file?.viewUrl ||
    (typeof file === "string" ? file : null);

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
        {label}
      </p>
      <div className="flex min-h-[24px] items-center gap-1.5">
        {url ? (
          <>
            <p className="text-sm font-medium break-all text-ink">Uploaded</p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="shrink-0 rounded-full p-0.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              aria-label={`View ${label}`}
              title={`View ${label}`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <p className="text-sm font-medium break-all text-ink">–</p>
        )}
      </div>
    </div>
  );
}

// Fixed Input component - prevents cursor jumping using ref to preserve selection
/** The human-readable shift label, derived from the one Shift field. */
function shiftLabel(form) {
  if (form.workShiftMode === "custom") {
    return form.workShiftStart && form.workShiftEnd
      ? `Custom ${form.workShiftStart}\u2013${form.workShiftEnd}`
      : "Custom";
  }
  if (form.workShiftMode === "core") return "Core";
  if (form.workShiftMode === "general") return "General";
  return "";
}

/**
 * The same shift, for reading rather than for storing.
 *
 * shiftLabel above is written to the legacy `shift` string that exports and
 * the CEO page read, so it stays hours-only. The punch count is part of the
 * shift too, and the review tab is where HR checks their own work before
 * saving — a wrong one there is a miss-punch flag every day afterwards.
 */
function shiftSummary(form) {
  const base = shiftLabel(form);
  if (!base) return "";
  const n =
    form.workShiftMode === "custom"
      ? Number(form.workShiftPunches) || 2
      : form.workShiftMode === "general"
        ? 6
        : 2;
  return `${base} · ${n} punches/day`;
}

function TI({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
  hint,
  ...props
}) {
  const inputRef = useRef(null);
  const selectionRef = useRef(null);

  const handleChange = useCallback(
    (e) => {
      if (type === "text" || type === "email" || type === "tel") {
        selectionRef.current = e.target.selectionStart;
      }
      onChange(e);
    },
    [onChange, type],
  );

  useEffect(() => {
    const el = inputRef.current;
    if (
      el &&
      selectionRef.current !== null &&
      document.activeElement === el &&
      (type === "text" || type === "email" || type === "tel")
    ) {
      el.setSelectionRange(selectionRef.current, selectionRef.current);
      selectionRef.current = null;
    }
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint}
      </div>
      <input
        ref={inputRef}
        data-figure={type === "number" || type === "date" ? "" : undefined}
        className={disabled ? INP_DISABLED : INP}
        type={type}
        value={value || ""}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        {...props}
      />
    </div>
  );
}

function SI({ label, value, onChange, children, ...props }) {
  return (
    <Field label={label}>
      <select
        className={SEL}
        style={SEL_ARROW}
        value={value || ""}
        onChange={onChange}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

function CHK({ label, checked, onChange }) {
  return (
    <Field label={label}>
      <select
        className={SEL}
        style={SEL_ARROW}
        value={checked ? "yes" : "no"}
        onChange={(e) => onChange(e.target.value === "yes")}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    </Field>
  );
}

function Fld({ label, children }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

// ─── PER-FIELD FORMULA HINT ───────────────────────────────────────────────────
// Small ⓘ that shows a tooltip with the formula for that specific field
function FHint({ formula, note }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex items-center" style={{ zIndex: 50 }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-hairline text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
        tabIndex={-1}
        aria-label={`Formula: ${formula}`}
      >
        <Info className="w-2 h-2" />
      </button>

      {open && (
        <div
          className="frost-bar absolute top-1/2 left-5 -translate-y-1/2 rounded-inset border border-hairline px-3 py-2 shadow-xl"
          style={{ zIndex: 9999, minWidth: "200px", maxWidth: "280px" }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-[11px] leading-snug font-medium text-ink">
            {formula}
          </p>
          {note && (
            <p className="mt-0.5 text-[10px] leading-snug text-ink-muted">
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SECTION WRAPPER ──────────────────────────────────────────────────────────
function Sec({
  title,
  id,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
  children,
}) {
  return (
    <Panel label={title}>
      <PanelHead
        title={title}
        aside={
          <div className="flex items-center gap-2">
            {/* Editing is an editor+ action. A viewer sees the record but never
                the pencil; the server enforces the same, so hiding it is only
                courtesy. */}
            {onSave && !editing && (
              <RoleGate min="editor">
                <Button
                  tone="ghost"
                  size="sm"
                  type="button"
                  onClick={() => onEdit(id)}
                  aria-label={`Edit ${title}`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </Button>
              </RoleGate>
            )}
            {onSave && editing && (
              <>
                <Button tone="ghost" size="sm" type="button" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  tone="primary"
                  size="sm"
                  type="button"
                  onClick={() => onSave(id)}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  Save
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 deck:grid-cols-4">
        {children}
      </div>
    </Panel>
  );
}

// ─── BLANK STATE ──────────────────────────────────────────────────────────────
const BLANK = {
  title: "",
  firstName: "",
  lastName: "",
  middleName: "",
  nickName: "",
  email: "",
  phone: "",
  alternatePhone: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  maritalStatus: "",
  marriageDate: "",
  spouseName: "",
  spouseDOB: "",
  nationality: "",
  religion: "",
  placeOfBirth: "",
  countryOfOrigin: "",
  residentialStatus: "",
  personalEmail: "",
  fatherFirstName: "",
  fatherMiddleName: "",
  fatherLastName: "",
  fatherDOB: "",
  motherFirstName: "",
  motherMiddleName: "",
  motherLastName: "",
  isDirector: false,
  isInternational: false,
  isPhysicallyChallenged: false,
  departmentId: "",
  department: "",
  designation: "",
  jobTitle: "",
  biometricId: "",
  identityId: "",
  needsToOperate: false,
  dateOfJoining: "",
  confirmationDate: "",
  probationPeriod: "",
  employmentType: "",
  workLocation: "",
  // The company-issued number, kept apart from `phone` — that one is personal
  // and is what they log into the app with.
  workPhone: "",
  // ── Internship ──
  // Only meaningful when employmentType is "intern", and the form reshapes
  // around that rather than around a separate route: an intern is an employee
  // record with a different arrangement, and every other field on this form
  // still applies to them.
  internStipendType: "paid",
  stipend: "",
  internStart: "",
  internEnd: "",
  // The one Shift field. Late, early-out and half-day all measure from it.
  // The free-text `shift` that used to sit beside it is gone — it was a second
  // box called Shift that attendance never read, so whichever one HR filled in
  // was as likely as not the wrong one. It is now derived from this.
  workShiftMode: "",
  workShiftStart: "",
  workShiftEnd: "",
  // Custom shifts only. Blank means 2 — guessing high is the expensive
  // mistake, since a day short of the expected count is flagged for HR.
  workShiftPunches: "",
  primaryManagerId: "",
  primaryManager: "",
  secondaryManagerId: "",
  secondaryManager: "",
  // ── Salary ──────────────────────────────────────────────────────
  grossSalary: "",
  // Auto earnings
  basic: "",
  hra: "",
  // EPF — auto by default, HR-editable (override)
  epf: "",
  epfOverride: false,
  // EDLI & Admin — HR-editable
  edli: "",
  adminCharges: "",
  edliOverride: false,
  adminOverride: false,
  // ESI (auto, on Basic)
  eeesic: "",
  erEsic: "",
  foodAllowance: "",
  // Totals (auto)
  totalDeduction: "",
  netSalary: "",
  // A standing monthly recovery — canteen, transport, whatever the company
  // takes back. Optional, and zero for most people. Applies to interns too.
  otherDeduction: "",
  employerCost: "",
  // Bank
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "",
  branchName: "",
  aadharNumber: "",
  panNumber: "",
  uanNumber: "",
  passportNumber: "",
  voterIdNumber: "",
  drivingLicenseNumber: "",
  esicNumber: "",
  pfNumber: "",
  additionalDocs: [],
  currentStreet: "",
  currentCity: "",
  currentState: "",
  currentPincode: "",
  currentCountry: "India",
  permanentStreet: "",
  permanentCity: "",
  permanentState: "",
  permanentPincode: "",
  permanentCountry: "India",
  sameAsCurrent: false,
};

// ─── MANAGER PICKER (top-level so React never remounts it on parent re-render) ─
function MgrField({
  type,
  managers,
  selected,
  q,
  setQ,
  show,
  setShow,
  onPick,
  onClear,
  isEditing,
}) {
  const label = type === "pri" ? "Primary Manager" : "Secondary Manager";

  const filtered = managers.filter(
    (e) =>
      (e.fullName || "").toLowerCase().includes(q.toLowerCase()) ||
      (e.biometricId || "").toLowerCase().includes(q.toLowerCase()) ||
      (e.department || "").toLowerCase().includes(q.toLowerCase()),
  );

  if (!isEditing) return <Val label={label} value={selected} />;

  return (
    <Fld label={label}>
      {selected ? (
        <div className="flex items-center gap-1 rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          <span className="flex-1 truncate text-sm text-ink">{selected}</span>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full p-0.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            aria-label={`Clear ${label}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className={INP}
            placeholder="Search by name, ID or dept…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShow(true);
            }}
            onFocus={() => setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 200)}
          />
          {show && q && (
            <div className="scroll-slim frost-bar absolute right-0 left-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-inset border border-hairline shadow-lg">
              {filtered.length === 0 ? (
                <p className="p-3 text-center text-xs text-ink-muted">
                  No employees found
                </p>
              ) : (
                filtered.slice(0, 20).map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(emp)}
                    className="w-full border-b border-hairline px-3 py-2 text-left last:border-0 hover:bg-[var(--row-hover)]"
                  >
                    <p className="text-sm text-ink">{emp.fullName}</p>
                    <p className="text-xs text-ink-faint">
                      {emp.biometricId && (
                        <span data-figure>{emp.biometricId} · </span>
                      )}
                      <span className="text-ink-muted">{emp.department}</span>
                      {emp.designation && <span> · {emp.designation}</span>}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Fld>
  );
}

// ─── FILE FIELD (top-level to avoid remount on parent re-render) ──────────────
function FileField({
  fileKey,
  label,
  docType,
  file,
  uploadingFile,
  isEditing,
  onUpload,
}) {
  const ref = useRef();
  const uploading = uploadingFile === fileKey;

  if (!isEditing) return <FileVal label={label} file={file} />;

  return (
    <Fld label={label}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex w-full items-center gap-1.5 rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-left text-sm shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-colors hover:bg-[var(--control)] disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-ink-muted" />
            <span className="text-ink-muted">Uploading…</span>
          </>
        ) : file ? (
          <>
            <Check className="w-3 h-3 text-[var(--state-positive-ink)]" />
            <span className="truncate text-ink">{file.name}</span>
          </>
        ) : (
          <>
            <Upload className="w-3 h-3 text-ink-faint" />
            <span className="text-ink-muted">Upload</span>
          </>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(fileKey, f, docType);
        }}
      />
    </Fld>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function EmployeeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("id");
  const isAddMode = !employeeId;
  // ?type=intern opens this form as the intern form. It only seeds the
  // employment type — everything after that is driven by the field itself, so
  // switching the Employment Type dropdown reshapes the form live and editing
  // an existing intern works without the parameter.
  const startsAsIntern = searchParams.get("type") === "intern";

  const [form, setForm] = useState(
    startsAsIntern ? { ...BLANK, employmentType: "intern" } : BLANK,
  );
  const [snap, setSnap] = useState(BLANK);

  // One flag, derived from the field that actually decides it — not from the
  // URL, and not from a separate form component. A second component would have
  // meant a second copy of name, address, documents and bank details, and the
  // two would have drifted the way the payslip builders did.
  const isIntern = form.employmentType === "intern";

  // Locked as soon as the record HAS one. A new employee still types theirs,
  // and so does an existing record that somehow never got one.
  const lockedBiometricId = !isAddMode && !!snap.biometricId;
  const [editSec, setEditSec] = useState(isAddMode ? "__all__" : null);
  const [loading, setLoading] = useState(!!employeeId);
  const [submitting, setSubmitting] = useState(false);
  const [savingSec, setSavingSec] = useState(null);
  const [error, setError] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [files, setFiles] = useState({
    profilePhoto: null,
    aadharFile: null,
    panFile: null,
    resumeFile: null,
    offerLetter: null,
    appointmentLetter: null,
  });

  // Salary formula config loaded from DB
  const [salaryConfig, setSalaryConfig] = useState(null);

  // Dept / designation / manager
  const [depts, setDepts] = useState([]);
  const [desigs, setDesigs] = useState([]);
  const [managers, setManagers] = useState([]);
  const [priQ, setPriQ] = useState("");
  const [secQ, setSecQ] = useState("");
  const [showPri, setShowPri] = useState(false);
  const [showSec, setShowSec] = useState(false);
  const [selectedDept, setSelectedDept] = useState("");

  const photoRef = useRef();
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDepts();
  }, []);
  useEffect(() => {
    if (employeeId) fetchEmployee(employeeId);
  }, [employeeId]);
  useEffect(() => {
    fetchManagers();
  }, []);
  useEffect(() => {
    fetchSalaryConfig();
  }, []);

  // When depts loads (async) AFTER fetchEmployee already ran, re-populate designations
  // for the already-selected department so the dropdown shows correct options
  useEffect(() => {
    if (depts.length > 0 && form.departmentId) {
      const dept = depts.find((d) => d.id === form.departmentId);
      if (dept) {
        setDesigs(dept.designations || []);
      }
    }
  }, [depts, form.departmentId]);

  const fetchDepts = async () => {
    try {
      const r = await fetch(`${API}/api/hr/departments/with-designations`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.success) setDepts(d.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchManagers = async () => {
    try {
      const r = await fetch(`${API}/api/employees/all?limit=500&page=1`, {
        credentials: "include",
      });
      const d = await r.json();
      const list = Array.isArray(d.data?.employees) ? d.data.employees : [];
      setManagers(
        list.map((e) => ({
          id: e._id,
          fullName: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
          biometricId: e.biometricId || e.identityId || "",
          department: e.department || "",
          designation: e.designation || e.jobTitle || "",
        })),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSalaryConfig = async () => {
    try {
      const r = await fetch(`${API}/api/employees/config/salary`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.success) setSalaryConfig(d.data);
    } catch (e) {
      console.error("Failed to load salary config:", e);
    }
  };

  const dt = (v) => (v ? new Date(v).toISOString().split("T")[0] : "");

  const fetchEmployee = async (id) => {
    try {
      const r = await fetch(`${API}/api/employees/${id}`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.success && d.data) {
        const e = d.data;
        const p = {
          title: e.title || "",
          firstName: e.firstName || "",
          lastName: e.lastName || "",
          middleName: e.middleName || "",
          nickName: e.nickName || "",
          email: e.email || "",
          phone: e.phone || "",
          alternatePhone: e.alternatePhone || "",
          gender: e.gender || "",
          dateOfBirth: dt(e.dateOfBirth),
          bloodGroup: e.bloodGroup || "",
          maritalStatus: e.maritalStatus || "",
          marriageDate: dt(e.marriageDate),
          spouseName: e.spouseName || "",
          spouseDOB: dt(e.spouseDOB),
          nationality: e.nationality || "",
          religion: e.religion || "",
          placeOfBirth: e.placeOfBirth || "",
          countryOfOrigin: e.countryOfOrigin || "",
          residentialStatus: e.residentialStatus || "",
          personalEmail: e.personalEmail || "",
          fatherFirstName: e.fatherFirstName || "",
          fatherMiddleName: e.fatherMiddleName || "",
          fatherLastName: e.fatherLastName || "",
          fatherDOB: dt(e.fatherDateOfBirth),
          motherFirstName: e.motherFirstName || "",
          motherMiddleName: e.motherMiddleName || "",
          motherLastName: e.motherLastName || "",
          isDirector: !!e.isDirector,
          isInternational: !!e.isInternational,
          isPhysicallyChallenged: !!e.isPhysicallyChallenged,
          departmentId: e.departmentId || "",
          department: e.department || "",
          designation: e.designation || e.jobPosition || "",
          jobTitle: e.jobTitle || "",
          biometricId: e.biometricId || "",
          identityId: e.identityId || "",
          needsToOperate: !!e.needsToOperate,
          dateOfJoining: dt(e.dateOfJoining),
          confirmationDate: dt(e.confirmationDate),
          probationPeriod: e.probationPeriod?.toString() || "",
          employmentType: e.employmentType || "",
          workLocation: e.workLocation || "",
          workPhone: e.workPhone || "",
          internStipendType: e.internship?.stipendType || "paid",
          stipend: (e.salary?.stipend || 0).toString(),
          internStart: e.internship?.startDate
            ? new Date(e.internship.startDate).toISOString().split("T")[0]
            : "",
          internEnd: e.internship?.endDate
            ? new Date(e.internship.endDate).toISOString().split("T")[0]
            : "",
          workShiftMode: e.workShift?.mode || "",
          workShiftStart: e.workShift?.start || "",
          workShiftEnd: e.workShift?.end || "",
          workShiftPunches: e.workShift?.punches
            ? String(e.workShift.punches)
            : "",
          primaryManagerId: e.primaryManager?.managerId || "",
          primaryManager: e.primaryManager?.managerName || "",
          secondaryManagerId: e.secondaryManager?.managerId || "",
          secondaryManager: e.secondaryManager?.managerName || "",
          // Salary
          grossSalary: (e.salary?.gross || 0).toString(),
          basic: (e.salary?.basic || 0).toString(),
          hra: (e.salary?.hra || 0).toString(),
          epf: (e.salary?.epf || 0).toString(),
          epfOverride: e.salary?.epfOverride || false,
          edli: (e.salary?.edli || 0).toString(),
          adminCharges: (e.salary?.adminCharges || 0).toString(),
          edliOverride: e.salary?.edliOverride || false,
          adminOverride: e.salary?.adminOverride || false,
          eeesic: (e.salary?.eeesic || 0).toString(),
          foodAllowance: (e.salary?.foodAllowance || 1600).toString(),
          erEsic: (e.salary?.erEsic || 0).toString(),
          totalDeduction: (e.salary?.totalDeduction || 0).toString(),
          netSalary: (e.salary?.netSalary || 0).toString(),
          otherDeduction: (e.salary?.otherDeduction || 0).toString(),
          employerCost: (e.salary?.employerCost || 0).toString(),
          bankName: e.bankDetails?.bankName || "",
          accountNumber: e.bankDetails?.accountNumber || "",
          ifscCode: e.bankDetails?.ifscCode || "",
          accountType: e.bankDetails?.accountType || "",
          branchName: e.bankDetails?.branchName || "",
          aadharNumber: e.documents?.aadharNumber || "",
          panNumber: e.documents?.panNumber || "",
          uanNumber: e.documents?.uanNumber || "",
          passportNumber: e.documents?.passportNumber || "",
          voterIdNumber: e.documents?.voterIdNumber || "",
          drivingLicenseNumber: e.documents?.drivingLicenseNumber || "",
          esicNumber: e.documents?.esicNumber || "",
          pfNumber: e.documents?.pfNumber || "",
          additionalDocs: (e.documents?.additionalDocuments || []).map(
            (d, i) => ({
              id: Date.now() + i,
              title: d.title || "",
              url: d.url || "",
              publicId: d.publicId || "",
            }),
          ),
          currentStreet: e.address?.current?.street || "",
          currentCity: e.address?.current?.city || "",
          currentState: e.address?.current?.state || "",
          currentPincode: e.address?.current?.pincode || "",
          currentCountry: e.address?.current?.country || "India",
          permanentStreet: e.address?.permanent?.street || "",
          permanentCity: e.address?.permanent?.city || "",
          permanentState: e.address?.permanent?.state || "",
          permanentPincode: e.address?.permanent?.pincode || "",
          permanentCountry: e.address?.permanent?.country || "India",
          sameAsCurrent: false,
        };
        setForm(p);
        setSnap(p);
        setSelectedDept(p.departmentId);

        // Load designations for the department
        if (p.departmentId) {
          const dept = depts.find((d) => d.id === p.departmentId);
          if (dept) setDesigs(dept.designations || []);
        }

        if (e.profilePhoto?.url) {
          setFiles((f) => ({
            ...f,
            profilePhoto: {
              url: e.profilePhoto.url,
              cloudinaryUrl: e.profilePhoto.url,
              publicId: e.profilePhoto.publicId,
              name: "Photo",
            },
          }));
        }

        // Load existing document files from DB into files state
        setFiles((f) => ({
          ...f,
          ...(e.documents?.aadharFile?.url
            ? {
                aadharFile: {
                  url: e.documents.aadharFile.url,
                  cloudinaryUrl: e.documents.aadharFile.url,
                  publicId: e.documents.aadharFile.publicId,
                  name: "Aadhar",
                },
              }
            : {}),
          ...(e.documents?.panFile?.url
            ? {
                panFile: {
                  url: e.documents.panFile.url,
                  cloudinaryUrl: e.documents.panFile.url,
                  publicId: e.documents.panFile.publicId,
                  name: "PAN",
                },
              }
            : {}),
          ...(e.documents?.resumeFile?.url
            ? {
                resumeFile: {
                  url: e.documents.resumeFile.url,
                  cloudinaryUrl: e.documents.resumeFile.url,
                  publicId: e.documents.resumeFile.publicId,
                  name: "Resume",
                },
              }
            : {}),
          ...(e.documents?.offerLetterFile?.url
            ? {
                offerLetter: {
                  url: e.documents.offerLetterFile.url,
                  cloudinaryUrl: e.documents.offerLetterFile.url,
                  publicId: e.documents.offerLetterFile.publicId,
                  name: "Offer Letter",
                },
              }
            : {}),
          ...(e.documents?.appointmentLetterFile?.url
            ? {
                appointmentLetter: {
                  url: e.documents.appointmentLetterFile.url,
                  cloudinaryUrl: e.documents.appointmentLetterFile.url,
                  publicId: e.documents.appointmentLetterFile.publicId,
                  name: "Appointment Letter",
                },
              }
            : {}),
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onDeptChange = (deptId) => {
    const dept = depts.find((d) => d.id === deptId);
    setSelectedDept(deptId);
    setDesigs(dept?.designations || []);
    setForm((prev) => ({
      ...prev,
      departmentId: deptId,
      department: dept?.name || "",
      // Only clear designation if the department actually changed
      designation: deptId !== prev.departmentId ? "" : prev.designation,
    }));
    // Prefill the managers assigned to this department (set on the Departments
    // page). Whoever fills the form can still override them; leaving them alone
    // means the backend applies the same defaults on save.
    if (deptId) prefillDeptManagers(deptId);
  };

  // Pull the department's assigned primary/secondary manager and drop them into
  // the manager fields, unless the user already chose someone.
  const prefillDeptManagers = async (deptId) => {
    try {
      const r = await fetch(`${API}/api/hr/departments/${deptId}`, {
        credentials: "include",
      });
      const d = await r.json();
      if (!d.success || !d.data) return;
      const { primaryManager, secondaryManager } = d.data;
      setForm((p) => {
        const next = { ...p };
        if (!p.primaryManagerId && primaryManager?.managerId) {
          next.primaryManagerId = primaryManager.managerId;
          next.primaryManager = primaryManager.managerName || "";
        }
        if (!p.secondaryManagerId && secondaryManager?.managerId) {
          next.secondaryManagerId = secondaryManager.managerId;
          next.secondaryManager = secondaryManager.managerName || "";
        }
        return next;
      });
    } catch (e) {
      console.warn("Department manager prefill failed:", e.message);
    }
  };

  const pickMgr = (emp, type) => {
    const id = emp.biometricId || emp.employeeId || "";
    const label = id ? `${emp.fullName} (${id})` : emp.fullName;
    if (type === "pri") {
      setForm((p) => ({
        ...p,
        primaryManagerId: emp.id,
        primaryManager: label,
      }));
      setShowPri(false);
      setPriQ("");
    } else {
      setForm((p) => ({
        ...p,
        secondaryManagerId: emp.id,
        secondaryManager: label,
      }));
      setShowSec(false);
      setSecQ("");
    }
  };

  // ── Salary auto-calculation (mirrors backend, for live preview) ────────────
  const calcSalary = (gross, manual = {}) => {
    const cfg = salaryConfig || {};
    gross = Number(gross) || 0;

    const basicPct = (cfg.basicPct ?? 50) / 100;
    const hraPct = (cfg.hraPct ?? 50) / 100;
    const eepfPct = (cfg.eepfPct ?? 12) / 100;
    const epfCapAmount = cfg.epfCapAmount ?? 1800; // rupee cap = 12% of PF wage ceiling 15000
    const edliPct = (cfg.edliPct ?? 0.5) / 100;
    const edliCapAmount = cfg.edliCapAmount ?? 15000;
    const adminPct = (cfg.adminChargesPct ?? 0.5) / 100;
    const esiWageLimit = cfg.esiWageLimit ?? 21000;
    const eeEsicPct = (cfg.eeEsicPct ?? 0.75) / 100;
    const erEsicPct = (cfg.erEsicPct ?? 3.25) / 100;

    const basic = Math.round(gross * basicPct);
    const hra = Math.round(gross * hraPct);

    // EPF: ROUND(MIN(basic * eepfPct, epfCapAmount)) -- rupee cap.
    // Respect HR override: when epfOverride is set, keep the HR-entered value.
    const epfOverride = manual.epfOverride || false;
    const epf = epfOverride
      ? Number(manual.epf) || 0
      : Math.round(Math.min(basic * eepfPct, epfCapAmount));

    // EDLI & Admin: respect HR override
    const edliOverride = manual.edliOverride || false;
    const adminOverride = manual.adminOverride || false;
    const edli = edliOverride
      ? Number(manual.edli) || 0
      : Math.round(Math.min(basic * edliPct, edliCapAmount));
    const adminCharges = adminOverride
      ? Number(manual.adminCharges) || 0
      : Math.round(basic * adminPct);

    // ESI on Basic -- applies when basic <= esiWageLimit
    const esiApplicable = basic <= esiWageLimit;
    const eeesic = esiApplicable ? Math.ceil(basic * eeEsicPct) : 0;
    const erEsic = esiApplicable ? Math.ceil(basic * erEsicPct) : 0;

    const foodAllowance = Number(cfg.foodAllowance) || 1600;
    // CTC = Gross + EPF + ESIC(ER) + Food Allowance
    const employerCost = gross + epf + erEsic + foodAllowance;

    // Employee deductions = EPF + ESIC(EE)
    const totalDeduction = epf + eeesic;
    const netSalary = Math.max(gross - totalDeduction, 0);

    return {
      basic: String(basic),
      hra: String(hra),
      epf: String(epf),
      edli: String(edli),
      adminCharges: String(adminCharges),
      eeesic: String(eeesic),
      erEsic: String(erEsic),
      foodAllowance: String(foodAllowance),
      employerCost: String(employerCost),
      totalDeduction: String(totalDeduction),
      netSalary: String(netSalary),
    };
  };

  // onSalaryChange — triggers recalc; EPF/EDLI/admin edits set override flag
  const onSalaryChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "epf") next.epfOverride = true;
      if (field === "edli") next.edliOverride = true;
      if (field === "adminCharges") next.adminOverride = true;
      const calc = calcSalary(
        field === "grossSalary" ? value : prev.grossSalary,
        {
          epfOverride: next.epfOverride,
          edliOverride: next.edliOverride,
          adminOverride: next.adminOverride,
          epf: next.epf,
          edli: next.edli,
          adminCharges: next.adminCharges,
        },
      );
      return { ...next, ...calc };
    });
  };

  // Reset EPF / EDLI / adminCharges back to auto-calculation
  const resetSalaryOverride = (field) => {
    setForm((prev) => {
      const next = { ...prev };
      if (field === "epf") next.epfOverride = false;
      if (field === "edli") next.edliOverride = false;
      if (field === "adminCharges") next.adminOverride = false;
      const calc = calcSalary(prev.grossSalary, { ...next });
      return { ...next, ...calc };
    });
  };

  // ── File uploads ──────────────────────────────────────────────────────────
  const upPhoto = async (file) => {
    setUploadingFile("photo");
    try {
      const res = await uploadProfilePhoto(file);
      setFiles((f) => ({
        ...f,
        profilePhoto: {
          url: URL.createObjectURL(file),
          cloudinaryUrl: res.url,
          publicId: res.publicId,
          name: file.name,
        },
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingFile(null);
    }
  };

  const upDoc = async (key, file, type) => {
    setUploadingFile(key);
    try {
      const res = type
        ? await uploadDocument(file, type)
        : await uploadToCloudinary(file, "employee-documents");
      setFiles((f) => ({
        ...f,
        [key]: { url: res.url, publicId: res.publicId, name: file.name },
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingFile(null);
    }
  };

  const upAddDoc = async (id, file) => {
    setUploadingFile(`ad_${id}`);
    try {
      const doc = form.additionalDocs.find((d) => d.id === id);
      const res = await uploadAdditionalDocument(
        file,
        doc?.title || "Document",
      );
      setForm((p) => ({
        ...p,
        additionalDocs: p.additionalDocs.map((d) =>
          d.id === id ? { ...d, url: res.url, publicId: res.publicId } : d,
        ),
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingFile(null);
    }
  };

  // ── Section edit / save / cancel ──────────────────────────────────────────
  const startEdit = (id) => {
    setSnap(form);
    setEditSec(id);
  };

  const cancelEdit = () => {
    setForm(snap);
    setEditSec(isAddMode ? "__all__" : null);
  };

  const buildPayload = () => {
    // Map flat form state → nested Mongoose schema shape
    const payload = {
      // ── Personal / Basic ──────────────────────────────────────────────────
      title: form.title,
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      nickName: form.nickName,
      phone: form.phone,
      alternatePhone: form.alternatePhone,
      workPhone: form.workPhone,
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || undefined,
      bloodGroup: form.bloodGroup,
      maritalStatus: form.maritalStatus,
      marriageDate: form.marriageDate || undefined,
      spouseName: form.spouseName,
      spouseDOB: form.spouseDOB || undefined,
      nationality: form.nationality,
      religion: form.religion,
      placeOfBirth: form.placeOfBirth,
      countryOfOrigin: form.countryOfOrigin,
      residentialStatus: form.residentialStatus,
      fatherFirstName: form.fatherFirstName,
      fatherMiddleName: form.fatherMiddleName,
      fatherLastName: form.fatherLastName,
      fatherDateOfBirth: form.fatherDOB || undefined,
      motherFirstName: form.motherFirstName,
      motherMiddleName: form.motherMiddleName,
      motherLastName: form.motherLastName,
      isDirector: form.isDirector,
      isInternational: form.isInternational,
      isPhysicallyChallenged: form.isPhysicallyChallenged,

      // ── Work ──────────────────────────────────────────────────────────────
      departmentId: form.departmentId || undefined,
      department: form.department,
      designation: form.designation,
      email: form.email || undefined,
      personalEmail: form.personalEmail || undefined,
      biometricId: form.biometricId || undefined,
      identityId: form.identityId || undefined,
      jobTitle: form.jobTitle,
      needsToOperate: form.needsToOperate,
      dateOfJoining: form.dateOfJoining || undefined,
      confirmationDate: form.confirmationDate || undefined,
      probationPeriod: form.probationPeriod ? Number(form.probationPeriod) : 0,
      employmentType: form.employmentType,
      workLocation: form.workLocation,
      // The free-text `shift` is derived, not typed. Import/export and the
      // profile screen still read it, so it is kept in step rather than left
      // to drift away from the shift attendance actually uses.
      shift: shiftLabel(form),
      workShift: form.workShiftMode
        ? {
            mode: form.workShiftMode,
            // Times only for custom. Core and General read theirs from
            // attendance settings, so copying them onto the employee would
            // freeze a snapshot that stops following the settings page.
            ...(form.workShiftMode === "custom"
              ? {
                  start: form.workShiftStart,
                  end: form.workShiftEnd,
                  punches: Number(form.workShiftPunches) || 2,
                }
              : {}),
          }
        : undefined,

      // Managers — only include if actually selected
      ...(form.primaryManagerId
        ? {
            primaryManager: {
              managerId: form.primaryManagerId,
              managerName: form.primaryManager,
            },
          }
        : {}),
      ...(form.secondaryManagerId
        ? {
            secondaryManager: {
              managerId: form.secondaryManagerId,
              managerName: form.secondaryManager,
            },
          }
        : {}),

      // ── Internship ────────────────────────────────────────────────────────
      // Sent only for interns, and explicitly undefined otherwise, so
      // promoting someone out of an internship clears the arrangement rather
      // than leaving a stale "paid" on a salaried record.
      internship: isIntern
        ? {
            stipendType: form.internStipendType || "paid",
            startDate: form.internStart || undefined,
            endDate: form.internEnd || undefined,
          }
        : undefined,

      // ── Salary (nested) — backend recalculates auto fields from gross ─────
      // For an intern the backend keeps only the stipend and zeroes the rest,
      // so the statutory fields below are sent as zero rather than as whatever
      // the hidden inputs still hold from a previous employment type.
      salary: isIntern
        ? {
            stipend:
              form.internStipendType === "paid" ? Number(form.stipend) || 0 : 0,
            gross: 0,
            // Interns can carry one too — the canteen does not care who you
            // are employed as.
            otherDeduction: Number(form.otherDeduction) || 0,
          }
        : {
        gross: Number(form.grossSalary) || 0,
        // HR-editable overrides
        epf: Number(form.epf) || 0,
        edli: Number(form.edli) || 0,
        adminCharges: Number(form.adminCharges) || 0,
        epfOverride: form.epfOverride || false,
        edliOverride: form.edliOverride || false,
        adminOverride: form.adminOverride || false,
        // Calculated (backend recalculates; sent for reference)
        basic: Number(form.basic) || 0,
        hra: Number(form.hra) || 0,
        foodAllowance: Number(form.foodAllowance) || 1600,
        eeesic: Number(form.eeesic) || 0,
        erEsic: Number(form.erEsic) || 0,
        employerCost: Number(form.employerCost) || 0,
        totalDeduction: Number(form.totalDeduction) || 0,
        netSalary: Number(form.netSalary) || 0,
        stipend: 0,
        otherDeduction: Number(form.otherDeduction) || 0,
      },

      // ── Bank Details (nested) ─────────────────────────────────────────────
      bankDetails: {
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        ifscCode: form.ifscCode,
        accountType: form.accountType,
        branchName: form.branchName,
      },

      // ── Documents (nested) ────────────────────────────────────────────────
      documents: {
        aadharNumber: form.aadharNumber || undefined,
        panNumber: form.panNumber || undefined,
        uanNumber: form.uanNumber || undefined,
        passportNumber: form.passportNumber || undefined,
        voterIdNumber: form.voterIdNumber || undefined,
        drivingLicenseNumber: form.drivingLicenseNumber || undefined,
        esicNumber: form.esicNumber || undefined,
        pfNumber: form.pfNumber || undefined,

        // File uploads — use cloudinaryUrl (the real URL) not the local blob
        ...(files.aadharFile?.cloudinaryUrl || files.aadharFile?.url
          ? {
              aadharFile: {
                url: files.aadharFile.cloudinaryUrl || files.aadharFile.url,
                publicId: files.aadharFile.publicId,
              },
            }
          : {}),
        ...(files.panFile?.cloudinaryUrl || files.panFile?.url
          ? {
              panFile: {
                url: files.panFile.cloudinaryUrl || files.panFile.url,
                publicId: files.panFile.publicId,
              },
            }
          : {}),
        ...(files.resumeFile?.cloudinaryUrl || files.resumeFile?.url
          ? {
              resumeFile: {
                url: files.resumeFile.cloudinaryUrl || files.resumeFile.url,
                publicId: files.resumeFile.publicId,
              },
            }
          : {}),
        ...(files.offerLetter?.cloudinaryUrl || files.offerLetter?.url
          ? {
              offerLetterFile: {
                url: files.offerLetter.cloudinaryUrl || files.offerLetter.url,
                publicId: files.offerLetter.publicId,
              },
            }
          : {}),
        ...(files.appointmentLetter?.cloudinaryUrl ||
        files.appointmentLetter?.url
          ? {
              appointmentLetterFile: {
                url:
                  files.appointmentLetter.cloudinaryUrl ||
                  files.appointmentLetter.url,
                publicId: files.appointmentLetter.publicId,
              },
            }
          : {}),

        additionalDocuments: form.additionalDocs
          .filter((d) => d.title && d.url)
          .map((d) => ({
            title: d.title,
            url: d.url,
            publicId: d.publicId || "",
          })),
      },

      // ── Address (nested) ──────────────────────────────────────────────────
      address: {
        current: {
          street: form.currentStreet,
          city: form.currentCity,
          state: form.currentState,
          pincode: form.currentPincode,
          country: form.currentCountry || "India",
        },
        permanent: {
          street: form.permanentStreet,
          city: form.permanentCity,
          state: form.permanentState,
          pincode: form.permanentPincode,
          country: form.permanentCountry || "India",
        },
      },

      // Profile photo
      ...(files.profilePhoto?.cloudinaryUrl
        ? {
            profilePhoto: {
              url: files.profilePhoto.cloudinaryUrl,
              publicId: files.profilePhoto.publicId,
            },
          }
        : {}),
    };

    return payload;
  };

  const saveSection = async (id) => {
    setSavingSec(id);
    setError(null);
    try {
      const res = await fetch(`${API}/api/employees/${employeeId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.message || "Failed to save");
      setSnap(form);
      setEditSec(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingSec(null);
    }
  };

  /** A plain email check — enough to catch a typo, not enough to argue with. */
  const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

  const handleSubmit = async () => {
    // Required, because it IS the login. An employee saved without one has no
    // way into the app and nobody finds out until they try.
    if (!looksLikeEmail(form.email)) {
      setError("Employee Login (Email) is required — it is how they sign in.");
      return;
    }
    if (!isIntern && !form.confirmationDate) {
      setError(
        "Confirmation Date is required. It may be the same as the date of joining.",
      );
      return;
    }

    // Everybody belongs to exactly one of the three shifts — attendance has no
    // fourth answer to fall back on any more, and a person saved without one
    // gets judged against hours nobody chose for them. Checked here rather
    // than left to the server because this is the screen that can point at
    // the field.
    if (!form.workShiftMode) {
      setError("Pick a shift under Work — Core, General or Custom.");
      return;
    }
    if (
      form.workShiftMode === "custom" &&
      (!form.workShiftStart || !form.workShiftEnd)
    ) {
      setError("A custom shift needs its start and end time.");
      return;
    }
    // A paid internship with no amount is the one case that is certainly a
    // mistake rather than a choice — unpaid and self-paid are legitimately
    // zero. Payroll refuses to recalculate that row for the same reason.
    if (
      isIntern &&
      form.internStipendType === "paid" &&
      !(Number(form.stipend) > 0)
    ) {
      setError(
        "This internship is marked as paid — set the monthly stipend, or " +
          "change the arrangement to unpaid or self-paid.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/employees`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      if (data.success) {
        alert("Employee created successfully!");
        router.push("/hr/dashboard/employees");
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const ed = (id) => editSec === "__all__" || editSec === id;

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    `${form.firstName} ${form.lastName}`.trim() || "E",
  )}&background=7c3aed&color=fff&bold=true&size=256`;

  // ── helpers below ─────────────────────────────────────────────────────────

  if (loading)
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ink-muted" />
      </div>
    );

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div>
      {error && (
        <div className="mb-4 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <InlineError message={error} />
          </div>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {/* Employee Information Section */}
        <Sec
          title="Employee Information"
          id="empInfo"
          editing={ed("empInfo")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "empInfo"}
        >
          {ed("empInfo") ? (
            <>
              <div className="col-span-full flex items-center gap-4 -mb-2">
                <div
                  className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-full border border-hairline bg-[var(--surface-sunken)]"
                  onClick={() => photoRef.current?.click()}
                >
                  <img
                    src={files.profilePhoto?.url || defaultAvatar}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = defaultAvatar;
                    }}
                  />
                  {uploadingFile === "photo" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]">
                      <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                    </div>
                  )}
                </div>
                <input
                  ref={photoRef}
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upPhoto(f);
                  }}
                />
                <p className="text-xs text-ink-faint">Click to change photo</p>
              </div>

              <SI
                label="Title"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              >
                <option value="">—</option>
                <option>Mr.</option>
                <option>Mrs.</option>
                <option>Ms.</option>
                <option>Dr.</option>
              </SI>
              <TI
                label="Nick Name"
                value={form.nickName}
                onChange={(e) => setField("nickName", e.target.value)}
              />
              <SI
                label="Gender"
                value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </SI>
              <TI
                label="First Name"
                value={form.firstName}
                onChange={(e) => setField("firstName", e.target.value)}
              />

              <TI
                label="Last Name"
                value={form.lastName}
                onChange={(e) => setField("lastName", e.target.value)}
              />
              <TI
                label="Middle Name"
                value={form.middleName}
                onChange={(e) => setField("middleName", e.target.value)}
              />
              <TI
                label="Employee Login (Email) *"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
              <TI
                label="Mobile"
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />

              <TI
                label="Alternate Phone"
                type="tel"
                value={form.alternatePhone}
                onChange={(e) => setField("alternatePhone", e.target.value)}
              />
              {/* The company-issued number. Kept apart from Mobile above,
                  which is personal and is what they sign into the app with. */}
              <TI
                label="Corporate / Job Phone"
                type="tel"
                value={form.workPhone}
                onChange={(e) => setField("workPhone", e.target.value)}
                placeholder="Company-issued number"
              />
            </>
          ) : (
            <>
              <div className="col-span-full flex items-center gap-3 -mb-2">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-hairline">
                  <img
                    src={files.profilePhoto?.url || defaultAvatar}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = defaultAvatar;
                    }}
                  />
                </div>
              </div>

              <Val label="Title" value={form.title} />
              <Val label="Nick Name" value={form.nickName} />
              <Val label="Gender" value={form.gender} />
              <Val
                label="Name"
                value={[form.firstName, form.middleName, form.lastName]
                  .filter(Boolean)
                  .join(" ")}
              />

              <Val label="Employee Login" value={form.email} />
              <Val label="Mobile" value={form.phone} masked />
              <Val label="Alternate Phone" value={form.alternatePhone} masked />
              <Val label="Corporate / Job Phone" value={form.workPhone} />
            </>
          )}
        </Sec>

        {/* Personal Information Section */}
        <Sec
          title="Personal Information"
          id="personal"
          editing={ed("personal")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "personal"}
        >
          {ed("personal") ? (
            <>
              <TI
                label="DOB"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setField("dateOfBirth", e.target.value)}
              />
              <SI
                label="Blood Group"
                value={form.bloodGroup}
                onChange={(e) => setField("bloodGroup", e.target.value)}
              >
                <option value="">—</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </SI>
              <TI
                label="Father's Name"
                value={[
                  form.fatherFirstName,
                  form.fatherMiddleName,
                  form.fatherLastName,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(e) => {
                  const parts = e.target.value.split(" ");
                  setField("fatherFirstName", parts[0] || "");
                  setField(
                    "fatherMiddleName",
                    parts.length > 2 ? parts[1] : "",
                  );
                  setField(
                    "fatherLastName",
                    parts.length > 2
                      ? parts.slice(2).join(" ")
                      : parts[1] || "",
                  );
                }}
              />

              <SI
                label="Marital Status"
                value={form.maritalStatus}
                onChange={(e) => setField("maritalStatus", e.target.value)}
              >
                <option value="">—</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </SI>
              <TI
                label="Marriage Date"
                type="date"
                value={form.marriageDate}
                onChange={(e) => setField("marriageDate", e.target.value)}
              />
              <TI
                label="Spouse Name"
                value={form.spouseName}
                onChange={(e) => setField("spouseName", e.target.value)}
              />
              <TI
                label="Nationality"
                value={form.nationality}
                onChange={(e) => setField("nationality", e.target.value)}
              />

              <TI
                label="Residential Status"
                value={form.residentialStatus}
                onChange={(e) => setField("residentialStatus", e.target.value)}
              />
              <TI
                label="Place Of Birth"
                value={form.placeOfBirth}
                onChange={(e) => setField("placeOfBirth", e.target.value)}
              />
              <TI
                label="Country Of Origin"
                value={form.countryOfOrigin}
                onChange={(e) => setField("countryOfOrigin", e.target.value)}
              />
              <TI
                label="Religion"
                value={form.religion}
                onChange={(e) => setField("religion", e.target.value)}
              />

              <CHK
                label="International Employee"
                checked={form.isInternational}
                onChange={(v) => setField("isInternational", v)}
              />
              <CHK
                label="Physically Challenged"
                checked={form.isPhysicallyChallenged}
                onChange={(v) => setField("isPhysicallyChallenged", v)}
              />
              <CHK
                label="Is Director"
                checked={form.isDirector}
                onChange={(v) => setField("isDirector", v)}
              />
              <TI
                label="Personal Email"
                type="email"
                value={form.personalEmail}
                onChange={(e) => setField("personalEmail", e.target.value)}
              />

              <TI
                label="Mother's Name"
                value={[
                  form.motherFirstName,
                  form.motherMiddleName,
                  form.motherLastName,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onChange={(e) => {
                  const parts = e.target.value.split(" ");
                  setField("motherFirstName", parts[0] || "");
                  setField(
                    "motherMiddleName",
                    parts.length > 2 ? parts[1] : "",
                  );
                  setField(
                    "motherLastName",
                    parts.length > 2
                      ? parts.slice(2).join(" ")
                      : parts[1] || "",
                  );
                }}
              />
              <TI
                label="Father's DOB"
                type="date"
                value={form.fatherDOB}
                onChange={(e) => setField("fatherDOB", e.target.value)}
              />
            </>
          ) : (
            <>
              <Val label="DOB" value={form.dateOfBirth} masked />
              <Val label="Blood Group" value={form.bloodGroup} />
              <Val
                label="Father's Name"
                value={[
                  form.fatherFirstName,
                  form.fatherMiddleName,
                  form.fatherLastName,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />

              <Val label="Marital Status" value={form.maritalStatus} />
              <Val label="Marriage Date" value={form.marriageDate} masked />
              <Val label="Spouse Name" value={form.spouseName} />
              <Val label="Nationality" value={form.nationality} />

              <Val label="Residential Status" value={form.residentialStatus} />
              <Val label="Place Of Birth" value={form.placeOfBirth} />
              <Val label="Country Of Origin" value={form.countryOfOrigin} />
              <Val label="Religion" value={form.religion} />

              <Val
                label="International Employee"
                value={form.isInternational ? "Yes" : "No"}
              />
              <Val
                label="Physically Challenged"
                value={form.isPhysicallyChallenged ? "Yes" : "No"}
              />
              <Val label="Is Director" value={form.isDirector ? "Yes" : "No"} />
              <Val label="Personal Email" value={form.personalEmail} />
            </>
          )}
        </Sec>

        {/* Work Details Section */}
        <Sec
          title="Work Details"
          id="work"
          editing={ed("work")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "work"}
        >
          {ed("work") ? (
            <>
              <Fld label="Department">
                <select
                  className={SEL}
                  style={SEL_ARROW}
                  value={form.departmentId}
                  onChange={(e) => onDeptChange(e.target.value)}
                >
                  <option value="">—</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Fld>
              <Fld label="Designation">
                <select
                  className={SEL}
                  style={SEL_ARROW}
                  value={form.designation}
                  onChange={(e) => setField("designation", e.target.value)}
                  disabled={!form.departmentId}
                >
                  <option value="">—</option>
                  {desigs.map((d, i) => (
                    <option key={i} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Fld>
              <TI
                label="Job Title"
                value={form.jobTitle}
                onChange={(e) => setField("jobTitle", e.target.value)}
              />
              <TI
                label="Work Location"
                value={form.workLocation}
                onChange={(e) => setField("workLocation", e.target.value)}
              />
              {/* Write-once. It is the key every attendance row, punch and
                  payroll item is stored under, and the join key to the
                  Firestore document — changing it does not rename that
                  history, it orphans it. Locked here rather than only
                  refused by the server, so nobody types a new one and finds
                  out on save. */}
              <TI
                label={
                  lockedBiometricId ? "Biometric ID (locked)" : "Biometric ID"
                }
                value={form.biometricId}
                disabled={lockedBiometricId}
                onChange={(e) => setField("biometricId", e.target.value)}
                hint={
                  <FHint
                    formula={
                      lockedBiometricId ? "Set — and now fixed" : "Set once"
                    }
                    note={
                      lockedBiometricId
                        ? "Attendance, punches and payroll are all keyed on it, so it cannot be changed."
                        : "May be left blank until the device enrols them, but it cannot be changed once saved."
                    }
                  />
                }
              />{" "}
              <TI
                label="Identity ID"
                value={form.identityId}
                onChange={(e) => setField("identityId", e.target.value)}
              />
              <TI
                label="Date of Joining"
                type="date"
                value={form.dateOfJoining}
                onChange={(e) => setField("dateOfJoining", e.target.value)}
              />
              {/* An internship has an end date, not a probation leading to
                  confirmation. Those two fields live in the Internship block
                  on the salary section instead. */}
              {!isIntern && (
                <TI
                  label="Confirmation Date *"
                  type="date"
                  value={form.confirmationDate}
                  onChange={(e) => setField("confirmationDate", e.target.value)}
                  hint={
                    <FHint
                      formula="May be the same as the date of joining"
                      note="Required. Probation reporting and payroll both read it."
                    />
                  }
                />
              )}
              {!isIntern && (
                <TI
                  label="Probation (months)"
                  type="number"
                  value={form.probationPeriod}
                  onChange={(e) => setField("probationPeriod", e.target.value)}
                />
              )}
              <SI
                label="Employment Type"
                value={form.employmentType}
                onChange={(e) => setField("employmentType", e.target.value)}
              >
                <option value="">—</option>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </SI>
              {/* One Shift field. There used to be two — a free-text label
                  and this — which meant the box HR filled in was not the one
                  attendance read. The label is still written, derived from
                  this, so exports and the profile screen keep working. */}
              <SI
                label="Shift"
                value={form.workShiftMode}
                onChange={(e) => setField("workShiftMode", e.target.value)}
              >
                <option value="">Select a shift…</option>
                <option value="core">Core — office hours from settings</option>
                <option value="general">
                  General — production hours from settings
                </option>
                <option value="custom">Custom — set the hours below</option>
              </SI>
              {form.workShiftMode === "custom" && (
                <>
                  <TI
                    label="Shift Starts"
                    type="time"
                    value={form.workShiftStart}
                    onChange={(e) => setField("workShiftStart", e.target.value)}
                  />
                  <TI
                    label="Shift Ends"
                    type="time"
                    value={form.workShiftEnd}
                    onChange={(e) => setField("workShiftEnd", e.target.value)}
                  />
                  {/* Asked per person, and only here, because it is the one
                      thing about a custom shift that does not follow from the
                      hours: two people on 06:00–14:00 can punch twice or six
                      times, and only HR knows which. Core is always 2 and
                      General always 6, so neither of those asks. */}
                  <TI
                    label="Punches per day"
                    type="number"
                    min="1"
                    max="12"
                    value={form.workShiftPunches}
                    onChange={(e) =>
                      setField("workShiftPunches", e.target.value)
                    }
                    hint={
                      <FHint
                        formula="2 = in and out · 4 = with lunch · 6 = with lunch and tea"
                        note="A day with fewer punches than this is flagged as a miss-punch."
                      />
                    }
                  />
                </>
              )}
              <CHK
                label="Needs to Operate"
                checked={form.needsToOperate}
                onChange={(v) => setField("needsToOperate", v)}
              />
              <MgrField
                type="pri"
                managers={managers}
                selected={form.primaryManager}
                q={priQ}
                setQ={setPriQ}
                show={showPri}
                setShow={setShowPri}
                onPick={(emp) => pickMgr(emp, "pri")}
                onClear={() =>
                  setForm((p) => ({
                    ...p,
                    primaryManagerId: "",
                    primaryManager: "",
                  }))
                }
                isEditing={ed("work")}
              />
              <MgrField
                type="sec"
                managers={managers}
                selected={form.secondaryManager}
                q={secQ}
                setQ={setSecQ}
                show={showSec}
                setShow={setShowSec}
                onPick={(emp) => pickMgr(emp, "sec")}
                onClear={() =>
                  setForm((p) => ({
                    ...p,
                    secondaryManagerId: "",
                    secondaryManager: "",
                  }))
                }
                isEditing={ed("work")}
              />
            </>
          ) : (
            <>
              <Val label="Department" value={form.department} />
              <Val label="Designation" value={form.designation} />
              <Val label="Job Title" value={form.jobTitle} />
              <Val label="Work Location" value={form.workLocation} />

              <Val label="Biometric ID" value={form.biometricId} />
              <Val label="Identity ID" value={form.identityId} />
              <Val label="Date of Joining" value={form.dateOfJoining} />
              <Val label="Confirmation Date" value={form.confirmationDate} />

              <Val
                label="Probation"
                value={
                  form.probationPeriod ? `${form.probationPeriod} months` : ""
                }
              />
              <Val
                label="Employment Type"
                value={form.employmentType?.replace("_", " ")}
              />
              <Val label="Shift" value={shiftSummary(form) || "Not set"} />
              <Val
                label="Needs to Operate"
                value={form.needsToOperate ? "Yes" : "No"}
              />

              <Val label="Primary Manager" value={form.primaryManager} />
              <Val label="Secondary Manager" value={form.secondaryManager} />
            </>
          )}
        </Sec>

        {/* Salary & Bank Section */}
        <Sec
          title="Salary & Bank Details"
          id="salary"
          editing={ed("salary")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "salary"}
        >
          {ed("salary") ? (
            <>
              {/* ── Other deduction ── */}
              {/* Shown for staff and interns alike. Charged for the days they
                  were THERE: payroll prorates it by
                  (days in month − approved leave) ÷ days in month, so a week
                  of casual leave is a week not charged. An unexplained
                  absence still is — that is not an arrangement, and the
                  deduction should not be avoidable by not turning up. */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Other Deduction{" "}
                  <span className="text-ink-faint font-normal normal-case">
                    (optional)
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="Monthly amount (₹)"
                    type="number"
                    value={form.otherDeduction}
                    onChange={(e) => setField("otherDeduction", e.target.value)}
                    hint={
                      <FHint
                        formula="Amount × (days in month − leave days) ÷ days in month"
                        note="Canteen, transport, anything recovered monthly. Leave days are CL, SL, PL and LWP — an unexplained absence is still charged. Payroll fills this in; nobody types it there."
                      />
                    }
                  />
                </div>
              </div>

              {isIntern && (<>
              {/* ── Internship ── */}
              {/* A stipend is one number. There is no basic to derive from it,
                  no provident fund to deduct and no ESI to enrol in, so none
                  of the fields below this point in the salaried form exist
                  here — showing them disabled at zero would state a
                  relationship with the EPFO that does not exist. */}
              <div className="col-span-full pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Internship
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <SI
                    label="Arrangement"
                    value={form.internStipendType}
                    onChange={(e) =>
                      setField("internStipendType", e.target.value)
                    }
                  >
                    <option value="paid">Paid — the company pays a stipend</option>
                    <option value="unpaid">Unpaid — no money changes hands</option>
                    <option value="self_paid">
                      Self-paid — funded by the intern or their institution
                    </option>
                  </SI>
                  {form.internStipendType === "paid" && (
                    <TI
                      label="Monthly Stipend (₹) *"
                      type="number"
                      value={form.stipend}
                      onChange={(e) => setField("stipend", e.target.value)}
                      hint={
                        <FHint
                          formula="Stipend ÷ days in month × payable days"
                          note="Prorated by attendance, like a salary. Nothing is deducted from it."
                        />
                      }
                    />
                  )}
                  <TI
                    label="Internship Starts"
                    type="date"
                    value={form.internStart}
                    onChange={(e) => setField("internStart", e.target.value)}
                  />
                  <TI
                    label="Internship Ends"
                    type="date"
                    value={form.internEnd}
                    onChange={(e) => setField("internEnd", e.target.value)}
                  />
                </div>
                {form.internStipendType !== "paid" && (
                  <p className="mt-3 text-xs text-ink-muted">
                    This internship pays nothing, so no stipend is set. They
                    still appear on the Interns tab of payroll each month with
                    their attendance, at a payout of ₹0.
                  </p>
                )}
              </div>
              </>)}

              {!isIntern && (<>
              {/* ── HR Input ── */}
              <div className="col-span-full pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  HR Inputs
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="Gross Salary (₹) *"
                    type="number"
                    value={form.grossSalary}
                    onChange={(e) =>
                      onSalaryChange("grossSalary", e.target.value)
                    }
                    hint={
                      <FHint
                        formula="Monthly Gross Salary"
                        note="All payroll components are derived from this value."
                      />
                    }
                  />
                </div>
              </div>

              {/* ── Earnings Breakdown (auto) ── */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Earnings Breakdown{" "}
                  <span className="text-ink-faint font-normal normal-case">
                    (auto-calculated)
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="Basic (₹)"
                    type="number"
                    value={form.basic}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula={`${salaryConfig?.basicPct ?? 50}% of Gross`}
                      />
                    }
                  />
                  <TI
                    label="HRA (₹)"
                    type="number"
                    value={form.hra}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula={`${salaryConfig?.hraPct ?? 50}% of Gross`}
                      />
                    }
                  />
                </div>
              </div>

              {/* ── EPF — HR-editable (override) ── */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-1">
                  EPF
                  <span className="text-ink-faint font-normal normal-case ml-1">
                    (HR-editable — click value to override auto-calculation)
                  </span>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  {/* EPF */}
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <p className={"text-sm font-medium text-ink"}>EPF (₹)</p>
                      <FHint
                        formula={`${salaryConfig?.eepfPct ?? 12}% of Basic, capped ₹${(salaryConfig?.epfCapAmount ?? 1800).toLocaleString("en-IN")}/mo`}
                        note="Deducted from employee salary"
                      />
                      {form.epfOverride && (
                        <button
                          type="button"
                          onClick={() => resetSalaryOverride("epf")}
                          className="ml-1 text-[10px] text-[var(--state-extension-ink)] transition-colors hover:opacity-80"
                        >
                          ↺ Auto
                        </button>
                      )}
                    </div>
                    <input
                      data-figure
                      type="number"
                      value={form.epf}
                      onChange={(e) => onSalaryChange("epf", e.target.value)}
                      className={`w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm transition-shadow focus:outline-none ${
                        form.epfOverride
                          ? "shadow-[inset_0_0_0_1.5px_var(--state-extension)] text-ink"
                          : "shadow-[inset_0_0_0_1px_var(--color-hairline)] text-ink"
                      }`}
                    />
                    {form.epfOverride && (
                      <p className="mt-0.5 text-[10px] text-[var(--state-extension-ink)]">
                        Manual override active
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── EDLI & Admin — HR-editable ── */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-1">
                  EDLI & Admin Charges
                  <span className="text-ink-faint font-normal normal-case ml-1">
                    (HR-editable — click value to override auto-calculation)
                  </span>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  {/* EDLI */}
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <p className={"text-sm font-medium text-ink"}>EDLI (₹)</p>
                      <FHint
                        formula={`${salaryConfig?.edliPct ?? 0.5}% of Basic`}
                        note={`Auto-capped ₹${(salaryConfig?.edliCapAmount ?? 15000).toLocaleString("en-IN")}/mo · employer pays`}
                      />
                      {form.edliOverride && (
                        <button
                          type="button"
                          onClick={() => resetSalaryOverride("edli")}
                          className="ml-1 text-[10px] text-[var(--state-extension-ink)] transition-colors hover:opacity-80"
                        >
                          ↺ Auto
                        </button>
                      )}
                    </div>
                    <input
                      data-figure
                      type="number"
                      value={form.edli}
                      onChange={(e) => onSalaryChange("edli", e.target.value)}
                      className={`w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm transition-shadow focus:outline-none ${
                        form.edliOverride
                          ? "shadow-[inset_0_0_0_1.5px_var(--state-extension)] text-ink"
                          : "shadow-[inset_0_0_0_1px_var(--color-hairline)] text-ink"
                      }`}
                    />
                    {form.edliOverride && (
                      <p className="mt-0.5 text-[10px] text-[var(--state-extension-ink)]">
                        Manual override active
                      </p>
                    )}
                  </div>
                  {/* Admin Charges */}
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <p className={"text-sm font-medium text-ink"}>
                        Admin Charges (₹)
                      </p>
                      <FHint
                        formula={`${salaryConfig?.adminChargesPct ?? 0.5}% of Basic`}
                        note="EPF admin charges · employer pays"
                      />
                      {form.adminOverride && (
                        <button
                          type="button"
                          onClick={() => resetSalaryOverride("adminCharges")}
                          className="ml-1 text-[10px] text-[var(--state-extension-ink)] transition-colors hover:opacity-80"
                        >
                          ↺ Auto
                        </button>
                      )}
                    </div>
                    <input
                      data-figure
                      type="number"
                      value={form.adminCharges}
                      onChange={(e) =>
                        onSalaryChange("adminCharges", e.target.value)
                      }
                      className={`w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm transition-shadow focus:outline-none ${
                        form.adminOverride
                          ? "shadow-[inset_0_0_0_1.5px_var(--state-extension)] text-ink"
                          : "shadow-[inset_0_0_0_1px_var(--color-hairline)] text-ink"
                      }`}
                    />
                    {form.adminOverride && (
                      <p className="mt-0.5 text-[10px] text-[var(--state-extension-ink)]">
                        Manual override active
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── ESI — on Basic ── */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    ESI
                    <span className="font-normal normal-case text-ink-faint ml-1">
                      {`· on Basic · applies when basic ≤ ₹${(salaryConfig?.esiWageLimit ?? 21000).toLocaleString("en-IN")}`}
                    </span>
                  </p>
                  {Number(form.basic) > 0 &&
                    (Number(form.basic) >
                    (salaryConfig?.esiWageLimit ?? 21000) ? (
                      <span className="text-[10px] font-medium text-[var(--state-extension-ink)]">
                        Not applicable (basic exceeds limit)
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-[var(--state-positive-ink)]">
                        Applicable
                      </span>
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="ESIC — Employee (₹)"
                    type="number"
                    value={form.eeesic}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula={`${salaryConfig?.eeEsicPct ?? 0.75}% of Basic`}
                        note={`Deducted from salary. Basic \u2264 \u20b9${(salaryConfig?.esiWageLimit ?? 21000).toLocaleString("en-IN")} required`}
                      />
                    }
                  />
                  <TI
                    label="ESIC — Employer (₹)"
                    type="number"
                    value={form.erEsic}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula={`${salaryConfig?.erEsicPct ?? 3.25}% of Basic`}
                        note={`Employer contribution. Basic \u2264 \u20b9${(salaryConfig?.esiWageLimit ?? 21000).toLocaleString("en-IN")} required`}
                      />
                    }
                  />
                </div>
              </div>

              {/* ── Summary ── */}
              <div className="col-span-full pt-2 pb-3 border-b border-hairline">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Summary{" "}
                  <span className="text-ink-faint font-normal normal-case">
                    (auto-calculated)
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="Total Deductions (₹)"
                    type="number"
                    value={form.totalDeduction}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula="EPF + ESIC (Employee)"
                        note="Statutory employee deductions only"
                      />
                    }
                  />
                  <TI
                    label="Food Allowance (₹)"
                    type="number"
                    value={form.foodAllowance}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula="Fixed amount from config"
                        note="Added to CTC"
                      />
                    }
                  />
                  <TI
                    label="CTC / Employer Cost (₹)"
                    type="number"
                    value={form.employerCost}
                    disabled
                    onChange={() => {}}
                    hint={
                      <FHint
                        formula="Gross + EPF + ESIC(ER) + Food"
                        note="Total monthly cost to company"
                      />
                    }
                  />
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-sm font-medium text-ink">
                        Net Salary (₹)
                      </p>
                      <FHint
                        formula="Gross − Total Deductions"
                        note="Employee take-home"
                      />
                    </div>
                    <p
                      data-figure
                      className="min-h-[20px] rounded-inset bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm leading-tight font-medium text-[var(--state-positive-ink)]"
                    >
                      {form.netSalary
                        ? `₹${Number(form.netSalary).toLocaleString("en-IN")}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              </>)}

              {/* ── Bank Details ── */}
              <div className="col-span-full pt-3">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Bank Details
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <TI
                    label="Bank Name"
                    value={form.bankName}
                    onChange={(e) => setField("bankName", e.target.value)}
                  />
                  <SI
                    label="Account Type"
                    value={form.accountType}
                    onChange={(e) => setField("accountType", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </SI>
                  <TI
                    label="Account Number"
                    value={form.accountNumber}
                    onChange={(e) => setField("accountNumber", e.target.value)}
                  />
                  <TI
                    label="IFSC Code"
                    value={form.ifscCode}
                    onChange={(e) => setField("ifscCode", e.target.value)}
                  />
                  <TI
                    label="Branch Name"
                    value={form.branchName}
                    onChange={(e) => setField("branchName", e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Other Deduction
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label="Monthly amount"
                    value={
                      Number(form.otherDeduction) > 0
                        ? `₹${Number(form.otherDeduction).toLocaleString("en-IN")}`
                        : "None"
                    }
                  />
                </div>
              </div>

              {isIntern && (<>
              {/* ── View mode, intern ── */}
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Internship
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label="Arrangement"
                    value={
                      {
                        paid: "Paid",
                        unpaid: "Unpaid",
                        self_paid: "Self-paid",
                      }[form.internStipendType] || "Paid"
                    }
                  />
                  <Val
                    label="Monthly Stipend"
                    value={
                      form.internStipendType !== "paid"
                        ? "—"
                        : form.stipend
                          ? `₹${Number(form.stipend).toLocaleString("en-IN")}`
                          : ""
                    }
                  />
                  <Val label="Starts" value={form.internStart} />
                  <Val label="Ends" value={form.internEnd} />
                </div>
              </div>
              </>)}

              {!isIntern && (<>
              {/* ── View mode ── */}
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Earnings
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label="Gross"
                    value={
                      form.grossSalary
                        ? `₹${Number(form.grossSalary).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <Val
                    label="Basic"
                    value={
                      form.basic
                        ? `₹${Number(form.basic).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <Val
                    label="HRA"
                    value={
                      form.hra
                        ? `₹${Number(form.hra).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                </div>
              </div>
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  EPF
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label={form.epfOverride ? "EPF ✎" : "EPF"}
                    value={
                      form.epf
                        ? `₹${Number(form.epf).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <Val
                    label={form.edliOverride ? "EDLI ✎" : "EDLI"}
                    value={
                      form.edli
                        ? `₹${Number(form.edli).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <Val
                    label={
                      form.adminOverride ? "Admin Charges ✎" : "Admin Charges"
                    }
                    value={
                      form.adminCharges
                        ? `₹${Number(form.adminCharges).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                </div>
              </div>
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  ESI
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label="ESIC (EE)"
                    value={
                      form.eeesic
                        ? `₹${Number(form.eeesic).toLocaleString("en-IN")}`
                        : "N/A"
                    }
                  />
                  <Val
                    label="ESIC (ER)"
                    value={
                      form.erEsic
                        ? `₹${Number(form.erEsic).toLocaleString("en-IN")}`
                        : "N/A"
                    }
                  />
                </div>
              </div>
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Deductions
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val
                    label="Total Deductions"
                    value={
                      form.totalDeduction
                        ? `₹${Number(form.totalDeduction).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <Val
                    label="CTC / Employer Cost"
                    value={
                      form.employerCost
                        ? `₹${Number(form.employerCost).toLocaleString("en-IN")}`
                        : ""
                    }
                  />
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Net Salary
                    </p>
                    <p
                      data-figure
                      className="text-sm font-medium text-[var(--state-positive-ink)]"
                    >
                      {form.netSalary
                        ? `₹${Number(form.netSalary).toLocaleString("en-IN")}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
              </>)}

              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase mb-3">
                  Bank Details
                </p>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 deck:grid-cols-4">
                  <Val label="Bank Name" value={form.bankName} />
                  <Val label="Account Type" value={form.accountType} />
                  <Val
                    label="Account Number"
                    value={form.accountNumber}
                    masked
                  />
                  <Val label="IFSC Code" value={form.ifscCode} />
                  <Val label="Branch Name" value={form.branchName} />
                </div>
              </div>
            </>
          )}
        </Sec>

        {/* Documents Section */}
        <Sec
          title="Documents & IDs"
          id="documents"
          editing={ed("documents")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "documents"}
        >
          {ed("documents") ? (
            <>
              <TI
                label="Aadhar Number"
                value={form.aadharNumber}
                onChange={(e) => setField("aadharNumber", e.target.value)}
                placeholder="XXXX XXXX XXXX"
              />
              <TI
                label="PAN Number"
                value={form.panNumber}
                onChange={(e) => setField("panNumber", e.target.value)}
                placeholder="ABCDE1234F"
              />
              {/* UAN, ESIC and PF are enrolment numbers, and an intern is
                  enrolled in neither scheme. Asking for them implies they
                  should exist, and a number typed in here would then print on
                  a payslip that has no corresponding deduction. */}
              {!isIntern && (
                <TI
                  label="UAN Number"
                  value={form.uanNumber}
                  onChange={(e) => setField("uanNumber", e.target.value)}
                />
              )}
              <TI
                label="Passport Number"
                value={form.passportNumber}
                onChange={(e) => setField("passportNumber", e.target.value)}
              />

              <TI
                label="Voter ID"
                value={form.voterIdNumber}
                onChange={(e) => setField("voterIdNumber", e.target.value)}
              />
              <TI
                label="Driving License"
                value={form.drivingLicenseNumber}
                onChange={(e) =>
                  setField("drivingLicenseNumber", e.target.value)
                }
              />
              {!isIntern && (
                <TI
                  label="ESIC Number"
                  value={form.esicNumber}
                  onChange={(e) => setField("esicNumber", e.target.value)}
                />
              )}
              {!isIntern && (
                <TI
                  label="PF Number"
                  value={form.pfNumber}
                  onChange={(e) => setField("pfNumber", e.target.value)}
                />
              )}

              <FileField
                fileKey="aadharFile"
                label="Aadhar File"
                docType="aadhar"
                file={files.aadharFile}
                uploadingFile={uploadingFile}
                isEditing={ed("documents")}
                onUpload={upDoc}
              />
              <FileField
                fileKey="panFile"
                label="PAN File"
                docType="pan"
                file={files.panFile}
                uploadingFile={uploadingFile}
                isEditing={ed("documents")}
                onUpload={upDoc}
              />
              <FileField
                fileKey="resumeFile"
                label="Resume / CV"
                docType="resume"
                file={files.resumeFile}
                uploadingFile={uploadingFile}
                isEditing={ed("documents")}
                onUpload={upDoc}
              />
              <FileField
                fileKey="offerLetter"
                label="Offer Letter"
                docType={null}
                file={files.offerLetter}
                uploadingFile={uploadingFile}
                isEditing={ed("documents")}
                onUpload={upDoc}
              />
              <FileField
                fileKey="appointmentLetter"
                label="Appointment Letter"
                docType={null}
                file={files.appointmentLetter}
                uploadingFile={uploadingFile}
                isEditing={ed("documents")}
                onUpload={upDoc}
              />

              <div className="col-span-full mt-2 pt-4 border-t border-hairline">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-ink">
                    Additional Documents
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        additionalDocs: [
                          ...p.additionalDocs,
                          { id: Date.now(), title: "", url: "", publicId: "" },
                        ],
                      }))
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 deck:grid-cols-4">
                  {form.additionalDocs.map((doc) => (
                    <div key={doc.id} className="flex items-end gap-2">
                      <div className="flex-1">
                        <p className="mb-1.5 text-sm font-medium text-ink">
                          Title
                        </p>
                        <input
                          className={INP}
                          value={doc.title}
                          placeholder="e.g. Experience Letter"
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              additionalDocs: p.additionalDocs.map((d) =>
                                d.id === doc.id
                                  ? { ...d, title: e.target.value }
                                  : d,
                              ),
                            }))
                          }
                        />
                      </div>
                      {doc.url ? (
                        <span className="flex items-center gap-1 pb-0.5 text-xs text-[var(--state-positive-ink)]">
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <label className="flex cursor-pointer items-center gap-1 pb-0.5 text-xs text-ink-faint transition-colors hover:text-ink">
                          <input
                            type="file"
                            className="hidden"
                            accept=".jpg,.jpeg,.png,.pdf"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) upAddDoc(doc.id, f);
                            }}
                          />
                          {uploadingFile === `ad_${doc.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin text-ink-muted" />
                          ) : (
                            <Upload className="w-3 h-3" />
                          )}
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            additionalDocs: p.additionalDocs.filter(
                              (d) => d.id !== doc.id,
                            ),
                          }))
                        }
                        className="pb-0.5 text-ink-faint transition-colors hover:text-[var(--state-overdue-ink)]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <Val label="Aadhar Number" value={form.aadharNumber} masked />
              <Val label="PAN Number" value={form.panNumber} masked />
              {!isIntern && <Val label="UAN Number" value={form.uanNumber} />}
              <Val label="Passport Number" value={form.passportNumber} />

              <Val label="Voter ID" value={form.voterIdNumber} masked />
              <Val label="Driving License" value={form.drivingLicenseNumber} />
              {!isIntern && (
                <Val label="ESIC Number" value={form.esicNumber} />
              )}
              {!isIntern && <Val label="PF Number" value={form.pfNumber} />}

              <FileVal label="Aadhar File" file={files.aadharFile} />
              <FileVal label="PAN File" file={files.panFile} />
              <FileVal label="Resume" file={files.resumeFile} />
              <FileVal label="Offer Letter" file={files.offerLetter} />
              <FileVal
                label="Appointment Letter"
                file={files.appointmentLetter}
              />

              {form.additionalDocs
                .filter((d) => d.title)
                .map((doc) => (
                  <FileVal key={doc.id} label={doc.title} file={doc} />
                ))}
            </>
          )}
        </Sec>

        {/* Address Section */}
        <Sec
          title="Address"
          id="address"
          editing={ed("address")}
          onEdit={startEdit}
          onSave={isAddMode ? null : saveSection}
          onCancel={cancelEdit}
          saving={savingSec === "address"}
        >
          {ed("address") ? (
            <>
              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Current Address
                </p>
              </div>
              <div className="col-span-full">
                <p className="mb-1.5 text-sm font-medium text-ink">Street</p>
                <textarea
                  className={`${INP} resize-y`}
                  rows={2}
                  value={form.currentStreet}
                  onChange={(e) => setField("currentStreet", e.target.value)}
                />
              </div>
              <TI
                label="City"
                value={form.currentCity}
                onChange={(e) => setField("currentCity", e.target.value)}
              />
              <TI
                label="State"
                value={form.currentState}
                onChange={(e) => setField("currentState", e.target.value)}
              />
              <TI
                label="Pincode"
                value={form.currentPincode}
                onChange={(e) => setField("currentPincode", e.target.value)}
              />
              <TI
                label="Country"
                value={form.currentCountry}
                onChange={(e) => setField("currentCountry", e.target.value)}
              />

              <div className="col-span-full flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="sameCurrent"
                  checked={form.sameAsCurrent}
                  onChange={(e) => {
                    const same = e.target.checked;
                    setForm((p) => ({
                      ...p,
                      sameAsCurrent: same,
                      ...(same && {
                        permanentStreet: p.currentStreet,
                        permanentCity: p.currentCity,
                        permanentState: p.currentState,
                        permanentPincode: p.currentPincode,
                        permanentCountry: p.currentCountry,
                      }),
                    }));
                  }}
                  className="h-3.5 w-3.5 shrink-0 rounded-inset accent-[var(--color-ink)]"
                />
                <label
                  htmlFor="sameCurrent"
                  className="cursor-pointer text-sm text-ink-muted"
                >
                  Permanent address same as current
                </label>
              </div>

              <div className="col-span-full">
                <p className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Permanent Address
                </p>
              </div>
              {!form.sameAsCurrent && (
                <>
                  <div className="col-span-full">
                    <p className="mb-1.5 text-sm font-medium text-ink">
                      Street
                    </p>
                    <textarea
                      className={`${INP} resize-y`}
                      rows={2}
                      value={form.permanentStreet}
                      onChange={(e) =>
                        setField("permanentStreet", e.target.value)
                      }
                    />
                  </div>
                  <TI
                    label="City"
                    value={form.permanentCity}
                    onChange={(e) => setField("permanentCity", e.target.value)}
                  />
                  <TI
                    label="State"
                    value={form.permanentState}
                    onChange={(e) => setField("permanentState", e.target.value)}
                  />
                  <TI
                    label="Pincode"
                    value={form.permanentPincode}
                    onChange={(e) =>
                      setField("permanentPincode", e.target.value)
                    }
                  />
                  <TI
                    label="Country"
                    value={form.permanentCountry}
                    onChange={(e) =>
                      setField("permanentCountry", e.target.value)
                    }
                  />
                </>
              )}
            </>
          ) : (
            <>
              <p className="col-span-full -mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Current Address
              </p>
              <Val label="Street" value={form.currentStreet} />
              <Val label="City" value={form.currentCity} />
              <Val label="State" value={form.currentState} />
              <Val label="Pincode" value={form.currentPincode} />
              <Val label="Country" value={form.currentCountry} />

              <p className="col-span-full mt-2 -mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Permanent Address
              </p>
              <Val label="Street" value={form.permanentStreet} />
              <Val label="City" value={form.permanentCity} />
              <Val label="State" value={form.permanentState} />
              <Val label="Pincode" value={form.permanentPincode} />
              <Val label="Country" value={form.permanentCountry} />
            </>
          )}
        </Sec>

        {isAddMode && (
          <div className="flex items-center justify-end gap-3 py-8">
            <Button
              tone="secondary"
              type="button"
              onClick={() => {
                if (window.confirm("Cancel? Changes will be lost."))
                  router.push("/hr/dashboard/employees");
              }}
            >
              Cancel
            </Button>
            <Button
              tone="primary"
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !!uploadingFile}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Employee
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
