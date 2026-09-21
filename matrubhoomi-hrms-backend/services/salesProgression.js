// services/salesProgression.js
//
// Who decides that a step is finished, and everything that follows from it.
//
// SUBMITTING IS A CLAIM. APPROVING IS THE ANSWER.
// -----------------------------------------------
// An employee pressing Submit is saying "I have done this". The organisation
// saying "yes, you have" is a different act by a different person, and the
// customer moves on the second one. services/salesPipeline.js stores the claim;
// this file resolves it. Those are the only two places a customer's step
// changes as a result of work, and the desk's manual override below is
// deliberately a third thing with its own audit trail.
//
// HOW DOUBLE-APPROVAL IS MADE IMPOSSIBLE WITHOUT A TRANSACTION
// ------------------------------------------------------------
// Two approvers clicking at once, or one approver double-clicking, must not
// advance a customer twice. The guard is a single conditional update:
//
//     findOneAndUpdate({ _id, "approval.status": "pending" }, { ...decided })
//
// A document update in MongoDB is atomic, so exactly one caller can move a
// submission out of `pending`. Everyone else gets null back, is told the thing
// was already decided, and — crucially — never reaches the code that moves the
// customer. The decision is the lock.
//
// That is deliberately NOT a multi-document transaction. This deployment runs a
// standalone mongod, where transactions are unavailable, and the rest of this
// module has never used them. So each write after the claim is ordered to be
// individually safe and individually re-runnable: the customer's step is moved
// before the task's counters are touched, counters are RECOUNTED from their
// source rather than incremented (see recountTask), and the audit row is
// written last and can never fail the action it describes. The worst case is a
// counter that lags a step change, which the next recount corrects; the case
// that must never happen — a customer advancing twice — cannot, because only
// one caller ever gets past the claim.

"use strict";

const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");
const SalesFormSubmission = require("../models/Sales_Models/SalesFormSubmission");
const SalesEvent = require("../models/Sales_Models/SalesEvent");
const {
  fail,
  getStage,
  activateCustomerForSubmission,
  advanceLeadForSubmission,
  recountTask,
} = require("./salesPipeline");

/** Tasks that still represent outstanding work. */
const OPEN_TASK_STATUSES = ["assigned", "accepted", "in_progress", "pending_approval", "rework"];

/* ------------------------------------------------------------------ */
/* Resolving what a follow-up is actually for                          */
/* ------------------------------------------------------------------ */

/**
 * Everything a follow-up task needs to know, worked out from the CUSTOMER.
 *
 * This is the rule the whole feature turns on: the desk picks a person, and the
 * person determines the scheme, the scheme and their position determine the
 * step, and the step determines the form. Nobody chooses those three by hand —
 * not the desk, and certainly not the employee standing in a field.
 *
 * Returns `eligible: false` with a human reason rather than throwing, because
 * the customer picker needs to SHOW why somebody cannot be chosen. Creating the
 * task calls assertAssignable() below, which does throw.
 */
