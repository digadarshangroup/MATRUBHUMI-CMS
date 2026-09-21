// models/Sales_Models/SalesTask.js
//
// A day's work, as handed to ONE employee.
//
// TWO SHAPES OF WORK, ONE DOCUMENT
// --------------------------------
//   quota    "bring me 10 new leads today"     -> targetCount, no named people
//   targeted "go and see these six farmers"    -> targets[], each a known lead
//
// They are the same document because they are the same thing to the person
// receiving it: a list on a phone with a number at the top that has to reach
// zero. A quota task grows its targets as the employee creates leads against
// it; a targeted task starts with them. Everything downstream — progress,
// completion, the desk's board — reads `targets` and does not care which shape
// it came from.
//
// ASSIGNMENT IS PER-PERSON, NOT PER-TEAM
// --------------------------------------
// The desk assigns "10 leads across four people" in one action on the web, and
// that writes FOUR task documents. A shared task with a shared counter cannot
// answer "did Ramesh do his four", which is the only question the desk
// actually asks the next morning.

const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead" },
    // Denormalised so the phone can draw the list — and dial it — with no
    // second request and no signal.
    name: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    village: { type: String, trim: true, default: "" },
    code: { type: String, trim: true, default: "" },

    // `done` now means APPROVED, not submitted. A target whose form has been
    // filled but not yet accepted sits in pending_approval, and one that was
    // refused goes to rework — the employee's list is not finished until the
    // organisation agrees it is.
    status: {
      type: String,
      enum: ["pending", "in_progress", "pending_approval", "done", "unreachable", "rejected", "rework", "rescheduled"],
      default: "pending",
    },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormSubmission", default: null },
    // Why the last attempt came back, carried down to the handset so the
    // employee can see what to fix without opening anything else.
    rejectionNote: { type: String, trim: true, default: "" },
    attempts: { type: Number, default: 0 },
    outcomeNote: { type: String, trim: true, default: "" },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const salesTaskSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, index: true },

    title: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true, default: "" },

    type: {
      type: String,
      enum: ["lead_generation", "follow_up", "service", "collection", "custom"],
      default: "lead_generation",
      index: true,
    },

    /* ── Who ─────────────────────────────────────────────────────────── */

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    assignedToName: { type: String, trim: true, default: "" },
    assignedToCode: { type: String, trim: true, default: "" },

    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    assignedByName: { type: String, trim: true, default: "" },

    // Ties together the N tasks one desk action produced, so the web side can
    // show "Monday's round: 4 people, 10 leads" as one row and still keep each
    // person's copy separately accountable.
    assignmentId: { type: mongoose.Schema.Types.ObjectId, index: true },

    /* ── What ────────────────────────────────────────────────────────── */

    pipelineKey: { type: String, default: "default", lowercase: true, trim: true },
    // Snapshotted at assignment, with the scheme's version, so a task assigned
    // on Monday still says which arrangement of the scheme it was assigned
    // against after the desk reorders the steps on Tuesday. Nothing reads the
    // scheme's CURRENT shape to interpret an old task.
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme", default: null, index: true },
    schemeVersion: { type: Number, default: null },
    schemeName: { type: String, trim: true, default: "" },
    stageName: { type: String, trim: true, default: "" },
    // The rung this task moves its leads ONTO. A task is always "get these
    // people to stage X", including a lead-generation task, whose X is
    // whatever the first rung is.
    stageKey: { type: String, lowercase: true, trim: true, default: "" },

    // The form the employee is asked to fill. Falls back to the stage's own
    // template when empty — see resolveTemplate() in services/salesTasks.js.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormTemplate", default: null },
    templateName: { type: String, trim: true, default: "" },
    templateVersion: { type: Number, default: null },

    // quota shape only.
    targetCount: { type: Number, default: 0 },
    targets: { type: [targetSchema], default: [] },

    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesServiceRequest", default: null },

    /* ── Rules the API enforces on submission ───────────────────────── */

    requireOtp: { type: Boolean, default: false },
    requirePhoto: { type: Boolean, default: false },
    requireLocation: { type: Boolean, default: true },

    /* ── When ────────────────────────────────────────────────────────── */

    scheduledFor: { type: Date, default: Date.now, index: true },
    dueAt: { type: Date, default: null },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },

    /* ── Where it stands ─────────────────────────────────────────────── */

    // pending_approval: everything asked for has been submitted and at least one
    // submission is still waiting on the desk. rework: something came back
    // refused and the employee has work to redo. Both are distinct from
    // completed, which now means every unit of work was ACCEPTED.
    status: {
      type: String,
      enum: [
        "assigned", "accepted", "in_progress", "pending_approval", "rework",
        "completed", "partial", "cancelled", "expired",
      ],
      default: "assigned",
      index: true,
    },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledReason: { type: String, trim: true, default: "" },

    // Kept as stored counters rather than computed on read: the desk's board
    // lists hundreds of tasks and counting embedded arrays per row on every
    // load is the kind of cost that only shows up once the data is real.
    // APPROVED units of work. This is the number the desk's board and the
    // employee's home screen both show against the target, because "six
    // farmers registered" must not include two that were refused.
    doneCount: { type: Number, default: 0 },
    // Submitted and still waiting. Shown next to doneCount rather than folded
    // into it, so a target does not look stalled while the desk is the holdup.
    pendingCount: { type: Number, default: 0 },
    // Refused and not yet redone. Never counted as progress.
    rejectedCount: { type: Number, default: 0 },
    // Sum of every submission stored against this task. Differs from doneCount
    // on a quota task, where one target can carry more than one visit.
    submissionCount: { type: Number, default: 0 },

    // What the phone last told us about where this work happened. Enough for
    // the board to show "started 9km away" without joining the ping table.
    lastActivityAt: { type: Date, default: null },
    lastActivityLat: { type: Number, default: null },
    lastActivityLng: { type: Number, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

salesTaskSchema.index({ assignedTo: 1, status: 1, scheduledFor: -1 });
salesTaskSchema.index({ status: 1, dueAt: 1 });

/** How many units of work this task represents, whichever shape it is. */
salesTaskSchema.virtual("totalCount").get(function () {
  return this.type === "lead_generation"
    ? Math.max(this.targetCount || 0, this.targets?.length || 0)
    : this.targets?.length || 0;
});

salesTaskSchema.set("toJSON", { virtuals: true });
salesTaskSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.SalesTask ||
  mongoose.model("SalesTask", salesTaskSchema, "sales_tasks");
