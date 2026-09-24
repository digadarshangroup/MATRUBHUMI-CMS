// services/fieldTracking.js
//
// Turning a stream of GPS fixes into "where the team went and how far" — and,
// now, "where they are, how long they have been there, and what it is called".
//
// THE HARD PART IS NOT STORING THEM, IT IS NOT LYING
// ---------------------------------------------------
// A phone left on a desk reports movement all day. Consumer GPS wanders by
// tens of metres indoors, and summing the raw distance between consecutive
// fixes on a stationary handset produces several kilometres of travel that
// never happened — which is worse than no number at all, because somebody's pay
// or their reputation ends up attached to it.
//
// Three filters, applied in this order, at INGEST:
//
//   1. ACCURACY. A fix worse than ACCURACY_LIMIT metres is stored but does not
//      contribute distance. Discarding it entirely would leave holes in the
//      trail through every building the employee walks into.
//   2. JITTER FLOOR, SCALED BY THE FIX'S OWN ACCURACY. A step has to clearly
//      exceed the uncertainty of the two fixes that produced it —
//      JITTER_FACTOR times the worse of the two. This is the rule that decides
//      whether small movements are counted or invented, so it is worth being
//      precise about what it does:
//
//        good fix outdoors (±4m)  -> floor 10m  : a walk across a yard COUNTS
//        ordinary fix     (±10m)  -> floor 20m  : a walk down a lane counts
//        indoors          (±30m)  -> floor 60m  : pacing a room counts as ZERO
//
//      A flat floor cannot do both. Set low enough to catch a short walk it
//      also accumulated a hundred metres from somebody sitting still in a
//      building; set high enough to ignore that, it threw away real walking.
//      Scaling it by the accuracy the receiver itself reports is what makes
//      both cases right, and it is not a fudge: GPS cannot resolve movement
//      smaller than its own error, so counting it would be inventing precision
//      that was never measured.
//   3. SPEED CEILING. A step implying more than SPEED_LIMIT_KMPH is a fix that
//      teleported — a tower-based fix landing in the next district. Dropped
//      from distance, kept in the record.
//   4. STANDING STILL. A receiver that reports a speed near zero, over a step
//      too small to be sure of, is a phone on a table. Corroborating the step
//      against the reported speed is what stops a handset left charging
//      overnight from "walking" several kilometres.
//
// What survives all three is added to the day's total. It is a conservative
// number by construction: it under-reports rather than inventing travel.
//
// STOPS — WHERE SOMEBODY STAYED, AND FOR HOW LONG
// -----------------------------------------------
// "Stayed in Kalmeshwar for 45 minutes" is the sentence the desk actually
// wants, and it was almost never produced. Stops used to be looked for inside
// ONE BATCH at a time — but the handset posts every two minutes, so no batch
// ever held a forty-minute visit, and a stationary phone sent almost nothing
// anyway (the provider only reports once it has moved).
//
// Two changes fixed it. The app now sends a HEARTBEAT fix every couple of
// minutes while it sits still, so a stay has evidence. And the stay being
// measured is kept on the day's rollup (FieldDay.stay) between batches: each
// batch either extends it or closes it, and a closed stay of STOP_MINUTES or
// more becomes a stop. The open stay is also what the desk shows as
// "stopped at Kalmeshwar since 10:42".
//
// NAMES
// -----
// A stop, the open stay and the latest position are named after the fact
// (services/reverseGeocode.js — cached, rate-limited, never allowed to fail the
// ingest). The desk and the app read the stored name; nothing is looked up
// while a screen waits, except as a budgeted fallback.

"use strict";

const FieldLocationPing = require("../models/Sales_Models/FieldLocationPing");
const FieldDay = require("../models/Sales_Models/FieldDay");

// Lowered from 75m. A ±75m fix is a cell-tower estimate, and two of them in a
// row can differ by 150m without anybody moving — which is exactly the "0.1 km
// while sitting in a room" this produced.
const ACCURACY_LIMIT = Number(process.env.FIELD_ACCURACY_LIMIT_M || 35);
const SPEED_LIMIT_KMPH = Number(process.env.FIELD_SPEED_LIMIT_KMPH || 150);
/** How far past the fix's own uncertainty a step has to reach to be believed. */
const JITTER_FACTOR = Number(process.env.FIELD_JITTER_FACTOR || 2.0);
/** The floor under the floor, for a receiver claiming implausible precision. */
const JITTER_MIN_M = Number(process.env.FIELD_JITTER_MIN_M || 10);
/** Below this, the receiver is telling us the handset is not moving. */
const STILL_SPEED_MS = Number(process.env.FIELD_STILL_SPEED_MS || 0.35);
const STOP_MINUTES = Number(process.env.FIELD_STOP_MINUTES || 5);
const STOP_RADIUS_M = Number(process.env.FIELD_STOP_RADIUS_M || 60);
const PATH_MAX_POINTS = Number(process.env.FIELD_PATH_MAX_POINTS || 600);
const PATH_TOLERANCE_M = Number(process.env.FIELD_PATH_TOLERANCE_M || 15);
/**
 * A fix vaguer than ACCURACY_LIMIT but better than this may still EXTEND a stay
 * it is consistent with — indoors, sitting in a farmer's house, the receiver
 * drops to ±50m and a stay must not end because of it — but it can never start
 * one or end one.
 */
