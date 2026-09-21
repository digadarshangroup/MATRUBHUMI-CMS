// components/sales/TrackMap.js
//
// A real map — streets or satellite — with no mapping library.
//
// WHY NOT LEAFLET
// ---------------
// What this screen needs is a background with roads on it, a line, and some
// pins. Leaflet or MapLibre is 40–140KB of JavaScript, a second stylesheet, an
// SSR shim for a library that touches `window` at import time, and a dependency
// somebody has to keep current — to draw a polyline.
//
// Web mercator is nine lines of arithmetic and tile servers take a plain
// {z}/{x}/{y} URL, so the background is a grid of <img> elements and the line is
// one <svg> on top. No dependency, nothing to hydrate, identical on the server
// and the client.
//
// THE TILE PROVIDERS, AND WHY THESE TWO
// -------------------------------------
// This started on OpenStreetMap's own tile server. That server runs on donated
// capacity for the project's own use, has no CDN in front of it for most of the
// world, rate-limits, and looks it. It is a courtesy, not a service.
//
//   STREETS   Carto Voyager — the same OSM data, rendered by Carto, served from
//             a real CDN, at @2x.
//   SATELLITE Esri World Imagery — keyless, global, and in India sharper than
//             anything else available without a contract. A desk recognises a
//             farm from the air long before it recognises a street name.
//
// Both REQUIRE their attribution, drawn in the corner for whichever is showing.
// NEXT_PUBLIC_MAP_TILE_URL still overrides the street layer for a private
// provider; set it to an empty string to drop tiles entirely and keep the line
// on a ruled ground.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Minus, Plus, Crosshair } from "lucide-react";

const LAYERS = {
  streets: {
    label: "Map",
    url:
      process.env.NEXT_PUBLIC_MAP_TILE_URL ??
      "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
    maxZoom: 20,
    attribution: "© OpenStreetMap © CARTO",
  },
  satellite: {
    label: "Satellite",
    // {y}/{x} ORDER — Esri's REST tile service is row/column, not column/row
    // like every XYZ server. Swapping them returns tiles from the wrong place
    // rather than an error, which is a confusing hour to debug.
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    // WHY THE SATELLITE VIEW IS TWO LAYERS
    // ------------------------------------
    // Esri's imagery is PHOTOGRAPHY — there is nothing written on it. No
    // country, no state, no city, no road name. A route drawn on it is a line
    // across a green field, and whoever is reading it cannot say where it is
    // without recognising the rooftops.
    //
    // Every satellite map anybody has used is really two layers, and this is
    // the second: a transparent sheet of labels over the top. Carto's is used
    // because it is the same cartography as the Map layer, it is retina, and it
    // reaches zoom 20 — so the names never run out before the imagery does.
    overlays: [
      {
        url: "https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png",
        maxZoom: 20,
      },
    ],
    maxZoom: 19,
    attribution: "Esri, Maxar · labels © OpenStreetMap © CARTO",
  },
};

const TILE_SIZE = 256;
const MIN_ZOOM = 2;

/* ── Web mercator ──────────────────────────────────────────────────── */

const lngToX = (lng, z) => ((lng + 180) / 360) * Math.pow(2, z) * TILE_SIZE;
const latToY = (lat, z) => {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z) * TILE_SIZE;
};
const xToLng = (x, z) => (x / (TILE_SIZE * Math.pow(2, z))) * 360 - 180;
const yToLat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

function metresPerPixel(lat, z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}

