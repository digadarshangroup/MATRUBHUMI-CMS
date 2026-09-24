// routes/Field_Routes/fieldApp.js
//
// Everything the Android field app talks to. Mounted at /api/field.
//
// WRITTEN FOR A HANDSET WITH ONE BAR OF SIGNAL
// --------------------------------------------
// Three things follow from that, and they shape every route below:
//
//   1. /bootstrap returns the WHOLE working set in one response — the tasks,
//      the pipeline, the forms those tasks need. The app stores it and works
//      from the copy. Ten small requests on a village edge is ten chances to
//      fail; one is one.
//   2. Every write is IDEMPOTENT on a client-supplied id. The app retries from
//      its offline queue and cannot know whether a request that timed out was
//      received, so the server has to be the one that knows.
//   3. Nothing is rejected for arriving late. A submission captured at 2pm and
//      delivered at 9pm is stored with both times and marked as queued — see
//      SalesFormSubmission.capturedAt.

"use strict";

const express = require("express");
const multer = require("multer");
const router = express.Router();

const AllEmployeeAppMiddleware = require("../../Middlewear/AllEmployeeAppMiddleware");
const FieldEmployeeContext = require("../../Middlewear/FieldEmployeeContext");

const SalesTask = require("../../models/Sales_Models/SalesTask");
const SalesLead = require("../../models/Sales_Models/SalesLead");
const SalesFormTemplate = require("../../models/Sales_Models/SalesFormTemplate");
const SalesFormSubmission = require("../../models/Sales_Models/SalesFormSubmission");
const SalesScheme = require("../../models/Sales_Models/SalesScheme");
const SalesStage = require("../../models/Sales_Models/SalesStage");
const FieldDay = require("../../models/Sales_Models/FieldDay");

const pipeline = require("../../services/salesPipeline");
const { issueOtp, verifyOtp, normalisePhone } = require("../../services/salesOtp");
const { ingestBatch, dayKey } = require("../../services/fieldTracking");
const { uploadToCloudinary } = require("../../services/mediaUpload.service");

// Every route here is an authenticated employee with a resolved identity.
router.use(AllEmployeeAppMiddleware, FieldEmployeeContext);

/** Same contract as the desk side: `status` means the caller, bare means us. */
function sendError(res, err, context = "field") {
  const status = err?.status || 500;
  if (status >= 500) {
    console.error(`[${context}]`, err);
    return res.status(500).json({ success: false, message: "Something went wrong at our end." });
  }
  return res.status(status).json({
    success: false,
    message: err.message,
    ...(err.fields ? { fields: err.fields } : {}),
    ...(err.leadId ? { leadId: err.leadId, leadCode: err.code } : {}),
  });
}