const VAGUE_LIMIT = Number(process.env.FIELD_VAGUE_LIMIT_M || 200);
/** How long a stay must have lasted before the live board calls somebody "stopped". */
const STOPPED_AFTER_MINUTES = Number(process.env.FIELD_STOPPED_AFTER_MINUTES || 2);
const STALE_MINUTES = Number(process.env.FIELD_STALE_MINUTES || 15);
// How far the phone may have moved from the point a place name was looked up
// for, and the name still be said about where it is now.
const PLACE_STILL_TRUE_M = Number(process.env.FIELD_PLACE_RADIUS_M || 1000);

const SOURCES = new Set(["service", "manual", "form", "task", "punch", "boot", "heartbeat"]);
const ACTIVITIES = new Set(["still", "walking", "running", "in_vehicle", "on_bicycle", "unknown"]);

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const R = 6371000; // metres
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle metres between two fixes. */
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Perpendicular distance from `p` to the segment `a`→`b`, in metres. */
function perpendicular(p, a, b) {
  // Flat-earth projection. Over the tens of metres this is used across, the
  // error is far below the GPS noise it is measuring against.
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(rad(a.lat));
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len = bx * bx + by * by;
  if (len === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Douglas–Peucker. Keeps the corners, drops the straight runs.
 *
 * Iterative rather than recursive: a day of fixes is tens of thousands of
 * points and the recursive form blows the stack on the pathological case of a
 * long straight drive.
 */
function simplify(points, tolerance = PATH_TOLERANCE_M) {
  if (points.length < 3) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** The local calendar day a moment falls on, in the company's timezone. */
function dayKey(date, tz = process.env.FIELD_TIMEZONE || "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/* ------------------------------------------------------------------ */
/* Stays                                                               */
/* ------------------------------------------------------------------ */

function openStay(p) {
  return {
    lat: p.lat, lng: p.lng,
    anchorLat: p.lat, anchorLng: p.lng,
    sumLat: p.lat, sumLng: p.lng, n: 1,
    since: p.t, lastAt: p.t,
    place: "", locality: "", district: "", named: false,
  };
}

function stayMinutes(stay) {
  if (!stay?.since || !stay?.lastAt) return 0;
  return (new Date(stay.lastAt) - new Date(stay.since)) / 60000;
}

function stayToStop(stay) {
  return {
    kind: "stay",
    lat: stay.lat,
    lng: stay.lng,
    arrivedAt: stay.since,
    leftAt: stay.lastAt,
    minutes: Math.round(stayMinutes(stay)),
    label: "",
    // A stay that was already named while it was open keeps its name.
    place: stay.place || "",
    locality: stay.locality || "",
    district: stay.district || "",
    named: Boolean(stay.named),
  };
}

/**
 * Run fixes through the stay being measured.
 *
 * @param stay    the open stay carried from earlier batches, or null
 * @param points  this batch's fixes for one day, oldest first, each tagged with
 *                a quality: good (counts), vague (may only extend), bad (ignored)
 * @returns { stay, closed[] } — the stay still open afterwards, and any that
 *          ended long enough to be stops
 */
function advanceStays(stay, points) {
  const closed = [];
  let current = stay ? { ...stay } : null;

  for (const p of points) {
    if (p.q === "bad") continue;
    // A fix older than what the stay already covers is a late straggler from a
    // reordered batch; it cannot move a stay backwards in time.
    if (current && new Date(p.t) < new Date(current.lastAt)) continue;

    if (!current) {
      // Only a GOOD fix may start a stay — a vague one could be anywhere
      // within two hundred metres, which is not a place.
      if (p.q === "good") current = openStay(p);
      continue;
    }

    const centre = { lat: current.lat, lng: current.lng };
    const anchor = { lat: current.anchorLat ?? current.lat, lng: current.anchorLng ?? current.lng };
    const fromCentre = haversine(centre, p);

    if (p.q === "vague") {
      // Consistent with still being here? Then it is evidence of staying,
      // however vague. It never moves the centre and never ends the stay.
      if (fromCentre <= STOP_RADIUS_M + (p.acc || 0)) current.lastAt = p.t;
      continue;
    }

    const inside = fromCentre <= STOP_RADIUS_M && haversine(anchor, p) <= STOP_RADIUS_M * 1.5;
    if (inside) {
      current.sumLat = (current.sumLat ?? current.lat) + p.lat;
      current.sumLng = (current.sumLng ?? current.lng) + p.lng;
      current.n = (current.n || 1) + 1;
      current.lat = current.sumLat / current.n;
      current.lng = current.sumLng / current.n;
      current.lastAt = p.t;
      continue;
    }

    // Left. Whatever happened between the stay's last fix and this one is not
    // known, so the stay ends where the evidence ends: at its last fix.
    if (stayMinutes(current) >= STOP_MINUTES) closed.push(stayToStop(current));
    current = openStay(p);
  }

  return { stay: current, closed };
}

/** Which of the two kinds a stops[] row is — see the note on FieldDay's stopSchema. */
function kindOf(stop) {
  if (stop?.kind) return stop.kind;
  return stop?.leadId ? "visit" : "stay";
}

/**
 * Append newly closed stays, merging a stay into the previous one when they
 * are the same place with only a brief blip between — a GPS jump out of the
 * radius and back should not turn one visit into two.
 */
function appendStays(existing = [], incoming = []) {
  const out = existing.map((s) => ({ ...(s.toObject ? s.toObject() : s) }));
  for (const stop of incoming) {
    let prev = null;
    for (let i = out.length - 1; i >= 0; i--) {
      if (kindOf(out[i]) === "stay") { prev = out[i]; break; }
    }
    const gapMin = prev ? (new Date(stop.arrivedAt) - new Date(prev.leftAt || prev.arrivedAt)) / 60000 : Infinity;
    if (prev && haversine(prev, stop) <= STOP_RADIUS_M && gapMin <= STOP_MINUTES) {
      prev.leftAt = stop.leftAt;
      prev.minutes = Math.round((new Date(prev.leftAt) - new Date(prev.arrivedAt)) / 60000);
      continue;
    }
    out.push(stop);
  }
  return out.slice(-150);
}

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

/**
 * Store a batch of fixes and fold them into the day's rollup.
 *
 * @param employee  { id, name, code }
 * @param pings     newest-last, as the app queued them
 * @returns { accepted, rejected, duplicates, distanceAdded, day }
 */
async function ingestBatch({ employee, pings = [], batchId = "" }) {
  if (!Array.isArray(pings) || pings.length === 0) {
    return { accepted: 0, rejected: 0, duplicates: 0, distanceAdded: 0, day: dayKey(new Date()) };
  }

  // The app can post out of order after a reconnect, and distance is a walk
  // through time — sorting here is what makes the walk meaningful.
  const sorted = [...pings]
    .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.recordedAt)
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  if (!sorted.length) {
    return { accepted: 0, rejected: pings.length, duplicates: 0, distanceAdded: 0, day: dayKey(new Date()) };
  }

  // IDEMPOTENT ON THE FIX ITSELF. The app cannot know whether a batch that
  // timed out was received, so it sends it again — under a new batch id — and
  // every fix in it used to be stored a second time, with its distance, its
  // ping count and its path points added again. A fix is identified by who took
  // it and the millisecond it was taken; anything already stored is skipped.
  const times = sorted.map((p) => new Date(p.recordedAt)).filter((d) => !Number.isNaN(d.getTime()));
  const already = await FieldLocationPing.find({ employeeId: employee.id, recordedAt: { $in: times } })
    .select("recordedAt -_id")
    .lean();
  const seen = new Set(already.map((p) => new Date(p.recordedAt).getTime()));
  let duplicates = 0;
  const fresh = [];
  for (const p of sorted) {
    const t = new Date(p.recordedAt).getTime();
    if (seen.has(t)) { duplicates += 1; continue; }
    seen.add(t);
    fresh.push(p);
  }

  if (!fresh.length) {
    return {
      accepted: 0, rejected: 0, duplicates, distanceAdded: 0,
      day: dayKey(sorted[sorted.length - 1].recordedAt),
    };
  }

  // The anchor for the first step: the last fix already stored for this person
  // ON THE SAME DAY, before this batch. Without an anchor at all, every batch
  // would start its distance from zero and a day would be measured as the sum
  // of its batches' interiors — always short.
  //
  // SCOPED TO THE DAY, and that scoping is the whole point. Anchored to the
  // last fix of ANY day, the first fix of a new morning was measured from
  // wherever the handset spent the night — so the drive home was billed to the
  // following day, and a phone that travelled while switched off could add tens
  // of kilometres to a day nobody had worked yet. A day's distance has to be
  // what happened THAT day.
  const firstDay = dayKey(fresh[0].recordedAt);

  const previous = await FieldLocationPing.findOne({
    employeeId: employee.id,
    day: firstDay,
    recordedAt: { $lt: new Date(fresh[0].recordedAt) },
  })
    .sort({ recordedAt: -1 })
    .select("lat lng accuracy recordedAt")
    .lean();

  let last = previous
    ? { lat: previous.lat, lng: previous.lng, accuracy: previous.accuracy, at: new Date(previous.recordedAt) }
    : null;
  // The previous fix of ANY kind, for time accounting — distinct from `last`,
  // which only moves on a counted step. Measuring "moving" and "still" seconds
  // from the anchor rather than from the previous fix added a growing gap per
  // rejected fix (20s, 40s, 60s…), so moving plus still exceeded the day.
  let prevAt = previous ? new Date(previous.recordedAt) : null;

  // Which day the anchor belongs to, so a batch that crosses midnight — a late
  // round, or a queue delivered after a long dead spot — starts the new day
  // from nothing rather than from the last fix of the old one.
  let anchorDay = firstDay;

  const docs = [];
  const perDay = new Map();
  let rejected = 0;

  for (const raw of fresh) {
    const at = new Date(raw.recordedAt);
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000) {
      // A fix from the future is a handset with a wrong clock. Storing it would
      // corrupt the ordering every later batch depends on.
      rejected += 1;
      continue;
    }

    const point = {
      lat: Number(raw.lat),
      lng: Number(raw.lng),
      accuracy: raw.accuracy == null ? null : Number(raw.accuracy),
      at,
    };

    // Midnight resets the walk. See the note on `firstDay` above.
    const pointDay = dayKey(point.at);
    if (pointDay !== anchorDay) {
      last = null;
      prevAt = null;
      anchorDay = pointDay;
    }

    let step = 0;
    let stepSeconds = null;
    let teleport = false;
    // The first fix after a gap has nothing to be compared against, so it is
    // taken at face value unless its own accuracy disqualifies it.
    let believable = (point.accuracy ?? 0) <= ACCURACY_LIMIT;
    if (last) {
      const metres = haversine(last, point);
      const seconds = Math.max(1, (point.at - last.at) / 1000);
      stepSeconds = seconds;
      const kmph = (metres / seconds) * 3.6;

      // Filter 1 — accuracy. Filter 2 — jitter floor. Filter 3 — speed ceiling.
      const tooVague = (point.accuracy ?? 0) > ACCURACY_LIMIT;

      // Scaled by the worse of the two fixes — see filter 2 in the header.
      const worstAccuracy = Math.max(last.accuracy || 0, point.accuracy || 0);
      const floor = Math.max(worstAccuracy * JITTER_FACTOR, JITTER_MIN_M);
      const noise = metres < floor;

      teleport = kmph > SPEED_LIMIT_KMPH;

      // The receiver's own speed, when it gives one. A handset that says it is
      // doing 0 m/s and appears to have shuffled 40m did not shuffle 40m.
      // A step three times the uncertainty is believed regardless, because a
      // phone in a pocket often reports no speed at all while its owner walks.
      const reportedSpeed = typeof raw.speed === "number" ? raw.speed : null;
      const standingStill =
        reportedSpeed !== null &&
        reportedSpeed < STILL_SPEED_MS &&
        metres < worstAccuracy * 3;

      if (!tooVague && !noise && !teleport && !standingStill) step = metres;

      // A fix rejected as too vague or impossible is stored, but it is not
      // allowed to become "where this person is". The live board reads that
      // position, and a tower fix that landed in the next district would put
      // an employee 200km from where they are standing — a far more visible
      // lie than a slightly short distance total.
      //
      // A JITTER-rejected fix is fine here: it means the phone is where it was.
      believable = !tooVague && !teleport;
    }

    // How much this fix may say about stays and the drawn route.
    const acc = point.accuracy ?? 0;
    const quality = teleport ? "bad" : acc <= ACCURACY_LIMIT ? "good" : acc <= VAGUE_LIMIT ? "vague" : "bad";

    const day = pointDay;
    docs.push({
      employeeId: employee.id,
      employeeCode: employee.code || "",
      day,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      altitude: raw.altitude ?? null,
      speed: raw.speed ?? null,
      bearing: raw.bearing ?? null,
      recordedAt: point.at,
      battery: raw.battery ?? null,
      isCharging: Boolean(raw.isCharging),
      isMock: Boolean(raw.isMock),
      isMoving: Boolean(raw.isMoving),
      provider: raw.provider || "",
      // Unknown values are defaulted rather than refused: one odd string from
      // a newer handset must not fail the other nineteen fixes in its batch.
      activity: ACTIVITIES.has(raw.activity) ? raw.activity : "unknown",
      source: SOURCES.has(raw.source) ? raw.source : "service",
      taskId: raw.taskId || null,
      leadId: raw.leadId || null,
      distanceFromPrev: Math.round(step),
      batchId,
    });

    const bucket = perDay.get(day) || {
      distance: 0, count: 0, points: [], trail: [], movingSeconds: 0, idleSeconds: 0,
      firstAt: point.at, lastAt: point.at,
    };
    bucket.distance += step;
    bucket.count += 1;
    bucket.lastAt = point.at;
    bucket.points.push({ lat: point.lat, lng: point.lng, t: point.at, q: quality, acc });
    // The DRAWN route leaves out what teleported. A tower fix in the next
    // district drawn into the line is a spike across the map that never
    // happened; it stays in the stored fixes for anybody who asks.
    if (quality !== "bad") bucket.trail.push({ lat: point.lat, lng: point.lng, t: point.at });
    if (prevAt) {
      const gap = Math.min(600, Math.max(0, (point.at - prevAt) / 1000));
      if (step > 0) bucket.movingSeconds += gap;
      else bucket.idleSeconds += gap;
    }
    prevAt = point.at;
    if (step > 0) bucket.lastMovingAt = point.at;
    if (believable) {
      // The receiver's speed when it gives a real one; otherwise the speed of
      // the counted step that brought the phone here. Some handsets (and every
      // emulator) report 0 m/s, or nothing, while plainly moving — and "Moving
      // · 0 km/h" on the desk's board is a figure nobody can use.
      const reported = typeof raw.speed === "number" ? raw.speed : null;
      const derived = step > 0 && stepSeconds ? step / stepSeconds : null;
      bucket.last = {
        ...point,
        battery: raw.battery ?? null,
        activity: raw.activity || "",
        speed: derived != null && (reported == null || reported < STILL_SPEED_MS) ? derived : reported,
        bearing: typeof raw.bearing === "number" ? raw.bearing : null,
      };
    }
    // Battery is worth keeping off even an unbelievable fix — a handset's
    // charge level does not depend on the quality of its GPS, and a low
    // battery is the one warning the desk can still act on.
    if (raw.battery != null) bucket.lastBattery = raw.battery;
    perDay.set(day, bucket);

    // Only a fix that counted may become the anchor. Anchoring on a rejected
    // wanderer drags the next real step towards the noise.
    if (step > 0 || !last) last = point;
  }

  if (docs.length) {
    // ordered: false so one bad document in a batch of twenty does not discard
    // the other nineteen — a field batch is expensive to have collected.
    await FieldLocationPing.insertMany(docs, { ordered: false }).catch((err) => {
      if (err?.code !== 11000) throw err;
    });
  }

  let distanceAdded = 0;
  for (const [day, bucket] of perDay) {
    distanceAdded += bucket.distance;
    await foldIntoDay({ employee, day, bucket });
    // Names are looked up AFTER the batch is safely folded in, and not waited
    // for: a geocoder that is slow or down must never hold up the handset.
    scheduleNaming(employee.id, day);
  }

  return {
    accepted: docs.length,
    rejected,
    duplicates,
    distanceAdded: Math.round(distanceAdded),
    day: dayKey(fresh[fresh.length - 1].recordedAt),
  };
}

/** Merge one batch's contribution into that day's single rollup document. */
async function foldIntoDay({ employee, day, bucket }) {
  const existing = await FieldDay.findOne({ employeeId: employee.id, day });

  // `bucket.last` is absent when every fix in the batch was too vague or
  // impossible — the trail is stored, but there is no position anybody should
  // be shown. The row is still created, so the day exists.
  const last = bucket.last || null;

  if (!existing) {
    const path = simplify(bucket.trail).slice(-PATH_MAX_POINTS);
    const { stay, closed } = advanceStays(null, bucket.points);
    await FieldDay.create({
      employeeId: employee.id,
      employeeName: employee.name || "",
      employeeCode: employee.code || "",
      day,
      firstPingAt: bucket.firstAt || null,
      lastPingAt: bucket.lastAt || null,
      distanceMeters: Math.round(bucket.distance),
      pingCount: bucket.count,
      movingSeconds: Math.round(bucket.movingSeconds),
      idleSeconds: Math.round(bucket.idleSeconds),
      lastLat: last?.lat ?? null,
      lastLng: last?.lng ?? null,
      lastAccuracy: last?.accuracy ?? null,
      lastBattery: bucket.lastBattery ?? last?.battery ?? null,
      lastActivity: last?.activity || "",
      lastSpeed: last?.speed ?? null,
      lastBearing: last?.bearing ?? null,
      lastMovingAt: bucket.lastMovingAt || null,
      path,
      stops: appendStays([], closed),
      stay,
    });
    return;
  }

  // Re-simplify the joined path rather than appending the batch's own
  // simplification: two independently simplified runs meet at a false corner,
  // and after a day of batches the line is visibly wrong at every join.
  //
  // When the day outgrows PATH_MAX_POINTS it is simplified harder rather than
  // cut: slicing kept the LAST points and quietly dropped the start of a long
  // day from the map.
  let merged = simplify([...existing.path.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })), ...bucket.trail]);
  let tolerance = PATH_TOLERANCE_M;
  while (merged.length > PATH_MAX_POINTS && tolerance < PATH_TOLERANCE_M * 16) {
    tolerance *= 2;
    merged = simplify(merged, tolerance);
  }
  if (merged.length > PATH_MAX_POINTS) merged = merged.slice(-PATH_MAX_POINTS);

  existing.distanceMeters = Math.round((existing.distanceMeters || 0) + bucket.distance);
  existing.pingCount = (existing.pingCount || 0) + bucket.count;
  existing.movingSeconds = Math.round((existing.movingSeconds || 0) + bucket.movingSeconds);
  existing.idleSeconds = Math.round((existing.idleSeconds || 0) + bucket.idleSeconds);
  // `lastPingAt` advances on ANY fix — the phone reported, which is what the
  // "reporting / not reporting" indicator means. The POSITION advances only on
  // a believable one, so a handset sending nothing but rubbish reads as present
  // but stationary, rather than as teleporting around the district.
  //
  // A batch that arrives LATE — fixes older than what is already stored, from
  // a handset that queued offline — adds its distance and its trail, but does
  // not move "where they are now" backwards to a place they have since left.
  const previousLastPing = existing.lastPingAt ? new Date(existing.lastPingAt) : null;
  const batchIsNewer = !previousLastPing || bucket.lastAt >= previousLastPing;
  if (batchIsNewer) existing.lastPingAt = bucket.lastAt;
  if (last && (batchIsNewer || existing.lastLat == null)) {
    existing.lastLat = last.lat;
    existing.lastLng = last.lng;
    existing.lastAccuracy = last.accuracy;
    existing.lastActivity = last.activity || existing.lastActivity;
    existing.lastSpeed = last.speed;
    existing.lastBearing = last.bearing;
  }
  existing.lastBattery = bucket.lastBattery ?? last?.battery ?? existing.lastBattery;
  if (bucket.lastMovingAt && (!existing.lastMovingAt || bucket.lastMovingAt > existing.lastMovingAt)) {
    existing.lastMovingAt = bucket.lastMovingAt;
  }
  existing.path = merged;
  if (!existing.firstPingAt || bucket.firstAt < existing.firstPingAt) existing.firstPingAt = bucket.firstAt;

  const carried = existing.stay ? (existing.stay.toObject ? existing.stay.toObject() : existing.stay) : null;
  const { stay, closed } = advanceStays(carried, bucket.points);
  existing.stops = appendStays(existing.stops, closed);
  existing.stay = stay;

  await existing.save();
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

