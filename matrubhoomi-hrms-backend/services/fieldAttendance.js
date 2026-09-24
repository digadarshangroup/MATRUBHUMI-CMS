// services/fieldAttendance.js
//
// A salesperson's day in the field, filed as attendance for their manager to
// confirm.
//
// WHY
// ---
// Attendance here comes from the fingerprint machines. Field staff start the
// day at a farmer's gate, not the office door, so without this every field day
// reads ABSENT and the only way out is a correction typed by hand, every day,
// from memory.
//
// The app already knows when duty started and ended, and where the phone went
// in between. So when a salesperson ends duty, the day is filed as an
// attendance correction — type client_visit, with the duty start and end as
// the in and out times and the day's distance, visits and stops in the reason
// — through the SAME path a hand-filed correction takes
// (services/regularizationFiling.js). Their reporting manager confirms it in
// one tap and the muster roll takes the times; payroll logic is untouched, and
// nothing becomes attendance without a person agreeing to it.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
//   - File a day the fingerprint machine already recorded as present.
//   - Open a second request for a day that already has one: a later duty the
//     same day EXTENDS the pending field request instead; anything filed by the
//     person themselves is left alone.
//   - File a "day" shorter than FIELD_ATTENDANCE_MIN_MINUTES — a two-minute
//     duty is somebody trying the switch, not a day's work.

"use strict";

const Employee = require("../models/Employee");
const FieldDay = require("../models/Sales_Models/FieldDay");
const DailyAttendance = require("../models/HR_Models/Dailyattendance");
const { RegularizationRequest } = require("../models/HR_Models/LeaveManagement");
const { createRegularization, OPEN_STATUSES } = require("./regularizationFiling");
const { isFieldStaff } = require("./fieldAccess");
const { isEmployeeActive } = require("../utils/employeeActive");

const MIN_MINUTES = Number(process.env.FIELD_ATTENDANCE_MIN_MINUTES || 30);
const PRESENT = new Set(["P", "P*", "P~", "WFH"]);