async function resolveFollowUpContext(leadId) {
  const lead = await SalesLead.findById(leadId).lean();
  if (!lead) throw fail("That customer no longer exists", 404);

  const out = {
    lead,
    scheme: null,
    step: null,
    template: null,
    eligible: false,
    reason: "",
    activeTask: null,
  };

  // WHERE they are is resolved before WHETHER they can be assigned. The detail
  // page draws the scheme and the ladder for a finished or pending customer too
  // — "not in a scheme, 0 of 0" for somebody who completed one is a lie the
  // early returns below used to tell.
  const scheme = await SalesScheme.findOne({ key: lead.pipelineKey }).lean();
  const step = await getStage(lead.stageKey, lead.pipelineKey);
  out.scheme = scheme;
  out.step = step;

  if (!lead.isActive) {
    out.reason = "This customer record has been deactivated.";
    return out;
  }
  if (lead.status === "pending_approval") {
    out.reason = "Their registration is still waiting for approval.";
    return out;
  }
  if (lead.status === "rejected") {
    out.reason = "Their registration was rejected.";
    return out;
  }
  if (["won", "lost"].includes(lead.status)) {
    out.reason =
      lead.status === "won"
        ? "They have already completed their scheme."
        : "They are marked lost.";
    return out;
  }

  if (!scheme) {
    out.reason = "They are not in any scheme yet.";
    return out;
  }
  if (scheme.isArchived) {
    out.reason = `Their scheme "${scheme.name}" has been archived.`;
    return out;
  }

  if (!step) {
    out.reason = `Their current step "${lead.stageKey}" is no longer part of ${scheme.name}.`;
    return out;
  }
  if (step.isArchived) {
    out.reason = `Their current step "${step.name}" has been archived.`;
    return out;
  }
  if (step.isTerminal) {
    out.reason = `They are on "${step.name}", which ends the scheme.`;
    return out;
  }

  // The form is the step's, resolved now so the desk sees WHICH version is
  // about to be frozen onto the task rather than discovering it later.
  if (step.templateId) {
    const template = await SalesFormTemplate.findById(step.templateId)
      .select("name version isActive fields")
      .lean();
    out.template = template || null;
    if (!template) {
      out.reason = `The form for "${step.name}" no longer exists.`;
      return out;
    }
    if (!template.isActive) {
      out.reason = `The form for "${step.name}" is inactive.`;
      return out;
    }
  } else {
    out.reason = `No form is configured for "${step.name}" — the sales desk has to attach one.`;
    return out;
  }

  // Somebody may already be out doing exactly this.
  const active = await SalesTask.findOne({
    "targets.leadId": lead._id,
    pipelineKey: lead.pipelineKey,
    stageKey: step.key,
    status: { $in: OPEN_TASK_STATUSES },
    isActive: true,
  })
    .select("code assignedToName status scheduledFor")
    .lean();

  if (active) {
    out.activeTask = active;
    out.reason = `${active.assignedToName || "Somebody"} already has an open task for this step (${active.code}).`;
    return out;
  }

  out.eligible = true;
  return out;
}

/**
 * The same question, as a refusal.
 *
 * `override` lets an approver create the task anyway when a duplicate is the
 * only objection — a real situation (the first employee is off sick and the
 * visit cannot wait) that should be possible but never accidental. Everything
 * else is a hard no: there is no legitimate way to assign a step-3 form to
 * somebody standing on step 1.
 */
async function assertAssignable(leadId, { override = false, actor = null } = {}) {
  const ctx = await resolveFollowUpContext(leadId);
  if (ctx.eligible) return ctx;

  if (ctx.activeTask && override) {
    await SalesEvent.record({
      kind: "task_assigned",
      leadId: ctx.lead._id,
      schemeId: ctx.scheme?._id || null,
      stageKey: ctx.step?.key || "",
      reason: `Duplicate follow-up allowed by override (existing ${ctx.activeTask.code})`,
      actorKind: actor?.kind || "desk",
      actorId: actor?.id || null,
      actorName: actor?.name || "",
      message: `A second task for this step was created deliberately alongside ${ctx.activeTask.code}`,
    });
    return { ...ctx, eligible: true, overridden: true };
  }

  throw fail(
    `${ctx.lead.name} cannot be given a follow-up right now. ${ctx.reason}`,
    409,
    ctx.activeTask ? { canOverride: true, activeTask: ctx.activeTask } : {},
  );
}

/* ------------------------------------------------------------------ */
/* Deciding                                                            */
/* ------------------------------------------------------------------ */

/** The submission, the customer and the task it belongs to, loaded together. */
async function loadDecisionContext(submissionId) {
  const submission = await SalesFormSubmission.findById(submissionId).lean();
  if (!submission) throw fail("That submission no longer exists", 404);

  const [lead, task] = await Promise.all([
    SalesLead.findById(submission.leadId).lean(),
    submission.taskId ? SalesTask.findById(submission.taskId) : null,
  ]);
  if (!lead) throw fail("The customer this submission belongs to no longer exists", 404);

  return { submission, lead, task };
}

/**
 * Accept a submission, and move the customer because of it.
 *
 * Safe to call twice. The second call reports `alreadyDecided` and changes
 * nothing — see the file header for why that is a conditional update rather
 * than a transaction.
 */
