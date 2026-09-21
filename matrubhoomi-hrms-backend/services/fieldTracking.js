// services/fieldTracking.js
//
// Turning a stream of GPS fixes into "where the team went and how far".
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
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

/**
 * Store a batch of fixes and fold them into the day's rollup.
 *
 * @param employee  { id, name, code }
 * @param pings     newest-last, as the app queued them
 * @returns { accepted, rejected, distanceAdded, day }
 */
async function ingestBatch({ employee, pings = [], batchId = "" }) {
  if (!Array.isArray(pings) || pings.length === 0) {
    return { accepted: 0, rejected: 0, distanceAdded: 0, day: dayKey(new Date()) };
  }

  // The app can post out of order after a reconnect, and distance is a walk
  // through time — sorting here is what makes the walk meaningful.
  const sorted = [...pings]
    .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.recordedAt)
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  if (!sorted.length) return { accepted: 0, rejected: pings.length, distanceAdded: 0, day: dayKey(new Date()) };

  // The anchor for the first step: the last fix already stored for this person
  // ON THE SAME DAY. Without an anchor at all, every batch would start its
  // distance from zero and a day would be measured as the sum of its batches'
  // interiors — always short.
  //
  // SCOPED TO THE DAY, and that scoping is the whole point. Anchored to the
  // last fix of ANY day, the first fix of a new morning was measured from
  // wherever the handset spent the night — so the drive home was billed to the
  // following day, and a phone that travelled while switched off could add tens
  // of kilometres to a day nobody had worked yet. A day's distance has to be
  // what happened THAT day.
  const firstDay = dayKey(sorted[0].recordedAt);

  const previous = await FieldLocationPing.findOne({ employeeId: employee.id, day: firstDay })
    .sort({ recordedAt: -1 })
    .select("lat lng accuracy recordedAt")
    .lean();

  let last = previous
    ? { lat: previous.lat, lng: previous.lng, accuracy: previous.accuracy, at: new Date(previous.recordedAt) }
    : null;

  // Which day the anchor belongs to, so a batch that crosses midnight — a late
  // round, or a queue delivered after a long dead spot — starts the new day
  // from nothing rather than from the last fix of the old one.
  let anchorDay = firstDay;

  const docs = [];
  const perDay = new Map();
  let rejected = 0;

  for (const raw of sorted) {
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
      anchorDay = pointDay;
    }

    let step = 0;
    // The first fix after a gap has nothing to be compared against, so it is
    // taken at face value unless its own accuracy disqualifies it.
    let believable = (point.accuracy ?? 0) <= ACCURACY_LIMIT;
    if (last) {
      const metres = haversine(last, point);
      const seconds = Math.max(1, (point.at - last.at) / 1000);
      const kmph = (metres / seconds) * 3.6;

      // Filter 1 — accuracy. Filter 2 — jitter floor. Filter 3 — speed ceiling.
      const tooVague = (point.accuracy ?? 0) > ACCURACY_LIMIT;

      // Scaled by the worse of the two fixes — see filter 2 in the header.
      const worstAccuracy = Math.max(last.accuracy || 0, point.accuracy || 0);
      const floor = Math.max(worstAccuracy * JITTER_FACTOR, JITTER_MIN_M);
      const noise = metres < floor;

      const teleport = kmph > SPEED_LIMIT_KMPH;

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
      activity: raw.activity || "unknown",
      source: raw.source || "service",
      taskId: raw.taskId || null,
      leadId: raw.leadId || null,
      distanceFromPrev: Math.round(step),
      batchId,
    });

    const bucket = perDay.get(day) || { distance: 0, count: 0, points: [], movingSeconds: 0, idleSeconds: 0 };
    bucket.distance += step;
    bucket.count += 1;
    bucket.points.push({ lat: point.lat, lng: point.lng, t: point.at });
    if (last) {
      const gap = Math.min(600, Math.max(0, (point.at - last.at) / 1000));
      if (step > 0) bucket.movingSeconds += gap;
      else bucket.idleSeconds += gap;
    }
    if (believable) {
      bucket.last = { ...point, battery: raw.battery ?? null, activity: raw.activity || "" };
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
  }

  return {
    accepted: docs.length,
    rejected,
    distanceAdded: Math.round(distanceAdded),
    day: dayKey(sorted[sorted.length - 1].recordedAt),
  };
}

