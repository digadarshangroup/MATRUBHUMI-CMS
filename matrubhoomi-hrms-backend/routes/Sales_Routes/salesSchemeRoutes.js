// routes/Sales_Routes/salesSchemeRoutes.js
//
// The desk's configuration surface: the schemes, their steps, and the one
// registration form that sits beside them.
//
// Mounted at /api/sales. Every route here is a CMS session with a role in the
// `sales` department — see _deskAuth.js for the two layers and why the second
// fails open while nobody has been granted a role yet.
//
// WHO MAY DO WHAT
// ---------------
//   viewer    read any of it
//   editor    create and edit schemes, steps and forms
//   approver  the destructive and the structural: archiving, deleting, and
//             reordering a ladder that customers are currently standing on
//
// That split is not arbitrary. Everything an editor can do here is additive or
// reversible; everything reserved for an approver changes the meaning of
// records that already exist.

"use strict";

const express = require("express");
const router = express.Router();

const schemes = require("../../services/salesSchemes");
const SalesFormTemplate = require("../../models/Sales_Models/SalesFormTemplate");
const SalesEvent = require("../../models/Sales_Models/SalesEvent");
const { deskRead, deskWrite, deskApprove, actorFrom, sendError } = require("./_deskAuth");

/* ------------------------------------------------------------------ */
/* Schemes                                                             */
/* ------------------------------------------------------------------ */

