// models/Sales_Models/SalesScheme.js
//
// A named workflow a customer is put through, and the owner of its steps.
//
// IT IS THE pipelineKey, GROWN UP
// -------------------------------
// Every sales document already carries a `pipelineKey` — SalesStage, SalesLead,
// SalesTask, SalesFormTemplate and SalesFormSubmission all have one, and the
// original note on SalesStage says it was "reserved for the day there is more
// than one pipeline". That day arrived. This row IS that key: `key` here equals
// the `pipelineKey` everything else stores, so introducing schemes costs no
// migration of the documents that were written before schemes existed.
//
// The consequence worth stating plainly: a scheme's STEPS are SalesStage rows
// whose `pipelineKey` is this scheme's key. There is no second step model, and
// there must never be one — two ways to say "which rung is this customer on" is
// the thing that makes a progression system impossible to reason about.
//
// WHY IT IS ARCHIVED AND NOT DELETED
// ----------------------------------
// A scheme is referenced by customers, by tasks assigned last month, and by
// submissions captured a year ago. Deleting the row would leave every one of
// them pointing at nothing — and the whole point of keeping the form's labels
// on the submission is that history stays readable. So a scheme in use can be
// deactivated (no new customers) or archived (hidden from the desk), never
// removed. `isActive: false` is the reversible one; archiving is the filing
// cabinet.

const mongoose = require("mongoose");

const schemeSchema = new mongoose.Schema(
  {
    // The stable machine handle. Equal to `pipelineKey` on every other sales
    // document, which is why it may never change once anything references it —
    // the API refuses a rename rather than orphan a customer's whole history.
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_]+$/, "A scheme key may contain only lowercase letters, digits and underscores"],
    },

    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    // Where it shows in the desk's list. Gaps are deliberate, same as stages.
    order: { type: Number, default: 100 },

    // Bumped by any change to the scheme's own shape — steps added, reordered,
    // renamed. A task snapshots the version it was created under so the desk
    // can answer "which arrangement of this scheme was that customer assigned
    // against" without having to reconstruct it from timestamps.
    version: { type: Number, default: 1 },

    // Closed to NEW customers. Everybody already inside keeps progressing —
    // stopping mid-workflow would strand them with no legal next step.
    isActive: { type: Boolean, default: true },

    // Hidden from the desk's normal lists. Only ever set once nothing active
    // references it; see assertSafeToArchive() in services/salesSchemes.js.
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivedReason: { type: String, trim: true, default: "" },

    // Set on the scheme that existing pre-scheme data was folded into, so the
    // desk can tell "this is the pipeline we always had" from one it designed.
    // Migration never guesses a scheme for a customer; it only ever puts them
    // in this one. See scripts/migrateSalesSchemes.js.
    isLegacy: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    createdByName: { type: String, trim: true, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    updatedByName: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

schemeSchema.index({ isArchived: 1, isActive: 1, order: 1 });

module.exports =
  mongoose.models.SalesScheme ||
  mongoose.model("SalesScheme", schemeSchema, "sales_schemes");
