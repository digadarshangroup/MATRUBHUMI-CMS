// routes/Sales_Routes/salesApprovals.js
//
// The approval queue, the customer picker, and the two privileged corrections.
//
// Mounted at /api/sales. Approving and rejecting are `approver` work by
// definition — an editor who could accept their own team's submissions would
// make the whole separation pointless. The customer search and the workflow
// read are `viewer`, because choosing who to visit is not a write.
//
// NOTHING HERE DECIDES ANYTHING
// -----------------------------
// Every route is a thin shell over services/salesProgression.js. The rules about
// what may advance, what may not, and what happens when two approvers click at
// once live there, in one place, reachable from the desk and from any future
// caller — because a business rule implemented in a route is a business rule
// that exists once per route.

"use strict";

const express = require("express");
const router = express.Router();

const progression = require("../../services/salesProgression");
const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesTask = require("../../models/Sales_Models/SalesTask");
const SalesEvent = require("../../models/Sales_Models/SalesEvent");
const SalesScheme = require("../../models/Sales_Models/SalesScheme");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const { listSteps } = require("../../services/salesSchemes");
const { notifyVisitDecision } = require("../../services/salesNotify");
const { deskRead, deskApprove, actorFrom, sendError } = require("./_deskAuth");

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

router.get("/approvals", deskRead, async (req, res) => {
  try {
    const data = await progression.pendingQueue({
      kind: req.query.kind,
      schemeKey: req.query.scheme,
      employeeId: req.query.employee,
      conflictsOnly: req.query.conflicts === "true",
      limit: req.query.limit,
      skip: req.query.skip,
    });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, "sales/approvals");
  }
});

/**
 * One submission, with everything an approver needs to judge it without
 * opening a second screen.
 *
 * Including the customer's PREVIOUS submissions: "is this the same land size
 * they gave in March" is the question that decides most rejections, and making
 * somebody navigate away to answer it is how it stops being asked.
 */
router.get("/approvals/:id", deskRead, async (req, res) => {
  try {
    const submission = await SalesFormSubmission.findById(req.params.id).lean();
    if (!submission) return res.status(404).json({ success: false, message: "That submission no longer exists" });

    const [lead, task, scheme, history] = await Promise.all([
      SalesLead.findById(submission.leadId).lean(),
      submission.taskId ? SalesTask.findById(submission.taskId).lean() : null,
      SalesScheme.findOne({ key: submission.pipelineKey }).lean(),
      SalesFormSubmission.find({ leadId: submission.leadId, _id: { $ne: submission._id } })
        .sort({ capturedAt: -1 })
        .limit(10)
        .select("templateName templateVersion stageKey capturedAt submittedByName approval.status outcome")
        .lean(),
    ]);

    // The ladder, so the approver can see where accepting this would put them.
    const steps = scheme ? await listSteps(scheme.key) : [];

    res.json({
      success: true,
      data: {
        submission,
        lead,
        task,
        scheme,
        steps: steps.map((s) => ({ key: s.key, name: s.name, order: s.order, isTerminal: s.isTerminal })),
        history,
      },
    });
  } catch (err) {
    sendError(res, err, "sales/approvals");
  }
});

/* ------------------------------------------------------------------ */
/* Deciding                                                            */
/* ------------------------------------------------------------------ */

router.post("/approvals/:id/approve", deskApprove, async (req, res) => {
  try {
    const result = await progression.approveSubmission({
      actor: actorFrom(req),
      submissionId: req.params.id,
      note: req.body?.note || "",
    });

    // A second click is not an error. It is told plainly what already happened
    // and, critically, nothing moved a second time — see the file header on
    // salesProgression for how that is guaranteed.
    if (result.alreadyDecided) {
      return res.json({
        success: true,
        data: result,
        message: `This was already ${result.decision}.`,
      });
    }

    // The employee who filed it hears about it in the app.
    notifyVisitDecision(result, "approved", req.body?.note || "");

    const io = req.app.get("io");
    if (io) {
      // The desk room, not every connected socket — see the note in fieldApp.js.
      io.to("sales-desk").emit("sales:approval", {
        submissionId: String(result.submission._id),
        leadId: String(result.lead._id),
        decision: "approved",
        stageKey: result.advancedTo,
      });
    }

    res.json({
      success: true,
      data: result,
      message: result.completed
        ? `${result.lead.name} has completed their scheme`
        : `Approved — ${result.lead.name} is now on ${result.advancedTo}`,
    });
  } catch (err) {
    sendError(res, err, "sales/approvals");
  }
});

