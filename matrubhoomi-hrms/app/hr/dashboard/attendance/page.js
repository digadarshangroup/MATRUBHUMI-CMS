"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Calendar,
  Download,
  Users,
  Clock,
  AlertCircle,
  UserX,
  ChevronLeft,
  ChevronsLeft,
  ChevronRight,
  ChevronsRight,
  ChevronDown,
  CalendarDays,
  RefreshCw,
  Wifi,
  AlertTriangle,
  WifiOff,
  Zap,
  X,
  LogIn,
  LogOut as LogOutIcon,
  Coffee,
  Utensils,
  TrendingUp,
  Briefcase,
  Sun,
  Sparkles,
  CheckCircle2,
  LayoutGrid,
  List,
  Edit3,
  Plus,
  Trash2,
  Loader2,
  FileText,
  AlertOctagon,
  ArrowUp,
  ArrowDown,
  Minus,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";

import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
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

const API = process.env.NEXT_PUBLIC_API_URL || "";

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
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...getHeaders(), ...opts.headers },
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function getPeriodRange(period, refDate = new Date()) {
  const d = new Date(refDate);
  const y = d.getFullYear(),
    m = d.getMonth();
  switch (period) {
    case "this-month":
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(new Date(y, m + 1, 0)),
        label: d.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        }),
      };
    case "last-month":
      return {
        from: ymd(new Date(y, m - 1, 1)),
        to: ymd(new Date(y, m, 0)),
        label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        }),
      };
    case "this-quarter": {
      const q = Math.floor(m / 3);
      return {
        from: ymd(new Date(y, q * 3, 1)),
        to: ymd(new Date(y, q * 3 + 3, 0)),
        label: `Q${q + 1} ${y}`,
      };
    }
    case "last-quarter": {
      const q = Math.floor(m / 3) - 1,
        yy = q < 0 ? y - 1 : y,
        qq = (q + 4) % 4;
      return {
        from: ymd(new Date(yy, qq * 3, 1)),
        to: ymd(new Date(yy, qq * 3 + 3, 0)),
        label: `Q${qq + 1} ${yy}`,
      };
    }
    case "this-year":
      return {
        from: ymd(new Date(y, 0, 1)),
        to: ymd(new Date(y, 11, 31)),
        label: `${y}`,
      };
    case "last-year":
      return {
        from: ymd(new Date(y - 1, 0, 1)),
        to: ymd(new Date(y - 1, 11, 31)),
        label: `${y - 1}`,
      };
    default:
      return {
        from: ymd(new Date(y, m, 1)),
        to: ymd(new Date(y, m + 1, 0)),
        label: "This Month",
      };
  }
}

function isSingleMonth(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  return (
    fy === ty &&
    fm === tm &&
    from === `${fy}-${String(fm).padStart(2, "0")}-01` &&
    parseInt(to.split("-")[2]) === lastDay
  );
}

const minsToHHMM = (mins) => {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60),
    min = mins % 60;
  return h ? `${h}h ${String(min).padStart(2, "0")}m` : `${min}m`;
};
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
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
};
const STATUS_META = {
  P: {
    label: "Present",
    tone: "positive",
    dot: "bg-[var(--state-positive)]",
    chip: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)]",
    ct: "text-[var(--state-positive-ink)]",
    needsTime: true,
  },
  "P*": {
    label: "Late",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)]",
    ct: "text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  "P~": {
    label: "Early Out",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: true,
  },
  HD: {
    label: "Half Day",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)]",
    ct: "text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  // LHD / LAB / EAB are the statuses the late-and-early-out policy promotes a
  // day into: 3rd late becomes a half day, 5th becomes a full absence, and the
  // same ladder exists for early departures. Pay effect is identical to their
  // plain counterparts: LHD counts 0.5 of a day, LAB and EAB count 0. The
  // distinct codes exist so the reason a day was docked stays visible on the
  // record and in the export.
  LHD: {
    label: "Late Half Day",
    tone: "rework",
    dot: "bg-[var(--state-rework)]",
    chip: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)]",
    ct: "text-[var(--state-rework-ink)]",
    needsTime: true,
  },
  AB: {
    label: "Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)]",
    ct: "text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  LAB: {
    label: "Late Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)]",
    ct: "text-[var(--state-overdue-ink)]",
    needsTime: true,
  },
  EAB: {
    label: "Early Absent",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)]",
    ct: "text-[var(--state-overdue-ink)]",
    needsTime: true,
  },
  MP: {
    label: "Miss Punch",
    tone: "blocked",
    dot: "bg-[var(--state-blocked)]",
    chip: "bg-[color-mix(in_srgb,var(--state-blocked)_26%,transparent)] text-[var(--state-blocked-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-blocked)_18%,transparent)]",
    ct: "text-[var(--state-blocked-ink)]",
    needsTime: true,
  },
  WO: {
    label: "Weekly Off",
    tone: "neutral",
    dot: "bg-ink/35",
    chip: "bg-[var(--control)] text-ink-muted",
    cb: "bg-[var(--control)]",
    ct: "text-ink-muted",
    needsTime: false,
  },
  PH: {
    label: "Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  FH: {
    label: "Festival Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  NH: {
    label: "National Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  OH: {
    label: "Optional Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  RH: {
    label: "Restricted Holiday",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  "L-CL": {
    label: "Casual Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  "L-SL": {
    label: "Sick Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  "L-EL": {
    label: "Privilege Leave",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: false,
  },
  LWP: {
    label: "LWP",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)]",
    ct: "text-[var(--state-overdue-ink)]",
    needsTime: false,
  },
  WFH: {
    label: "Work From Home",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: true,
  },
  CO: {
    label: "Comp Off",
    tone: "risk",
    dot: "bg-[var(--state-risk)]",
    chip: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)]",
    ct: "text-[var(--state-risk-ink)]",
    needsTime: false,
  },
  // ── Half-day Present + Half-day Leave variants (counted as Present) ──
  "P/CL": {
    label: "P/CL",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: true,
  },
  "P/SL": {
    label: "P/SL",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: true,
  },
  "P/PL": {
    label: "P/PL",
    tone: "extension",
    dot: "bg-[var(--state-extension)]",
    chip: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)]",
    ct: "text-[var(--state-extension-ink)]",
    needsTime: true,
  },
  "P/LWP": {
    label: "P/LWP",
    tone: "overdue",
    dot: "bg-[var(--state-overdue)]",
    chip: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
    cb: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)]",
    ct: "text-[var(--state-overdue-ink)]",
    needsTime: true,
  },
  UNSYNCED: {
    label: "Not synced",
    tone: "neutral",
    dot: "bg-ink/35",
    chip: "bg-[var(--control)] text-ink-muted",
    cb: "bg-[var(--control)]",
    ct: "text-ink-muted",
    needsTime: false,
  },
};
// Half-day leave variants → which leave bucket they consume (0.5 each)
// P/LWP intentionally not in this map — it deducts pay, not leave balance.
const HALF_LEAVE_MAP = {
  "P/CL": "CL",
  "P/SL": "SL",
  "P/PL": "PL",
};
// All statuses that count as "Present" in the day stats — includes the four
// half-day variants since the employee was physically present for half the day.
const PRESENT_STATUSES = new Set([
  "P",
  "P*",
  "P~",
  "MP",
  "WFH",
  "P/CL",
  "P/SL",
  "P/PL",
  "P/LWP",
]);

const HOL_TYPE_MAP = {
  national: "NH",
  optional: "OH",
  company: "FH",
  restricted: "RH",
};

const TONE_CLASSES = {
  emerald:
    "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
  amber:
    "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
  orange:
    "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
  yellow:
    "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
  rose: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
  pink: "bg-[color-mix(in_srgb,var(--state-blocked)_26%,transparent)] text-[var(--state-blocked-ink)]",
  gray: "bg-[var(--control)] text-ink-muted",
  blue: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  indigo:
    "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  purple:
    "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
  cyan: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  teal: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  positive:
    "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]",
  rework:
    "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)]",
  extension:
    "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]",
  blocked:
    "bg-[color-mix(in_srgb,var(--state-blocked)_26%,transparent)] text-[var(--state-blocked-ink)]",
  overdue:
    "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)] text-[var(--state-overdue-ink)]",
  risk: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]",
  neutral: "bg-[var(--control)] text-ink-muted",
};

function getLabel(status, displayLabels) {
  // Privilege Leave is stored internally under the legacy code "L-EL". Always
  // present it to the user as "PL" — regardless of any stale "EL"/"Earned
  // Leave" value that may live in backend display settings. "L-PL" is accepted
  // as a forward-compatible synonym.
  if (status === "L-EL" || status === "L-PL") return "PL";
  if (status === "PRE-JOINING") return "Before joining";
  if (displayLabels?.[status]) return displayLabels[status];
  return STATUS_META[status]?.label || status || "-";
}

function makeGhost(emp, ds, holStatus = null) {
  const st = holStatus || "AB";
  return {
    biometricId: emp.biometricId,
    employeeName: emp.employeeName,
    department: emp.department,
    designation: emp.designation,
    employeeType: emp.employeeType,
    identityId: emp.identityId || "",
    systemPrediction: st,
    hrFinalStatus: null,
    effectiveStatus: st,
    inTime: null,
    finalOut: null,
    lunchOut: null,
    lunchIn: null,
    teaOut: null,
    teaIn: null,
    punchCount: 0,
    rawPunches: [],
    netWorkMins: 0,
    totalBreakMins: 0,
    totalSpanMins: 0,
    otMins: 0,
    lateMins: 0,
    shiftStart: "09:30",
    shiftEnd: "18:30",
    isLate: false,
    isEarlyDeparture: false,
    attendanceValue: 0,
    isGhost: true,
  };
}

function resolveRecord(emp, ds, grid, holidayMap) {
  const real = grid[ds]?.[emp.biometricId];
  if (real) {
    // If real record has preJoining flag pass it through
    if (real.preJoining || real.status === "PRE-JOINING") return real;
    return real;
  }
  // No record and the date is before the employee joined — never fabricate
  // an AB/WO/holiday ghost for a day the person wasn't on the payroll.
  if (emp.dojStr && ds < emp.dojStr)
    return {
      biometricId: emp.biometricId,
      status: "PRE-JOINING",
      preJoining: true,
    };
  const hol = holidayMap[ds];
  if (hol) return makeGhost(emp, ds, HOL_TYPE_MAP[hol.type] || "FH");
  if (new Date(ds + "T00:00:00").getDay() === 0)
    return makeGhost(emp, ds, "WO");
  return makeGhost(emp, ds);
}

