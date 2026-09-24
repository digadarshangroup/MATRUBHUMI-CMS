"use client";

// components/sales/RouteInWords.js
//
// The day's travel, read rather than looked at.
//
// WHY THIS SITS ABOVE THE MAP AND NOT BESIDE IT
// ---------------------------------------------
// A drawn route is a shape. Recognising a shape as "he went out to Kalmeshwar
// and back" takes zooming, panning and local knowledge, and the person at the
// desk is usually asking a much simpler question than the map makes them work
// for. The line of names answers it in one read; the map is then there for the
// follow-up question, which is the order those two things should come in.
//
// The names are produced by the server (services/reverseGeocode.js), spaced by
// DISTANCE TRAVELLED rather than by point count, so twenty kilometres of
// highway gets as many names as twenty kilometres of town.
//
// WHAT IT DOES WHEN NAMES ARE MISSING
// -----------------------------------
// It says so. A geocoder that was rate-limited or unreachable produces a
// shorter chain than the route actually had, and a chain that quietly omits
// half a day is worse than one that admits it — somebody would read "Katol
// Road → Kalmeshwar" and conclude those were the only two places.

import { useState } from "react";
import { MapPin, Clock, Flag, ChevronDown, ChevronUp } from "lucide-react";

function clockOf(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export default function RouteInWords({ itinerary, loading, error }) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="mb-3 h-9 animate-pulse rounded-lg bg-[var(--g-surface-2)]" />
    );
  }

  // A failed naming must not take the route with it — the map below is still
  // the record, and this strip simply stands down.
  if (error || !itinerary) return null;

  const legs = itinerary.legs || [];
  const chain = itinerary.chain || [];
  if (!legs.length) return null;

  const missing = legs.filter((l) => l.unnamed).length;

  return (
    <div className="mb-3 rounded-lg border border-[var(--g-line)] bg-[var(--g-surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--g-brand)]" />

        <span className="min-w-0 flex-1">
          {chain.length > 0 ? (
            <span className="block text-[13px] leading-[1.5] text-[var(--g-ink)]">
              {/* The arrow separators are rendered as their own spans so a long
                  route wraps between places rather than mid-name. */}
              {chain.map((place, i) => (
                <span key={i} className="whitespace-nowrap">
                  {i > 0 && <span className="mx-1.5 text-[var(--g-ink-3)]">→</span>}
                  {place}
                </span>
              ))}
            </span>
          ) : (
            <span className="block text-[13px] text-[var(--g-ink-3)]">
              The places on this route could not be named.
            </span>
          )}

          <span className="mt-0.5 block text-[11px] text-[var(--g-ink-3)] tabular-nums">
            {itinerary.totalKm} km
            {itinerary.stepMetres ? ` · named every ${itinerary.stepMetres / 1000} km` : ""}
            {missing > 0 ? ` · ${missing} point${missing === 1 ? "" : "s"} unnamed` : ""}
          </span>
        </span>

        <span className="mt-0.5 shrink-0 text-[var(--g-ink-3)]">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <ol className="border-t border-[var(--g-line)] px-3 py-2">
          {legs.map((leg, i) => (
            <li key={i} className="flex items-baseline gap-2.5 py-1">
              <span className="w-14 shrink-0 text-[11px] text-[var(--g-ink-3)] tabular-nums">
                {clockOf(leg.at)}
              </span>

              <span
                aria-hidden
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    leg.kind === "stop" ? "var(--g-brand)"
                      : leg.kind === "start" || leg.kind === "end" ? "var(--g-ink-2)"
                        : "var(--g-line-strong)",
                }}
              />

              <span className="min-w-0 flex-1 text-[12.5px] text-[var(--g-ink)]">
                {leg.place || <span className="text-[var(--g-ink-3)]">Unnamed place</span>}
                {/* The village, when the name above is a road or a farmer —
                    "Ramesh Kumar · Kalmeshwar" says where, not only who. */}
                {leg.locality && leg.place && !leg.place.includes(leg.locality) && (
                  <span className="text-[var(--g-ink-2)]"> · {leg.locality}</span>
                )}
                {leg.district && leg.place && !leg.place.includes(leg.district) && (
                  <span className="text-[var(--g-ink-3)]"> · {leg.district}</span>
                )}
              </span>

              <span className="shrink-0 text-[11px] text-[var(--g-ink-3)] tabular-nums">
                {leg.kind === "stop" ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} />
                    {leg.minutes ? `${leg.minutes} min` : "stopped"}
                  </span>
                ) : leg.kind === "start" ? (
                  <span className="inline-flex items-center gap-1"><Flag size={10} /> start</span>
                ) : leg.kind === "end" ? (
                  <span className="inline-flex items-center gap-1"><Flag size={10} /> end</span>
                ) : leg.km != null ? (
                  `${leg.km} km`
                ) : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
