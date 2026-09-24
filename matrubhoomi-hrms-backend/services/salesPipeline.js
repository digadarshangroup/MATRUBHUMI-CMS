// services/salesPipeline.js
//
// The one place a lead moves.
//
// EVERY ROUTE THAT ADVANCES A LEAD COMES THROUGH recordSubmission()
// -----------------------------------------------------------------
// Storing a filled form touches five documents: the submission itself, the
// lead's stage and timeline, the task's target row and counters, the template's
// usage count, and the day's rollup. Spread across the app-facing route and the
// desk-facing route, those five would drift within a month — the classic
// symptom being a lead whose stage says "surveyed" while its task still shows
// the visit pending, because one caller updated four of the five.
//
// So both routes hand their input here and this file owns the consequences.
//
// WHAT IS ENFORCED HERE RATHER THAN IN THE APP
// --------------------------------------------
// Required fields, OTP, photo and location gates. The Android app checks all of
// them too, for a decent error message at the point of typing — but an app
// build is a copy of the rules running on a device somebody else owns, not the
// rules themselves. A submission that skips a required OTP is refused here,
// whatever version of the app sent it.

"use strict";

const mongoose = require("mongoose");

const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesEvent = require("../models/Sales_Models/SalesEvent");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");
const SalesFormSubmission = require("../models/Sales_Models/SalesFormSubmission");
const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesOtp = require("../models/Sales_Models/SalesOtp");
const { createWithCode } = require("./salesCodes");
const { consumeOtp, normalisePhone } = require("./salesOtp");
const { noteFieldActivity } = require("./fieldTracking");

/** Shorthand for an error a route should render as a 4xx rather than a 500. */
function fail(message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { status, expose: true, ...extra });
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

async function listStages(pipelineKey = "default") {
  return SalesStage.find({ pipelineKey, isActive: true }).sort({ order: 1 }).lean();
}

async function getStage(stageKey, pipelineKey = "default") {
  if (!stageKey) return null;
  return SalesStage.findOne({ pipelineKey, key: String(stageKey).toLowerCase() }).lean();
}

/** The rung after this one, or null at the top of the ladder. */
async function nextStage(stageKey, pipelineKey = "default") {
  const current = await getStage(stageKey, pipelineKey);
  if (!current) return null;
  return SalesStage.findOne({
    pipelineKey,
    isActive: true,
    order: { $gt: current.order },
    isTerminal: false,
  })
    .sort({ order: 1 })
    .lean();
}

/**
 * The step that ENDS this scheme, if the ladder runs out into one.
 *
 * nextStage() deliberately skips terminal rungs, which left the ladder with no
 * way to be finished: a customer on the last working step had no next step, was
 * not themselves on a terminal one, and simply stopped. This finds the ending
 * they were walking towards.
 *
 * Only a `won` ending is ever returned. Losing somebody is a decision the desk
 * takes, not something a customer should arrive at by successfully completing
 * every step asked of them — and the seeded pipeline's "Lost" rung sits at
 * order 900 precisely so nothing walks into it.
 */
async function terminalAfter(stageKey, pipelineKey = "default") {
  const current = await getStage(stageKey, pipelineKey);
  if (!current) return null;
  return SalesStage.findOne({
    pipelineKey,
    isActive: true,
    isArchived: { $ne: true },
    isTerminal: true,
    terminalOutcome: "won",
    order: { $gt: current.order },
  })
    .sort({ order: 1 })
    .lean();
}

