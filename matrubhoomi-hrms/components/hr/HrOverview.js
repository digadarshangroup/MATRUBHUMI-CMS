"use client";

// components/hr/HrOverview.js
//
// The HR overview, as presentation only. Rendered behind a guard on the real
// route and, with sample data, at app/preview/hr — so the design can be looked
// at without a session and cannot drift from what HR actually ships.
//
// THE LAYOUT: a bento, following the reference. A tall hero card (attendance),
// two stacked stat cards, a tall feature card (needs-attention), a row of three
// (headcount / upcoming / joiners), and a wide footer card (activity). Cards are
// frost panels on the shared ground; every figure carries data-figure so the
// columns stop jittering.
//
// EVERY MARK IS A REAL NUMBER. No payload history exists, so no trend lines —
// the donut, the meters and the bars each divide one real field by another.

import Link from "next/link";
import {
  AlertCircle, RefreshCw, CalendarDays, ChevronRight,
} from "lucide-react";
import {
  PageHead, Panel, PanelHead, Chip, StatPair, Meter, Rows, Button, EmptyState,
} from "@/components/ceo/ui/Primitives";

/* ------------------------------------------------------------------ */

function initialsOf(name = "") {
  return (
    name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean)
      .slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"
  );
}

const hueFor = (name = "") =>
  name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

