// models/Sales_Models/SalesLead.js
//
// A farmer or dealer, from the first knock to the paying customer they become.
//
// ONE DOCUMENT, NOT TWO
// ---------------------
// A "lead" and a "customer" are the same person at different points of the same
// conversation, so they are the same row. `isCustomer` flips when the lead
// reaches a stage whose outcome is `won`. Splitting them into two collections
// would mean the day somebody converts, their visit history, photos and
// captured land details either get copied (and drift) or get left behind (and
// the service team turns up knowing nothing).
//
// WHAT LIVES HERE AND WHAT DOES NOT
// ---------------------------------
// The identity of the person and where they stand — name, phone, where they
// are, which rung, who owns them, what happened. The ANSWERS to the forms do
// not: those are SalesFormSubmission rows, because a lead accumulates one per
// stage per visit and embedding them would grow this document without bound.

const mongoose = require("mongoose");

const timelineSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    kind: {
      type: String,
      enum: [
        "created", "assigned", "contacted", "stage_changed", "form_submitted",
        "otp_verified", "note", "call", "visit", "status_changed", "service_raised",
        "approved", "rejected", "scheme_assigned", "scheme_changed", "step_overridden",
        "conflict",
      ],
      default: "note",
    },
    message: { type: String, trim: true, default: "" },
    byKind: { type: String, enum: ["employee", "desk", "system"], default: "system" },
    by: { type: mongoose.Schema.Types.ObjectId },
    byName: { type: String, trim: true, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const salesLeadSchema = new mongoose.Schema(
  {
    // Human-quotable identifier. The field team reads this down a phone line;
    // an ObjectId is not something anybody can say out loud.
    code: { type: String, unique: true, index: true },

    name: { type: String, required: true, trim: true },
    // The one field that has to be right. Every OTP, every callback and every
    // duplicate check keys off it, so it is stored as ten digits and nothing
    // else — see normalisePhone() in services/salesLeads.js.
    phone: { type: String, required: true, trim: true, index: true },
    altPhone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    category: {
      type: String,
      enum: ["farmer", "dealer", "distributor", "institution", "other"],
      default: "farmer",
    },

    address: {
      line: { type: String, trim: true, default: "" },
      village: { type: String, trim: true, default: "" },
      taluka: { type: String, trim: true, default: "" },
      district: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
      landmark: { type: String, trim: true, default: "" },
    },

    // Where the employee actually stood when they captured this person. Not
    // the address — the address is what was written down, this is where the
    // phone was. Both matter; only one can be checked.
    geo: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      capturedAt: { type: Date, default: null },
    },

    source: {
      type: String,
      enum: ["field_visit", "referral", "call_in", "camp", "dealer", "import", "other"],
      default: "field_visit",
    },

    /* ── Where it stands ─────────────────────────────────────────────── */

    pipelineKey: { type: String, default: "default", lowercase: true, trim: true },
    // The referential half of pipelineKey — see the note on SalesStage.schemeId.
    // A customer belongs to exactly ONE scheme at a time; moving between them is
    // an audited action, never an edit. See changeScheme() in
    // services/salesProgression.js.
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme", default: null, index: true },
    schemeAssignedAt: { type: Date, default: null },

    stageKey: { type: String, required: true, lowercase: true, trim: true, index: true },
    // When they arrived on the step they are on. "Sitting on Negotiation since
    // March" is the question the desk actually asks, and deriving it by walking
    // stageHistory on every row of a list is what makes that list slow.
    stageEnteredAt: { type: Date, default: Date.now },

    // THE CUSTOMER'S OWN STATE, and nothing else's. Not the step they are on
    // (stageKey), not whether their last form was accepted (the submission's
    // approval.status), not whether their task is finished (the task's status).
    // Those four answer different questions and collapsing any two of them is
    // how a board starts lying.
    //
    //   pending_approval  registered in the field, not yet accepted by the desk
    //   rejected          the registration was refused; kept, never deleted
    //   open              accepted, no work done yet
    //   in_progress       moving through their scheme
    //   won / lost        reached a terminal step
    //   on_hold           parked by the desk
    status: {
      type: String,
      enum: ["pending_approval", "rejected", "open", "in_progress", "won", "lost", "on_hold"],
      default: "open",
      index: true,
    },
    isCustomer: { type: Boolean, default: false, index: true },
    lostReason: { type: String, trim: true, default: "" },

    // Every rung this lead has climbed, with the submission that carried it.
    // This is the audit answer to "who said this farmer had agreed, and what
    // did they photograph".
    stageHistory: {
      type: [
        new mongoose.Schema(
          {
            stageKey: { type: String, trim: true },
            at: { type: Date, default: Date.now },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
            byName: { type: String, trim: true, default: "" },
            submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormSubmission" },
            taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // Every scheme this customer has been through. Append-only: a customer put
    // into the wrong scheme keeps the wrong one on the record with the reason it
    // was corrected, because "why is their history split across two workflows"
    // is a question somebody will ask in two years.
    schemeHistory: {
      type: [
        new mongoose.Schema(
          {
            schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme" },
            schemeKey: { type: String, lowercase: true, trim: true, default: "" },
            schemeName: { type: String, trim: true, default: "" },
            from: { type: Date, default: Date.now },
            to: { type: Date, default: null },
            // Where they got to before leaving it, so a completed or abandoned
            // run stays legible without replaying every submission.
            lastStageKey: { type: String, lowercase: true, trim: true, default: "" },
            reason: { type: String, trim: true, default: "" },
            by: { type: mongoose.Schema.Types.ObjectId },
            byName: { type: String, trim: true, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    /* ── Ownership ───────────────────────────────────────────────────── */

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", index: true },
    assignedToName: { type: String, trim: true, default: "" },
    assignedToCode: { type: String, trim: true, default: "" },
    assignedAt: { type: Date, default: null },

    createdByKind: { type: String, enum: ["employee", "desk", "import"], default: "employee" },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
    createdByName: { type: String, trim: true, default: "" },
    originTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask", default: null },

    /* ── Commercials and follow-up ───────────────────────────────────── */

    estimatedValue: { type: Number, default: 0 },
    dealValue: { type: Number, default: 0 },
    amountCollected: { type: Number, default: 0 },

    lastContactedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null, index: true },
    visitCount: { type: Number, default: 0 },

    // Set once the farmer has answered an OTP on their own handset. It is the
    // one signal here that cannot be typed in by an employee sitting at home.
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date, default: null },

    tags: { type: [String], default: [] },
    notes: { type: String, trim: true, default: "" },

    timeline: { type: [timelineSchema], default: [] },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The board's own query: this stage, these owners, most recently touched first.
salesLeadSchema.index({ pipelineKey: 1, stageKey: 1, updatedAt: -1 });
salesLeadSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });
// "Who is on this step of this scheme" — the follow-up picker's own query.
salesLeadSchema.index({ schemeId: 1, stageKey: 1, status: 1 });
salesLeadSchema.index({ name: "text", phone: "text", "address.village": "text" });

/** Append to the timeline without loading and re-saving the whole document. */
salesLeadSchema.statics.pushTimeline = function (leadId, entry) {
  return this.updateOne(
    { _id: leadId },
    // Newest first, and hard-capped. A lead worked for a year would otherwise
    // carry hundreds of entries into every list query that projects it.
    { $push: { timeline: { $each: [entry], $position: 0, $slice: 200 } } },
  );
};

module.exports =
  mongoose.models.SalesLead ||
  mongoose.model("SalesLead", salesLeadSchema, "sales_leads");
