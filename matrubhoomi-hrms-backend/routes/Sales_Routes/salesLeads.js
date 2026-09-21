// routes/Sales_Routes/salesLeads.js
//
// The desk's view of every farmer and dealer, at every rung.
//
// Mounted at /api/sales/leads.

"use strict";

const express = require("express");
const router = express.Router();

const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const SalesTask = require("../../models/Sales_Models/SalesTask");
const Employee = require("../../models/Employee");
const pipeline = require("../../services/salesPipeline");
const { normalisePhone } = require("../../services/salesOtp");
const { deskRead, deskWrite, actorFrom, sendError } = require("./_deskAuth");

/** Everything the list screen filters by, read off the query string once. */
function buildFilter(query) {
  const filter = { isActive: true };

  if (query.stage) filter.stageKey = String(query.stage).toLowerCase();
  if (query.status) filter.status = String(query.status);
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.category) filter.category = String(query.category);
  if (query.customers === "true") filter.isCustomer = true;
  if (query.village) filter["address.village"] = new RegExp(String(query.village).trim(), "i");

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  }

  // Search is a regex over the two things anybody actually searches by. Not the
  // text index: a partial phone number ("98765") is a prefix, and a text index
  // matches whole tokens — so the search everybody tries would find nothing.
  if (query.q) {
    const term = String(query.q).trim();
    const digits = term.replace(/\D/g, "");
    filter.$or = [
      { name: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      { code: new RegExp(`^${term.replace(/[^\w-]/g, "")}`, "i") },
      ...(digits.length >= 4 ? [{ phone: new RegExp(digits) }] : []),
    ];
  }

  // "Needs attention": promised a follow-up and the date has passed.
  if (query.overdue === "true") {
    filter.nextFollowUpAt = { $ne: null, $lt: new Date() };
    filter.status = { $in: ["open", "in_progress"] };
  }

  return filter;
}

/* ── List ──────────────────────────────────────────────────────────── */

