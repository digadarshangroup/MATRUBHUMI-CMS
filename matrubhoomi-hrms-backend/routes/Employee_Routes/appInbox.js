// routes/Employee_Routes/appInbox.js
//
// The employee app's inbox and its "what needs me" counts.
// Mounted at /api/employee.
//
//   GET  /notifications?limit=&before=&since=   newest first, plus the unread count
//   POST /notifications/read                    { ids: [...] } or { all: true }
//   GET  /approvals/summary                     requests waiting on ME, by kind
//
// WHY THE APP POLLS THIS
// ----------------------
// See models/EmployeeNotification.js: the native app has no push channel, so it
// reads this when it opens and on a fifteen-minute background check, and turns
// anything newer than it has seen into an Android notification of its own.

"use strict";

const express = require("express");
const router = express.Router();

const AllEmployeeAppMiddleware = require("../../Middlewear/AllEmployeeAppMiddleware");
const EmployeeNotification = require("../../models/EmployeeNotification");
const { pendingApprovalCounts, directReportCount } = require("../../services/approvalQueue");

router.get("/notifications", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const filter = { employeeId: req.user.id };

    // `since` is the background check's question — "anything after the last
    // one I showed?" — and `before` is the screen paging back through history.
    const since = req.query.since ? new Date(req.query.since) : null;
    const before = req.query.before ? new Date(req.query.before) : null;
    if (since && !Number.isNaN(since.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $gt: since };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lt: before };

    const [rows, unread] = await Promise.all([
      EmployeeNotification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      EmployeeNotification.countDocuments({ employeeId: req.user.id, readAt: null }),
    ]);

    res.json({
      success: true,
      unread,
      data: rows.map((n) => ({
        id: String(n._id),
        title: n.title,
        body: n.body,
        kind: n.kind,
        screen: n.screen,
        refId: n.refId,
        createdAt: n.createdAt,
        read: Boolean(n.readAt),
      })),
    });
  } catch (err) {
    console.error("[employee/notifications]", err);
    res.status(500).json({ success: false, message: "Could not load your notifications" });
  }
});

router.post("/notifications/read", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const filter = { employeeId: req.user.id, readAt: null };
    if (!req.body?.all) {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
        .map(String)
        .filter((id) => /^[a-f0-9]{24}$/i.test(id));
      if (!ids.length) return res.json({ success: true, data: { marked: 0 } });
      // Scoped to the caller by construction — an id belonging to somebody
      // else simply matches nothing.
      filter._id = { $in: ids };
    }
    const out = await EmployeeNotification.updateMany(filter, { $set: { readAt: new Date() } });
    res.json({ success: true, data: { marked: out.modifiedCount || 0 } });
  } catch (err) {
    console.error("[employee/notifications/read]", err);
    res.status(500).json({ success: false, message: "Could not update your notifications" });
  }
});

router.get("/approvals/summary", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const [counts, teamSize] = await Promise.all([
      pendingApprovalCounts(req.user.id),
      directReportCount(req.user.id),
    ]);
    res.json({
      success: true,
      data: {
        ...counts,
        teamSize,
        // Somebody with nobody reporting to them can still have requests to
        // finish — ones filed before their team moved — and must be able to
        // reach them.
        isManager: teamSize > 0 || counts.total > 0,
      },
    });
  } catch (err) {
    console.error("[employee/approvals/summary]", err);
    res.status(500).json({ success: false, message: "Could not count your approvals" });
  }
});

module.exports = router;