async function approveSubmission({ actor, submissionId, note = "" }) {
  const { submission: before, lead, task } = await loadDecisionContext(submissionId);

  if (before.approval?.status === "auto") {
    throw fail("This step does not require approval — it was applied when it was submitted", 409);
  }

  const when = new Date();

  // THE LOCK. Exactly one caller moves it out of pending.
  const submission = await SalesFormSubmission.findOneAndUpdate(
    { _id: submissionId, "approval.status": "pending" },
    {
      $set: {
        "approval.status": "approved",
        "approval.decidedBy": actor?.id || null,
        "approval.decidedByName": actor?.name || "",
        "approval.decidedAt": when,
        "approval.note": note || "",
      },
    },
    { new: true },
  ).lean();

  if (!submission) {
    const current = await SalesFormSubmission.findById(submissionId).lean();
    return {
      submission: current,
      lead,
      alreadyDecided: true,
      decision: current?.approval?.status || "unknown",
      advancedTo: lead.stageKey,
    };
  }

  /* ── The customer ──────────────────────────────────────────────── */

  let advancedTo = lead.stageKey;
  let completed = false;

  // THE WORLD MAY HAVE MOVED BETWEEN SUBMIT AND APPROVE, too. A conflict is
  // detected at capture; this catches the same thing at decision time — the
  // customer was moved to another scheme, or up a step by an override, while
  // this sat in the queue. Applying it would climb a ladder they are no longer
  // on. Same answer as a captured conflict: keep the record, move nobody.
  const driftedSinceSubmit =
    submission.kind !== "new_customer" &&
    !submission.conflict?.detected &&
    (submission.pipelineKey !== lead.pipelineKey || submission.stageKey !== lead.stageKey);

  if (driftedSinceSubmit) {
    await SalesFormSubmission.updateOne(
      { _id: submission._id },
      {
        $set: {
          "conflict.detected": true,
          "conflict.expectedStageKey": submission.stageKey,
          "conflict.actualStageKey": lead.stageKey,
          "conflict.note": `Approved after the customer had moved to "${lead.pipelineKey}/${lead.stageKey}" — kept as a record, not applied.`,
        },
      },
    );
    await SalesLead.pushTimeline(lead._id, {
      at: when,
      kind: "approved",
      message: `${submission.templateName} for ${submission.stageKey} accepted as a record — the customer had since moved to ${lead.stageKey}`,
      byKind: actor?.kind || "desk",
      by: actor?.id || null,
      byName: actor?.name || "",
      meta: { submissionId: submission._id },
    });
  } else if (submission.conflict?.detected) {
    // Accepted as a RECORD, not as progress. The answers were captured against
    // a step this customer has already left, and crediting their current step
    // with them would attach a survey of one rung to another. The approver is
    // saying "this is a legitimate record", not "advance them".
    await SalesLead.pushTimeline(lead._id, {
      at: when,
      kind: "approved",
      message: `Late submission for ${submission.stageKey} accepted as a record — the customer had already moved to ${lead.stageKey}`,
      byKind: actor?.kind || "desk",
      by: actor?.id || null,
      byName: actor?.name || "",
      meta: { submissionId: submission._id },
    });
  } else if (submission.kind === "new_customer") {
    const res = await activateCustomerForSubmission({ lead, submission, task, actor, when });
    advancedTo = res.advancedTo;
  } else {
    const stage = await getStage(submission.stageKey, submission.pipelineKey);
    if (!stage) {
      throw fail(
        `"${submission.stageKey}" is no longer a step of this scheme, so this submission cannot be applied. ` +
          "Use the step override if the customer should be moved anyway.",
        409,
      );
    }
    const res = await advanceLeadForSubmission({ lead, stage, submission, task, actor, when });
    advancedTo = res.advancedTo;
    completed = res.completed;
  }

  /* ── The task ──────────────────────────────────────────────────── */

  if (task) {
    const idx = task.targets.findIndex((t) => String(t.leadId) === String(lead._id));
    if (idx >= 0) {
      task.targets[idx].status = "done";
      task.targets[idx].updatedAt = when;
      task.targets[idx].rejectionNote = "";
    }
    recountTask(task, when);
    await task.save();
  }

  await SalesEvent.record({
    kind: "submission_approved",
    leadId: lead._id,
    taskId: task?._id || null,
    submissionId: submission._id,
    schemeId: submission.schemeId || lead.schemeId || null,
    stageKey: submission.stageKey,
    from: submission.stageKey,
    to: advancedTo,
    reason: note,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `${submission.templateName} approved`,
  });

  const fresh = await SalesLead.findById(lead._id).lean();
  return { submission, lead: fresh, task, advancedTo, completed, alreadyDecided: false, decision: "approved" };
}

