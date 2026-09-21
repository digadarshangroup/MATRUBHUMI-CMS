// services/reverseGeocode.js
//
// Turning a coordinate into a place a person recognises.
//
// WHY THIS EXISTS
// ---------------
// A drawn route answers "where did they go" only for somebody willing to study
// a map. The question actually being asked at the desk is "did Ramesh go to
// Katol or to Kalmeshwar", and that is a sentence, not a shape. This turns a
// handful of points along a day's travel into road and locality names so the
// route can be READ before it is looked at.
//
// THREE RULES, AND EVERY ONE OF THEM IS LOAD-BEARING
// --------------------------------------------------
//  1. NEVER THROWS. A name is a nicety; the route, the distance and the stops
//     are the record. A geocoder that is down, rate-limited or slow must
//     degrade to "no name" and leave every other figure on the screen intact.
//  2. CACHE FIRST, ALWAYS (see models/Sales_Models/GeoPlace.js). Misses are the
//     only requests that ever leave this building.
//  3. ONE REQUEST AT A TIME, SPACED. Nominatim's usage policy is one request a
//     second from an identified client, and it is enforced by blocking. The
//     queue below is not politeness — it is the difference between a working
//     feature and an IP ban for the whole company.
//
// SWAPPING PROVIDERS
// ------------------
// `GEOCODE_PROVIDER` selects the implementation. Nominatim is the default
// because it needs no key and no billing account, which is what makes this
// deployable today. It is explicitly NOT suitable for heavy use: if this ever
// serves more than a few hundred lookups a day, move to a paid provider by
// adding a branch in `lookup()` — the cache, the queue and every caller stay
// exactly as they are.

"use strict";

const GeoPlace = require("../models/Sales_Models/GeoPlace");

const PROVIDER = process.env.GEOCODE_PROVIDER || "nominatim";
const ENDPOINT = process.env.GEOCODE_URL || "https://nominatim.openstreetmap.org/reverse";
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 6000);
const MIN_GAP_MS = Number(process.env.GEOCODE_MIN_GAP_MS || 1100);

// Nominatim REFUSES requests without a User-Agent identifying the application
// and a way to reach whoever runs it. A generic agent is treated as abuse.
const CONTACT = process.env.GEOCODE_CONTACT || "it@matrubhoomifarms.in";
const USER_AGENT = `MatrubhoomiWorkforce/1.0 (${CONTACT})`;

/** Three decimals ≈ 110 m — see the model for why that is the right grain. */
function cacheKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/* ── The queue ────────────────────────────────────────────────────── */

// A promise chain, not a worker pool: each lookup waits for the previous one to
// finish AND for the minimum gap to pass. Serial by construction, so there is
// no counter to get wrong and no way for a burst to slip through.
let chain = Promise.resolve();
let lastCallAt = 0;

function queued(work) {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return work();
  });
  // The chain must not break on a failure, or one bad lookup stalls every
  // lookup after it for the lifetime of the process.
  chain = run.catch(() => {});
  return run;
}

/* ── The provider ─────────────────────────────────────────────────── */

/**
 * Ask the provider. Returns the parsed parts, or null for anything at all that
 * goes wrong — a timeout, a 429, a body that is not JSON, a point at sea.
 */
