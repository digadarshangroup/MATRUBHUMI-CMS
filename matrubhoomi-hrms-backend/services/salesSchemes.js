// services/salesSchemes.js
//
// Designing a workflow, and refusing to design one that cannot work.
//
// A SCHEME IS A pipelineKey WITH A ROW BEHIND IT
// ----------------------------------------------
// Steps are SalesStage documents whose `pipelineKey` equals the scheme's `key`.
// That is not a coincidence to be tidied away later — it is what lets schemes
// exist at all without rewriting every lead, task and submission already
// written against `pipelineKey: "default"`. Both halves are always written
// together here (`pipelineKey` for matching, `schemeId` for populating), and
// nothing outside this file sets either.
//
// WHAT THIS FILE IS ACTUALLY FOR
// ------------------------------
// Most of it is refusal. A scheme with no usable first step hands the field a
// task nobody can start; two steps sharing a key make "which rung is this
// customer on" unanswerable; archiving a step somebody is standing on strands
// them. None of those are things the desk can see coming, and all of them are
// cheap to check here and expensive to discover in a field with one bar of
// signal. The frontend validates too, for a decent message at the point of
// typing — but a browser is not where this is enforced.
//
// VERSIONING
// ----------
// Any change to the SHAPE of a scheme — a step added, renamed, reordered,
// archived — bumps `version`. Tasks snapshot the version they were assigned
// under, so "which arrangement was this customer assigned against" stays
// answerable after the desk rearranges things. Editing a scheme's description
// does not bump it: nothing downstream interprets prose.

"use strict";

const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");
const SalesFormSubmission = require("../models/Sales_Models/SalesFormSubmission");
const SalesEvent = require("../models/Sales_Models/SalesEvent");
const { fail } = require("./salesPipeline");

/** Work that is still live, and therefore still depends on configuration. */
const OPEN_TASK_STATUSES = ["assigned", "accepted", "in_progress", "pending_approval", "rework"];
/** A customer who has somewhere left to go. */
const LIVE_LEAD_STATUSES = ["pending_approval", "open", "in_progress", "on_hold"];

/** `Kharif Advance 2026` becomes `kharif_advance_2026`. */
function keyFromName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

async function listSchemes({ includeArchived = false } = {}) {
  const where = includeArchived ? {} : { isArchived: false };
  return SalesScheme.find(where).sort({ order: 1, name: 1 }).lean();
}

async function getScheme(idOrKey) {
  if (!idOrKey) return null;
  const looksLikeId = /^[0-9a-fA-F]{24}$/.test(String(idOrKey));
  if (looksLikeId) {
    const byId = await SalesScheme.findById(idOrKey).lean();
    if (byId) return byId;
  }
  return SalesScheme.findOne({ key: String(idOrKey).toLowerCase() }).lean();
}

/** The steps of a scheme, in ladder order. Archived ones are left out. */
async function listSteps(schemeKey, { includeArchived = false } = {}) {
  const where = { pipelineKey: String(schemeKey).toLowerCase() };
  if (!includeArchived) where.isArchived = { $ne: true };
  return SalesStage.find(where).sort({ order: 1 }).lean();
}

/**
 * A scheme with its steps and each step's form, in the shape the desk's
 * builder renders and the app's bootstrap is built from.
 */
async function getSchemeWithSteps(idOrKey, opts = {}) {
  const scheme = await getScheme(idOrKey);
  if (!scheme) return null;

  const steps = await listSteps(scheme.key, opts);
  const templateIds = steps.map((s) => s.templateId).filter(Boolean);
  const templates = templateIds.length
    ? await SalesFormTemplate.find({ _id: { $in: templateIds } })
        .select("name version fields isActive submissionCount")
        .lean()
    : [];
  const byId = new Map(templates.map((t) => [String(t._id), t]));

  return {
    ...scheme,
    steps: steps.map((s) => {
      const t = s.templateId ? byId.get(String(s.templateId)) : null;
      return {
        ...s,
        template: t
          ? {
              id: String(t._id),
              name: t.name,
              version: t.version,
              fieldCount: (t.fields || []).length,
              isActive: t.isActive,
              submissionCount: t.submissionCount || 0,
            }
          : null,
      };
    }),
  };
}