/**
 * Refuse a submission and send the work back.
 *
 * The customer does not move, the record is KEPT — a rejected submission is
 * evidence of what was collected and why it was not accepted, and deleting it
 * would destroy the only account of a disagreement — and the task reopens for
 * the person who did it, carrying the reason down to their handset.
 */
async function rejectSubmission({ actor, submissionId, reason = "" }) {
  const text = String(reason || "").trim();
  if (!text) {
    // Rework is the point of a rejection. "No" with no reason is not something
    // anybody standing in a field can act on.
    throw fail("Say why this is being rejected — the employee has to know what to fix");
  }

  const { submission: before, lead, task } = await loadDecisionContext(submissionId);
  if (before.approval?.status === "auto") {
    throw fail("This step does not require approval, so there is nothing to reject", 409);
  }

  const when = new Date();

  const submission = await SalesFormSubmission.findOneAndUpdate(
    { _id: submissionId, "approval.status": "pending" },
    {
      $set: {
        "approval.status": "rejected",
        "approval.decidedBy": actor?.id || null,
        "approval.decidedByName": actor?.name || "",
        "approval.decidedAt": when,
        "approval.note": text,
      },
    },
    { new: true },
  ).lean();

  if (!submission) {
    const current = await SalesFormSubmission.findById(submissionId).lean();
    return {
      submission: current,
      lead,
      alreadyDecided: true,
      decision: current?.approval?.status || "unknown",
    };
  }

  /* ── The customer stays exactly where they are ─────────────────── */

  const leadUpdate = {};
  if (submission.kind === "new_customer") {
    // A refused registration does not become a customer — but the row survives,
    // so the phone number stays claimed and the next employee to knock is told
    // this person was already put forward and turned down.
    leadUpdate.status = "rejected";
  }

  await SalesLead.updateOne(
    { _id: lead._id },
    {
      ...(Object.keys(leadUpdate).length ? { $set: leadUpdate } : {}),
      $push: {
        timeline: {
          $each: [
            {
              at: when,
              kind: "rejected",
              message: `${submission.templateName} rejected — ${text}`,
              byKind: actor?.kind || "desk",
              by: actor?.id || null,
              byName: actor?.name || "",
              meta: { submissionId: submission._id, stageKey: submission.stageKey },
            },
          ],
          $position: 0,
          $slice: 200,
        },
      },
    },
  );

  /* ── The task reopens ──────────────────────────────────────────── */

  if (task) {
    const idx = task.targets.findIndex((t) => String(t.leadId) === String(lead._id));
    if (idx >= 0) {
      task.targets[idx].status = "rework";
      task.targets[idx].rejectionNote = text;
      task.targets[idx].updatedAt = when;
    }
    recountTask(task, when);
    if (["completed", "pending_approval"].includes(task.status)) task.status = "rework";
    task.completedAt = null;
    await task.save();

    await SalesEvent.record({
      kind: "task_reopened",
      leadId: lead._id,
      taskId: task._id,
      submissionId: submission._id,
      stageKey: submission.stageKey,
      reason: text,
      actorKind: actor?.kind || "desk",
      actorId: actor?.id || null,
      actorName: actor?.name || "",
      message: `${task.code} reopened for rework`,
    });
  }

  await SalesEvent.record({
    kind: "submission_rejected",
    leadId: lead._id,
    taskId: task?._id || null,
    submissionId: submission._id,
    schemeId: submission.schemeId || lead.schemeId || null,
    stageKey: submission.stageKey,
    reason: text,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `${submission.templateName} rejected`,
  });

  const fresh = await SalesLead.findById(lead._id).lean();
  return { submission, lead: fresh, task, alreadyDecided: false, decision: "rejected" };
}

/* ------------------------------------------------------------------ */
/* The two privileged corrections                                      */
/* ------------------------------------------------------------------ */

/**
 * Move a customer into a different scheme.
 *
 * This exists because the alternative — somebody editing `pipelineKey` in the
 * database — loses the fact that it happened, and "why does this customer's
 * history start halfway through a workflow they were never in" is a question
 * that gets asked years later with nobody left who remembers.
 *
 * The old scheme's run is CLOSED and kept, never rewritten. Every submission
 * made under it keeps its own scheme, step and template version, so the
 * customer's history reads as two chapters rather than one revised one.
 */