async function firstStage(pipelineKey = "default") {
  return SalesStage.findOne({ pipelineKey, isActive: true }).sort({ order: 1 }).lean();
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * Which form this visit is asked to fill.
 *
 * The task wins over the stage, deliberately: the desk assigning "go and do a
 * soil survey on these six" has picked a template on purpose, and a stage
 * default that silently overrode it would make that choice meaningless.
 */
async function resolveTemplate({ task, stage, templateId }) {
  const id = templateId || task?.templateId || stage?.templateId;
  if (!id) return null;
  return SalesFormTemplate.findById(id);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const EMPTY = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** True when a conditional field is not currently in play. */
function isHidden(field, values) {
  const cond = field.showWhen;
  if (!cond?.field) return false;
  const other = values[cond.field];
  // Loose compare on purpose: a select stores "yes" as a string and a checkbox
  // stores true as a boolean, and the desk writing the condition should not
  // have to know which.
  // eslint-disable-next-line eqeqeq
  return !(other == cond.equals);
}

/**
 * Check the answers against the template and return them coerced.
 *
 * Coercion matters as much as rejection: a number field arriving as "12" from a
 * text input on a handset must be stored as 12, or every later sum over it is a
 * string concatenation.
 */
function validateValues(template, rawValues = {}, photos = []) {
  const values = { ...rawValues };
  const labels = {};
  const errors = [];

  for (const field of template.fields || []) {
    if (field.type === "heading") continue;
    labels[field.key] = field.label;

    if (isHidden(field, values)) {
      delete values[field.key];
      continue;
    }

    let value = values[field.key];

    if (field.type === "photo") {
      const shot = photos.filter((p) => p.fieldKey === field.key);
      if (field.required && shot.length === 0) errors.push(`${field.label} needs at least one photo`);
      if (shot.length > (field.maxPhotos || 3)) {
        errors.push(`${field.label} allows at most ${field.maxPhotos || 3} photos`);
      }
      // The URLs live on the submission's own photos[], never duplicated into
      // values — one copy, so a deleted photo cannot survive in the answers.
      delete values[field.key];
      continue;
    }

    if (EMPTY(value)) {
      if (field.required) errors.push(`${field.label} is required`);
      continue;
    }

    switch (field.type) {
      case "number":
      case "currency":
      case "area":
      case "rating": {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          errors.push(`${field.label} must be a number`);
          break;
        }
        if (field.min !== null && field.min !== undefined && n < field.min) {
          errors.push(`${field.label} must be at least ${field.min}`);
        }
        if (field.max !== null && field.max !== undefined && n > field.max) {
          errors.push(`${field.label} must be at most ${field.max}`);
        }
        value = n;
        break;
      }
      case "phone": {
        const p = normalisePhone(value);
        if (p.length !== 10) errors.push(`${field.label} must be a 10-digit phone number`);
        value = p;
        break;
      }
      case "email": {
        const e = String(value).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.push(`${field.label} must be an email address`);
        value = e;
        break;
      }
      case "date":
      case "time":
        value = String(value).trim();
        break;
      case "select":
      case "radio": {
        const allowed = (field.options || []).map((o) => o.value);
        if (allowed.length && !allowed.includes(String(value))) {
          errors.push(`${field.label} is not one of the offered choices`);
        }
        value = String(value);
        break;
      }
      case "multiselect": {
        const allowed = (field.options || []).map((o) => o.value);
        const arr = Array.isArray(value) ? value.map(String) : [String(value)];
        if (allowed.length && arr.some((v) => !allowed.includes(v))) {
          errors.push(`${field.label} contains a choice that is not offered`);
        }
        value = arr;
        break;
      }
      case "checkbox":
        value = Boolean(value);
        break;
      case "location":
        if (typeof value !== "object" || !Number.isFinite(Number(value.lat))) {
          errors.push(`${field.label} needs a captured location`);
        }
        break;
      default: {
        value = String(value).trim();
        if (field.maxLength && value.length > field.maxLength) {
          errors.push(`${field.label} must be ${field.maxLength} characters or fewer`);
        }
        if (field.pattern) {
          try {
            if (!new RegExp(field.pattern).test(value)) errors.push(`${field.label} is not in the expected format`);
          } catch {
            // A malformed pattern is the template author's bug, not the field
            // employee's — never block a visit over it.
          }
        }
      }
    }

    values[field.key] = value;
  }

  // Answers to fields the template no longer has. Dropped rather than stored:
  // a value with no label is unreadable to everybody downstream.
  for (const key of Object.keys(values)) {
    if (!labels[key]) delete values[key];
  }

  return { values, labels, errors };
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

/**
 * An existing lead with this phone number, if there is one.
 *
 * A farmer who was visited in March and is knocked on again in July is one
 * person. Creating a second row splits their history in half and lets two
 * employees each believe they own the relationship.
 */
async function findByPhone(phone) {
  const mobile = normalisePhone(phone);
  if (mobile.length !== 10) return null;
  return SalesLead.findOne({ phone: mobile, isActive: true });
}

/**
 * Everything createLead has to decide, decided — and NOTHING written.
 *
 * Split out so a caller can find out which scheme, step and phone number a new
 * customer would get, run its own checks, and only then commit. recordSubmission
 * needs exactly that: it used to create the customer before it had checked the
 * location fix, the photograph and the answers, so a visit refused for having no
 * location still left a customer behind — and the employee's corrected retry
 * was then refused with "already recorded", locking them out of their own task
 * for that farmer with no way forward.
 *
 * Throws the same refusals in the same order as before, so nothing a caller
 * already handles changes shape.
 */
async function resolveNewLead({ payload, actor }) {
  const phone = normalisePhone(payload.phone);
  if (!payload.name?.trim()) throw fail("A name is required");
  if (phone.length !== 10) throw fail("A valid 10-digit phone number is required");

  const existing = await findByPhone(phone);
  if (existing) {
    throw fail(`${existing.name} is already recorded under ${existing.code}`, 409, {
      leadId: String(existing._id),
      code: existing.code,
    });
  }

  /* ── Which workflow does this person belong to? ─────────────────── */
  //
  // The employee chooses the scheme in the field, from the list configuration
  // gave them — it is never hardcoded and never guessed here. Naming one pins
  // the customer to that scheme and puts them on its FIRST step; the legacy
  // path (no scheme named) keeps the old behaviour of the default pipeline, so
  // every caller written before schemes existed still works.
  const schemeKey = payload.schemeKey || payload.pipelineKey || "default";
  const scheme = await SalesScheme.findOne({ key: String(schemeKey).toLowerCase() }).lean();

  if (payload.schemeKey) {
    if (!scheme) throw fail(`There is no scheme called "${payload.schemeKey}"`, 404);
    if (scheme.isArchived) throw fail(`"${scheme.name}" has been archived and cannot take new customers`, 409);
    if (!scheme.isActive) throw fail(`"${scheme.name}" is closed to new customers`, 409);
  }

  const stage = payload.schemeKey
    ? // The scheme's own first rung, never the task's stage: a quota task's
      // stage belongs to the pipeline the DESK assigned from, and the customer
      // belongs to the scheme the EMPLOYEE chose.
      await SalesStage.findOne({
        pipelineKey: scheme.key,
        isActive: true,
        isArchived: { $ne: true },
        isTerminal: false,
      })
        .sort({ order: 1 })
        .lean()
    : payload.stageKey
      ? await getStage(payload.stageKey, payload.pipelineKey || "default")
      : await firstStage(payload.pipelineKey || "default");

  if (!stage) {
    throw fail(
      payload.schemeKey
        ? `"${scheme.name}" has no step a customer could start on — ask the sales desk to add one`
        : "No sales stages are configured yet",
      409,
    );
  }

  return { payload, phone, scheme, stage };
}

/**
 * Register a customer.
 *
 * `resolved` is what resolveNewLead already worked out, for a caller that
 * needed to know before committing. Left out, this does the resolving itself —
 * which is every other caller, unchanged.
 */
async function createLead({ payload, actor, task = null, resolved = null }) {
  const { phone, scheme, stage } = resolved || (await resolveNewLead({ payload, actor }));

  // Resolved a moment ago, committed now — and somebody else may have knocked
  // on the same door in between. `phone` carries no unique index, so this
  // second look is the only thing standing between two employees and two
  // copies of one farmer.
  if (resolved) {
    const raced = await findByPhone(phone);
    if (raced) {
      throw fail(`${raced.name} is already recorded under ${raced.code}`, 409, {
        leadId: String(raced._id),
        code: raced.code,
      });
    }
  }

  const lead = await createWithCode(SalesLead, "lead", {
    name: payload.name.trim(),
    phone,
    altPhone: normalisePhone(payload.altPhone) || "",
    email: (payload.email || "").trim().toLowerCase(),
    category: payload.category || "farmer",
    address: payload.address || {},
    geo: payload.geo || {},
    source: payload.source || (actor.kind === "employee" ? "field_visit" : "call_in"),
    pipelineKey: stage.pipelineKey,
    schemeId: scheme?._id || stage.schemeId || null,
    schemeAssignedAt: new Date(),
    stageKey: stage.key,
    stageEnteredAt: new Date(),
    // A registration made in the FIELD is provisional until the desk accepts
    // it — that is the whole point of the approval step. The row exists
    // immediately all the same, so that the next employee to knock on the same
    // door is told the farmer is already recorded rather than creating a second
    // copy of them; duplicate protection cannot work against records that do
    // not exist yet.
    //
    // A customer entered by the desk is entered by somebody who already holds
    // the authority to enter them, and starts open.
    status: actor.kind === "employee" ? "pending_approval" : "open",
    schemeHistory: scheme
      ? [
          {
            schemeId: scheme._id,
            schemeKey: scheme.key,
            schemeName: scheme.name,
            from: new Date(),
            reason: "Chosen at registration",
            by: actor.id,
            byName: actor.name || "",
          },
        ]
      : [],
    assignedTo: payload.assignedTo || (actor.kind === "employee" ? actor.id : null),
    assignedToName: payload.assignedToName || (actor.kind === "employee" ? actor.name : ""),
    assignedToCode: payload.assignedToCode || (actor.kind === "employee" ? actor.code || "" : ""),
    assignedAt: new Date(),
    createdByKind: actor.kind,
    createdBy: actor.id,
    createdByName: actor.name || "",
    originTaskId: task?._id || null,
    estimatedValue: Number(payload.estimatedValue) || 0,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    notes: payload.notes || "",
    nextFollowUpAt: payload.nextFollowUpAt || null,
    stageHistory: [
      { stageKey: stage.key, at: new Date(), by: actor.kind === "employee" ? actor.id : null, byName: actor.name || "" },
    ],
    timeline: [
      {
        at: new Date(),
        kind: "created",
        message: scheme
          ? `Registered under ${scheme.name}${task ? ` on ${task.code}` : ""}`
          : `Lead created${task ? ` under ${task.code}` : ""}`,
        byKind: actor.kind,
        by: actor.id,
        byName: actor.name || "",
      },
    ],
  });

  await SalesEvent.record({
    kind: "customer_created",
    leadId: lead._id,
    taskId: task?._id || null,
    schemeId: scheme?._id || null,
    stageKey: stage.key,
    to: lead.code,
    actorKind: actor.kind,
    actorId: actor.id,
    actorName: actor.name || "",
    message: scheme
      ? `${lead.name} registered under "${scheme.name}" at ${stage.key}`
      : `${lead.name} created at ${stage.key}`,
    meta: { provisional: lead.status === "pending_approval" },
  });

  if (scheme) {
    await SalesEvent.record({
      kind: "scheme_assigned",
      leadId: lead._id,
      schemeId: scheme._id,
      stageKey: stage.key,
      to: scheme.name,
      actorKind: actor.kind,
      actorId: actor.id,
      actorName: actor.name || "",
      message: `Assigned to "${scheme.name}" at registration`,
    });
  }

  return lead;
}

/* ------------------------------------------------------------------ */
/* The one write path                                                  */
/* ------------------------------------------------------------------ */

/**
 * Store a filled form and move everything it touches.
 *
 * @param employee  { id, name, code } — the person who filled it
 * @param input     see the route; `clientRef` makes a retry idempotent
 * @returns { submission, lead, task, advancedTo }
 */
async function recordSubmission({ employee, input }) {
  const {
    leadId,
    newLead,
    taskId,
    templateId,
    values = {},
    photos = [],
    location = {},
    otpId = null,
    clientRef = "",
    device = {},
    capturedAt,
    wasQueued = false,
    outcome = "progressed",
    note = "",
    advance = true,
  } = input;

  // Idempotency first, before anything is created. The offline queue retries a
  // submission whose response was lost, and without this the farmer gets two
  // records and the employee gets credit twice.
  if (clientRef) {
    const already = await SalesFormSubmission.findOne({ clientRef }).lean();
    if (already) {
      const lead = await SalesLead.findById(already.leadId).lean();
      return { submission: already, lead, task: null, advancedTo: already.stageKey, duplicate: true };
    }
  }

  const actor = { kind: "employee", id: employee.id, name: employee.name, code: employee.code };

  const task = taskId ? await SalesTask.findById(taskId) : null;
  if (taskId && !task) throw fail("That task no longer exists", 404);
  if (task && String(task.assignedTo) !== String(employee.id)) {
    throw fail("That task is assigned to somebody else", 403);
  }
  if (task && ["cancelled", "expired"].includes(task.status)) {
    throw fail(`That task was ${task.status} — nothing can be recorded against it`, 409);
  }

  let lead = leadId ? await SalesLead.findById(leadId) : null;
  if (leadId && !lead) throw fail("That lead no longer exists", 404);

  // NOTHING IS WRITTEN UNTIL EVERY GATE BELOW HAS PASSED.
  //
  // A new customer is only RESOLVED here — name checked, number checked against
  // the existing book, scheme and first step worked out — and is committed
  // further down, once the location fix, the photograph and the answers have all
  // been accepted. Creating them here instead meant a visit refused for having
  // no location still left a customer record behind, and the employee's
  // corrected retry was then refused as a duplicate of the ghost the refusal
  // had just made.
  let pendingLead = null;
  if (!lead) {
    if (!newLead) throw fail("Either an existing lead or the details of a new one are required");
    pendingLead = await resolveNewLead({
      payload: { ...newLead, stageKey: task?.stageKey || newLead.stageKey },
      actor,
    });
  }

  // Which of the two workflows produced this. Needed here as well as below,
  // because it decides which document the step is read from.
  const createdNewLead = !leadId;

  // The step and the number, read from whichever of the two exists yet.
  const leadPhone = lead ? lead.phone : pendingLead.phone;
  const leadStageKey = lead ? lead.stageKey : pendingLead.stage.key;

  const pipelineKey = (lead ? lead.pipelineKey : pendingLead.stage.pipelineKey) || "default";

  // THE STEP BELONGS TO THE CUSTOMER, NOT TO THE TASK.
  //
  // A New Customer task is a quota — "bring me ten" — and is raised against
  // whatever pipeline the desk was looking at. The customer it produces belongs
  // to the scheme the EMPLOYEE chose in the field, which is usually a different
  // one. Reading the step off the task would then look for a rung of the desk's
  // pipeline inside the employee's scheme and find nothing.
  //
  // For a follow-up the task's step is authoritative and is used as given: it
  // was snapshotted at assignment precisely so that it does NOT drift to
  // wherever the customer has since moved.
  const stageKey = createdNewLead ? leadStageKey : task?.stageKey || input.stageKey || leadStageKey;
  const stage = await getStage(stageKey, pipelineKey);
  if (!stage) {
    throw fail(
      `"${stageKey}" is not a step of ${pipelineKey === "default" ? "the default pipeline" : `"${pipelineKey}"`}`,
      400,
    );
  }

  const template = await resolveTemplate({ task, stage, templateId });
  if (!template) throw fail("No form is configured for this stage — ask the sales desk to attach one", 409);

  // The scheme's shape at the moment of capture, frozen for the same reason the
  // template's version is: so an old submission can still say which arrangement
  // of the workflow it belonged to. A task that snapshotted one at assignment
  // wins, because that is the arrangement the employee was actually sent out
  // against.
  const schemeVersion =
    task?.schemeVersion ??
    (await SalesScheme.findOne({ key: pipelineKey }).select("version").lean())?.version ??
    null;

  /* ── The gates ─────────────────────────────────────────────────── */

  const needsOtp = Boolean(task?.requireOtp || stage.requiresOtp || template.requiresOtp);
  const needsPhoto = Boolean(task?.requirePhoto || stage.requiresPhoto || template.requiresPhoto);
  const needsLocation = task ? task.requireLocation : stage.requiresLocation || template.requiresLocation;

  // An "outcome" that is not progress skips the gates on purpose: a farmer who
  // did not answer the door cannot supply an OTP, and demanding one would leave
  // the employee with no way to record what actually happened.
  const progressing = outcome === "progressed";

  let otpRow = null;
  if (needsOtp && progressing) {
    otpRow = await consumeOtp(otpId, null);
    if (!otpRow) throw fail("This stage needs the customer's phone verified before it can be recorded", 428);
    if (normalisePhone(otpRow.phone) !== normalisePhone(leadPhone)) {
      throw fail("The verified number does not match this lead's phone number", 409);
    }
  }

  if (needsLocation && progressing) {
    if (!Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
      throw fail("A location fix is required for this form — turn location on and try again", 428);
    }
  }

  const cleanPhotos = (photos || [])
    .filter((p) => p?.url)
    .map((p) => ({
      fieldKey: p.fieldKey || "",
      url: p.url,
      publicId: p.publicId || "",
      width: p.width ?? null,
      height: p.height ?? null,
      bytes: p.bytes ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      takenAt: p.takenAt ? new Date(p.takenAt) : null,
    }));

  if (needsPhoto && progressing && cleanPhotos.length === 0) {
    throw fail("At least one photo is required for this form", 428);
  }

  const { values: cleanValues, labels, errors } = validateValues(template, values, cleanPhotos);
  if (errors.length && progressing) throw fail(errors.join("; "), 422, { fields: errors });

  /* ── Every gate is behind us; the customer may exist now ───────── */
  //
  // This is the first write of the request. Anything refused above left the
  // book exactly as it found it, so the employee can fix what was wrong and
  // send the same visit again.
  if (!lead) {
    lead = await createLead({ payload: pendingLead.payload, actor, task, resolved: pendingLead });
  }

  /* ── Is this the employee's word, or the organisation's? ────────── */
  //
  // The step decides. With approval on — the default — this submission is a
  // CLAIM that the step is finished, stored as pending, and the customer does
  // not move until somebody accepts it. With approval off the behaviour is
  // exactly what it was before approvals existed: the submission advances them
  // on the spot.
  //
  // The flag is FROZEN onto the submission below rather than read back later,
  // so turning the gate off next week never silently approves what is already
  // waiting, and turning it on never re-opens what already went through.
  //
  // An outcome that is not progress is never held: a farmer who did not answer
  // the door is not a step anybody needs to agree about.
  const needsApproval = progressing && advance && stage.requiresApproval !== false;

  // The approval queue and the task counters both filter on this.
  //
  // A customer who has never been accepted into the book — refused, or still
  // waiting — is still being REGISTERED, however many times it takes. The
  // second attempt arrives carrying a leadId, because the row already exists,
  // and reading only that made it look like a follow-up: approving it advanced
  // them a step instead of accepting the registration, and left the refusal
  // standing on their record, which barred them from every future assignment.
  const stillRegistering =
    !createdNewLead && ["pending_approval", "rejected"].includes(lead.status);

  const kind =
    createdNewLead || stillRegistering
      ? "new_customer"
      : task?.type === "follow_up"
        ? "follow_up"
        : "other";

  /* ── Did the world move while this sat in the outbox? ───────────── */
  //
  // The handset holds work for hours. A form filled for step 2 can arrive after
  // somebody else has already advanced this customer past step 2 — and applying
  // it to whatever step they are on NOW would credit the wrong rung with
  // answers that were never about it.
  //
  // The answers are real and are never thrown away. The submission keeps the
  // step it was actually captured against, is flagged, and an approver decides
  // what it is worth. Nothing is applied automatically.
  const conflicted = Boolean(
    progressing && !createdNewLead && stage.key !== lead.stageKey,
  );

  /* ── Write ─────────────────────────────────────────────────────── */

  const when = capturedAt ? new Date(capturedAt) : new Date();
  const fromStageKey = lead.stageKey;

  let submission;
  try {
    submission = await SalesFormSubmission.create({
      leadId: lead._id,
      taskId: task?._id || null,
      templateId: template._id,
      templateName: template.name,
      templateVersion: template.version,
      pipelineKey,
      schemeId: stage.schemeId || lead.schemeId || null,
      schemeVersion: schemeVersion ?? null,
      stageKey: stage.key,
      fromStageKey,
      kind,
      approval: {
        required: needsApproval,
        // `auto` is the honest name for one that was never reviewed because its
        // step did not ask for review — it is not the same as approved.
        status: needsApproval ? "pending" : "auto",
      },
      conflict: {
        detected: conflicted,
        expectedStageKey: conflicted ? stage.key : "",
        actualStageKey: conflicted ? lead.stageKey : "",
        note: conflicted
          ? `Captured for "${stage.key}" but the customer had already moved to "${lead.stageKey}" by the time it arrived.`
          : "",
      },
      values: cleanValues,
      labels,
      photos: cleanPhotos,
      signatureUrl: input.signatureUrl || "",
      location: {
        lat: location.lat ?? null,
        lng: location.lng ?? null,
        accuracy: location.accuracy ?? null,
        isMock: Boolean(location.isMock),
        address: location.address || "",
        capturedAt: location.capturedAt ? new Date(location.capturedAt) : when,
      },
      otp: {
        required: needsOtp,
        verified: Boolean(otpRow),
        phone: otpRow?.phone || "",
        verifiedAt: otpRow?.verifiedAt || null,
        verificationId: otpRow?._id || null,
      },
      submittedBy: employee.id,
      submittedByName: employee.name || "",
      submittedByCode: employee.code || "",
      capturedAt: when,
      wasQueued: Boolean(wasQueued),
      device,
      clientRef,
      outcome,
      note,
    });
  } catch (err) {
    // The unique partial index on clientRef caught a retry that raced past the
    // read at the top of this function. Same answer as the read would have
    // given, rather than an error the app would retry forever.
    if (err?.code === 11000 && clientRef) {
      const already = await SalesFormSubmission.findOne({ clientRef }).lean();
      if (already) {
        return { submission: already, lead: lead.toObject(), task, advancedTo: already.stageKey, duplicate: true };
      }
    }
    throw err;
  }

  // The verification was already SPENT above, before the submission existed —
  // that is what stops two concurrent submissions from claiming one code. This
  // writes back which record actually spent it, so the proof and the record
  // point at each other. A plain update, not consumeOtp(): that helper only
  // matches an unspent row, and this one is deliberately already spent.
  if (otpRow) {
    await SalesOtp.updateOne(
      { _id: otpRow._id },
      { $set: { consumedBySubmission: submission._id } },
    ).catch(() => {});
  }

  /* ── What the visit itself established ─────────────────────────── */
  //
  // These are FACTS and are written whether or not anybody agrees the step is
  // finished: the employee was there, the farmer's phone answered an OTP, money
  // changed hands. Only the CLAIM — that the rung is complete and the customer
  // should move up — waits for a decision. Conflating the two would mean a
  // rejected form also un-collected the deposit.

  const leadUpdate = { lastContactedAt: when };
  const leadInc = { visitCount: 1 };

  if (otpRow) {
    leadUpdate.phoneVerified = true;
    leadUpdate.phoneVerifiedAt = otpRow.verifiedAt;
  }
  if (progressing && Number.isFinite(Number(input.dealValue))) {
    leadUpdate.dealValue = Number(input.dealValue);
  }
  if (progressing && Number.isFinite(Number(input.amountCollected)) && Number(input.amountCollected) > 0) {
    leadInc.amountCollected = Number(input.amountCollected);
  }
  if (!lead.geo?.lat && Number.isFinite(Number(location.lat))) {
    leadUpdate.geo = {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy ?? null,
      capturedAt: when,
    };
  }

  if (outcome === "not_interested") {
    // Its own conclusion, and nobody needs to agree about it — the farmer said
    // no, and that is not a rung anybody is claiming to have climbed.
    leadUpdate.status = "lost";
    leadUpdate.lostReason = note || "Not interested";
  } else if (outcome === "reschedule") {
    leadUpdate.nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  } else if (progressing && lead.status === "open") {
    // Deliberately only from `open`. A customer waiting on their registration
    // must stay in pending_approval, and one already won must not be reopened.
    leadUpdate.status = "in_progress";
  }

  const submittedMessage = !progressing
    ? `${template.name} submitted — ${outcome.replace(/_/g, " ")}`
    : conflicted
      ? `${template.name} submitted for ${stage.key} — flagged, the customer had already moved on`
      : needsApproval
        ? `${template.name} submitted for ${stage.key} — waiting for approval`
        : `${template.name} submitted`;

  await SalesLead.updateOne(
    { _id: lead._id },
    {
      $set: leadUpdate,
      $inc: leadInc,
      $push: {
        timeline: {
          $each: [
            {
              at: when,
              kind: conflicted ? "conflict" : "form_submitted",
              message: submittedMessage,
              byKind: "employee",
              by: employee.id,
              byName: employee.name || "",
              meta: { submissionId: submission._id, stageKey: stage.key, photos: cleanPhotos.length },
            },
          ],
          $position: 0,
          $slice: 200,
        },
      },
    },
  );

  await SalesEvent.record({
    kind: conflicted ? "submission_conflicted" : "submission_made",
    leadId: lead._id,
    taskId: task?._id || null,
    submissionId: submission._id,
    schemeId: stage.schemeId || lead.schemeId || null,
    stageKey: stage.key,
    actorKind: "employee",
    actorId: employee.id,
    actorName: employee.name || "",
    message: submittedMessage,
    meta: { kind, outcome, needsApproval },
  });

  /* ── Move the customer, or wait for somebody to agree ───────────── */

  let advancedTo = lead.stageKey;
  if (progressing && advance && !needsApproval && !conflicted) {
    // Registration establishes; a follow-up climbs. See the two functions'
    // headers for why they are not the same operation.
    const moved =
      kind === "new_customer"
        ? await activateCustomerForSubmission({ lead, submission, task, actor, when })
        : await advanceLeadForSubmission({ lead, stage, submission, task, actor, when });
    advancedTo = moved.advancedTo;
  }

  /* ── Move the task ─────────────────────────────────────────────── */

  if (task) await applySubmissionToTask({ task, lead, submission, outcome, when, needsApproval, conflicted });

  await SalesFormTemplate.updateOne({ _id: template._id }, { $inc: { submissionCount: 1 } });

  // The day's rollup counts what was achieved next to how far it was travelled.
  // Never allowed to fail the submission — a rollup is a report, and the record
  // is the thing that matters.
  await noteFieldActivity({
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.code,
    at: when,
    submission: 1,
    leadCreated: leadId ? 0 : 1,
    lat: location.lat,
    lng: location.lng,
    leadId: lead._id,
    label: lead.name,
  }).catch((err) => console.warn("[sales] day rollup:", err.message));

  const fresh = await SalesLead.findById(lead._id).lean();
  return {
    submission,
    lead: fresh,
    task,
    advancedTo,
    duplicate: false,
    // What the app tells the employee. "Submitted" and "done" are different
    // sentences and the handset must not say the second one when the desk has
    // not yet agreed — see the note on SalesFormSubmission.approval.
    pendingApproval: needsApproval,
    conflicted,
  };
}

/**
 * Turn a provisional registration into a real customer.
 *
 * WHY THIS IS NOT advanceLeadForSubmission
 * ----------------------------------------
 * Registering somebody is not climbing a rung. The New Customer form captures
 * who they are and which scheme they belong to; accepting it ESTABLISHES them
 * at that scheme's first step, with the first step still to do. Advancing them
 * would credit them with work nobody has done — the first follow-up task would
 * arrive for step 2 of a scheme whose step 1 never happened.
 *
 * So this sets them active and leaves `stageKey` exactly where createLead put
 * it. The customer becomes available for follow-up assignment at step one.
 */
async function activateCustomerForSubmission({ lead, submission, task, actor, when = new Date() }) {
  const stageKey = lead.stageKey;

  await SalesLead.updateOne(
    { _id: lead._id },
    {
      $set: { status: "open", stageEnteredAt: when },
      $push: {
        stageHistory: {
          stageKey,
          at: when,
          by: submission?.submittedBy || actor?.id || null,
          byName: submission?.submittedByName || actor?.name || "",
          submissionId: submission?._id || null,
          taskId: task?._id || null,
        },
        timeline: {
          $each: [
            {
              at: when,
              kind: "approved",
              message: `Registration accepted — active on ${stageKey}`,
              byKind: actor?.kind || "system",
              by: actor?.id || null,
              byName: actor?.name || "",
              meta: { submissionId: submission?._id || null, stageKey },
            },
          ],
          $position: 0,
          $slice: 200,
        },
      },
    },
  );

  await SalesEvent.record({
    kind: "customer_approved",
    leadId: lead._id,
    taskId: task?._id || null,
    submissionId: submission?._id || null,
    schemeId: lead.schemeId || null,
    stageKey,
    to: stageKey,
    actorKind: actor?.kind || "system",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: `Registration accepted — active on ${stageKey}`,
  });

  return { advancedTo: stageKey, completed: false, activated: true };
}

/**
 * Move a customer up their scheme because a submission for their current step
 * has been ACCEPTED.
 *
 * THIS IS THE ONLY PLACE A CUSTOMER'S STEP CHANGES as a result of work done.
 * It is called from exactly two places: recordSubmission above, when the step
 * does not ask for approval, and approveSubmission in services/salesProgression,
 * when somebody has agreed. The desk's manual override is a different action
 * with a different audit trail and does not come through here.
 *
 * Exactly one rung, every time. A submission satisfies the step it was FOR, so
 * the customer lands on the next one — never two, never back down the ladder.
 *
 * @returns { advancedTo, completed }
 */
async function advanceLeadForSubmission({ lead, stage, submission, task, actor, when = new Date() }) {
  const pipelineKey = lead.pipelineKey || "default";
  const update = { stageEnteredAt: when };
  let advancedTo = lead.stageKey;
  let completed = false;

  // The next working rung, or — when there are none left — the ending this
  // ladder runs into. See terminalAfter() for why only a `won` ending counts.
  const target = (await nextStage(stage.key, pipelineKey)) || (await terminalAfter(stage.key, pipelineKey));
  const terminal = stage.isTerminal ? stage : null;

  if (terminal) {
    // Already standing on the end of the ladder. Reaching it is the event, not
    // passing through it.
    advancedTo = stage.key;
    update.status = terminal.terminalOutcome === "won" ? "won" : "lost";
    if (terminal.terminalOutcome === "won") update.isCustomer = true;
    completed = true;
  } else if (target) {
    advancedTo = target.key;
    update.stageKey = target.key;
    // A step whose outcome is `won` is reached, not passed through.
    if (target.isTerminal && target.terminalOutcome === "won") {
      update.status = "won";
      update.isCustomer = true;
      completed = true;
    }
  } else {
    // Nothing above this rung and it is not marked terminal — the scheme has
    // run out of ladder. That is a configuration gap, not a customer state, so
    // they stay where they are rather than being given an invented destination.
    // And because nothing moved, nothing is written: a "step_advanced" event
    // and a stageHistory row for a move that did not happen would read as one
    // that did.
    console.warn(
      `[sales] "${pipelineKey}/${stage.key}" has no next step and is not terminal — ${lead.code} stays where it is.`,
    );
    await SalesEvent.record({
      kind: "submission_approved",
      leadId: lead._id,
      taskId: task?._id || null,
      submissionId: submission?._id || null,
      schemeId: stage.schemeId || lead.schemeId || null,
      stageKey: stage.key,
      actorKind: actor?.kind || "system",
      actorId: actor?.id || null,
      actorName: actor?.name || "",
      message: `Accepted, but "${stage.key}" has no next step and does not end the scheme — the customer stays put. Add a next step or mark this one terminal.`,
    });
    return { advancedTo: stage.key, completed: false };
  }

  if (!update.status && lead.status === "open") update.status = "in_progress";

  await SalesLead.updateOne(
    { _id: lead._id },
    {
      $set: update,
      $push: {
        stageHistory: {
          stageKey: advancedTo,
          at: when,
          by: submission?.submittedBy || actor?.id || null,
          byName: submission?.submittedByName || actor?.name || "",
          submissionId: submission?._id || null,
          taskId: task?._id || null,
        },
        timeline: {
          $each: [
            {
              at: when,
              kind: completed ? "status_changed" : "stage_changed",
              message: completed
                ? `Scheme completed at ${advancedTo}`
                : `Moved to ${advancedTo}`,
              byKind: actor?.kind || "system",
              by: actor?.id || null,
              byName: actor?.name || "",
              meta: { submissionId: submission?._id || null, from: stage.key, to: advancedTo },
            },
          ],
          $position: 0,
          $slice: 200,
        },
      },
    },
  );

  await SalesEvent.record({
    kind: completed ? "customer_completed" : "step_advanced",
    leadId: lead._id,
    taskId: task?._id || null,
    submissionId: submission?._id || null,
    schemeId: stage.schemeId || lead.schemeId || null,
    stageKey: advancedTo,
    from: stage.key,
    to: advancedTo,
    actorKind: actor?.kind || "system",
    actorId: actor?.id || null,
    actorName: actor?.name || "",
    message: completed ? `Completed the scheme at ${advancedTo}` : `Advanced from ${stage.key} to ${advancedTo}`,
  });

  return { advancedTo, completed };
}

/**
 * Mark the target done, recount, and close the task when nothing is left.
 *
 * Recounts from the array rather than incrementing a counter: an employee who
 * submits twice against the same farmer (a correction) must not push the task
 * past its own total, and a counter cannot tell the difference.
 */
async function applySubmissionToTask({ task, lead, submission, outcome, when, needsApproval = false, conflicted = false }) {
  // A submission that is waiting on somebody is not done, however the visit
  // went. `done` is reserved for work the organisation has ACCEPTED.
  const statusForOutcome = {
    progressed: needsApproval || conflicted ? "pending_approval" : "done",
    recorded: needsApproval || conflicted ? "pending_approval" : "done",
    not_interested: "rejected",
    unreachable: "unreachable",
    reschedule: "rescheduled",
  };

  const idx = task.targets.findIndex((t) => String(t.leadId) === String(lead._id));
  if (idx >= 0) {
    task.targets[idx].status = statusForOutcome[outcome] || "done";
    task.targets[idx].submissionId = submission._id;
    task.targets[idx].updatedAt = when;
    task.targets[idx].attempts = (task.targets[idx].attempts || 0) + 1;
    // A fresh attempt clears the last refusal's note; the note lives on the
    // rejected submission either way, which is the copy that is never lost.
    task.targets[idx].rejectionNote = "";
  } else {
    // A quota task grows its list as customers are registered against it — this
    // is the normal path for "bring me 10 new customers", not an exception.
    task.targets.push({
      leadId: lead._id,
      name: lead.name,
      phone: lead.phone,
      village: lead.address?.village || "",
      code: lead.code,
      status: statusForOutcome[outcome] || "done",
      submissionId: submission._id,
      updatedAt: when,
      attempts: 1,
    });
  }

  task.submissionCount = (task.submissionCount || 0) + 1;
  task.lastActivityAt = when;
  if (Number.isFinite(Number(submission.location?.lat))) {
    task.lastActivityLat = submission.location.lat;
    task.lastActivityLng = submission.location.lng;
  }
  if (!task.startedAt) task.startedAt = when;

  recountTask(task, when);
  await task.save();
}

/**
 * Recompute a task's counters and status from its targets.
 *
 * Recounted from the array rather than incremented, every time, because the
 * same target can be submitted, refused and resubmitted — and a counter cannot
 * tell the difference between that and three separate pieces of work. This is
 * the only function that writes doneCount, pendingCount, rejectedCount or a
 * status derived from them, so retries and re-approvals cannot drift them.
 */
function recountTask(task, when = new Date()) {
  const by = (...states) => task.targets.filter((t) => states.includes(t.status)).length;

  const approved = by("done");
  const pending = by("pending_approval");
  const needsRework = by("rework");
  // Resolved, but not a successful customer. Counted towards finishing the
  // task, never towards its achievement.
  const closedOut = by("unreachable", "rescheduled", "rejected");

  // THE DENOMINATOR IS THE QUOTA, NOT THE NUMBER OF ATTEMPTS. An employee who
  // registers four people to fill a target of three, because one was refused,
  // has a target of three — growing it with every attempt would mean a rejected
  // submission quietly raised the bar on the person who has to redo it.
  const total =
    task.type === "lead_generation"
      ? task.targetCount || task.targets.length
      : task.targets.length;

  task.doneCount = approved;
  task.pendingCount = pending;
  task.rejectedCount = needsRework;

  if (total > 0 && approved >= total) {
    task.status = "completed";
    task.completedAt = task.completedAt || when;
  } else if (needsRework > 0) {
    // Something came back refused and there is work to redo. Said before
    // pending, because a person with a rejection has something to act on now.
    task.status = "rework";
    task.completedAt = null;
  } else if (pending > 0 && approved + pending + closedOut >= total) {
    // Everything asked for has been submitted; the desk is now the holdup.
    task.status = "pending_approval";
    task.completedAt = null;
  } else if (["assigned", "accepted", "pending_approval", "rework"].includes(task.status)) {
    task.status = "in_progress";
    task.completedAt = null;
  }

  return { approved, pending, needsRework, closedOut, total };
}

module.exports = {
  listStages,
  getStage,
  nextStage,
  firstStage,
  resolveTemplate,
  validateValues,
  createLead,
  findByPhone,
  recordSubmission,
  activateCustomerForSubmission,
  advanceLeadForSubmission,
  applySubmissionToTask,
  recountTask,
  fail,
};