/** "09:12" in IST — the wire format a correction carries its times in. */
function istHHmm(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.FIELD_TIMEZONE || "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

/** The span the day was on duty: first start to last end. */
function dutySpan(row) {
  const sessions = row?.dutySessions || [];
  const starts = sessions.map((s) => s.startAt).filter(Boolean).map((d) => new Date(d));
  const ends = sessions.map((s) => s.endAt).filter(Boolean).map((d) => new Date(d));
  const start = starts.length ? new Date(Math.min(...starts)) : row?.dutyStartedAt ? new Date(row.dutyStartedAt) : null;
  const end = ends.length ? new Date(Math.max(...ends)) : row?.dutyEndedAt ? new Date(row.dutyEndedAt) : null;
  return { start, end };
}

/**
 * The day's stops, INCLUDING the one the phone is still in.
 *
 * Ending duty does not close the open stay — the last fixes can reach the
 * server after the "duty off" does, and closing early would cut the stop in
 * two. Closing waits for the midnight close-out. So a salesperson who ends
 * the day where they last stopped has that stop still open here, and without
 * counting it the manager was told "1 stop" for a day with two.
 */
function stopCount(row) {
  const { stayMinutes, STOP_MINUTES } = require("./fieldTracking");
  const closed = (row.stops || []).filter((s) => (s.kind || (s.leadId ? "visit" : "stay")) === "stay").length;
  const openCounts = row.stay && stayMinutes(row.stay.toObject ? row.stay.toObject() : row.stay) >= STOP_MINUTES;
  return closed + (openCounts ? 1 : 0);
}

function summaryLine(row, start, end) {
  const km = Math.round((row.distanceMeters || 0) / 100) / 10;
  const visits = row.submissionCount || 0;
  const stays = stopCount(row);
  const bits = [
    `Field duty ${istHHmm(start)}–${istHHmm(end)}`,
    `${km} km`,
    `${visits} visit${visits === 1 ? "" : "s"}`,
  ];
  if (stays) bits.push(`${stays} stop${stays === 1 ? "" : "s"}`);
  return `${bits.join(" · ")} (recorded by the app)`;
}

async function remember(employeeId, day, status, reason, requestId = null) {
  await FieldDay.updateOne(
    { employeeId, day },
    { $set: { attendance: { requestId, status, reason, at: new Date() } } },
  );
  return { status, reason, requestId: requestId ? String(requestId) : null };
}

/**
 * File (or extend) the day's field attendance. Never throws — the duty switch
 * that triggers it must work whatever happens here.
 *
 * @returns { status: "filed"|"updated"|"skipped", reason, requestId }
 */
async function fileFieldAttendance({ employeeId, day }) {
  try {
    if (process.env.FIELD_ATTENDANCE_ENABLED === "false") {
      return { status: "skipped", reason: "disabled", requestId: null };
    }

    const [emp, row] = await Promise.all([
      Employee.findById(employeeId)
        .select(
          "firstName middleName lastName biometricId department designation primaryManager " +
            "isActive status accessDepartmentId additionalDepartmentIds",
        )
        .lean(),
      FieldDay.findOne({ employeeId, day }).lean(),
    ]);
    if (!emp || !isEmployeeActive(emp)) return { status: "skipped", reason: "inactive", requestId: null };
    if (!(await isFieldStaff(emp))) return remember(employeeId, day, "skipped", "not_field_staff");
    if (!row) return { status: "skipped", reason: "no_duty", requestId: null };

    const { start, end } = dutySpan(row);
    if (!start || !end || end <= start) return remember(employeeId, day, "skipped", "no_duty");
    if ((end - start) / 60000 < MIN_MINUTES) return remember(employeeId, day, "skipped", "too_short");

    // The machine already has them present — nothing to correct.
    const bid = String(emp.biometricId || "").toUpperCase();
    if (bid) {
      const dayDoc = await DailyAttendance.findOne(
        { dateStr: day, "employees.biometricId": bid },
        { "employees.$": 1 },
      ).lean();
      const entry = dayDoc?.employees?.[0];
      const status = entry?.hrFinalStatus || entry?.systemPrediction;
      if (entry?.inTime && PRESENT.has(status)) {
        return remember(employeeId, day, "skipped", "already_present");
      }
    }

    const inTime = istHHmm(start);
    const outTime = istHHmm(end);
    const reason = summaryLine(row, start, end);
    const fieldSummary = {
      distanceKm: Math.round((row.distanceMeters || 0) / 100) / 10,
      visits: row.submissionCount || 0,
      stops: stopCount(row),
      dutyStartedAt: start,
      dutyEndedAt: end,
    };

    const open = await RegularizationRequest.findOne({
      employeeId,
      dateStr: day,
      status: { $in: OPEN_STATUSES },
    });
    if (open) {
      // Our own, still untouched by the manager: extend it to cover the later
      // duty rather than asking them to confirm the same day twice.
      if (open.source === "field_duty" && open.status === "pending") {
        const { parseTimeOnDateIST } = require("../routes/HrRoutes/Attendance_section");
        open.proposedInTime = parseTimeOnDateIST(inTime, day);
        open.proposedOutTime = parseTimeOnDateIST(outTime, day);
        open.reason = reason;
        open.fieldSummary = fieldSummary;
        await open.save();
        return remember(employeeId, day, "updated", "extended", open._id);
      }
      return remember(employeeId, day, "skipped", "already_requested", open._id);
    }

    // Already settled for this day — approved, or refused by the manager. A
    // refusal is a decision, and re-filing it every evening is nagging.
    const decided = await RegularizationRequest.findOne({
      employeeId,
      dateStr: day,
      source: "field_duty",
      status: { $in: ["hr_approved", "manager_rejected", "hr_rejected"] },
    }).lean();
    if (decided) return remember(employeeId, day, "skipped", "already_decided", decided._id);

    try {
      const doc = await createRegularization({
        emp,
        employeeId,
        dateStr: day,
        type: "client_visit",
        reason,
        inTime,
        outTime,
        source: "field_duty",
        fieldSummary,
      });
      return remember(employeeId, day, "filed", "", doc._id);
    } catch (e) {
      if (e?.code === "NO_MANAGER") return remember(employeeId, day, "skipped", "no_manager");
      if (e?.code === "OPEN_REQUEST") return remember(employeeId, day, "skipped", "already_requested");
      throw e;
    }
  } catch (err) {
    console.warn("[field-attendance] could not file:", err.message);
    return { status: "skipped", reason: "error", requestId: null };
  }
}

module.exports = { fileFieldAttendance, istHHmm, dutySpan, MIN_MINUTES };