async function changeScheme({ actor, leadId, schemeKey, reason = "" }) {
  const text = String(reason || "").trim();
  if (!text) throw fail("Say why this customer is moving scheme — it is kept on their record");

  const lead = await SalesLead.findById(leadId);
  if (!lead) throw fail("That customer no longer exists", 404);

  const scheme = await SalesScheme.findOne({ key: String(schemeKey || "").toLowerCase() }).lean();
  if (!scheme) throw fail("That scheme no longer exists", 404);
  if (scheme.isArchived) throw fail(`"${scheme.name}" is archived`, 409);
  if (!scheme.isActive) throw fail(`"${scheme.name}" is closed to new customers`, 409);
  if (scheme.key === lead.pipelineKey) throw fail(`${lead.name} is already in "${scheme.name}"`, 409);

  const first = await SalesStage.findOne({
    pipelineKey: scheme.key,
    isActive: true,
    isArchived: { $ne: true },
    isTerminal: false,
  })
    .sort({ order: 1 })
    .lean();
  if (!first) throw fail(`"${scheme.name}" has no step a customer could start on`, 409);

  // Work still outstanding under the old scheme would be for steps that no
  // longer apply to this person. Cancel it deliberately rather than leaving an
  // employee holding a form for a workflow the customer has left.
  const stranded = await SalesTask.find({
    "targets.leadId": lead._id,
    pipelineKey: lead.pipelineKey,
    status: { $in: OPEN_TASK_STATUSES },
    isActive: true,
  }).select("code");

  const when = new Date();
  const fromKey = lead.pipelineKey;
  const fromStage = lead.stageKey;

  // Close the current chapter.
  const open = (lead.schemeHistory || []).findIndex((h) => h.schemeKey === fromKey && !h.to);
  if (open >= 0) {
    lead.schemeHistory[open].to = when;
    lead.schemeHistory[open].lastStageKey = fromStage;
    lead.schemeHistory[open].reason = text;
  }
  lead.schemeHistory.push({
    schemeId: scheme._id,
    schemeKey: scheme.key,
    schemeName: scheme.name,
    from: when,
    reason: text,
    by: actor?.id || null,
    byName: actor?.name || "",
  });

  lead.pipelineKey = scheme.key;
  lead.schemeId = scheme._id;
  lead.schemeAssignedAt = when;
  lead.stageKey = first.key;
  lead.stageEnteredAt = when;
  if (["won", "lost"].includes(lead.status)) lead.status = "in_progress";

  lead.stageHistory.push({
    stageKey: first.key,
    at: when,
    by: actor?.id || null,
    byName: actor?.name || "",
  });
  lead.timeline.unshift({
    at: when,
    kind: "scheme_changed",
    message: `Moved from ${fromKey} to ${scheme.name} — ${text}`,
    byKind: actor?.kind || "desk",
    by: actor?.id || null,
    byName: actor?.name || "",
    meta: { from: fromKey, to: scheme.key, fromStage, toStage: first.key },
  });
  lead.timeline = lead.timeline.slice(0, 200);

  await lead.save();

  for (const t of stranded) {
    await SalesTask.updateOne(
      { _id: t._id },
      {
        $set: {
          status: "cancelled",
          cancelledReason: `Customer moved to ${scheme.name}: ${text}`,
          completedAt: when,
        },
      },
    );
    await SalesEvent.record({
      kind: "task_cancelled",
      leadId: lead._id,
      taskId: t._id,
      reason: text,
      actorKind: actor?.kind || "desk",
      actorId: actor?.id || null,
      actorName: actor?.name || "",
      message: `${t.code} cancelled — the customer changed scheme`,
    });
  }

  await SalesEvent.record({
    kind: "scheme_changed",
    leadId: lead._id,
    schemeId: scheme._id,
    stageKey: first.key,
    from: fromKey,
    to: scheme.key,
    reason: text,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `${lead.name} moved from "${fromKey}" to "${scheme.name}"`,
    meta: { fromStage, toStage: first.key, cancelledTasks: stranded.map((t) => t.code) },
  });

  return { lead: lead.toObject(), cancelledTasks: stranded.map((t) => t.code) };
}

