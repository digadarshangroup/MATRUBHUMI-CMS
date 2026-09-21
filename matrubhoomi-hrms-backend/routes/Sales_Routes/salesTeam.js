// routes/Sales_Routes/salesTeam.js
//
// Who is in the field, where they are, and how far they have been.
//
// Mounted at /api/sales/team.
//
// WHY THE LIVE BOARD READS FieldDay AND NOT THE PINGS
// ---------------------------------------------------
// "Where is everybody right now" over the raw fixes is one sorted lookup per
// employee into a collection with millions of rows. FieldDay already carries
// each person's last position, updated by the same ingest that stored the fix
// — so the board is ONE query over one small collection, however long the
// company has been running.

"use strict";

const express = require("express");
const router = express.Router();

const Employee = require("../../models/Employee");
const AccessDepartment = require("../../models/Access/AccessDepartment");
const FieldDay = require("../../models/Sales_Models/FieldDay");
const FieldLocationPing = require("../../models/Sales_Models/FieldLocationPing");
const SalesTask = require("../../models/Sales_Models/SalesTask");
const { dayKey, haversine } = require("../../services/fieldTracking");
const { describeMany } = require("../../services/reverseGeocode");
const { deskRead, deskApprove, sendError } = require("./_deskAuth");

/**
 * The people this desk assigns work to.
 *
 * Two ways in, unioned: the ACCESS grant (they can sign into Sales) and the HR
 * department label. They disagree in practice — a new joiner labelled Sales by
 * HR before anybody granted them app access, and vice versa — and a desk that
 * cannot see somebody cannot give them work, which is the worse failure.
 */
async function salesEmployeeFilter() {
  const dept = await AccessDepartment.findOne({ key: "sales" }).select("_id").lean();
  const or = [{ department: /sales/i }];
  if (dept) {
    or.push({ accessDepartmentId: dept._id }, { additionalDepartmentIds: dept._id });
  }
  return { isActive: true, status: { $ne: "inactive" }, $or: or };
}