router.get("/", deskRead, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const filter = buildFilter(req.query);

    const [rows, total] = await Promise.all([
      SalesLead.find(filter)
        // The timeline is up to 200 entries and no list screen renders it.
        // Projecting it out is the difference between a 40KB response and a
        // 4MB one on a page of fifty.
        .select("-timeline -stageHistory")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SalesLead.countDocuments(filter),
    ]);

    res.json({ success: true, data: rows, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── The board: how many sit on each rung ─────────────────────────── */

router.get("/board", deskRead, async (req, res) => {
  try {
    const pipelineKey = req.query.pipeline || "default";
    const stages = await pipeline.listStages(pipelineKey);

    const counts = await SalesLead.aggregate([
      { $match: { isActive: true, pipelineKey, status: { $nin: ["lost"] } } },
      { $group: { _id: "$stageKey", count: { $sum: 1 }, value: { $sum: "$estimatedValue" } } },
    ]);
    const byKey = new Map(counts.map((c) => [c._id, c]));

    res.json({
      success: true,
      data: stages.map((s) => ({
        key: s.key,
        name: s.name,
        tone: s.tone,
        order: s.order,
        isTerminal: s.isTerminal,
        terminalOutcome: s.terminalOutcome,
        count: byKey.get(s.key)?.count || 0,
        value: byKey.get(s.key)?.value || 0,
      })),
    });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── One lead, with everything hanging off it ─────────────────────── */

router.get("/:id", deskRead, async (req, res) => {
  try {
    const lead = await SalesLead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ success: false, message: "No such lead" });

    const [submissions, tasks, stages] = await Promise.all([
      SalesFormSubmission.find({ leadId: lead._id }).sort({ capturedAt: -1 }).limit(50).lean(),
      SalesTask.find({ "targets.leadId": lead._id }).select("-targets").sort({ createdAt: -1 }).limit(20).lean(),
      pipeline.listStages(lead.pipelineKey || "default"),
    ]);

    res.json({
      success: true,
      data: {
        lead,
        // Maps are not JSON. Without this the answers arrive as {} and every
        // detail panel renders an empty form that looks like data loss.
        submissions: submissions.map((s) => ({
          ...s,
          values: s.values instanceof Map ? Object.fromEntries(s.values) : s.values,
          labels: s.labels instanceof Map ? Object.fromEntries(s.labels) : s.labels,
        })),
        tasks,
        stages,
      },
    });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Create, from the desk ────────────────────────────────────────── */

router.post("/", deskWrite, async (req, res) => {
  try {
    const lead = await pipeline.createLead({ payload: req.body, actor: actorFrom(req) });
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Edit the particulars ─────────────────────────────────────────── */

const EDITABLE = [
  "name", "altPhone", "email", "category", "address", "source",
  "estimatedValue", "dealValue", "tags", "notes", "nextFollowUpAt",
];

router.patch("/:id", deskWrite, async (req, res) => {
  try {
    const update = {};
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    // The phone number is the identity everything else keys off — the OTP, the
    // duplicate check, the app's dial button. Changing it is allowed, but it is
    // checked against every other lead first and it clears the verification,
    // because a code answered on the old handset proves nothing about the new.
    if (req.body.phone) {
      const phone = normalisePhone(req.body.phone);
      if (phone.length !== 10) {
        return res.status(400).json({ success: false, message: "A valid 10-digit phone number is required" });
      }
      const clash = await SalesLead.findOne({ phone, _id: { $ne: req.params.id }, isActive: true })
        .select("code name")
        .lean();
      if (clash) {
        return res.status(409).json({
          success: false,
          message: `That number already belongs to ${clash.name} (${clash.code})`,
        });
      }
      update.phone = phone;
      update.phoneVerified = false;
      update.phoneVerifiedAt = null;
    }

    const lead = await SalesLead.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: "No such lead" });

    await SalesLead.pushTimeline(lead._id, {
      at: new Date(),
      kind: "note",
      message: `Details updated by ${req.user?.name || "the sales desk"}`,
      byKind: "desk",
      by: req.user?.id,
      byName: req.user?.name || "",
      meta: { fields: Object.keys(update) },
    });

    res.json({ success: true, data: lead });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Hand it to somebody ──────────────────────────────────────────── */

router.post("/:id/assign", deskWrite, async (req, res) => {
  try {
    const employee = await Employee.findById(req.body.employeeId)
      .select("firstName middleName lastName biometricId isActive")
      .lean();
    if (!employee) return res.status(404).json({ success: false, message: "No such employee" });

    const name = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ").trim();

    const lead = await SalesLead.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          assignedTo: employee._id,
          assignedToName: name,
          assignedToCode: employee.biometricId || "",
          assignedAt: new Date(),
        },
        $push: {
          timeline: {
            $each: [{
              at: new Date(), kind: "assigned", message: `Assigned to ${name}`,
              byKind: "desk", by: req.user?.id, byName: req.user?.name || "",
            }],
            $position: 0,
            $slice: 200,
          },
        },
      },
      { new: true },
    );
    if (!lead) return res.status(404).json({ success: false, message: "No such lead" });

    res.json({ success: true, data: lead });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Move it by hand ──────────────────────────────────────────────── */

// The desk moving a lead without a form is a real and necessary thing — a
// farmer who rang in and agreed over the phone. It is recorded as exactly that:
// a manual move, by name, with no submission behind it, so it is visibly
// different from a rung climbed by somebody standing in the field.
router.post("/:id/stage", deskWrite, async (req, res) => {
  try {
    const lead = await SalesLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "No such lead" });

    const stage = await pipeline.getStage(req.body.stageKey, lead.pipelineKey);
    if (!stage) return res.status(400).json({ success: false, message: "No such stage" });

    const update = { stageKey: stage.key };
    if (stage.isTerminal) {
      update.status = stage.terminalOutcome === "won" ? "won" : "lost";
      if (stage.terminalOutcome === "won") update.isCustomer = true;
      if (stage.terminalOutcome === "lost") update.lostReason = req.body.reason || "";
    } else if (lead.status === "open") {
      update.status = "in_progress";
    }

    await SalesLead.updateOne(
      { _id: lead._id },
      {
        $set: update,
        $push: {
          stageHistory: { stageKey: stage.key, at: new Date(), byName: req.user?.name || "Sales desk" },
          timeline: {
            $each: [{
              at: new Date(),
              kind: "stage_changed",
              message: `Moved to ${stage.name} by the sales desk${req.body.reason ? ` — ${req.body.reason}` : ""}`,
              byKind: "desk",
              by: req.user?.id,
              byName: req.user?.name || "",
            }],
            $position: 0,
            $slice: 200,
          },
        },
      },
    );

    res.json({ success: true, data: await SalesLead.findById(lead._id).lean() });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Add a note ───────────────────────────────────────────────────── */

router.post("/:id/note", deskWrite, async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ success: false, message: "Write something first" });

    await SalesLead.pushTimeline(req.params.id, {
      at: new Date(),
      kind: req.body.kind || "note",
      message,
      byKind: "desk",
      by: req.user?.id,
      byName: req.user?.name || "",
    });

    if (req.body.nextFollowUpAt) {
      await SalesLead.updateOne(
        { _id: req.params.id },
        { $set: { nextFollowUpAt: new Date(req.body.nextFollowUpAt) } },
      );
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

/* ── Retire it ────────────────────────────────────────────────────── */

// Soft, always. A lead carries submissions, photographs and an OTP record, and
// a hard delete would orphan every one of them — including the proof that a
// farmer consented to something.
router.delete("/:id", deskWrite, async (req, res) => {
  try {
    await SalesLead.updateOne(
      { _id: req.params.id },
      { $set: { isActive: false, status: "lost", lostReason: req.body?.reason || "Removed by the sales desk" } },
    );
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "sales-leads");
  }
});

module.exports = router;
