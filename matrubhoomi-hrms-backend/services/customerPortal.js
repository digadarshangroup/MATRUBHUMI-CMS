// services/customerPortal.js
//
// What a customer is allowed to see about their own progress.
//
// WHY THIS IS A SEPARATE READ MODEL AND NOT A REUSED DESK RESPONSE
// ----------------------------------------------------------------
// The desk's customer view and the customer's own view answer the same question
// for two audiences with very different rights. Handing the desk's payload to a
// farmer would leak the approver's private note, the reason a submission was
// refused, the internal codes, and every other customer's existence through a
// shared endpoint. So this file builds a deliberately SMALLER object, and the
// rule it follows is worth stating plainly:
//
//   SHOW   where they are, what is finished, what is left, and when each
//          finished step was accepted.
//   HIDE   why anything was refused, any internal note, any answer an employee
//          recorded as an assessment, and anything at all about anybody else.
//
// A rejection is a conversation between the field team and the desk. The
// customer is told their visit is "being reviewed" and, once resolved, that the
// step is complete — never that somebody doubted it. If the business later
// wants rejections shown to customers, that is a decision to take deliberately,
// not something to leak by forgetting to exclude a field.
//
// PROGRESS COMES FROM WHAT WAS APPROVED, NOT FROM WHERE THEY STAND
// ----------------------------------------------------------------
// A customer moved by an approver's manual override has a position but no
// approved submission behind the steps they skipped. Drawing the ticks from
// their position would tell them four visits happened when two did. So a step
// is "done" when there is an accepted submission for it, and the current step is
// read separately.

"use strict";

const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesFormSubmission = require("../models/Sales_Models/SalesFormSubmission");
const SalesTask = require("../models/Sales_Models/SalesTask");
const { listSteps } = require("./salesSchemes");
const { fail } = require("./salesPipeline");

/** Never show a full number back; enough to confirm we have the right one. */
function maskPhone(phone) {
  const p = String(phone || "");
  return p.length === 10 ? `${p.slice(0, 2)}xxxxxx${p.slice(-2)}` : "";
}

/**
 * Find the customer a portal login belongs to.
 *
 * A registration still waiting for approval, or one that was refused, is NOT a
 * portal account. Telling somebody "your application was rejected" through an
 * unattended web page is not how that conversation should happen, and a pending
 * one has nothing to show yet.
 */
async function findPortalCustomer(phone) {
  const lead = await SalesLead.findOne({
    phone: String(phone || "").replace(/\D/g, "").slice(-10),
    isActive: true,
    status: { $in: ["open", "in_progress", "won", "lost", "on_hold"] },
  }).lean();
  return lead || null;
}

/**
 * Everything the customer's own page renders.
 *
 * One object, one request — the page is opened on a phone on a village
 * connection, and three round trips is three chances to fail.
 */
async function progressFor(leadId) {
  const lead = await SalesLead.findById(leadId).lean();
  if (!lead) throw fail("We could not find your record", 404);

  const scheme = await SalesScheme.findOne({ key: lead.pipelineKey }).lean();
  const steps = scheme ? await listSteps(scheme.key) : [];

  // Accepted submissions only. `auto` counts — it means the step did not need a
  // second person to agree, not that it did not happen.
  const accepted = await SalesFormSubmission.find({
    leadId: lead._id,
    "approval.status": { $in: ["approved", "auto"] },
    "conflict.detected": { $ne: true },
  })
    .select("stageKey approval.decidedAt capturedAt submittedByName kind")
    .sort({ capturedAt: 1 })
    .lean();

  const doneAt = new Map();
  for (const s of accepted) {
    if (s.kind === "new_customer") continue;
    if (!doneAt.has(s.stageKey)) {
      doneAt.set(s.stageKey, {
        at: s.approval?.decidedAt || s.capturedAt,
        visitedAt: s.capturedAt,
        by: s.submittedByName || "",
      });
    }
  }

  // Is something of theirs currently being looked at? Said as a state, with no
  // hint of what anybody thinks of it.
  const waiting = await SalesFormSubmission.countDocuments({
    leadId: lead._id,
    "approval.status": "pending",
  });

  const finished = ["won", "lost"].includes(lead.status);

  // The next visit, if one is booked.
  //
  // FOLLOW-UPS ONLY, and only while there is still something to do. A New
  // Customer task is a QUOTA handed to an employee — this customer happens to
  // be one of its targets, and its step belongs to whatever pipeline the desk
  // raised it against, not to this customer's scheme. Showing it here told a
  // finished customer they had a visit coming, for a step from a workflow they
  // were never in.
  const upcoming = finished
    ? null
    : await SalesTask.findOne({
        "targets.leadId": lead._id,
        type: "follow_up",
        pipelineKey: lead.pipelineKey,
        status: { $in: ["assigned", "accepted", "in_progress", "rework"] },
        isActive: true,
      })
        .select("scheduledFor stageName assignedToName")
        .sort({ scheduledFor: 1 })
        .lean();

  const rendered = steps.map((s, i) => {
    const done = doneAt.get(s.key);
    // Reaching a terminal step IS finishing it. There is no submission FOR the
    // rung that ends a scheme — the approval of the step before it is what puts
    // somebody there — so without this the last step sits "in progress" forever
    // underneath a headline saying everything is complete.
    const finishedHere = finished && s.key === lead.stageKey;
    return {
      number: i + 1,
      name: s.name,
      description: s.description || "",
      state: done || finishedHere ? "done" : s.key === lead.stageKey ? "current" : "upcoming",
      completedAt: done?.at || (finishedHere ? lead.stageEnteredAt || lead.updatedAt : null),
      visitedBy: done?.by || "",
      isFinal: Boolean(s.isTerminal),
    };
  });

  const doneCount = rendered.filter((s) => s.state === "done").length;

  return {
    customer: {
      name: lead.name,
      reference: lead.code,
      phone: maskPhone(lead.phone),
      village: lead.address?.village || "",
      since: lead.createdAt,
    },
    scheme: scheme
      ? { name: scheme.name, description: scheme.description || "" }
      : null,
    progress: {
      completed: doneCount,
      total: rendered.length,
      // A whole number, because a progress bar that says 66.6667% reads as a
      // machine talking to itself.
      percent: rendered.length ? Math.round((doneCount / rendered.length) * 100) : 0,
      finished,
      // The one line at the top of the page. Everything else on the page
      // supports it, so it has to be true without being read alongside
      // anything.
      // "Your application is complete" rather than "all steps are complete":
      // a customer moved by an approver's override can finish without every
      // rung having an approval behind it, and the step list below would then
      // contradict a headline that counted them.
      headline: finished
        ? lead.status === "won"
          ? "Your application is complete."
          : "This application is closed."
        : waiting > 0
          ? "Your latest visit is being reviewed."
          : rendered.find((s) => s.state === "current")
            ? `Next: ${rendered.find((s) => s.state === "current").name}`
            : "Your next step will be scheduled shortly.",
    },
    steps: rendered,
    underReview: waiting > 0,
    nextVisit: upcoming
      ? { scheduledFor: upcoming.scheduledFor, step: upcoming.stageName || "", officer: upcoming.assignedToName || "" }
      : null,
  };
}

module.exports = { findPortalCustomer, progressFor, maskPhone };