router.post("/approvals/:id/reject", deskApprove, async (req, res) => {
  try {
    const result = await progression.rejectSubmission({
      actor: actorFrom(req),
      submissionId: req.params.id,
      reason: req.body?.reason || "",
    });

    if (result.alreadyDecided) {
      return res.json({ success: true, data: result, message: `This was already ${result.decision}.` });
    }

    notifyVisitDecision(result, "rejected", req.body?.reason || "");

    const io = req.app.get("io");
    if (io) {
      io.to("sales-desk").emit("sales:approval", {
        submissionId: String(result.submission._id),
        leadId: String(result.lead._id),
        decision: "rejected",
      });
    }

    res.json({
      success: true,
      data: result,
      message: `Rejected — sent back to ${result.submission.submittedByName || "the employee"}`,
    });
  } catch (err) {
    sendError(res, err, "sales/approvals");
  }
});

/* ------------------------------------------------------------------ */
/* Choosing a customer to follow up                                    */
/* ------------------------------------------------------------------ */

/**
 * Search customers for the follow-up picker.
 *
 * SERVER-SIDE, always. Loading every customer into the browser to filter them
 * there works for the first year and then stops working on the day it matters,
 * on the handset-tethered laptop in a district office.
 *
 * Results say whether each person can actually be assigned and, when they
 * cannot, why — so the desk is never offered somebody it will be refused for.
 */
router.get("/customers/search", deskRead, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const where = { isActive: true };
    if (req.query.scheme) where.pipelineKey = String(req.query.scheme).toLowerCase();
    if (req.query.stage) where.stageKey = String(req.query.stage).toLowerCase();

    if (q) {
      const digits = q.replace(/\D/g, "");
      // A phone number is the strongest identifier the desk has, so a numeric
      // query is matched as one rather than being pushed through a text index
      // that would rank it against names.
      where.$or = digits.length >= 4
        ? [{ phone: new RegExp(digits) }, { altPhone: new RegExp(digits) }, { code: new RegExp(q, "i") }]
        : [
            { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
            { "address.village": new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
            { code: new RegExp(q, "i") },
          ];
    }

    const [rows, total] = await Promise.all([
      SalesLead.find(where)
        .select("name code phone address.village stageKey pipelineKey status schemeId assignedToName updatedAt")
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean(),
      SalesLead.countDocuments(where),
    ]);

    // Resolved per row so the picker can grey out who it must not offer. Only
    // for the page being shown — this is a screenful, not the whole table.
    const decorated = await Promise.all(
      rows.map(async (lead) => {
        try {
          const ctx = await progression.resolveFollowUpContext(lead._id);
          return {
            ...lead,
            schemeName: ctx.scheme?.name || "",
            stepName: ctx.step?.name || "",
            templateName: ctx.template?.name || "",
            templateVersion: ctx.template?.version || null,
            eligible: ctx.eligible,
            reason: ctx.reason,
            activeTask: ctx.activeTask || null,
          };
        } catch {
          return { ...lead, eligible: false, reason: "Could not resolve this customer's workflow." };
        }
      }),
    );

    res.json({ success: true, data: { total, rows: decorated } });
  } catch (err) {
    sendError(res, err, "sales/customers");
  }
});

/**
 * What a follow-up for this customer would be FOR.
 *
 * The desk calls this the moment a customer is chosen and shows the answer back
 * rather than asking for it — the scheme, the step and the exact form version
 * are facts about the customer, not choices for a manager to make again.
 */