function Avatar({ name = "", size = "md" }) {
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const sz =
    size === "lg"
      ? "w-14 h-14 text-base"
      : size === "sm"
        ? "w-6 h-6 text-[9px]"
        : "w-9 h-9 text-xs";
  return (
    <div
      className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-[var(--control-active)] font-medium text-ink`}
    >
      {initials}
    </div>
  );
}
function MTile({ icon: Icon, label, value, tone = "gray" }) {
  const t = {
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
    <div className={`rounded-inset p-2.5 ${t[tone]}`}>
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
function Th({ children, className = "", width }) {
  return (
    <th
      style={width ? { width, minWidth: width } : undefined}
      className={`border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase ${className}`}
    >
      {children}
    </th>
  );
}
function CellCount({ value, tint, highlight }) {
  const colors = {
    emerald: "text-[var(--state-positive-ink)]",
    amber: "text-[var(--state-rework-ink)]",
    yellow: "text-[var(--state-rework-ink)]",
    rose: "text-[var(--state-overdue-ink)]",
    pink: "text-[var(--state-blocked-ink)]",
    purple: "text-[var(--state-extension-ink)]",
    indigo: "text-[var(--state-risk-ink)]",
  };
  return (
    <td className="border-b border-hairline px-3 py-2.5 text-right whitespace-nowrap">
      <span
        data-figure
        className={`text-sm ${value > 0 ? colors[tint] : "text-ink-faint"}`}
      >
        {value}
      </span>
      {highlight > 0 && (
        <span
          data-figure
          title={`${highlight} auto-HD`}
          className="ml-1 text-[10px] text-[var(--state-rework-ink)]"
        >
          {String.fromCharCode(8593)}
          {highlight}
        </span>
      )}
    </td>
  );
}
function PBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// NEW: Sortable column header
function SortTh({ col, sort, onSort, children, width }) {
  const active = sort.col === col;
  const dir = active ? sort.dir : null;
  const cycle = () => {
    if (!active || dir === null) onSort(col, "asc");
    else if (dir === "asc") onSort(col, "desc");
    else onSort(null, null);
  };
  const icon =
    dir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : dir === "desc" ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3 opacity-30" />
    );
  return (
    <th
      onClick={cycle}
      style={{ width, minWidth: width }}
      className={`cursor-pointer border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] whitespace-nowrap
                uppercase transition-colors select-none hover:bg-[var(--control)]
                ${active ? "bg-[var(--control)] text-ink" : "text-ink-faint"}`}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        <span className={`shrink-0 ${active ? "text-ink" : "text-ink-faint"}`}>
          {icon}
        </span>
      </div>
    </th>
  );
}

// DETAIL DRAWER
function DetailDrawer({ record, dateStr, dl, onClose, onOverride, onRefresh }) {
  const [tab, setTab] = useState(record?.isGhost ? "override" : "details");
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

  // ── Balance pre-check state (for P/CL, P/SL, P/PL) ──
  // Fetched lazily when a half-day-leave variant is selected.
  // Shape: { available: { CL, SL, PL }, monthUsed: { CL, SL, PL }, monthlyCap }
  const [balInfo, setBalInfo] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [warn, setWarn] = useState(null); // { kind, leaveType, available, monthUsed, monthlyCap }
  if (!record) return null;
  const isExec = record.employeeType === "executive";
  const curStatus =
    record.effectiveStatus ||
    record.hrFinalStatus ||
    record.systemPrediction ||
    "AB";
  const needsTime = STATUS_META[newStatus]?.needsTime;
  const isGhost = record.isGhost;
  const slots = isExec
    ? ["in", "out"]
    : ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"];
  const SM = {
    in: { label: "Check In", icon: LogIn, tone: "emerald", val: record.inTime },
    lunch_out: {
      label: "Lunch Out",
      icon: Utensils,
      tone: "orange",
      val: record.lunchOut,
    },
    lunch_in: {
      label: "Lunch In",
      icon: Utensils,
      tone: "orange",
      val: record.lunchIn,
    },
    tea_out: {
      label: "Tea Out",
      icon: Coffee,
      tone: "amber",
      val: record.teaOut,
    },
    tea_in: { label: "Tea In", icon: Coffee, tone: "amber", val: record.teaIn },
    out: {
      label: "Check Out",
      icon: LogOutIcon,
      tone: "rose",
      val: record.finalOut,
    },
  };
  const sTone = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
    orange:
      "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
    rose: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]",
  };
  const sBtn = {
    emerald: "text-[var(--state-positive-ink)] hover:bg-[var(--control)]",
    orange: "text-[var(--state-extension-ink)] hover:bg-[var(--control)]",
    amber: "text-[var(--state-rework-ink)] hover:bg-[var(--control)]",
    rose: "text-[var(--state-overdue-ink)] hover:bg-[var(--control)]",
  };
  const src = (k) =>
    record.rawPunches?.find((p) => p.punchType === k)?.source || null;
  const applyPunch = async (slotKey, action, punchTime) => {
    setSavingSlot(slotKey);
    setPunchNote({ msg: "", type: "" });
    try {
      await apiFetch("/hr/attendance/punch-correction", {
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
        msg: `${SM[slotKey]?.label} ${action === "remove" ? "removed" : "updated"} successfully`,
        type: "success",
      });
      setEditingSlot(null);
      onRefresh?.(record.biometricId, dateStr);
    } catch (e) {
      setPunchNote({ msg: e.message, type: "error" });
    } finally {
      setSavingSlot(null);
    }
  };
  // ── Fetch leave balance + monthly usage when a half-leave variant is picked.
  //    Cheap: triggered only when user selects P/CL, P/SL, or P/PL.
  useEffect(() => {
    if (!HALF_LEAVE_MAP[newStatus] || record?.isGhost === undefined) return;
    let cancelled = false;
    setBalLoading(true);
    apiFetch(
      `/hr/attendance/leave-balance-check?biometricId=${encodeURIComponent(
        record.biometricId,
      )}&dateStr=${encodeURIComponent(dateStr)}`,
    )
      .then((d) => {
        if (cancelled) return;
        setBalInfo(d?.data || null);
      })
      .catch(() => {
        if (!cancelled) setBalInfo(null);
      })
      .finally(() => {
        if (!cancelled) setBalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newStatus, record?.biometricId, dateStr]);

  const doSave = async (forceProceed = false) => {
    setSaving(true);
    try {
      const p = {
        biometricId: record.biometricId,
        dateStr,
        hrFinalStatus: newStatus,
        hrRemarks: remarks,
      };
      if (needsTime) {
        p.inTime = inTime || null;
        p.finalOut = outTime || null;
      } else {
        p.inTime = null;
        p.finalOut = null;
      }
      if (forceProceed) p.allowOverrideWithoutBalance = true;
      await onOverride(p, dateStr);
      setWarn(null);
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    // Pre-flight balance / cap checks for P/CL, P/SL, P/PL.
    // P/LWP is intentionally skipped — it's the "no-balance" escape hatch.
    const leaveType = HALF_LEAVE_MAP[newStatus];
    if (leaveType && balInfo) {
      const avail = Number(balInfo.available?.[leaveType] ?? 0);
      const monthUsed = Number(balInfo.monthUsed?.[leaveType] ?? 0);
      const cap = Number(balInfo.monthlyCap ?? 3);
      // Soft warning: insufficient balance (cannot go below 0).
      if (avail < 0.5) {
        setWarn({
          kind: "no_balance",
          leaveType,
          available: avail,
          monthUsed,
          monthlyCap: cap,
        });
        return;
      }
      // Soft warning: monthly cap (more than `cap` leaves of this type this month).
      if (monthUsed >= cap) {
        setWarn({
          kind: "monthly_cap",
          leaveType,
          available: avail,
          monthUsed,
          monthlyCap: cap,
        });
        return;
      }
    }
    await doSave(false);
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex overflow-hidden"
      onClick={onClose}
    >
      <div className="flex-1 bg-black/55" />
      <div
        className="frost-bar flex min-h-0 w-full max-w-2xl flex-col border-l border-hairline"
        style={{ animation: "slideIn .25s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={record.employeeName} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-light tracking-[-0.03em] text-ink">
                {record.employeeName || "-"}
              </h2>
              <p className="mt-0.5 text-xs text-ink-faint">
                {record.designation || "-"} . {record.department || "-"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Chip tone="neutral">
                  <CalendarDays className="h-3 w-3" />
                  <span data-figure>
                    {new Date(dateStr + "T00:00:00").toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        weekday: "short",
                      },
                    )}
                  </span>
                </Chip>
                <Chip tone={isExec ? "risk" : "neutral"}>
                  <Briefcase className="h-3 w-3" />
                  {isExec ? "Executive" : "Operator"}
                </Chip>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${STATUS_META[curStatus]?.chip || "bg-[var(--control)] text-ink-muted"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[curStatus]?.dot || "bg-ink/35"}`}
                  />
                  {getLabel(curStatus, dl)}
                </span>
                {record.hrFinalStatus && (
                  <span className="text-[10px] font-medium text-ink-muted">
                    HR Overridden
                  </span>
                )}
                {isGhost && (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] px-2 py-0.5 text-[9px] font-medium text-[var(--state-rework-ink)]">
                    NEW ENTRY
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="shrink-0 border-b border-hairline px-6 py-2">
          <Tabs
            label="Record detail"
            value={tab}
            onChange={setTab}
            options={(!isGhost ? ["details", "override"] : ["override"]).map(
              (t) => ({
                id: t,
                label: t === "details" ? "Punch Details" : "HR Override",
              }),
            )}
          />
        </div>
        <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {punchNote.msg && (
            <div
              className={`flex items-center gap-2 rounded-inset px-4 py-2.5 text-sm ${punchNote.type === "success" ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]" : "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]"}`}
            >
              {punchNote.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {punchNote.msg}
            </div>
          )}
          {isGhost && (
            <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] p-3 text-xs text-[var(--state-rework-ink)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No attendance record found for this day. Use{" "}
                <strong>HR Override</strong> to create one.
              </span>
            </div>
          )}
          {tab === "details" && !isGhost && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-inset bg-[var(--surface-sunken)] p-3 text-xs">
                <span className="flex items-center gap-2 text-ink">
                  <CalendarDays className="h-3.5 w-3.5 text-ink-faint" />
                  Shift:{" "}
                  <b data-figure className="font-medium">
                    {record.shiftStart} – {record.shiftEnd}
                  </b>
                </span>
                <span className="flex flex-wrap items-center gap-4 text-ink">
                  <span>
                    Punches:{" "}
                    <b data-figure className="font-medium">
                      {record.punchCount || 0}/{isExec ? 2 : 6}
                    </b>
                  </span>
                  {record.isLate && (
                    <span
                      data-figure
                      className="font-medium text-[var(--state-rework-ink)]"
                    >
                      Late {record.lateDisplay || minsToHHMM(record.lateMins)}
                    </span>
                  )}
                  {record.isEarlyDeparture && (
                    <span
                      data-figure
                      className="font-medium text-[var(--state-extension-ink)]"
                    >
                      Early {minsToHHMM(record.earlyDepartureMins)}
                    </span>
                  )}
                  {record.otMins > 0 && (
                    <span
                      data-figure
                      className="font-medium text-[var(--state-risk-ink)]"
                    >
                      OT {minsToHHMM(record.otMins)}
                    </span>
                  )}
                </span>
              </div>
              <div>
                <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Punch Timeline{" "}
                  <span className="ml-2 text-[10px] font-normal text-ink-faint normal-case">
                    Click + to add . ✏ to edit . ✕ to remove
                  </span>
                </h4>
                <div
                  className={`grid gap-2 ${isExec ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}
                >
                  {slots.map((slot) => {
                    const m = SM[slot];
                    const has = !!m.val;
                    const Icon = m.icon;
                    const isEd = editingSlot === slot;
                    const isSv = savingSlot === slot;
                    const s = src(slot);
                    return (
                      <div
                        key={slot}
                        className={`rounded-inset p-3 transition-colors ${has ? (isEd ? "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : sTone[m.tone]) : "bg-[var(--surface-sunken)] shadow-[inset_0_0_0_1px_var(--color-hairline)]"}`}
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
                          {s === "manual" && (
                            <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-risk-ink)]">
                              manual
                            </span>
                          )}
                          {s === "miss_punch" && (
                            <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--state-extension-ink)]">
                              regularized
                            </span>
                          )}
                        </div>
                        {isEd ? (
                          <div className="space-y-2">
                            <Input
                              type="time"
                              value={draftTime}
                              onChange={(e) => setDraftTime(e.target.value)}
                              data-figure
                              className="px-2.5 py-1.5"
                            />
                            <div className="flex gap-1.5">
                              <Button
                                tone="primary"
                                size="sm"
                                className="flex-1"
                                disabled={isSv || !draftTime}
                                onClick={() =>
                                  applyPunch(
                                    slot,
                                    has ? "modify" : "add",
                                    draftTime,
                                  )
                                }
                              >
                                {isSv ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Save
                                  </>
                                )}
                              </Button>
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
                              {has ? fmtTime(m.val) : "Missing"}
                            </p>
                            <div className="flex items-center gap-0.5">
                              <RoleGate min="editor">
                                <button
                                  onClick={() => {
                                    setEditingSlot(slot);
                                    setDraftTime(fmtTimeInput(m.val));
                                  }}
                                  className={`p-1.5 rounded transition-colors ${sBtn[m.tone]}`}
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
                                    disabled={isSv}
                                    onClick={() => {
                                      if (!window.confirm(`Remove ${m.label}?`))
                                        return;
                                      applyPunch(slot, "remove", null);
                                    }}
                                    className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)] disabled:opacity-40"
                                  >
                                    {isSv ? (
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
              <Field label="HR Remarks">
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="e.g. Biometric failure..."
                  className="resize-none"
                />
              </Field>
              <div>
                <h4 className="mb-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                  Work Duration
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <MTile
                    icon={Clock}
                    label="Net Work"
                    value={minsToHHMM(record.netWorkMins)}
                    tone={record.netWorkMins >= 480 ? "emerald" : "gray"}
                  />
                  <MTile
                    icon={Coffee}
                    label="Break"
                    value={minsToHHMM(record.totalBreakMins)}
                    tone="orange"
                  />
                  <MTile
                    icon={TrendingUp}
                    label="Overtime"
                    value={minsToHHMM(record.otMins)}
                    tone={record.otMins > 0 ? "indigo" : "gray"}
                  />
                  <MTile
                    icon={AlertTriangle}
                    label="Late By"
                    value={record.lateDisplay || minsToHHMM(record.lateMins)}
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
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${p.source === "manual" ? "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]" : p.source === "miss_punch" ? "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] text-[var(--state-extension-ink)]" : "bg-[var(--control)] text-ink-muted"}`}
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
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${STATUS_META[record.systemPrediction]?.chip || "bg-[var(--control)] text-ink-muted"}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[record.systemPrediction]?.dot || "bg-ink/35"}`}
                    />
                    {getLabel(record.systemPrediction, dl)}
                  </span>
                  <span className="text-ink-faint">→</span>
                  <span className="text-ink-faint">
                    {record.hrFinalStatus && record.hrReviewedBy
                      ? `${record.hrReviewedBy}:`
                      : "HR:"}
                  </span>
                  {record.hrFinalStatus ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${STATUS_META[record.hrFinalStatus]?.chip || "bg-[var(--control)] text-ink-muted"}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[record.hrFinalStatus]?.dot || "bg-ink/35"}`}
                      />
                      {getLabel(record.hrFinalStatus, dl)}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-faint italic">
                      Not overridden
                    </span>
                  )}
                </div>
                {record.hrFinalStatus && record.hrReviewedBy && (
                  <div className="mt-2 text-[11px] text-ink-faint">
                    Overridden by{" "}
                    <b className="font-medium text-ink">
                      {record.hrReviewedBy}
                    </b>
                    {record.hrReviewedAt ? (
                      <span data-figure>
                        {` · ${new Date(record.hrReviewedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    ) : (
                      ""
                    )}
                  </div>
                )}
                {record.hrRemarks && (
                  <div className="mt-2 flex items-start gap-1.5 border-t border-hairline pt-2 text-xs text-ink-muted">
                    <FileText className="mt-0.5 h-3 w-3 text-ink-faint" />
                    <span>
                      <b className="font-medium">Remarks:</b> {record.hrRemarks}
                    </span>
                  </div>
                )}
              </div>
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  className="w-full"
                  onClick={() => setTab("override")}
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
                  {Object.entries(STATUS_META)
                    .filter(([k]) => k !== "UNSYNCED")
                    .map(([k, c]) => (
                      <button
                        key={k}
                        onClick={() => setNewStatus(k)}
                        className={`rounded-inset px-2.5 py-2 text-xs transition-colors ${newStatus === k ? `${c.chip} font-medium shadow-[inset_0_0_0_1.5px_var(--color-ink)]` : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)] hover:text-ink"}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`}
                          />
                          <span>{getLabel(k, dl)}</span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
              {/* Live balance hint shown when a half-leave variant is selected */}
              {HALF_LEAVE_MAP[newStatus] &&
                (() => {
                  const lt = HALF_LEAVE_MAP[newStatus];
                  const avail = Number(balInfo?.available?.[lt] ?? 0);
                  const used = Number(balInfo?.monthUsed?.[lt] ?? 0);
                  const cap = Number(balInfo?.monthlyCap ?? 3);
                  const lowBal = balInfo && avail < 0.5;
                  const overCap = balInfo && used >= cap;
                  const tone =
                    lowBal || overCap
                      ? "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]"
                      : "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] text-[var(--state-risk-ink)]";
                  return (
                    <div
                      className={`flex items-start gap-2 rounded-inset p-3 text-xs ${tone}`}
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="flex-1">
                        <p className="mb-0.5 font-medium">
                          {balLoading
                            ? "Checking leave balance…"
                            : `${lt} balance for ${dateStr.slice(0, 4)}`}
                        </p>
                        {!balLoading && balInfo && (
                          <p className="opacity-80">
                            Available:{" "}
                            <b data-figure className="font-medium">
                              {avail}
                            </b>{" "}
                            · Used this month:{" "}
                            <b data-figure className="font-medium">
                              {used}
                            </b>{" "}
                            / <span data-figure>{cap}</span>
                            {lowBal && " · Insufficient for 0.5 deduction"}
                            {!lowBal && overCap && " · Monthly cap reached"}
                          </p>
                        )}
                        <p className="mt-1 opacity-70">
                          0.5 day will be deducted from {lt} balance. The day
                          counts as <b>Present</b>.
                        </p>
                      </div>
                    </div>
                  );
                })()}
              {newStatus === "P/LWP" && (
                <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] p-3 text-xs text-[var(--state-overdue-ink)]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="mb-0.5 font-medium">Half-day LWP</p>
                    <p className="opacity-80">
                      No leave balance affected. <b>0.5 day&apos;s pay</b> will
                      be deducted from this month&apos;s salary. The day counts
                      as <b>Present</b>.
                    </p>
                  </div>
                </div>
              )}
              {needsTime ? (
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
              ) : (
                <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <b className="font-medium">{getLabel(newStatus, dl)}</b>{" "}
                    doesn&apos;t need times. Existing In/Out will be cleared.
                  </span>
                </div>
              )}
              <Field label="HR Remarks">
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  placeholder="e.g. Sick leave approved..."
                  className="resize-none"
                />
              </Field>
              <div className="flex gap-2 pt-2">
                {!isGhost && (
                  <Button
                    className="flex-1"
                    onClick={() => setTab("details")}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                )}
                <RoleGate min="editor">
                  <Button
                    tone="primary"
                    className="flex-1"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>Save as {getLabel(newStatus, dl)}</>
                    )}
                  </Button>
                </RoleGate>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      {/* ── Soft-warning modal for insufficient balance / monthly cap ── */}
      {warn && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
          onClick={() => setWarn(null)}
        >
          <div
            className="frost-bar flex max-h-full w-full min-h-0 max-w-md flex-col rounded-panel border border-hairline"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)]">
                  <AlertTriangle className="h-5 w-5 text-[var(--state-rework-ink)]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                    {warn.kind === "no_balance"
                      ? `Insufficient ${warn.leaveType} balance`
                      : `${warn.leaveType} monthly cap reached`}
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {warn.kind === "no_balance"
                      ? `${record.employeeName} has only ${warn.available} ${warn.leaveType} available — needs 0.5 for this override.`
                      : `${record.employeeName} has already taken ${warn.monthUsed} ${warn.leaveType} this month (cap: ${warn.monthlyCap}).`}
                  </p>
                </div>
              </div>
              <div className="space-y-1 rounded-inset bg-[var(--surface-sunken)] p-3 text-xs text-ink">
                <p>
                  <b className="font-medium">Available {warn.leaveType}:</b>{" "}
                  <span data-figure>{warn.available}</span>
                </p>
                <p>
                  <b className="font-medium">Used this month:</b>{" "}
                  <span data-figure>
                    {warn.monthUsed} / {warn.monthlyCap}
                  </span>
                </p>
                <p className="mt-1 text-ink-faint">
                  Choose <b className="font-medium">P/LWP</b> instead to record
                  a half-day with pay deduction (no leave balance impact).
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
                <Button onClick={() => setWarn(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  tone="destructive"
                  onClick={() => {
                    setNewStatus("P/LWP");
                    setWarn(null);
                  }}
                  disabled={saving}
                >
                  Use P/LWP
                </Button>
                {warn.kind === "monthly_cap" ? (
                  <Button
                    tone="primary"
                    onClick={() => doSave(false)}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Proceed anyway
                  </Button>
                ) : (
                  <Button
                    disabled
                    title="Cannot proceed — balance would go below 0"
                  >
                    Blocked
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// LIST VIEW
function ListView({ employees, dates, grid, holidayMap, dl, onEdit }) {
  const [selectedBid, setSelectedBid] = useState(
    employees[0]?.biometricId || null,
  );
  const [expanded, setExpanded] = useState(new Set());
  const [empQ, setEmpQ] = useState("");
  const selEmp = employees.find((e) => e.biometricId === selectedBid);
  const filtEmps = employees.filter((e) => {
    if (!empQ) return true;
    const q = empQ.toLowerCase();
    return (
      e.employeeName?.toLowerCase().includes(q) ||
      e.biometricId?.toLowerCase().includes(q) ||
      e.department?.toLowerCase().includes(q)
    );
  });
  const toggleRow = (ds) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(ds) ? n.delete(ds) : n.add(ds);
      return n;
    });
  const isSun = (ds) => new Date(ds + "T00:00:00").getDay() === 0;
  const stats = (() => {
    const s = { P: 0, AB: 0, HD: 0, late: 0, leave: 0 };
    dates.forEach((ds) => {
      const r = grid[ds]?.[selectedBid];
      if (!r) return;
      const st =
        r.effectiveStatus || r.hrFinalStatus || r.systemPrediction || "AB";
      // Half-day variants: counted as Present, with the half-leave reflected in `leave`
      if (["P/CL", "P/SL", "P/PL", "P/LWP"].includes(st)) {
        s.P++;
        if (st !== "P/LWP") s.leave++; // CL/SL/PL half-leaves show in the Lv chip
      } else if (["P", "P~", "MP", "WFH"].includes(st)) s.P++;
      else if (st === "P*") {
        s.P++;
        s.late++;
      } else if (st === "HD") s.HD++;
      else if (st === "AB" || st === "LWP") s.AB++;
      else if (["L-CL", "L-SL", "L-EL", "L-PL", "CO"].includes(st)) s.leave++;
    });
    return s;
  })();
  const slotsMeta = {
    in: { label: "CHECK IN", icon: LogIn, tone: "emerald" },
    lunch_out: { label: "LUNCH OUT", icon: Utensils, tone: "orange" },
    lunch_in: { label: "LUNCH IN", icon: Utensils, tone: "orange" },
    tea_out: { label: "TEA OUT", icon: Coffee, tone: "amber" },
    tea_in: { label: "TEA IN", icon: Coffee, tone: "amber" },
    out: { label: "CHECK OUT", icon: LogOutIcon, tone: "rose" },
  };
  const tCard = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
    orange:
      "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
    rose: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]",
  };
  return (
    <div
      className="frost-panel flex overflow-hidden rounded-card"
      style={{ height: "calc(100vh - 260px)", minHeight: "520px" }}
    >
      <div className="flex w-72 shrink-0 flex-col border-r border-hairline">
        <div className="border-b border-hairline p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={empQ}
              onChange={(e) => setEmpQ(e.target.value)}
              placeholder="Search employees..."
              className="py-2 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto">
          {filtEmps.map((emp) => {
            const isExec = emp.employeeType === "executive";
            const active = emp.biometricId === selectedBid;
            return (
              <button
                key={emp.biometricId}
                onClick={() => {
                  setSelectedBid(emp.biometricId);
                  setExpanded(new Set());
                }}
                className={`flex w-full items-center gap-2.5 border-b border-hairline px-3 py-3 text-left transition-colors ${active ? "bg-[var(--control-active)]" : "hover:bg-[var(--row-hover)]"}`}
              >
                <Avatar name={emp.employeeName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-xs ${active ? "font-medium text-ink" : "text-ink"}`}
                  >
                    {emp.employeeName}
                  </p>
                  <p className="truncate text-[10px] text-ink-faint">
                    {emp.department} .{" "}
                    <span
                      className={`font-medium ${isExec ? "text-[var(--state-risk-ink)]" : "text-ink-muted"}`}
                    >
                      {isExec ? "EXE" : "OPR"}
                    </span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {selEmp && (
          <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-3">
            <div className="flex items-center gap-3">
              <Avatar name={selEmp.employeeName} />
              <div>
                <p className="text-sm font-medium text-ink">
                  {selEmp.employeeName}
                </p>
                <p data-figure className="text-[11px] text-ink-faint">
                  {selEmp.identityId || selEmp.biometricId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span
                data-figure
                className="font-medium text-[var(--state-positive-ink)]"
              >
                {stats.P}P
              </span>
              {stats.late > 0 && (
                <span
                  data-figure
                  className="font-medium text-[var(--state-rework-ink)]"
                >
                  {stats.late}L
                </span>
              )}
              <span
                data-figure
                className="font-medium text-[var(--state-overdue-ink)]"
              >
                {stats.AB}AB
              </span>
              <span
                data-figure
                className="font-medium text-[var(--state-rework-ink)]"
              >
                {stats.HD}HD
              </span>
              {stats.leave > 0 && (
                <span
                  data-figure
                  className="font-medium text-[var(--state-extension-ink)]"
                >
                  {stats.leave}Lv
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-2 text-[10px] font-medium tracking-[0.09em] text-ink-faint uppercase">
          <div className="w-5 flex-shrink-0" />
          <div className="w-16 flex-shrink-0">Day</div>
          <div className="w-28 flex-shrink-0">Status</div>
          <div className="w-24 flex-shrink-0">In Time</div>
          <div className="w-24 flex-shrink-0">Out Time</div>
          <div className="w-20 flex-shrink-0">Net Work</div>
          <div className="flex-1">Punches</div>
          <div className="w-8 flex-shrink-0" />
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto">
          {!selEmp ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">
              Select an employee
            </div>
          ) : (
            dates.map((ds) => {
              const realRec = grid[ds]?.[selEmp.biometricId] || null;
              const rec = resolveRecord(selEmp, ds, grid, holidayMap);
              const status =
                rec?.effectiveStatus ||
                rec?.hrFinalStatus ||
                rec?.systemPrediction;
              const cfg = status ? STATUS_META[status] : null;
              const sun = isSun(ds);
              const hol = holidayMap[ds];
              const day = new Date(ds + "T00:00:00");
              const isExp = expanded.has(ds);
              const isRest = ["WO", "FH", "NH", "OH", "RH", "PH"].includes(
                status,
              );
              const isExec = selEmp.employeeType === "executive";
              const slotKeys = isExec
                ? ["in", "out"]
                : ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"];
              // Pre-joining date — show placeholder, no edit
              if (rec?.preJoining || rec?.status === "PRE-JOINING") {
                const day2 = new Date(ds + "T00:00:00");
                return (
                  <div key={ds} className="border-b border-hairline">
                    <div className="flex cursor-not-allowed items-center gap-3 px-4 py-2 opacity-40 select-none">
                      <div className="w-5 shrink-0" />
                      <div className="w-16 shrink-0 text-ink-faint">
                        <span className="block text-[10px] tracking-[0.09em] uppercase">
                          {day2.toLocaleDateString("en-IN", {
                            weekday: "short",
                          })}
                        </span>
                        <span data-figure className="text-sm">
                          {day2.getDate()}
                        </span>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-[var(--control)] px-2 py-0.5 text-[10px] text-ink-muted">
                        Before joining
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={ds}
                  className={`border-b border-hairline ${sun && !hol ? "bg-[color-mix(in_srgb,var(--state-overdue)_6%,transparent)]" : hol ? "bg-[color-mix(in_srgb,var(--state-risk)_6%,transparent)]" : ""}`}
                >
                  <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--row-hover)]">
                    <button
                      onClick={() => realRec && !isRest && toggleRow(ds)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${realRec && !isRest ? "text-ink-muted hover:bg-[var(--control)] hover:text-ink" : "cursor-default text-ink-faint"}`}
                    >
                      {realRec && !isRest ? (
                        isExp ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <span className="w-3.5" />
                      )}
                    </button>
                    <div
                      className={`w-16 shrink-0 ${sun ? "text-[var(--state-overdue-ink)]" : hol ? "text-[var(--state-risk-ink)]" : "text-ink-faint"}`}
                    >
                      <span className="block text-[10px] tracking-[0.09em] uppercase">
                        {day.toLocaleDateString("en-IN", { weekday: "short" })}
                      </span>
                      <span data-figure className="text-sm text-ink">
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="flex w-28 shrink-0 items-center gap-1">
                      {status ? (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${cfg?.chip || "bg-[var(--control)] text-ink-muted"}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg?.dot || "bg-ink/35"}`}
                          />
                          {getLabel(status, dl)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-faint">-</span>
                      )}
                      {rec?.hrFinalStatus && (
                        <span className="text-[9px] font-medium text-ink-muted">
                          HR
                        </span>
                      )}
                    </div>
                    <div data-figure className="w-24 shrink-0 text-xs">
                      {rec?.inTime ? (
                        <span className="text-ink">
                          {fmtTime(rec.inTime)}
                          {rec.isLate && (
                            <span className="ml-1 text-[10px] text-[var(--state-rework-ink)]">
                              +{rec.lateDisplay || minsToHHMM(rec.lateMins)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </div>
                    <div data-figure className="w-24 shrink-0 text-xs">
                      {rec?.finalOut ? (
                        <span className="text-ink">
                          {fmtTime(rec.finalOut)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </div>
                    <div data-figure className="w-20 shrink-0 text-xs">
                      {rec?.netWorkMins > 0 ? (
                        <span
                          className={
                            rec.netWorkMins >= 480
                              ? "text-[var(--state-positive-ink)]"
                              : "text-ink"
                          }
                        >
                          {minsToHHMM(rec.netWorkMins)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </div>
                    <div data-figure className="flex-1 text-xs">
                      {realRec ? (
                        <span
                          className={
                            rec.punchCount >= (isExec ? 2 : 6)
                              ? "text-[var(--state-positive-ink)]"
                              : rec.punchCount >= 2
                                ? "text-[var(--state-rework-ink)]"
                                : "text-[var(--state-overdue-ink)]"
                          }
                        >
                          {rec.punchCount || 0}/{isExec ? 2 : 6}
                        </span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </div>
                    <button
                      onClick={() => onEdit(rec, ds)}
                      aria-label="Edit day"
                      className="w-8 shrink-0 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isExp && realRec && (
                    <div className="border-t border-hairline bg-[var(--surface-sunken)] px-16 pt-2 pb-4">
                      <div className="mb-2 flex items-center gap-4 text-xs text-ink-muted">
                        <span>
                          Shift:{" "}
                          <b data-figure className="font-medium text-ink">
                            {rec.shiftStart} – {rec.shiftEnd}
                          </b>
                        </span>
                        {rec.totalBreakMins > 0 && (
                          <span>
                            Break:{" "}
                            <b data-figure className="font-medium text-ink">
                              {minsToHHMM(rec.totalBreakMins)}
                            </b>
                          </span>
                        )}
                      </div>
                      <div
                        className={`grid gap-2 ${isExec ? "grid-cols-2" : "grid-cols-3 lg:grid-cols-6"}`}
                      >
                        {slotKeys.map((slot) => {
                          const sm = slotsMeta[slot];
                          const Icon = sm.icon;
                          const val =
                            slot === "in"
                              ? rec.inTime
                              : slot === "lunch_out"
                                ? rec.lunchOut
                                : slot === "lunch_in"
                                  ? rec.lunchIn
                                  : slot === "tea_out"
                                    ? rec.teaOut
                                    : slot === "tea_in"
                                      ? rec.teaIn
                                      : rec.finalOut;
                          const has = !!val;
                          return (
                            <div
                              key={slot}
                              className={`rounded-inset px-3 py-3 ${has ? tCard[sm.tone] : "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1px_var(--color-hairline)]"}`}
                            >
                              <div className="mb-2 flex items-center gap-1.5">
                                <Icon
                                  className={`h-3 w-3 ${has ? "" : "text-ink-faint"}`}
                                />
                                <span
                                  className={`text-[9px] font-medium tracking-[0.09em] uppercase ${has ? "" : "text-ink-faint"}`}
                                >
                                  {sm.label}
                                </span>
                              </div>
                              <p
                                data-figure
                                className={`text-sm ${has ? "" : "text-ink-faint italic"}`}
                              >
                                {has ? fmtTime(val) : "Missing"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// DAYROW - used inside EmployeeDrawer punch log
function DayRow({ row: r, employeeType, displayLabels }) {
  const [open, setOpen] = useState(false);
  // Pre-joining rows — greyed out, not expandable
  if (r.preJoining || r.status === "PRE-JOINING") {
    return (
      <>
        <tr className="cursor-not-allowed opacity-50">
          <td className="border-b border-hairline px-3 py-2.5" />
          <td className="border-b border-hairline px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="w-6 text-xs text-ink-faint">{r.dayName}</span>
              <span data-figure className="text-ink-muted">
                {r.dayNum}
              </span>
            </div>
          </td>
          <td className="border-b border-hairline px-3 py-2.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--control)] px-2 py-0.5 text-[11px] text-ink-muted">
              Before joining
            </span>
          </td>
          <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink-faint">
            —
          </td>
          <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink-faint">
            —
          </td>
          <td className="border-b border-hairline px-3 py-2.5 text-right text-xs text-ink-faint">
            —
          </td>
          <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink-faint">
            —
          </td>
          <td className="border-b border-hairline px-3 py-2.5 text-xs text-ink-faint">
            —
          </td>
        </tr>
      </>
    );
  }
  const meta = STATUS_META[r.status] || STATUS_META.AB;
  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.gray;
  const hasDetail = r.synced && r.rawPunches?.length > 0;
  const expected = employeeType === "operator" ? 6 : 2;
  const label = getLabel(r.status, displayLabels);
  const slotsMeta = {
    in: { label: "Check In", icon: LogIn, tone: "emerald" },
    lunch_out: { label: "Lunch Out", icon: Utensils, tone: "orange" },
    lunch_in: { label: "Lunch In", icon: Utensils, tone: "orange" },
    tea_out: { label: "Tea Out", icon: Coffee, tone: "amber" },
    tea_in: { label: "Tea In", icon: Coffee, tone: "amber" },
    out: { label: "Check Out", icon: LogOutIcon, tone: "rose" },
  };
  const toneClasses = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
    orange:
      "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
    rose: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]",
  };
  return (
    <>
      <tr
        className={`${!r.synced ? "opacity-70" : ""} ${hasDetail ? "cursor-pointer hover:bg-[var(--row-hover)]" : ""}`}
        onClick={() => hasDetail && setOpen((o) => !o)}
      >
        <td className="border-b border-hairline px-3 py-2.5 text-ink-faint">
          {hasDetail &&
            (open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            ))}
        </td>
        <td className="border-b border-hairline px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-ink-faint">{r.dayName}</span>
            <span data-figure className="text-ink">
              {r.dayNum}
            </span>
            {r.isSundayWorked && (
              <Sun className="h-3.5 w-3.5 text-[var(--state-extension)]" />
            )}
            {r.isHoliday && (
              <Sparkles
                className="h-3.5 w-3.5 text-[var(--state-risk)]"
                title={r.holidayName || "Holiday"}
              />
            )}
          </div>
        </td>
        <td className="border-b border-hairline px-3 py-2.5">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${tone}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
            {label}
          </span>
          {r.hrFinalStatus && (
            <span className="ml-1 text-[10px] font-medium text-ink-muted">
              HR
            </span>
          )}
        </td>
        <td
          data-figure
          className="border-b border-hairline px-3 py-2.5 text-ink"
        >
          {fmtTime(r.inTime)}
          {r.isLate && (
            <span className="ml-1 text-[10px] text-[var(--state-rework-ink)]">
              +{r.lateMins}m
            </span>
          )}
        </td>
        <td
          data-figure
          className="border-b border-hairline px-3 py-2.5 text-ink"
        >
          {fmtTime(r.finalOut)}
          {r.isEarlyDeparture && (
            <span className="ml-1 text-[10px] text-[var(--state-extension-ink)]">
              -{r.earlyDepartureMins}m
            </span>
          )}
        </td>
        <td
          data-figure
          className="border-b border-hairline px-3 py-2.5 text-right text-ink"
        >
          {minsToHHMM(r.netWorkMins)}
        </td>
        <td
          data-figure
          className="border-b border-hairline px-3 py-2.5 text-right text-xs"
        >
          {r.lateMins > 0 && (
            <span className="text-[var(--state-rework-ink)]">
              L{r.lateMins}m
            </span>
          )}
          {r.lateMins > 0 && r.otMins > 0 && " . "}
          {r.otMins > 0 && (
            <span className="text-[var(--state-risk-ink)]">OT{r.otMins}m</span>
          )}
          {!r.lateMins && !r.otMins && (
            <span className="text-ink-faint">-</span>
          )}
        </td>
        <td className="border-b border-hairline px-3 py-2.5 text-center">
          {r.synced && r.punchCount > 0 ? (
            <span
              data-figure
              className={`text-xs font-medium ${r.punchCount < expected ? "text-[var(--state-rework-ink)]" : "text-[var(--state-positive-ink)]"}`}
            >
              {r.punchCount}/{expected}
            </span>
          ) : (
            <span className="text-xs text-ink-faint">-</span>
          )}
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="bg-[var(--surface-sunken)]">
          <td colSpan={8} className="border-b border-hairline px-6 py-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                <span>
                  Shift:{" "}
                  <span data-figure className="font-medium text-ink">
                    {r.shiftStart} – {r.shiftEnd}
                  </span>
                </span>
                {r.isHoliday && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] px-2 py-0.5 text-[10px] text-[var(--state-risk-ink)]">
                    <Sparkles className="h-3 w-3" />{" "}
                    {r.holidayName || "Holiday"}
                  </span>
                )}
                {r.totalBreakMins > 0 && (
                  <span>
                    Break:{" "}
                    <span data-figure className="font-medium text-ink">
                      {minsToHHMM(r.totalBreakMins)}
                    </span>
                  </span>
                )}
              </div>
              <div
                className={`grid gap-2 ${expected === 6 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2"}`}
              >
                {(expected === 6
                  ? ["in", "lunch_out", "lunch_in", "tea_out", "tea_in", "out"]
                  : ["in", "out"]
                ).map((slot) => {
                  const m = slotsMeta[slot];
                  const Icon = m.icon;
                  const punch = (r.rawPunches || []).find(
                    (p) => p.punchType === slot,
                  );
                  const has = !!punch?.time;
                  return (
                    <div
                      key={slot}
                      className={`rounded-inset p-2.5 ${has ? toneClasses[m.tone] : "bg-[var(--surface-raised)] text-ink-faint shadow-[inset_0_0_0_1px_var(--color-hairline)]"}`}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Icon
                          className={`h-3.5 w-3.5 ${has ? "" : "opacity-40"}`}
                        />
                        <span className="text-[10px] font-medium tracking-[0.09em] uppercase">
                          {m.label}
                        </span>
                      </div>
                      <p
                        data-figure
                        className={`text-sm ${has ? "" : "italic opacity-50"}`}
                      >
                        {has ? fmtTime(punch.time) : "Missing"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {r.hrRemarks && (
                <div className="rounded-inset bg-[var(--control)] px-2.5 py-1.5 text-[11px] text-ink-muted">
                  <span className="font-medium">HR remarks:</span> {r.hrRemarks}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// EMPLOYEE DRAWER - fetches from /employee-detail endpoint
function EmployeeDrawer({ employee, range, displayLabels, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const qs = new URLSearchParams({
      biometricId: employee.biometricId,
      from: range.from,
      to: range.to,
    });
    fetch(`${API}/hr/attendance/employee-detail?${qs}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDetail(d);
      })
      .finally(() => setLoading(false));
  }, [employee.biometricId, range.from, range.to]);
  const DrawerStat = ({ label, value, sub, tone = "gray" }) => {
    const tones = {
      emerald:
        "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]",
      yellow:
        "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
      pink: "bg-[color-mix(in_srgb,var(--state-blocked)_18%,transparent)] text-[var(--state-blocked-ink)]",
      rose: "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]",
      amber:
        "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]",
      orange:
        "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
      indigo:
        "bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] text-[var(--state-risk-ink)]",
      purple:
        "bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] text-[var(--state-extension-ink)]",
      gray: "bg-[var(--surface-sunken)] text-ink",
    };
    return (
      <div className={`rounded-inset p-3 ${tones[tone] || tones.gray}`}>
        <p className="text-[10px] font-medium tracking-[0.09em] uppercase opacity-70">
          {label}
        </p>
        <p
          data-figure
          className="mt-1.5 text-[22px] leading-none tracking-[-0.025em]"
        >
          {value}
        </p>
        {sub && <p className="mt-1 text-[10px] opacity-60">{sub}</p>}
      </div>
    );
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex overflow-hidden"
      onClick={onClose}
    >
      <div className="flex-1 bg-black/55" />
      <div
        className="frost-bar animate-slide-in flex min-h-0 w-full max-w-3xl flex-col border-l border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={employee.employeeName} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-light tracking-[-0.03em] text-ink">
                {employee.employeeName || `(unknown - ${employee.biometricId})`}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span data-figure>{employee.biometricId}</span>
                <span className="text-ink-faint">.</span>
                <span>{employee.designation || "-"}</span>
                <span className="text-ink-faint">.</span>
                <span>{employee.department || "-"}</span>
                <Chip
                  tone={
                    employee.employeeType === "executive" ? "risk" : "neutral"
                  }
                  className="ml-1"
                >
                  <Briefcase className="h-3 w-3" />
                  {employee.employeeType === "executive"
                    ? "Executive"
                    : "Operator"}
                </Chip>
              </div>
              <p data-figure className="mt-1 text-xs text-ink-faint">
                {range.label} . {range.from} to {range.to}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {loading && !detail ? (
          <div className="p-8 text-center text-sm text-ink-muted">
            Loading...
          </div>
        ) : !detail ? (
          <div className="p-8 text-center text-sm text-[var(--state-overdue-ink)]">
            Failed to load details
          </div>
        ) : (
          <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <div className="flex items-center justify-between rounded-card bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] p-5">
              <div>
                <p className="text-[11px] font-medium tracking-[0.09em] text-[var(--state-positive-ink)] uppercase">
                  Total Attendance
                </p>
                <p
                  data-figure
                  className="mt-1.5 text-[40px] leading-none tracking-[-0.03em] text-[var(--state-positive-ink)]"
                >
                  {detail.stats.totalAttendance ||
                    detail.stats.effectivePresent ||
                    0}
                </p>
                <p className="mt-1.5 text-xs text-[var(--state-positive-ink)] opacity-80">
                  P + Late + MP + WO + Holidays + Leaves
                </p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-card bg-[var(--state-positive)]">
                <CheckCircle2 className="h-8 w-8 text-[var(--body-bg)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DrawerStat
                label="Effective Present"
                value={detail.stats.effectivePresent}
                tone="emerald"
                sub={`${detail.stats.P} P . ${detail.stats["P*"]} Late . ${detail.stats["P~"]} EO`}
              />
              <DrawerStat
                label="Half Day"
                value={(detail.stats.HD || 0) * 0.5}
                tone="yellow"
                sub="after cumulative late"
              />
              <DrawerStat
                label="Miss Punch"
                value={detail.stats.MP}
                tone="pink"
                sub="counted as present"
              />
              <DrawerStat
                label="Absent"
                value={detail.stats.AB}
                tone="rose"
                sub="no biometric record"
              />
              <DrawerStat
                label="Weekly Off"
                value={detail.stats.WO}
                tone="gray"
                sub="Sundays (no punch)"
              />
              <DrawerStat
                label="Holidays"
                value={
                  (detail.stats.FH || 0) +
                  (detail.stats.NH || 0) +
                  (detail.stats.OH || 0) +
                  (detail.stats.RH || 0) +
                  (detail.stats.PH || 0)
                }
                tone="indigo"
                sub={`${detail.stats.FH || 0} FH . ${detail.stats.NH || 0} NH`}
              />
              <DrawerStat
                label="Holiday Worked"
                value={detail.stats.holidayWorked || 0}
                tone="indigo"
                sub="★ punched on holiday"
              />
              <DrawerStat
                label="Sunday Worked"
                value={detail.stats.sundayWorked || 0}
                tone="orange"
                sub="punched on weekly off"
              />
              <DrawerStat
                label="Leaves"
                value={detail.stats.leaves || 0}
                tone="purple"
                sub={`${detail.stats["L-CL"] || 0} CL . ${detail.stats["L-SL"] || 0} SL . ${detail.stats["L-EL"] || 0} PL`}
              />
              <DrawerStat
                label="Total Late"
                value={minsToHHMM(detail.stats.totalLateMins)}
                tone="amber"
              />
              <DrawerStat
                label="Total OT"
                value={minsToHHMM(detail.stats.totalOtMins)}
                tone="indigo"
              />
              <DrawerStat
                label="Net Work"
                value={minsToHHMM(detail.stats.totalNetWorkMins)}
                tone="emerald"
              />
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                <CalendarDays className="h-4 w-4 text-ink-faint" /> Daily
                breakdown
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {detail.rows.map((r) => {
                  // Pre-joining days: muted "--" tile, never the absent red.
                  if (r.preJoining || r.status === "PRE-JOINING") {
                    return (
                      <div
                        key={r.dateStr}
                        title={`${r.dateStr} - Before joining`}
                        className="relative flex h-12 w-10 flex-col items-center justify-center rounded-inset bg-[var(--surface-sunken)] text-[10px] font-medium text-ink-faint opacity-50"
                      >
                        <span className="text-[9px] uppercase opacity-60">
                          {r.dayName}
                        </span>
                        <span data-figure className="text-sm leading-tight">
                          {r.dayNum}
                        </span>
                      </div>
                    );
                  }
                  const meta = STATUS_META[r.status] || STATUS_META.AB;
                  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;
                  return (
                    <div
                      key={r.dateStr}
                      title={`${r.dateStr} - ${getLabel(r.status, displayLabels)}${r.inTime ? ` . ${fmtTime(r.inTime)}` : ""}`}
                      className={`relative h-12 w-10 rounded-inset ${tone} flex flex-col items-center justify-center text-[10px] font-medium`}
                    >
                      <span className="text-[9px] uppercase opacity-60">
                        {r.dayName}
                      </span>
                      <span data-figure className="text-sm leading-tight">
                        {r.dayNum}
                      </span>
                      {r.isSundayWorked && (
                        <Sun className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-[var(--surface-raised)] text-[var(--state-extension)]" />
                      )}
                      {r.isHoliday && (
                        <Sparkles className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-[var(--surface-raised)] text-[var(--state-risk)]" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                Punch log
              </h3>
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {[
                        "",
                        "Date",
                        "Status",
                        "In",
                        "Out",
                        "Net Work",
                        "Late/OT",
                        "Punches",
                      ].map((h, i) => (
                        <th
                          key={i}
                          className={`border-b border-hairline px-3 py-2.5 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase ${i >= 5 && i <= 6 ? "text-right" : i === 7 ? "text-center" : "text-left"} ${i === 0 ? "w-8" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((r) => (
                      <DayRow
                        key={r.dateStr}
                        row={r}
                        employeeType={employee.employeeType}
                        displayLabels={displayLabels}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
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

// REMOVE MODAL
function RemoveModal({ employee, yearMonth, onClose, onRemoved }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const monthLabel = new Date(yearMonth + "-01").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const handleConfirm = async () => {
    setRemoving(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/hr/attendance/remove-from-month?biometricId=${encodeURIComponent(employee.biometricId)}&yearMonth=${encodeURIComponent(yearMonth)}`,
        { method: "DELETE", headers: getHeaders(), credentials: "include" },
      );
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.message || "Remove failed");
      onRemoved(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="frost-bar flex max-h-full w-full min-h-0 max-w-md flex-col rounded-panel border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scroll-slim min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)]">
              <AlertOctagon className="h-6 w-6 text-[var(--state-overdue-ink)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                Remove from {monthLabel}?
              </h3>
              <p className="mt-1.5 text-sm text-ink-muted">
                This will permanently delete all attendance entries for this
                employee in the selected month.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-inset bg-[var(--surface-sunken)] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--control-active)]">
              <span className="text-sm font-medium text-ink">
                {(employee.employeeName || employee.biometricId)
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("")}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {employee.employeeName || "(Unknown)"}
              </p>
              <p data-figure className="text-xs text-ink-faint">
                {employee.biometricId} . {employee.department || "-"}
              </p>
            </div>
            {employee.isGhost && (
              <span className="ml-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--state-rework-ink)]">
                Ghost
              </span>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] px-3 py-2.5 text-xs text-[var(--state-rework-ink)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This cannot be undone. Use this only to remove outdated ghost IDs
              - all {monthLabel} punch data for{" "}
              <strong data-figure>{employee.biometricId}</strong> will be
              erased.
            </span>
          </div>
          {error && <InlineError compact message={error} />}
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" onClick={onClose} disabled={removing}>
              Cancel
            </Button>
            <RoleGate min="owner">
              <Button
                tone="destructive"
                className="flex-1"
                onClick={handleConfirm}
                disabled={removing}
              >
                {removing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Yes, Remove
                  </>
                )}
              </Button>
            </RoleGate>
          </div>
        </div>
      </div>
    </div>
  );
}

const TINTS = {
  purple: {
    bg: "bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)]",
    icon: "text-[var(--state-extension-ink)]",
  },
  emerald: {
    bg: "bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)]",
    icon: "text-[var(--state-positive-ink)]",
  },
  amber: {
    bg: "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)]",
    icon: "text-[var(--state-rework-ink)]",
  },
  rose: {
    bg: "bg-[color-mix(in_srgb,var(--state-overdue)_26%,transparent)]",
    icon: "text-[var(--state-overdue-ink)]",
  },
  blue: {
    bg: "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)]",
    icon: "text-[var(--state-risk-ink)]",
  },
};
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint = "purple",
  isHero = false,
}) {
  const t = TINTS[tint];
  return (
    <Panel
      className={
        isHero ? "shadow-[inset_0_0_0_1.5px_var(--state-positive)]" : ""
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-sm ${isHero ? "text-[var(--state-positive-ink)]" : "text-ink-faint"}`}
          >
            {label}
          </p>
          <p
            data-figure
            className={`mt-1.5 text-[28px] leading-none tracking-[-0.03em] ${isHero ? "text-[var(--state-positive-ink)]" : "text-ink"}`}
          >
            {value}
          </p>
          {sub && (
            <p
              className={`mt-1.5 text-xs ${isHero ? "text-[var(--state-positive-ink)] opacity-80" : "text-ink-faint"}`}
            >
              {sub}
            </p>
          )}
        </div>
        <div
          className={`h-10 w-10 rounded-inset ${t.bg} flex shrink-0 items-center justify-center`}
        >
          <Icon className={`h-5 w-5 ${t.icon}`} />
        </div>
      </div>
    </Panel>
  );
}
function StatGrid({ data, loading }) {
  if (loading && !data)
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} block className="h-28 rounded-card" />
        ))}
      </div>
    );
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatCard
        icon={CheckCircle2}
        tint="emerald"
        label="Total Attendance"
        value={d.totalAttendance || d.effectivePresent || 0}
        sub={`sum of paid days . ${d.holidayCount || 0} holidays`}
        isHero
      />
      <StatCard
        icon={Users}
        tint="purple"
        label="Total Employees"
        value={d.activeEmployees || 0}
        sub={`${d.workingDays || 0} working days . ${d.syncedDays || 0} synced`}
      />
      <StatCard
        icon={Clock}
        tint="blue"
        label="Effective Present"
        value={d.effectivePresent || 0}
        sub={`${d.P || 0} on-time . ${d["P*"] || 0} late . includes MP`}
      />
      <StatCard
        icon={AlertCircle}
        tint="amber"
        label="HD / Late"
        value={(d.HD || 0) * 0.5}
        sub={`${d.autoPromotedHDs || 0} auto-HD . ${minsToHHMM(d.totalLateMins)} total late`}
      />
      <StatCard
        icon={UserX}
        tint="rose"
        label="Absent"
        value={d.AB || 0}
        sub={`${d.MP || 0} MP . ${d.sundayWorkedCount || 0} Sun worked`}
      />
    </div>
  );
}

// ── Attendance insights (overview centerpiece) ─────────────────────────────────
// Built from the real summary aggregates — no per-day series exists in this
// payload, so this shows where the period's days actually went (composition),
// how each department is holding up, and who needs attention. Honest data, not
// a decorative heatmap.
const COMP_SEGMENTS = [
  {
    key: "P",
    label: "On-time",
    color: "var(--state-positive)",
    get: (d) => d.P || 0,
  },
  {
    key: "P*",
    label: "Late",
    color: "var(--state-rework)",
    get: (d) => d["P*"] || 0,
  },
  {
    key: "HD",
    label: "Half-day",
    color: "var(--state-rework)",
    get: (d) => d.HD || 0,
  },
  {
    key: "MP",
    label: "Missed punch",
    color: "var(--state-blocked)",
    get: (d) => d.MP || 0,
  },
  {
    key: "leaves",
    label: "Leave",
    color: "var(--state-risk)",
    get: (d) => d.leaves || 0,
  },
  {
    key: "AB",
    label: "Absent",
    color: "var(--state-overdue)",
    get: (d) => d.AB || 0,
  },
];

function miniInitials(name = "") {
  return (
    name
      .replace(/[^A-Za-z ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function AttendanceInsights({ data, rows = [], range }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(id);
  }, []);

  const d = data || {};
  const segs = COMP_SEGMENTS.map((s) => ({ ...s, value: s.get(d) }));
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  const workingDays = d.workingDays || 0;
  const emps = d.activeEmployees || rows.length || 0;
  const possible = workingDays * emps || 1;
  const presentRate = Math.min(
    100,
    Math.round(((d.effectivePresent || 0) / possible) * 100),
  );

  const byDept = {};
  for (const e of rows) {
    const k = e.department || "—";
    if (!byDept[k]) byDept[k] = { present: 0, count: 0 };
    byDept[k].present += e.effectivePresent || 0;
    byDept[k].count += 1;
  }
  const deptRows = Object.entries(byDept)
    .map(([name, v]) => ({
      name,
      rate: workingDays
        ? Math.min(100, Math.round((v.present / (v.count * workingDays)) * 100))
        : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 7);

  const attention = [...rows]
    .filter((e) => (e.days?.AB || 0) > 0)
    .sort((a, b) => (b.days?.AB || 0) - (a.days?.AB || 0))
    .slice(0, 5);

  return (
    <section className="ai-wrap">
      <div className="ai-card ai-hero">
        <div className="ai-hero-head">
          <div>
            <h2 className="ai-title">Attendance composition</h2>
            <p className="ai-sub">
              {range?.label} · {emps} employees · {workingDays} working days
            </p>
          </div>
          <div className="ai-rate">
            <span className="ai-rate-num" data-figure>
              {presentRate}
              <i>%</i>
            </span>
            <span className="ai-rate-cap">effective present</span>
          </div>
        </div>
        <div
          className={`ai-bar ${mounted ? "is-in" : ""}`}
          role="img"
          aria-label={`Attendance composition, ${presentRate}% present`}
        >
          {segs.map(
            (s) =>
              s.value > 0 && (
                <span
                  key={s.key}
                  className="ai-bar-seg"
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    background: s.color,
                  }}
                  title={`${s.label}: ${s.value}`}
                />
              ),
          )}
        </div>
        <ul className="ai-legend">
          {segs.map((s) => (
            <li key={s.key} className="ai-legend-item">
              <span className="ai-dot" style={{ background: s.color }} />
              <span className="ai-legend-label">{s.label}</span>
              <b className="ai-legend-val" data-figure>
                {s.value}
              </b>
              <span className="ai-legend-pct" data-figure>
                {Math.round((s.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ai-row">
        <div className="ai-card">
          <h2 className="ai-title">Present rate by department</h2>
          <ul className="ai-depts">
            {deptRows.length ? (
              deptRows.map((dr) => (
                <li key={dr.name} className="ai-dept">
                  <span className="ai-dept-name" title={dr.name}>
                    {dr.name}
                  </span>
                  <span className="ai-dept-track">
                    <span
                      className={`ai-dept-fill ${mounted ? "is-in" : ""}`}
                      style={{ width: `${Math.max(4, dr.rate)}%` }}
                    />
                  </span>
                  <span className="ai-dept-val" data-figure>
                    {dr.rate}%
                  </span>
                </li>
              ))
            ) : (
              <li className="ai-empty">No department data.</li>
            )}
          </ul>
        </div>

        <div className="ai-card">
          <h2 className="ai-title">Needs attention</h2>
          <p className="ai-sub">Most absences this period</p>
          <ul className="ai-att">
            {attention.length ? (
              attention.map((e) => (
                <li key={e.biometricId} className="ai-att-item">
                  <span className="ai-att-av">
                    {miniInitials(e.employeeName)}
                  </span>
                  <div className="ai-att-text">
                    <span className="ai-att-name">
                      {e.employeeName || e.biometricId}
                    </span>
                    <span className="ai-att-meta">{e.department || "—"}</span>
                  </div>
                  <span className="ai-att-badge" data-figure>
                    {e.days?.AB || 0} abs
                  </span>
                </li>
              ))
            ) : (
              <li className="ai-empty">
                No absences this period — full house.
              </li>
            )}
          </ul>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: AI_CSS }} />
    </section>
  );
}

const AI_CSS = `
.ai-wrap { display: flex; flex-direction: column; gap: 16px; }
.ai-card {
  background: var(--surface-raised);
  border: 1px solid var(--hairline); border-radius: var(--radius-card);
  
  padding: 1.25rem 1.4rem 1.35rem;
}
.ai-title { font-size: 14px; font-weight: 650; letter-spacing: -.012em; color: var(--ink); }
.ai-sub { font-size: 12px; color: var(--ink-faint); margin-top: .15rem; }
.ai-hero-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.1rem; }
.ai-rate { text-align: right; flex-shrink: 0; }
.ai-rate-num { font-size: 2.4rem; font-weight: 680; letter-spacing: -.04em; line-height: 1; color: var(--state-positive); font-variant-numeric: tabular-nums; }
.ai-rate-num i { font-size: 1rem; font-style: normal; font-weight: 600; color: var(--ink-faint); margin-left: 2px; }
.ai-rate-cap { display: block; font-size: 11px; color: var(--ink-faint); margin-top: .2rem; }
.ai-bar { display: flex; height: 22px; border-radius: var(--radius-inset); overflow: hidden; background: var(--surface-sunken); clip-path: inset(0 100% 0 0); transition: clip-path .85s cubic-bezier(.2,.8,.2,1); }
.ai-bar.is-in { clip-path: inset(0 0 0 0); }
.ai-bar-seg { height: 100%; min-width: 2px; }
.ai-legend { display: flex; flex-wrap: wrap; gap: .5rem 1.35rem; margin-top: 1rem; }
.ai-legend-item { display: inline-flex; align-items: center; gap: .4rem; font-size: 12px; color: var(--ink-muted); }
.ai-dot { width: 9px; height: 9px; border-radius: var(--radius-inset); flex-shrink: 0; }
.ai-legend-val { font-weight: 650; color: var(--ink); font-variant-numeric: tabular-nums; }
.ai-legend-pct { color: var(--ink-faint); font-size: 11px; }
.ai-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }
@media (max-width: 900px) { .ai-row { grid-template-columns: 1fr; } }
.ai-depts { display: flex; flex-direction: column; gap: .7rem; margin-top: 1rem; }
.ai-dept { display: grid; grid-template-columns: 8rem 1fr 3rem; align-items: center; gap: .75rem; }
.ai-dept-name { font-size: 12px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-dept-track { height: 8px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
.ai-dept-fill { display: block; height: 100%; border-radius: 999px; background: var(--state-positive); transform: scaleX(0); transform-origin: left; transition: transform .85s cubic-bezier(.2,.8,.2,1); }
.ai-dept-fill.is-in { transform: scaleX(1); }
.ai-dept-val { font-size: 12px; font-weight: 620; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
.ai-att { display: flex; flex-direction: column; gap: .55rem; margin-top: 1rem; }
.ai-att-item { display: flex; align-items: center; gap: .7rem; }
.ai-att-av { width: 30px; height: 30px; border-radius: 999px; flex-shrink: 0; display: grid; place-items: center; font-size: 11px; font-weight: 680; background: color-mix(in srgb, var(--state-positive) 22%, transparent); color: var(--state-positive); }
.ai-att-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ai-att-name { font-size: 12.5px; font-weight: 560; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-att-meta { font-size: 11px; color: var(--ink-faint); }
.ai-att-badge { font-size: 11px; font-weight: 620; color: var(--state-overdue-ink); background: color-mix(in srgb, var(--state-overdue) 20%, transparent); padding: .15rem .55rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0; }
.ai-empty { font-size: 12.5px; color: var(--ink-faint); padding: .5rem 0; }
@media (prefers-reduced-motion: reduce) { .ai-bar, .ai-dept-fill { transition: none; clip-path: inset(0); transform: none; } }
`;

// ── Attendance dashboard (overview — mimics the reference layout) ──────────────
// The reference's composition, our theme: KPI cards with a meter + real MoM
// trend, a per-day attendance heatmap, upcoming holidays, the latest day's real
// punches, and a computed insight. Every number is real — the heatmap and
// activity come from the /daily endpoint (the same source the grid views use).
function fmtClock(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
function daysUpToToday(from, to) {
  const out = [];
  const d = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let guard = 0;
  while (d <= end && d <= today && guard < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return out;
}
function previousRange(from, to) {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const len = Math.round((t - f) / 86400000) + 1;
  const pt = new Date(f);
  pt.setDate(pt.getDate() - 1);
  const pf = new Date(pt);
  pf.setDate(pf.getDate() - (len - 1));
  return {
    from: pf.toISOString().slice(0, 10),
    to: pt.toISOString().slice(0, 10),
  };
}
const PRESENT_SET = new Set(["P", "P*", "P~", "HD"]);
function heatLevel(rate) {
  if (rate == null) return -1;
  if (rate <= 0) return 0;
  if (rate < 45) return 1;
  if (rate < 70) return 2;
  if (rate < 88) return 3;
  return 4;
}
const DASH_STATUS = {
  P: { label: "Present", color: "var(--state-positive)" },
  "P*": { label: "Late", color: "var(--state-rework)" },
  "P~": { label: "Early out", color: "var(--state-rework)" },
  HD: { label: "Half-day", color: "var(--state-rework)" },
  AB: { label: "Absent", color: "var(--state-overdue)" },
  MP: { label: "Missed punch", color: "var(--state-blocked)" },
  WO: { label: "Week off", color: "var(--ink-faint)" },
};
function dashStatus(s) {
  return DASH_STATUS[s] || { label: s || "—", color: "var(--ink-faint)" };
}
function DashTrend({ cur, prev, goodWhenUp = true }) {
  if (prev == null || prev === 0 || cur == null)
    return <span className="dash-trend is-flat">— vs prev</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="dash-trend is-flat">0% vs prev</span>;
  const up = pct > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`dash-trend ${good ? "is-good" : "is-bad"}`}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(pct)}% vs prev
    </span>
  );
}

function AttendanceDashboard({ data, loading, range, department }) {
  const d = data || {};
  const [prev, setPrev] = useState(null);
  const [today, setToday] = useState(null);
  const [heat, setHeat] = useState(null); // null=loading | "multi" | array
  const [mounted, setMounted] = useState(false);
  const [tip, setTip] = useState(null); // custom heatmap tooltip {x,y,date,present,total}

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!range?.from || !range?.to) return;
    let off = false;
    const pr = previousRange(range.from, range.to);
    const qs = new URLSearchParams({
      from: pr.from,
      to: pr.to,
      ...(department !== "all" && { department }),
    });
    fetch(`${API}/hr/attendance/summary?${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!off && j && j.success !== false) setPrev(j);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [range?.from, range?.to, department]);

  useEffect(() => {
    if (!range?.to) return;
    let off = false;
    const days = daysUpToToday(range.from, range.to);
    const day = days[days.length - 1] || range.to;
    const dp =
      department !== "all"
        ? `&department=${encodeURIComponent(department)}`
        : "";
    fetch(`${API}/hr/attendance/daily?date=${day}${dp}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!off && j?.success) setToday({ date: day, rows: j.data || [] });
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [range?.from, range?.to, department]);

  // Full-YEAR heatmap in ONE request (the /day-range endpoint reads the synced
  // per-day summaries) — never 365 per-day fetches. Independent of the selected
  // period: it always shows the whole year of range.to, day by day.
  useEffect(() => {
    if (!range?.to) return;
    let off = false;
    setHeat(null);
    const year = range.to.slice(0, 4);
    const today = new Date().toISOString().slice(0, 10);
    const yEnd = `${year}-12-31`;
    const from = `${year}-01-01`;
    const to = yEnd > today ? today : yEnd;
    fetch(`${API}/hr/attendance/day-range?from=${from}&to=${to}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (off) return;
        setHeat(
          j?.success
            ? (j.days || []).map((x) => ({
                date: x.date,
                present: x.present || 0,
                total: x.total || 0,
              }))
            : [],
        );
      })
      .catch(() => {
        if (!off) setHeat([]);
      });
    return () => {
      off = true;
    };
  }, [range?.to]);

  const rows = d.employees || [];
  const emps = d.activeEmployees || rows.length || 0;
  const wd = d.workingDays || 0;
  const possible = emps * wd || 1;
  const leaveTotal = rows.reduce((a, e) => a + (e.days?.leaves || 0), 0);
  const prevLeave = (prev?.employees || []).reduce(
    (a, e) => a + (e.days?.leaves || 0),
    0,
  );
  const presentRate = Math.min(
    100,
    Math.round(((d.effectivePresent || 0) / possible) * 100),
  );

  const kpis = [
    {
      key: "emps",
      icon: Users,
      label: "Total employees",
      value: emps,
      unit: "active",
      meter: d.totalEmployees ? emps / d.totalEmployees : 1,
      tint: "ink",
      cur: emps,
      prev: prev?.activeEmployees,
      good: true,
    },
    {
      key: "present",
      icon: CheckCircle2,
      label: "Effective present",
      value: d.effectivePresent || 0,
      unit: "days",
      meter: presentRate / 100,
      tint: "brand",
      cur: d.effectivePresent || 0,
      prev: prev?.effectivePresent,
      good: true,
    },
    {
      key: "absent",
      icon: UserX,
      label: "Absent",
      value: d.AB || 0,
      unit: "days",
      meter: Math.min(1, (d.AB || 0) / possible),
      tint: "rose",
      cur: d.AB || 0,
      prev: prev?.AB,
      good: false,
    },
    {
      key: "leave",
      icon: CalendarDays,
      label: "On leave",
      value: leaveTotal,
      unit: "days",
      meter: Math.min(1, leaveTotal / possible),
      tint: "indigo",
      cur: leaveTotal,
      prev: prevLeave,
      good: true,
    },
  ];

  // heatmap → GitHub-style weeks (columns) × weekday (Mon..Sun rows), full year
  const heatCells = Array.isArray(heat) ? heat : [];
  const rateOf = (c) =>
    c && c.total ? Math.round((c.present / c.total) * 100) : null;
  const weeks = [];
  if (heatCells.length) {
    let col = new Array(7).fill(null);
    let started = false;
    heatCells.forEach((c) => {
      const wdi = (new Date(c.date + "T00:00:00").getDay() + 6) % 7; // Mon=0
      if (wdi === 0 && started) {
        weeks.push(col);
        col = new Array(7).fill(null);
      }
      col[wdi] = c;
      started = true;
    });
    weeks.push(col);
  }
  const rated = heatCells.map(rateOf).filter((r) => r != null);
  const heatAvg = rated.length
    ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length)
    : presentRate;

  // present rate by department — fills the Insight card so it isn't a near-empty box
  const byDept = {};
  rows.forEach((e) => {
    const k = e.department || "—";
    if (!byDept[k]) byDept[k] = { p: 0, c: 0 };
    byDept[k].p += e.effectivePresent || 0;
    byDept[k].c += 1;
  });
  const deptRates = Object.entries(byDept)
    .map(([name, v]) => ({
      name,
      rate: wd ? Math.min(100, Math.round((v.p / (v.c * wd)) * 100)) : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  // upcoming holidays
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = (d.holidays || [])
    .filter((h) => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const pastHolidays = (d.holidays || [])
    .filter((h) => h.date < todayStr)
    .slice(-3)
    .reverse();

  // recent activity — latest day's punches, present first
  const activity = today?.rows
    ? [...today.rows]
        .filter(
          (r) =>
            r.inTime || PRESENT_SET.has(r.effectiveStatus || r.displayStatus),
        )
        .sort((a, b) => (a.inTime || "").localeCompare(b.inTime || ""))
        .slice(0, 7)
    : [];

  // computed insight
  const deptAbs = {};
  rows.forEach((e) => {
    const k = e.department || "—";
    deptAbs[k] = (deptAbs[k] || 0) + (e.days?.AB || 0);
  });
  const topAbsent = Object.entries(deptAbs).sort((a, b) => b[1] - a[1])[0];
  const presentDelta = prev?.effectivePresent
    ? Math.round(
        (((d.effectivePresent || 0) - prev.effectivePresent) /
          prev.effectivePresent) *
          100,
      )
    : null;
  const insight =
    `Effective present sits at ${presentRate}% across ${emps} employees` +
    (presentDelta != null
      ? `, ${presentDelta >= 0 ? "up" : "down"} ${Math.abs(presentDelta)}% versus the previous period.`
      : ".") +
    (topAbsent && topAbsent[1] > 0
      ? ` Absences cluster in ${topAbsent[0]} (${topAbsent[1]} day${topAbsent[1] === 1 ? "" : "s"}) — worth a closer look.`
      : " No department is running hot on absence.");

  if (loading && !data) {
    return (
      <div className="dash">
        <div className="dash-kpis">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="dash-skel" style={{ height: 118 }} />
          ))}
        </div>
        <div className="dash-mid">
          <div className="dash-skel" style={{ height: 300 }} />
          <div className="dash-skel" style={{ height: 300 }} />
        </div>
        <style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
      </div>
    );
  }

  return (
    <div className="dash">
      {/* KPI cards */}
      <div className="dash-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="dash-card dash-kpi">
            <div className="dash-kpi-top">
              <span className="dash-kpi-label">
                <k.icon size={14} className="dash-kpi-ico" /> {k.label}
              </span>
              <span className={`dash-meter is-${k.tint}`}>
                <span
                  className="dash-meter-fill"
                  style={{
                    transform: mounted
                      ? `scaleY(${Math.max(0.06, Math.min(1, k.meter))})`
                      : "scaleY(0)",
                  }}
                />
              </span>
            </div>
            <div className="dash-kpi-val" data-figure>
              {k.value}
              <i>{k.unit}</i>
            </div>
            <DashTrend cur={k.cur} prev={k.prev} goodWhenUp={k.good} />
          </div>
        ))}
      </div>

      {/* Heatmap (hugs its content) beside the side column (upcoming + insight) */}
      <div className="dash-top2">
        <div className="dash-left">
          <div className="dash-card dash-heatfull">
            <div className="dash-heat-head">
              <div>
                <h2 className="dash-h2">Attendance overview</h2>
                <p className="dash-muted">
                  {range?.to?.slice(0, 4)} · present per day
                </p>
              </div>
              <div className="dash-heat-avg">
                <span className="dash-heat-avg-num" data-figure>
                  {heatAvg}
                  <i>%</i>
                </span>
                <span className="dash-muted">avg / day</span>
              </div>
            </div>

            {heat === null ? (
              <div className="dash-heat-note">
                <Loader2 size={16} className="dash-spin" /> Loading the year…
              </div>
            ) : !weeks.length ? (
              <div className="dash-heat-note">
                No attendance has been synced for this year yet.
              </div>
            ) : (
              <>
                <div className="dash-heat-scroll">
                  <div className="dash-heat-grid">
                    <div className="dash-heat-daylabels">
                      {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((x, i) => (
                        <span key={i}>{x}</span>
                      ))}
                    </div>
                    <div className="dash-heat-weeks">
                      {weeks.map((w, i) => (
                        <div key={i} className="dash-heat-col">
                          {w.map((c, j) => {
                            const rate = rateOf(c);
                            return (
                              <span
                                key={j}
                                className="dash-heat-cell"
                                data-lvl={c ? heatLevel(rate) : -1}
                                onMouseEnter={
                                  c
                                    ? (e) =>
                                        setTip({
                                          x: e.clientX,
                                          y: e.clientY,
                                          date: c.date,
                                          present: c.present,
                                          total: c.total,
                                        })
                                    : undefined
                                }
                                onMouseMove={
                                  c
                                    ? (e) =>
                                        setTip((t) =>
                                          t
                                            ? {
                                                ...t,
                                                x: e.clientX,
                                                y: e.clientY,
                                              }
                                            : t,
                                        )
                                    : undefined
                                }
                                onMouseLeave={() => setTip(null)}
                                style={{
                                  transitionDelay: mounted
                                    ? `${i * 5}ms`
                                    : "0ms",
                                  opacity: mounted ? 1 : 0,
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="dash-heat-legend">
                  <span className="dash-muted">Less</span>
                  {[0, 1, 2, 3, 4].map((l) => (
                    <span
                      key={l}
                      className="dash-heat-cell dash-heat-key"
                      data-lvl={l}
                    />
                  ))}
                  <span className="dash-muted">More</span>
                </div>
              </>
            )}
          </div>

          <div className="dash-card">
            <div className="dash-heat-head">
              <h2 className="dash-h2">Upcoming & holidays</h2>
              <Calendar size={15} className="dash-kpi-ico" />
            </div>
            <ul className="dash-up">
              {upcoming.length ? (
                upcoming.map((h) => (
                  <li key={h.date} className="dash-up-item">
                    <span className="dash-up-date" data-figure>
                      <b>{new Date(h.date + "T00:00:00").getDate()}</b>
                      {new Date(h.date + "T00:00:00").toLocaleString([], {
                        month: "short",
                      })}
                    </span>
                    <span className="dash-up-text">
                      <span className="dash-up-name">{h.name}</span>
                      <span className="dash-muted">
                        {h.type || "holiday"} · {h.statusCode || "FH"}
                      </span>
                    </span>
                  </li>
                ))
              ) : (
                <li className="dash-muted" style={{ padding: ".4rem 0" }}>
                  No upcoming holidays in this period.
                </li>
              )}
              {(d.unsyncedWorkingDays || 0) > 0 && (
                <li className="dash-up-item is-alert">
                  <span className="dash-up-date is-alert" data-figure>
                    <b>{d.unsyncedWorkingDays}</b>days
                  </span>
                  <span className="dash-up-text">
                    <span className="dash-up-name">Unsynced working days</span>
                    <span className="dash-muted">
                      Re-sync to complete the period
                    </span>
                  </span>
                </li>
              )}
              {pastHolidays.map((h) => (
                <li key={h.date} className="dash-up-item is-past">
                  <span className="dash-up-date" data-figure>
                    <b>{new Date(h.date + "T00:00:00").getDate()}</b>
                    {new Date(h.date + "T00:00:00").toLocaleString([], {
                      month: "short",
                    })}
                  </span>
                  <span className="dash-up-text">
                    <span className="dash-up-name">{h.name}</span>
                    <span className="dash-muted">passed</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="dash-card dash-insight">
          <div className="dash-heat-head">
            <h2 className="dash-h2">
              <Sparkles size={14} className="dash-kpi-ico" /> Insight
            </h2>
          </div>
          <p className="dash-insight-text">{insight}</p>
          {deptRates.length > 0 && (
            <div className="dash-deptrates">
              <p
                className="dash-muted"
                style={{ marginTop: ".9rem", marginBottom: ".55rem" }}
              >
                Present rate by department
              </p>
              {deptRates.map((dr) => (
                <div key={dr.name} className="dash-dept">
                  <span className="dash-dept-name" title={dr.name}>
                    {dr.name}
                  </span>
                  <span className="dash-dept-track">
                    <span
                      className="dash-dept-fill"
                      style={{ width: `${Math.max(4, dr.rate)}%` }}
                    />
                  </span>
                  <span className="dash-dept-val" data-figure>
                    {dr.rate}%
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="dash-insight-foot" data-figure>
            <span>
              <b>{d.P || 0}</b> on-time
            </span>
            <span>
              <b>{d["P*"] || 0}</b> late
            </span>
            <span>
              <b>{minsToHHMM(d.totalLateMins)}</b> late total
            </span>
          </div>
        </div>
      </div>

      {/* Recent attendance activity — full width */}
      <div className="dash-card dash-actcard">
        <div className="dash-heat-head">
          <div>
            <h2 className="dash-h2">Recent attendance activity</h2>
            <p className="dash-muted">
              {today?.date
                ? new Date(today.date + "T00:00:00").toLocaleDateString([], {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })
                : "latest day"}
            </p>
          </div>
        </div>
        {activity.length ? (
          <div className="dash-act-wrap">
            <table className="dash-act">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Status</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((r) => {
                  const st = dashStatus(r.effectiveStatus || r.displayStatus);
                  return (
                    <tr key={r.biometricId}>
                      <td>
                        <span className="dash-person">
                          <span className="dash-av">
                            {miniInitials(r.employeeName)}
                          </span>
                          <span className="dash-person-text">
                            <span className="dash-person-name">
                              {r.employeeName || r.biometricId}
                            </span>
                            <span className="dash-muted">
                              {r.department || "—"}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="dash-nowrap" data-figure>
                        {fmtClock(r.inTime)}
                      </td>
                      <td className="dash-nowrap" data-figure>
                        {fmtClock(r.finalOut)}
                      </td>
                      <td>
                        <span
                          className="dash-status"
                          style={{
                            color: st.color,
                            background: `color-mix(in srgb, ${st.color} 15%, transparent)`,
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td>
                        <span className="dash-type">
                          {r.employeeType === "executive" ? "Exec" : "Operator"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dash-heat-note">
            {today ? (
              "No punches recorded for this day yet."
            ) : (
              <>
                <Loader2 size={16} className="dash-spin" /> Loading activity…
              </>
            )}
          </div>
        )}
      </div>

      {tip && (
        <div className="dash-tip" style={{ left: tip.x, top: tip.y }}>
          <span className="dash-tip-count" data-figure>
            {tip.present}
            <i> present</i>
          </span>
          <span className="dash-tip-date" data-figure>
            {new Date(tip.date + "T00:00:00").toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
            {tip.total ? ` · of ${tip.total}` : ""}
          </span>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
    </div>
  );
}

const DASH_CSS = `
.dash { display: flex; flex-direction: column; gap: 16px; }
.dash-card {
  background: var(--surface-raised);
  border: 1px solid var(--hairline); border-radius: var(--radius-card);
  
  padding: 1.15rem 1.3rem 1.25rem;
}
.dash-skel { background: var(--surface-sunken); border: 1px solid var(--hairline); border-radius: var(--radius-card); animation: dash-pulse 1.4s ease-in-out infinite; }
@keyframes dash-pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
.dash-muted { font-size: 11.5px; color: var(--ink-faint); }
.dash-h2 { font-size: 13.5px; font-weight: 640; letter-spacing: -.012em; color: var(--ink); display: inline-flex; align-items: center; gap: .4rem; }

/* KPIs */
.dash-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.dash-kpi { display: flex; flex-direction: column; gap: .55rem; }
.dash-kpi-top { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
.dash-kpi-label { display: inline-flex; align-items: center; gap: .35rem; font-size: 12px; font-weight: 540; color: var(--ink-faint); }
.dash-kpi-ico { color: var(--ink-faint); flex-shrink: 0; }
.dash-meter { width: 8px; height: 40px; border-radius: var(--radius-inset); background: var(--surface-sunken); display: flex; align-items: flex-end; overflow: hidden; flex-shrink: 0; }
.dash-meter-fill { width: 100%; height: 100%; border-radius: var(--radius-inset); transform: scaleY(0); transform-origin: bottom; transition: transform .8s cubic-bezier(.2,.8,.2,1); }
.dash-meter.is-brand .dash-meter-fill { background: var(--state-positive); }
.dash-meter.is-rose .dash-meter-fill { background: var(--state-overdue); }
.dash-meter.is-indigo .dash-meter-fill { background: var(--state-risk); }
.dash-meter.is-ink .dash-meter-fill { background: var(--ink-faint); }
.dash-kpi-val { font-size: 2rem; font-weight: 680; letter-spacing: -.04em; line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums; }
.dash-kpi-val i { font-size: .8rem; font-style: normal; font-weight: 560; color: var(--ink-faint); margin-left: .3rem; }
.dash-trend { display: inline-flex; align-items: center; gap: .2rem; font-size: 11px; font-weight: 600; padding: .12rem .45rem; border-radius: 999px; width: fit-content; }
.dash-trend.is-good { color: var(--state-positive); background: color-mix(in srgb, var(--state-positive) 22%, transparent); }
.dash-trend.is-bad { color: var(--state-overdue-ink); background: color-mix(in srgb, var(--state-overdue) 20%, transparent); }
.dash-trend.is-flat { color: var(--ink-faint); background: var(--surface-sunken); }

/* mid + bottom grids */
.dash-mid { display: grid; grid-template-columns: 1.9fr 1fr; gap: 16px; align-items: stretch; }
.dash-bot { display: grid; grid-template-columns: 1.9fr 1fr; gap: 16px; align-items: stretch; }
@media (max-width: 1000px) { .dash-mid, .dash-bot { grid-template-columns: 1fr; } }

/* heatmap */
.dash-heat-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.dash-heat-avg { text-align: right; }
.dash-heat-avg-num { display: block; font-size: 1.6rem; font-weight: 680; letter-spacing: -.04em; line-height: 1; color: var(--state-positive); font-variant-numeric: tabular-nums; }
.dash-heat-avg-num i { font-size: .8rem; font-style: normal; color: var(--ink-faint); }
/* Heatmap hugs its content (max-content), the side column fills the rest so the
   row has no dead space; both stack below 1000px. */
.dash-top2 { display: grid; grid-template-columns: minmax(0, max-content) minmax(260px, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1000px) { .dash-top2 { grid-template-columns: 1fr; } }
/* Left column: heatmap (top) with Upcoming stacked below it, so it fills the
   column height next to the taller Insight card. As the year fills the heatmap
   widens (max-content grows) and the Insight column (1fr) shrinks. */
.dash-left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.dash-heatfull { min-width: 0; }
.dash-heat-scroll { overflow-x: auto; padding-bottom: 6px; }

/* Designed hover tooltip (replaces the native title). Inverted ink surface so it
   reads in both themes; follows the cursor, floats above it. */
.dash-tip { position: fixed; z-index: 80; pointer-events: none; transform: translate(-50%, calc(-100% - 12px));
  background: var(--ink); color: var(--body-bg); border-radius: var(--radius-inset); padding: .45rem .65rem;
  box-shadow: 0 10px 24px -8px rgb(0 0 0 / .45); display: flex; flex-direction: column; gap: 1px; white-space: nowrap; }
.dash-tip::after { content: ""; position: absolute; left: 50%; top: 100%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: var(--ink); }
.dash-tip-count { font-size: 13.5px; font-weight: 700; letter-spacing: -.01em; }
.dash-tip-count i { font-size: 10.5px; font-weight: 500; font-style: normal; opacity: .7; margin-left: 1px; }
.dash-tip-date { font-size: 10.5px; opacity: .72; }
.dash-heat-grid { display: flex; gap: .5rem; width: max-content; }
.dash-heat-daylabels { display: flex; flex-direction: column; gap: 4px; padding-top: 0; }
.dash-heat-daylabels { display: flex; flex-direction: column; gap: 3px; }
.dash-heat-daylabels span { font-size: 9px; color: var(--ink-faint); height: 13px; line-height: 13px; }
.dash-heat-weeks { display: flex; gap: 3px; flex-wrap: nowrap; }
.dash-heat-col { display: flex; flex-direction: column; gap: 3px; flex: none; }
.dash-heat-cell { width: 13px; height: 13px; border-radius: var(--radius-inset); background: var(--surface-sunken); transition: opacity .45s ease; }
.dash-heat-cell[data-lvl="-1"] { background: var(--surface-sunken); opacity: .45; }
.dash-heat-cell[data-lvl="0"] { background: color-mix(in srgb, var(--state-positive) 10%, var(--surface-sunken)); }
.dash-heat-cell[data-lvl="1"] { background: color-mix(in srgb, var(--state-positive) 30%, transparent); }
.dash-heat-cell[data-lvl="2"] { background: color-mix(in srgb, var(--state-positive) 52%, transparent); }
.dash-heat-cell[data-lvl="3"] { background: color-mix(in srgb, var(--state-positive) 74%, transparent); }
.dash-heat-cell[data-lvl="4"] { background: var(--state-positive); }
.dash-heat-legend { display: flex; align-items: center; gap: 5px; margin-top: 1rem; }
.dash-heat-key { width: 13px; height: 13px; flex: none; opacity: 1 !important; }
.dash-side { display: flex; flex-direction: column; gap: 16px; }
.dash-deptrates { display: flex; flex-direction: column; gap: .5rem; }
.dash-dept { display: grid; grid-template-columns: 6.5rem 1fr 2.4rem; align-items: center; gap: .6rem; }
.dash-dept-name { font-size: 11.5px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-dept-track { height: 7px; background: var(--surface-sunken); border-radius: 999px; overflow: hidden; }
.dash-dept-fill { display: block; height: 100%; border-radius: 999px; background: var(--state-positive); }
.dash-dept-val { font-size: 11.5px; font-weight: 620; text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
.dash-heat-note { display: flex; align-items: center; gap: .5rem; padding: 2rem 0; font-size: 12.5px; color: var(--ink-faint); }
.dash-spin { animation: dash-spin .9s linear infinite; color: var(--state-positive); }
@keyframes dash-spin { to { transform: rotate(360deg); } }

/* upcoming */
.dash-up { display: flex; flex-direction: column; gap: .5rem; }
.dash-up-item { display: flex; align-items: center; gap: .7rem; padding: .5rem .6rem; border-radius: var(--radius-inset); background: var(--surface-sunken); }
.dash-up-item.is-alert { background: color-mix(in srgb, var(--state-rework) 18%, transparent); }
.dash-up-item.is-past { opacity: .6; }
.dash-up-date { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 40px; flex-shrink: 0; font-size: 10px; color: var(--ink-faint); line-height: 1.1; }
.dash-up-date b { font-size: 16px; font-weight: 680; color: var(--ink); }
.dash-up-date.is-alert b { color: var(--state-rework-ink); }
.dash-up-text { display: flex; flex-direction: column; min-width: 0; }
.dash-up-name { font-size: 12.5px; font-weight: 560; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* activity */
.dash-act-wrap { overflow-x: auto; margin: 0 -.4rem; }
.dash-act { width: 100%; border-collapse: collapse; }
.dash-act th { text-align: left; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-faint); padding: .5rem .6rem; border-bottom: 1px solid var(--hairline); }
.dash-act td { font-size: 12.5px; padding: .55rem .6rem; border-bottom: 1px solid var(--hairline); color: var(--ink); vertical-align: middle; }
.dash-act tr:last-child td { border-bottom: 0; }
.dash-nowrap { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ink-muted); }
.dash-person { display: inline-flex; align-items: center; gap: .55rem; min-width: 0; }
.dash-av { width: 28px; height: 28px; border-radius: 999px; flex-shrink: 0; display: grid; place-items: center; font-size: 10.5px; font-weight: 680; background: color-mix(in srgb, var(--state-positive) 22%, transparent); color: var(--state-positive); }
.dash-person-text { display: flex; flex-direction: column; min-width: 0; }
.dash-person-name { font-size: 12.5px; font-weight: 560; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 16ch; }
.dash-status { font-size: 11px; font-weight: 620; padding: .12rem .5rem; border-radius: 999px; white-space: nowrap; }
.dash-type { font-size: 11px; color: var(--ink-faint); }

/* insight */
.dash-insight { display: flex; flex-direction: column; }
.dash-insight-text { font-size: 13px; line-height: 1.6; color: var(--ink-muted); flex: 1; }
.dash-insight-foot { display: flex; gap: 1.1rem; flex-wrap: wrap; margin-top: 1rem; padding-top: .85rem; border-top: 1px solid var(--hairline); font-size: 11.5px; color: var(--ink-faint); }
.dash-insight-foot b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) { .dash-kpis { grid-template-columns: 1fr 1fr; } }
@media (prefers-reduced-motion: reduce) { .dash-meter-fill { transition: none; } .dash-heat-cell { transition: none; opacity: 1 !important; } }
`;

// MAIN PAGE
export default function AttendanceOverviewPage() {
  const [period, setPeriod] = useState("this-month");
  const [customFrom, setCustomFrom] = useState(
    ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [customTo, setCustomTo] = useState(ymd(new Date()));
  const [department, setDept] = useState("all");
  const [departments, setDepts] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ col: "name", dir: "asc" }); // replaces old sortBy dropdown
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState(null);
  const [drawerEmp, setDrawerEmp] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;
  const [viewMode, setViewMode] = useState("table");
  const [dayGrid, setDayGrid] = useState({});
  const [dayHolidayMap, setDayHolidayMap] = useState({});
  const [dayEmployees, setDayEmployees] = useState([]);
  const [dayDates, setDayDates] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayProgress, setDayProgress] = useState(0);
  const [editCell, setEditCell] = useState(null);
  const [dl, setDl] = useState({});

  const range = useMemo(() => {
    if (period === "custom")
      return {
        from: customFrom,
        to: customTo,
        label: `${customFrom} → ${customTo}`,
      };
    return getPeriodRange(period);
  }, [period, customFrom, customTo]);

  const gridMonth = range.from.slice(0, 7);
  const canUseGridViews = isSingleMonth(range.from, range.to);

  useEffect(() => {
    fetch(`${API}/hr/attendance/departments`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDepts(d.data || []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      from: range.from,
      to: range.to,
      ...(department !== "all" && { department }),
    });
    try {
      const r = await fetch(`${API}/hr/attendance/summary?${qs}`, {
        credentials: "include",
      });
      const d = await r.json();
      if (d.success) {
        setData(d);
        setDl(d.displayLabels || {});
      } else setBanner({ type: "error", msg: d.message || "Failed to load" });
    } catch (e) {
      setBanner({ type: "network", msg: `Can't reach backend. ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, department]);
  useEffect(() => {
    load();
    setPage(1);
  }, [load]);

  // Original loadDayData — fetches each day from /daily
  const loadDayData = useCallback(async () => {
    if (!canUseGridViews) return;
    setDayLoading(true);
    setDayProgress(0);
    setDayGrid({});
    setDayEmployees([]);
    setDayHolidayMap({});
    const [y, m] = gridMonth.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const todayStr = new Date().toISOString().split("T")[0];
    const allDates = [];
    for (let d = 1; d <= dim; d++) {
      const ds = `${gridMonth}-${String(d).padStart(2, "0")}`;
      if (ds <= todayStr) allDates.push(ds);
    }
    setDayDates(allDates);
    const deptP =
      department !== "all"
        ? `&department=${encodeURIComponent(department)}`
        : "";
    let done = 0;
    const results = await Promise.all(
      allDates.map(async (ds) => {
        try {
          const data = await apiFetch(
            `/hr/attendance/daily?date=${ds}${deptP}`,
          );
          done++;
          setDayProgress(Math.round((done / allDates.length) * 100));
          return { ds, data };
        } catch {
          done++;
          setDayProgress(Math.round((done / allDates.length) * 100));
          return { ds, data: null };
        }
      }),
    );
    const ng = {},
      hm = {},
      em = {};
    let labels = {};
    for (const { ds, data } of results) {
      if (!data) continue;
      labels = data.displayLabels || labels;
      if (data.holiday) hm[ds] = data.holiday;
      ng[ds] = {};
      for (const r of data.data || []) {
        ng[ds][r.biometricId] = r;
        if (!em[r.biometricId])
          em[r.biometricId] = {
            biometricId: r.biometricId,
            employeeName: r.employeeName || r.biometricId,
            department: r.department || "-",
            designation: r.designation || "-",
            employeeType: r.employeeType || "operator",
            identityId: r.identityId || "",
            dojStr: r.dojStr || null,
          };
      }
    }
    const se = Object.values(em).sort((a, b) =>
      (a.employeeName || "").localeCompare(b.employeeName || ""),
    );
    setDayGrid(ng);
    setDayHolidayMap(hm);
    setDayEmployees(se);
    setDl(labels);
    setDayLoading(false);
  }, [gridMonth, department, canUseGridViews]);

  useEffect(() => {
    if (viewMode !== "table" && canUseGridViews) loadDayData();
  }, [viewMode, loadDayData, canUseGridViews]);

  const refreshDay = useCallback(
    async (biometricId, dateStr) => {
      try {
        const deptP =
          department !== "all"
            ? `&department=${encodeURIComponent(department)}`
            : "";
        const data = await apiFetch(
          `/hr/attendance/daily?date=${dateStr}${deptP}`,
        );
        setDayGrid((prev) => {
          const ng = { ...prev, [dateStr]: {} };
          for (const r of data.data || []) ng[dateStr][r.biometricId] = r;
          return ng;
        });
        if (editCell?.dateStr === dateStr) {
          const fresh = (data.data || []).find(
            (r) => r.biometricId === biometricId,
          );
          if (fresh) setEditCell({ record: fresh, dateStr });
        }
      } catch (e) {
        console.error("[refreshDay]", e.message);
      }
    },
    [department, editCell],
  );

  const handleOverride = useCallback(
    async (payload, dateStr) => {
      await apiFetch("/hr/attendance/day-override", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await refreshDay(payload.biometricId, dateStr);
      await load();
    },
    [refreshDay, load],
  );

  const handleSync = async (onlyMissing) => {
    setSyncing(true);
    setBanner(null);
    try {
      const r = await fetch(`${API}/hr/attendance/sync-period`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: range.from, to: range.to, onlyMissing }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setBanner({
          type: "error",
          msg: `Sync failed: ${d.message || "unknown"}`,
        });
        return;
      }
      setBanner({
        type: "success",
        msg: `${d.message}${d.daysFailed ? ` . ${d.daysFailed} failed` : ""}${d.totalGhosts ? ` . ${d.totalGhosts} ghosts` : ""}`,
      });
      await load();
    } catch (e) {
      setBanner({ type: "network", msg: "Sync error: " + e.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = () => {
    // Export now works for any period (single month, last month, quarter,
    // year, custom). We always send `from` + `to` — the backend accepts
    // arbitrary date ranges and falls back to yearMonth only if those
    // aren't provided.
    const qs = new URLSearchParams({
      from: range.from,
      to: range.to,
      ...(department !== "all" && { department }),
    });
    window.open(`${API}/hr/attendance/export-muster-roll?${qs}`, "_blank");
  };

  const handleSort = useCallback((col, dir) => {
    setSort({ col, dir });
    setPage(1);
  }, []);

  const filteredSorted = useMemo(() => {
    if (!data?.employees) return [];
    let list = data.employees;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.employeeName || "").toLowerCase().includes(q) ||
          (e.biometricId || "").toLowerCase().includes(q) ||
          (e.department || "").toLowerCase().includes(q),
      );
    }
    if (!sort.col || !sort.dir) return [...list];
    const getVal = (e) => {
      const days = e.days || {};
      const hol =
        (days.FH || 0) +
        (days.NH || 0) +
        (days.OH || 0) +
        (days.RH || 0) +
        (days.PH || 0);
      switch (sort.col) {
        case "name":
          return (e.employeeName || "").toLowerCase();
        case "department":
          return (e.department || "").toLowerCase();
        case "totalAtt":
          return e.totalAttendance || 0;
        case "present":
          return e.effectivePresent || 0;
        case "late":
          return days["P*"] || 0;
        case "hd":
          return days.HD || 0;
        case "mp":
          return days.MP || 0;
        case "abs":
          return days.AB || 0;
        case "lv":
          return days.leaves || 0;
        case "hol":
          return hol;
        case "lateTotal":
          return e.totalLateMins || 0;
        case "otTotal":
          return e.totalOtMins || 0;
        default:
          return 0;
      }
    };
    const isText = new Set(["name", "department"]).has(sort.col);
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = getVal(a),
        vb = getVal(b);
      return isText ? mult * va.localeCompare(vb) : mult * (va - vb);
    });
  }, [data, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PER_PAGE));
  const paged = filteredSorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const unsyncedCount = data?.unsyncedWorkingDays || 0;
  const hasAnyData = data && data.syncedDays > 0;
  // Regularizations live on their own page and, until the sidebar carries an
  // entry for them, this button is the only way in. The count is the reason to
  // click: an unreviewed correction is an attendance record that is still wrong.
  const [regPending, setRegPending] = useState(0);
  useEffect(() => {
    fetch(`${API}/hr/attendance/regularizations?status=pending&limit=1`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setRegPending(d?.stats?.pending || 0))
      .catch(() => {});
  }, []);
  const holidayCount = data?.holidayCount || 0;
  const VIEWS = [
    { id: "table", icon: List, label: "Summary" },
    { id: "list", icon: List, label: "Timeline" },
  ];

  return (
    <Hr_DashboardLayout activeMenu="attendance">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Human resources"
          title="Attendance Overview"
          sub={
            <span data-figure>
              {range.label} . {range.from} to {range.to}
            </span>
          }
          actions={
            <>
              <div className="rail inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-[var(--surface-sunken)] p-[3px]">
                {VIEWS.map((v) => {
                  const btn = (
                    <button
                      key={v.id}
                      onClick={() => setViewMode(v.id)}
                      disabled={v.id !== "table" && !canUseGridViews}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tracking-[-0.012em] transition-[color,background-color] duration-[180ms] ease-[var(--ease-deck)] ${viewMode === v.id ? "bg-ink text-[var(--body-bg)]" : "text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"}`}
                    >
                      <v.icon className="h-3.5 w-3.5" />
                      {v.label}
                    </button>
                  );
                  // Viewers get Summary only — non-Summary (Timeline) view is editor+.
                  return v.id === "table" ? (
                    btn
                  ) : (
                    <RoleGate key={v.id} min="editor">
                      {btn}
                    </RoleGate>
                  );
                })}
              </div>
              {/* Syncing writes attendance data — an editor+ action, hidden from viewers. */}
              <RoleGate min="editor">
                {unsyncedCount > 0 && (
                  <Button
                    size="sm"
                    onClick={() => handleSync(true)}
                    disabled={syncing}
                  >
                    <Zap
                      className={`h-4 w-4 ${syncing ? "animate-pulse" : ""}`}
                    />
                    Sync <span data-figure>{unsyncedCount}</span> missing{" "}
                    {unsyncedCount === 1 ? "day" : "days"}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => handleSync(false)}
                  disabled={syncing}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                  />
                  {syncing ? "Syncing..." : "Re-sync Period"}
                </Button>
              </RoleGate>
              <Link
                href="/hr/dashboard/attendance/regularizations"
                className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium tracking-[-0.012em] transition-[background-color,color] duration-[180ms] ease-[var(--ease-deck)] ${
                  regPending > 0
                    ? "bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] text-[var(--state-rework-ink)] hover:bg-[color-mix(in_srgb,var(--state-rework)_36%,transparent)]"
                    : "bg-[var(--control)] text-ink hover:bg-[var(--control-hover)]"
                }`}
                title="Attendance correction requests raised in the mobile app"
              >
                <ClipboardList className="h-4 w-4" />
                Regularizations
                {regPending > 0 && (
                  <span
                    data-figure
                    className="rounded-full bg-[var(--state-rework)] px-1.5 text-[10px] leading-[18px] text-[var(--body-bg)]"
                  >
                    {regPending}
                  </span>
                )}
              </Link>
              <Button
                tone="primary"
                size="sm"
                onClick={handleExport}
                disabled={!hasAnyData}
                title={
                  hasAnyData
                    ? `Export ${range.from} to ${range.to} as Excel`
                    : "No data to export yet"
                }
              >
                <Download className="h-4 w-4" /> Export
              </Button>
            </>
          }
        />

        <div className="space-y-6">
          {banner && (
            <div
              className={`flex items-start justify-between gap-3 rounded-inset px-4 py-3 text-sm ${banner.type === "success" ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]" : banner.type === "network" ? "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]" : "bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] text-[var(--state-rework-ink)]"}`}
            >
              <div className="flex items-start gap-2">
                {banner.type === "success" ? (
                  <Wifi className="mt-0.5 h-4 w-4" />
                ) : banner.type === "network" ? (
                  <WifiOff className="mt-0.5 h-4 w-4" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                )}
                <p>{banner.msg}</p>
              </div>
              <button
                onClick={() => setBanner(null)}
                aria-label="Dismiss"
                className="opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {holidayCount > 0 && data?.holidays?.length > 0 && (
            <Panel label="Holidays in this period">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)]">
                  <Sparkles className="h-5 w-5 text-[var(--state-risk-ink)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    <span data-figure>{holidayCount}</span> Holiday
                    {holidayCount === 1 ? "" : "s"} in this period
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.holidays.slice(0, 6).map((h) => {
                      const typeMap = {
                        national: { label: "NH", tone: "pink" },
                        company: { label: "FH", tone: "indigo" },
                        optional: { label: "OH", tone: "teal" },
                        restricted: { label: "RH", tone: "amber" },
                      };
                      const meta = typeMap[h.type] || {
                        label: "PH",
                        tone: "blue",
                      };
                      return (
                        <span
                          key={h.date}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${TONE_CLASSES[meta.tone]}`}
                        >
                          <span data-figure className="text-[10px] opacity-70">
                            {h.date}
                          </span>
                          <span className="font-medium">{meta.label}</span>
                          <span>{h.name}</span>
                        </span>
                      );
                    })}
                    {data.holidays.length > 6 && (
                      <span className="self-center text-[11px] text-ink-faint italic">
                        + <span data-figure>{data.holidays.length - 6}</span>{" "}
                        more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <Panel className="space-y-3" label="Period">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarDays className="h-4 w-4 text-ink-faint" />
              <span className="mr-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                Period
              </span>
              {[
                { id: "this-month", label: "This Month" },
                { id: "last-month", label: "Last Month" },
                { id: "this-quarter", label: "This Quarter" },
                { id: "last-quarter", label: "Last Quarter" },
                { id: "this-year", label: "This Year" },
                { id: "last-year", label: "Last Year" },
                { id: "custom", label: "Custom" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPeriod(p.id);
                    setViewMode("table");
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${period === p.id ? "bg-ink text-[var(--body-bg)]" : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)] hover:text-ink"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="From date"
                  data-figure
                  className="w-auto"
                />
                <span className="text-sm text-ink-faint">to</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="To date"
                  data-figure
                  className="w-auto"
                />
              </div>
            )}
            {!canUseGridViews && viewMode === "list" && (
              <p className="rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] px-3 py-1.5 text-[11px] text-[var(--state-rework-ink)]">
                Timeline view is only available for single-month periods.
              </p>
            )}
          </Panel>

          {!loading && !hasAnyData ? (
            <Panel label="No attendance data yet">
              <EmptyState
                title="No attendance data yet"
                body={`This period has ${data?.workingDays || 0} working days with no synced records yet.`}
                action={
                  <RoleGate min="editor">
                    <Button
                      tone="primary"
                      onClick={() => handleSync(false)}
                      disabled={syncing}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                      />
                      {syncing
                        ? `Syncing...`
                        : `Sync ${data?.workingDays || 0} working days`}
                    </Button>
                  </RoleGate>
                }
              />
            </Panel>
          ) : (
            <AttendanceDashboard
              data={data}
              loading={loading}
              range={range}
              department={department}
            />
          )}

          {hasAnyData && (
            <>
              {viewMode === "table" && (
                <>
                  <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
                    <div className="relative max-w-md flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                      <Input
                        type="text"
                        placeholder="Search by name, ID, or department..."
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        className="pl-10"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={department}
                        onChange={(e) => setDept(e.target.value)}
                        aria-label="Department"
                        className="w-auto"
                      >
                        <option value="all">All Departments</option>
                        {departments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>
                      {sort.col && sort.dir && (
                        <span className="flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-xs font-medium text-ink-muted">
                          {sort.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {sort.col}
                          <button
                            onClick={() => setSort({ col: null, dir: null })}
                            aria-label="Clear sort"
                            className="ml-0.5 hover:text-ink"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  <Panel padded={false} label="Attendance summary">
                    <div className="scroll-slim overflow-x-auto">
                      <table
                        className="w-full"
                        style={{ tableLayout: "fixed", minWidth: "1100px" }}
                      >
                        <thead>
                          <tr className="text-left">
                            <SortTh
                              col="name"
                              sort={sort}
                              onSort={handleSort}
                              width="220px"
                            >
                              Employee
                            </SortTh>
                            <SortTh
                              col="department"
                              sort={sort}
                              onSort={handleSort}
                              width="130px"
                            >
                              Department
                            </SortTh>
                            <SortTh
                              col="totalAtt"
                              sort={sort}
                              onSort={handleSort}
                              width="88px"
                            >
                              Total Att
                            </SortTh>
                            <SortTh
                              col="present"
                              sort={sort}
                              onSort={handleSort}
                              width="80px"
                            >
                              Present
                            </SortTh>
                            <SortTh
                              col="late"
                              sort={sort}
                              onSort={handleSort}
                              width="68px"
                            >
                              Late
                            </SortTh>
                            <SortTh
                              col="hd"
                              sort={sort}
                              onSort={handleSort}
                              width="60px"
                            >
                              HD
                            </SortTh>
                            <SortTh
                              col="mp"
                              sort={sort}
                              onSort={handleSort}
                              width="60px"
                            >
                              MP
                            </SortTh>
                            <SortTh
                              col="abs"
                              sort={sort}
                              onSort={handleSort}
                              width="68px"
                            >
                              Abs
                            </SortTh>
                            <SortTh
                              col="lv"
                              sort={sort}
                              onSort={handleSort}
                              width="60px"
                            >
                              Lv
                            </SortTh>
                            <SortTh
                              col="hol"
                              sort={sort}
                              onSort={handleSort}
                              width="60px"
                            >
                              Hol
                            </SortTh>
                            <SortTh
                              col="lateTotal"
                              sort={sort}
                              onSort={handleSort}
                              width="96px"
                            >
                              Late Total
                            </SortTh>
                            <SortTh
                              col="otTotal"
                              sort={sort}
                              onSort={handleSort}
                              width="88px"
                            >
                              OT Total
                            </SortTh>
                            {canUseGridViews && <Th width="40px"></Th>}
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={12} className="px-6 py-16">
                                <EmptyState title="Loading…" compact />
                              </td>
                            </tr>
                          ) : paged.length === 0 ? (
                            <tr>
                              <td colSpan={12} className="px-6 py-16">
                                <EmptyState
                                  title="No employees match"
                                  compact
                                />
                              </td>
                            </tr>
                          ) : (
                            paged.map((e) => {
                              const totalAtt =
                                e.totalAttendance ||
                                e.effectivePresent + (e.days.WO || 0);
                              const holidayTotal =
                                (e.days.FH || 0) +
                                (e.days.NH || 0) +
                                (e.days.OH || 0) +
                                (e.days.RH || 0) +
                                (e.days.PH || 0);
                              return (
                                <tr
                                  key={e.biometricId}
                                  onClick={() => setDrawerEmp(e)}
                                  className="group cursor-pointer transition-colors hover:bg-[var(--row-hover)]"
                                >
                                  <td className="border-b border-hairline px-3 py-2.5">
                                    <div className="flex items-center gap-3">
                                      <Avatar name={e.employeeName} />
                                      <div className="min-w-0">
                                        <p className="flex items-center gap-2 truncate text-sm text-ink">
                                          {e.employeeName ||
                                            `(unknown - ${e.biometricId})`}
                                          {e.isGhost && (
                                            <span className="rounded-full bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--state-rework-ink)]">
                                              Ghost
                                            </span>
                                          )}
                                        </p>
                                        <p className="truncate text-xs text-ink-faint">
                                          <span data-figure>
                                            {e.biometricId}
                                          </span>{" "}
                                          . {e.designation || "-"}
                                          <span
                                            className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0 text-[10px] font-medium ${e.employeeType === "executive" ? "bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)] text-[var(--state-risk-ink)]" : "bg-[var(--control)] text-ink-muted"}`}
                                          >
                                            {e.employeeType === "executive"
                                              ? "Exec"
                                              : "Op"}
                                          </span>
                                          {(e.sundayWorked || 0) > 0 && (
                                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--state-extension)_26%,transparent)] px-2 py-0 text-[10px] font-medium text-[var(--state-extension-ink)]">
                                              <Sun className="h-3 w-3" />
                                              <span data-figure>
                                                {e.sundayWorked}
                                              </span>{" "}
                                              Sun
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="truncate border-b border-hairline px-3 py-2.5 text-sm text-ink">
                                    {e.department || "-"}
                                  </td>
                                  <td className="border-b border-hairline px-3 py-2.5 text-right">
                                    <span
                                      data-figure
                                      className="inline-flex h-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] px-2 text-xs font-medium text-[var(--state-positive-ink)]"
                                    >
                                      {totalAtt}
                                    </span>
                                  </td>
                                  <CellCount
                                    value={e.effectivePresent}
                                    tint="emerald"
                                  />
                                  <CellCount
                                    value={e.days["P*"] || 0}
                                    tint="amber"
                                  />
                                  <CellCount
                                    value={(e.days.HD || 0) * 0.5}
                                    tint="yellow"
                                    highlight={e.autoHDs}
                                  />
                                  <CellCount
                                    value={e.days.MP || 0}
                                    tint="pink"
                                  />
                                  <CellCount
                                    value={e.days.AB || 0}
                                    tint="rose"
                                  />
                                  <CellCount
                                    value={e.days.leaves || 0}
                                    tint="purple"
                                  />
                                  <CellCount
                                    value={holidayTotal}
                                    tint="indigo"
                                  />
                                  <td
                                    data-figure
                                    className="border-b border-hairline px-3 py-2.5 text-right text-sm text-ink whitespace-nowrap"
                                  >
                                    {minsToHHMM(e.totalLateMins)}
                                  </td>
                                  <td
                                    data-figure
                                    className="border-b border-hairline px-3 py-2.5 text-right text-sm text-[var(--state-risk-ink)] whitespace-nowrap"
                                  >
                                    {minsToHHMM(e.totalOtMins)}
                                  </td>
                                  {canUseGridViews && (
                                    <td
                                      className="border-b border-hairline px-2 py-2.5 text-center"
                                      onClick={(ev) => ev.stopPropagation()}
                                    >
                                      <RoleGate min="owner">
                                        <button
                                          onClick={() => setRemoveTarget(e)}
                                          title={`Remove ${e.biometricId} from ${gridMonth}`}
                                          className="rounded-full p-1.5 text-ink-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)]"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </RoleGate>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  {filteredSorted.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-ink-muted">
                        Showing{" "}
                        <span data-figure className="font-medium text-ink">
                          {filteredSorted.length}
                        </span>{" "}
                        employees . Page{" "}
                        <span data-figure>
                          {page} of {totalPages}
                        </span>
                      </p>
                      <div className="flex items-center gap-1">
                        <PBtn onClick={() => setPage(1)} disabled={page === 1}>
                          <ChevronsLeft className="w-4 h-4" />
                        </PBtn>
                        <PBtn
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </PBtn>
                        <span
                          data-figure
                          className="px-3 text-sm text-ink-muted"
                        >
                          {page} / {totalPages}
                        </span>
                        <PBtn
                          onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                          }
                          disabled={page === totalPages}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </PBtn>
                        <PBtn
                          onClick={() => setPage(totalPages)}
                          disabled={page === totalPages}
                        >
                          <ChevronsRight className="w-4 h-4" />
                        </PBtn>
                      </div>
                    </div>
                  )}
                </>
              )}
              {viewMode === "list" &&
                canUseGridViews &&
                (dayLoading ? (
                  <Panel label="Loading timeline">
                    <div className="flex items-center justify-center gap-3 py-24">
                      <RefreshCw className="h-6 w-6 animate-spin text-ink-muted" />
                      <span data-figure className="text-sm text-ink-muted">
                        Loading {dayProgress}%...
                      </span>
                    </div>
                  </Panel>
                ) : (
                  <ListView
                    employees={dayEmployees}
                    dates={dayDates}
                    grid={dayGrid}
                    holidayMap={dayHolidayMap}
                    dl={dl}
                    onEdit={(r, ds) => setEditCell({ record: r, dateStr: ds })}
                  />
                ))}
            </>
          )}
        </div>
      </div>

      {drawerEmp && (
        <EmployeeDrawer
          employee={drawerEmp}
          range={range}
          displayLabels={dl}
          onClose={() => setDrawerEmp(null)}
        />
      )}
      {editCell && (
        <DetailDrawer
          record={editCell.record}
          dateStr={editCell.dateStr}
          dl={dl}
          onClose={() => setEditCell(null)}
          onOverride={handleOverride}
          onRefresh={refreshDay}
        />
      )}
      {removeTarget && (
        <RemoveModal
          employee={removeTarget}
          yearMonth={gridMonth}
          onClose={() => setRemoveTarget(null)}
          onRemoved={async (result) => {
            setRemoveTarget(null);
            setBanner({ type: "success", msg: result.message });
            await load();
          }}
        />
      )}
    </Hr_DashboardLayout>
  );
}