/**
 * The step a customer stands on when they enter this scheme.
 *
 * The lowest-ordered active, non-archived, non-terminal step. Terminal is
 * excluded deliberately: a scheme whose first rung is also its last would
 * complete every customer the moment they were approved.
 */
async function initialStep(schemeKey) {
  return SalesStage.findOne({
    pipelineKey: String(schemeKey).toLowerCase(),
    isActive: true,
    isArchived: { $ne: true },
    isTerminal: false,
  })
    .sort({ order: 1 })
    .lean();
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Everything wrong with a scheme, as a list rather than the first thing found.
 *
 * A desk that fixes one problem and is immediately told about the next one has
 * been made to do four round trips for one edit.
 */
async function schemeProblems(schemeKey) {
  const steps = await listSteps(schemeKey, { includeArchived: false });
  const problems = [];

  if (steps.length === 0) {
    problems.push("This scheme has no steps yet.");
    return problems;
  }

  const usable = steps.filter((s) => s.isActive && !s.isTerminal);
  if (usable.length === 0) {
    problems.push(
      "Every step is terminal or inactive, so a customer entering this scheme would have nowhere to start.",
    );
  }

  const seen = new Set();
  for (const s of steps) {
    if (seen.has(s.key)) problems.push(`Two steps share the key "${s.key}".`);
    seen.add(s.key);
  }

  const orders = steps.map((s) => s.order);
  if (new Set(orders).size !== orders.length) {
    problems.push("Two steps share the same position, so their order is undefined.");
  }

  // A step that asks for a form must have one that still exists and is usable.
  const ids = steps.map((s) => s.templateId).filter(Boolean);
  if (ids.length) {
    const found = await SalesFormTemplate.find({ _id: { $in: ids } }).select("_id isActive name").lean();
    const byId = new Map(found.map((t) => [String(t._id), t]));
    for (const s of steps) {
      if (!s.templateId) continue;
      const t = byId.get(String(s.templateId));
      if (!t) problems.push(`Step "${s.name}" points at a form that no longer exists.`);
      else if (!t.isActive) problems.push(`Step "${s.name}" uses "${t.name}", which is inactive.`);
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Writing — the scheme itself                                         */
/* ------------------------------------------------------------------ */

async function createScheme({ actor, payload }) {
  const name = String(payload?.name || "").trim();
  if (!name) throw fail("A scheme needs a name");

  const key = keyFromName(payload.key || name);
  if (!key) throw fail("That name does not produce a usable key — use letters or digits");

  const clash = await SalesScheme.findOne({ key }).lean();
  if (clash) throw fail(`A scheme with the key "${key}" already exists (${clash.name})`, 409);

  const scheme = await SalesScheme.create({
    key,
    name,
    description: payload.description || "",
    order: Number(payload.order) || 100,
    isActive: payload.isActive !== false,
    createdBy: actor?.id || null,
    createdByName: actor?.name || "",
  });

  await SalesEvent.record({
    kind: "scheme_created",
    schemeId: scheme._id,
    to: name,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Scheme "${name}" created`,
  });

  return scheme;
}

/**
 * Rename, re-describe, activate or deactivate.
 *
 * The KEY is not editable here and there is no route that edits it. Every lead,
 * task, template and submission stores it; changing it would orphan all of them
 * at once, and a rename that silently splits a customer's history in half is
 * worse than being told no.
 */
async function updateScheme({ actor, schemeId, payload }) {
  const scheme = await SalesScheme.findById(schemeId);
  if (!scheme) throw fail("That scheme no longer exists", 404);

  if (payload.key && String(payload.key).toLowerCase() !== scheme.key) {
    throw fail(
      "A scheme's key cannot change once it exists — every customer, task and submission stores it. Create a new scheme instead.",
      409,
    );
  }

  const before = `${scheme.name}${scheme.isActive ? "" : " (inactive)"}`;

  if (payload.name !== undefined) scheme.name = String(payload.name).trim() || scheme.name;
  if (payload.description !== undefined) scheme.description = payload.description;
  if (payload.order !== undefined) scheme.order = Number(payload.order) || scheme.order;
  // Deactivating closes the scheme to NEW customers only. Everybody already
  // inside keeps their steps, because stopping them mid-workflow would leave
  // them with no legal move and no way for the desk to finish them off.
  if (payload.isActive !== undefined) scheme.isActive = Boolean(payload.isActive);

  scheme.updatedBy = actor?.id || null;
  scheme.updatedByName = actor?.name || "";
  await scheme.save();

  await SalesEvent.record({
    kind: "scheme_updated",
    schemeId: scheme._id,
    from: before,
    to: `${scheme.name}${scheme.isActive ? "" : " (inactive)"}`,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Scheme "${scheme.name}" updated`,
  });

  return scheme;
}

/** Bump the shape version. Called by every step change, never by prose edits. */
async function bumpVersion(schemeKey, actor) {
  await SalesScheme.updateOne(
    { key: String(schemeKey).toLowerCase() },
    {
      $inc: { version: 1 },
      $set: { updatedBy: actor?.id || null, updatedByName: actor?.name || "" },
    },
  );
}

/* ------------------------------------------------------------------ */
/* Removal, which is mostly archiving                                  */
/* ------------------------------------------------------------------ */

/** What still depends on this scheme. Empty means it was never used at all. */
async function schemeReferences(schemeKey) {
  const key = String(schemeKey).toLowerCase();
  const [leads, liveLeads, tasks, openTasks, submissions] = await Promise.all([
    SalesLead.countDocuments({ pipelineKey: key }),
    SalesLead.countDocuments({ pipelineKey: key, status: { $in: LIVE_LEAD_STATUSES }, isActive: true }),
    SalesTask.countDocuments({ pipelineKey: key }),
    SalesTask.countDocuments({ pipelineKey: key, status: { $in: OPEN_TASK_STATUSES }, isActive: true }),
    SalesFormSubmission.countDocuments({ pipelineKey: key }),
  ]);
  return { leads, liveLeads, tasks, openTasks, submissions };
}

/**
 * Archive, or refuse and say who is standing in the way.
 *
 * Deletion is only offered for a scheme nothing has ever referenced — see
 * deleteScheme. Anything with history is archived, because a submission whose
 * scheme row has vanished cannot be rendered back to the desk, and the frozen
 * labels on it were the whole promise.
 */
async function archiveScheme({ actor, schemeId, reason = "" }) {
  const scheme = await SalesScheme.findById(schemeId);
  if (!scheme) throw fail("That scheme no longer exists", 404);
  if (scheme.isArchived) return scheme;

  const refs = await schemeReferences(scheme.key);
  if (refs.liveLeads > 0 || refs.openTasks > 0) {
    throw fail(
      `"${scheme.name}" still has ${refs.liveLeads} customer(s) in progress and ${refs.openTasks} open task(s). ` +
        "Finish or move them before archiving it.",
      409,
      { liveLeads: refs.liveLeads, openTasks: refs.openTasks },
    );
  }

  scheme.isArchived = true;
  scheme.isActive = false;
  scheme.archivedAt = new Date();
  scheme.archivedReason = reason || "";
  scheme.updatedBy = actor?.id || null;
  scheme.updatedByName = actor?.name || "";
  await scheme.save();

  await SalesEvent.record({
    kind: "scheme_archived",
    schemeId: scheme._id,
    to: scheme.name,
    reason,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Scheme "${scheme.name}" archived`,
  });

  return scheme;
}

async function restoreScheme({ actor, schemeId }) {
  const scheme = await SalesScheme.findById(schemeId);
  if (!scheme) throw fail("That scheme no longer exists", 404);

  scheme.isArchived = false;
  scheme.archivedAt = null;
  scheme.archivedReason = "";
  scheme.updatedBy = actor?.id || null;
  await scheme.save();

  await SalesEvent.record({
    kind: "scheme_restored",
    schemeId: scheme._id,
    to: scheme.name,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Scheme "${scheme.name}" restored`,
  });

  return scheme;
}

/**
 * Hard delete, allowed only for a scheme nothing has ever touched.
 *
 * "Never referenced" and "not referenced right now" are different questions,
 * and this asks the first one: a scheme with a single old submission against it
 * keeps its row forever so that submission stays readable.
 */
async function deleteScheme({ actor, schemeId }) {
  const scheme = await SalesScheme.findById(schemeId);
  if (!scheme) throw fail("That scheme no longer exists", 404);
  if (scheme.isLegacy) {
    throw fail("The legacy scheme holds the pipeline this system started with and cannot be deleted", 409);
  }

  const refs = await schemeReferences(scheme.key);
  if (refs.leads || refs.tasks || refs.submissions) {
    throw fail(
      `"${scheme.name}" has history — ${refs.leads} customer(s), ${refs.tasks} task(s), ${refs.submissions} submission(s). ` +
        "Archive it instead; deleting it would make those records unreadable.",
      409,
      { archiveInstead: true, ...refs },
    );
  }

  await SalesStage.deleteMany({ pipelineKey: scheme.key });
  await SalesScheme.deleteOne({ _id: scheme._id });

  await SalesEvent.record({
    kind: "scheme_archived",
    schemeId: scheme._id,
    from: scheme.name,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Scheme "${scheme.name}" deleted — it had never been used`,
  });

  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/* Writing — the steps                                                 */
/* ------------------------------------------------------------------ */

/** Who would be stranded if this step went away. */
async function stepReferences(schemeKey, stepKey) {
  const key = String(schemeKey).toLowerCase();
  const step = String(stepKey).toLowerCase();
  const [standingOn, openTasks, submissions] = await Promise.all([
    SalesLead.countDocuments({
      pipelineKey: key,
      stageKey: step,
      status: { $in: LIVE_LEAD_STATUSES },
      isActive: true,
    }),
    SalesTask.countDocuments({
      pipelineKey: key,
      stageKey: step,
      status: { $in: OPEN_TASK_STATUSES },
      isActive: true,
    }),
    SalesFormSubmission.countDocuments({ pipelineKey: key, stageKey: step }),
  ]);
  return { standingOn, openTasks, submissions };
}

/**
 * Add a rung.
 *
 * `order` defaults to ten past the current last, matching the gap convention
 * the seeded pipeline uses — so the desk can later slide something between two
 * steps without renumbering the ladder.
 */
async function createStep({ actor, schemeKey, payload }) {
  const scheme = await getScheme(schemeKey);
  if (!scheme) throw fail("That scheme no longer exists", 404);
  if (scheme.isArchived) throw fail(`"${scheme.name}" is archived — restore it before adding steps`, 409);

  const name = String(payload?.name || "").trim();
  if (!name) throw fail("A step needs a name");

  const key = keyFromName(payload.key || name);
  if (!key) throw fail("That name does not produce a usable key — use letters or digits");

  const clash = await SalesStage.findOne({ pipelineKey: scheme.key, key }).lean();
  if (clash) throw fail(`"${scheme.name}" already has a step with the key "${key}" (${clash.name})`, 409);

  let order = Number(payload.order);
  if (!Number.isFinite(order)) {
    const last = await SalesStage.findOne({ pipelineKey: scheme.key }).sort({ order: -1 }).select("order").lean();
    order = (last?.order || 0) + 10;
  }

  if (payload.templateId) await assertTemplateUsable(payload.templateId);

  const step = await SalesStage.create({
    pipelineKey: scheme.key,
    schemeId: scheme._id,
    key,
    name,
    description: payload.description || "",
    order,
    tone: payload.tone || "neutral",
    templateId: payload.templateId || null,
    requiresOtp: Boolean(payload.requiresOtp),
    requiresPhoto: Boolean(payload.requiresPhoto),
    requiresLocation: payload.requiresLocation !== false,
    requiresApproval: payload.requiresApproval !== false,
    isTerminal: Boolean(payload.isTerminal),
    terminalOutcome: payload.isTerminal ? payload.terminalOutcome || "won" : null,
    isActive: payload.isActive !== false,
    createdBy: actor?.id || null,
    updatedBy: actor?.id || null,
  });

  await bumpVersion(scheme.key, actor);
  await SalesEvent.record({
    kind: "step_added",
    schemeId: scheme._id,
    stageKey: key,
    to: name,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Step "${name}" added to "${scheme.name}"`,
  });

  return step;
}

/** A template a step may point at: it has to exist and still be usable. */
async function assertTemplateUsable(templateId) {
  const t = await SalesFormTemplate.findById(templateId).select("_id name isActive").lean();
  if (!t) throw fail("That form template no longer exists", 404);
  if (!t.isActive) throw fail(`"${t.name}" is inactive — reactivate it or pick another form`, 409);
  return t;
}

/**
 * Change a rung.
 *
 * The step's KEY is refused the same way a scheme's is, and for the same
 * reason: every lead's `stageKey`, every task's and every submission's stores
 * it, and a rename would orphan all three at once. Renaming the step's NAME is
 * always fine — nothing compares against a name, which is exactly why
 * SalesStage's own header says never to.
 */
async function updateStep({ actor, stepId, payload }) {
  const step = await SalesStage.findById(stepId);
  if (!step) throw fail("That step no longer exists", 404);

  if (payload.key && String(payload.key).toLowerCase() !== step.key) {
    throw fail(
      "A step's key cannot change once it exists — customers, tasks and submissions all store it. Add a new step instead.",
      409,
    );
  }

  const before = step.name;

  // Turning a working rung into a terminal one ends the workflow for everybody
  // who reaches it, so it is refused while anybody is on it or heading for it.
  if (payload.isTerminal !== undefined && Boolean(payload.isTerminal) !== step.isTerminal) {
    const refs = await stepReferences(step.pipelineKey, step.key);
    if (refs.standingOn > 0) {
      throw fail(
        `${refs.standingOn} customer(s) are on "${step.name}" — changing whether it ends the scheme would change what happens to them. Move them first.`,
        409,
        refs,
      );
    }
  }

  if (payload.templateId) await assertTemplateUsable(payload.templateId);

  if (payload.name !== undefined) step.name = String(payload.name).trim() || step.name;
  if (payload.description !== undefined) step.description = payload.description;
  if (payload.tone !== undefined) step.tone = payload.tone;
  if (payload.templateId !== undefined) step.templateId = payload.templateId || null;
  if (payload.requiresOtp !== undefined) step.requiresOtp = Boolean(payload.requiresOtp);
  if (payload.requiresPhoto !== undefined) step.requiresPhoto = Boolean(payload.requiresPhoto);
  if (payload.requiresLocation !== undefined) step.requiresLocation = Boolean(payload.requiresLocation);
  if (payload.requiresApproval !== undefined) step.requiresApproval = Boolean(payload.requiresApproval);
  if (payload.isActive !== undefined) step.isActive = Boolean(payload.isActive);
  if (payload.isTerminal !== undefined) {
    step.isTerminal = Boolean(payload.isTerminal);
    step.terminalOutcome = step.isTerminal ? payload.terminalOutcome || step.terminalOutcome || "won" : null;
  }

  step.updatedBy = actor?.id || null;
  await step.save();

  await bumpVersion(step.pipelineKey, actor);
  await SalesEvent.record({
    kind: "step_updated",
    schemeId: step.schemeId,
    stageKey: step.key,
    from: before,
    to: step.name,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Step "${step.name}" updated`,
  });

  return step;
}

/**
 * Rearrange the ladder.
 *
 * Reordering does NOT move anybody: a customer's `stageKey` is where they
 * stand, and that is untouched. What it changes is what comes NEXT for them,
 * because the next rung is "the lowest order above this one". That is the
 * intended behaviour of a reorder and it is safe — but it is worth being
 * explicit that an in-flight customer's remaining path can change under them,
 * which is why it bumps the version and writes an event naming the new order.
 *
 * @param order [{ key, order }] — every step in the scheme, positions included
 */
async function reorderSteps({ actor, schemeKey, order = [] }) {
  const scheme = await getScheme(schemeKey);
  if (!scheme) throw fail("That scheme no longer exists", 404);
  if (!Array.isArray(order) || order.length === 0) throw fail("Send the steps in their new order");

  const steps = await listSteps(scheme.key, { includeArchived: true });
  const known = new Map(steps.map((s) => [s.key, s]));

  const positions = new Map();
  for (const row of order) {
    const key = String(row?.key || "").toLowerCase();
    if (!known.has(key)) throw fail(`"${key}" is not a step of ${scheme.name}`, 409);
    const at = Number(row.order);
    if (!Number.isFinite(at)) throw fail(`"${key}" has no position`);
    if ([...positions.values()].includes(at)) throw fail("Two steps cannot share the same position", 409);
    positions.set(key, at);
  }

  await Promise.all(
    [...positions.entries()].map(([key, at]) =>
      SalesStage.updateOne(
        { pipelineKey: scheme.key, key },
        { $set: { order: at, updatedBy: actor?.id || null } },
      ),
    ),
  );

  await bumpVersion(scheme.key, actor);

  const after = await listSteps(scheme.key);
  await SalesEvent.record({
    kind: "step_reordered",
    schemeId: scheme._id,
    to: after.map((s) => s.key).join(" → "),
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Steps of "${scheme.name}" reordered`,
  });

  return after;
}

/**
 * Retire a rung, or refuse while somebody is standing on it.
 *
 * Archiving keeps the row — submissions captured against it must still resolve
 * its name years later — and only hides it from the builder and from the
 * ladder a customer can advance along.
 */
async function archiveStep({ actor, stepId, reason = "" }) {
  const step = await SalesStage.findById(stepId);
  if (!step) throw fail("That step no longer exists", 404);
  if (step.isArchived) return step;

  const refs = await stepReferences(step.pipelineKey, step.key);
  if (refs.standingOn > 0 || refs.openTasks > 0) {
    throw fail(
      `"${step.name}" still has ${refs.standingOn} customer(s) on it and ${refs.openTasks} open task(s). ` +
        "Move them on before archiving it.",
      409,
      refs,
    );
  }

  const remaining = await SalesStage.countDocuments({
    pipelineKey: step.pipelineKey,
    isActive: true,
    isArchived: { $ne: true },
    isTerminal: false,
    _id: { $ne: step._id },
  });
  if (remaining === 0) {
    throw fail(
      `"${step.name}" is the only step a customer could start on — a scheme without one cannot be entered.`,
      409,
    );
  }

  step.isArchived = true;
  step.isActive = false;
  step.archivedAt = new Date();
  step.updatedBy = actor?.id || null;
  await step.save();

  await bumpVersion(step.pipelineKey, actor);
  await SalesEvent.record({
    kind: "step_archived",
    schemeId: step.schemeId,
    stageKey: step.key,
    to: step.name,
    reason,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Step "${step.name}" archived`,
  });

  return step;
}

module.exports = {
  OPEN_TASK_STATUSES,
  LIVE_LEAD_STATUSES,
  keyFromName,
  listSchemes,
  getScheme,
  getSchemeWithSteps,
  listSteps,
  initialStep,
  schemeProblems,
  schemeReferences,
  createScheme,
  updateScheme,
  bumpVersion,
  archiveScheme,
  restoreScheme,
  deleteScheme,
  stepReferences,
  assertTemplateUsable,
  createStep,
  updateStep,
  reorderSteps,
  archiveStep,
};
