"use strict";
// routes/CEO_Routes/overview.js
//
// GET /api/ceo/overview — the company today, on one screen.
//
// Every figure here is a COUNT the executive office can click through to the
// screen that owns it (HR's attendance, the approvals queues, Sales' team map).
// Nothing is computed here that a detail screen would compute differently: the
// same filters (utils/employeeActive.js, the request statuses the queues use),
// read-only, and cheap enough to load on every visit — every query is bounded
// by today or by an indexed status.

const express = require("express");
const { readToken, verifyToken } = require("../../config/jwt");
const Employee = require("../../models/Employee");
const DailyAttendance = require("../../models/HR_Models/Dailyattendance");
const { LeaveApplication, RegularizationRequest } = require("../../models/HR_Models/LeaveManagement");
const OvertimeReport = require("../../models/HR_Models/OvertimeReport");
const FieldDay = require("../../models/Sales_Models/FieldDay");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const Announcement = require("../../models/Announcement");
const EmployeeNotification = require("../../models/EmployeeNotification");
const { activeEmployeeFilter } = require("../../utils/employeeActive");

const router = express.Router();

function ceoAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ success: false, message: "Authentication required" });
    const decoded = verifyToken(token);
    if (!["ceo", "admin", "hr_manager"].includes(decoded.role))
      return res.status(403).json({ success: false, message: "CEO access required" });
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

const IST_MS = 5.5 * 3600 * 1000;
const istDay = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
/** The instant an IST calendar day starts. */
const istStart = (day) => new Date(new Date(`${day}T00:00:00Z`).getTime() - IST_MS);

const OPEN_LEAVE = ["pending", "manager_approved", "withdraw_pending"];
const OPEN_REQUEST = ["pending", "manager_approved"];