/** The shape the app renders a task in. Flat, small, and complete. */
function taskForApp(task) {
  return {
    id: String(task._id),
    code: task.code,
    title: task.title,
    instructions: task.instructions || "",
    type: task.type,
    stageKey: task.stageKey,
    // The workflow this task was assigned against, frozen at assignment. The
    // app SHOWS these; it never resolves them. An employee opening a follow-up
    // is told the customer, the scheme and the step — choosing any of them
    // again on the handset is how a step-3 form gets filled for step 1.
    schemeId: task.schemeId ? String(task.schemeId) : null,
    schemeName: task.schemeName || "",
    schemeVersion: task.schemeVersion ?? null,
    stageName: task.stageName || "",
    templateId: task.templateId ? String(task.templateId) : null,
    templateName: task.templateName || "",
    templateVersion: task.templateVersion ?? null,
    // The quota, not the number of attempts — a rejected submission must not
    // quietly raise the bar on the person who has to redo it.
    targetCount: task.type === "lead_generation" ? task.targetCount || task.targets.length : task.targets.length,
    // APPROVED. The other two are shown beside it, never folded into it.
    doneCount: task.doneCount || 0,
    pendingCount: task.pendingCount || 0,
    rejectedCount: task.rejectedCount || 0,
    status: task.status,
    priority: task.priority,
    scheduledFor: task.scheduledFor,
    dueAt: task.dueAt,
    requireOtp: task.requireOtp,
    requirePhoto: task.requirePhoto,
    requireLocation: task.requireLocation,
    assignedByName: task.assignedByName || "",
    targets: (task.targets || []).map((t) => ({
      leadId: String(t.leadId),
      code: t.code,
      name: t.name,
      phone: t.phone,
      village: t.village,
      status: t.status,
      // Carried down so a refused visit tells the employee what to fix on the
      // screen where they redo it, rather than somewhere else.
      rejectionNote: t.rejectionNote || "",
      attempts: t.attempts || 0,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

router.get("/bootstrap", async (req, res) => {
  try {
    const employee = req.employee;
    const today = dayKey(new Date());

    // Six days back plus today. Computed from the DATE KEY rather than by
    // subtracting milliseconds, so it lands on the same boundaries the rollups
    // were written against — including across a daylight change, which India
    // does not have but the code should not depend on.
    const weekStart = dayKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));

    // `todayRollup`, not `day` — a `day` here would shadow the `today` key it
    // is queried by and read it before initialisation, which is a TDZ error at
    // runtime rather than a compile-time one.
    const [tasks, stages, todayRollup, recentDays] = await Promise.all([
      SalesTask.find({
        assignedTo: employee.id,
        isActive: true,
        status: { $in: ["assigned", "accepted", "in_progress", "pending_approval", "rework"] },
      })
        .sort({ scheduledFor: 1, priority: -1 })
        .limit(100)
        .lean(),
      pipeline.listStages("default"),
      FieldDay.findOne({ employeeId: employee.id, day: today }).select("-path -stops").lean(),
      // The week behind today, for the employee's own strip on the home screen.
      // Their record, not the desk's — "6.4 km" means nothing until it sits
      // next to the days either side of it. Seven summaries, no paths, so it
      // costs about as much as the single row above.
      FieldDay.find({ employeeId: employee.id, day: { $gte: weekStart, $lte: today } })
        .select("day distanceMeters submissionCount leadsCreated -_id")
        .sort({ day: 1 })
        .lean(),
    ]);

    // Only the templates this employee's work actually needs, but ALL of them —
    // the app must be able to open any assigned form with no signal, and
    // fetching one on demand is exactly the moment there is none.
    const ids = new Set();
    for (const t of tasks) if (t.templateId) ids.add(String(t.templateId));
    for (const s of stages) if (s.templateId) ids.add(String(s.templateId));

    // The registration form, always. An employee sent out for new customers
    // must be able to register one after driving out of signal, and this is the
    // form they will need — it belongs to no task and no stage, so nothing above
    // would have picked it up.
    const newCustomerTemplate = await SalesFormTemplate.findOne({
      purpose: "new_customer",
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (newCustomerTemplate) ids.add(String(newCustomerTemplate._id));

    // The schemes the employee may put a new customer into, each with its own
    // steps. Sent WHOLE and unconditionally, because the one thing the handset
    // must never do is ask the server which schemes exist while standing in a
    // field — and because the scheme list is a handful of rows, not a table.
    //
    // Only the ACTIVE ones: a scheme closed to new customers is not a choice
    // the employee should be offered. Archived history is the desk's problem,
    // not the phone's.
    const schemeRows = await SalesScheme.find({ isActive: true, isArchived: false })
      .sort({ order: 1, name: 1 })
      .lean();
    const schemeSteps = await SalesStage.find({
      pipelineKey: { $in: schemeRows.map((s) => s.key) },
      isActive: true,
      isArchived: { $ne: true },
    })
      .sort({ order: 1 })
      .lean();

    const templates = await SalesFormTemplate.find({ _id: { $in: [...ids] }, isActive: true });

    res.json({
      success: true,
      data: {
        employee: {
          id: String(employee.id),
          name: employee.name,
          code: employee.code,
          designation: employee.designation,
          department: employee.department,
        },
        serverTime: new Date().toISOString(),
        tasks: tasks.map(taskForApp),
        stages: stages.map((s) => ({
          key: s.key, name: s.name, order: s.order, tone: s.tone,
          requiresOtp: s.requiresOtp, requiresPhoto: s.requiresPhoto, requiresLocation: s.requiresLocation,
          templateId: s.templateId ? String(s.templateId) : null,
          isTerminal: s.isTerminal, terminalOutcome: s.terminalOutcome,
        })),
        templates: templates.map((t) => t.toRenderable()),

        // Which workflows a new customer may be put into, and what each one
        // looks like. The employee picks ONE of these during registration; the
        // names come from here and are never hardcoded in the app.
        // Only schemes somebody can ENTER. One with no working step would be
        // offered on the handset and then refused by the server at submission,
        // after the employee has filled the whole form standing in a field.
        schemes: schemeRows.filter((s) =>
          schemeSteps.some((st) => st.pipelineKey === s.key && st.isActive && !st.isTerminal),
        ).map((s) => ({
          id: String(s._id),
          key: s.key,
          name: s.name,
          description: s.description || "",
          version: s.version,
          steps: schemeSteps
            .filter((st) => st.pipelineKey === s.key)
            .map((st) => ({
              key: st.key,
              name: st.name,
              order: st.order,
              isTerminal: st.isTerminal,
              requiresApproval: st.requiresApproval !== false,
              templateId: st.templateId ? String(st.templateId) : null,
            })),
        })),

        // The one registration form. Named separately rather than left for the
        // app to find among `templates`, because "which of these is the new
        // customer form" is not a question a handset should have to answer.
        newCustomerTemplateId: newCustomerTemplate ? String(newCustomerTemplate._id) : null,
        today: {
          day: today,
          distanceKm: Math.round(((todayRollup?.distanceMeters || 0) / 100)) / 10,
          submissions: todayRollup?.submissionCount || 0,
          leadsCreated: todayRollup?.leadsCreated || 0,
        },
        // GAPS ARE FILLED HERE, not on the handset. A day with no rollup is a
        // day the employee did not go out, and it has to appear as an empty
        // column rather than be missing — seven bars with Wednesday absent
        // reads as a fault in the app, not as a Wednesday off.
        recentDays: (() => {
          const byDay = new Map(recentDays.map((d) => [d.day, d]));
          const out = [];
          for (let back = 6; back >= 0; back--) {
            const key = dayKey(new Date(Date.now() - back * 24 * 60 * 60 * 1000));
            const row = byDay.get(key);
            out.push({
              day: key,
              distanceKm: Math.round(((row?.distanceMeters || 0) / 100)) / 10,
              submissions: row?.submissionCount || 0,
              leadsCreated: row?.leadsCreated || 0,
            });
          }
          return out;
        })(),
        // The service reads its own cadence from here rather than hardcoding
        // it, so battery behaviour can be retuned for the whole fleet without
        // shipping an APK to twenty handsets scattered across three districts.
        tracking: {
          enabled: process.env.FIELD_TRACKING_ENABLED !== "false",
          intervalSeconds: Number(process.env.FIELD_PING_INTERVAL_S || 20),
          idleIntervalSeconds: Number(process.env.FIELD_IDLE_INTERVAL_S || 120),
          minDistanceMeters: Number(process.env.FIELD_MIN_DISTANCE_M || 15),
          batchSize: Number(process.env.FIELD_BATCH_SIZE || 20),
          batchIntervalSeconds: Number(process.env.FIELD_BATCH_INTERVAL_S || 120),
        },
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

router.get("/tasks", async (req, res) => {
  try {
    const filter = { assignedTo: req.employee.id, isActive: true };

    if (req.query.scope === "done") {
      filter.status = { $in: ["completed", "partial"] };
    } else if (req.query.scope === "all") {
      // everything
    } else {
      filter.status = { $in: ["assigned", "accepted", "in_progress", "pending_approval", "rework"] };
    }

    const rows = await SalesTask.find(filter)
      .sort({ scheduledFor: -1 })
      .limit(Math.min(200, parseInt(req.query.limit, 10) || 100))
      .lean();

    res.json({ success: true, data: rows.map(taskForApp) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const task = await SalesTask.findOne({ _id: req.params.id, assignedTo: req.employee.id }).lean();
    if (!task) return res.status(404).json({ success: false, message: "No such task" });

    const template = task.templateId ? await SalesFormTemplate.findById(task.templateId) : null;
    res.json({
      success: true,
      data: { task: taskForApp(task), template: template ? template.toRenderable() : null },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** "I have seen this and I am starting." Cheap, and it tells the desk a lot. */
router.post("/tasks/:id/accept", async (req, res) => {
  try {
    const task = await SalesTask.findOneAndUpdate(
      { _id: req.params.id, assignedTo: req.employee.id, status: "assigned" },
      { $set: { status: "accepted", acceptedAt: new Date() } },
      { new: true },
    );
    // Not an error when it is already accepted — the app retries this from its
    // queue, and a second accept is a no-op, not a failure.
    if (!task) return res.json({ success: true, alreadyAccepted: true });
    res.json({ success: true, data: taskForApp(task) });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

router.get("/leads", async (req, res) => {
  try {
    const filter = { isActive: true };
    // An employee sees their own book by default. `all=true` is allowed on
    // purpose — the field team covers for each other, and a farmer standing in
    // front of somebody must be findable by whoever is standing there.
    if (req.query.all !== "true") filter.assignedTo = req.employee.id;
    if (req.query.stage) filter.stageKey = req.query.stage;
    if (req.query.customers === "true") filter.isCustomer = true;

    if (req.query.q) {
      const term = String(req.query.q).trim();
      const digits = term.replace(/\D/g, "");
      filter.$or = [
        { name: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        ...(digits.length >= 4 ? [{ phone: new RegExp(digits) }] : []),
      ];
    }

    const rows = await SalesLead.find(filter)
      .select("code name phone stageKey status isCustomer address.village nextFollowUpAt lastContactedAt geo")
      .sort({ updatedAt: -1 })
      .limit(Math.min(300, parseInt(req.query.limit, 10) || 100))
      .lean();

    res.json({ success: true, data: rows });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/leads/:id", async (req, res) => {
  try {
    const lead = await SalesLead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ success: false, message: "No such lead" });

    const submissions = await SalesFormSubmission.find({ leadId: lead._id })
      .select("templateName stageKey capturedAt outcome note photos submittedByName values labels")
      .sort({ capturedAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: {
        lead,
        submissions: submissions.map((s) => ({
          ...s,
          values: s.values instanceof Map ? Object.fromEntries(s.values) : s.values,
          labels: s.labels instanceof Map ? Object.fromEntries(s.labels) : s.labels,
        })),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** Look before you type. The duplicate check the app runs on the phone field. */
router.get("/leads/lookup/:phone", async (req, res) => {
  try {
    const lead = await pipeline.findByPhone(req.params.phone);
    if (!lead) return res.json({ success: true, found: false });
    res.json({
      success: true,
      found: true,
      data: {
        id: String(lead._id), code: lead.code, name: lead.name, phone: lead.phone,
        stageKey: lead.stageKey, status: lead.status,
        assignedToName: lead.assignedToName, isCustomer: lead.isCustomer,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/leads", async (req, res) => {
  try {
    const employee = req.employee;
    const task = req.body.taskId
      ? await SalesTask.findOne({ _id: req.body.taskId, assignedTo: employee.id })
      : null;

    const lead = await pipeline.createLead({
      payload: req.body,
      actor: { kind: "employee", id: employee.id, name: employee.name, code: employee.code },
      task,
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Submissions — the one that matters                                  */
/* ------------------------------------------------------------------ */

router.post("/submissions", async (req, res) => {
  try {
    const employee = req.employee;
    const result = await pipeline.recordSubmission({
      employee: { id: employee.id, name: employee.name, code: employee.code },
      input: req.body,
    });

    // Tell the desk without it having to ask. A manager watching the morning
    // board sees the count move as the team works.
    const io = req.app.get("io");
    if (io && !result.duplicate) {
      // To the desk, not to everyone. This carries a customer's name and who
      // visited them; io.emit() put it on every connected socket, authenticated
      // or not.
      io.to("sales-desk").emit("sales:submission", {
        leadId: String(result.lead._id),
        leadName: result.lead.name,
        stageKey: result.advancedTo,
        by: employee.name,
        at: result.submission.capturedAt,
      });
    }

    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      data: {
        submissionId: String(result.submission._id),
        leadId: String(result.lead._id),
        leadCode: result.lead.code,
        stageKey: result.advancedTo,
        // The handset must not tell the employee a step is finished when the
        // desk has not agreed yet. `approvalStatus` is what the screen reads to
        // decide between "Submitted — waiting for approval" and "Done".
        approvalStatus: result.submission.approval?.status || "auto",
        pendingApproval: Boolean(result.pendingApproval),
        // Captured for a step this customer has already left. Kept, flagged,
        // and shown to the employee so a resync does not look like data loss.
        conflicted: Boolean(result.conflicted),
        taskStatus: result.task?.status || null,
        // Approved, not submitted — see recountTask.
        taskDone: result.task?.doneCount ?? null,
        taskPending: result.task?.pendingCount ?? null,
        taskRejected: result.task?.rejectedCount ?? null,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Photographs                                                         */
/* ------------------------------------------------------------------ */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    // The app compresses before it uploads; this is the backstop for a build
    // that does not. A field photo has no business being anything but an image.
    if (!/^image\//.test(file.mimetype)) return cb(new Error("Only images can be uploaded here"));
    cb(null, true);
  },
});

// Uploaded BEFORE the submission, so a form with four photos on a bad line
// makes four small independent attempts instead of one large all-or-nothing
// one. The submission then carries only the URLs.
router.post("/uploads", upload.array("photos", 6), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: "No photo was received" });

    const folder = `matrubhoomi/sales/${dayKey(new Date())}`;
    const uploaded = [];

    for (const file of req.files) {
      const out = await uploadToCloudinary(file.buffer, {
        folder,
        resourceType: "image",
        originalName: file.originalname,
      });
      uploaded.push({
        url: out.url,
        publicId: out.publicId,
        bytes: out.bytes,
        fieldKey: req.body.fieldKey || "",
        lat: req.body.lat ? Number(req.body.lat) : null,
        lng: req.body.lng ? Number(req.body.lng) : null,
        takenAt: req.body.takenAt || new Date().toISOString(),
      });
    }

    res.status(201).json({ success: true, data: uploaded });
  } catch (err) {
    console.error("[field] upload failed:", err.message);
    // Deliberately a 502 rather than a 500: the app retries a 502 from its
    // queue, and this failure is almost always Cloudinary or the line, not us.
    res.status(502).json({ success: false, message: "The photo could not be uploaded. It will be retried." });
  }
});

/* ------------------------------------------------------------------ */
/* OTP                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Send the farmer a code.
 *
 * SCOPED TO THE CALLER'S OWN WORK. A code is a message to a member of the
 * public, and an endpoint that sends one to any number an employee types is a
 * way to make the company's SMS account ring somebody's phone all afternoon.
 * Until this check existed any signed-in employee could raise a code against
 * any customer they had nothing to do with.
 *
 * The rule is the one recordSubmission already applies when the code is spent:
 * the task must be theirs, and the customer must be one of its targets. A code
 * for a NEW customer has no lead yet and is allowed — that is the lead
 * generation round, and the number is one the employee is standing in front of.
 */
router.post("/otp/send", async (req, res) => {
  try {
    const leadId = req.body.leadId || null;

    if (leadId) {
      // Theirs by either route: a task that names this customer, or the
      // customer being on their own book — which is how a lead they registered
      // themselves under a quota task reaches them, since a quota task has no
      // targets until the registrations land.
      const [holdsTask, ownsLead] = await Promise.all([
        SalesTask.exists({
          assignedTo: req.employee.id,
          "targets.leadId": leadId,
          status: { $nin: ["cancelled", "expired"] },
        }),
        SalesLead.exists({
          _id: leadId,
          $or: [{ assignedTo: req.employee.id }, { createdBy: req.employee.id }],
        }),
      ]);

      if (!holdsTask && !ownsLead) {
        return res.status(403).json({
          success: false,
          code: "NOT_YOUR_CUSTOMER",
          message: "You do not have a task for this customer.",
        });
      }
    }

    const out = await issueOtp({
      phone: req.body.phone,
      purpose: req.body.purpose || "lead_verify",
      leadId,
      taskId: req.body.taskId || null,
      stageKey: req.body.stageKey || "",
      employee: req.employee,
    });
    res.json({ success: true, data: out });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/otp/verify", async (req, res) => {
  try {
    const out = await verifyOtp({ otpId: req.body.otpId, phone: req.body.phone, code: req.body.code });

    // A verified number is worth recording on the lead even if the visit is
    // abandoned before the form is submitted — the number is real either way.
    //
    // The lead is taken from the OTP row when the caller does not repeat it.
    // It was written there when the code was issued, so requiring the client to
    // send it again only meant that an app which left it out silently never
    // marked the number verified.
    const leadId = req.body.leadId || out.leadId || null;
    if (leadId) {
      await SalesLead.updateOne(
        { _id: leadId, phone: normalisePhone(req.body.phone) },
        { $set: { phoneVerified: true, phoneVerifiedAt: new Date() } },
      );
    }

    res.json({ success: true, data: out });
  } catch (err) {
    sendError(res, err);
  }
});

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

router.post("/location/batch", async (req, res) => {
  try {
    const out = await ingestBatch({
      employee: req.employee,
      pings: req.body.pings || [],
      batchId: req.body.batchId || "",
    });

    res.json({
      success: true,
      data: out,
      // Echoed back so the service can retune without a second request. The app
      // asks the server what cadence to run at rather than deciding for itself.
      tracking: {
        intervalSeconds: Number(process.env.FIELD_PING_INTERVAL_S || 20),
        idleIntervalSeconds: Number(process.env.FIELD_IDLE_INTERVAL_S || 120),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/** The employee's own day. They are entitled to see what is being recorded. */
router.get("/me/day", async (req, res) => {
  try {
    const day = req.query.day || dayKey(new Date());
    const row = await FieldDay.findOne({ employeeId: req.employee.id, day }).lean();

    res.json({
      success: true,
      day,
      data: row
        ? {
            distanceKm: Math.round((row.distanceMeters || 0) / 100) / 10,
            movingMinutes: Math.round((row.movingSeconds || 0) / 60),
            idleMinutes: Math.round((row.idleSeconds || 0) / 60),
            stops: (row.stops || []).length,
            submissions: row.submissionCount || 0,
            leadsCreated: row.leadsCreated || 0,
            firstPingAt: row.firstPingAt,
            lastPingAt: row.lastPingAt,
            path: row.path || [],
          }
        : null,
    });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