async function lookup(lat, lng) {
  if (PROVIDER === "none") return null;

  const url =
    `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}` +
    // zoom=16 is street level. Lower returns a city for a village road; higher
    // returns a house number, which is both wrong here and slower.
    `&zoom=16&addressdetails=1&accept-language=en`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Referer: CONTACT },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const body = await res.json();
    const a = body?.address || {};

    // Indian addresses come back with the useful part under a different key
    // depending on whether it is a city road, a village lane or a highway.
    // Taken in order of how specific each is.
    const road = a.road || a.pedestrian || a.footway || a.residential || a.highway || "";
    const locality =
      a.village || a.suburb || a.neighbourhood || a.town || a.hamlet || a.city_district || a.city || "";
    const district = a.state_district || a.county || "";

    return {
      road: String(road || ""),
      locality: String(locality || ""),
      district: String(district || ""),
      state: String(a.state || ""),
      postcode: String(a.postcode || ""),
      display: String(body?.display_name || ""),
    };
  } catch {
    // Deliberately silent — see rule 1. A failed name is not an incident.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The short line a person reads.
 *
 * "Katol Road, Kalmeshwar" when both are known; whichever one is known when
 * only one is; the district as a last resort. Never a postcode and never a
 * house number — this is answering "whereabouts", not "what address".
 */
function shortName(parts) {
  if (!parts) return "";
  const bits = [parts.road, parts.locality].filter(Boolean);
  if (bits.length) return [...new Set(bits)].join(", ");
  return parts.district || parts.state || "";
}

/* ── What callers use ─────────────────────────────────────────────── */

/**
 * Name one coordinate. Cache first; the provider only on a miss.
 *
 * Returns `{ name, road, locality, district, cached }`, with an empty name
 * when nothing could be established. Never rejects.
 */
async function describe(lat, lng) {
  const empty = { name: "", road: "", locality: "", district: "", cached: false };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return empty;

  const key = cacheKey(lat, lng);

  try {
    const hit = await GeoPlace.findOne({ key }).lean();
    if (hit) {
      return {
        name: hit.name || "",
        road: hit.road || "",
        locality: hit.locality || "",
        district: hit.district || "",
        cached: true,
      };
    }
  } catch {
    // A cache that cannot be read is a slow path, not a broken one.
  }

  const parts = await queued(() => lookup(lat, lng));
  const name = shortName(parts);

  // Written whether or not anything was found — see `found` on the model.
  try {
    await GeoPlace.updateOne(
      { key },
      {
        $set: {
          key, lat, lng, name,
          road: parts?.road || "",
          locality: parts?.locality || "",
          district: parts?.district || "",
          state: parts?.state || "",
          postcode: parts?.postcode || "",
          display: parts?.display || "",
          source: PROVIDER,
          found: Boolean(parts),
          fetchedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch {
    // A duplicate key here means another request named it first, which is fine.
  }

  return {
    name,
    road: parts?.road || "",
    locality: parts?.locality || "",
    district: parts?.district || "",
    cached: false,
  };
}

/**
 * Name several coordinates.
 *
 * Cached points are resolved together and immediately; only the misses go
 * through the queue, so a route down a road the company uses every week names
 * itself with no outside request at all.
 */
async function describeMany(points = []) {
  const out = new Array(points.length).fill(null);
  if (!points.length) return out;

  const keys = points.map((p) => cacheKey(p.lat, p.lng));

  let cached = new Map();
  try {
    const rows = await GeoPlace.find({ key: { $in: [...new Set(keys)] } }).lean();
    cached = new Map(rows.map((r) => [r.key, r]));
  } catch {
    /* fall through to lookups */
  }

  const misses = [];
  points.forEach((p, i) => {
    const hit = cached.get(keys[i]);
    if (hit) {
      out[i] = { name: hit.name || "", road: hit.road || "", locality: hit.locality || "", district: hit.district || "", cached: true };
    } else {
      misses.push(i);
    }
  });

  // A CEILING ON WHAT ONE SCREEN MAY COST. At roughly a second each, twelve
  // misses is already a twelve-second wait; beyond that the caller gets the
  // named points it has and unnamed ones after, which is a slower-improving
  // screen rather than one that hangs. Repeat visits fill the rest from cache.
  const budget = Number(process.env.GEOCODE_MAX_LOOKUPS || 12);

  for (const i of misses.slice(0, budget)) {
    out[i] = await describe(points[i].lat, points[i].lng);
  }
  for (const i of misses.slice(budget)) {
    out[i] = { name: "", road: "", locality: "", district: "", cached: false, skipped: true };
  }

  return out;
}

module.exports = { describe, describeMany, shortName, cacheKey };