router.get("/", ceoAuth, async (_req, res) => {
  try {
    const now = new Date();
    const today = istDay(now);
    const monthStart = istStart(`${today.slice(0, 8)}01`);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const active = (extra = {}) => activeEmployeeFilter(extra);

    const [
      headcount,
      joinersThisMonth,
      dayDoc,
      onLeave,
      leavePending,
      leaveNoManager,
      correctionsPending,
      overtimePending,
      oldestLeave,
      oldestCorrection,
      fieldDays,
      visitsToday,
      appWeek,
      appEver,
      versions,
      lastAnnouncement,
    ] = await Promise.all([
      Employee.countDocuments(active()),
      Employee.countDocuments(active({ dateOfJoining: { $gte: monthStart } })),
      DailyAttendance.findOne({ dateStr: today }).select("employees.biometricId employees.inTime employees.isLate").lean(),
      LeaveApplication.find({ status: "hr_approved", fromDate: { $lte: today }, toDate: { $gte: today } })
        .select("employeeId employeeName department leaveType isHalfDay")
        .lean(),
      LeaveApplication.countDocuments({ status: { $in: OPEN_LEAVE } }),
      LeaveApplication.countDocuments({ status: "pending", managersNotified: { $size: 0 } }),
      RegularizationRequest.countDocuments({ status: { $in: OPEN_REQUEST } }),
      OvertimeReport.countDocuments({ status: "pending" }),
      LeaveApplication.findOne({ status: { $in: OPEN_LEAVE } }).sort({ createdAt: 1 }).select("createdAt").lean(),
      RegularizationRequest.findOne({ status: { $in: OPEN_REQUEST } }).sort({ createdAt: 1 }).select("createdAt").lean(),
      FieldDay.find({ day: today })
        .select("employeeName dutyOn distanceMeters lastPingAt lastPlace lastLocality firstPingAt")
        .lean(),
      SalesFormSubmission.countDocuments({ capturedAt: { $gte: istStart(today) } }),
      Employee.countDocuments(active({ "appInfo.lastSeenAt": { $gte: weekAgo } })),
      Employee.countDocuments(active({ "appInfo.lastSeenAt": { $ne: null } })),
      Employee.aggregate([
        { $match: active({ "appInfo.version": { $exists: true, $ne: "" } }) },
        { $group: { _id: "$appInfo.version", people: { $sum: 1 } } },
        { $sort: { people: -1 } },
        { $limit: 5 },
      ]),
      Announcement.findOne({ retractedAt: null }).sort({ createdAt: -1 }).lean(),
    ]);

    // Attendance: the punch machine's day, if it has been synced yet.
    let attendance = null;
    if (dayDoc) {
      const entries = dayDoc.employees || [];
      attendance = {
        synced: true,
        present: entries.filter((e) => e.inTime).length,
        late: entries.filter((e) => e.inTime && e.isLate).length,
      };
    }

    // On leave today — one line per person, however many requests they have.
    const leaveBy = new Map();
    for (const l of onLeave) {
      const key = String(l.employeeId);
      if (!leaveBy.has(key)) leaveBy.set(key, { name: l.employeeName, department: l.department, type: l.leaveType, half: !!l.isHalfDay });
    }

    // The field team, from the rollup the tracker keeps — never from raw pings.
    const freshMs = 15 * 60 * 1000;
    const out = fieldDays.filter((d) => d.firstPingAt);
    const field = {
      out: out.length,
      onDutyNow: fieldDays.filter((d) => d.dutyOn === true).length,
      reportingNow: fieldDays.filter((d) => d.dutyOn === true && d.lastPingAt && now - new Date(d.lastPingAt) < freshMs).length,
      km: Math.round(fieldDays.reduce((s, d) => s + (d.distanceMeters || 0), 0) / 100) / 10,
      visits: visitsToday,
      leaders: [...fieldDays]
        .sort((a, b) => (b.distanceMeters || 0) - (a.distanceMeters || 0))
        .slice(0, 3)
        .filter((d) => (d.distanceMeters || 0) > 0)
        .map((d) => ({
          name: d.employeeName,
          km: Math.round((d.distanceMeters || 0) / 100) / 10,
          at: d.lastLocality || d.lastPlace || "",
          onDuty: d.dutyOn === true,
        })),
    };

    let announcement = null;
    if (lastAnnouncement) {
      const [delivered, read] = await Promise.all([
        EmployeeNotification.countDocuments({ kind: "announcement", refId: String(lastAnnouncement._id) }),
        EmployeeNotification.countDocuments({ kind: "announcement", refId: String(lastAnnouncement._id), readAt: { $ne: null } }),
      ]);
      announcement = {
        id: lastAnnouncement._id,
        title: lastAnnouncement.title,
        sentAt: lastAnnouncement.createdAt,
        sentByName: lastAnnouncement.sentByName,
        delivered,
        read,
      };
    }

    const oldest = [oldestLeave?.createdAt, oldestCorrection?.createdAt].filter(Boolean).sort((a, b) => a - b)[0] || null;

    res.json({
      success: true,
      data: {
        day: today,
        people: { headcount, joinersThisMonth },
        attendance,
        onLeave: { count: leaveBy.size, people: [...leaveBy.values()].slice(0, 8) },
        approvals: {
          leave: leavePending,
          leaveWaitingForHr: leaveNoManager,
          corrections: correctionsPending,
          overtime: overtimePending,
          total: leavePending + correctionsPending + overtimePending,
          oldestWaitingDays: oldest ? Math.floor((now - new Date(oldest)) / 86400000) : 0,
        },
        field,
        app: {
          activeThisWeek: appWeek,
          everSignedIn: appEver,
          neverSignedIn: Math.max(0, headcount - appEver),
          versions: versions.map((v) => ({ version: v._id, people: v.people })),
        },
        announcement,
      },
    });
  } catch (err) {
    console.error("[ceo/overview]", err);
    res.status(500).json({ success: false, message: "Could not load the overview" });
  }
});

module.exports = router;
