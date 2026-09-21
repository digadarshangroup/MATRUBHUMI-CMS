// routes/Sales_Routes/salesOverview.js
//
// The number at the top of every sales screen.
//
// Mounted at /api/sales/overview.
//
// EVERY FIGURE HERE LINKS SOMEWHERE, and that is a design rule from DESIGN.md
// rather than a nicety: a count with no route to its detail is a count nobody
// can act on. So each block below returns the filter that produces it, and the
// web side turns that into the link — which also means the two can never
// disagree about what "overdue" meant.

"use strict";

const express = require("express");
const router = express.Router();

const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesTask = require("../../models/Sales_Models/SalesTask");
const SalesServiceRequest = require("../../models/Sales_Models/SalesServiceRequest");
const FieldDay = require("../../models/Sales_Models/FieldDay");
const { dayKey } = require("../../services/fieldTracking");
const { listStages } = require("../../services/salesPipeline");
const { deskRead, sendError } = require("./_deskAuth");

router.get("/", deskRead, async (req, res) => {
  try {
    const today = dayKey(new Date());
    const dayStart = new Date(`${today}T00:00:00.000+05:30`);
    const dayEnd = new Date(`${today}T23:59:59.999+05:30`);
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000+05:30`);

    const [
      stages,
      byStage,
      todayLeads,
      monthLeads,
      customers,
      overdueFollowUps,
      taskToday,
      openService,
      field,
    ] = await Promise.all([
      listStages("default"),

      SalesLead.aggregate([
        { $match: { isActive: true, status: { $nin: ["lost"] } } },
        { $group: { _id: "$stageKey", count: { $sum: 1 }, value: { $sum: "$estimatedValue" } } },
      ]),

      SalesLead.countDocuments({ isActive: true, createdAt: { $gte: dayStart, $lte: dayEnd } }),
      SalesLead.countDocuments({ isActive: true, createdAt: { $gte: monthStart } }),
      SalesLead.countDocuments({ isActive: true, isCustomer: true }),

      SalesLead.countDocuments({
        isActive: true,
        status: { $in: ["open", "in_progress"] },
        nextFollowUpAt: { $ne: null, $lt: new Date() },
      }),

      SalesTask.aggregate([
        { $match: { isActive: true, scheduledFor: { $gte: dayStart, $lte: dayEnd } } },
        {
          $group: {
            _id: null,
            tasks: { $sum: 1 },
            people: { $addToSet: "$assignedTo" },
            assigned: {
              $sum: {
                $cond: [
                  { $eq: ["$type", "lead_generation"] },
                  { $max: ["$targetCount", { $size: "$targets" }] },
                  { $size: "$targets" },
                ],
              },
            },
            done: { $sum: "$doneCount" },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            open: { $sum: { $cond: [{ $in: ["$status", ["assigned", "accepted", "in_progress", "pending_approval", "rework"]] }, 1, 0] } },
          },
        },
      ]),

      SalesServiceRequest.countDocuments({ isActive: true, status: { $in: ["open", "assigned", "in_progress"] } }),

      FieldDay.aggregate([
        { $match: { day: today } },
        {
          $group: {
            _id: null,
            outToday: { $sum: 1 },
            distanceMeters: { $sum: "$distanceMeters" },
            submissions: { $sum: "$submissionCount" },
          },
        },
      ]),
    ]);

    const stageCounts = new Map(byStage.map((s) => [s._id, s]));
    const t = taskToday[0] || {};
    const f = field[0] || {};

    // The month's conversion, counted the only way that is honest: of the leads
    // created this month, how many have reached a won stage. Comparing this
    // month's wins against this month's new leads (the tempting version) mixes
    // two different cohorts and reads as a much better or much worse number
    // than anything that actually happened.
    const monthWon = await SalesLead.countDocuments({
      isActive: true,
      createdAt: { $gte: monthStart },
      status: "won",
    });

    res.json({
      success: true,
      data: {
        pipeline: stages
          .filter((s) => !s.isTerminal || s.terminalOutcome === "won")
          .map((s) => ({
            key: s.key,
            name: s.name,
            tone: s.tone,
            count: stageCounts.get(s.key)?.count || 0,
            value: stageCounts.get(s.key)?.value || 0,
            filter: { stage: s.key },
          })),

        leads: {
          today: todayLeads,
          month: monthLeads,
          customers,
          overdueFollowUps,
          conversionPct: monthLeads > 0 ? Math.round((monthWon / monthLeads) * 1000) / 10 : null,
          filters: {
            today: { from: today, to: today },
            customers: { customers: "true" },
            overdue: { overdue: "true" },
          },
        },

        tasksToday: {
          tasks: t.tasks || 0,
          people: (t.people || []).length,
          assigned: t.assigned || 0,
          done: t.done || 0,
          completed: t.completed || 0,
          open: t.open || 0,
          filter: { day: today },
        },

        field: {
          outToday: f.outToday || 0,
          distanceKm: Math.round((f.distanceMeters || 0) / 100) / 10,
          submissions: f.submissions || 0,
        },

        service: { open: openService, filter: { status: "open" } },
      },
    });
  } catch (err) {
    sendError(res, err, "sales-overview");
  }
});

/* ── The trend behind the numbers ─────────────────────────────────── */

router.get("/trend", deskRead, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await SalesLead.aggregate([
      { $match: { isActive: true, createdAt: { $gte: since } } },
      {
        $group: {
          // Grouped in IST, not UTC. A lead created at 11pm belongs to that
          // evening's round, and UTC bucketing would file it under tomorrow.
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
          created: { $sum: 1 },
          won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ success: true, data: rows.map((r) => ({ day: r._id, created: r.created, won: r.won })) });
  } catch (err) {
    sendError(res, err, "sales-overview");
  }
});

module.exports = router;