router.get("/customers/:id/workflow", deskRead, async (req, res) => {
  try {
    const ctx = await progression.resolveFollowUpContext(req.params.id);
    const steps = ctx.scheme ? await listSteps(ctx.scheme.key) : [];

    // Which rungs this customer has actually had accepted, so the progress
    // strip is drawn from what happened rather than from their position. A
    // customer moved by an override has a position but not the history.
    const approved = await SalesFormSubmission.find({
      leadId: ctx.lead._id,
      "approval.status": { $in: ["approved", "auto"] },
    })
      .select("stageKey approval.decidedAt capturedAt")
      .lean();
    const done = new Set(approved.map((s) => s.stageKey));
    // Reaching a terminal step IS finishing it: there is no submission FOR the
    // rung that ends a scheme, the approval of the step before it is what puts
    // somebody there. Same rule the customer's own page applies.
    if (["won", "lost"].includes(ctx.lead.status) && ctx.step?.isTerminal) done.add(ctx.lead.stageKey);

    res.json({
      success: true,
      data: {
        lead: ctx.lead,
        scheme: ctx.scheme,
        step: ctx.step,
        template: ctx.template
          ? { id: String(ctx.template._id), name: ctx.template.name, version: ctx.template.version }
          : null,
        eligible: ctx.eligible,
        reason: ctx.reason,
        activeTask: ctx.activeTask,
        steps: steps.map((s) => ({
          key: s.key,
          name: s.name,
          order: s.order,
          isTerminal: s.isTerminal,
          requiresApproval: s.requiresApproval !== false,
          // "done" is checked before "current" only for the finished case above:
          // a customer standing on the rung that ended their scheme has not got
          // one in progress, they have got one completed.
          state:
            done.has(s.key) && (s.key !== ctx.lead.stageKey || ["won", "lost"].includes(ctx.lead.status))
              ? "done"
              : s.key === ctx.lead.stageKey
                ? "current"
                : "upcoming",
        })),
      },
    });
  } catch (err) {
    sendError(res, err, "sales/customers");
  }
});

/** The customer's durable history — events, not a reconstruction from state. */
router.get("/customers/:id/history", deskRead, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [events, submissions, tasks] = await Promise.all([
      SalesEvent.find({ leadId: req.params.id }).sort({ at: -1 }).limit(limit).lean(),
      SalesFormSubmission.find({ leadId: req.params.id })
        .sort({ capturedAt: -1 })
        .select("templateName templateVersion stageKey capturedAt submittedByName approval outcome conflict photos")
        .lean(),
      SalesTask.find({ "targets.leadId": req.params.id })
        .sort({ scheduledFor: -1 })
        .select("code title type status assignedToName stageKey stageName scheduledFor schemeName")
        .lean(),
    ]);
    res.json({ success: true, data: { events, submissions, tasks } });
  } catch (err) {
    sendError(res, err, "sales/customers");
  }
});

/* ------------------------------------------------------------------ */
/* The two privileged corrections                                      */
/* ------------------------------------------------------------------ */

router.post("/customers/:id/scheme", deskApprove, async (req, res) => {
  try {
    const result = await progression.changeScheme({
      actor: actorFrom(req),
      leadId: req.params.id,
      schemeKey: req.body?.schemeKey,
      reason: req.body?.reason || "",
    });
    res.json({
      success: true,
      data: result,
      message: result.cancelledTasks.length
        ? `Moved. ${result.cancelledTasks.length} open task(s) were cancelled: ${result.cancelledTasks.join(", ")}`
        : "Moved to the new scheme",
    });
  } catch (err) {
    sendError(res, err, "sales/customers");
  }
});

router.post("/customers/:id/step", deskApprove, async (req, res) => {
  try {
    const result = await progression.overrideStep({
      actor: actorFrom(req),
      leadId: req.params.id,
      stageKey: req.body?.stageKey,
      reason: req.body?.reason || "",
    });
    res.json({ success: true, data: result, message: `Moved from ${result.from} to ${result.to}` });
  } catch (err) {
    sendError(res, err, "sales/customers");
  }
});

module.exports = router;
