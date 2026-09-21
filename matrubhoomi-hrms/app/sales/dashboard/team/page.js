"use client";

// app/sales/dashboard/team/page.js
//
// Where the field team is, and where they have been.
//
// TWO NUMBERS, ALWAYS TOGETHER
// ----------------------------
// Distance travelled and work recorded are shown side by side on every row, and
// the derived "km per visit" column sits next to them. On its own, distance
// rewards driving; on its own, visits reward staying in one village. Together
// they describe a day. A screen that showed only the first would quietly turn
// this into a system for measuring petrol.
//
// AND ONE HONEST GAP
// ------------------
// A phone with no signal and a phone switched off look identical from here, so
// the board says "not reporting" and lets a person decide which it is. It never
// says "stopped tracking", because that is an accusation the data cannot
// support.

import { useState } from "react";
import { BatteryLow, RefreshCw, Trash2 } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Input, Segmented, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, ErrorNote, ago, todayKey } from "@/components/sales/kit";
import TrackMap from "@/components/sales/TrackMap";
import RouteInWords from "@/components/sales/RouteInWords";

const LIVE_REFRESH_MS = 45_000;

export default function SalesTeamPage() {
  const [day, setDay] = useState(todayKey());
  const [view, setView] = useState("live");
  const [selected, setSelected] = useState(null);
  // Erasing a trail: a two-step control, because it cannot be undone.
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState(null);

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

  const live = useAsync(() => salesApi.live(day), [day], {
    // Only the live board polls, and only for today: a page open on last
    // Tuesday refetching every 45 seconds is pure waste.
    interval: view === "live" && day === todayKey() ? LIVE_REFRESH_MS : undefined,
  });

  const travel = useAsync(
    () => (view === "travel" ? salesApi.travel(day, day) : Promise.resolve(null)),
    [view, day],
  );

  // Fetched separately from the day itself. Naming places can take seconds when
  // nothing is cached, and the route must be drawn before the words arrive
  // rather than after — so this loads alongside the map, not in front of it.
  const itinerary = useAsync(
    () => (selected ? salesApi.itinerary(selected, day) : Promise.resolve(null)),
    [selected, day],
  );

  const dayDetail = useAsync(
    () => (selected ? salesApi.employeeDay(selected, day) : Promise.resolve(null)),
    [selected, day],
  );

  const rows = live.data?.data || [];
  const travelRows = travel.data?.data || [];
  const detail = dayDetail.data?.data;
  const selectedRow = rows.find((r) => r.employeeId === selected);

  const reporting = rows.filter((r) => r.reporting).length;

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
                ? `${reporting} of ${rows.length} reporting · ${rows.reduce((s, r) => s + r.distanceKm, 0).toFixed(1)} km covered`
                : "Nobody has reported a position on this day."
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
              <Button size="sm" onClick={() => live.reload({ quiet: true })} aria-label="Refresh">
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
            <Panel label="The day's route">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-medium tracking-[-0.02em] text-[var(--g-ink)]">
                  {selectedRow ? selectedRow.name : "Pick somebody"}
                </h2>
                <div className="flex items-center gap-3">
                  {detail && (
                    <p className="text-xs text-[var(--g-ink-3)] tabular-nums">
                      {detail.distanceKm} km · {detail.movingMinutes} min moving · {detail.idleMinutes} min still
                      {detail.submissions ? ` · ${detail.submissions} recorded` : ""}
                    </p>
                  )}
                  {selected && detail && (
                    <button
                      type="button"
                      onClick={() => { setConfirmClear(true); setClearError(null); }}
                      className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--g-line)] px-2 py-1 text-[11px] text-[var(--g-ink-3)] transition-colors hover:border-[var(--g-danger)] hover:text-[var(--g-danger)]"
                      title="Delete this person's recorded positions"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  )}
                </div>
              </div>

              {/* The confirmation. Two scopes, both spelled out — "clear" is the
                  kind of word people click before reading, so the button itself
                  says which one it is rather than relying on a checked option. */}
              {confirmClear && selectedRow && (
                <div className="mb-3 rounded-lg border border-[var(--g-danger)] bg-[var(--g-surface-2)] p-3">
                  <p className="text-[13px] text-[var(--g-ink)]">
                    Delete the recorded positions for <strong>{selectedRow.name}</strong>? This cannot be undone.
                    Forms they filled are kept — only the movement trail is removed.
                  </p>
                  {clearError && <p className="mt-2 text-xs text-[var(--g-danger)]">{clearError}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" tone="destructive" disabled={clearing} onClick={() => clearTracking({ day })}>
                      {clearing ? "Clearing…" : `Clear ${day}`}
                    </Button>
                    <Button size="sm" tone="destructive" disabled={clearing} onClick={() => clearTracking({ all: true })}>
                      Clear every day
                    </Button>
                    <Button size="sm" tone="ghost" disabled={clearing} onClick={() => setConfirmClear(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              )}

              <RouteInWords
                itinerary={itinerary.data?.data}
                loading={itinerary.loading}
                error={itinerary.error}
              />

              <TrackMap
                height={420}
                path={detail?.path || []}
                stops={detail?.stops || []}
                markers={
                  selectedRow?.lat != null && !detail?.path?.length
                    ? [{ lat: selectedRow.lat, lng: selectedRow.lng, label: selectedRow.name }]
                    : []
                }
                emptyMessage={
                  selected
                    ? "No positions were recorded for this person on this day."
                    : "Choose somebody from the list to draw their route."
                }
              />

              {detail?.stops?.length > 0 && (
                <div className="mt-3 border-t border-[var(--g-line)] pt-3">
                  <p className="mb-2 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                    Stops ({detail.stops.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {detail.stops.slice(0, 12).map((s, i) => (
                      <a
                        key={i}
                        href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-[var(--g-surface-2)] px-2.5 py-1 text-[11px] text-[var(--g-ink-2)] transition-colors hover:bg-[var(--g-line)]"
                      >
                        {s.label || "Stopped"}
                        {s.minutes ? ` · ${s.minutes} min` : ""}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel padded={false} label="Who is out">
              {live.error ? (
                <div className="p-5"><ErrorNote error={live.error} onRetry={live.reload} /></div>
              ) : live.loading ? (
                <div className="p-5"><SkeletonRows rows={6} /></div>
              ) : rows.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No positions on this day"
                    body="Positions arrive from the field app while somebody is on duty."
                  />
                </div>
              ) : (
                <div className="divide-y divide-[var(--g-line)]">
                  {rows.map((r) => (
                    <button
                      key={r.employeeId}
                      type="button"
                      onClick={() => { setSelected(r.employeeId); setConfirmClear(false); }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--g-surface-2)]"
                      style={{ background: selected === r.employeeId ? "var(--g-brand-wash)" : undefined }}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: r.reporting ? "var(--g-brand)" : "var(--g-line-strong)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-[var(--g-ink)]">{r.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--g-ink-3)]">
                          {r.reporting ? `seen ${ago(r.lastSeenAt)}` : "not reporting"}
                          {r.openTasks ? ` · ${r.openTasks} open` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span data-figure className="block text-sm tabular-nums text-[var(--g-ink)]">
                          {r.distanceKm} km
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-[var(--g-ink-3)]">
                          {r.submissions} recorded
                        </span>
                      </span>
                      {r.battery !== null && r.battery < 20 && (
                        <BatteryLow size={15} className="shrink-0 text-[var(--g-danger)]" aria-label="Low battery" />
                      )}
                    </button>
                  ))}
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
          inventing travel.
        </p>
      </div>
    </SalesDashboardLayout>
  );
}
