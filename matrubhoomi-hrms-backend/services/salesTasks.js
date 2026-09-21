// services/salesTasks.js
//
// Handing work out, and taking it back when the day ends.
//
// ONE DESK ACTION, N TASK DOCUMENTS
// ---------------------------------
// "Ten leads today, split across Ramesh, Sunita, Iqbal and Devi" is one thing
// the manager does and four things the employees see. createAssignment() writes
// the four, stamps them with a shared `assignmentId`, and returns them — so the
// board can group them back into the one row the manager thinks in, without
// anybody's individual count being pooled into a shared one nobody owns.
//
// THE SPLIT IS EXPLICIT, NEVER AUTOMATIC
// --------------------------------------
// The desk names a count per person. An even split of ten across four is 2.5,
// and every rounding rule you could pick is one somebody has to explain to the
// person who got three. So the web side does the arithmetic in front of the
// manager and sends per-person numbers; this function does not guess.

"use strict";

const mongoose = require("mongoose");

const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");
const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesEvent = require("../models/Sales_Models/SalesEvent");
const Employee = require("../models/Employee");
const { createWithCode } = require("./salesCodes");
const { getStage, firstStage, fail } = require("./salesPipeline");
const progression = require("./salesProgression");

/**
 * Create one task per named employee.
 *
 * @param actor     the desk user, for the audit columns
 * @param payload   { type, title, instructions, stageKey, templateId, dueAt,
 *                    scheduledFor, priority, requireOtp, requirePhoto,
 *                    requireLocation, serviceRequestId,
 *                    assignments: [{ employeeId, targetCount, leadIds }] }
 */
