"use client";

import RequireRole from "@/components/access/RequireRole";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock,
  Save,
  RefreshCw,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Settings,
  Zap,
  Users,
  Briefcase,
  Factory,
  GraduationCap,
  TrendingUp,
  Info,
  Sparkles,
  AlertTriangle,
  Check,
  Calendar,
  Trash2,
  CalendarDays,
  Edit3,
  Type,
  Palette,
  ShieldAlert,
} from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PageHead,
  Button,
  Chip,
  Field,
  Input,
  Textarea,
  Select,
  EmptyState,
  InlineError,
  SkeletonRows,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "";

const DEFAULT_LABELS = {
  P: "P",
  "P*": "L",
  "P~": "EO",
  HD: "HD",
  MP: "MP",
  AB: "A",
  WO: "WO",
  PH: "PH",
  FH: "FH",
  NH: "NH",
  OH: "OH",
  RH: "RH",
  "L-CL": "CL",
  "L-SL": "SL",
  "L-EL": "EL",
  LWP: "LWP",
  WFH: "WFH",
  CO: "CO",
};

const STATUS_DESCRIPTIONS = {
  P: { name: "Present", color: "#16A34A" },
  "P*": { name: "Late arrival", color: "#CA8A04" },
  "P~": { name: "Early departure", color: "#EA580C" },
  HD: { name: "Half day", color: "#D97706" },
  MP: { name: "Miss punch", color: "#DB2777" },
  AB: { name: "Absent", color: "#DC2626" },
  WO: { name: "Weekly off", color: "#64748B" },
  PH: { name: "Public holiday", color: "#2563EB" },
  FH: { name: "Festival holiday", color: "#4F46E5" },
  NH: { name: "National holiday", color: "#BE185D" },
  OH: { name: "Optional holiday", color: "#0D9488" },
  RH: { name: "Restricted holiday", color: "#B45309" },
  "L-CL": { name: "Casual leave", color: "#7C3AED" },
  "L-SL": { name: "Sick leave", color: "#7C3AED" },
  "L-EL": { name: "Earned leave", color: "#7C3AED" },
  LWP: { name: "Leave without pay", color: "#DC2626" },
  WFH: { name: "Work from home", color: "#0891B2" },
  CO: { name: "Comp off", color: "#0D9488" },
};

const HOLIDAY_TYPE_META = {
  national: {
    label: "National Holiday",
    code: "NH",
    tone: "pink",
    desc: "Republic Day, Independence Day, etc.",
  },
  company: {
    label: "Festival Holiday",
    code: "FH",
    tone: "indigo",
    desc: "Diwali, Holi, company-declared festivals",
  },
  optional: {
    label: "Optional Holiday",
    code: "OH",
    tone: "teal",
    desc: "Optional — employees may or may not take",
  },
  restricted: {
    label: "Restricted Holiday",
    code: "RH",
    tone: "amber",
    desc: "Limited religious/regional holidays",
  },
  working_sunday: {
    label: "Working Sunday",
    code: "—",
    tone: "rose",
    desc: "Override: this Sunday is a working day",
  },
};

/* Legacy tone names → the state palette. Meaning, not decoration. */
const TONE_CHIP = {
  pink: "blocked",
  indigo: "risk",
  teal: "positive",
  amber: "rework",
  rose: "overdue",
  blue: "risk",
};

