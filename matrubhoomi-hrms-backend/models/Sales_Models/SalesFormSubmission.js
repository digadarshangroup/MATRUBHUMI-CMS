// models/Sales_Models/SalesFormSubmission.js
//
// One filled form, exactly as it was filled.
//
// IT IS A RECORD, NOT A DRAFT
// ---------------------------
// A submission is written once and never edited. It carries the template's
// version and a frozen copy of the field labels it was answered against, so it
// stays readable years later even if the template it came from has been
// rewritten five times. A correction is a NEW submission against the same lead
// and stage — that is what keeps "what did the employee actually say in March"
// answerable.
//
// WHAT MAKES IT TRUSTWORTHY
// -------------------------
// Three things are captured alongside the answers and none of them can be
// typed in: where the phone was, when it was, and whether the farmer answered
// an OTP on their own handset. An employee filling this in from a tea shop
// produces a record that says so.

const mongoose = require("mongoose");

const photoSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, trim: true, default: "" },
    url: { type: String, required: true, trim: true },
    publicId: { type: String, trim: true, default: "" },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    bytes: { type: Number, default: null },
    // Where the CAMERA was, which is not always where the form was submitted
    // — a photo of a field taken at the boundary, submitted at the house.
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    takenAt: { type: Date, default: null },
  },
  { _id: false },
);

const salesFormSubmissionSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask", default: null, index: true },

    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormTemplate", required: true },
    templateName: { type: String, trim: true, default: "" },
    templateVersion: { type: Number, default: 1 },

    pipelineKey: { type: String, default: "default", lowercase: true, trim: true },
    // The referential half of pipelineKey — see the note on SalesStage.schemeId.
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme", default: null, index: true },
    schemeVersion: { type: Number, default: null },
    stageKey: { type: String, lowercase: true, trim: true, default: "" },
    // The rung the lead was on BEFORE this submission moved it. Without it the
    // history reads as a list of destinations with no route.
    fromStageKey: { type: String, lowercase: true, trim: true, default: "" },

    // The answers. A Map rather than a fixed shape, because the shape is the
    // template's business — see the file header on why the labels come with it.
    values: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    // Frozen key-to-label for the version answered. Renders an old submission
    // without having to resurrect the template that produced it.
    labels: { type: Map, of: String, default: {} },

    photos: { type: [photoSchema], default: [] },
    signatureUrl: { type: String, trim: true, default: "" },

    /* ── The three things that cannot be typed in ────────────────────── */

    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      // Android reports when a fix came from a mock provider. A record flagged
      // here is not rejected — a genuine fix can be mislabelled on some
      // handsets — but it is surfaced to the desk rather than quietly kept.
      isMock: { type: Boolean, default: false },
      address: { type: String, trim: true, default: "" },
      capturedAt: { type: Date, default: null },
    },

    otp: {
      required: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      phone: { type: String, trim: true, default: "" },
      verifiedAt: { type: Date, default: null },
      verificationId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOtp", default: null },
    },

    /* ── Who and how ─────────────────────────────────────────────────── */

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    submittedByName: { type: String, trim: true, default: "" },
    submittedByCode: { type: String, trim: true, default: "" },

    // When the employee pressed save on the handset, which on a bad-signal day
    // is hours before `createdAt`. Both are kept; the desk is shown this one.
    capturedAt: { type: Date, default: Date.now, index: true },
    // True when this arrived from the offline queue rather than live. It is the
    // honest explanation for a record that lands at 9pm for a 2pm visit.
    wasQueued: { type: Boolean, default: false },

    device: {
      model: { type: String, trim: true, default: "" },
      osVersion: { type: String, trim: true, default: "" },
      appVersion: { type: String, trim: true, default: "" },
      battery: { type: Number, default: null },
    },

    // The app's own id for this submission, carried through so a retry that
    // arrives twice stores once. The offline queue WILL retry — a socket that
    // dies after the server committed looks identical to one that died before.
    clientRef: { type: String, trim: true, default: "" },

    // What this submission was FOR. `outcome` below says how the visit went;
    // this says which of the two workflows produced it, which is what the desk's
    // approval queue and the task counters filter on.
    kind: {
      type: String,
      enum: ["new_customer", "follow_up", "other"],
      default: "other",
      index: true,
    },

    /* ── Approval: the organisation's answer, not the employee's ─────── */
    //
    // An employee pressing Submit is a CLAIM that a step is done. Approval is
    // the organisation accepting it. They are separate on purpose and the
    // customer only moves on the second one — see services/salesProgression.js.
    //
    // `required` is frozen from the step's requiresApproval at submission time,
    // so turning the gate off next week never silently approves what is already
    // sitting in the queue, and turning it on never re-opens what already went
    // through. `auto` is the honest name for a submission that was never
    // reviewed because its step did not ask for review.
    approval: {
      required: { type: Boolean, default: true },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "auto"],
        default: "pending",
        index: true,
      },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser", default: null },
      decidedByName: { type: String, trim: true, default: "" },
      decidedAt: { type: Date, default: null },
      // Required by the API on a rejection. A refusal with no reason is not
      // something the employee can act on, and rework is the whole point.
      note: { type: String, trim: true, default: "" },
      // Which submission superseded this one after a rejection, so the rework
      // chain reads forwards as well as backwards.
      supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormSubmission", default: null },
    },

    /* ── Arriving late into a world that moved on ────────────────────── */
    //
    // The handset holds work for hours. A submission for step 2 can land after
    // the customer has already been advanced past step 2 by somebody else. The
    // answers are still real and are never discarded — but they are NOT applied
    // to whatever step the customer happens to be on now, which would silently
    // credit the wrong rung. It is flagged instead and an approver decides.
    conflict: {
      detected: { type: Boolean, default: false },
      // Where the customer stood when this was captured, and where they had
      // moved to by the time it arrived.
      expectedStageKey: { type: String, lowercase: true, trim: true, default: "" },
      actualStageKey: { type: String, lowercase: true, trim: true, default: "" },
      note: { type: String, trim: true, default: "" },
    },

    outcome: {
      type: String,
      enum: ["progressed", "not_interested", "unreachable", "reschedule", "recorded"],
      default: "progressed",
    },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

salesFormSubmissionSchema.index({ leadId: 1, capturedAt: -1 });
// The approval queue: everything still waiting, oldest first, because the
// person who has been waiting longest is the one to deal with next.
salesFormSubmissionSchema.index({ "approval.status": 1, capturedAt: 1 });
salesFormSubmissionSchema.index({ submittedBy: 1, capturedAt: -1 });
// Partial, because "" is the normal value for a submission made from the web
// side and a plain unique index would allow exactly one of those to exist.
salesFormSubmissionSchema.index(
  { clientRef: 1 },
  { unique: true, partialFilterExpression: { clientRef: { $type: "string", $gt: "" } } },
);

module.exports =
  mongoose.models.SalesFormSubmission ||
  mongoose.model("SalesFormSubmission", salesFormSubmissionSchema, "sales_form_submissions");