router.get("/", deskRead, async (req, res) => {
  try {
    const rows = await Employee.find(await salesEmployeeFilter())
      .select("firstName middleName lastName biometricId phone designation department profilePicture")
      .sort({ firstName: 1 })
      .lean();

    res.json({
      success: true,
      data: rows.map((e) => ({
        id: String(e._id),
        name: [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ").trim(),
        code: e.biometricId || "",
        phone: e.phone || "",
        designation: e.designation || "",
        department: e.department || "",
        photo: e.profilePicture || "",
      })),
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

/* ── Where everybody is ───────────────────────────────────────────── */

router.get("/live", deskRead, async (req, res) => {
  try {
    const day = req.query.day || dayKey(new Date());

    const [days, tasks] = await Promise.all([
      FieldDay.find({ day }).select("-path").lean(),
      SalesTask.aggregate([
        { $match: { isActive: true, status: { $in: ["assigned", "accepted", "in_progress", "pending_approval", "rework"] } } },
        { $group: { _id: "$assignedTo", open: { $sum: 1 }, done: { $sum: "$doneCount" } } },
      ]),
    ]);

    const taskByEmp = new Map(tasks.map((t) => [String(t._id), t]));
    const staleAfter = Number(process.env.FIELD_STALE_MINUTES || 15) * 60 * 1000;

    res.json({
      success: true,
      day,
      data: days.map((d) => ({
        employeeId: String(d.employeeId),
        name: d.employeeName,
        code: d.employeeCode,
        lat: d.lastLat,
        lng: d.lastLng,
        accuracy: d.lastAccuracy,
        battery: d.lastBattery,
        activity: d.lastActivity,
        lastSeenAt: d.lastPingAt,
        // A phone with no signal and a phone switched off look identical from
        // here, so the board says "not reporting" and lets a human decide which.
        reporting: d.lastPingAt ? Date.now() - new Date(d.lastPingAt).getTime() < staleAfter : false,
        distanceKm: Math.round((d.distanceMeters || 0) / 100) / 10,
        movingMinutes: Math.round((d.movingSeconds || 0) / 60),
        idleMinutes: Math.round((d.idleSeconds || 0) / 60),
        stops: (d.stops || []).length,
        submissions: d.submissionCount || 0,
        leadsCreated: d.leadsCreated || 0,
        openTasks: taskByEmp.get(String(d.employeeId))?.open || 0,
      })),
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

/* ── One person's day, drawn ──────────────────────────────────────── */

router.get("/:employeeId/day", deskRead, async (req, res) => {
  try {
    const day = req.query.day || dayKey(new Date());
    const row = await FieldDay.findOne({ employeeId: req.params.employeeId, day }).lean();

    if (!row) {
      return res.json({ success: true, day, data: null, message: "Nothing was recorded for this day." });
    }

    // The simplified path is what the map draws. The full trail is available on
    // request for the rare case somebody is checking a specific hour — capped,
    // because handing a browser 40,000 points is not a feature.
    let raw = null;
    if (req.query.full === "true") {
      raw = await FieldLocationPing.find({ employeeId: req.params.employeeId, day })
        .select("lat lng accuracy recordedAt speed activity source -_id")
        .sort({ recordedAt: 1 })
        .limit(5000)
        .lean();
    }

    res.json({
      success: true,
      day,
      data: {
        ...row,
        distanceKm: Math.round((row.distanceMeters || 0) / 100) / 10,
        movingMinutes: Math.round((row.movingSeconds || 0) / 60),
        idleMinutes: Math.round((row.idleSeconds || 0) / 60),
        raw,
      },
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

/* ── The route, in words ──────────────────────────────────────────── */

/**
 * A day's travel written as a sequence of place names.
 *
 * WHY A LINE OF TEXT AND NOT JUST THE MAP
 * ---------------------------------------
 * The drawn route answers "where did they go" only for somebody prepared to
 * study it, zoom in, and recognise a junction. The question actually asked at
 * the desk is "did he go out to Katol or stay in town", and that is a sentence.
 * This produces the sentence, so the day can be READ at a glance and the map
 * consulted only when the answer prompts a further question.
 *
 * WHERE THE WAYPOINTS COME FROM
 * -----------------------------
 * Not every point — a day is hundreds — and not a fixed count either, because
 * "every tenth point" names a traffic jam ten times and a fifty-kilometre run
 * once. They are taken by DISTANCE TRAVELLED: the start, then every
 * FIELD_ITINERARY_STEP_M along the route, then the end. So the names are spread
 * evenly across the ground covered, which is what somebody reading them expects.
 *
 * Stops are added on top of that regardless of spacing. Somewhere the phone sat
 * for twenty minutes is the most informative point of the day and must never be
 * dropped because it fell between two five-kilometre marks.
 */
router.get("/:employeeId/itinerary", deskRead, async (req, res) => {
  try {
    const day = req.query.day || dayKey(new Date());
    const stepMetres = Math.max(500, Number(req.query.every || process.env.FIELD_ITINERARY_STEP_M || 5000));

    const row = await FieldDay.findOne({ employeeId: req.params.employeeId, day })
      .select("path stops distanceMeters employeeName firstPingAt lastPingAt")
      .lean();

    if (!row || !(row.path || []).length) {
      return res.json({ success: true, day, data: { legs: [], summary: "", stepMetres } });
    }

    const path = row.path;

    /* Pick the waypoints. */
    const picks = [{ lat: path[0].lat, lng: path[0].lng, at: path[0].t, metres: 0, kind: "start" }];

    let run = 0;         // total travelled so far
    let sinceMark = 0;   // travelled since the last name was taken
    for (let i = 1; i < path.length; i++) {
      const step = haversine(path[i - 1], path[i]);
      run += step;
      sinceMark += step;
      if (sinceMark >= stepMetres) {
        picks.push({ lat: path[i].lat, lng: path[i].lng, at: path[i].t, metres: run, kind: "via" });
        sinceMark = 0;
      }
    }

    const finish = path[path.length - 1];
    // Only if the end is not already the last mark — a day that finished exactly
    // on a five-kilometre boundary should not name the same spot twice.
    if (run - (picks[picks.length - 1].metres || 0) > stepMetres / 10) {
      picks.push({ lat: finish.lat, lng: finish.lng, at: finish.t, metres: run, kind: "end" });
    } else {
      picks[picks.length - 1].kind = "end";
    }

    /* Stops, wherever they fall. */
    for (const stop of row.stops || []) {
      if (stop.lat == null || stop.lng == null) continue;
      picks.push({
        lat: stop.lat, lng: stop.lng, at: stop.arrivedAt,
        kind: "stop", minutes: stop.minutes || 0, label: stop.label || "",
      });
    }

    // Back into the order they happened, which is the order somebody reads them.
    picks.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

    const named = await describeMany(picks.map((p) => ({ lat: p.lat, lng: p.lng })));

    const legs = picks.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      at: p.at || null,
      kind: p.kind,
      km: p.metres != null ? Math.round(p.metres / 100) / 10 : null,
      minutes: p.minutes || null,
      // A stop already carrying a business label — the farmer visited — keeps
      // it. That is better information than any road name.
      place: p.label || named[i]?.name || "",
      road: named[i]?.road || "",
      locality: named[i]?.locality || "",
      district: named[i]?.district || "",
      unnamed: !(p.label || named[i]?.name),
    }));

    /* The one-line version. Consecutive repeats collapsed — a route that stays
       on one road for twenty kilometres should say its name once, not four
       times. */
    const chain = [];
    for (const leg of legs) {
      const place = leg.place;
      if (!place) continue;
      if (chain[chain.length - 1] === place) continue;
      chain.push(place);
    }

    res.json({
      success: true,
      day,
      data: {
        legs,
        chain,
        summary: chain.join(" → "),
        totalKm: Math.round((row.distanceMeters || 0) / 100) / 10,
        stepMetres,
        // So the screen can say "names could not be fetched" rather than
        // silently showing a shorter route than the one that was travelled.
        namedCount: legs.filter((l) => !l.unnamed).length,
      },
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

/* ── Travel over a period ─────────────────────────────────────────── */

router.get("/travel", deskRead, async (req, res) => {
  try {
    const to = req.query.to || dayKey(new Date());
    const from = req.query.from || to;

    const rows = await FieldDay.aggregate([
      { $match: { day: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$employeeId",
          name: { $first: "$employeeName" },
          code: { $first: "$employeeCode" },
          days: { $sum: 1 },
          distanceMeters: { $sum: "$distanceMeters" },
          movingSeconds: { $sum: "$movingSeconds" },
          idleSeconds: { $sum: "$idleSeconds" },
          submissions: { $sum: "$submissionCount" },
          leadsCreated: { $sum: "$leadsCreated" },
        },
      },
      { $sort: { distanceMeters: -1 } },
    ]);

    res.json({
      success: true,
      from,
      to,
      data: rows.map((r) => ({
        employeeId: String(r._id),
        name: r.name,
        code: r.code,
        days: r.days,
        distanceKm: Math.round((r.distanceMeters || 0) / 100) / 10,
        movingHours: Math.round(((r.movingSeconds || 0) / 3600) * 10) / 10,
        idleHours: Math.round(((r.idleSeconds || 0) / 3600) * 10) / 10,
        submissions: r.submissions || 0,
        leadsCreated: r.leadsCreated || 0,
        // The number that matters more than either column on its own.
        kmPerSubmission:
          r.submissions > 0 ? Math.round((r.distanceMeters / r.submissions / 100)) / 10 : null,
      })),
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

/* ── Erasing a trail ──────────────────────────────────────────────── */

/**
 * Delete an employee's recorded movements.
 *
 * WHY THIS EXISTS
 * ---------------
 * Location history is the most sensitive thing this system holds. A person is
 * entitled to have a day removed — a phone carried on a day off, a test round,
 * a mistake — and a company that cannot delete it on request has a problem
 * whatever its policy says. Location data also ages badly: it is only useful
 * for as long as somebody might ask about it.
 *
 * BEHIND `deskApprove`, NOT `deskWrite`. Every other write here can be undone
 * by writing again; this one cannot be undone at all, so it needs the higher
 * grant.
 *
 * WHAT IT DOES NOT TOUCH: submissions. A form the employee filled is a business
 * record of a visit that happened, with the farmer's own consent attached — it
 * is not tracking data, and it is not this endpoint's to remove.
 *
 *   DELETE /api/sales/team/:employeeId/tracking?day=YYYY-MM-DD   one day
 *   DELETE /api/sales/team/:employeeId/tracking?all=true         everything
 */
router.delete("/:employeeId/tracking", deskApprove, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const all = req.query.all === "true";
    const day = req.query.day;

    if (!all && !day) {
      return res.status(400).json({
        success: false,
        message: "Name a day to clear, or pass all=true to clear everything.",
      });
    }

    const filter = all ? { employeeId } : { employeeId, day };

    const [pings, days] = await Promise.all([
      FieldLocationPing.deleteMany(filter),
      FieldDay.deleteMany(filter),
    ]);

    // Worth a line in the log: this is destructive, irreversible, and somebody
    // may later ask who did it.
    console.log(
      `[sales] ${req.user?.email || "a desk user"} cleared tracking for employee ${employeeId} ` +
        `(${all ? "ALL DAYS" : day}): ${pings.deletedCount} fixes, ${days.deletedCount} day summaries.`,
    );

    res.json({
      success: true,
      data: {
        fixesDeleted: pings.deletedCount,
        daysDeleted: days.deletedCount,
        scope: all ? "all" : day,
      },
    });
  } catch (err) {
    sendError(res, err, "sales-team");
  }
});

module.exports = router;
