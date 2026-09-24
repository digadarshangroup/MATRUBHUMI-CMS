// routes/Sales_Routes/salesService.js
//
// After the sale: maintenance, complaints, and the visits they turn into.
//
// Mounted at /api/sales/service-requests.

"use strict";

const express = require("express");
const router = express.Router();

const SalesServiceRequest = require("../../models/Sales_Models/SalesServiceRequest");
const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesTask = require("../../models/Sales_Models/SalesTask");
const { createWithCode } = require("../../services/salesCodes");
const { createAssignment } = require("../../services/salesTasks");
const { notifyTasksAssigned } = require("../../services/salesNotify");
const { deskRead, deskWrite, actorFrom, sendError } = require("./_deskAuth");

router.get("/", deskRead, async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.leadId) filter.leadId = req.query.leadId;

    const rows = await SalesServiceRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    sendError(res, err, "sales-service");
  }
});

router.get("/:id", deskRead, async (req, res) => {
  try {
    const request = await SalesServiceRequest.findById(req.params.id).lean();
    if (!request) return res.status(404).json({ success: false, message: "No such request" });

    const tasks = await SalesTask.find({ serviceRequestId: request._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { request, tasks } });
  } catch (err) {
    sendError(res, err, "sales-service");
  }
});

router.post("/", deskWrite, async (req, res) => {
  try {
    const lead = await SalesLead.findById(req.body.leadId).select("name phone address isCustomer code").lean();
    if (!lead) return res.status(404).json({ success: false, message: "No such customer" });

    // See the model header: a maintenance visit to somebody who never bought
    // anything means the desk picked the wrong row, and the honest response is
    // to say so rather than to create the visit.
    if (!lead.isCustomer) {
      return res.status(409).json({
        success: false,
        message: `${lead.name} (${lead.code}) is still a lead, not a customer. Service requests are raised against paying customers.`,
      });
    }

    if (!req.body.title?.trim()) return res.status(400).json({ success: false, message: "Describe what is needed" });

    const request = await createWithCode(SalesServiceRequest, "service", {
      leadId: lead._id,
      customerName: lead.name,
      customerPhone: lead.phone,
      village: lead.address?.village || "",
      type: req.body.type || "maintenance",
      title: req.body.title.trim(),
      description: req.body.description || "",
      priority: req.body.priority || "normal",
      channel: req.body.channel || "call",
      dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
      raisedBy: req.user?.id,
      raisedByName: req.user?.name || "",
      status: "open",
    });

    await SalesLead.pushTimeline(lead._id, {
      at: new Date(),
      kind: "service_raised",
      message: `Service request ${request.code} raised — ${request.title}`,
      byKind: "desk",
      by: req.user?.id,
      byName: req.user?.name || "",
      meta: { serviceRequestId: request._id },
    });

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    sendError(res, err, "sales-service");
  }
});

/**
 * Send somebody out.
 *
 * Reuses createAssignment rather than writing a task here: a service visit is a
 * task like any other, and the day it is not is the day the app has two kinds
 * of work to understand instead of one.
 */
router.post("/:id/assign", deskWrite, async (req, res) => {
  try {
    const request = await SalesServiceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: "No such request" });
    if (["resolved", "closed", "cancelled"].includes(request.status)) {
      return res.status(409).json({ success: false, message: `That request is already ${request.status}` });
    }

    const { assignmentId, tasks } = await createAssignment({
      actor: actorFrom(req),
      payload: {
        type: "service",
        title: req.body.title || `${request.type}: ${request.title}`,
        instructions: req.body.instructions || request.description,
        stageKey: req.body.stageKey || "",
        templateId: req.body.templateId || null,
        scheduledFor: req.body.scheduledFor,
        dueAt: req.body.dueAt || request.dueAt,
        priority: req.body.priority || request.priority,
        requirePhoto: req.body.requirePhoto !== false,
        requireOtp: Boolean(req.body.requireOtp),
        serviceRequestId: request._id,
        assignments: (req.body.assignments || []).map((a) => ({
          employeeId: a.employeeId,
          leadIds: [request.leadId],
        })),
      },
    });

    request.status = "assigned";
    request.taskIds.push(...tasks.map((t) => t._id));
    await request.save();

    notifyTasksAssigned(tasks);

    const io = req.app.get("io");
    if (io) {
      for (const task of tasks) {
        io.to(`employee-${task.assignedTo}`).emit("sales:task_assigned", {
          taskId: String(task._id), code: task.code, title: task.title, type: task.type,
        });
      }
    }

    res.status(201).json({ success: true, assignmentId, data: tasks });
  } catch (err) {
    sendError(res, err, "sales-service");
  }
});

router.patch("/:id", deskWrite, async (req, res) => {
  try {
    const update = {};
    for (const key of ["status", "priority", "dueAt", "description", "resolutionNote"]) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.status === "resolved" || update.status === "closed") update.resolvedAt = new Date();

    const row = await SalesServiceRequest.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "No such request" });
    res.json({ success: true, data: row });
  } catch (err) {
    sendError(res, err, "sales-service");
  }
});

module.exports = router;
