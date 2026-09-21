"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  RefreshCw,
  Users,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  UserCheck,
  UserX,
  Timer,
  Coffee,
  X,
  LogIn,
  LogOut as LogOutIcon,
  Utensils,
  Briefcase,
  Calendar as CalendarIcon,
  TrendingUp,
  Moon,
  AlertCircle,
  FileText,
  Download,
  Filter,
  CalendarDays,
  ChevronDown,
  Sparkles,
  Edit3,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  Panel,
  PageHead,
  Button,
  Input,
  Select,
  Textarea,
  Field,
  Chip,
  Tabs,
  EmptyState,
  InlineError,
  Skeleton,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getHeaders() {
  const t =
    typeof window !== "undefined"
      ? localStorage.getItem("hr_token") || localStorage.getItem("token") || ""
      : "";
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

// ── FIX: parse text first, then attempt JSON — never throws on HTML responses ──
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...getHeaders(), ...opts.headers },
    credentials: "include",
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Got HTML (auth redirect, nginx 502, Next.js 404 page, etc.)
    throw new Error(
      `Server returned an HTML response (HTTP ${res.status}). Check that the backend is running and your session is valid.`,
    );
  }
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ─── Formatting helpers (IST-forced) ────────────────────────────────────────
const fmtTime = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};
const fmtTimeInput = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
};
const minsToHHMM = (mins) => {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
const fmtLate = (record) => {
  if (!record?.lateMins || record.lateMins <= 0) return "—";
  return record.lateDisplay || minsToHHMM(record.lateMins);
};

// ─── Status config ─────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  P: {
    label: "Present",
    tone: "positive",
    dot: "bg-[var(--state-positive)]",
    chip: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
    needsTime: true,
  },
  "P*": {
    label: "Late",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  "P~": {
    label: "Early Out",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    needsTime: true,
  },
  HD: {
    label: "Half Day",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  LHD: {
    label: "Late Half Day",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  MP: {
    label: "Miss Punch",
    tone: "blocked",
    dot: "bg-[var(--state-blocked)]",
    chip: "bg-[color-mix(in_srgb,var(--state-blocked)_26%,transparent)] text-[var(--state-blocked-ink)]",
    needsTime: true,
  },
  AB: {
    label: "Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  LAB: {
    label: "Late Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  EAB: {
    label: "Early Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  WO: {
    label: "Weekly Off",
    tone: "neutral",
    dot: "bg-ink/35",
    chip: "bg-[var(--control)] text-ink-muted",
    needsTime: false,
  },
  PH: {
    label: "Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  FH: {
    label: "Festival Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  NH: {
    label: "National Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  OH: {
    label: "Optional Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  RH: {
    label: "Restricted Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  "L-CL": {
    label: "Casual Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  "L-SL": {
    label: "Sick Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  "L-EL": {
    label: "Earned Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  LWP: {
    label: "LWP",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  WFH: {
    label: "Work From Home",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: true,
  },
  CO: {
    label: "Comp Off",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    needsTime: false,
  },
};

function getStatusLabel(status, displayLabels) {
  if (displayLabels && displayLabels[status]) return displayLabels[status];
  return STATUS_CONFIG[status]?.label || status || "—";
}

function StatusBadge({ status, small = false, displayLabels }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status || "—",
    dot: "bg-ink/35",
    chip: "bg-[var(--control)] text-ink-muted",
  };
  const label = getStatusLabel(status, displayLabels);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-[5px] text-xs"} rounded-full ${cfg.chip}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      {label}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "purple",
  sub,
  active,
  onClick,
}) {
  const tints = {
    purple:
      "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
    rose: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    yellow:
      "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    blue: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    pink: "bg-[color-mix(in_srgb,var(--state-blocked)_26%,transparent)] text-[var(--state-blocked-ink)]",
    gray: "bg-[var(--control)] text-ink-muted",
    indigo:
      "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`frost-panel rounded-card px-4 py-3.5 text-left transition-[background-color,box-shadow] duration-[180ms] ease-[var(--ease-deck)] ${onClick ? "cursor-pointer hover:bg-[var(--control)]" : ""} ${active ? "shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
            {label}
          </p>
          <p
            data-figure
            className="mt-1.5 text-[22px] leading-none tracking-[-0.025em] text-ink"
          >
            {value}
          </p>
          {sub && (
            <p data-figure className="mt-1 truncate text-[11px] text-ink-faint">
              {sub}
            </p>
          )}
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-inset ${tints[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function Avatar({ name = "", size = "md" }) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const sizeClass =
    size === "lg" ? "w-14 h-14 text-base" : "w-8 h-8 text-[10px]";
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[var(--control-active)] font-medium text-ink`}
    >
      {initials}
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, tone = "gray" }) {
  const tones = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
    orange:
      "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
    indigo:
      "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] text-[var(--state-risk-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
    gray: "bg-[var(--surface-sunken)] text-ink",
  };
  return (
    <div className={`rounded-inset p-2.5 ${tones[tone]}`}>
      <div className="mb-0.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 opacity-60" />
        <p className="text-[10px] font-medium tracking-[0.09em] uppercase opacity-75">
          {label}
        </p>
      </div>
      <p data-figure className="text-base leading-none tracking-[-0.02em]">
        {value}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DETAIL DRAWER
// ═══════════════════════════════════════════════════════════════════════════

function DetailDrawer({
  record,
  dateStr,
  onClose,
  onOverride,
  onRefresh,
  displayLabels,
}) {
  const [tab, setTab] = useState("details");
  const [newStatus, setNewStatus] = useState(
    record?.hrFinalStatus ||
      record?.effectiveStatus ||
      record?.systemPrediction ||
      "P",
  );
  const [inTime, setInTime] = useState(fmtTimeInput(record?.inTime));
  const [outTime, setOutTime] = useState(fmtTimeInput(record?.finalOut));
  const [remarks, setRemarks] = useState(record?.hrRemarks || "");
  const [saving, setSaving] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [draftTime, setDraftTime] = useState("");
  const [savingSlot, setSavingSlot] = useState(null);
  const [punchNote, setPunchNote] = useState({ msg: "", type: "" });

  if (!record) return null;

  const isExec = record.employeeType === "executive";
  const currentStatus =
    record.effectiveStatus ||
    record.hrFinalStatus ||
    record.systemPrediction ||
    "AB";
  const newStatusCfg = STATUS_CONFIG[newStatus] || {};
  const needsTime = newStatusCfg.needsTime;

  const allSlots = ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"];
  const slots = isExec ? ["in", "out"] : allSlots;

  const slotMeta = {
    in: {
      label: "Check In",
      icon: LogIn,
      tone: "emerald",
      value: record.inTime,
      fieldKey: "inTime",
    },
    lunch_out: {
      label: "Lunch Out",
      icon: Utensils,
      tone: "orange",
      value: record.lunchOut,
      fieldKey: "lunchOut",
    },
    lunch_in: {
      label: "Lunch In",
      icon: Utensils,
      tone: "orange",
      value: record.lunchIn,
      fieldKey: "lunchIn",
    },
    tea_out: {
      label: "Tea Out",
      icon: Coffee,
      tone: "amber",
      value: record.teaOut,
      fieldKey: "teaOut",
    },
    tea_in: {
      label: "Tea In",
      icon: Coffee,
      tone: "amber",
      value: record.teaIn,
      fieldKey: "teaIn",
    },
    out: {
      label: "Check Out",
      icon: LogOutIcon,
      tone: "rose",
      value: record.finalOut,
      fieldKey: "finalOut",
    },
  };

  const slotToneClass = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
    orange:
      "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
    rose: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]",
  };
  const slotBtnColor = {
    emerald: "text-[var(--state-positive-ink)] hover:bg-[var(--control)]",
    orange: "text-[var(--state-extension-ink)] hover:bg-[var(--control)]",
    amber: "text-[var(--state-rework-ink)] hover:bg-[var(--control)]",
    rose: "text-[var(--state-overdue-ink)] hover:bg-[var(--control)]",
  };

  const getPunchSource = (slotKey) =>
    record.rawPunches?.find((p) => p.punchType === slotKey)?.source || null;

  const applyPunchCorrection = async (slotKey, action, punchTime) => {
    setSavingSlot(slotKey);
    setPunchNote({ msg: "", type: "" });
    try {
      await api("/hr/attendance/punch-correction", {
        method: "POST",
        body: JSON.stringify({
          dateStr,
          biometricId: record.biometricId,
          punchType: slotKey,
          action,
          ...(action !== "remove" ? { punchTime } : {}),
          hrRemarks: remarks || undefined,
        }),
      });
      setPunchNote({
        msg: `${slotMeta[slotKey]?.label} ${action === "remove" ? "removed" : "updated"} successfully`,
        type: "success",
      });
      setEditingSlot(null);
      if (onRefresh) onRefresh(record.biometricId);
    } catch (e) {
      setPunchNote({ msg: e.message, type: "error" });
    } finally {
      setSavingSlot(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        biometricId: record.biometricId,
        dateStr,
        hrFinalStatus: newStatus,
        hrRemarks: remarks,
      };
      if (needsTime) {
        payload.inTime = inTime || null;
        payload.finalOut = outTime || null;
      } else {
        payload.inTime = null;
        payload.finalOut = null;
      }
      await onOverride(payload);
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const attValue = record.attendanceValue;

  return (
    <div
      className="fixed inset-0 z-[80] flex overflow-hidden"
      onClick={onClose}
    >
      <div className="flex-1 bg-black/55" />
      <div
        className="frost-bar animate-slide-in flex min-h-0 w-full max-w-2xl flex-col border-l border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={record.employeeName} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-light tracking-[-0.03em] text-ink">
                {record.employeeName || "—"}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span data-figure className="text-xs">
                  {record.biometricId}
                </span>
                <span className="text-ink-faint">·</span>
                <span>{record.designation || "—"}</span>
                <span className="text-ink-faint">·</span>
                <span>{record.department || "—"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={isExec ? "risk" : "neutral"}>
                  <Briefcase className="h-3 w-3" />{" "}
                  {isExec ? "Executive" : "Operator"}
                </Chip>
                <StatusBadge
                  status={currentStatus}
                  small
                  displayLabels={displayLabels}
                />
                {record.hrFinalStatus && (
                  <span className="text-[10px] font-medium text-ink-muted">
                    HR Overridden
                  </span>
                )}
                {record.wasPromotedToHalfDay && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--state-rework-ink)]">
                    <TrendingUp className="h-3 w-3" />
                    auto-HD
                  </span>
                )}
                {(record.appliedExtraGraceMins || 0) > 0 && (
                  <Chip
                    tone="risk"
                    title={`+${record.appliedExtraGraceMins}m grace from yesterday's OT`}
                  >
                    <span data-figure>+{record.appliedExtraGraceMins}m</span>{" "}
                    grace
                  </Chip>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-hairline px-6 py-2">
          <Tabs
            label="Record detail"
            value={tab}
            onChange={setTab}
            options={[
              { id: "details", label: "Punch Details" },
              { id: "override", label: "HR Override" },
            ]}
          />
        </div>

        {/* Body */}
        <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {tab === "details" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-inset bg-[var(--surface-sunken)] p-3 text-xs">
                <div className="flex items-center gap-2 text-ink">
                  <CalendarIcon className="h-3.5 w-3.5 text-ink-faint" />
                  <span>
                    Shift:{" "}
                    <span data-figure className="font-medium">
                      {record.shiftStart} – {record.shiftEnd}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-ink">
                  <span>
                    Punches:{" "}
                    <span data-figure className="font-medium">
                      {record.punchCount || 0} / {isExec ? 2 : 6}
                    </span>
                  </span>
                  {record.isLate && (
                    <span className="font-medium text-[var(--state-rework-ink)]">
                      Late <span data-figure>{fmtLate(record)}</span>
                    </span>
                  )}
                  {record.isEarlyDeparture && (
                    <span className="font-medium text-[var(--state-extension-ink)]">
                      Early{" "}
                      <span data-figure>
                        -{minsToHHMM(record.earlyDepartureMins)}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {record.missingPunchType && (
                <div className="flex items-start gap-2.5 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-rework-ink)]" />
                  <p className="text-xs text-[var(--state-rework-ink)]">
                    System detected missing punch:{" "}
                    <strong className="capitalize">
                      {record.missingPunchType.replace(/_/g, " ")}
                    </strong>{" "}
                    — use the <strong>+</strong> button below to add the correct
                    time.
                  </p>
                </div>
              )}

              {punchNote.msg && (
                <div
                  className={`flex items-center gap-2 rounded-inset px-3 py-2.5 text-sm ${
                    punchNote.type === "success"
                      ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]"
                      : "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]"
                  }`}
                >
                  {punchNote.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  {punchNote.msg}
                </div>
              )}

              <div>
                <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Punch Timeline
                  <span className="ml-2 text-[10px] font-normal tracking-normal text-ink-faint normal-case">
                    Click <span className="font-semibold">+</span> to add ·{" "}
                    <span className="font-semibold">✏</span> to edit ·{" "}
                    <span className="font-semibold">✕</span> to remove
                  </span>
                </h4>
                <div
                  className={`grid gap-2 ${isExec ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}
                >
                  {slots.map((slot) => {
                    const m = slotMeta[slot];
                    const has = !!m.value;
                    const Icon = m.icon;
                    const isEditing = editingSlot === slot;
                    const isSaving = savingSlot === slot;
                    const source = getPunchSource(slot);

                    return (
                      <div
                        key={slot}
                        className={`rounded-inset p-3 transition-colors ${
                          has
                            ? isEditing
                              ? "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                              : slotToneClass[m.tone]
                            : "bg-[var(--surface-sunken)] shadow-[inset_0_0_0_1px_var(--color-hairline)]"
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-1.5">
                          <Icon
                            className={`h-3.5 w-3.5 ${has ? "" : "text-ink-faint"}`}
                          />
                          <span
                            className={`text-[10px] font-medium tracking-[0.09em] uppercase ${has ? "" : "text-ink-faint"}`}
                          >
                            {m.label}
                          </span>
                          {source === "manual" && (
                            <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-risk-ink)]">
                              manual
                            </span>
                          )}
                          {source === "miss_punch" && (
                            <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-extension-ink)]">
                              regularized
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              type="time"
                              value={draftTime}
                              onChange={(e) => setDraftTime(e.target.value)}
                              data-figure
                              className="px-2.5 py-1.5"
                            />
                            <div className="flex gap-1.5">
                              <RoleGate min="editor">
                                <Button
                                  tone="primary"
                                  size="sm"
                                  className="flex-1"
                                  disabled={isSaving || !draftTime}
                                  onClick={() =>
                                    applyPunchCorrection(
                                      slot,
                                      has ? "modify" : "add",
                                      draftTime,
                                    )
                                  }
                                >
                                  {isSaving ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />{" "}
                                      Saving…
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-3 w-3" /> Save
                                    </>
                                  )}
                                </Button>
                              </RoleGate>
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setEditingSlot(null);
                                  setDraftTime("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-end justify-between gap-1">
                            <p
                              data-figure
                              className={`text-lg leading-none tracking-[-0.025em] ${has ? "" : "text-ink-faint italic"}`}
                            >
                              {has ? fmtTime(m.value) : "Missing"}
                            </p>
                            <div className="flex items-center gap-0.5">
                              <RoleGate min="editor">
                                <button
                                  title={
                                    has ? "Edit punch time" : "Add this punch"
                                  }
                                  onClick={() => {
                                    setEditingSlot(slot);
                                    setDraftTime(fmtTimeInput(m.value));
                                  }}
                                  className={`p-1.5 rounded transition-colors ${slotBtnColor[m.tone]}`}
                                >
                                  {has ? (
                                    <Edit3 className="w-3 h-3" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </RoleGate>
                              {has && (
                                <RoleGate min="editor">
                                  <button
                                    title="Remove this punch"
                                    disabled={isSaving}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Remove ${m.label} punch for ${record.employeeName}?`,
                                        )
                                      )
                                        return;
                                      applyPunchCorrection(
                                        slot,
                                        "remove",
                                        null,
                                      );
                                    }}
                                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)] disabled:opacity-40"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                  </button>
                                </RoleGate>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Field label="HR Remarks for corrections">
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="e.g. Biometric failure reported, manually corrected"
                  className="resize-none"
                />
              </Field>

              <div>
                <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Work Duration
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <MetricTile
                    icon={Clock}
                    label="Net Work"
                    value={minsToHHMM(record.netWorkMins)}
                    tone={record.netWorkMins >= 480 ? "emerald" : "gray"}
                  />
                  <MetricTile
                    icon={Coffee}
                    label="Break"
                    value={minsToHHMM(record.totalBreakMins)}
                    tone="orange"
                  />
                  <MetricTile
                    icon={TrendingUp}
                    label="Overtime"
                    value={minsToHHMM(record.otMins)}
                    tone={record.otMins > 0 ? "indigo" : "gray"}
                  />
                  <MetricTile
                    icon={AlertTriangle}
                    label="Late By"
                    value={fmtLate(record)}
                    tone={record.lateMins > 0 ? "amber" : "gray"}
                  />
                </div>
              </div>

              {record.rawPunches?.length > 0 && (
                <div>
                  <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Raw Punch Log (
                    <span data-figure>{record.rawPunches.length}</span>)
                  </h4>
                  <div className="scroll-slim overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          {["Seq", "Time", "Type", "Source"].map((h) => (
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
                        {record.rawPunches.map((p, i) => (
                          <tr key={i} className="hover:bg-[var(--row-hover)]">
                            <td
                              data-figure
                              className="border-b border-hairline px-3 py-2.5 text-xs text-ink-faint"
                            >
                              {p.seq || i + 1}
                            </td>
                            <td
                              data-figure
                              className="border-b border-hairline px-3 py-2.5 text-xs text-ink"
                            >
                              {fmtTime(p.time)}
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink capitalize">
                              {(p.punchType || "unknown").replace(/_/g, " ")}
                            </td>
                            <td className="border-b border-hairline px-3 py-2.5">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  p.source === "manual"
                                    ? "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]"
                                    : p.source === "miss_punch"
                                      ? "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]"
                                      : "bg-[var(--control)] text-ink-muted"
                                }`}
                              >
                                {p.source || "device"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-inset p-3 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
                <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Status Resolution
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-faint">System:</span>
                  <StatusBadge
                    status={record.systemPrediction}
                    small
                    displayLabels={displayLabels}
                  />
                  <span className="text-ink-faint">→</span>
                  <span className="text-ink-faint">HR:</span>
                  {record.hrFinalStatus ? (
                    <StatusBadge
                      status={record.hrFinalStatus}
                      small
                      displayLabels={displayLabels}
                    />
                  ) : (
                    <span className="text-xs text-ink-faint italic">
                      Not overridden
                    </span>
                  )}
                </div>
                {attValue !== undefined && attValue !== null && (
                  <div className="mt-2 flex items-center gap-2 border-t border-hairline pt-2">
                    <span className="text-xs text-ink-faint">
                      Attendance value:
                    </span>
                    <span
                      data-figure
                      className={`text-xs font-medium ${attValue === 0.5 ? "text-[var(--state-rework-ink)]" : attValue === 1 ? "text-[var(--state-positive-ink)]" : "text-[var(--state-overdue-ink)]"}`}
                    >
                      {attValue}{" "}
                      {attValue === 0.5
                        ? "(Half Day)"
                        : attValue === 1
                          ? "(Full Day)"
                          : "(Absent/Unpaid)"}
                    </span>
                  </div>
                )}
                {record.hrRemarks && (
                  <div className="mt-2 flex items-start gap-1.5 border-t border-hairline pt-2 text-xs text-ink-muted">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
                    <span>
                      <span className="font-medium">Remarks:</span>{" "}
                      {record.hrRemarks}
                    </span>
                  </div>
                )}
              </div>

              <RoleGate min="editor">
                <Button
                  tone="primary"
                  onClick={() => setTab("override")}
                  className="w-full"
                >
                  Override Status
                </Button>
              </RoleGate>
            </>
          )}

          {tab === "override" && (
            <>
              <div>
                <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Set HR Final Status
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setNewStatus(key)}
                      className={`rounded-inset px-2.5 py-2 text-xs transition-colors ${
                        newStatus === key
                          ? `${cfg.chip} font-medium shadow-[inset_0_0_0_1.5px_var(--color-ink)]`
                          : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)] hover:text-ink"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`}
                        />
                        <span>{getStatusLabel(key, displayLabels)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {needsTime ? (
                <div>
                  <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Attendance Times
                    <span className="ml-2 text-[10px] font-normal tracking-normal text-ink-faint normal-case">
                      Required for {getStatusLabel(newStatus, displayLabels)}
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Check In">
                      <Input
                        type="time"
                        value={inTime}
                        onChange={(e) => setInTime(e.target.value)}
                        data-figure
                      />
                    </Field>
                    <Field label="Check Out">
                      <Input
                        type="time"
                        value={outTime}
                        onChange={(e) => setOutTime(e.target.value)}
                        data-figure
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{getStatusLabel(newStatus, displayLabels)}</strong>{" "}
                    doesn't need times. Existing In/Out will be cleared.
                  </span>
                </div>
              )}

              <Field label="HR Remarks">
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="e.g. On-site visit, Sick leave approved…"
                  className="resize-none"
                />
              </Field>

              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  onClick={() => setTab("details")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <RoleGate min="editor">
                  <Button
                    tone="primary"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />{" "}
                        Saving…
                      </>
                    ) : (
                      <>Save as {getStatusLabel(newStatus, displayLabels)}</>
                    )}
                  </Button>
                </RoleGate>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function AttendanceDailyPage() {
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [department, setDepartment] = useState("all");
  const [departments, setDepartments] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [holiday, setHoliday] = useState(null);
  const [displayLabels, setDisplayLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const refreshBidRef = useRef(null);

  useEffect(() => {
    api("/hr/attendance/departments")
      .then((r) => setDepartments(r.data || []))
      .catch(() => {});
  }, []);

  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date });
      if (department !== "all") params.set("department", department);
      const data = await api(`/hr/attendance/daily?${params}`);
      setRecords(data.data || []);
      setSummary(data.summary || {});
      setHoliday(data.holiday || null);
      setDisplayLabels(data.displayLabels || {});
    } catch (err) {
      console.error("Load daily:", err.message);
      setRecords([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }, [date, department]);

  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  useEffect(() => {
    if (refreshBidRef.current && records.length > 0) {
      const fresh = records.find(
        (r) => r.biometricId === refreshBidRef.current,
      );
      if (fresh) setSelectedRecord(fresh);
      refreshBidRef.current = null;
    }
  }, [records]);

  const handleRefresh = useCallback(
    async (biometricId) => {
      refreshBidRef.current = biometricId;
      await loadDaily();
    },
    [loadDaily],
  );

  // ── FIX: use /sync-period with { from, to } — matches backend expectation ──
  const handleSync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      await api("/hr/attendance/sync-period", {
        method: "POST",
        body: JSON.stringify({ from: date, to: date }),
      });
      await loadDaily();
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // ── Export: calls /export-daily with date + department ────────────────────
  const handleExport = () => {
    const qs = new URLSearchParams({ date });
    if (department !== "all") qs.set("department", department);
    window.open(`${API}/hr/attendance/export-daily?${qs}`, "_blank");
  };

  const handleOverride = async (payload) => {
    await api("/hr/attendance/day-override", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setSelectedRecord(null);
    await loadDaily();
  };

  const changeDate = (delta) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        const status =
          r.effectiveStatus || r.hrFinalStatus || r.systemPrediction || "AB";
        if (statusFilter !== "all") {
          if (statusFilter === "present" && !["P", "P*", "P~"].includes(status))
            return false;
          if (statusFilter === "late" && status !== "P*") return false;
          if (statusFilter === "halfday" && !["HD", "LHD"].includes(status))
            return false;
          if (statusFilter === "misspunch" && status !== "MP") return false;
          if (
            statusFilter === "absent" &&
            !["AB", "LAB", "EAB"].includes(status)
          )
            return false;
          if (
            statusFilter === "weekoff" &&
            !["WO", "FH", "NH", "OH", "RH", "PH"].includes(status)
          )
            return false;
          if (
            statusFilter === "leave" &&
            !["L-CL", "L-SL", "L-EL", "LWP", "CO", "WFH"].includes(status)
          )
            return false;
        }
        if (typeFilter !== "all" && r.employeeType !== typeFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !(r.employeeName || "").toLowerCase().includes(q) &&
            !(r.biometricId || "").toLowerCase().includes(q) &&
            !(r.identityId || "").toLowerCase().includes(q) &&
            !(r.department || "").toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) =>
        (a.employeeName || "").localeCompare(b.employeeName || ""),
      );
  }, [records, search, typeFilter, statusFilter]);

  const dayName = new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isSunday = new Date(date + "T00:00:00").getDay() === 0;

  const holidayCounts = useMemo(() => {
    let fh = 0,
      nh = 0,
      oh = 0,
      rh = 0;
    for (const r of records) {
      const s = r.effectiveStatus || r.systemPrediction;
      if (s === "FH") fh++;
      if (s === "NH") nh++;
      if (s === "OH") oh++;
      if (s === "RH") rh++;
    }
    return { FH: fh, NH: nh, OH: oh, RH: rh, total: fh + nh + oh + rh };
  }, [records]);

  return (
    <DashboardLayout activeMenu="attendance-daily">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Header */}
        <PageHead
          kicker="Human resources"
          title="Daily Attendance"
          sub={
            <span className="flex flex-wrap items-center gap-2">
              <span data-figure>{dayName}</span>
              {isSunday && !holiday && (
                <Chip tone="neutral">
                  <Moon className="h-3 w-3" /> Weekly Off
                </Chip>
              )}
            </span>
          }
          actions={
            <>
              <div className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] p-[3px]">
                <button
                  onClick={() => changeDate(-1)}
                  aria-label="Previous day"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-figure
                  className="w-auto py-1.5"
                />
                <button
                  onClick={() => changeDate(1)}
                  aria-label="Next day"
                  className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => setDate(new Date().toISOString().split("T")[0])}
              >
                Today
              </Button>
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                  />
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
              </RoleGate>
              <Button size="sm" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </>
          }
        />

        <div className="space-y-5">
          {/* Sync error banner */}
          {syncError && (
            <InlineError
              message={`Sync failed: ${syncError}`}
              onRetry={() => setSyncError("")}
            />
          )}

          {/* Holiday banner */}
          {holiday && (
            <Panel label={holiday.name}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)]">
                  <Sparkles className="h-5 w-5 text-[var(--state-risk-ink)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    {holiday.statusCode || "PH"} ·{" "}
                    {(holiday.type || "company").replace(/_/g, " ")}
                  </span>
                  <h3 className="mt-0.5 text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                    {holiday.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    All employees marked as{" "}
                    {getStatusLabel(holiday.statusCode || "PH", displayLabels)}.
                    Anyone who still punched keeps their P status.
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {/* Summary quick-filter cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <SummaryCard
              icon={Users}
              label="All"
              value={summary.total || 0}
              tone="gray"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <SummaryCard
              icon={UserCheck}
              label="Present"
              value={summary.presentCount || 0}
              tone="emerald"
              active={statusFilter === "present"}
              onClick={() => setStatusFilter("present")}
              sub={`${summary.P || 0} on-time`}
            />
            <SummaryCard
              icon={Timer}
              label="Late"
              value={summary["P*"] || 0}
              tone="amber"
              active={statusFilter === "late"}
              onClick={() => setStatusFilter("late")}
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Half Day"
              value={summary.HD || 0}
              tone="yellow"
              active={statusFilter === "halfday"}
              onClick={() => setStatusFilter("halfday")}
            />
            <SummaryCard
              icon={AlertCircle}
              label="Miss Punch"
              value={summary.MP || 0}
              tone="pink"
              active={statusFilter === "misspunch"}
              onClick={() => setStatusFilter("misspunch")}
            />
            <SummaryCard
              icon={UserX}
              label="Absent"
              value={summary.AB || 0}
              tone="rose"
              active={statusFilter === "absent"}
              onClick={() => setStatusFilter("absent")}
            />
            <SummaryCard
              icon={Moon}
              label="Off / Holiday"
              value={(summary.WO || 0) + holidayCounts.total}
              tone="blue"
              active={statusFilter === "weekoff"}
              onClick={() => setStatusFilter("weekoff")}
              sub={
                holidayCounts.total > 0
                  ? `${holidayCounts.total} holiday`
                  : undefined
              }
            />
            <SummaryCard
              icon={CalendarDays}
              label="On Leave"
              value={
                records.filter((r) =>
                  ["L-CL", "L-SL", "L-EL", "LWP", "WFH", "CO"].includes(
                    r.effectiveStatus || r.systemPrediction,
                  ),
                ).length
              }
              tone="purple"
              active={statusFilter === "leave"}
              onClick={() => setStatusFilter("leave")}
            />
          </div>

          {statusFilter !== "all" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-ink-faint">
                <Filter className="h-3.5 w-3.5" /> Filtered:
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-2.5 py-[5px] text-xs text-ink-muted">
                {statusFilter === "present"
                  ? "Present"
                  : statusFilter === "late"
                    ? "Late"
                    : statusFilter === "halfday"
                      ? "Half Day"
                      : statusFilter === "misspunch"
                        ? "Miss Punch"
                        : statusFilter === "absent"
                          ? "Absent"
                          : statusFilter === "weekoff"
                            ? "Off / Holiday"
                            : statusFilter === "leave"
                              ? "On Leave"
                              : statusFilter}
                <button onClick={() => setStatusFilter("all")}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          {/* Search & filters */}
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="text"
                placeholder="Search by name, ID, biometric code, or department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-label="Department"
              className="lg:w-56"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Employee type"
              className="lg:w-44"
            >
              <option value="all">All Types</option>
              <option value="operator">Operators</option>
              <option value="executive">Executives</option>
            </Select>
          </div>

          {/* Table */}
          <Panel padded={false} label="Daily attendance records">
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>In</Th>
                    <Th>Out</Th>
                    <Th align="right">Net Work</Th>
                    <Th align="right">Break</Th>
                    <Th align="right">OT</Th>
                    <Th align="right">Late</Th>
                    <Th align="center">Punches</Th>
                    <Th align="center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array(8)
                      .fill(0)
                      .map((_, i) => (
                        <tr key={i}>
                          <td colSpan={11} className="px-3 py-3">
                            <Skeleton className="h-5" />
                          </td>
                        </tr>
                      ))
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState
                          title={
                            records.length === 0
                              ? "No records for this date"
                              : "No records match the current filters"
                          }
                          body={
                            records.length === 0
                              ? "Click Sync to fetch the day from the biometric device."
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const status =
                        r.effectiveStatus ||
                        r.hrFinalStatus ||
                        r.systemPrediction ||
                        "AB";
                      const isExec = r.employeeType === "executive";
                      const expected = isExec ? 2 : 6;
                      return (
                        <tr
                          key={r.biometricId}
                          className="cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
                          onClick={() => setSelectedRecord(r)}
                        >
                          <td className="border-b border-hairline px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.employeeName} />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1 truncate text-sm text-ink">
                                  {r.employeeName || "—"}
                                  {r.isGhost && (
                                    <span className="rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-rework-ink)]">
                                      GHOST
                                    </span>
                                  )}
                                  {(r.appliedExtraGraceMins || 0) > 0 && (
                                    <span
                                      data-figure
                                      className="rounded-full bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-risk-ink)]"
                                      title={`+${r.appliedExtraGraceMins}m grace from yesterday's OT`}
                                    >
                                      +{r.appliedExtraGraceMins}m
                                    </span>
                                  )}
                                </p>
                                <p className="truncate text-[11px] text-ink-faint">
                                  <span data-figure>
                                    {r.identityId || r.biometricId}
                                  </span>{" "}
                                  · {r.department}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isExec ? "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]" : "bg-[var(--control)] text-ink-muted"}`}
                            >
                              {isExec ? "EXE" : "OPR"}
                            </span>
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5">
                            <StatusBadge
                              status={status}
                              small
                              displayLabels={displayLabels}
                            />
                            {r.hrFinalStatus && (
                              <span className="ml-1 text-[9px] font-medium text-ink-muted">
                                HR
                              </span>
                            )}
                            {r.wasPromotedToHalfDay && (
                              <span className="ml-1 text-[9px] font-medium text-[var(--state-rework-ink)]">
                                ↑HD
                              </span>
                            )}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-xs whitespace-nowrap"
                          >
                            <span
                              className={
                                r.inTime ? "text-ink" : "text-ink-faint"
                              }
                            >
                              {fmtTime(r.inTime)}
                            </span>
                            {r.isLate && (
                              <span className="ml-1 text-[10px] text-[var(--state-rework-ink)]">
                                +{r.lateDisplay || minsToHHMM(r.lateMins)}
                              </span>
                            )}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-xs whitespace-nowrap"
                          >
                            <span
                              className={
                                r.finalOut ? "text-ink" : "text-ink-faint"
                              }
                            >
                              {fmtTime(r.finalOut)}
                            </span>
                            {r.isEarlyDeparture && (
                              <span className="ml-1 text-[10px] text-[var(--state-extension-ink)]">
                                -{minsToHHMM(r.earlyDepartureMins)}
                              </span>
                            )}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-right text-xs whitespace-nowrap"
                          >
                            <span
                              className={
                                r.netWorkMins >= 480
                                  ? "text-[var(--state-positive-ink)]"
                                  : r.netWorkMins > 0
                                    ? "text-ink"
                                    : "text-ink-faint"
                              }
                            >
                              {minsToHHMM(r.netWorkMins)}
                            </span>
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink-faint whitespace-nowrap"
                          >
                            {minsToHHMM(r.totalBreakMins)}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-right text-xs whitespace-nowrap"
                          >
                            {r.otMins > 0 ? (
                              <span className="text-[var(--state-risk-ink)]">
                                {minsToHHMM(r.otMins)}
                              </span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                          <td
                            data-figure
                            className="border-b border-hairline px-3 py-2.5 text-right text-xs whitespace-nowrap"
                          >
                            {r.lateMins > 0 ? (
                              <span className="text-[var(--state-rework-ink)]">
                                {r.lateDisplay || minsToHHMM(r.lateMins)}
                              </span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5 text-center">
                            <span
                              data-figure
                              className={`text-xs font-medium ${(r.punchCount || 0) >= expected ? "text-[var(--state-positive-ink)]" : (r.punchCount || 0) >= 2 ? "text-[var(--state-rework-ink)]" : "text-[var(--state-overdue-ink)]"}`}
                            >
                              {r.punchCount || 0}/{expected}
                            </span>
                            {r.hasMissPunch && (
                              <span className="ml-1 text-[10px] text-[var(--state-blocked-ink)]">
                                ⚠
                              </span>
                            )}
                          </td>
                          <td className="border-b border-hairline px-3 py-2.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRecord(r);
                              }}
                              aria-label="View record"
                              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!loading && filteredRecords.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 text-xs text-ink-faint">
                <span>
                  Showing{" "}
                  <span data-figure className="text-ink">
                    {filteredRecords.length}
                  </span>{" "}
                  of <span data-figure>{records.length}</span>
                </span>
                <span className="flex flex-wrap items-center gap-4">
                  <span>
                    Present:{" "}
                    <b
                      data-figure
                      className="font-medium text-[var(--state-positive-ink)]"
                    >
                      {summary.presentCount || 0}
                    </b>
                  </span>
                  <span>
                    Late:{" "}
                    <b
                      data-figure
                      className="font-medium text-[var(--state-rework-ink)]"
                    >
                      {summary["P*"] || 0}
                    </b>
                  </span>
                  <span>
                    HD:{" "}
                    <b
                      data-figure
                      className="font-medium text-[var(--state-rework-ink)]"
                    >
                      {summary.HD || 0}
                    </b>
                  </span>
                  <span>
                    MP:{" "}
                    <b
                      data-figure
                      className="font-medium text-[var(--state-blocked-ink)]"
                    >
                      {summary.MP || 0}
                    </b>
                  </span>
                  <span>
                    Absent:{" "}
                    <b
                      data-figure
                      className="font-medium text-[var(--state-overdue-ink)]"
                    >
                      {summary.AB || 0}
                    </b>
                  </span>
                  {holidayCounts.total > 0 && (
                    <span>
                      Holiday:{" "}
                      <b
                        data-figure
                        className="font-medium text-[var(--state-risk-ink)]"
                      >
                        {holidayCounts.total}
                      </b>
                    </span>
                  )}
                </span>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {selectedRecord && (
        <DetailDrawer
          record={selectedRecord}
          dateStr={date}
          displayLabels={displayLabels}
          onClose={() => setSelectedRecord(null)}
          onOverride={handleOverride}
          onRefresh={handleRefresh}
        />
      )}
    </DashboardLayout>
  );
}

function Th({ children, align = "left" }) {
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <th
      className={`border-b border-hairline px-3 py-2.5 ${alignClass} text-[11px] font-medium tracking-[0.09em] whitespace-nowrap text-ink-faint uppercase`}
    >
      {children}
    </th>
  );
}
