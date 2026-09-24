// services/regularizationFiling.js
//
// Filing an attendance correction — ONE implementation, two callers:
//
//   - POST /api/employee/regularizations, when somebody fills in the form;
//   - services/fieldAttendance.js, when a salesperson ends duty and the app
//     files the day's field attendance for their manager to confirm.
//
// Both must produce the same request — the same manager chain, the same frozen
// before-picture of the day, the same notification — or the manager's queue
// shows two kinds of row that behave differently on approval.

"use strict";

const DailyAttendance = require("../models/HR_Models/Dailyattendance");
const { RegularizationRequest } = require("../models/HR_Models/LeaveManagement");
const { notifyEmployee } = require("../utils/notifyEmployee");
const { approvalChain } = require("./approvalChain");

const OPEN_STATUSES = ["pending", "manager_approved"];

const fullName = (emp) =>
  [emp?.firstName, emp?.middleName, emp?.lastName].filter(Boolean).join(" ").trim();
const firstNameOf = (name) => String(name || "").trim().split(/\s+/)[0] || "";

/** An error a route renders as its own status and message rather than a 500. */
function refusal(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}

/**
 * Freeze what the day looked like before the correction, so the CMS can show a
 * before/after and an audit can tell what actually changed. A missing day doc
 * is not a reason to block the submit.
 */
async function attendanceSnapshot(bid, dateStr) {
  const snap = {
    inTime: null,
    finalOut: null,
    systemPrediction: null,
    hrFinalStatus: null,
    netWorkMins: 0,
    lateMins: 0,
    otMins: 0,
    punchCount: 0,
    rawPunches: [],
  };
  try {
    const dayDoc = await DailyAttendance.findOne({ dateStr }).lean();
    const entry = (dayDoc?.employees || []).find((e) => e.biometricId === bid);
    if (entry) {
      snap.inTime = entry.inTime || null;
      snap.finalOut = entry.finalOut || null;
      snap.systemPrediction = entry.systemPrediction || null;
      snap.hrFinalStatus = entry.hrFinalStatus || null;
      snap.netWorkMins = entry.netWorkMins || 0;
      snap.lateMins = entry.lateMins || 0;
      snap.otMins = entry.otMins || 0;
      snap.punchCount = entry.punchCount || 0;
      snap.rawPunches = entry.rawPunches || [];
    }
  } catch (e) {
    console.warn("[REG-SNAPSHOT]", e.message);
  }
  return snap;
}

/**
 * Create one correction request, already validated by the caller.
 *
 * @param emp  lean Employee with names, biometricId, department, designation,
 *             primaryManager
 * @throws {status, code} NO_MANAGER (400) · OPEN_REQUEST (409)
 */
async function createRegularization({
  emp,
  employeeId,
  dateStr,
  type,
  reason,
  inTime = null,
  outTime = null,
  requestedStatus = null,
  source = "employee",
  fieldSummary = null,
}) {
  // Without managersNotified nobody can ever see the request — every manager
  // queue in this codebase keys off managersNotified.managerId. ONE reporting
  // manager (services/approvalChain.js).
  const mn = approvalChain(emp);
  if (mn.length === 0) {
    throw refusal(400, "NO_MANAGER", "No manager is assigned to you yet. Ask HR to set one.");
  }

  // One open request per date. Without this an employee can file the same day
  // repeatedly and flood their manager's queue.
  const existing = await RegularizationRequest.findOne({
    employeeId,
    dateStr,
    status: { $in: OPEN_STATUSES },
  }).lean();
  if (existing) {
    throw refusal(409, "OPEN_REQUEST", "You already have a request open for that date.");
  }

  const bid = String(emp.biometricId || "").toUpperCase();
  const snap = await attendanceSnapshot(bid, dateStr);

  // "HH:mm" is materialised onto the day in IST here, once, so nothing
  // downstream has to guess what a bare time string meant. Required lazily —
  // Attendance_section is the whole attendance stack.
  const { parseTimeOnDateIST } = require("../routes/HrRoutes/Attendance_section");

  const doc = await RegularizationRequest.create({
    employeeId,
    biometricId: bid,
    employeeName: fullName(emp),
    designation: emp.designation,
    department: emp.department,
    dateStr,
    type,
    reason: String(reason).trim(),
    requestedStatus: type === "wrong_status" ? requestedStatus : requestedStatus || null,
    proposedInTime: inTime ? parseTimeOnDateIST(inTime, dateStr) : null,
    proposedOutTime: outTime ? parseTimeOnDateIST(outTime, dateStr) : null,
    // The singular-punch form is superseded by proposedInTime/proposedOutTime
    // on this path. The applier still honours it for legacy and HR-filed rows.
    proposedPunchType: null,
    proposedPunchTime: null,
    proposedPunchAction: null,
    managersNotified: mn,
    originalSnapshot: snap,
    source,
    ...(fieldSummary ? { fieldSummary } : {}),
    status: "pending",
  });

  const primary = mn.find((m) => m.type === "primary");
  notifyEmployee(primary?.managerId, {
    title: source === "field_duty" ? "Field attendance to confirm" : "Attendance correction request",
    body:
      source === "field_duty"
        ? `${firstNameOf(doc.employeeName)} worked in the field on ${dateStr}. ${String(reason).trim()}`
        : `${firstNameOf(doc.employeeName)} asked to correct ${dateStr}. Reason: ${String(reason).trim()}`,
    kind: "regularization",
    screen: "Regularize",
    id: String(doc._id),
    channelId: "general",
    categoryId: "general",
  });

  return doc;
}

module.exports = { createRegularization, attendanceSnapshot, OPEN_STATUSES, refusal };