async function createAssignment({ actor, payload }) {
  const list = Array.isArray(payload.assignments) ? payload.assignments : [];
  if (!list.length) throw fail("Assign this to at least one person");
  if (!payload.title?.trim()) throw fail("A title is required");

  const type = payload.type || "lead_generation";
  const pipelineKey = payload.pipelineKey || "default";

  // A FOLLOW-UP resolves everything from the customer and is handled entirely
  // below — there is no scheme-wide stage or template to pick, because two
  // customers chosen in the same action can be on two different steps of two
  // different schemes.
  const isFollowUp = type === "follow_up";

  const stage = isFollowUp
    ? null
    : payload.stageKey
      ? await getStage(payload.stageKey, pipelineKey)
      : await firstStage(pipelineKey);
  if (!isFollowUp && !stage) throw fail("No sales stages are configured yet", 409);

  // The template is resolved ONCE, here, and its name and version are frozen
  // onto every task. An employee opening a task tomorrow gets the form the
  // manager chose today, even if the template has been edited since.
  const templateId = isFollowUp ? null : payload.templateId || stage.templateId || null;
  const template = templateId ? await SalesFormTemplate.findById(templateId).lean() : null;
  if (templateId && !template) throw fail("That form template no longer exists", 404);

  const scheme = isFollowUp ? null : await SalesScheme.findOne({ key: pipelineKey }).lean();

  const assignmentId = new mongoose.Types.ObjectId();
  const created = [];

  for (const row of list) {
    const employee = await Employee.findById(row.employeeId)
      .select("firstName middleName lastName biometricId isActive status")
      .lean();
    if (!employee) throw fail(`No employee found for ${row.employeeId}`, 404);
    if (employee.isActive === false) throw fail("That employee is no longer active", 409);

    const name = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(" ").trim();

    /* ── Follow-up: one task per customer, resolved from the customer ── */
    //
    // ONE CUSTOMER PER TASK, deliberately. A follow-up carries a specific
    // step's form, and two customers standing on different rungs need different
    // forms — so "visit these six" is six tasks, exactly as "ten leads across
    // four people" has always been four. The shared `assignmentId` still groups
    // them back into the one row the manager thinks in.
    if (isFollowUp) {
      const leadIds = Array.isArray(row.leadIds) ? row.leadIds : [];
      if (leadIds.length === 0) throw fail(`Pick at least one customer for ${name || "this employee"}`);

      for (const leadId of leadIds) {
        // Refuses a customer who cannot legitimately receive this work —
        // pending registration, no scheme, already finished, or somebody else
        // already out doing this exact step. `override` is how an approver
        // deliberately doubles up; nothing else gets past it.
        const ctx = await progression.assertAssignable(leadId, {
          override: Boolean(payload.allowDuplicate),
          actor,
        });

        const task = await createWithCode(SalesTask, "task", {
          title: payload.title.trim(),
          instructions: payload.instructions || "",
          type,
          assignedTo: employee._id,
          assignedToName: name,
          assignedToCode: employee.biometricId || "",
          assignedBy: actor.id,
          assignedByName: actor.name || "",
          assignmentId,

          // THE SNAPSHOT. Everything the task was assigned against is frozen
          // here, so reordering the scheme or editing the form tomorrow cannot
          // change what this employee was actually sent out to do.
          pipelineKey: ctx.lead.pipelineKey,
          schemeId: ctx.scheme._id,
          schemeVersion: ctx.scheme.version,
          schemeName: ctx.scheme.name,
          stageKey: ctx.step.key,
          stageName: ctx.step.name,
          templateId: ctx.template?._id || null,
          templateName: ctx.template?.name || "",
          templateVersion: ctx.template?.version || null,

          targetCount: 1,
          targets: [
            {
              leadId: ctx.lead._id,
              name: ctx.lead.name,
              phone: ctx.lead.phone,
              village: ctx.lead.address?.village || "",
              code: ctx.lead.code,
              status: "pending",
            },
          ],

          requireOtp: Boolean(payload.requireOtp || ctx.step.requiresOtp),
          requirePhoto: Boolean(payload.requirePhoto || ctx.step.requiresPhoto),
          requireLocation: payload.requireLocation === false ? Boolean(ctx.step.requiresLocation) : true,

          scheduledFor: payload.scheduledFor ? new Date(payload.scheduledFor) : new Date(),
          dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
          priority: payload.priority || "normal",
          status: "assigned",
        });

        await SalesLead.updateOne(
          { _id: ctx.lead._id },
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
                    message: `${ctx.step.name} assigned to ${name} under ${task.code}`,
                    byKind: "desk",
                    by: actor.id,
                    byName: actor.name || "",
                    meta: { taskId: task._id, stageKey: ctx.step.key },
                  },
                ],
                $position: 0,
                $slice: 200,
              },
            },
          },
        );

        await SalesEvent.record({
          kind: "task_assigned",
          leadId: ctx.lead._id,
          taskId: task._id,
          schemeId: ctx.scheme._id,
          stageKey: ctx.step.key,
          to: name,
          actorKind: "desk",
          actorId: actor.id,
          actorName: actor.name || "",
          message: `${ctx.step.name} for ${ctx.lead.name} assigned to ${name}`,
          meta: {
            schemeVersion: ctx.scheme.version,
            templateVersion: ctx.template?.version || null,
            overridden: Boolean(ctx.overridden),
          },
        });

        created.push(task);
      }
      continue;
    }

    /* ── New customer, and the older task shapes ─────────────────── */

    // Targeted work: resolve the named leads NOW so the phone gets a list it
    // can dial with no signal, and so a lead deleted between assignment and
    // visit is caught here rather than in a field.
    const targets = [];
    if (Array.isArray(row.leadIds) && row.leadIds.length) {
      const leads = await SalesLead.find({ _id: { $in: row.leadIds }, isActive: true })
        .select("name phone code address.village")
        .lean();
      for (const lead of leads) {
        targets.push({
          leadId: lead._id,
          name: lead.name,
          phone: lead.phone,
          village: lead.address?.village || "",
          code: lead.code,
          status: "pending",
        });
      }
      if (targets.length !== row.leadIds.length) {
        throw fail("One or more of the selected leads no longer exists", 409);
      }
    }

    const targetCount = Number(row.targetCount) || targets.length;
    if (type === "lead_generation" && targetCount <= 0) {
      throw fail(`How many new customers should ${name || "this employee"} bring in?`);
    }
    if (type !== "lead_generation" && targets.length === 0) {
      throw fail(`Pick at least one customer for ${name || "this employee"}`);
    }

    const task = await createWithCode(SalesTask, "task", {
      title: payload.title.trim(),
      instructions: payload.instructions || "",
      type,
      assignedTo: employee._id,
      assignedToName: name,
      assignedToCode: employee.biometricId || "",
      assignedBy: actor.id,
      assignedByName: actor.name || "",
      assignmentId,
      pipelineKey,
      // Frozen for the same reason the template's version is — see the
      // follow-up branch above.
      schemeId: scheme?._id || stage.schemeId || null,
      schemeVersion: scheme?.version || null,
      schemeName: scheme?.name || "",
      stageKey: stage.key,
      stageName: stage.name || "",
      templateId: template?._id || null,
      templateName: template?.name || "",
      templateVersion: template?.version || null,
      targetCount,
      targets,
      serviceRequestId: payload.serviceRequestId || null,
      // A task may TIGHTEN what its stage asks for and never loosen it — the
      // stage's rules are the floor, and a manager in a hurry cannot waive an
      // OTP the pipeline says is required.
      requireOtp: Boolean(payload.requireOtp || stage.requiresOtp),
      requirePhoto: Boolean(payload.requirePhoto || stage.requiresPhoto),
      requireLocation: payload.requireLocation === false ? Boolean(stage.requiresLocation) : true,
      scheduledFor: payload.scheduledFor ? new Date(payload.scheduledFor) : new Date(),
      dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
      priority: payload.priority || "normal",
      status: "assigned",
    });

    // Targeted work reassigns ownership of the lead as well. The person who has
    // to visit tomorrow is the person the lead belongs to — otherwise the board
    // shows a lead owned by whoever happened to create it six weeks ago.
    if (targets.length) {
      await SalesLead.updateMany(
        { _id: { $in: targets.map((t) => t.leadId) } },
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
                  message: `Assigned to ${name} under ${task.code}`,
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

    created.push(task);
  }

  return { assignmentId, tasks: created };
}

/**
 * Close out yesterday's unfinished work.
 *
 * A task nobody touched is `expired`; one that got partway is `partial`. The
 * distinction is the entire point — "did not start" and "did four of six" are
 * different conversations, and collapsing both to "incomplete" loses the one
 * the manager needs.
 *
 * Runs from a nightly cron. Idempotent, so a restart mid-run is harmless.
 */
async function closeOutOverdue({ graceHours = 6 } = {}) {
  const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000);

  const stale = await SalesTask.find({
    status: { $in: ["assigned", "accepted", "in_progress", "rework"] },
    isActive: true,
    $or: [{ dueAt: { $ne: null, $lt: cutoff } }, { dueAt: null, scheduledFor: { $lt: cutoff } }],
  }).select("_id doneCount submissionCount");

  let expired = 0;
  let partial = 0;

  for (const task of stale) {
    const touched = (task.doneCount || 0) > 0 || (task.submissionCount || 0) > 0;
    await SalesTask.updateOne(
      { _id: task._id },
      { $set: { status: touched ? "partial" : "expired", completedAt: new Date() } },
    );
    touched ? partial++ : expired++;
  }

  if (expired || partial) {
    console.log(`[sales] Closed out ${expired} untouched and ${partial} partially finished task(s).`);
  }
  return { expired, partial };
}

module.exports = { createAssignment, closeOutOverdue };
