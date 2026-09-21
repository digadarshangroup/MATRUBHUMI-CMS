"use client";

// app/hr/dashboard/sop/policies/page.js
// ─────────────────────────────────────────────────────────────────────────────
// Policies & Attendance Deductions (C4).
// Tabs:
//   • Policies       — HR-managed C4 policies + read-only external rules (C1/C2…)
//   • Suggestions    — attendance scan → Accept/Dismiss
//   • Manual Apply   — apply any policy to one employee by hand
//   • C4 Settings    — PRE-SAVED POINT VALUES (flat points, no percentages)
//
// The policy form AUTO-FILLS points/threshold from C4 Settings when an
// attendance trigger is picked — HR selects the rule, the numbers come filled.
// Talks to: /api/hr/policy  (routes/HrRoutes/policyRoutes.js)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import HRDashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import RequireRole from "@/components/access/RequireRole";
import {
  Panel,
  Chip,
  Button,
  Tabs,
  Field,
  Input,
  Textarea,
  Select,
  EmptyState,
  InlineError,
  PageHead,
} from "@/components/ceo/ui/Primitives";
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Globe,
  Building2,
  AlertCircle,
  CheckCircle,
  Search,
  RefreshCw,
  Check,
  Ban,
  ShieldAlert,
  Clock,
  CalendarDays,
  Power,
  Award,
  Send,
  Users,
  FileText,
  Lock,
  Settings,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const TRIGGER_LABELS = {
  absent_no_notice: "Absent without notice",
  late_arrival: "Late arrival",
  early_departure: "Early departure",
  present_on_time: "Present & on time (base point — auto + backfill)",
  manual: "Manual (no auto-detect)",
};
const REWARD_TRIGGER_OPTIONS = [
  { value: "manual", label: "Custom reward — set points below" },
  {
    value: "present_on_time",
    label: "Present & on time — daily base point (predefined in C4 Settings)",
  },
];
const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual — HR applies by hand (no auto-detect)" },
  { value: "absent_no_notice", label: "Absent without notice (status AB)" },
  { value: "late_arrival", label: "Late arrival (over threshold)" },
  { value: "early_departure", label: "Early departure (over threshold)" },
];

// Attendance triggers auto-fill their points/threshold from C4 Settings —
// HR selects the rule; the pre-saved numbers come filled in.
const TRIGGER_POINT_FIELD = {
  absent_no_notice: "absencePoints",
  late_arrival: "lateArrivalPoints",
  early_departure: "earlyDeparturePoints",
};
const TRIGGER_THRESHOLD_FIELD = {
  late_arrival: "lateThresholdMins",
  early_departure: "earlyThresholdMins",
};

const getHrInfo = () => {
  if (typeof window === "undefined") return {};
  try {
    const u = JSON.parse(localStorage.getItem("hrUser") || "{}");
    return {
      createdByName: u.name || "HR Manager",
      createdByRole: u.role || "hr_manager",
      cutByName: u.name || "HR Manager",
      cutByRole: u.role || "hr_manager",
    };
  } catch {
    return {
      createdByName: "HR Manager",
      createdByRole: "hr_manager",
      cutByName: "HR Manager",
      cutByRole: "hr_manager",
    };
  }
};