/** Merge one batch's contribution into that day's single rollup document. */
async function foldIntoDay({ employee, day, bucket }) {
  const existing = await FieldDay.findOne({ employeeId: employee.id, day });

  if (!existing) {
    const path = simplify(bucket.points).slice(-PATH_MAX_POINTS);
    // `bucket.last` is absent when every fix in the batch was too vague or
    // impossible — the trail is stored, but there is no position anybody
    // should be shown. The row is still created, so the day exists.
    const last = bucket.last || null;
    await FieldDay.create({
      employeeId: employee.id,
      employeeName: employee.name || "",
      employeeCode: employee.code || "",
      day,
      firstPingAt: bucket.points[0]?.t || null,
      lastPingAt: last?.at || bucket.points[bucket.points.length - 1]?.t || null,
      distanceMeters: Math.round(bucket.distance),
      pingCount: bucket.count,
      movingSeconds: Math.round(bucket.movingSeconds),
      idleSeconds: Math.round(bucket.idleSeconds),
      lastLat: last?.lat ?? null,
      lastLng: last?.lng ?? null,
      lastAccuracy: last?.accuracy ?? null,
      lastBattery: bucket.lastBattery ?? last?.battery ?? null,
      lastActivity: last?.activity || "",
      path,
      stops: detectStops(bucket.points),
    });
    return;
  }

  // Re-simplify the joined path rather than appending the batch's own
  // simplification: two independently simplified runs meet at a false corner,
  // and after a day of batches the line is visibly wrong at every join.
  const merged = simplify([...existing.path.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })), ...bucket.points]);
  const trimmed = merged.length > PATH_MAX_POINTS ? simplify(merged, PATH_TOLERANCE_M * 2).slice(-PATH_MAX_POINTS) : merged;

  existing.distanceMeters = Math.round((existing.distanceMeters || 0) + bucket.distance);
  existing.pingCount = (existing.pingCount || 0) + bucket.count;
  existing.movingSeconds = Math.round((existing.movingSeconds || 0) + bucket.movingSeconds);
  existing.idleSeconds = Math.round((existing.idleSeconds || 0) + bucket.idleSeconds);
  // `lastPingAt` advances on ANY fix — the phone reported, which is what the
  // "reporting / not reporting" indicator means. The POSITION advances only on
  // a believable one, so a handset sending nothing but rubbish reads as present
  // but stationary, rather than as teleporting around the district.
  existing.lastPingAt = bucket.points[bucket.points.length - 1]?.t || existing.lastPingAt;
  existing.lastLat = bucket.last?.lat ?? existing.lastLat;
  existing.lastLng = bucket.last?.lng ?? existing.lastLng;
  existing.lastAccuracy = bucket.last?.accuracy ?? existing.lastAccuracy;
  existing.lastBattery = bucket.lastBattery ?? bucket.last?.battery ?? existing.lastBattery;
  existing.lastActivity = bucket.last?.activity || existing.lastActivity;
  existing.path = trimmed;
  if (!existing.firstPingAt) existing.firstPingAt = bucket.points[0]?.t || null;
  existing.stops = mergeStops(existing.stops, detectStops(bucket.points));

  await existing.save();
}

/**
 * Where the phone stayed put long enough to count as a visit.
 *
 * A stop is what makes a map readable: a 40km line tells you nothing, four pins
 * with "38 minutes" under them tells you the day.
 */
function detectStops(points) {
  const stops = [];
  let anchor = null;
  let startedAt = null;
  let lastAt = null;

  for (const p of points) {
    if (!anchor) {
      anchor = p;
      startedAt = p.t;
      lastAt = p.t;
      continue;
    }
    if (haversine(anchor, p) <= STOP_RADIUS_M) {
      lastAt = p.t;
      continue;
    }
    const minutes = (lastAt - startedAt) / 60000;
    if (minutes >= STOP_MINUTES) {
      stops.push({ lat: anchor.lat, lng: anchor.lng, arrivedAt: startedAt, leftAt: lastAt, minutes: Math.round(minutes) });
    }
    anchor = p;
    startedAt = p.t;
    lastAt = p.t;
  }

  if (anchor && lastAt) {
    const minutes = (lastAt - startedAt) / 60000;
    if (minutes >= STOP_MINUTES) {
      stops.push({ lat: anchor.lat, lng: anchor.lng, arrivedAt: startedAt, leftAt: lastAt, minutes: Math.round(minutes) });
    }
  }

  return stops;
}

/** Join a batch's stops onto the day's, extending the one still in progress. */
function mergeStops(existing = [], incoming = []) {
  const out = existing.map((s) => ({ ...(s.toObject ? s.toObject() : s) }));
  for (const stop of incoming) {
    const open = out[out.length - 1];
    if (open && haversine(open, stop) <= STOP_RADIUS_M) {
      open.leftAt = stop.leftAt;
      open.minutes = Math.round((new Date(open.leftAt) - new Date(open.arrivedAt)) / 60000);
      continue;
    }
    out.push(stop);
  }
  return out.slice(-100);
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
        $each: [{ lat: Number(lat), lng: Number(lng), arrivedAt: at, leftAt: at, minutes: 0, label, leadId }],
        $slice: -100,
      },
    };
  }

  await FieldDay.updateOne({ employeeId, day }, update, { upsert: true });
}

module.exports = {
  ingestBatch,
  noteFieldActivity,
  haversine,
  simplify,
  dayKey,
};
