// app/ceo/dashboard/page.js
//
// The executive overview — the whole of the executive home screen.
//
// WHAT IT DELIBERATELY IS NOT
// ---------------------------
// It is not a second HR dashboard. Every figure here is a COUNT, and every one
// of them links through to the HR screen that owns the detail. The moment this
// page starts explaining a number rather than pointing at it, there are two
// implementations of the same question and they will disagree.
//
// Everything is read from /api/ceo/hr/*, which is scoped to the executive
// session and never returns salary.

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import CEO_DashboardLayout from "@/components/CEO_DashboardLayout";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Plane,
  Inbox,
  MapPin,
  Smartphone,
  Megaphone,
  Navigation,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};

function Stat({ icon: Icon, label, value, hint, tone = "accent", href }) {
  const toneVar = {
    accent: "var(--ck-accent)",
    warn: "var(--ck-warn)",
    danger: "var(--ck-danger)",
  }[tone];

  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" style={{ color: toneVar }} />
        <span className="ck-label">{label}</span>
      </div>
      <div
        className="mt-2 text-3xl font-semibold tabular-nums"
        style={{ color: "var(--ck-ink)" }}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs" style={{ color: "var(--ck-ink-3)" }}>
          {hint}
        </div>
      ) : null}
    </>
  );

  if (!href) return <div className="ck-panel px-4 py-3.5">{body}</div>;

  return (
    <Link
      href={href}
      className="ck-panel px-4 py-3.5 block transition-transform hover:-translate-y-0.5"
    >
      {body}
      <div
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: toneVar }}
      >
        Open <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  );
}

/**
 * The company TODAY — from /api/ceo/overview, one read. Each tile is a count
 * with a link to the screen that owns the list behind it.
 */