router.get("/schemes", deskRead, async (req, res) => {
  try {
    const rows = await schemes.listSchemes({ includeArchived: req.query.archived === "true" });

    // The counts the list screen shows. Done here rather than on the client so
    // a scheme's step count and its list row cannot disagree.
    const withCounts = await Promise.all(
      rows.map(async (s) => {
        const steps = await schemes.listSteps(s.key);
        const refs = await schemes.schemeReferences(s.key);
        return {
          ...s,
          stepCount: steps.length,
          customers: refs.leads,
          liveCustomers: refs.liveLeads,
          openTasks: refs.openTasks,
        };
      }),
    );

    res.json({ success: true, data: withCounts });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.post("/schemes", deskWrite, async (req, res) => {
  try {
    const scheme = await schemes.createScheme({ actor: actorFrom(req), payload: req.body });
    res.status(201).json({ success: true, data: scheme, message: `"${scheme.name}" created` });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.get("/schemes/:id", deskRead, async (req, res) => {
  try {
    const scheme = await schemes.getSchemeWithSteps(req.params.id, {
      includeArchived: req.query.archived === "true",
    });
    if (!scheme) return res.status(404).json({ success: false, message: "That scheme no longer exists" });

    // Told, not discovered. A scheme that cannot be entered should say so on
    // the screen where it is edited, not fail later in a field.
    const problems = await schemes.schemeProblems(scheme.key);
    res.json({ success: true, data: { ...scheme, problems } });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.patch("/schemes/:id", deskWrite, async (req, res) => {
  try {
    const scheme = await schemes.updateScheme({
      actor: actorFrom(req),
      schemeId: req.params.id,
      payload: req.body,
    });
    res.json({ success: true, data: scheme, message: "Saved" });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

/** What would stop this being archived or deleted. Read before the dialog. */
router.get("/schemes/:id/references", deskRead, async (req, res) => {
  try {
    const scheme = await schemes.getScheme(req.params.id);
    if (!scheme) return res.status(404).json({ success: false, message: "That scheme no longer exists" });
    const refs = await schemes.schemeReferences(scheme.key);
    res.json({
      success: true,
      data: {
        ...refs,
        canDelete: refs.leads === 0 && refs.tasks === 0 && refs.submissions === 0 && !scheme.isLegacy,
        canArchive: refs.liveLeads === 0 && refs.openTasks === 0,
      },
    });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.post("/schemes/:id/archive", deskApprove, async (req, res) => {
  try {
    const scheme = await schemes.archiveScheme({
      actor: actorFrom(req),
      schemeId: req.params.id,
      reason: req.body?.reason || "",
    });
    res.json({ success: true, data: scheme, message: `"${scheme.name}" archived` });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.post("/schemes/:id/restore", deskApprove, async (req, res) => {
  try {
    const scheme = await schemes.restoreScheme({ actor: actorFrom(req), schemeId: req.params.id });
    res.json({ success: true, data: scheme, message: `"${scheme.name}" restored` });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

router.delete("/schemes/:id", deskApprove, async (req, res) => {
  try {
    await schemes.deleteScheme({ actor: actorFrom(req), schemeId: req.params.id });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    sendError(res, err, "sales/schemes");
  }
});

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

router.get("/schemes/:id/steps", deskRead, async (req, res) => {
  try {
    const scheme = await schemes.getScheme(req.params.id);
    if (!scheme) return res.status(404).json({ success: false, message: "That scheme no longer exists" });
    const steps = await schemes.listSteps(scheme.key, { includeArchived: req.query.archived === "true" });
    res.json({ success: true, data: steps });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

router.post("/schemes/:id/steps", deskWrite, async (req, res) => {
  try {
    const step = await schemes.createStep({
      actor: actorFrom(req),
      schemeKey: req.params.id,
      payload: req.body,
    });
    res.status(201).json({ success: true, data: step, message: `"${step.name}" added` });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

router.patch("/steps/:stepId", deskWrite, async (req, res) => {
  try {
    const step = await schemes.updateStep({
      actor: actorFrom(req),
      stepId: req.params.stepId,
      payload: req.body,
    });
    res.json({ success: true, data: step, message: "Saved" });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

// Structural, and it changes what comes next for customers who are mid-scheme —
// so it sits behind the approver role, alongside the other pipeline surgery.
router.post("/schemes/:id/steps/reorder", deskApprove, async (req, res) => {
  try {
    const steps = await schemes.reorderSteps({
      actor: actorFrom(req),
      schemeKey: req.params.id,
      order: req.body?.order || [],
    });
    res.json({ success: true, data: steps, message: "Reordered" });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

router.get("/steps/:stepId/references", deskRead, async (req, res) => {
  try {
    const SalesStage = require("../../models/Sales_Models/SalesStage");
    const step = await SalesStage.findById(req.params.stepId).lean();
    if (!step) return res.status(404).json({ success: false, message: "That step no longer exists" });
    const refs = await schemes.stepReferences(step.pipelineKey, step.key);
    res.json({ success: true, data: { ...refs, canArchive: refs.standingOn === 0 && refs.openTasks === 0 } });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

router.post("/steps/:stepId/archive", deskApprove, async (req, res) => {
  try {
    const step = await schemes.archiveStep({
      actor: actorFrom(req),
      stepId: req.params.stepId,
      reason: req.body?.reason || "",
    });
    res.json({ success: true, data: step, message: `"${step.name}" archived` });
  } catch (err) {
    sendError(res, err, "sales/steps");
  }
});

/* ------------------------------------------------------------------ */
/* The registration form                                               */
/* ------------------------------------------------------------------ */

/**
 * The one form every new customer is registered with.
 *
 * Exactly one is active. It is an ordinary SalesFormTemplate — same builder,
 * same versioning, same frozen labels on every submission — marked with
 * `purpose: "new_customer"` so the field app can be handed it by name rather
 * than by guessing which stage it hangs off.
 */
router.get("/config/new-customer", deskRead, async (req, res) => {
  try {
    const template = await SalesFormTemplate.findOne({ purpose: "new_customer", isActive: true })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ success: true, data: template || null });
  } catch (err) {
    sendError(res, err, "sales/config");
  }
});

/**
 * Create the registration form, or promote an existing template into the role.
 *
 * Promoting rather than copying is deliberate: a desk that has already built
 * the right questions as a standalone survey should not have to rebuild them,
 * and a copy would start its version count again and detach every submission
 * already made against it.
 */
router.post("/config/new-customer", deskWrite, async (req, res) => {
  try {
    const actor = actorFrom(req);

    if (req.body?.templateId) {
      const promoted = await SalesFormTemplate.findById(req.body.templateId);
      if (!promoted) return res.status(404).json({ success: false, message: "That form no longer exists" });

      await SalesFormTemplate.updateMany(
        { purpose: "new_customer", _id: { $ne: promoted._id } },
        { $set: { purpose: "standalone" } },
      );
      promoted.purpose = "new_customer";
      promoted.isActive = true;
      promoted.updatedBy = actor.id;
      await promoted.save();

      await SalesEvent.record({
        kind: "template_versioned",
        to: promoted.name,
        actorKind: "desk",
        actorId: actor.id,
        actorName: actor.name,
        message: `"${promoted.name}" is now the New Customer registration form`,
      });

      return res.json({ success: true, data: promoted, message: `"${promoted.name}" is now the registration form` });
    }

    const name = String(req.body?.name || "New customer").trim();
    const created = await SalesFormTemplate.create({
      name,
      description: req.body?.description || "What the field team captures when registering somebody new.",
      purpose: "new_customer",
      stageKey: "",
      pipelineKey: "default",
      version: 1,
      fields: Array.isArray(req.body?.fields) ? req.body.fields : [],
      requiresLocation: req.body?.requiresLocation !== false,
      requiresPhoto: Boolean(req.body?.requiresPhoto),
      requiresOtp: Boolean(req.body?.requiresOtp),
      isActive: true,
      createdBy: actor.id,
      createdByName: actor.name,
    });

    await SalesFormTemplate.updateMany(
      { purpose: "new_customer", _id: { $ne: created._id } },
      { $set: { purpose: "standalone" } },
    );

    res.status(201).json({ success: true, data: created, message: `"${name}" created` });
  } catch (err) {
    sendError(res, err, "sales/config");
  }
});

module.exports = router;
