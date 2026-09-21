// routes/Sales_Routes/salesTaskRoutes.js
//
// Handing out the day's work and watching it come back.
//
// Mounted at /api/sales/tasks.

"use strict";

const express = require("express");
const router = express.Router();

const SalesTask = require("../../models/Sales_Models/SalesTask");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesEvent = require("../../models/Sales_Models/SalesEvent");
const Employee = require("../../models/Employee");
const { createAssignment } = require("../../services/salesTasks");
const { deskRead, deskWrite, actorFrom, sendError } = require("./_deskAuth");

/* ── The board ────────────────────────────────────────────────────── */

router.get("/", deskRead, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);

    const filter = { isActive: true };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.employeeId) filter.assignedTo = req.query.employeeId;
    if (req.query.assignmentId) filter.assignmentId = req.query.assignmentId;

    if (req.query.day) {
      // One calendar day in the company's timezone, expressed as a UTC range —
      // the only way to ask Mongo for "Tuesday" without a per-document
      // conversion in the query.
      const start = new Date(`${req.query.day}T00:00:00.000+05:30`);
      const end = new Date(`${req.query.day}T23:59:59.999+05:30`);
      filter.scheduledFor = { $gte: start, $lte: end };
    } else if (req.query.from || req.query.to) {
      filter.scheduledFor = {};
      if (req.query.from) filter.scheduledFor.$gte = new Date(req.query.from);
      if (req.query.to) filter.scheduledFor.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
    }

    const [rows, total] = await Promise.all([
      SalesTask.find(filter).sort({ scheduledFor: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SalesTask.countDocuments(filter),
    ]);

    res.json({ success: true, data: rows, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/* ── Today, per person ────────────────────────────────────────────── */

// The morning screen: one row per employee, what they were given and where they
// have got to. Aggregated in the database rather than by fetching every task
// and grouping in JavaScript — the second approach works fine at twenty tasks
// and stops working at two thousand.
router.get("/summary", deskRead, async (req, res) => {
  try {
    const day = req.query.day || new Date().toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00.000+05:30`);
    const end = new Date(`${day}T23:59:59.999+05:30`);

    const rows = await SalesTask.aggregate([
      { $match: { isActive: true, scheduledFor: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$assignedTo",
          employeeName: { $first: "$assignedToName" },
          employeeCode: { $first: "$assignedToCode" },
          tasks: { $sum: 1 },
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
          pending: { $sum: { $cond: [{ $in: ["$status", ["assigned", "accepted", "in_progress", "pending_approval", "rework"]] }, 1, 0] } },
          lastActivityAt: { $max: "$lastActivityAt" },
        },
      },
      { $sort: { employeeName: 1 } },
    ]);

    res.json({ success: true, day, data: rows });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/* ── One task ─────────────────────────────────────────────────────── */

router.get("/:id", deskRead, async (req, res) => {
  try {
    const task = await SalesTask.findById(req.params.id).lean();
    if (!task) return res.status(404).json({ success: false, message: "No such task" });

    const submissions = await SalesFormSubmission.find({ taskId: task._id })
      .sort({ capturedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        task,
        submissions: submissions.map((s) => ({
          ...s,
          values: s.values instanceof Map ? Object.fromEntries(s.values) : s.values,
          labels: s.labels instanceof Map ? Object.fromEntries(s.labels) : s.labels,
        })),
      },
    });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/* ── Assign ───────────────────────────────────────────────────────── */

router.post("/", deskWrite, async (req, res) => {
  try {
    const { assignmentId, tasks } = await createAssignment({ actor: actorFrom(req), payload: req.body });

    // Wake the phones now rather than at the next poll. Sockets are best-effort
    // by construction — a phone in a field has no socket — so the app also
    // pulls on open, and this only shortens the wait for anybody online.
    const io = req.app.get("io");
    if (io) {
      for (const task of tasks) {
        io.to(`employee-${task.assignedTo}`).emit("sales:task_assigned", {
          taskId: String(task._id),
          code: task.code,
          title: task.title,
          type: task.type,
          targetCount: task.targetCount,
          dueAt: task.dueAt,
        });
      }
    }

    res.status(201).json({ success: true, assignmentId, data: tasks });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/* ── Change one ───────────────────────────────────────────────────── */

router.patch("/:id", deskWrite, async (req, res) => {
  try {
    const task = await SalesTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: "No such task" });
    if (["completed", "cancelled"].includes(task.status)) {
      return res.status(409).json({ success: false, message: `That task is already ${task.status}` });
    }

    for (const key of ["title", "instructions", "priority", "dueAt", "scheduledFor", "targetCount"]) {
      if (req.body[key] !== undefined) task[key] = req.body[key];
    }
    await task.save();

    res.json({ success: true, data: task });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/**
 * Hand the same work to somebody else.
 *
 * WHAT MUST NOT CHANGE, and is why this is a route rather than a PATCH field:
 * the customer, the scheme, the step, the form and its version all stay exactly
 * as they were. Reassignment moves WHO does the visit, never WHAT the visit is
 * — re-resolving the workflow here would quietly re-point a task at whatever
 * step the customer has reached since, which is the one thing the snapshot on
 * the task exists to prevent.
 *
 * Progress is carried across untouched for the same reason: a customer already
 * approved on this task does not become un-approved because a different
 * employee is now holding it.
 */
router.post("/:id/reassign", deskWrite, async (req, res) => {
  try {
    const task = await SalesTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: "No such task" });
    if (["completed", "cancelled", "expired"].includes(task.status)) {
      return res.status(409).json({ success: false, message: `That task is already ${task.status}` });
    }

    const employee = await Employee.findById(req.body?.employeeId)
      .select("firstName middleName lastName biometricId isActive")
      .lean();
    if (!employee) return res.status(404).json({ success: false, message: "No such employee" });
    if (employee.isActive === false) {
      return res.status(409).json({ success: false, message: "That employee is no longer active" });
    }
    if (String(employee._id) === String(task.assignedTo)) {
      return res.status(409).json({ success: false, message: "That task is already theirs" });
    }

    const name = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ").trim();
    const actor = actorFrom(req);
    const from = task.assignedToName || String(task.assignedTo);
    const reason = String(req.body?.reason || "").trim();

    task.assignedTo = employee._id;
    task.assignedToName = name;
    task.assignedToCode = employee.biometricId || "";
    // Back into the new person's list. A task mid-approval stays mid-approval;
    // only one that had been picked up is handed back as fresh work.
    if (["accepted", "in_progress"].includes(task.status)) task.status = "assigned";
    task.acceptedAt = null;
    await task.save();

    // The customer follows the person who now has to visit them, exactly as it
    // does at assignment.
    const leadIds = (task.targets || []).map((t) => t.leadId).filter(Boolean);
    if (leadIds.length) {
      await SalesLead.updateMany(
        { _id: { $in: leadIds } },
        {
          $set: {
            assignedTo: employee._id,
            assignedToName: name,
            assignedToCode: employee.biometricId || "",
            assignedAt: new Date(),
          },
          $push: {
            timeline: {
              $each: [
                {
                  at: new Date(),
                  kind: "assigned",
                  message: `${task.code} reassigned from ${from} to ${name}${reason ? ` — ${reason}` : ""}`,
                  byKind: "desk",
                  by: actor.id,
                  byName: actor.name || "",
                  meta: { taskId: task._id },
                },
              ],
              $position: 0,
              $slice: 200,
            },
          },
        },
      );
    }

    for (const leadId of leadIds.length ? leadIds : [null]) {
      await SalesEvent.record({
        kind: "task_reassigned",
        leadId,
        taskId: task._id,
        schemeId: task.schemeId || null,
        stageKey: task.stageKey || "",
        from,
        to: name,
        reason,
        actorKind: "desk",
        actorId: actor.id,
        actorName: actor.name || "",
        message: `${task.code} reassigned from ${from} to ${name}`,
      });
    }

    res.json({ success: true, data: task, message: `${task.code} is now ${name}'s` });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

/* ── Call it off ──────────────────────────────────────────────────── */

router.post("/:id/cancel", deskWrite, async (req, res) => {
  try {
    const task = await SalesTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: "No such task" });
    if (task.status === "completed") {
      return res.status(409).json({ success: false, message: "That task is already finished" });
    }

    task.status = "cancelled";
    task.cancelledReason = req.body?.reason || "";
    task.completedAt = new Date();
    await task.save();

    const io = req.app.get("io");
    if (io) io.to(`employee-${task.assignedTo}`).emit("sales:task_cancelled", { taskId: String(task._id) });

    res.json({ success: true, data: task });
  } catch (err) {
    sendError(res, err, "sales-tasks");
  }
});

module.exports = router;