function Avatar({ name }) {
  return (
    <span
      data-avatar-hue={hueFor(name)}
      aria-hidden="true"
      className="matrubhoomi-avatar h-[30px] w-[30px] shrink-0 text-[10.5px] font-semibold tracking-[-0.01em]"
    >
      {initialsOf(name)}
    </span>
  );
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** Present ÷ active, as one arc with the figure at the centre. */
function AttendanceDonut({ present, active }) {
  const share = pct(present, active);
  const R = 58;
  const C = 2 * Math.PI * R;
  const dash = (share / 100) * C;
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg
        viewBox="0 0 140 140"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`${share}% present today`}
      >
        <circle
          cx="70" cy="70" r={R}
          fill="none"
          strokeWidth="13"
          stroke="var(--control-active)"
        />
        <circle
          cx="70" cy="70" r={R}
          fill="none"
          strokeWidth="13"
          stroke="var(--state-positive)"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeDashoffset={C / 4}
          strokeLinecap={dash > 0 ? "round" : "butt"}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          data-figure
          className="text-[2rem] leading-none font-medium tracking-[-0.03em] text-ink"
        >
          {share}
          <span className="ml-px text-base text-ink-muted">%</span>
        </span>
        <span className="mt-1 text-[11.5px] text-ink-faint">present</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function HrOverview({ data, activities = [], onRefresh }) {
  const {
    employees, attendance, leaves, regularizations, upcomingHolidays, alerts,
  } = data || {};

  const recentActivities = activities;

  const totalCount = employees?.total || 0;
  const activeCount = employees?.active || 0;
  const inactiveCount = employees?.inactive ?? Math.max(0, totalCount - activeCount);
  const presentToday = attendance?.today?.present || 0;
  const absentToday = Math.max(0, activeCount - presentToday);
  const monthlyRate = attendance?.monthly?.avgAttendanceRate ?? null;
  const pendingLeaves = leaves?.pendingApprovals?.total || 0;
  const leavesAtHR = leaves?.pendingApprovals?.atHR || 0;
  const leavesAtManager = leaves?.pendingApprovals?.atManager || 0;
  const regPending = regularizations?.pendingApprovals?.total || 0;

  const recentHires = employees?.recentHires || [];
  const departments = employees?.byDepartment || [];
  const deptMax = Math.max(1, ...departments.map((d) => d.count));
  const holidays = upcomingHolidays || [];

  const attention = [];
  if (alerts && alerts.length > 0) {
    alerts.forEach((a) => attention.push({ title: a.category || "Alert", body: a.message }));
  } else {
    if (pendingLeaves > 0)
      attention.push({ title: "Leave approvals", body: `${pendingLeaves} pending review` });
    if ((attendance?.today?.pendingCheckout || 0) > 0)
      attention.push({ title: "Missed punches", body: `${attendance.today.pendingCheckout} with attendance issues` });
    if ((regularizations?.pendingApprovals?.total || 0) > 0)
      attention.push({ title: "Regularisations", body: `${regularizations.pendingApprovals.total} awaiting approval` });
  }

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
      <PageHead
        kicker="Human resources"
        title={greeting()}
        sub={
          <>
            <span data-figure>{today}</span> · Where people, attendance and leave
            stand today.
          </>
        }
        actions={
          <>
            <Chip tone="neutral">
              <CalendarDays size={13} aria-hidden="true" />
              <span data-figure>{activeCount}</span> active
            </Chip>
            {onRefresh ? (
              <Button tone="secondary" size="sm" onClick={onRefresh}>
                <RefreshCw size={13} aria-hidden="true" /> Refresh
              </Button>
            ) : null}
          </>
        }
      />

      {/* ── Bento — masonry columns, so no card is left stretched-empty ── */}
      <div className="columns-1 gap-4 md:columns-2 deck:columns-3 [&>section]:mb-4 [&>section]:w-full [&>section]:break-inside-avoid">
        {/* Hero — attendance */}
        <Panel label="Today's attendance">
          <PanelHead
            title="Today’s attendance"
            aside={<Chip tone="neutral">{today.split(",")[0] || "Today"}</Chip>}
          />
          {activeCount === 0 ? (
            <EmptyState compact title="No active staff on record." />
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-6">
              <AttendanceDonut present={presentToday} active={activeCount} />
              <div className="flex min-w-[140px] flex-1 flex-col gap-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--state-positive)]"
                  />
                  <span className="text-ink-muted">Present</span>
                  <span data-figure className="ml-auto font-medium text-ink">
                    {presentToday}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full bg-[var(--control-active)]"
                  />
                  <span className="text-ink-muted">Absent</span>
                  <span data-figure className="ml-auto font-medium text-ink">
                    {absentToday}
                  </span>
                </div>
                {monthlyRate !== null && (
                  <div className="mt-1 flex items-center gap-2 border-t border-hairline pt-2.5 text-sm">
                    <span className="text-ink-faint">Monthly average</span>
                    <span data-figure className="ml-auto font-medium text-ink">
                      {monthlyRate}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        {/* Stat — total employees */}
        <Panel label="Total employees">
          <PanelHead
            title="Total employees"
            aside={
              <Link
                href="/hr/dashboard/employees"
                aria-label="View employees"
                className="grid h-[26px] w-[26px] place-items-center rounded-full text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              >
                <ChevronRight size={16} />
              </Link>
            }
          />
          <StatPair label="On record" value={String(totalCount)} />
          <p className="mt-2 text-xs text-ink-faint">
            <span data-figure>{activeCount}</span> active ·{" "}
            <span data-figure>{inactiveCount}</span> inactive
          </p>
          <Meter
            className="mt-3"
            value={pct(activeCount, totalCount)}
            label={`${pct(activeCount, totalCount)}% active`}
          />
          <div className="mt-3 border-t border-hairline pt-3">
            <Rows>
              <div className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                <span className="text-ink-muted">Departments</span>
                <span data-figure className="font-medium text-ink">
                  {departments.length}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                <span className="text-ink-muted">New joiners</span>
                <span data-figure className="font-medium text-ink">
                  {recentHires.length}
                </span>
              </div>
            </Rows>
          </div>
        </Panel>

        {/* Stat — leave requests */}
        <Panel label="Leave requests">
          <PanelHead
            title="Leave requests"
            aside={
              <Link
                href="/hr/dashboard/leaves"
                aria-label="View leaves"
                className="grid h-[26px] w-[26px] place-items-center rounded-full text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              >
                <ChevronRight size={16} />
              </Link>
            }
          />
          <StatPair label="Pending approval" value={String(pendingLeaves)} />
          <p className="mt-2 text-xs text-ink-faint">
            {leavesAtHR > 0 ? (
              <>
                <span data-figure>{leavesAtHR}</span> awaiting HR
              </>
            ) : (
              "None awaiting HR"
            )}
          </p>
          <div className="mt-3 border-t border-hairline pt-3">
            <Rows>
              <div className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                <span className="text-ink-muted">With manager</span>
                <span data-figure className="font-medium text-ink">
                  {leavesAtManager}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                <span className="text-ink-muted">With HR</span>
                <span data-figure className="font-medium text-ink">
                  {leavesAtHR}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0">
                <span className="text-ink-muted">Regularisations</span>
                <span data-figure className="font-medium text-ink">
                  {regPending}
                </span>
              </div>
            </Rows>
          </div>
        </Panel>

        {/* Feature — needs attention */}
        <Panel label="Needs attention">
          <PanelHead
            title="Needs attention"
            aside={
              attention.length > 0 ? (
                <Chip tone="rework">
                  <span data-figure>{attention.length}</span>
                </Chip>
              ) : null
            }
          />
          {attention.length === 0 ? (
            <EmptyState
              compact
              title="All clear"
              body="Nothing needs your attention right now."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {attention.map((a, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <AlertCircle
                    size={15}
                    aria-hidden="true"
                    className="mt-px shrink-0 text-[var(--state-rework)]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[12.5px] font-medium text-ink">
                      {a.title}
                    </span>
                    <span className="mt-0.5 text-[11.5px] text-ink-muted">
                      {a.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Headcount */}
        <Panel label="Headcount by department">
          <PanelHead
            title="Headcount by department"
            aside={
              <Link
                href="/hr/dashboard/departments"
                aria-label="View departments"
                className="grid h-[26px] w-[26px] place-items-center rounded-full text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
              >
                <ChevronRight size={16} />
              </Link>
            }
          />
          {departments.length === 0 ? (
            <EmptyState compact title="No department data." />
          ) : (
            <ul className="flex flex-col gap-3">
              {departments.map((d) => (
                <li
                  key={d.department}
                  className="grid grid-cols-[6rem_1fr_2.25rem] items-center gap-3 sm:grid-cols-[8rem_1fr_2.25rem]"
                >
                  <span className="truncate text-xs text-ink-muted">
                    {d.department}
                  </span>
                  <Meter
                    value={Math.max(3, Math.round((d.count / deptMax) * 100))}
                    announce={d.count}
                    label={`${d.department} headcount`}
                  />
                  <span
                    data-figure
                    className="text-right text-[12.5px] font-medium text-ink"
                  >
                    {d.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming */}
        <Panel label="Upcoming">
          <PanelHead title="Upcoming" />
          {holidays.length === 0 ? (
            <EmptyState compact title="Nothing scheduled." />
          ) : (
            <Rows>
              {holidays.map((h, i) => {
                const d = new Date(h.date);
                const ok = !Number.isNaN(d.getTime());
                return (
                  <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex w-11 shrink-0 flex-col items-center rounded-inset bg-[var(--control)] py-1">
                      <span className="text-[9.5px] font-medium tracking-[0.05em] text-ink-faint uppercase">
                        {ok
                          ? d.toLocaleDateString("en-IN", { weekday: "short" })
                          : "—"}
                      </span>
                      <span
                        data-figure
                        className="text-[15px] leading-tight font-medium text-ink"
                      >
                        {ok ? d.getDate() : "–"}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] font-medium text-ink">
                        {h.name}
                      </span>
                      <span className="mt-px text-[11px] text-ink-muted">
                        {h.type === "full_day" ? "Full day" : "Half day"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </Rows>
          )}
        </Panel>

        {/* Recent joiners */}
        <Panel label="Recent joiners">
          <PanelHead
            title="Recent joiners"
            aside={
              <Chip tone="neutral">
                <span data-figure>{recentHires.length}</span>
              </Chip>
            }
          />
          {recentHires.length === 0 ? (
            <EmptyState compact title="Nobody has joined recently." />
          ) : (
            <Rows>
              {recentHires.slice(0, 4).map((h, i) => (
                <div
                  key={`${h.name}-${i}`}
                  className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <Avatar name={h.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[12.5px] font-medium text-ink">
                      {h.name}
                    </span>
                    <span className="truncate text-[11px] text-ink-muted">
                      {h.designation || "—"} · {h.department || "—"}
                    </span>
                  </span>
                  <span
                    data-figure
                    className="shrink-0 text-[11px] whitespace-nowrap text-ink-faint"
                  >
                    {fmtDate(h.joinedOn)}
                  </span>
                </div>
              ))}
            </Rows>
          )}
        </Panel>

        {/* Activity (wide footer) */}
        <Panel label="Recent activity">
          <PanelHead title="Recent activity" />
          {recentActivities.length === 0 ? (
            <EmptyState compact title="Nothing has happened yet today." />
          ) : (
            <Rows>
              {recentActivities.map((a, i) => {
                const who = a.title || a.message || "";
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <Avatar name={who} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[12.5px] leading-snug text-ink">
                        {who}
                      </span>
                      {a.subtitle ? (
                        <span className="mt-0.5 text-[11.5px] text-ink-muted">
                          {a.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {a.timeAgo ? (
                      <span
                        data-figure
                        className="shrink-0 text-[11px] whitespace-nowrap text-ink-faint"
                      >
                        {a.timeAgo}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </Rows>
          )}
        </Panel>
      </div>
    </div>
  );
}