export default function AttendanceSettingsPage(props) {
  return (
    <RequireRole min="editor">
      <AttendanceSettingsPageInner {...props} />
    </RequireRole>
  );
}
function AttendanceSettingsPageInner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null);
  const [tab, setTab] = useState("exec");

  // Operator (General Employees / production)
  const [opShift, setOpShift] = useState({
    start: "09:00",
    end: "18:00",
    lateGraceMins: 10,
    halfDayThresholdMins: 390, // 6.5h × 60 — net work mins excl. breaks
    otGraceMins: 15,
  });
  // No UI: these four lists are loaded and saved back unchanged so the stored
  // value survives, and nothing on this page can edit them any more. They are
  // the pre-categories fallback for an employee who somehow has no shift of
  // their own — see resolveEmployeeType in the backend, and
  // scripts/backfillWorkShift.js, which is what empties that case out.
  const [coreDepts, setCoreDepts] = useState([]);
  const [opDesigs, setOpDesigs] = useState([]);

  // Executive (Core Employees / office)
  const [exShift, setExShift] = useState({
    start: "09:30",
    end: "18:30",
    lateGraceMins: 15,
    halfDayThresholdMins: 450, // 7.5h × 60 — total span mins incl. breaks
    otGraceMins: 30,
  });
  const [genDepts, setGenDepts] = useState([]);
  const [exDesigs, setExDesigs] = useState([]);

  // Custom — rules only. The HOURS live on each employee, because a shared
  // start time is precisely what a custom shift is not. Set here once so HR
  // does not fill five fields for every housekeeper.
  const [customShift, setCustomShift] = useState({
    lateGraceMins: 10,
    halfDayThresholdMins: 300,
    halfDayBasis: "net",
    otGraceMins: 30,
  });

  // Late Promotion Policy (NEW — count-based per HR policy doc)
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [lateHDOnCount, setLateHDOnCount] = useState(3); // 3rd late → HD
  const [lateFullDayOnCount, setLateFullDayOnCount] = useState(5); // 5th late → AB
  const [earlyOutHDOnCount, setEarlyOutHDOnCount] = useState(3);
  const [earlyOutFullDayOnCount, setEarlyOutFullDayOnCount] = useState(5);
  const [autoDeductCL, setAutoDeductCL] = useState(false);

  // Global
  const [singlePunch, setSinglePunch] = useState({ mode: "midpoint" });
  const [graceCarryForward, setGraceCarryForward] = useState({
    enabled: false,
    triggerMins: 60,
    bonusGraceMins: 15,
    applyTo: "both",
  });
  const [displayLabels, setDisplayLabels] = useState(DEFAULT_LABELS);

  // Holidays state
  const [holidays, setHolidays] = useState([]);
  const [holidayYear, setHolidayYear] = useState(
    String(new Date().getFullYear()),
  );
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);

  // ─── Load on mount ──────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      // departments-with-designations used to be fetched here to feed the
      // department and designation autocompletes. Those lists are gone, and
      // so is the request — it walked every employee to build the suggestions.
      const settingsRes = await fetch(`${API}/hr/attendance/settings`, {
        credentials: "include",
      });
      const s = await settingsRes.json();

      if (s.success) {
        const c = s.data;
        setOpShift({
          start: c.shifts?.operator?.start || "09:00",
          end: c.shifts?.operator?.end || "18:00",
          lateGraceMins: c.shifts?.operator?.lateGraceMins ?? 10,
          halfDayThresholdMins: c.shifts?.operator?.halfDayThresholdMins ?? 390,
          otGraceMins: c.shifts?.operator?.otGraceMins ?? 15,
        });
        setExShift({
          start: c.shifts?.executive?.start || "09:30",
          end: c.shifts?.executive?.end || "18:30",
          lateGraceMins: c.shifts?.executive?.lateGraceMins ?? 15,
          halfDayThresholdMins:
            c.shifts?.executive?.halfDayThresholdMins ?? 450,
          otGraceMins: c.shifts?.executive?.otGraceMins ?? 30,
        });

        setCustomShift({
          lateGraceMins: c.shifts?.custom?.lateGraceMins ?? 10,
          halfDayThresholdMins: c.shifts?.custom?.halfDayThresholdMins ?? 300,
          halfDayBasis: c.shifts?.custom?.halfDayBasis || "net",
          otGraceMins: c.shifts?.custom?.otGraceMins ?? 30,
        });

        // Count-based late policy
        setPolicyEnabled(c.lateHalfDayPolicy?.enabled ?? true);
        setLateHDOnCount(c.lateHalfDayPolicy?.lateHDOnCount ?? 3);
        setLateFullDayOnCount(c.lateHalfDayPolicy?.lateFullDayOnCount ?? 5);
        setEarlyOutHDOnCount(c.lateHalfDayPolicy?.earlyOutHDOnCount ?? 3);
        setEarlyOutFullDayOnCount(
          c.lateHalfDayPolicy?.earlyOutFullDayOnCount ?? 5,
        );
        setAutoDeductCL(c.lateHalfDayPolicy?.autoDeductCL ?? false);

        setSinglePunch({ mode: c.singlePunchHandling?.mode || "midpoint" });
        setCoreDepts(
          (c.departmentCategories?.core || c.operatorDepartments || []).map(
            (s) => s.toUpperCase(),
          ),
        );
        setGenDepts(
          (c.departmentCategories?.general || []).map((s) => s.toUpperCase()),
        );
        setOpDesigs((c.operatorDesignations || []).map((s) => s.toUpperCase()));
        setExDesigs(
          (c.executiveDesignations || []).map((s) => s.toUpperCase()),
        );
        setGraceCarryForward({
          enabled: c.graceCarryForward?.enabled ?? false,
          triggerMins: c.graceCarryForward?.triggerMins ?? 60,
          bonusGraceMins: c.graceCarryForward?.bonusGraceMins ?? 15,
          applyTo: c.graceCarryForward?.applyTo ?? "both",
        });
        setDisplayLabels({ ...DEFAULT_LABELS, ...(c.displayLabels || {}) });
      }
    } catch (e) {
      setBanner({ type: "error", msg: "Load failed: " + e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ─── Load holidays whenever year changes ────────────────────────────
  const loadHolidays = async () => {
    setLoadingHolidays(true);
    try {
      const r = await fetch(
        `${API}/hr/attendance/holidays?year=${holidayYear}`,
        { credentials: "include" },
      );
      const d = await r.json();
      if (d.success) setHolidays(d.data || []);
    } catch (e) {
      console.error("Load holidays:", e.message);
    } finally {
      setLoadingHolidays(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [holidayYear]);

  // ─── Save ───────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const payload = {
        shifts: { operator: opShift, executive: exShift, custom: customShift },
        lateHalfDayPolicy: {
          enabled: policyEnabled,
          // NEW count-based fields (per HR policy doc)
          lateHDOnCount,
          lateFullDayOnCount,
          earlyOutHDOnCount,
          earlyOutFullDayOnCount,
          autoDeductCL,
        },
        singlePunchHandling: singlePunch,
        departmentCategories: { core: coreDepts, general: genDepts },
        operatorDesignations: opDesigs,
        executiveDesignations: exDesigs,
        graceCarryForward,
        displayLabels,
      };
      const r = await fetch(`${API}/hr/attendance/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || "Save failed");
      setBanner({
        type: "success",
        msg: "Settings saved successfully. Changes apply to the next sync.",
      });
      setTimeout(() => setBanner(null), 4000);
    } catch (e) {
      setBanner({ type: "error", msg: "Save failed: " + e.message });
    } finally {
      setSaving(false);
    }
  };

  // ─── Holiday handlers ───────────────────────────────────────────────
  const addHoliday = async (data) => {
    try {
      const r = await fetch(`${API}/hr/attendance/holidays`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || "Add failed");
      await loadHolidays();
      setBanner({
        type: "success",
        msg: `Holiday "${data.name}" added. Day re-synced.`,
      });
      setTimeout(() => setBanner(null), 4000);
      setShowHolidayModal(false);
    } catch (e) {
      setBanner({ type: "error", msg: "Add holiday failed: " + e.message });
    }
  };

  const deleteHoliday = async (id, name) => {
    if (
      !confirm(
        `Delete holiday "${name}"? This will re-sync that day's attendance.`,
      )
    )
      return;
    try {
      const r = await fetch(`${API}/hr/attendance/holidays/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || "Delete failed");
      await loadHolidays();
      setBanner({ type: "success", msg: `Holiday removed. Day re-synced.` });
      setTimeout(() => setBanner(null), 4000);
    } catch (e) {
      setBanner({ type: "error", msg: "Delete failed: " + e.message });
    }
  };

  if (loading) {
    return (
      <Hr_DashboardLayout activeMenu="attendance-settings">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <Panel label="Loading settings">
            <SkeletonRows rows={8} />
          </Panel>
        </div>
      </Hr_DashboardLayout>
    );
  }

  // Which of the three shifts this tab is editing. Nothing else — the tabs
  // used to carry department and designation lists too, and those decided who
  // got which shift; that decision has moved onto the employee.
  const currentConfig =
    tab === "custom"
      ? { shift: customShift, setShift: setCustomShift }
      : tab === "exec"
        ? { shift: exShift, setShift: setExShift }
        : { shift: opShift, setShift: setOpShift };

  const tabLabel =
    tab === "exec" ? "Core" : tab === "custom" ? "Custom" : "General";
  const isExec = tab === "exec";
  const isCustom = tab === "custom";

  return (
    <Hr_DashboardLayout activeMenu="attendance-settings">
      <div className="mx-auto max-w-[1480px] px-4 py-6 pb-24 deck:px-8">
        <PageHead
          kicker="Human resources"
          title="Attendance Settings"
          sub="Configure shifts, policies, employee classification, holidays & display"
          actions={
            <>
              <Button tone="secondary" onClick={load} disabled={saving}>
                <RefreshCw className="h-4 w-4" /> Reset
              </Button>
              <RoleGate min="editor">
                <Button tone="primary" onClick={save} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save
                    </>
                  )}
                </Button>
              </RoleGate>
            </>
          }
        />

        <div className="space-y-5">
        {banner &&
          (banner.type === "error" ? (
            <InlineError message={banner.msg} onRetry={() => setBanner(null)} />
          ) : (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 rounded-inset px-3.5 py-2.5 text-sm ${banner.type === "success" ? "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] text-[var(--state-positive-ink)]" : "bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] text-[var(--state-risk-ink)]"}`}
            >
              <span className="flex items-start gap-2">
                {banner.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                ) : (
                  <Sparkles className="mt-0.5 h-4 w-4" />
                )}
                <span>{banner.msg}</span>
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}

        {/* Tab switcher */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TabButton
            active={tab === "exec"}
            onClick={() => setTab("exec")}
            icon={Briefcase}
            label="Core Employees"
            subtitle="Executives & office staff · 2 punches/day"
            badge={`${exShift.start}\u2013${exShift.end}`}
            tone="indigo"
          />
          <TabButton
            active={tab === "prod"}
            onClick={() => setTab("prod")}
            icon={Factory}
            label="General Employees"
            subtitle="Production & operator staff · 6 punches/day"
            badge={`${opShift.start}\u2013${opShift.end}`}
            tone="blue"
          />
          <TabButton
            active={tab === "custom"}
            onClick={() => setTab("custom")}
            icon={Clock}
            label="Custom Shifts"
            subtitle="Own hours per person · set on the employee"
            badge="rules only"
            tone="amber"
          />
        </div>

        {/* Tab content */}
        <div className="space-y-5">
          <Section
            icon={Clock}
            title={`${tabLabel} Shift Timings`}
            subtitle="Work hours and grace periods"
          >
            <div
              className={`grid grid-cols-2 gap-3 ${isCustom ? "md:grid-cols-4" : "md:grid-cols-5"}`}
            >
              {/* No Start/End on the Custom tab. Those are the one thing a
                  custom shift cannot share — they come from each employee. */}
              {!isCustom && (
                <>
                  <TimeInput
                    label="Start Time"
                    value={currentConfig.shift.start}
                    onChange={(v) =>
                      currentConfig.setShift({ ...currentConfig.shift, start: v })
                    }
                  />
                  <TimeInput
                    label="End Time"
                    value={currentConfig.shift.end}
                    onChange={(v) =>
                      currentConfig.setShift({ ...currentConfig.shift, end: v })
                    }
                  />
                </>
              )}
              <NumberInput
                label="Late Grace"
                value={currentConfig.shift.lateGraceMins}
                onChange={(v) =>
                  currentConfig.setShift({
                    ...currentConfig.shift,
                    lateGraceMins: v,
                  })
                }
                suffix="mins"
                hint="Before counted late"
              />
              <NumberInput
                label={
                  isCustom
                    ? `HD Below (${currentConfig.shift.halfDayBasis || "net"})`
                    : isExec
                      ? "HD Below (span)"
                      : "HD Below (net)"
                }
                value={currentConfig.shift.halfDayThresholdMins}
                onChange={(v) =>
                  currentConfig.setShift({
                    ...currentConfig.shift,
                    halfDayThresholdMins: v,
                  })
                }
                suffix="mins"
                hint={
                  isCustom
                    ? "Applies to every custom-shift employee"
                    : isExec
                      ? "Total span incl. breaks (7.5h=450)"
                      : "Net work excl. breaks (6.5h=390)"
                }
              />
              <NumberInput
                label="OT Grace"
                value={currentConfig.shift.otGraceMins}
                onChange={(v) =>
                  currentConfig.setShift({
                    ...currentConfig.shift,
                    otGraceMins: v,
                  })
                }
                suffix="mins"
                hint="Before OT kicks in"
              />
            </div>
            {isCustom && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
                    Half day measured on
                  </label>
                  <select
                    value={currentConfig.shift.halfDayBasis || "net"}
                    onChange={(e) =>
                      setCustomShift({
                        ...customShift,
                        halfDayBasis: e.target.value,
                      })
                    }
                    className="w-full rounded-control border border-hairline bg-inset px-3 py-2 text-sm text-ink"
                  >
                    <option value="net">Net work — breaks excluded</option>
                    <option value="span">Total span — breaks included</option>
                  </select>
                </div>
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_16%,transparent)] p-3 text-xs text-[var(--state-rework-ink)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {isCustom ? (
                  <>
                    <strong>Custom shifts:</strong> the hours are set per
                    employee, on their own record — Employees → edit → Work
                    shift. These grace periods and the half-day rule apply to{" "}
                    <strong>every</strong> employee on a custom shift, so
                    housekeeping on 06:00–14:00 and a night guard on 22:00–06:00
                    are each judged against their own hours but the same rules.
                  </>
                ) : isExec ? (
                  <>
                    <strong>Executive HD rule:</strong> If total time in office
                    (including breaks) is ≤{" "}
                    <strong data-figure>
                      {currentConfig.shift.halfDayThresholdMins} mins
                    </strong>{" "}
                    (
                    <span data-figure>
                      {Math.round(
                        (currentConfig.shift.halfDayThresholdMins / 60) * 10,
                      ) / 10}
                    </span>
                    h), the day is marked Half Day.
                  </>
                ) : (
                  <>
                    <strong>Operator HD rule:</strong> If net work time
                    (excluding breaks) is &lt;{" "}
                    <strong data-figure>
                      {currentConfig.shift.halfDayThresholdMins} mins
                    </strong>{" "}
                    (
                    <span data-figure>
                      {Math.round(
                        (currentConfig.shift.halfDayThresholdMins / 60) * 10,
                      ) / 10}
                    </span>
                    h), the day is marked Half Day.
                  </>
                )}
              </span>
            </div>
          </Section>

          {/* There used to be a Departments list and a Designations list on
              each of these tabs — that was how an employee got a shift, and
              it was the wrong question to ask. Two people at neighbouring
              desks in the same department can be on different hours, and
              housekeeping was being judged against office hours because
              nobody had thought to list it anywhere. A shift now belongs to
              the person, set on their own record, and there are exactly three
              to choose from. Nothing on this page decides who gets which. */}

          {/* "Working on a day off" used to live here: its own half-day
              threshold, its own net-or-span basis, and no Late or Early Out at
              all, on the reasoning that there is no start time to be late for
              on a day you were not expected in.

              HR asked for it to go. A day worked is a day worked, measured the
              way every other day is and against the same shift, with the
              timings shown rather than suppressed. Two things about a day off
              survive because neither is a measurement: it still earns
              comp-off, and the whole attendance counts as overtime rather than
              only the part past the shift end. Both are in
              services/shiftPolicy.js, not on this page. */}
        </div>

        {/* ═════ HOLIDAYS ═════ */}
        <div className="border-t border-hairline pt-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              Company Holidays
            </h2>
            <span className="text-[11px] text-ink-faint">
              (applied universally to all employees)
            </span>
          </div>
          <Panel padded={false} label="Company holidays" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-inset bg-[var(--control)]">
                  <CalendarDays className="h-4 w-4 text-ink-muted" />
                </div>
                <div>
                  <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">
                    Holidays for <span data-figure>{holidayYear}</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    <span data-figure>{holidays.length}</span> declared ·
                    National, Festival, Optional, Restricted
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={holidayYear}
                  onChange={(e) => setHolidayYear(e.target.value)}
                  className="w-auto py-1.5"
                  data-figure
                >
                  {[0, 1, 2].map((off) => {
                    const y = new Date().getFullYear() - 1 + off;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </Select>
                <RoleGate min="editor">
                  <Button
                    tone="primary"
                    size="sm"
                    onClick={() => setShowHolidayModal(true)}
                  >
                    <Plus className="h-4 w-4" /> Add Holiday
                  </Button>
                </RoleGate>
              </div>
            </div>
            {loadingHolidays ? (
              <div className="px-5 py-4">
                <SkeletonRows rows={4} />
              </div>
            ) : holidays.length === 0 ? (
              <EmptyState
                title={`No holidays declared for ${holidayYear}`}
                body="Use Add Holiday to declare one"
                compact
              />
            ) : (
              <div className="divide-y divide-hairline">
                {holidays.map((h) => {
                  const meta =
                    HOLIDAY_TYPE_META[h.type] || HOLIDAY_TYPE_META.company;
                  return (
                    <div
                      key={h._id}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[var(--row-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 rounded-inset bg-[var(--control)] px-2 py-1 text-center">
                          <p className="text-[9px] font-medium uppercase leading-tight tracking-[0.09em] text-ink-faint">
                            {new Date(h.date + "T00:00:00").toLocaleDateString(
                              "en-IN",
                              { month: "short" },
                            )}
                          </p>
                          <p
                            data-figure
                            className="text-base leading-tight text-ink"
                          >
                            {new Date(h.date + "T00:00:00").getDate()}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-medium text-ink">
                              {h.name}
                            </h4>
                            <Chip tone={TONE_CHIP[meta.tone] || "neutral"}>
                              {meta.code} · {meta.label}
                            </Chip>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-faint">
                            <span data-figure>{h.date}</span>
                            {" · "}
                            {new Date(h.date + "T00:00:00").toLocaleDateString(
                              "en-IN",
                              { weekday: "long" },
                            )}
                            {h.description && <span> · {h.description}</span>}
                          </p>
                        </div>
                      </div>
                      <RoleGate min="owner">
                        <Button
                          tone="ghost"
                          size="sm"
                          onClick={() => deleteHoliday(h._id, h.name)}
                          aria-label={`Delete ${h.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </RoleGate>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* ═════ GRACE CARRY-FORWARD ═════ */}
        <div className="border-t border-hairline pt-5">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              Grace Carry-Forward
            </h2>
            <span className="text-[11px] text-ink-faint">
              (reward extra OT with bonus grace next day)
            </span>
          </div>
          <Section
            icon={Zap}
            title="Bonus Grace from Yesterday's Overtime"
            subtitle="If an employee worked enough overtime yesterday, give them extra grace minutes today before being marked late."
          >
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={graceCarryForward.enabled}
                    onChange={(e) =>
                      setGraceCarryForward({
                        ...graceCarryForward,
                        enabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                  <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {graceCarryForward.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-xs text-ink-faint" data-figure>
                    {graceCarryForward.enabled
                      ? `Worked ≥${graceCarryForward.triggerMins}m OT yesterday → +${graceCarryForward.bonusGraceMins}m grace today`
                      : "Standard shift grace only"}
                  </p>
                </div>
              </label>
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${graceCarryForward.enabled ? "" : "opacity-50 pointer-events-none"}`}
              >
                <NumberInput
                  label="OT Trigger"
                  value={graceCarryForward.triggerMins}
                  onChange={(v) =>
                    setGraceCarryForward({
                      ...graceCarryForward,
                      triggerMins: v,
                    })
                  }
                  suffix="mins"
                  hint="Min OT needed yesterday"
                />
                <NumberInput
                  label="Bonus Grace"
                  value={graceCarryForward.bonusGraceMins}
                  onChange={(v) =>
                    setGraceCarryForward({
                      ...graceCarryForward,
                      bonusGraceMins: v,
                    })
                  }
                  suffix="mins"
                  hint="Extra grace today"
                />
                <Field label="Apply To" hint="Which employees benefit">
                  <Select
                    value={graceCarryForward.applyTo}
                    onChange={(e) =>
                      setGraceCarryForward({
                        ...graceCarryForward,
                        applyTo: e.target.value,
                      })
                    }
                  >
                    <option value="both">Both Categories</option>
                    <option value="executive">Core (Executive) only</option>
                    <option value="operator">General (Operator) only</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>
        </div>

        {/* ═════ DISPLAY LABELS ═════ */}
        <div className="border-t border-hairline pt-5">
          <div className="mb-4 flex items-center gap-2">
            <Type className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              Status Display Labels
            </h2>
            <span className="text-[11px] text-ink-faint">
              (customize what each status shows as in reports & UI)
            </span>
          </div>
          <Section
            icon={Palette}
            title="Status Code → Display Label"
            subtitle="DB always uses original codes; the UI/exports show your custom labels here."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(STATUS_DESCRIPTIONS).map(([code, meta]) => (
                <div
                  key={code}
                  className="flex items-center gap-2 rounded-inset bg-[var(--surface-sunken)] px-3 py-2 transition-colors hover:bg-[var(--control)]"
                >
                  <div className="w-12 shrink-0">
                    <span
                      data-figure
                      className="inline-block rounded-inset bg-[var(--control)] px-1.5 py-0.5 text-[10px] font-medium text-ink"
                    >
                      {code}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] leading-tight text-ink-faint">
                      {meta.name}
                    </p>
                    <Input
                      type="text"
                      value={displayLabels[code] || ""}
                      onChange={(e) =>
                        setDisplayLabels({
                          ...displayLabels,
                          [code]: e.target.value,
                        })
                      }
                      placeholder={DEFAULT_LABELS[code]}
                      maxLength={8}
                      className="mt-0.5 px-2 py-1 font-medium"
                      data-figure
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-ink-faint">
                <strong className="text-ink-muted">Examples:</strong> P* → "L"
                (Late), P~ → "EO" (Early Out). Max <span data-figure>8</span>{" "}
                characters.
              </p>
              <Button
                tone="secondary"
                size="sm"
                onClick={() => setDisplayLabels(DEFAULT_LABELS)}
              >
                <RefreshCw className="h-3 w-3" /> Reset to defaults
              </Button>
            </div>
          </Section>
        </div>

        {/* ═════ GLOBAL SETTINGS ═════ */}
        <div className="border-t border-hairline pt-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ink-muted" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              Global Settings
            </h2>
            <span className="text-[11px] text-ink-faint">
              (applies to both categories)
            </span>
          </div>

          <div className="space-y-4">
            {/* ── NEW: Count-Based Late Promotion Policy ── */}
            <Section
              icon={ShieldAlert}
              title="Late / Early-Out → Half Day Promotion Policy"
              subtitle="Per HR policy: 3rd late arrival or early departure in a month = HD. 5th = Full Day deduction. Counts reset each time they trigger."
            >
              <div className="space-y-5">
                {/* Enable toggle */}
                <label className="flex cursor-pointer items-center gap-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={policyEnabled}
                      onChange={(e) => setPolicyEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                    <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {policyEnabled ? "Enabled" : "Disabled"}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {policyEnabled
                        ? "Late & early-out occurrences will auto-promote to HD/AB"
                        : "No auto-promotion — all lates stay as P* / P~"}
                    </p>
                  </div>
                </label>

                <div
                  className={`space-y-4 ${policyEnabled ? "" : "opacity-50 pointer-events-none"}`}
                >
                  {/* Late Arrival rules */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--state-rework)]" />{" "}
                      Late Arrival (P*)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberInput
                        label="Nth Late → Half Day"
                        value={lateHDOnCount}
                        onChange={setLateHDOnCount}
                        suffix="th late"
                        hint="e.g. 3 = 3rd late = HD"
                      />
                      <NumberInput
                        label="Nth Late → Full Day"
                        value={lateFullDayOnCount}
                        onChange={setLateFullDayOnCount}
                        suffix="th late"
                        hint="e.g. 5 = 5th late = AB"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      1st & 2nd late: no deduction (just P*). On the{" "}
                      <strong data-figure className="text-ink">
                        {lateHDOnCount}
                        {lateHDOnCount === 1
                          ? "st"
                          : lateHDOnCount === 2
                            ? "nd"
                            : lateHDOnCount === 3
                              ? "rd"
                              : "th"}
                      </strong>{" "}
                      late → HD (counter resets). On the{" "}
                      <strong data-figure className="text-ink">
                        {lateFullDayOnCount}
                        {lateFullDayOnCount === 5 ? "th" : "th"}
                      </strong>{" "}
                      → AB full day (counter resets).
                    </p>
                  </div>

                  {/* Early Out rules */}
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--state-extension)]" />{" "}
                      Early Departure (P~)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberInput
                        label="Nth Early Out → Half Day"
                        value={earlyOutHDOnCount}
                        onChange={setEarlyOutHDOnCount}
                        suffix="th early"
                        hint="e.g. 3 = 3rd early = HD"
                      />
                      <NumberInput
                        label="Nth Early Out → Full Day"
                        value={earlyOutFullDayOnCount}
                        onChange={setEarlyOutFullDayOnCount}
                        suffix="th early"
                        hint="e.g. 5 = 5th early = AB"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      Same rule as late — applies separately per employee per
                      month.
                    </p>
                  </div>

                  {/* CL Auto-deduct */}
                  <div className="rounded-inset bg-[var(--surface-sunken)] p-3">
                    <label className="flex cursor-pointer items-center gap-3">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={autoDeductCL}
                          onChange={(e) => setAutoDeductCL(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="h-5 w-9 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          Auto-deduct CL on HD promotion
                        </p>
                        <p className="text-xs text-ink-faint">
                          When a day is promoted to HD due to late count,
                          automatically consume 0.5 CL from balance if
                          available. If disabled, just marks as HD without
                          touching leave balance.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Same-day note */}
                  <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>Same-day rule:</strong> Today's late or early-out
                      is always shown as P* / P~ and is never promoted on the
                      same day. Promotion only applies to previous days' data.
                      This prevents false half-day flags while the day is still
                      in progress.
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Single punch handling */}
            <Section
              icon={Zap}
              title="Single Punch Handling"
              subtitle="How to interpret when an employee records only one punch on a given day"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: "midpoint",
                    label: "Smart (Midpoint)",
                    desc: "Before shift midpoint = In, after = Out",
                  },
                  {
                    id: "assume-in",
                    label: "Always In",
                    desc: "Treat as check-in, Out stays missing",
                  },
                  {
                    id: "assume-out",
                    label: "Always Out",
                    desc: "Treat as check-out, In stays missing",
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSinglePunch({ mode: opt.id })}
                    className={`rounded-inset p-3 text-left transition-colors ${singlePunch.mode === opt.id ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : "bg-[var(--control)] hover:bg-[var(--control-hover)]"}`}
                  >
                    <p className="text-sm font-medium text-ink">{opt.label}</p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </Section>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_16%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>How classification works:</strong> Designation match
              (exact or substring) → Department match → fallback to Core.
              Designation wins over department.
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 lg:pl-64">
        <div className="pointer-events-auto px-4 pb-4 lg:px-8">
          <div className="frost-bar mx-auto flex max-w-[1480px] items-center justify-between gap-3 rounded-panel border border-hairline p-3">
            <p className="hidden text-xs text-ink-faint md:block">
              Changes apply to the next sync
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button tone="secondary" onClick={load} disabled={saving}>
                <RefreshCw className="h-4 w-4" /> Reset
              </Button>
              <RoleGate min="editor">
                <Button tone="primary" onClick={save} disabled={saving}>
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save All Changes
                    </>
                  )}
                </Button>
              </RoleGate>
            </div>
          </div>
        </div>
      </div>

      {showHolidayModal && (
        <HolidayAddModal
          year={holidayYear}
          onClose={() => setShowHolidayModal(false)}
          onSave={addHoliday}
          existingDates={holidays.map((h) => h.date)}
        />
      )}
    </Hr_DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HOLIDAY ADD MODAL (unchanged)
// ═══════════════════════════════════════════════════════════════════════════
function HolidayAddModal({ year, onClose, onSave, existingDates }) {
  const [date, setDate] = useState(`${year}-01-01`);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("company");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!date) {
      setError("Date is required");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (existingDates.includes(date)) {
      setError("A holiday already exists on this date");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        date,
        name: name.trim(),
        description: description.trim(),
        type,
      });
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
        onClick={(e) => e.stopPropagation()}
        className="frost-bar flex max-h-full w-full min-h-0 max-w-md flex-col rounded-panel border border-hairline"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              <CalendarDays className="h-3 w-3" /> New Holiday
            </div>
            <h2 className="mt-0.5 text-[17px] font-medium tracking-[-0.02em] text-ink">
              Declare Holiday
            </h2>
          </div>
          <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              data-figure
            />
          </Field>
          <Field label="Name" required>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali, Republic Day"
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Type
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {Object.entries(HOLIDAY_TYPE_META).map(([k, m]) => {
                const sel = type === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setType(k)}
                    className={`rounded-inset p-2.5 text-left transition-colors ${sel ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : "bg-[var(--control)] hover:bg-[var(--control-hover)]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        data-figure
                        className="w-7 shrink-0 rounded-inset bg-[var(--surface-raised)] px-1 py-0.5 text-center text-[10px] font-medium text-ink"
                      >
                        {m.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {m.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-faint">
                          {m.desc}
                        </p>
                      </div>
                      {sel && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-ink" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. 5-day Diwali break"
            />
          </Field>
          {error && <InlineError compact message={error} />}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-3">
          <Button tone="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <RoleGate min="editor">
            <Button tone="primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add Holiday
                </>
              )}
            </Button>
          </RoleGate>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
//  SHARED COMPONENTS (unchanged)
// ═══════════════════════════════════════════════════════════════════════════
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  subtitle,
  badge,
  tone = "blue",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`frost-panel flex w-full items-center gap-4 rounded-card p-5 text-left transition-colors hover:bg-[var(--frost-bar)] ${active ? "shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : ""}`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-inset ${active ? "bg-ink" : "bg-[var(--control)]"}`}
      >
        <Icon
          className={`h-6 w-6 ${active ? "text-[var(--body-bg)]" : "text-ink-muted"}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium text-ink">{label}</h3>
          <Chip tone={active ? "solid" : "neutral"}>
            <span data-figure>{badge}</span>
          </Chip>
        </div>
        <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
      </div>
    </button>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <Panel padded={false} label={title} className="overflow-hidden">
      <div className="border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-inset bg-[var(--control)]">
            <Icon className="h-4 w-4 text-ink-muted" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </Panel>
  );
}

function TimeInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-figure
      />
    </Field>
  );
}

function NumberInput({ label, value, onChange, suffix, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <Input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="pr-12"
          data-figure
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-ink-faint">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}
