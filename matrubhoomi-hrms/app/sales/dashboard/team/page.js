"use client";

// app/sales/dashboard/team/page.js
//
// Where the field team is, what they are doing, and where they have been.
//
// THE QUESTIONS, IN THE ORDER THEY ARE ASKED
// ------------------------------------------
//   1. Who is out, and what are they doing right now?  "Stopped in Kalmeshwar
//      · 25 min", "Moving · 28 km/h near Katol", "Not reporting since 3:10 pm".
//      The list answers it without a click; the team map shows it at once.
//   2. How did this person's day go?  Pick them: every stop in order, named by
//      its village — "Stayed in Kalmeshwar 10:42–11:27 (45 min)" — with the
//      visits recorded there and the drive between stops.
//   3. And the route itself — on the map, numbered to match the list.
//
// TWO NUMBERS, ALWAYS TOGETHER
// ----------------------------
// Distance travelled and work recorded sit side by side on every row. On its
// own, distance rewards driving; on its own, visits reward staying in one
// village. Together they describe a day.
//
// AND ONE HONEST GAP
// ------------------
// A phone with no signal and a phone switched off look identical from here, so
// the board says "not reporting" and lets a person decide which it is. It never
// says "stopped tracking", because that is an accusation the data cannot
// support.
//
// Everything here is read from the same server rollup the employee's own app
// reads (services/fieldTracking.js), so the desk and the phone never tell two
// different stories about the same day.

import { useMemo, useState } from "react";
import { ArrowLeft, BatteryLow, MapPin, RefreshCw, Trash2, Users } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Input, Segmented, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, ErrorNote, ago, todayKey, StageChip } from "@/components/sales/kit";
import { useDeptRole } from "@/components/access/useDeptRole";
import TrackMap from "@/components/sales/TrackMap";
import RouteInWords from "@/components/sales/RouteInWords";

const LIVE_REFRESH_MS = 45_000;
// Naming a route's waypoints is the slowest thing on the page, so the words
// refresh less often than the figures.
const WORDS_REFRESH_MS = 180_000;

/* ── Saying what somebody is doing ─────────────────────────────────── */

const STATE = {
  moving: { word: "Moving", tone: "water", rank: 0 },
  stopped: { word: "Stopped", tone: "brand", rank: 1 },
  idle: { word: "Starting", tone: "neutral", rank: 2 },
  not_reporting: { word: "Not reporting", tone: "harvest", rank: 3 },
  off_duty: { word: "Duty ended", tone: "neutral", rank: 4 },
  not_started: { word: "Not started", tone: "neutral", rank: 5 },
};

const TONE_VAR = {
  water: "var(--g-water)",
  brand: "var(--g-brand)",
  harvest: "var(--g-harvest)",
  brick: "var(--g-brick)",
  neutral: "var(--g-ink-3)",
};