function TodaySection({ data, loading }) {
  const d = data;
  const dash = (v) => (loading || v == null ? "—" : v);
  const approvals = d?.approvals;
  const field = d?.field;
  const app = d?.app;
  const dayLabel = d?.day
    ? new Date(d.day).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    : "";
  const approvalsHint = approvals
    ? `${approvals.leave} leave · ${approvals.corrections} corrections · ${approvals.overtime} overtime` +
      (approvals.oldestWaitingDays ? ` · oldest ${approvals.oldestWaitingDays} day${approvals.oldestWaitingDays === 1 ? "" : "s"}` : "") +
      (approvals.leaveWaitingForHr ? ` · ${approvals.leaveWaitingForHr} with no manager (HR decides)` : "")
    : "";
  return (
    <section className="space-y-3">
      <h2 className="ck-label">Today{dayLabel ? ` · ${dayLabel}` : ""}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={UserCheck}
          label="Present today"
          value={d?.attendance ? dash(d.attendance.present) : loading ? "—" : "Not synced"}
          hint={
            d?.attendance
              ? `${d.attendance.late} late · of ${d.people.headcount} on the rolls`
              : "The punch machine has not been synced for today yet"
          }
          href="/ceo/dashboard/hr/attendance"
        />
        <Stat
          icon={Plane}
          label="On leave today"
          value={dash(d?.onLeave?.count)}
          hint={(d?.onLeave?.people || []).slice(0, 3).map((p) => p.name + (p.half ? " (½)" : "")).join(", ") || "Nobody"}
          href="/hr/dashboard/leaves"
        />
        <Stat
          icon={Inbox}
          label="Waiting for a decision"
          value={dash(approvals?.total)}
          tone={approvals?.oldestWaitingDays > 3 ? "danger" : approvals?.total ? "warn" : "accent"}
          hint={approvalsHint}
          href="/hr/dashboard/leaves"
        />
        <Stat
          icon={Smartphone}
          label="Using the app this week"
          value={dash(app?.activeThisWeek)}
          hint={app ? `${app.neverSignedIn} never signed in${app.versions?.[0] ? ` · most on v${app.versions[0].version}` : ""}` : ""}
          href="/hr/dashboard/mobile-app"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Link href="/sales/dashboard/team" className="ck-panel p-4 lg:col-span-3 block transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" style={{ color: "var(--ck-accent)" }} />
            <span className="ck-label">Field team today</span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["On duty now", field?.onDutyNow, field ? `${field.reportingNow} reporting live` : ""],
              ["Went out", field?.out, "recorded a route today"],
              ["Kilometres", field?.km, "counted conservatively"],
              ["Visits", field?.visits, "recorded on the phones"],
            ].map(([label, value, hint]) => (
              <div key={label}>
                <div className="text-xs" style={{ color: "var(--ck-ink-3)" }}>{label}</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: "var(--ck-ink)" }}>{dash(value)}</div>
                <div className="text-[11px]" style={{ color: "var(--ck-ink-3)" }}>{hint}</div>
              </div>
            ))}
          </div>
          {(field?.leaders || []).length ? (
            <ul className="mt-3 space-y-1.5">
              {field.leaders.map((l) => (
                <li key={l.name} className="flex items-center gap-2 text-sm">
                  <Navigation className="w-3.5 h-3.5 shrink-0" style={{ color: l.onDuty ? "var(--ck-accent)" : "var(--ck-ink-3)" }} />
                  <span className="font-medium" style={{ color: "var(--ck-ink)" }}>{l.name}</span>
                  <span className="tabular-nums" style={{ color: "var(--ck-ink-2)" }}>{l.km} km</span>
                  {l.at ? (
                    <span className="truncate" style={{ color: "var(--ck-ink-3)" }}>
                      · {l.onDuty ? "now near" : "last near"} {l.at}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs" style={{ color: "var(--ck-ink-3)" }}>Nobody has recorded a route yet today.</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--ck-accent)" }}>
            Team on the map <ArrowRight className="w-3 h-3" />
          </div>
        </Link>

        <Link href="/ceo/dashboard/announcements" className="ck-panel p-4 lg:col-span-2 block transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-2">
            <Megaphone className="w-3.5 h-3.5" style={{ color: "var(--ck-accent)" }} />
            <span className="ck-label">Last announcement</span>
          </div>
          {d?.announcement ? (
            <>
              <div className="mt-2 text-sm font-semibold" style={{ color: "var(--ck-ink)" }}>{d.announcement.title}</div>
              <div className="mt-1 text-xs" style={{ color: "var(--ck-ink-3)" }}>
                {new Date(d.announcement.sentAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                {" · "}
                {d.announcement.sentByName}
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums" style={{ color: "var(--ck-ink)" }}>
                {d.announcement.read}/{d.announcement.delivered}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ck-ink-3)" }}>have opened it in the app</div>
            </>
          ) : (
            <p className="mt-2 text-sm" style={{ color: "var(--ck-ink-3)" }}>
              Nothing announced yet. Tell the whole company something — it lands on every phone.
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--ck-accent)" }}>
            Write an announcement <ArrowRight className="w-3 h-3" />
          </div>
        </Link>
      </div>
    </section>
  );
}

export default function ExecutiveOverviewPage() {
  const [employees, setEmployees] = useState(null);
  const [summary, setSummary] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const ym = thisMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      // Asked for together rather than in sequence: three independent reads,
      // and waiting for each in turn is three round trips of blank screen.
      const [empRes, sumRes, deptRes, todayRes] = await Promise.all([
        fetch(`${API}/api/ceo/hr/employees?limit=1000`, { credentials: "include" }),
        fetch(`${API}/api/ceo/hr/attendance/summary?yearMonth=${ym}`, {
          credentials: "include",
        }),
        fetch(`${API}/api/ceo/hr/departments`, { credentials: "include" }),
        fetch(`${API}/api/ceo/overview`, { credentials: "include" }),
      ]);

      const emp = await empRes.json().catch(() => null);
      const sum = await sumRes.json().catch(() => null);
      const dept = await deptRes.json().catch(() => null);
      const now = await todayRes.json().catch(() => null);
      if (now?.success) setToday(now.data);

      if (emp?.success) setEmployees(emp.data || emp.employees || []);
      if (sum?.success) setSummary(sum.data || null);
      if (dept?.success) setDepartments(dept.data || []);

      if (!emp?.success && !sum?.success) {
        setErr(emp?.message || sum?.message || "Could not load the overview.");
      }
    } catch (e) {
      setErr(e.message || "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useEffect(() => {
    load();
  }, [load]);

  const list = Array.isArray(employees) ? employees : [];
  const total = list.length;
  const active = list.filter(
    (e) => e?.isActive !== false && e?.status !== "inactive",
  ).length;
  const inactive = total - active;

  return (
    <CEO_DashboardLayout activeMenu="overview">
      <div className="px-4 py-5 sm:px-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-xl font-semibold tracking-tight"
              style={{ color: "var(--ck-ink)" }}
            >
              Executive overview
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ck-ink-3)" }}>
              The company today, the workforce as it stands, and who may open what.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="ck-btn inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {err ? (
          <div
            className="ck-panel px-4 py-3 flex items-start gap-2 text-sm"
            style={{ color: "var(--ck-danger)" }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        ) : null}

        <TodaySection data={today} loading={loading} />

        <h2 className="ck-label pt-1">The workforce</h2>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={Users}
            label="On the rolls"
            value={loading ? "—" : total}
            hint={`${departments.length || 0} department${departments.length === 1 ? "" : "s"}`}
            href="/ceo/dashboard/hr/employees"
          />
          <Stat
            icon={UserCheck}
            label="Active"
            value={loading ? "—" : active}
            hint="Able to sign in and be marked present"
            href="/ceo/dashboard/hr/employees"
          />
          <Stat
            icon={UserX}
            label="Inactive"
            value={loading ? "—" : inactive}
            tone="warn"
            hint="Separated or suspended"
            href="/ceo/dashboard/hr/employees"
          />
          <Stat
            icon={Clock}
            label="Days recorded"
            value={loading ? "—" : (summary?.totalDays ?? 0)}
            hint={`${monthLabel(ym)} · ${summary?.finalisedDays ?? 0} closed by HR`}
            href="/ceo/dashboard/hr/attendance"
          />
        </section>

        <section className="ck-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="ck-label">Attendance · {monthLabel(ym)}</h2>
            <Link
              href="/ceo/dashboard/hr/attendance"
              className="text-xs font-medium inline-flex items-center gap-1"
              style={{ color: "var(--ck-accent)" }}
            >
              Muster roll <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Totals across the month, not a rate: a percentage here would
              have to pick a denominator (rolls? working days? days actually
              synced?) and every reader would assume a different one. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {[
              ["Present", summary?.totalPresent, "var(--ck-accent)"],
              ["Absent", summary?.totalAbsent, "var(--ck-danger)"],
              ["Late", summary?.totalLate, "var(--ck-warn)"],
              ["Half day", summary?.totalHD, "var(--ck-ink-2)"],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="text-xs" style={{ color: "var(--ck-ink-3)" }}>
                  {label}
                </div>
                <div
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color }}
                >
                  {loading ? "—" : (value ?? 0)}
                </div>
              </div>
            ))}
          </div>

          {!loading && !summary?.totalDays ? (
            <p className="mt-3 text-xs" style={{ color: "var(--ck-ink-3)" }}>
              Nothing has been recorded for this month yet. Attendance appears
              here once HR syncs or enters the first day.
            </p>
          ) : null}
        </section>

        <section className="ck-panel p-4">
          <div className="flex items-start gap-3">
            <span
              className="grid place-items-center w-9 h-9 rounded-xl shrink-0"
              style={{ background: "var(--ck-wash)", color: "var(--ck-accent)" }}
            >
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                className="text-sm font-semibold"
                style={{ color: "var(--ck-ink)" }}
              >
                Access control
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--ck-ink-3)" }}>
                Departments, who holds a login, and what each person may do
                inside their department. Changes take effect on that person&apos;s
                next request — nobody has to sign out and back in.
              </p>
              <Link
                href="/ceo/dashboard/access"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium"
                style={{ color: "var(--ck-accent)" }}
              >
                Open access control <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </CEO_DashboardLayout>
  );
}
