// routes/Sales_Routes/salesTemplates.js
//
// The form designer's API: templates, and the stages they hang off.
//
// Mounted at /api/sales/templates and /api/sales/stages.
//
// THE ONE RULE WORTH KNOWING
// --------------------------
// A template with submissions against it is never edited in place. The PUT
// below bumps `version` and rewrites the fields; every submission already
// stored keeps the version and the frozen labels it was answered under, so an
// old record still renders correctly. Renaming a field KEY is refused outright
// once answers exist — a rename would silently orphan them, and "add a new
// field" is the honest alternative.

"use strict";

const express = require("express");
const router = express.Router();

const SalesFormTemplate = require("../../models/Sales_Models/SalesFormTemplate");
const SalesStage = require("../../models/Sales_Models/SalesStage");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const { deskRead, deskWrite, deskApprove, sendError } = require("./_deskAuth");

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

router.get("/templates", deskRead, async (req, res) => {
  try {
    const filter = {};
    if (req.query.includeInactive !== "true") filter.isActive = true;
    if (req.query.stage) filter.stageKey = String(req.query.stage).toLowerCase();

    const rows = await SalesFormTemplate.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

router.get("/templates/:id", deskRead, async (req, res) => {
  try {
    const row = await SalesFormTemplate.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ success: false, message: "No such template" });
    res.json({ success: true, data: row });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

/** Field keys must be unique within a template, or answers overwrite answers. */
function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return "Add at least one field";
  const seen = new Set();
  for (const f of fields) {
    if (f.type === "heading") continue;
    if (!f.key || !/^[a-zA-Z0-9_]+$/.test(f.key)) return `"${f.key || "(blank)"}" is not a valid field key`;
    if (!f.label?.trim()) return `The field "${f.key}" needs a label`;
    if (seen.has(f.key)) return `Two fields both use the key "${f.key}"`;
    seen.add(f.key);
    if (["select", "radio", "multiselect"].includes(f.type) && !(f.options || []).length) {
      return `"${f.label}" is a choice field with no choices`;
    }
  }
  return null;
}

router.post("/templates", deskWrite, async (req, res) => {
  try {
    const problem = validateFields(req.body.fields);
    if (problem) return res.status(400).json({ success: false, message: problem });
    if (!req.body.name?.trim()) return res.status(400).json({ success: false, message: "Name this form" });

    const row = await SalesFormTemplate.create({
      name: req.body.name.trim(),
      description: req.body.description || "",
      stageKey: (req.body.stageKey || "").toLowerCase(),
      pipelineKey: req.body.pipelineKey || "default",
      // Where this form hangs: the registration form, a scheme step's form, or
      // a one-off named by a task. One engine, three attachment points.
      purpose: ["new_customer", "scheme_step", "standalone"].includes(req.body.purpose)
        ? req.body.purpose
        : "standalone",
      version: 1,
      fields: (req.body.fields || []).map((f, i) => ({ ...f, order: f.order ?? i * 10 })),
      requiresOtp: Boolean(req.body.requiresOtp),
      requiresPhoto: Boolean(req.body.requiresPhoto),
      requiresLocation: req.body.requiresLocation !== false,
      createdBy: req.user?.id,
      createdByName: req.user?.name || "",
    });

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

router.put("/templates/:id", deskWrite, async (req, res) => {
  try {
    const template = await SalesFormTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: "No such template" });

    const problem = validateFields(req.body.fields);
    if (problem) return res.status(400).json({ success: false, message: problem });

    // See the file header. Counted rather than trusted to the stored counter —
    // that counter is an optimisation, and this is a correctness gate.
    const answered = await SalesFormSubmission.countDocuments({ templateId: template._id });

    if (answered > 0) {
      const before = new Set(template.fields.filter((f) => f.type !== "heading").map((f) => f.key));
      const after = new Set((req.body.fields || []).filter((f) => f.type !== "heading").map((f) => f.key));
      const removed = [...before].filter((k) => !after.has(k));

      if (removed.length && req.body.confirmRemoval !== true) {
        return res.status(409).json({
          success: false,
          code: "FIELDS_IN_USE",
          removed,
          message:
            `${answered} submission(s) already answer ${removed.join(", ")}. ` +
            "Those answers stay readable under the old version, but the field will stop being collected. " +
            "Send confirmRemoval to go ahead.",
        });
      }
    }

    template.name = req.body.name?.trim() || template.name;
    template.description = req.body.description ?? template.description;
    template.stageKey = (req.body.stageKey ?? template.stageKey).toLowerCase();
    // Absent means "leave it as it is" — an edit that forgets to send it must
    // not silently detach the registration form from its role.
    if (["new_customer", "scheme_step", "standalone"].includes(req.body.purpose)) {
      template.purpose = req.body.purpose;
    }
    template.fields = (req.body.fields || []).map((f, i) => ({ ...f, order: f.order ?? i * 10 }));
    template.requiresOtp = Boolean(req.body.requiresOtp);
    template.requiresPhoto = Boolean(req.body.requiresPhoto);
    template.requiresLocation = req.body.requiresLocation !== false;
    template.updatedBy = req.user?.id;
    // Only a template anybody has answered earns a version bump. Bumping an
    // unused one just makes the number meaningless.
    if (answered > 0) template.version += 1;

    await template.save();
    res.json({ success: true, data: template, versionBumped: answered > 0 });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

// Deactivated, never deleted: submissions point at it by id, and a form that
// vanishes takes the meaning of its own answers with it.
router.delete("/templates/:id", deskApprove, async (req, res) => {
  try {
    await SalesFormTemplate.updateOne({ _id: req.params.id }, { $set: { isActive: false } });
    await SalesStage.updateMany({ templateId: req.params.id }, { $set: { templateId: null } });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

/** Copying is how a desk safely experiments with a form that is in daily use. */
router.post("/templates/:id/duplicate", deskWrite, async (req, res) => {
  try {
    const source = await SalesFormTemplate.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ success: false, message: "No such template" });

    const copy = await SalesFormTemplate.create({
      ...source,
      _id: undefined,
      name: `${source.name} (copy)`,
      version: 1,
      submissionCount: 0,
      // A copy belongs to no stage until somebody attaches it. Inheriting the
      // stage would quietly give one rung two forms.
      stageKey: "",
      createdBy: req.user?.id,
      createdByName: req.user?.name || "",
      createdAt: undefined,
      updatedAt: undefined,
    });

    res.status(201).json({ success: true, data: copy });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

router.get("/stages", deskRead, async (req, res) => {
  try {
    const rows = await SalesStage.find({ pipelineKey: req.query.pipeline || "default" })
      .sort({ order: 1 })
      .lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

router.post("/stages", deskWrite, async (req, res) => {
  try {
    const key = String(req.body.key || "").toLowerCase().trim();
    if (!/^[a-z0-9_]+$/.test(key)) {
      return res.status(400).json({ success: false, message: "A stage key may use lowercase letters, digits and underscores" });
    }
    if (!req.body.name?.trim()) return res.status(400).json({ success: false, message: "Name this stage" });

    const row = await SalesStage.create({
      pipelineKey: req.body.pipelineKey || "default",
      key,
      name: req.body.name.trim(),
      description: req.body.description || "",
      order: Number(req.body.order) || 100,
      tone: req.body.tone || "neutral",
      templateId: req.body.templateId || null,
      requiresOtp: Boolean(req.body.requiresOtp),
      requiresPhoto: Boolean(req.body.requiresPhoto),
      requiresLocation: req.body.requiresLocation !== false,
      isTerminal: Boolean(req.body.isTerminal),
      terminalOutcome: req.body.isTerminal ? req.body.terminalOutcome || "won" : null,
      createdBy: req.user?.id,
    });

    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "A stage with that key already exists" });
    }
    sendError(res, err, "sales-templates");
  }
});

router.patch("/stages/:id", deskWrite, async (req, res) => {
  try {
    const update = {};
    for (const key of ["name", "description", "order", "tone", "templateId", "requiresOtp", "requiresPhoto", "requiresLocation", "isActive"]) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    // `key` is deliberately absent from that list: every lead, task and
    // submission stores the stage key as data, and renaming it would strand
    // all of them on a rung that no longer exists.

    const row = await SalesStage.findByIdAndUpdate(req.params.id, { $set: { ...update, updatedBy: req.user?.id } }, { new: true });
    if (!row) return res.status(404).json({ success: false, message: "No such stage" });
    res.json({ success: true, data: row });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

/** Reordering is one write per stage, sent as one list — see the note on gaps. */
router.post("/stages/reorder", deskApprove, async (req, res) => {
  try {
    const order = Array.isArray(req.body.order) ? req.body.order : [];
    await Promise.all(
      order.map((id, i) => SalesStage.updateOne({ _id: id }, { $set: { order: (i + 1) * 10 } })),
    );
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, "sales-templates");
  }
});

module.exports = router;