// One naming pass per employee-day at a time. A second batch arriving while the
// first pass is still queued behind the geocoder just marks it to run again.
const naming = new Map(); // key -> { again: boolean }

function scheduleNaming(employeeId, day) {
  const key = `${employeeId}|${day}`;
  const running = naming.get(key);
  if (running) { running.again = true; return; }
  const state = { again: false };
  naming.set(key, state);
  setImmediate(async () => {
    try {
      do {
        state.again = false;
        await nameDay(employeeId, day);
      } while (state.again);
    } catch (err) {
      console.warn("[field] naming pass failed:", err.message);
    } finally {
      naming.delete(key);
    }
  });
}

/**
 * Put names on what the day holds: every stop that has none, the stay still
 * open, and the latest position. Written back with targeted updates, never a
 * whole-document save, so a batch folded in meanwhile is not overwritten.
 */
async function nameDay(employeeId, day) {
  const { describe, cacheKey } = require("./reverseGeocode");
  const row = await FieldDay.findOne({ employeeId, day })
    .select("stops stay lastLat lastLng lastPlaceKey")
    .lean();
  if (!row) return;

  // Stops, by their position in the array — identified by arrival time too, so
  // a concurrent append cannot make an index point at a different stop.
  for (let i = 0; i < (row.stops || []).length; i++) {
    const s = row.stops[i];
    if (s.named || s.lat == null || s.lng == null) continue;
    const n = await describe(s.lat, s.lng);
    if (n.failed) continue;
    await FieldDay.updateOne(
      { employeeId, day, [`stops.${i}.arrivedAt`]: s.arrivedAt, [`stops.${i}.lat`]: s.lat },
      {
        $set: {
          [`stops.${i}.place`]: n.name || "",
          [`stops.${i}.locality`]: n.locality || "",
          [`stops.${i}.district`]: n.district || "",
          [`stops.${i}.named`]: true,
        },
      },
    );
  }

  if (row.stay && !row.stay.named && row.stay.lat != null) {
    const n = await describe(row.stay.lat, row.stay.lng);
    if (!n.failed) {
      await FieldDay.updateOne(
        { employeeId, day, "stay.since": row.stay.since },
        {
          $set: {
            "stay.place": n.name || "",
            "stay.locality": n.locality || "",
            "stay.district": n.district || "",
            "stay.named": true,
          },
        },
      );
    }
  }

  if (row.lastLat != null && row.lastLng != null) {
    const key = cacheKey(row.lastLat, row.lastLng);
    if (key !== row.lastPlaceKey) {
      const n = await describe(row.lastLat, row.lastLng);
      if (!n.failed) {
        await FieldDay.updateOne(
          { employeeId, day },
          {
            $set: {
              lastPlace: n.name || "",
              lastLocality: n.locality || "",
              lastDistrict: n.district || "",
              lastPlaceKey: key,
            },
          },
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Duty                                                                */
/* ------------------------------------------------------------------ */

/**
 * Record the employee switching duty on or off.
 *
 * The handset queues these like everything else and may deliver them twice;
 * each carries its own `ref`, and a ref already recorded is a no-op.
 *
 * @param events [{ state: "on"|"off", at, ref, lat?, lng? }]
 * @returns the days touched, with `ended: true` where a duty was switched off
 */
async function recordDutyEvents({ employee, events = [] }) {
  const touched = new Map(); // day -> { ended }
  const valid = (Array.isArray(events) ? events : [])
    .filter((e) => (e?.state === "on" || e?.state === "off") && e.at && !Number.isNaN(new Date(e.at).getTime()))
    .filter((e) => new Date(e.at).getTime() <= Date.now() + 5 * 60 * 1000)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  for (const e of valid) {
    const at = new Date(e.at);
    const day = dayKey(at);
    const ref = String(e.ref || `${e.state}:${at.toISOString()}`);
    const lat = Number.isFinite(Number(e.lat)) ? Number(e.lat) : undefined;
    const lng = Number.isFinite(Number(e.lng)) ? Number(e.lng) : undefined;

    const row =
      (await FieldDay.findOne({ employeeId: employee.id, day })) ||
      new FieldDay({
        employeeId: employee.id,
        employeeName: employee.name || "",
        employeeCode: employee.code || "",
        day,
      });

    const sessions = row.dutySessions || [];
    const known = sessions.some((s) => s.startRef === ref || s.endRef === ref);
    if (!known) {
      if (e.state === "on") {
        sessions.push({ startAt: at, startRef: ref, startLat: lat, startLng: lng });
        row.dutyOn = true;
        if (!row.dutyStartedAt || at < row.dutyStartedAt) row.dutyStartedAt = at;
      } else {
        // Close the latest session still open. When the "on" was lost — an old
        // app build, or a start on the previous day — the session is recorded
        // from the day's first fix, which is the honest earliest evidence.
        const open = [...sessions].reverse().find((s) => !s.endAt);
        if (open) {
          open.endAt = at;
          open.endRef = ref;
          open.endLat = lat;
          open.endLng = lng;
        } else {
          sessions.push({ startAt: row.firstPingAt || at, endAt: at, endRef: ref, endLat: lat, endLng: lng });
          if (!row.dutyStartedAt) row.dutyStartedAt = row.firstPingAt || at;
        }
        row.dutyOn = sessions.some((s) => !s.endAt);
        if (!row.dutyEndedAt || at > row.dutyEndedAt) row.dutyEndedAt = at;
        touched.set(day, { ended: true });
      }
      row.dutySessions = sessions;
      row.markModified("dutySessions");
      await row.save();
    }
    if (!touched.has(day)) touched.set(day, { ended: false });
  }

  return [...touched.entries()].map(([day, v]) => ({ day, ...v }));
}

/* ------------------------------------------------------------------ */
/* Reading a day                                                       */
/* ------------------------------------------------------------------ */

/** Minutes between two moments, never negative. */
function minutesBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}

/**
 * What somebody is doing, as far as the day's rollup can honestly say.
 *
 * `off_duty`       they switched duty off (and not back on)
 * `not_reporting`  nothing heard for STALE_MINUTES — no signal and a dead
 *                  phone look the same from here, so neither is claimed
 * `stopped`        the open stay has lasted STOPPED_AFTER_MINUTES or more
 * `moving`         otherwise, with the last reported speed
 * `idle`           nothing recorded yet today
 */
/**
 * Does the stored place name still describe where the phone is?
 *
 * The name is looked up for one point, and the phone keeps moving. When the
 * next point cannot be named — the geocoder rate-limited, or down — the old
 * name stays on the row, and read as current it put a salesperson "near
 * Saheed Nagar" three kilometres after they left it. A name is only said about
 * a position within PLACE_STILL_TRUE_M of the point it was looked up for;
 * beyond that, no place is claimed at all.
 */
function placeStillTrue(row) {
  if (!row?.lastPlaceKey || row.lastLat == null || row.lastLng == null) return false;
  const [lat, lng] = String(row.lastPlaceKey).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return haversine({ lat, lng }, { lat: row.lastLat, lng: row.lastLng }) <= PLACE_STILL_TRUE_M;
}

function presentState(row, now = new Date()) {
  if (!row) return { state: "idle" };
  const lastSeen = row.lastPingAt ? new Date(row.lastPingAt) : null;
  const isToday = row.day === dayKey(now);
  const reporting = Boolean(isToday && lastSeen && now - lastSeen < STALE_MINUTES * 60 * 1000);
  const stay = row.stay || null;
  const place = placeStillTrue(row)
    ? { place: row.lastPlace || "", locality: row.lastLocality || "", district: row.lastDistrict || "" }
    : { place: "", locality: "", district: "" };

  if (row.dutyOn === false && row.dutyEndedAt) {
    return { state: "off_duty", since: row.dutyEndedAt, reporting, ...place };
  }
  if (!reporting) {
    return { state: "not_reporting", lastSeenAt: row.lastPingAt || null, reporting: false, ...place };
  }

  // Stopped: the latest fix is still inside the open stay, and it has lasted.
  const stayCurrent =
    stay?.since && stay?.lastAt && lastSeen && new Date(stay.lastAt) >= new Date(lastSeen.getTime() - 60 * 1000);
  if (stayCurrent && minutesBetween(stay.since, stay.lastAt) >= STOPPED_AFTER_MINUTES) {
    return {
      state: "stopped",
      since: stay.since,
      // Still reporting, so still there: counted to now, not to the last fix.
      minutes: minutesBetween(stay.since, now),
      reporting: true,
      place: stay.place || place.place,
      locality: stay.locality || place.locality,
      district: stay.district || place.district,
      lat: stay.lat,
      lng: stay.lng,
    };
  }

  const speed = typeof row.lastSpeed === "number" ? row.lastSpeed : null;
  return {
    state: "moving",
    // A crawl below walking pace is not shown as a speed: "Moving · 0 km/h"
    // reads as a broken figure, "Moving" as what it is — just set off, or
    // about to be counted as stopped.
    speedKmh: speed != null && speed >= STILL_SPEED_MS ? Math.round(speed * 3.6 * 10) / 10 : null,
    reporting: true,
    ...place,
  };
}

/**
 * The day as a list a person reads: every stay and every visit, in the order
 * they happened, with the travel between consecutive stays measured off the
 * drawn route.
 */
function timelineOf(row, now = new Date()) {
  if (!row) return { entries: [], legs: [] };

  const entries = (row.stops || [])
    .map((s) => ({
      kind: kindOf(s),
      lat: s.lat,
      lng: s.lng,
      arrivedAt: s.arrivedAt,
      leftAt: s.leftAt || s.arrivedAt,
      minutes: s.minutes || 0,
      label: s.label || "",
      leadId: s.leadId ? String(s.leadId) : null,
      place: s.place || "",
      locality: s.locality || "",
      district: s.district || "",
      ongoing: false,
    }))
    .filter((e) => e.lat != null && e.lng != null);

  // The stay still open counts as a stop in progress once it is long enough —
  // long enough by the SAME clock the "Stopped · 5 min" line uses, which counts
  // a phone still reporting from there up to now. By the last fix alone, the
  // list said "no stops yet" beside a header saying five minutes.
  const stay = row.stay;
  const state = presentState(row, now);
  const openMinutes = stay?.since && stay?.lastAt
    ? (state.state === "stopped" ? state.minutes : minutesBetween(stay.since, stay.lastAt))
    : 0;
  if (stay?.since && stay?.lastAt && openMinutes >= STOP_MINUTES) {
    entries.push({
      kind: "stay",
      lat: stay.lat,
      lng: stay.lng,
      arrivedAt: stay.since,
      leftAt: stay.lastAt,
      minutes: openMinutes,
      label: "",
      leadId: null,
      place: stay.place || "",
      locality: stay.locality || "",
      district: stay.district || "",
      ongoing: state.state === "stopped",
    });
  }

  entries.sort((a, b) => new Date(a.arrivedAt) - new Date(b.arrivedAt));

  // A visit made DURING a stay is shown inside it — "stayed in Kalmeshwar 45
  // min · recorded Ramesh Kumar" — not as a separate row a minute apart.
  const stays = entries.filter((e) => e.kind === "stay");
  const ms = (d) => new Date(d).getTime();
  for (const v of entries.filter((e) => e.kind === "visit")) {
    // In milliseconds, explicitly: `new Date(x) + 60000` is STRING concatenation
    // in JavaScript, and a comparison against that string is always false.
    const host = stays.find(
      (s) => ms(v.arrivedAt) >= ms(s.arrivedAt) - 60 * 1000 &&
        ms(v.arrivedAt) <= ms(s.leftAt) + 60 * 1000 &&
        haversine(s, v) <= STOP_RADIUS_M * 2,
    );
    if (host) {
      host.visits = host.visits || [];
      host.visits.push({ label: v.label, leadId: v.leadId });
      v.insideStay = true;
    }
  }

  // Travel between consecutive stays: distance along the drawn route between
  // leaving one and arriving at the next, and the time it took.
  const path = (row.path || []).filter((p) => p.t);
  const legs = [];
  for (let i = 1; i < stays.length; i++) {
    const from = stays[i - 1];
    const to = stays[i];
    const t0 = new Date(from.leftAt).getTime();
    const t1 = new Date(to.arrivedAt).getTime();
    let metres = 0;
    let prev = null;
    for (const p of path) {
      const t = new Date(p.t).getTime();
      if (t < t0 || t > t1) continue;
      if (prev) metres += haversine(prev, p);
      prev = p;
    }
    if (metres === 0) metres = haversine(from, to);
    const minutes = minutesBetween(from.leftAt, to.arrivedAt);
    legs.push({
      fromIndex: i - 1,
      toIndex: i,
      km: Math.round(metres / 100) / 10,
      minutes,
      avgKmh: minutes > 0 ? Math.round((metres / 1000 / (minutes / 60)) * 10) / 10 : null,
    });
  }

  return {
    entries: entries.map((e) => {
      const { insideStay, ...rest } = e;
      return { ...rest, insideStay: Boolean(insideStay) };
    }),
    legs,
  };
}

/* ------------------------------------------------------------------ */
/* What was achieved out there                                         */
/* ------------------------------------------------------------------ */

/**
 * Count a submission, a new lead or a finished task against the day.
 *
 * Called from salesPipeline, and never allowed to fail the thing that called
 * it — see the call site. Travel without output and output without travel are
 * both worth seeing, and they only mean anything side by side.
 */
async function noteFieldActivity({
  employeeId,
  employeeName = "",
  employeeCode = "",
  at = new Date(),
  submission = 0,
  leadCreated = 0,
  taskCompleted = 0,
  lat = null,
  lng = null,
  leadId = null,
  label = "",
  village = "",
}) {
  const day = dayKey(at);
  const inc = {};
  if (submission) inc.submissionCount = submission;
  if (leadCreated) inc.leadsCreated = leadCreated;
  if (taskCompleted) inc.tasksCompleted = taskCompleted;

  const update = {
    $setOnInsert: { employeeId, day, employeeName, employeeCode },
    ...(Object.keys(inc).length ? { $inc: inc } : {}),
  };

  // A pin for where the work actually happened, attached to the nearest stop so
  // the map can say "this is the farmer you saw here" rather than dropping a
  // second unexplained marker beside it.
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && leadId) {
    update.$push = {
      stops: {
        $each: [{
          kind: "visit",
          lat: Number(lat),
          lng: Number(lng),
          arrivedAt: at,
          leftAt: at,
          minutes: 0,
          label,
          leadId,
          // The village the farmer is registered in, until the naming pass
          // puts the place the phone actually was.
          locality: village || "",
        }],
        $slice: -150,
      },
    };
  }

  await FieldDay.updateOne({ employeeId, day }, update, { upsert: true });
  if (update.$push) scheduleNaming(employeeId, day);
}

/**
 * Close what a finished day left open — run by the nightly close-out.
 *
 * A stay still open at midnight ended at its last fix; a duty never switched
 * off ended at the day's last fix. Both are written so the day reads the same
 * tomorrow as it will next year.
 *
 * @returns the rows closed, with whether a duty was closed on each
 */
/**
 * Close the open duty of somebody who has just been deactivated.
 *
 * Their phone ends duty the moment the server refuses it — but it can no longer
 * TELL the server, because that refusal is the end of its session. Without
 * this, the desk showed a person HR had just let go as still on duty until the
 * midnight close-out. The session ends at their last fix, the honest end of
 * what was recorded, or now when there is none.
 *
 * No field attendance is filed: fileFieldAttendance refuses a leaver anyway.
 */
async function endDutyForLeaver(employeeId, at = new Date()) {
  const rows = await FieldDay.find({ employeeId, dutyOn: true });
  for (const row of rows) {
    const lastFix = row.lastPingAt ? new Date(row.lastPingAt) : null;
    const end = lastFix && lastFix <= at ? lastFix : at;
    for (const s of row.dutySessions || []) {
      if (s.endAt) continue;
      s.endAt = s.startAt && end < new Date(s.startAt) ? s.startAt : end;
      s.endRef = "deactivated";
    }
    row.markModified("dutySessions");
    row.dutyOn = false;
    row.dutyEndedAt = end;
    await row.save();
  }
  return rows.length;
}

async function closeDay(day) {
  const rows = await FieldDay.find({ day, $or: [{ stay: { $ne: null } }, { dutyOn: true }] });
  const out = [];
  for (const row of rows) {
    let dutyClosed = false;
    if (row.stay) {
      const stay = row.stay.toObject ? row.stay.toObject() : row.stay;
      if (stayMinutes(stay) >= STOP_MINUTES) row.stops = appendStays(row.stops, [stayToStop(stay)]);
      row.stay = null;
    }
    if (row.dutyOn) {
      const end = row.lastPingAt || row.dutyStartedAt;
      for (const s of row.dutySessions || []) if (!s.endAt) s.endAt = end;
      row.markModified("dutySessions");
      row.dutyOn = false;
      row.dutyEndedAt = end;
      dutyClosed = true;
    }
    await row.save();
    out.push({ employeeId: String(row.employeeId), day, dutyClosed });
  }
  return out;
}

module.exports = {
  ingestBatch,
  noteFieldActivity,
  recordDutyEvents,
  presentState,
  placeStillTrue,
  timelineOf,
  closeDay,
  endDutyForLeaver,
  scheduleNaming,
  nameDay,
  haversine,
  simplify,
  dayKey,
  kindOf,
  // Exposed for the tests and the app's own display of the rules.
  advanceStays,
  stayMinutes,
  STOP_MINUTES,
  STOP_RADIUS_M,
  STALE_MINUTES,
};