export default function TrackMap({
  path = [],
  stops = [],
  markers = [],
  height = 380,
  emptyMessage = "Nothing was recorded for this day.",
}) {
  const boxRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height });
  const [tilesFailed, setTilesFailed] = useState(false);
  const [layerKey, setLayerKey] = useState("streets");
  const layer = LAYERS[layerKey];

  // The user's own pan and zoom, or null while auto-fitting.
  //
  // Null is the meaningful state: it means nobody has touched this, so the fit
  // is free to re-run as the day's path grows. The moment somebody drags, the
  // view is theirs and the fit stops fighting them.
  const [view, setView] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(
    () => path.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)),
    [path],
  );

  const allPoints = useMemo(
    () => [...points, ...stops, ...markers].filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)),
    [points, stops, markers],
  );

  // A new subject is a new map. Without this, opening a second employee's day
  // keeps the first one's pan and looks like the map failed to load — the route
  // is simply three districts off screen.
  const subjectKey = allPoints.length
    ? `${allPoints[0].lat.toFixed(4)},${allPoints[0].lng.toFixed(4)},${allPoints.length}`
    : "empty";
  const lastSubject = useRef(subjectKey);
  useEffect(() => {
    if (lastSubject.current !== subjectKey) {
      lastSubject.current = subjectKey;
      setView(null);
    }
  }, [subjectKey]);

  /** The fitted view — used until the user moves the map. */
  const fitted = useMemo(() => {
    if (!allPoints.length || !size.width) return null;

    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    let north = Math.max(...lats), south = Math.min(...lats);
    let east = Math.max(...lngs), west = Math.min(...lngs);
    if (north === south) { north += 0.0015; south -= 0.0015; }
    if (east === west) { east += 0.0015; west -= 0.0015; }

    let zoom = MIN_ZOOM;
    for (let z = layer.maxZoom; z >= MIN_ZOOM; z -= 0.5) {
      const w = lngToX(east, z) - lngToX(west, z);
      const h = latToY(south, z) - latToY(north, z);
      if (w <= size.width * 0.85 && h <= size.height * 0.85) { zoom = z; break; }
    }
    return {
      zoom: allPoints.length === 1 ? 17 : zoom,
      centre: { lat: (north + south) / 2, lng: (east + west) / 2 },
    };
  }, [allPoints, size, layer.maxZoom]);

  const active = view ?? fitted;

  /** Projection for this render, plus its inverse. */
  const frame = useMemo(() => {
    if (!active || !size.width) return null;

    const z = Math.min(active.zoom, layer.maxZoom);
    const centreX = lngToX(active.centre.lng, z);
    const centreY = latToY(active.centre.lat, z);
    const originX = centreX - size.width / 2;
    const originY = centreY - size.height / 2;

    const project = (p) => ({ x: lngToX(p.lng, z) - originX, y: latToY(p.lat, z) - originY });
    const unproject = (x, y) => ({ lng: xToLng(x + originX, z), lat: yToLat(y + originY, z) });

    // Tiles are drawn at the INTEGER zoom below the current one and scaled up
    // by the fraction, so a half-step zoom is smooth instead of jumping.
    const zi = Math.max(MIN_ZOOM, Math.min(layer.maxZoom, Math.floor(z)));
    const fraction = Math.pow(2, z - zi);
    const tileOriginX = originX / fraction;
    const tileOriginY = originY / fraction;

    const tiles = [];
    if (layer.url && !tilesFailed) {
      const max = Math.pow(2, zi);
      const x0 = Math.floor(tileOriginX / TILE_SIZE);
      const y0 = Math.floor(tileOriginY / TILE_SIZE);
      const x1 = Math.floor((tileOriginX + size.width / fraction) / TILE_SIZE);
      const y1 = Math.floor((tileOriginY + size.height / fraction) / TILE_SIZE);
      // Base first, then each transparent sheet over it. The array order is
      // the paint order — labels under the photograph would be invisible.
      const sheets = [{ url: layer.url, maxZoom: layer.maxZoom }, ...(layer.overlays || [])];

      for (const [sheet, source] of sheets.entries()) {
        // A sheet whose own zoom has run out simply stops drawing rather than
        // requesting tiles the service will refuse.
        if (zi > source.maxZoom) continue;

        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            if (y < 0 || y >= max) continue;
            const wrapped = ((x % max) + max) % max;
            tiles.push({
              key: `${layerKey}/${sheet}/${zi}/${wrapped}/${y}`,
              url: source.url.replace("{z}", zi).replace("{x}", wrapped).replace("{y}", y),
              left: (x * TILE_SIZE - tileOriginX) * fraction,
              top: (y * TILE_SIZE - tileOriginY) * fraction,
              size: TILE_SIZE * fraction,
            });
          }
        }
      }
    }

    return { z, project, unproject, tiles, centre: active.centre };
  }, [active, size, tilesFailed, layer, layerKey]);

  /* ── Pan and zoom ─────────────────────────────────────────────── */

  /**
   * Move and scale so that whatever is under `anchor` stays under `anchor`.
   *
   * This is the whole of "pan and zoom feeling right". Zooming about the CENTRE
   * makes reaching a corner an alternating sequence of zooms and drags, and it
   * is why this felt broken before.
   */
  function applyView(anchorX, anchorY, deltaZoom) {
    if (!frame) return;
    const newZoom = Math.max(MIN_ZOOM, Math.min(layer.maxZoom, frame.z + deltaZoom));
    if (newZoom === frame.z) return;

    const under = frame.unproject(anchorX, anchorY);
    const newCentreX = lngToX(under.lng, newZoom) - (anchorX - size.width / 2);
    const newCentreY = latToY(under.lat, newZoom) - (anchorY - size.height / 2);

    setView({
      zoom: newZoom,
      centre: { lng: xToLng(newCentreX, newZoom), lat: yToLat(newCentreY, newZoom) },
    });
  }

  function onPointerDown(e) {
    if (!frame) return;

    // A press that starts on a CONTROL is not a pan.
    //
    // This is why the zoom, layer and fit buttons did nothing: the container
    // called setPointerCapture on pointerdown, which redirects every later
    // pointer event — including the pointerup — to the container. The button
    // never saw the release, so no click was ever synthesised. The buttons were
    // fine; the map was quietly stealing their events.
    if (e.target.closest("button")) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, centre: frame.centre, zoom: frame.z };
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    // Recomputed from the ORIGIN of the drag every time, not accumulated from
    // the previous move. Accumulating drifts, because each step re-projects
    // through a latitude that has itself moved.
    const z = drag.zoom;
    const cx = lngToX(drag.centre.lng, z) - dx;
    const cy = latToY(drag.centre.lat, z) - dy;
    setView({ zoom: z, centre: { lng: xToLng(cx, z), lat: yToLat(cy, z) } });
  }

  function onPointerUp(e) {
    if (dragRef.current) e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }

  function onWheel(e) {
    if (!frame) return;
    if (e.target.closest("button")) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    // Half a level per notch: a whole level per notch overshoots so far that
    // finding the right scale becomes a hunt.
    applyView(e.clientX - box.left, e.clientY - box.top, e.deltaY < 0 ? 0.5 : -0.5);
  }

  function onDoubleClick(e) {
    const box = e.currentTarget.getBoundingClientRect();
    applyView(e.clientX - box.left, e.clientY - box.top, 1);
  }

  function zoomButton(delta) {
    applyView(size.width / 2, size.height / 2, delta);
  }

  const polyline = useMemo(() => {
    if (!frame || points.length < 2) return "";
    return points.map((p) => { const { x, y } = frame.project(p); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  }, [frame, points]);

  const scale = useMemo(() => {
    if (!frame) return null;
    const mpp = metresPerPixel(frame.centre.lat, frame.z);
    const metres = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
      .find((m) => m / mpp > 55 && m / mpp < 165) || 100;
    return { metres, px: Math.round(metres / mpp) };
  }, [frame]);

  const satellite = layerKey === "satellite";
  const controlClass =
    "flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--g-surface)]/95 text-[var(--g-ink-2)] shadow-[var(--g-shadow)] transition-colors hover:bg-[var(--g-surface-2)]";

  return (
    <div
      ref={boxRef}
      className="relative touch-none overflow-hidden rounded-[12px] border border-[var(--g-line)] bg-[var(--g-surface-2)] select-none"
      style={{ height, cursor: dragRef.current ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {/* Ruled ground. Always painted — it shows through where a tile has not
          arrived, and it is the whole background when there are none. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--g-line) 1px, transparent 1px), linear-gradient(90deg, var(--g-line) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.5,
        }}
      />

      {frame?.tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          aria-hidden
          draggable={false}
          loading="lazy"
          onError={() => setTilesFailed(true)}
          className="pointer-events-none absolute select-none"
          style={{ left: tile.left, top: tile.top, width: tile.size, height: tile.size }}
        />
      ))}

      {frame && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" role="img" aria-label="Route travelled">
          {polyline && (
            <>
              {/* On satellite the casing has to be dark — a white line over a
                  bright field disappears. */}
              <polyline
                points={polyline}
                fill="none"
                stroke={satellite ? "#000000" : "#ffffff"}
                strokeOpacity={satellite ? 0.55 : 0.85}
                strokeWidth="7"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={polyline}
                fill="none"
                stroke="var(--g-brand)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {stops.map((stop, i) => {
            const { x, y } = frame.project(stop);
            return (
              <g key={`stop-${i}`}>
                <circle cx={x} cy={y} r="7" fill="#ffffff" fillOpacity="0.92" />
                <circle cx={x} cy={y} r="4.5" fill="var(--g-water)" />
                {stop.minutes >= 5 && <title>{`${stop.label || "Stopped"} — ${stop.minutes} min`}</title>}
              </g>
            );
          })}

          {markers.map((m, i) => {
            const { x, y } = frame.project(m);
            return (
              <g key={`marker-${i}`}>
                <circle cx={x} cy={y} r="9" fill="var(--g-brand)" fillOpacity="0.18" />
                <circle cx={x} cy={y} r="5" fill="var(--g-brand)" stroke="#ffffff" strokeWidth="2" />
                <title>{m.label || "Here"}</title>
              </g>
            );
          })}

          {points.length > 1 && (
            <>
              <circle
                cx={frame.project(points[0]).x}
                cy={frame.project(points[0]).y}
                r="5"
                fill="#ffffff"
                stroke="var(--g-ink-3)"
                strokeWidth="2"
              />
              <circle
                cx={frame.project(points[points.length - 1]).x}
                cy={frame.project(points[points.length - 1]).y}
                r="6"
                fill="var(--g-brand)"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
            </>
          )}
        </svg>
      )}

      {!allPoints.length && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[var(--g-ink-3)]">
          {emptyMessage}
        </p>
      )}

      {/* ── Controls ─────────────────────────────────────────────── */}

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => {
            setLayerKey(satellite ? "streets" : "satellite");
            setTilesFailed(false);
          }}
          className={controlClass}
          title={satellite ? "Switch to map" : "Switch to satellite"}
        >
          <Layers size={15} />
        </button>
        <button type="button" onClick={() => zoomButton(1)} className={controlClass} title="Zoom in">
          <Plus size={15} />
        </button>
        <button type="button" onClick={() => zoomButton(-1)} className={controlClass} title="Zoom out">
          <Minus size={15} />
        </button>
        {view && (
          <button type="button" onClick={() => setView(null)} className={controlClass} title="Fit to route">
            <Crosshair size={15} />
          </button>
        )}
      </div>

      <span className="pointer-events-none absolute top-2 left-2 rounded-[6px] bg-[var(--g-surface)]/90 px-2 py-1 text-[10px] font-medium text-[var(--g-ink-2)]">
        {layer.label}
      </span>

      {scale && allPoints.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-[6px] bg-[var(--g-surface)]/90 px-2 py-1 text-[10px] text-[var(--g-ink-2)]">
          <span className="block h-[3px] bg-[var(--g-ink-2)]" style={{ width: Math.max(scale.px, 36) }} />
          <span className="tabular-nums">
            {scale.metres >= 1000 ? `${scale.metres / 1000} km` : `${scale.metres} m`}
          </span>
        </div>
      )}

      {layer.url && tilesFailed && (
        <p className="absolute bottom-9 left-2 rounded-[6px] bg-[var(--g-hint-wash)] px-2 py-1 text-[10px] text-[var(--g-hint)]">
          Map tiles unavailable — showing the route only
        </p>
      )}

      {/* Required by both providers' terms. */}
      {layer.url && !tilesFailed && (
        <p className="pointer-events-none absolute right-1 bottom-1 rounded-[4px] bg-[var(--g-surface)]/85 px-1.5 py-0.5 text-[9px] text-[var(--g-ink-3)]">
          {layer.attribution}
        </p>
      )}
    </div>
  );
}