const apiFetch = async (path, opts = {}) => {
  const res = await fetch(`${BASE}/api/hr/policy${path}`, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

// ── local-date helpers (avoid toISOString — it shifts back 5:30h in IST) ─────
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

// ════════════════════════════════════════════════════════════════════════════
// POLICY MODAL — create / edit
// ════════════════════════════════════════════════════════════════════════════
function PolicyModal({ departments, editing, onClose, onSaved }) {
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [points, setPoints] = useState(
    editing?.points !== undefined ? String(editing.points) : "",
  );
  const [scope, setScope] = useState(editing?.scope || "global");
  const [departmentIds, setDepartmentIds] = useState(() => {
    if (Array.isArray(editing?.departmentIds) && editing.departmentIds.length)
      return editing.departmentIds.map(String);
    return editing?.departmentId ? [String(editing.departmentId)] : [];
  });
  const [triggerKey, setTriggerKey] = useState(editing?.triggerKey || "manual");
  const [thresholdMins, setThresholdMins] = useState(
    editing?.thresholdMins !== undefined ? String(editing.thresholdMins) : "15",
  );
  const [isActive, setIsActive] = useState(
    editing?.isActive === undefined ? true : !!editing.isActive,
  );
  const [bleachType, setBleachType] = useState(editing?.bleachType || "credit");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [c4cfg, setC4cfg] = useState(null);

  // Pre-saved point values live in C4 Settings.
  useEffect(() => {
    apiFetch("/c4-config")
      .then((d) => setC4cfg(d.config))
      .catch(() => setC4cfg(null));
  }, []);

  const isReward = bleachType === "debit";
  const isPresenceReward = isReward && triggerKey === "present_on_time";
  const pointField = !isReward ? TRIGGER_POINT_FIELD[triggerKey] : null;
  const isPredefined = !!pointField || isPresenceReward; // auto-filled + locked
  const showThreshold =
    !isReward &&
    (triggerKey === "late_arrival" || triggerKey === "early_departure");

  // AUTO-FILL: picking an attendance trigger (or the base-point reward) fills
  // points/threshold from C4 Settings. The fields lock so the pre-saved value
  // is what's used.
  useEffect(() => {
    if (!c4cfg) return;
    if (isReward) {
      if (triggerKey === "present_on_time")
        setPoints(String(c4cfg.basePointsPerDay ?? ""));
      return;
    }
    const pf = TRIGGER_POINT_FIELD[triggerKey];
    if (!pf) return;
    setPoints(String(c4cfg[pf] ?? ""));
    const tf = TRIGGER_THRESHOLD_FIELD[triggerKey];
    if (tf) setThresholdMins(String(c4cfg[tf] ?? "0"));
  }, [triggerKey, isReward, c4cfg]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Policy name is required.");
    if (points === "" || isNaN(Number(points)))
      return setErr("Enter a valid points value.");
    if (scope === "department" && departmentIds.length === 0)
      return setErr("Pick at least one department for a department policy.");
    setSaving(true);
    setErr("");
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category: "C4",
      points: Number(points),
      scope,
      departmentIds: scope === "department" ? departmentIds : [],
      triggerKey: isReward
        ? triggerKey === "present_on_time"
          ? "present_on_time"
          : "manual"
        : triggerKey,
      thresholdMins: Number(thresholdMins || 0),
      // The present-on-time reward mirrors the always-on engine — always active.
      isActive: isPresenceReward ? true : isActive,
      bleachType,
      ...getHrInfo(),
    };
    try {
      if (editing) {
        await apiFetch(`/${editing._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
      <div className="frost-bar flex max-h-full w-full min-h-0 max-w-lg flex-col rounded-panel border border-hairline">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
            {editing ? "Edit Policy" : "New Policy"}
          </h3>
          <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          onSubmit={submit}
          className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
        >
          {err && <InlineError message={err} compact />}

          <Field label="Policy Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Late arrival > 15 minutes"
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this policy covers…"
            />
          </Field>

          {/* Penalty vs Reward */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Type
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBleachType("credit")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-inset px-3 py-2 text-sm transition-colors ${
                  !isReward
                    ? "bg-[color-mix(in_srgb,var(--state-overdue)_24%,transparent)] font-medium text-[var(--state-overdue-ink)]"
                    : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)]"
                }`}
              >
                <ShieldAlert className="h-4 w-4" /> Penalty (deduct)
              </button>
              <button
                type="button"
                onClick={() => setBleachType("debit")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-inset px-3 py-2 text-sm transition-colors ${
                  isReward
                    ? "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] font-medium text-[var(--state-positive-ink)]"
                    : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)]"
                }`}
              >
                <Award className="h-4 w-4" /> Reward (add)
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              {isReward
                ? "A reward improves the employee's score and is applied by hand from the Manual Apply tab."
                : "A penalty raises the employee's penalty score when the policy is violated."}
            </p>
          </div>

          {/* Trigger — only penalties can auto-detect from attendance */}
          {!isReward ? (
            <Field
              label="Attendance trigger"
              hint="Attendance triggers appear as suggestions and come with pre-saved points from C4 Settings. “Manual” policies are applied by hand with your own points."
            >
              <Select
                value={triggerKey}
                onChange={(e) => setTriggerKey(e.target.value)}
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field
              label="Reward rule"
              hint={
                triggerKey === "present_on_time"
                  ? "Credited automatically every day the engine runs (Auto-credit ON in C4 Settings). Use Manual Apply to backfill a day it missed — an already-credited day is rejected."
                  : "A custom reward you apply by hand from the Manual Apply tab."
              }
            >
              <Select
                value={
                  triggerKey === "present_on_time"
                    ? "present_on_time"
                    : "manual"
                }
                onChange={(e) => setTriggerKey(e.target.value)}
              >
                {REWARD_TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Points — auto-filled + locked for attendance triggers */}
          <Field
            label={isReward ? "Points to award" : "Points to deduct"}
            required
            hint={
              isPredefined
                ? c4cfg
                  ? isPresenceReward
                    ? "Auto-filled from C4 Settings — backfills always use the live value there, so this stays in sync."
                    : "Auto-filled from C4 Settings — change it there, then re-save this policy to sync."
                  : "Loading pre-saved value from C4 Settings…"
                : "All policies are recorded under category C4."
            }
          >
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                readOnly={isPredefined}
                placeholder="e.g. 3"
                data-figure
                className={
                  isPredefined
                    ? "cursor-not-allowed bg-[var(--surface-sunken)] pr-9"
                    : ""
                }
              />
              {isPredefined && (
                <Lock
                  aria-hidden="true"
                  className="absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                />
              )}
            </div>
          </Field>

          {/* Scope */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Applies to
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope("global")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-inset px-3 py-2 text-sm transition-colors ${
                  scope === "global"
                    ? "bg-ink font-medium text-[var(--body-bg)]"
                    : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)]"
                }`}
              >
                <Globe className="h-4 w-4" /> Company-wide
              </button>
              <button
                type="button"
                onClick={() => setScope("department")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-inset px-3 py-2 text-sm transition-colors ${
                  scope === "department"
                    ? "bg-ink font-medium text-[var(--body-bg)]"
                    : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)]"
                }`}
              >
                <Building2 className="h-4 w-4" /> Department
              </button>
            </div>
          </div>

          {scope === "department" && (
            <div>
              <span className="mb-1.5 flex items-baseline gap-1.5">
                <span className="text-sm font-medium text-ink">Departments</span>
                <span className="text-[11px] text-ink-faint">
                  Required — select one or more
                </span>
              </span>
              <div className="scroll-slim max-h-40 divide-y divide-hairline overflow-y-auto rounded-inset border border-hairline">
                {departments.map((d) => {
                  const id = String(d.id);
                  const checked = departmentIds.includes(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--row-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDepartmentIds((prev) =>
                            checked
                              ? prev.filter((x) => x !== id)
                              : [...prev, id],
                          )
                        }
                        className="h-4 w-4 accent-[var(--color-ink)]"
                      />
                      <span className="text-ink">{d.name}</span>
                    </label>
                  );
                })}
                {departments.length === 0 && (
                  <p className="px-3 py-2 text-xs text-ink-faint">
                    No active departments found.
                  </p>
                )}
              </div>
              {departmentIds.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-faint">
                  Applies to <span data-figure>{departmentIds.length}</span>{" "}
                  department
                  {departmentIds.length !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
          )}

          {/* Threshold — auto-filled + locked for attendance triggers */}
          {showThreshold && (
            <Field
              label="Threshold (minutes)"
              hint={
                isPredefined
                  ? "Auto-filled from C4 Settings. Counts as a violation only when over this many minutes."
                  : "Counts as a violation only when over this many minutes."
              }
            >
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={thresholdMins}
                  onChange={(e) => setThresholdMins(e.target.value)}
                  readOnly={isPredefined}
                  data-figure
                  className={
                    isPredefined
                      ? "cursor-not-allowed bg-[var(--surface-sunken)] pr-9"
                      : ""
                  }
                />
                {isPredefined && (
                  <Lock
                    aria-hidden="true"
                    className="absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                  />
                )}
              </div>
            </Field>
          )}

          {isPresenceReward ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Lock aria-hidden="true" className="h-3.5 w-3.5 text-ink-faint" />
              <span>
                Always active — this policy mirrors the always-on daily credit
                engine and cannot be deactivated.
              </span>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-ink)]"
              />
              <span className="text-sm text-ink">Active</span>
            </label>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <RoleGate min="editor">
            <Button type="submit" tone="primary" disabled={saving} className="w-full">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Policy"}
            </Button>
            </RoleGate>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// POLICIES TAB — HR-managed C4 policies + read-only external rules
// ════════════════════════════════════════════════════════════════════════════
function PoliciesTab() {
  const [policies, setPolicies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [externalRules, setExternalRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, dRes] = await Promise.all([
        apiFetch("/"),
        apiFetch("/departments"),
      ]);
      setPolicies(pRes.policies || []);
      setDepartments(dRes.departments || []);
      // C1/C2/… rules come from the admin-side globalSettings (read-only).
      try {
        const xRes = await apiFetch("/external-rules");
        setExternalRules(xRes.rules || []);
      } catch {
        setExternalRules([]);
      }
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    try {
      await apiFetch(`/${id}`, { method: "DELETE" });
      setPolicies((prev) => prev.filter((p) => p._id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleActive = async (p) => {
    try {
      const res = await apiFetch(`/${p._id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      setPolicies((prev) =>
        prev.map((x) => (x._id === p._id ? res.policy : x)),
      );
    } catch (e) {
      alert(e.message);
    }
  };

  const globals = policies.filter((p) => p.scope !== "department");
  const byDept = {};
  for (const p of policies) {
    if (p.scope === "department") {
      const names =
        Array.isArray(p.departmentNames) && p.departmentNames.length
          ? p.departmentNames
          : [p.departmentName || "Department"];
      const k = names.join(", ");
      (byDept[k] = byDept[k] || []).push(p);
    }
  }

  const Card = ({ p }) => (
    <Panel
      label={p.name}
      className={`flex items-start justify-between gap-3 ${p.isActive ? "" : "opacity-60"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{p.name}</span>
          {p.bleachType === "debit" ? (
            <Chip tone="positive">
              <span data-figure>+{p.points}</span> pt
              {Number(p.points) === 1 ? "" : "s"}
            </Chip>
          ) : (
            <Chip tone="overdue">
              <span data-figure>−{p.points}</span> pt
              {Number(p.points) === 1 ? "" : "s"}
            </Chip>
          )}
          {p.bleachType === "debit" && (
            <Chip tone="positive">
              <Award aria-hidden="true" className="h-3 w-3" /> Reward
            </Chip>
          )}
          <Chip tone="neutral">{p.category || "C4"}</Chip>
        </div>
        {p.description && (
          <p className="mt-1 text-xs text-ink-muted">{p.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <ShieldAlert aria-hidden="true" className="h-3 w-3" />
            {TRIGGER_LABELS[p.triggerKey] || p.triggerKey}
          </span>
          {(p.triggerKey === "late_arrival" ||
            p.triggerKey === "early_departure") && (
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden="true" className="h-3 w-3" />
              <span data-figure>{p.thresholdMins}</span> min
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {p.bleachType === "debit" && p.triggerKey === "present_on_time" ? (
          <span
            className="cursor-not-allowed p-1.5 text-[var(--state-positive-ink)] opacity-60"
            title="Always on — mirrors the daily credit engine and cannot be deactivated"
          >
            <Power className="h-4 w-4" />
          </span>
        ) : (
          <RoleGate min="editor">
          <button
            onClick={() => toggleActive(p)}
            title={p.isActive ? "Deactivate" : "Activate"}
            className={`rounded-full p-1.5 transition-colors hover:bg-[var(--control)] ${
              p.isActive ? "text-[var(--state-positive-ink)]" : "text-ink-faint"
            }`}
          >
            <Power className="h-4 w-4" />
          </button>
          </RoleGate>
        )}
        <RoleGate min="editor">
        <button
          onClick={() => {
            setEditing(p);
            setShowModal(true);
          }}
          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        </RoleGate>
        <RoleGate min="owner">
        <button
          onClick={() => setDeleteConfirm(p._id)}
          className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        </RoleGate>
      </div>
    </Panel>
  );

  // Read-only card for admin-side rules — same silhouette as the C4 Card.
  const ExtRuleCard = ({ r }) => {
    const isAward = r.type === "award";
    return (
      <Panel
        label={r.name}
        className="flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{r.name}</span>
            {isAward ? (
              <Chip tone="positive">
                <span data-figure>+{r.points}</span> pt
                {Number(r.points) === 1 ? "" : "s"}
              </Chip>
            ) : (
              <Chip tone="overdue">
                <span data-figure>−{r.points}</span> pt
                {Number(r.points) === 1 ? "" : "s"}
              </Chip>
            )}
            {isAward && (
              <Chip tone="positive">
                <Award aria-hidden="true" className="h-3 w-3" /> Reward
              </Chip>
            )}
            <Chip tone="neutral">{r.category}</Chip>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <FileText aria-hidden="true" className="h-3 w-3" />
              {r.key}
            </span>
            <span className="inline-flex items-center gap-1">
              {isAward ? "Reward (adds points)" : "Penalty (deducts points)"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-ink-faint">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="text-[11px]">Read-only</span>
        </div>
      </Panel>
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-sm text-ink-faint">
        Loading policies…
      </div>
    );
  if (err) return <InlineError message={err} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Rules that deduct SOP points when violated.
        </p>
        <RoleGate min="editor">
        <Button
          tone="primary"
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Policy
        </Button>
        </RoleGate>
      </div>

      <div className="space-y-6">
        {/* Company-wide */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Globe aria-hidden="true" className="h-4 w-4 text-ink-muted" />
            <h3 className="text-[15px] font-medium text-ink">Company-wide</h3>
            <span data-figure className="text-xs text-ink-faint">
              {globals.length}
            </span>
          </div>
          {globals.length === 0 ? (
            <EmptyState title="No company-wide policies yet" compact />
          ) : (
            <div className="space-y-2">
              {globals.map((p) => (
                <Card key={p._id} p={p} />
              ))}
            </div>
          )}
        </div>

        {/* Per department */}
        {Object.entries(byDept).map(([dep, list]) => (
          <div key={dep}>
            <div className="mb-2 flex items-center gap-2">
              <Building2 aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <h3 className="text-[15px] font-medium text-ink">{dep}</h3>
              <span data-figure className="text-xs text-ink-faint">
                {list.length}
              </span>
            </div>
            <div className="space-y-2">
              {list.map((p) => (
                <Card key={p._id} p={p} />
              ))}
            </div>
          </div>
        ))}

        {/* Rules from other modules — read-only (admin-side globalSettings) */}
        {externalRules.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-2">
              <FileText aria-hidden="true" className="h-4 w-4 text-ink-faint" />
              <h3 className="text-[15px] font-medium text-ink">
                Rules from other modules
              </h3>
            </div>
            <p className="mb-3 text-[11px] text-ink-faint">
              Defined on the admin side — read-only here. HR cannot
              edit, apply, or remove these.
            </p>
            <div className="space-y-4">
              {Object.entries(
                externalRules.reduce((acc, r) => {
                  (acc[r.category] = acc[r.category] || []).push(r);
                  return acc;
                }, {}),
              ).map(([cat, rules]) => (
                <div key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <Chip tone="neutral">{cat}</Chip>
                    <span data-figure className="text-xs text-ink-faint">
                      {rules.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rules.map((r) => (
                      <ExtRuleCard key={`${cat}-${r.key}`} r={r} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <PolicyModal
          departments={departments}
          editing={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
          <div className="frost-bar flex max-h-full w-full min-h-0 max-w-sm flex-col rounded-panel border border-hairline p-5">
            <p className="mb-1 text-[15px] font-medium text-ink">
              Delete policy?
            </p>
            <p className="mb-4 text-xs text-ink-muted">
              Already-applied deductions are kept; this only removes the rule.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setDeleteConfirm(null)} className="flex-1">
                Cancel
              </Button>
              <RoleGate min="owner">
              <Button
                tone="destructive"
                onClick={() => remove(deleteConfirm)}
                className="w-full"
              >
                Delete
              </Button>
              </RoleGate>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUGGESTIONS TAB — attendance scan → Accept / Dismiss
// ════════════════════════════════════════════════════════════════════════════
function SuggestionsTab() {
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [policyTab, setPolicyTab] = useState("all"); // policyId | "all"
  const [deptFilter, setDeptFilter] = useState("all");
  const [closedDates, setClosedDates] = useState(() => new Set());

  const scan = useCallback(async () => {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await apiFetch(
        `/suggestions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setItems(res.suggestions || []);
      setNote(res.note || "");
      setDismissed(new Set());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    scan();
  }, [scan]);

  const accept = async (s) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await apiFetch("/apply", {
        method: "POST",
        body: JSON.stringify({
          targetEmployeeId: s.biometricId,
          policyId: s.policyId,
          date: s.date,
          reason: s.reason,
          ...getHrInfo(),
        }),
      });
      setMsg(res.message || "Applied.");
      setItems((prev) =>
        prev.filter(
          (x) =>
            !(
              x.biometricId === s.biometricId &&
              x.date === s.date &&
              x.policyId === s.policyId
            ),
        ),
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = (s) => {
    const key = `${s.biometricId}|${s.date}|${s.policyId}`;
    setDismissed((prev) => new Set(prev).add(key));
  };

  const visible = items.filter((s) => {
    const key = `${s.biometricId}|${s.date}|${s.policyId}`;
    if (dismissed.has(key)) return false;
    if (policyTab !== "all" && String(s.policyId) !== policyTab) return false;
    if (deptFilter !== "all" && (s.department || "—") !== deptFilter)
      return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.employeeName.toLowerCase().includes(q) ||
      (s.biometricId || "").toLowerCase().includes(q) ||
      (s.department || "").toLowerCase().includes(q) ||
      (s.policyName || "").toLowerCase().includes(q)
    );
  });

  // One tab per active policy present in the scan (plus All) — counts respect
  // the department filter and search so the numbers match what's below.
  const notDismissed = items.filter(
    (s) => !dismissed.has(`${s.biometricId}|${s.date}|${s.policyId}`),
  );
  const policyTabs = [];
  {
    const seen = new Map();
    for (const s of notDismissed) {
      const id = String(s.policyId);
      if (!seen.has(id)) seen.set(id, { id, name: s.policyName, count: 0 });
      if (
        (deptFilter === "all" || (s.department || "—") === deptFilter) &&
        (!search.trim() ||
          s.employeeName.toLowerCase().includes(search.toLowerCase()) ||
          (s.policyName || "").toLowerCase().includes(search.toLowerCase()))
      )
        seen.get(id).count++;
    }
    policyTabs.push(...seen.values());
  }
  const departments = [
    ...new Set(notDismissed.map((s) => s.department || "—")),
  ].sort();

  // Collapsible per-date sections, newest first.
  const byDate = {};
  for (const s of visible) (byDate[s.date] = byDate[s.date] || []).push(s);
  const dateGroups = Object.entries(byDate).sort(([a], [b]) =>
    a < b ? 1 : -1,
  );
  const toggleDate = (d) =>
    setClosedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        Attendance violations matching your active policies. Nothing is deducted
        until you accept.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="From" className="w-[11rem]">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-figure
          />
        </Field>
        <Field label="To" className="w-[11rem]">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-figure
          />
        </Field>
        <Button tone="primary" onClick={scan} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning…" : "Scan"}
        </Button>
        <Field label="Department" className="w-[13rem]">
          <Select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Field>
        <div className="relative ml-auto">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter suggestions"
            className="pl-9"
          />
        </div>
      </div>

      {/* One tab per policy — add/remove per category from here */}
      <div className="mb-4">
        <Tabs
          label="Policy"
          value={policyTab}
          onChange={setPolicyTab}
          options={[
            {
              id: "all",
              label: "All",
              count: policyTabs.reduce((s, t) => s + t.count, 0),
            },
            ...policyTabs.map((t) => ({
              id: t.id,
              label: t.name,
              count: t.count,
            })),
          ]}
        />
      </div>

      {err && (
        <div className="mb-3">
          <InlineError message={err} compact />
        </div>
      )}
      {msg && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-positive-ink)]"
        >
          <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-ink-faint">
          Scanning attendance…
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title="No pending violations"
          body={note || "Everything in this range is clean or already applied."}
        />
      ) : (
        <div className="space-y-3">
          {dateGroups.map(([date, rows]) => {
            const open = !closedDates.has(date);
            const total = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
            return (
              <Panel key={date} padded={false} label={`Violations on ${date}`}>
                {/* Date header — click to collapse/expand */}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleDate(date)}
                  className="flex w-full items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 text-left transition-colors hover:bg-[var(--control)]"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-faint"
                    />
                    <span data-figure className="text-[15px] font-medium text-ink">
                      {date}
                    </span>
                    <span className="text-xs text-ink-faint">
                      <span data-figure>{rows.length}</span> violation
                      {rows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      data-figure
                      className="text-xs font-medium text-[var(--state-overdue-ink)]"
                    >
                      −{+total.toFixed(2)} pts pending
                    </span>
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-ink-faint" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-ink-faint" />
                    )}
                  </div>
                </button>

                {open && (
                  <div className="scroll-slim overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Employee
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Policy
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Reason
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Points
                          </th>
                          <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s, i) => (
                          <tr
                            key={`${s.biometricId}-${s.policyId}-${i}`}
                            className="hover:bg-[var(--row-hover)]"
                          >
                            <td className="border-b border-hairline px-3 py-2.5">
                              <p className="text-sm text-ink">
                                {s.employeeName}
                              </p>
                              <p className="text-[11px] text-ink-faint">
                                <span data-figure>{s.biometricId}</span>
                                {s.department ? ` · ${s.department}` : ""}
                              </p>
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5">
                              <p className="text-sm text-ink">{s.policyName}</p>
                              <p className="text-[11px] text-ink-faint">
                                {s.category || "C4"}
                              </p>
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5">
                              <p className="text-sm text-ink-muted">
                                {s.reason}
                              </p>
                              {s.statusSource === "system_prediction" && (
                                <div className="mt-0.5 text-[11px] text-[var(--state-rework-ink)]">
                                  system-predicted (not HR-reviewed)
                                </div>
                              )}
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5 text-right">
                              <Chip tone="overdue">
                                <span data-figure>−{s.points}</span> pts
                              </Chip>
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1.5">
                                <RoleGate min="editor">
                                <Button
                                  size="sm"
                                  tone="primary"
                                  onClick={() => accept(s)}
                                  disabled={busy}
                                >
                                  <Check className="h-3.5 w-3.5" /> Accept
                                </Button>
                                </RoleGate>
                                <Button
                                  size="sm"
                                  onClick={() => dismiss(s)}
                                  disabled={busy}
                                >
                                  <Ban className="h-3.5 w-3.5" /> Dismiss
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      <p className="mt-3 flex items-center gap-1 text-[11px] text-ink-faint">
        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
        Dismiss only hides a row for now — it will reappear on the next scan
        unless the policy is applied.
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MANUAL APPLY TAB — apply any policy (reward or penalty) to one employee
// ════════════════════════════════════════════════════════════════════════════
function ManualApplyTab() {
  const [employees, setEmployees] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [empId, setEmpId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState("");
  const [empSearch, setEmpSearch] = useState("");

  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, pRes] = await Promise.all([
        apiFetch("/employees"),
        apiFetch("/"),
      ]);
      setEmployees(eRes.employees || []);
      setPolicies((pRes.policies || []).filter((p) => p.isActive));
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEmps = employees.filter((e) => {
    if (!empSearch.trim()) return true;
    const q = empSearch.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      (e.biometricId || "").toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q)
    );
  });

  const selectedPolicy = policies.find((p) => p._id === policyId);
  const selectedEmp = employees.find((e) => e.biometricId === empId);
  const isReward = selectedPolicy?.bleachType === "debit";

  const apply = async () => {
    setMsg("");
    if (!empId) return setErr("Pick an employee.");
    if (!policyId) return setErr("Pick a policy.");
    if (!date) return setErr("Pick a date.");
    setErr("");
    setApplying(true);
    try {
      const res = await apiFetch("/apply", {
        method: "POST",
        body: JSON.stringify({
          targetEmployeeId: empId,
          policyId,
          date,
          reason: reason.trim(),
          ...getHrInfo(),
        }),
      });
      setMsg(res.message || "Applied.");
      setReason("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setApplying(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-sm text-ink-faint">
        Loading…
      </div>
    );

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-ink-muted">
        Apply a policy to one employee by hand. Use this for rewards and for any
        penalty the attendance scan can’t detect.
      </p>

      {err && (
        <div className="mb-4">
          <InlineError message={err} compact />
        </div>
      )}
      {msg && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-positive-ink)]"
        >
          <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <Panel label="Apply a policy" className="space-y-4">
        {/* Employee */}
        <Field label="Employee" required>
          <div className="relative mb-2">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint"
            />
            <Input
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              placeholder="Filter by name, ID or department…"
              aria-label="Filter employees"
              className="pl-9"
            />
          </div>
          <Select value={empId} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">— Select employee —</option>
            {filteredEmps.map((e) => (
              <option key={e.biometricId} value={e.biometricId}>
                {e.name} · {e.biometricId}
                {e.department ? ` · ${e.department}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {/* Policy */}
        <Field label="Policy" required>
          <Select
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
          >
            <option value="">— Select policy —</option>
            {policies.map((p) => (
              <option key={p._id} value={p._id}>
                {p.bleachType === "debit" ? "Reward" : "Penalty"} ·{" "}
                {p.bleachType === "debit" ? "+" : "−"}
                {p.points} · {p.name}
                {p.scope === "department"
                  ? ` (${
                      Array.isArray(p.departmentNames) &&
                      p.departmentNames.length
                        ? p.departmentNames.join(", ")
                        : p.departmentName
                    })`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>

        {/* Date */}
        <Field label="Date" required className="max-w-[13rem]">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-figure
          />
        </Field>

        {/* Reason */}
        <Field label="Note (optional)">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why this is being applied…"
          />
        </Field>

        {/* Preview */}
        {selectedPolicy && selectedEmp && (
          <div
            className={`flex items-start gap-2 rounded-inset px-3 py-2.5 text-xs ${
              isReward
                ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] text-[var(--state-positive-ink)]"
                : "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] text-[var(--state-overdue-ink)]"
            }`}
          >
            {isReward ? (
              <Award aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0"
              />
            )}
            <span>
              {isReward && selectedPolicy.triggerKey === "present_on_time"
                ? `This will credit +${selectedPolicy.points} pt to ${selectedEmp.name} for the selected date — a backfill for a day the auto engine missed. An already-credited day is rejected, so double-crediting is impossible.`
                : isReward
                  ? `This will award ${selectedPolicy.points} pt(s) to ${selectedEmp.name} — improving their score.`
                  : `This will deduct ${selectedPolicy.points} pt(s) from ${selectedEmp.name} — raising their penalty score.`}
            </span>
          </div>
        )}

        <RoleGate min="editor">
        <Button
          tone="primary"
          onClick={apply}
          disabled={applying || !empId || !policyId}
        >
          <Send className="h-4 w-4" />
          {applying ? "Applying…" : isReward ? "Award Points" : "Apply Policy"}
        </Button>
        </RoleGate>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// C4 SETTINGS TAB — pre-saved POINT values (no percentages)
// ════════════════════════════════════════════════════════════════════════════
function C4SettingsTab() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await apiFetch("/c4-config");
        setCfg(d.config);
        setErr("");
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const info = getHrInfo();
      const d = await apiFetch("/c4-config", {
        method: "PUT",
        body: JSON.stringify({
          basePointsPerDay: Number(cfg.basePointsPerDay) || 0,
          lateArrivalPoints: Number(cfg.lateArrivalPoints) || 0,
          absencePoints: Number(cfg.absencePoints) || 0,
          earlyDeparturePoints: Number(cfg.earlyDeparturePoints) || 0,
          lateThresholdMins: Number(cfg.lateThresholdMins) || 0,
          earlyThresholdMins: Number(cfg.earlyThresholdMins) || 0,
          updatedByName: info.createdByName,
          updatedByRole: info.createdByRole,
        }),
      });
      setCfg(d.config);
      setMsg(
        d.message +
          " New policies auto-fill these values; re-save an existing policy to sync it.",
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const [creditFrom, setCreditFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [creditTo, setCreditTo] = useState(todayStr());

  const creditNow = async () => {
    if (!creditFrom || !creditTo) return setErr("Pick a from and to date.");
    if (creditFrom > creditTo)
      return setErr("From date must be before the to date.");
    setRunning(true);
    setMsg("");
    setErr("");
    try {
      const d = await apiFetch("/c4-presence-run", {
        method: "POST",
        body: JSON.stringify({ from: creditFrom, to: creditTo }),
      });
      setMsg(d.message || "Run complete.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20 text-sm text-ink-faint">
        Loading C4 settings…
      </div>
    );
  if (!cfg)
    return <InlineError message={err || "Could not load C4 settings."} />;

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-ink-muted">
        Pre-saved point values for C4. The policy form auto-fills from here when
        an attendance trigger is picked — HR selects the rule, the points come
        filled.
      </p>

      {err && (
        <div className="mb-4">
          <InlineError message={err} compact />
        </div>
      )}
      {msg && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] px-3 py-2 text-xs text-[var(--state-positive-ink)]"
        >
          <CheckCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {/* Events table — one reward, three penalties, all FLAT POINTS */}
      <Panel padded={false} label="C4 events" className="mb-4">
        <div className="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
          <Settings aria-hidden="true" className="h-4 w-4 text-ink-faint" />
          <h3 className="text-[15px] font-medium text-ink">
            C4 events — what each one is worth
          </h3>
        </div>

        <div className="scroll-slim overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Event
              </th>
              <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Type
              </th>
              <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Points
              </th>
              <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Applies
              </th>
            </tr>
          </thead>
          <tbody>
            {/* REWARD — the daily base point */}
            <tr className="bg-[color-mix(in_srgb,var(--state-positive)_8%,transparent)]">
              <td className="border-b border-hairline px-3 py-2.5">
                <p className="text-sm text-ink">Present and on time</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  Base point earned per working day.
                </p>
              </td>
              <td className="border-b border-hairline px-3 py-2.5">
                <Chip tone="positive">
                  <Award aria-hidden="true" className="h-3 w-3" /> Reward
                </Chip>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint">
                  <Power
                    aria-hidden="true"
                    className="h-3 w-3 text-[var(--state-positive-ink)]"
                  />
                  Always on — today&apos;s point is credited tonight at 21:30,
                  yesterday self-heals on any page open. Older days: Credit
                  range below.
                </p>
                {cfg.lastPresenceRunAt && (
                  <p className="mt-1 text-[10px] text-ink-faint">
                    Last automatic run:{" "}
                    <span data-figure>
                      {new Date(cfg.lastPresenceRunAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </p>
                )}
              </td>
              <td className="border-b border-hairline px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-[var(--state-positive-ink)]">
                    +
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={cfg.basePointsPerDay}
                    onChange={(e) =>
                      setField("basePointsPerDay", e.target.value)
                    }
                    aria-label="Base points per day"
                    data-figure
                    className="w-20"
                  />
                  <span className="text-xs text-ink-faint">pt</span>
                </div>
              </td>
              <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink-muted">
                per working day
              </td>
            </tr>

            {/* PENALTIES — flat points */}
            {[
              {
                k: "lateArrivalPoints",
                label: "Late arrival",
                sub: "Arrival past the late threshold.",
                unit: "per instance",
                thr: "lateThresholdMins",
              },
              {
                k: "absencePoints",
                label: "Unexplained absence",
                sub: "Attendance status AB.",
                unit: "per day",
                thr: null,
              },
              {
                k: "earlyDeparturePoints",
                label: "Early departure (unapproved)",
                sub: "Departure past the early threshold.",
                unit: "per instance",
                thr: "earlyThresholdMins",
              },
            ].map((row) => (
              <tr key={row.k}>
                <td className="border-b border-hairline px-3 py-2.5">
                  <p className="text-sm text-ink">{row.label}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{row.sub}</p>
                </td>
                <td className="border-b border-hairline px-3 py-2.5">
                  <Chip tone="overdue">
                    <ShieldAlert aria-hidden="true" className="h-3 w-3" />{" "}
                    Penalty
                  </Chip>
                </td>
                <td className="border-b border-hairline px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-[var(--state-overdue-ink)]">
                      −
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cfg[row.k]}
                      onChange={(e) => setField(row.k, e.target.value)}
                      aria-label={`${row.label} points`}
                      data-figure
                      className="w-20"
                    />
                    <span className="text-xs text-ink-faint">pts</span>
                  </div>
                </td>
                <td className="border-b border-hairline px-3 py-2.5">
                  <span className="text-xs text-ink-muted">{row.unit}</span>
                  {row.thr && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-[11px] text-ink-faint">over</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={cfg[row.thr]}
                        onChange={(e) => setField(row.thr, e.target.value)}
                        aria-label={`${row.label} threshold in minutes`}
                        data-figure
                        className="w-16"
                      />
                      <span className="text-[11px] text-ink-faint">min</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="bg-[var(--surface-sunken)] px-5 py-3 text-[11px] text-ink-faint">
          These are pre-saved flat points — the policy form auto-fills them when
          an attendance trigger is selected. Changing a value here does not
          rewrite existing policies; open and re-save a policy to sync it.
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <RoleGate min="editor">
        <Button tone="primary" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save C4 Settings"}
        </Button>
        </RoleGate>
      </div>

      {/* Manual credit — any custom range: one day, one month, anything */}
      <Panel label="Run presence credit for a custom range" className="mt-6">
        <p className="mb-1 text-[15px] font-medium text-ink">
          Run presence credit for a custom range
        </p>
        <p className="mb-3 text-[11px] text-ink-faint">
          Every night at <strong>21:30</strong> the engine credits today&apos;s
          point automatically (yesterday too, as self-heal). Use this to
          backfill any older range — one day, one month, anything.
          Already-credited days are skipped, so re-runs are always safe.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From" className="w-[11rem]">
            <Input
              type="date"
              value={creditFrom}
              onChange={(e) => setCreditFrom(e.target.value)}
              data-figure
            />
          </Field>
          <Field label="To" className="w-[11rem]">
            <Input
              type="date"
              value={creditTo}
              onChange={(e) => setCreditTo(e.target.value)}
              data-figure
            />
          </Field>
          <RoleGate min="editor">
          <Button onClick={creditNow} disabled={running}>
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
            {running ? "Running…" : "Credit range"}
          </Button>
          </RoleGate>
        </div>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function HrPoliciesPage() {
  const [tab, setTab] = useState("policies");

  return (
    <HRDashboardLayout activeMenu="policies">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Human resources"
          title="Policies & Attendance Deductions"
          sub="Define compliance policies and review attendance-based point deductions."
        >
          <Tabs
            label="Policy section"
            value={tab}
            onChange={setTab}
            options={[
              { id: "policies", label: "Policies" },
              { id: "suggestions", label: "Attendance Suggestions" },
              { id: "manual", label: "Manual Apply" },
              { id: "c4settings", label: "C4 Settings" },
            ]}
          />
        </PageHead>

        {tab === "policies" && <PoliciesTab />}
        {tab === "suggestions" && <SuggestionsTab />}
        {tab === "manual" && (
          <RequireRole min="editor">
            <ManualApplyTab />
          </RequireRole>
        )}
        {tab === "c4settings" && (
          <RequireRole min="editor">
            <C4SettingsTab />
          </RequireRole>
        )}
      </div>
    </HRDashboardLayout>
  );
}