function clock(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function minutes(m) {
  const v = Math.max(0, Math.round(Number(m) || 0));
  if (v < 60) return `${v} min`;
  return v % 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v / 60}h`;
}

/** The village when it is known, the road otherwise. */
const placeOf = (r) => r?.locality || r?.place || "";

/** One line: what this person is doing, as far as the data can honestly say. */
function statusLine(r) {
  const where = placeOf(r);
  switch (r.state) {
    case "moving":
      return [
        r.speedKmh >= 1 ? `Moving · ${Math.round(r.speedKmh)} km/h` : "Moving",
        where && `near ${where}`,
      ].filter(Boolean).join(" · ");
    case "stopped":
      return [
        where ? `Stopped in ${where}` : "Stopped",
        r.stoppedMinutes != null && minutes(r.stoppedMinutes),
      ].filter(Boolean).join(" · ");
    case "not_reporting":
      return [
        r.lastSeenAt ? `Not reporting · last seen ${ago(r.lastSeenAt)}` : "Not reporting",
        where && `near ${where}`,
      ].filter(Boolean).join(" · ");
    case "off_duty":
      return [
        r.dutyEndedAt ? `Duty ended ${clock(r.dutyEndedAt)}` : "Duty ended",
        where && `last near ${where}`,
      ].filter(Boolean).join(" · ");
    case "not_started":
      return "Has not started duty today";
    default:
      return r.lastSeenAt ? `Seen ${ago(r.lastSeenAt)}` : "No position yet";
  }
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/* ── The page ───────────────────────────────────────────────────────── */

export default function SalesTeamPage() {
  const [day, setDay] = useState(todayKey());
  const [view, setView] = useState("live");
  const [show, setShow] = useState("all");
  const [selected, setSelected] = useState(null);
  // Erasing a trail: a two-step control, because it cannot be undone.
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);
  // Only an approver may erase a trail — the server refuses anybody else, so
  // the button is not offered to them either.
  const { can } = useDeptRole();

  const isToday = day === todayKey();

  const live = useAsync(() => salesApi.live(day), [day], {
    // Only the live board polls, and only for today: a page open on last
    // Tuesday refetching every 45 seconds is pure waste.
    interval: view === "live" && isToday ? LIVE_REFRESH_MS : undefined,
  });

  const travel = useAsync(
    () => (view === "travel" ? salesApi.travel(day, day) : Promise.resolve(null)),
    [view, day],
  );

  // The selected person's day follows the board: while somebody is out, their
  // stops and their line keep growing on screen instead of freezing at
  // whatever they were when the name was clicked.
  const dayDetail = useAsync(
    () => (selected ? salesApi.employeeDay(selected, day) : Promise.resolve(null)),
    [selected, day],
    { interval: selected && view === "live" && isToday ? LIVE_REFRESH_MS : undefined },
  );

  // Fetched separately from the day itself. Naming places can take seconds when
  // nothing is cached, and the route must be drawn before the words arrive.
  const itinerary = useAsync(
    () => (selected ? salesApi.itinerary(selected, day) : Promise.resolve(null)),
    [selected, day],
    { interval: selected && view === "live" && isToday ? WORDS_REFRESH_MS : undefined },
  );

  async function clearTracking(scope) {
    if (!selected) return;
    setClearing(true);
    setClearError(null);
    try {
      await salesApi.clearTracking(selected, scope);
      setConfirmClear(false);
      // Both the drawn route and the board's figures came from what was just
      // deleted, so both are refetched rather than patched.
      dayDetail.reload();
      live.reload();
      itinerary.reload();
    } catch (err) {
      setClearError(err?.message || "Could not clear it.");
    } finally {
      setClearing(false);
    }
  }

  function pick(id) {
    setSelected(id);
    setConfirmClear(false);
  }

  const rows = useMemo(() => {
    const list = [...(live.data?.data || [])];
    list.sort((a, b) =>
      (a.inactive ? 1 : 0) - (b.inactive ? 1 : 0) ||
      (STATE[a.state]?.rank ?? 9) - (STATE[b.state]?.rank ?? 9) ||
      String(a.name).localeCompare(String(b.name)));
    return list;
  }, [live.data]);

  const counts = useMemo(() => {
    const c = { out: 0, moving: 0, stopped: 0, not_reporting: 0, off_duty: 0, not_started: 0 };
    for (const r of rows) {
      if (c[r.state] !== undefined) c[r.state] += 1;
      if (r.state === "moving" || r.state === "stopped" || r.state === "idle") c.out += 1;
    }
    return c;
  }, [rows]);

  const shown = rows.filter((r) =>
    show === "all" ? true
      : show === "out" ? ["moving", "stopped", "idle"].includes(r.state)
        : r.state === show);

  const travelRows = travel.data?.data || [];
  const detail = dayDetail.data?.data;
  const selectedRow = rows.find((r) => r.employeeId === selected);
  const totalKm = rows.reduce((s, r) => s + (Number(r.distanceKm) || 0), 0);

  return (
    <SalesDashboardLayout activeMenu="team">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales · field"
          title="Team on the map"
          sub={
            live.loading
              ? "Loading…"
              : rows.length
                ? `${counts.out} out now · ${counts.not_reporting} not reporting · ${totalKm.toFixed(1)} km covered`
                : "Nobody from the field team has reported a position on this day."
          }
          actions={
            <>
              <Input
                type="date"
                value={day}
                onChange={(e) => { setDay(e.target.value); setSelected(null); setConfirmClear(false); }}
                aria-label="Day"
                className="w-auto py-1.5 text-sm"
              />
              <Button
                size="sm"
                onClick={() => {
                  live.reload({ quiet: true });
                  if (selected) { dayDetail.reload({ quiet: true }); itinerary.reload({ quiet: true }); }
                }}
                aria-label="Refresh"
              >
                <RefreshCw size={15} />
              </Button>
            </>
          }
        >
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { id: "live", label: "Live board" },
              { id: "travel", label: "Travel summary" },
            ]}
          />
        </PageHead>

        {view === "live" ? (
          <div className="grid grid-cols-1 gap-4 deck:grid-cols-[1fr_400px]">
            {/* ── Left: the whole team, or one person's day ─────────── */}
            {selected ? (
              <PersonDay
                row={selectedRow}
                detail={detail}
                loading={dayDetail.loading && !detail}
                error={dayDetail.error}
                itinerary={itinerary}
                day={day}
                isToday={isToday}
                canClear={can("approver")}
                confirmClear={confirmClear}
                setConfirmClear={setConfirmClear}
                clearing={clearing}
                clearError={clearError}
                onClear={clearTracking}
                onBack={() => { setSelected(null); setConfirmClear(false); }}
              />
            ) : (
              <TeamOverview rows={rows} counts={counts} loading={live.loading} onPick={pick} isToday={isToday} />
            )}

            {/* ── Right: who is out ──────────────────────────────────── */}
            <Panel padded={false} label="Who is out">
              <div className="border-b border-[var(--g-line)] px-4 py-3">
                <Segmented
                  label="Show"
                  value={show}
                  onChange={setShow}
                  size="sm"
                  options={[
                    { id: "all", label: `All ${rows.length}` },
                    { id: "out", label: `Out ${counts.out}` },
                    { id: "not_reporting", label: `Silent ${counts.not_reporting}` },
                    ...(isToday ? [{ id: "not_started", label: `Not started ${counts.not_started}` }] : []),
                  ]}
                />
              </div>
              {live.error ? (
                <div className="p-5"><ErrorNote error={live.error} onRetry={live.reload} /></div>
              ) : live.loading ? (
                <div className="p-5"><SkeletonRows rows={6} /></div>
              ) : shown.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title={rows.length ? "Nobody here" : "No positions on this day"}
                    body={rows.length ? "Nobody on the team matches this filter." : "Positions arrive from the field app while somebody is on duty."}
                  />
                </div>
              ) : (
                <div className="divide-y divide-[var(--g-line)]">
                  {shown.map((r) => {
                    const meta = STATE[r.state] || STATE.idle;
                    return (
                      <button
                        key={r.employeeId}
                        type="button"
                        onClick={() => pick(r.employeeId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--g-surface-2)]"
                        style={{ background: selected === r.employeeId ? "var(--g-brand-wash)" : undefined }}
                      >
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{
                            color: TONE_VAR[meta.tone],
                            background: `color-mix(in srgb, ${TONE_VAR[meta.tone]} 14%, transparent)`,
                          }}
                        >
                          {initials(r.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm text-[var(--g-ink)]">{r.name}</span>
                            {r.inactive && (
                              <span className="shrink-0 rounded-full bg-[var(--g-brick-wash)] px-1.5 py-0.5 text-[10px] text-[var(--g-brick)]">
                                left
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs" style={{ color: TONE_VAR[meta.tone] }}>
                            {statusLine(r)}
                          </span>
                          {r.lastStop && r.state !== "stopped" && (
                            <span className="mt-0.5 block truncate text-[11px] text-[var(--g-ink-3)]">
                              Last stop: {r.lastStop.place || "unnamed"} · {minutes(r.lastStop.minutes)}
                              {r.lastStop.leftAt ? ` · left ${clock(r.lastStop.leftAt)}` : ""}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span data-figure className="block text-sm tabular-nums text-[var(--g-ink)]">
                            {r.distanceKm} km
                          </span>
                          <span className="mt-0.5 block text-xs tabular-nums text-[var(--g-ink-3)]">
                            {r.submissions} recorded{r.stops ? ` · ${r.stops} stop${r.stops === 1 ? "" : "s"}` : ""}
                          </span>
                        </span>
                        {r.battery != null && r.battery < 20 && (
                          <BatteryLow size={15} className="shrink-0 text-[var(--g-danger)]" aria-label="Low battery" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        ) : (
          <Panel padded={false} label="Travel summary">
            {travel.loading ? (
              <div className="p-5"><SkeletonRows rows={6} /></div>
            ) : travelRows.length === 0 ? (
              <div className="p-5"><EmptyState title="Nothing recorded" body="Pick another day." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--g-line)] text-left">
                      {["Employee", "Distance", "Moving", "Still", "Visits recorded", "New leads", "km per visit"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {travelRows.map((r) => (
                      <tr key={r.employeeId} className="border-b border-[var(--g-line)] last:border-0">
                        <td className="px-4 py-3 font-medium text-[var(--g-ink)]">{r.name}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{r.distanceKm} km</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{r.movingHours} h</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-3)]">{r.idleHours} h</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{r.submissions}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{r.leadsCreated}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">
                          {r.kmPerSubmission === null ? "—" : `${r.kmPerSubmission} km`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        <p className="mt-3 text-xs text-[var(--g-ink-3)]">
          Distances are measured conservatively: fixes that are too vague, too small to be a real step, or
          too fast to be possible are stored but never counted, so this figure under-reports rather than
          inventing travel. A stop is five minutes or more within about sixty metres.
        </p>
      </div>
    </SalesDashboardLayout>
  );
}

/* ── Nobody picked: the whole team ──────────────────────────────────── */

function TeamOverview({ rows, counts, loading, onPick, isToday }) {
  const people = rows
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const meta = STATE[r.state] || STATE.idle;
      return {
        id: r.employeeId,
        lat: r.lat,
        lng: r.lng,
        label: initials(r.name),
        tone: r.inactive ? TONE_VAR.brick : TONE_VAR[meta.tone],
        title: `${r.name} — ${statusLine(r)}`,
      };
    });

  const tiles = [
    { key: "moving", label: "Moving", value: counts.moving },
    { key: "stopped", label: "Stopped", value: counts.stopped },
    { key: "not_reporting", label: "Not reporting", value: counts.not_reporting },
    { key: "off_duty", label: "Duty ended", value: counts.off_duty },
    ...(isToday ? [{ key: "not_started", label: "Not started", value: counts.not_started }] : []),
  ];

  return (
    <Panel label="The whole team">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.02em] text-[var(--g-ink)]">
          <Users size={17} className="text-[var(--g-ink-3)]" /> Everybody, last known position
        </h2>
        <p className="text-xs text-[var(--g-ink-3)]">Click a pin or a name to open that person&apos;s day.</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((t) => {
          const meta = STATE[t.key];
          return (
            <div
              key={t.key}
              className="rounded-[10px] px-3 py-2"
              style={{ background: `color-mix(in srgb, ${TONE_VAR[meta.tone]} 9%, transparent)` }}
            >
              <p data-figure className="text-[20px] leading-none tabular-nums" style={{ color: TONE_VAR[meta.tone] }}>
                {loading ? "–" : t.value}
              </p>
              <p className="mt-1 text-[11px] text-[var(--g-ink-3)]">{t.label}</p>
            </div>
          );
        })}
      </div>

      <TrackMap
        height={460}
        people={people}
        onPick={onPick}
        emptyMessage={loading ? "Loading…" : "Nobody has reported a position on this day."}
      />
      <MapKey team />
    </Panel>
  );
}

/* ── One person's day ──────────────────────────────────────────────── */

function PersonDay({
  row, detail, loading, error, itinerary, day, isToday, canClear,
  confirmClear, setConfirmClear, clearing, clearError, onClear, onBack,
}) {
  const timeline = detail?.timeline || [];
  const legs = detail?.legs || [];
  const now = detail?.now || null;
  const stayList = timeline.filter((e) => e.kind === "stay");
  const name = row?.name || detail?.employeeName || "This person";

  // The pins, numbered to match the list.
  const stays = stayList.map((s, i) => ({
    lat: s.lat,
    lng: s.lng,
    n: i + 1,
    ongoing: s.ongoing,
    title: `${i + 1}. ${s.ongoing ? "Here now" : "Stayed"} — ${placeOf(s) || "unnamed spot"}, ${clock(s.arrivedAt)}${s.ongoing ? "" : `–${clock(s.leftAt)}`} (${minutes(s.minutes)})`,
  }));
  const visits = timeline
    .filter((e) => e.kind === "visit")
    .map((v) => ({ lat: v.lat, lng: v.lng, title: `Visit — ${v.label || "recorded"} · ${clock(v.arrivedAt)}` }));
  const showCurrent = isToday && now && ["moving", "stopped"].includes(now.state) && detail?.lastLat != null;
  const current = showCurrent
    ? { lat: detail.lastLat, lng: detail.lastLng, title: `${name} — ${statusLine({ ...row, ...now, stoppedMinutes: now.minutes })}` }
    : null;

  const meta = STATE[row?.state] || STATE[now?.state] || STATE.idle;

  return (
    <Panel label="The day's route">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--g-ink-3)] transition-colors hover:text-[var(--g-ink)]"
      >
        <ArrowLeft size={13} /> Whole team
      </button>

      {/* Who, and what they are doing now */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[19px] font-medium tracking-[-0.02em] text-[var(--g-ink)]">{name}</h2>
            <StageChip tone={meta.tone}>{meta.word}</StageChip>
            {row?.inactive && <StageChip tone="brick">left the company</StageChip>}
          </div>
          {row && (
            <p className="mt-1 text-[13px]" style={{ color: TONE_VAR[meta.tone] }}>
              {statusLine(row)}
              {row.state === "stopped" && row.since ? ` (since ${clock(row.since)})` : ""}
            </p>
          )}
          <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
            {[
              row?.place && row.place !== placeOf(row) ? row.place : "",
              row?.district,
              detail?.dutyStartedAt
                ? detail.dutyOn
                  ? `on duty since ${clock(detail.dutyStartedAt)}`
                  : `duty ${clock(detail.dutyStartedAt)}–${clock(detail.dutyEndedAt)}`
                : "",
              row?.battery != null ? `battery ${row.battery}%` : "",
              row?.lastSeenAt ? `last fix ${ago(row.lastSeenAt)}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canClear && detail && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--g-line)] px-2 py-1 text-[11px] text-[var(--g-ink-3)] transition-colors hover:border-[var(--g-danger)] hover:text-[var(--g-danger)]"
            title="Delete this person's recorded positions"
          >
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {/* The confirmation. Two scopes, both spelled out — "clear" is the kind of
          word people click before reading, so each button says which it is. */}
      {confirmClear && (
        <div className="mb-3 rounded-lg border border-[var(--g-danger)] bg-[var(--g-surface-2)] p-3">
          <p className="text-[13px] text-[var(--g-ink)]">
            Delete the recorded positions for <strong>{name}</strong>? This cannot be undone. Forms they
            filled are kept — only the movement trail is removed.
          </p>
          {clearError && <p className="mt-2 text-xs text-[var(--g-danger)]">{clearError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" tone="destructive" disabled={clearing} onClick={() => onClear({ day })}>
              {clearing ? "Clearing…" : `Clear ${day}`}
            </Button>
            <Button size="sm" tone="destructive" disabled={clearing} onClick={() => onClear({ all: true })}>
              Clear every day
            </Button>
            <Button size="sm" tone="ghost" disabled={clearing} onClick={() => setConfirmClear(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorNote error={error} />
      ) : loading ? (
        <SkeletonRows rows={5} />
      ) : !detail ? (
        <EmptyState
          title="Nothing recorded on this day"
          body={isToday ? "The day appears once they start duty in the app." : "Pick another day."}
        />
      ) : (
        <>
          {/* The day's figures */}
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              ["Distance", `${detail.distanceKm} km`],
              ["Moving", minutes(detail.movingMinutes)],
              ["Still", minutes(detail.idleMinutes)],
              ["Stops", stayList.length],
              ["Visits", detail.submissions || 0],
              ["New customers", detail.leadsCreated || 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[10px] bg-[var(--g-surface-2)] px-3 py-2">
                <p data-figure className="text-[16px] leading-none tabular-nums text-[var(--g-ink)]">{value}</p>
                <p className="mt-1 text-[11px] text-[var(--g-ink-3)]">{label}</p>
              </div>
            ))}
          </div>

          <RouteInWords itinerary={itinerary.data?.data} loading={itinerary.loading && !itinerary.data} error={itinerary.error} />

          <TrackMap
            height={420}
            path={detail.path || []}
            stays={stays}
            visits={visits}
            current={current}
            emptyMessage="No positions were recorded for this person on this day."
          />
          <MapKey />

          {/* The day as a list of places */}
          <div className="mt-4 border-t border-[var(--g-line)] pt-3">
            <p className="mb-2 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
              Stops and visits ({stayList.length} stop{stayList.length === 1 ? "" : "s"})
            </p>
            {timeline.length === 0 ? (
              <p className="text-sm text-[var(--g-ink-3)]">
                No stops yet. A stop is recorded when somebody stays within about sixty metres for five minutes or more.
              </p>
            ) : (
              <DayList timeline={timeline} legs={legs} />
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

/** Every stay numbered, the visits inside it, and the drive between stays. */
function DayList({ timeline, legs }) {
  const rows = timeline.filter((e) => e.kind === "stay" || !e.insideStay);
  let stayIndex = -1;
  return (
    <ol className="relative">
      {rows.map((e, i) => {
        const last = i === rows.length - 1;
        if (e.kind === "stay") {
          stayIndex += 1;
          const n = stayIndex;
          const leg = n > 0 ? legs.find((l) => l.toIndex === n) : null;
          const where = placeOf(e);
          // The road from "Katol Road, Kalmeshwar" — the village is already
          // the headline, and saying it twice is noise.
          const suffix = e.locality ? `, ${e.locality}` : "";
          const road = suffix && (e.place || "").endsWith(suffix) ? e.place.slice(0, -suffix.length) : e.place || "";
          const detailLine = [road && road !== where ? road : "", e.district].filter(Boolean).join(" · ");
          return (
            <li key={`s${i}`}>
              {leg && (
                <div className="flex items-center gap-3 py-1 pl-[9px]">
                  <span aria-hidden className="h-5 w-[2px] bg-[var(--g-line)]" />
                  <span className="text-[11px] tabular-nums text-[var(--g-ink-3)]">
                    {leg.km} km · {minutes(leg.minutes)}{leg.avgKmh != null ? ` · avg ${leg.avgKmh} km/h` : ""}
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="flex flex-col items-center">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--g-surface)]"
                    style={{ background: e.ongoing ? "var(--g-water)" : "var(--g-brand)" }}
                  >
                    {n + 1}
                  </span>
                  {!last && <span aria-hidden className="mt-1 w-[2px] flex-1 bg-[var(--g-line)]" />}
                </span>
                <div className={`min-w-0 flex-1 ${last ? "" : "pb-3"}`}>
                  <p className="text-[13.5px] text-[var(--g-ink)]">
                    {e.ongoing ? "Here now — " : "Stayed in "}
                    <strong className="font-medium">{where || "an unnamed spot"}</strong>
                    <span className="text-[var(--g-ink-3)]">
                      {" "}
                      {e.ongoing
                        ? `since ${clock(e.arrivedAt)} · ${minutes(e.minutes)} so far`
                        : `${clock(e.arrivedAt)}–${clock(e.leftAt)} (${minutes(e.minutes)})`}
                    </span>
                  </p>
                  {detailLine ? (
                    <p className="text-[11.5px] text-[var(--g-ink-3)]">
                      {detailLine}
                      {" · "}
                      <a
                        href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-[var(--g-ink)]"
                      >
                        <MapPin size={10} /> open
                      </a>
                    </p>
                  ) : null}
                  {(e.visits || []).map((v, j) => (
                    <p key={j} className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--g-ink-2)]">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--g-harvest)]" />
                      Recorded {v.label || "a visit"}
                    </p>
                  ))}
                </div>
              </div>
            </li>
          );
        }
        return (
          <li key={`v${i}`} className="flex gap-3">
            <span className="flex w-5 flex-col items-center">
              <span aria-hidden className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--g-harvest)]" />
              {!last && <span aria-hidden className="mt-1 w-[2px] flex-1 bg-[var(--g-line)]" />}
            </span>
            <p className={`min-w-0 flex-1 text-[12.5px] text-[var(--g-ink)] ${last ? "" : "pb-3"}`}>
              Visit — {e.label || "recorded"}
              <span className="text-[var(--g-ink-3)]"> · {clock(e.arrivedAt)}{placeOf(e) ? ` · ${placeOf(e)}` : ""}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function MapKey({ team = false }) {
  const Dot = ({ color, text }) => (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-[var(--g-surface)]"
      style={{ background: color }}
    >
      {text}
    </span>
  );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--g-ink-3)]">
      {team ? (
        <>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-water)" /> moving</span>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-brand)" /> stopped</span>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-harvest)" /> not reporting</span>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-ink-3)" /> duty ended</span>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-brand)" text="1" /> stops, in order</span>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-harvest)" /> visits</span>
          <span className="inline-flex items-center gap-1.5"><Dot color="var(--g-water)" /> here now</span>
        </>
      )}
    </div>
  );
}