/**
 * Put a customer on a different step by hand.
 *
 * The escape hatch for the cases a workflow cannot express — a step done
 * offline, a mistake that has to be undone. It never touches an existing
 * submission: approved work stays approved and rejected work stays rejected,
 * because rewriting those to match a correction would destroy the record that
 * made the correction necessary.
 */
async function overrideStep({ actor, leadId, stageKey, reason = "" }) {
  const text = String(reason || "").trim();
  if (!text) throw fail("Say why this customer's step is being changed — it is kept on their record");

  const lead = await SalesLead.findById(leadId);
  if (!lead) throw fail("That customer no longer exists", 404);

  const step = await getStage(stageKey, lead.pipelineKey);
  if (!step) throw fail(`"${stageKey}" is not a step of this customer's scheme`, 404);
  if (step.isArchived) throw fail(`"${step.name}" has been archived`, 409);
  if (step.key === lead.stageKey) throw fail(`${lead.name} is already on "${step.name}"`, 409);

  const when = new Date();
  const from = lead.stageKey;

  const update = { stageKey: step.key, stageEnteredAt: when };
  if (step.isTerminal) {
    update.status = step.terminalOutcome === "won" ? "won" : "lost";
    if (step.terminalOutcome === "won") update.isCustomer = true;
  } else if (["won", "lost"].includes(lead.status)) {
    // Moving somebody off a terminal step reopens them.
    update.status = "in_progress";
    update.isCustomer = false;
  }

  await SalesLead.updateOne(
    { _id: lead._id },
    {
      $set: update,
      $push: {
        stageHistory: { stageKey: step.key, at: when, by: actor?.id || null, byName: actor?.name || "" },
        timeline: {
          $each: [
            {
              at: when,
              kind: "step_overridden",
              message: `Step changed from ${from} to ${step.key} by hand — ${text}`,
              byKind: actor?.kind || "desk",
              by: actor?.id || null,
              byName: actor?.name || "",
              meta: { from, to: step.key },
            },
          ],
          $position: 0,
          $slice: 200,
        },
      },
    },
  );

  await SalesEvent.record({
    kind: "step_overridden",
    leadId: lead._id,
    schemeId: lead.schemeId || null,
    stageKey: step.key,
    from,
    to: step.key,
    reason: text,
    actorKind: actor?.kind || "desk",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `${lead.name} moved from "${from}" to "${step.key}" by hand`,
  });

  const fresh = await SalesLead.findById(lead._id).lean();
  return { lead: fresh, from, to: step.key };
}

/* ------------------------------------------------------------------ */
/* The queue                                                           */
/* ------------------------------------------------------------------ */

/**
 * What is waiting to be decided.
 *
 * Oldest first, deliberately: the person who has been waiting longest is the
 * one to deal with next, and a queue sorted newest-first quietly starves the
 * submission that has been sitting there since Tuesday.
 */
async function pendingQueue({ kind, schemeKey, employeeId, conflictsOnly, limit = 50, skip = 0 } = {}) {
  const where = { "approval.status": "pending" };
  if (kind) where.kind = kind;
  if (schemeKey) where.pipelineKey = String(schemeKey).toLowerCase();
  if (employeeId) where.submittedBy = employeeId;
  if (conflictsOnly) where["conflict.detected"] = true;

  const [rows, total] = await Promise.all([
    SalesFormSubmission.find(where).sort({ capturedAt: 1 }).skip(Number(skip) || 0).limit(Math.min(Number(limit) || 50, 200)).lean(),
    SalesFormSubmission.countDocuments(where),
  ]);

  const leadIds = [...new Set(rows.map((r) => String(r.leadId)))];
  const leads = leadIds.length
    ? await SalesLead.find({ _id: { $in: leadIds } })
        .select("name code phone address.village stageKey pipelineKey status schemeId")
        .lean()
    : [];
  const byLead = new Map(leads.map((l) => [String(l._id), l]));

  return {
    total,
    rows: rows.map((r) => ({ ...r, lead: byLead.get(String(r.leadId)) || null })),
  };
}

module.exports = {
  OPEN_TASK_STATUSES,
  resolveFollowUpContext,
  assertAssignable,
  approveSubmission,
  rejectSubmission,
  changeScheme,
  overrideStep,
  pendingQueue,
};
