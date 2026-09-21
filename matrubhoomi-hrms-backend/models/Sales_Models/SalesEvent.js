// models/Sales_Models/SalesEvent.js
//
// What happened, as a row that outlives the thing it happened to.
//
// WHY NOT SalesLead.timeline
// --------------------------
// The lead already carries a `timeline`, and it is the right thing for what it
// does: the last two hundred entries, embedded, so the desk can draw a lead's
// story without a second query. It is explicitly capped ($slice: 200) because
// a lead worked for a year would otherwise drag hundreds of entries into every
// list query that projects it.
//
// A cap is fine for a narrative and wrong for an audit. "Who moved this
// customer to another scheme, and why" has to still be answerable in 2031, on a
// customer with four thousand events. So the timeline stays as the readable
// summary and this collection is the record — uncapped, queryable by actor, by
// customer, by kind, and never trimmed.
//
// IT IS APPEND-ONLY
// -----------------
// Nothing updates a row here. A correction is a new event describing the
// correction, which is the only version of "audit" that means anything.

const mongoose = require("mongoose");

/**
 * Every business action worth attributing. Adding one is cheap; renaming one
 * is not, because rows already written carry the old name forever.
 */
const EVENT_KINDS = [
  // Configuration
  "scheme_created", "scheme_updated", "scheme_archived", "scheme_restored",
  "step_added", "step_updated", "step_reordered", "step_archived",
  "template_versioned",
  // Customers
  "customer_created", "customer_approved", "customer_rejected",
  "scheme_assigned", "scheme_changed", "step_advanced", "step_overridden",
  "customer_completed",
  // Work
  "task_assigned", "task_reassigned", "task_cancelled", "task_reopened",
  "submission_made", "submission_approved", "submission_rejected",
  "submission_conflicted",
];

const salesEventSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: EVENT_KINDS, required: true, index: true },

    // What it happened to. All optional because a scheme edit has no customer
    // and a customer approval has no stage change — but at least one is always
    // set, and the indexes below are what make the detail pages cheap.
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", default: null, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask", default: null, index: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormSubmission", default: null },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme", default: null, index: true },
    stageKey: { type: String, lowercase: true, trim: true, default: "" },

    // The change itself, in whatever shape the event needs. Kept as plain
    // strings rather than ids where a human will read it back — an ObjectId in
    // an audit line is not an answer to "what changed".
    from: { type: String, trim: true, default: "" },
    to: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },

    // Who. `kind` matters as much as the id: the same action taken by the desk
    // and by the phone means different things about how much to trust it.
    actorKind: { type: String, enum: ["employee", "desk", "system", "migration"], default: "system" },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorName: { type: String, trim: true, default: "" },

    message: { type: String, trim: true, default: "" },

    // Anything else the event wants to carry. Deliberately not a free-for-all:
    // never put a form's ANSWERS here — those belong on the submission, which
    // is the document that freezes their labels alongside them.
    meta: { type: mongoose.Schema.Types.Mixed, default: null },

    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The customer detail page's own query: this customer, newest first.
salesEventSchema.index({ leadId: 1, at: -1 });
// "What did this person do last week", for the desk's audit screen.
salesEventSchema.index({ actorId: 1, at: -1 });

salesEventSchema.statics.EVENT_KINDS = EVENT_KINDS;

/**
 * Append an event. Never throws into the caller.
 *
 * An audit row that fails to write must not roll back the business action it
 * was describing — losing the note is bad, losing the approval is worse. The
 * failure is logged loudly instead, which is the honest trade.
 */
salesEventSchema.statics.record = async function record(entry) {
  try {
    return await this.create({ at: new Date(), ...entry });
  } catch (err) {
    console.error("[sales] audit event not written:", err.message, entry?.kind);
    return null;
  }
};

module.exports =
  mongoose.models.SalesEvent ||
  mongoose.model("SalesEvent", salesEventSchema, "sales_events");
