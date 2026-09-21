// models/Sales_Models/SalesStage.js
//
// One rung of the sales pipeline, as a ROW rather than an enum.
//
// A lead does not go from "new" to "customer" in one visit. The field team
// reaches a farmer, gets agreement, comes back for land measurements, comes
// back again for the money. Each of those is a separate visit by a possibly
// different employee, capturing a different set of fields — which is exactly
// why the stage list and the form attached to each stage are configuration and
// not code. The sales desk adds "Soil test" between survey and agreement
// without anybody deploying anything.
//
// `key` is the stable machine handle every other document stores. `name` is
// what the desk renames freely. Never compare against `name`.

const mongoose = require("mongoose");

const salesStageSchema = new mongoose.Schema(
  {
    // Reserved for the day there is more than one pipeline (farmers vs
    // dealers, say). Everything defaults into one so nothing has to think
    // about it until then.
    pipelineKey: { type: String, default: "default", lowercase: true, trim: true, index: true },

    // The scheme this step belongs to. `pipelineKey` above is still the handle
    // every other document stores and remains the source of truth for matching;
    // this is the referential half of the same fact, so the desk can populate a
    // step's scheme in one query instead of a second lookup by key. The two are
    // written together and services/salesSchemes.js is the only thing that sets
    // either — never set one without the other.
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesScheme", default: null, index: true },

    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_]+$/, "A stage key may contain only lowercase letters, digits and underscores"],
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    // Position in the ladder. Gaps are deliberate (10, 20, 30 …) so a stage can
    // be inserted between two others without renumbering the rest.
    order: { type: Number, required: true, default: 100 },

    // Reads as a status colour on the board. One of the palette's token names,
    // never a hex — the web side maps these onto --g-* so a stage colour still
    // follows a theme change.
    tone: {
      type: String,
      enum: ["brand", "water", "harvest", "brick", "neutral"],
      default: "neutral",
    },

    // The form the employee is asked to fill to LEAVE this stage. Optional:
    // a stage can be a pure checkpoint ("Called, no answer") with nothing to
    // capture. A task may override this with its own template.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormTemplate", default: null },

    // Gates enforced by the API on submission, not merely hinted in the app.
    // An app build that forgets to ask is not allowed to advance a lead.
    requiresOtp: { type: Boolean, default: false },
    requiresPhoto: { type: Boolean, default: false },
    requiresLocation: { type: Boolean, default: true },

    // Whether finishing this step is the employee's word or the organisation's.
    //
    // ON (the default) means a submission against this step is recorded as
    // PENDING and the customer does NOT move until an approver accepts it. OFF
    // means the submission advances the customer the moment it lands, which is
    // how every stage behaved before approvals existed — kept as an option
    // because a pure checkpoint ("called, no answer") does not need a second
    // person to agree that the call happened.
    //
    // It is read at SUBMISSION time and frozen onto the submission, so turning
    // it off later never retroactively approves what is already waiting.
    requiresApproval: { type: Boolean, default: true },

    // Where the ladder ends. `won` marks the lead a paying customer — that is
    // the flag the service desk later raises maintenance visits against.
    isTerminal: { type: Boolean, default: false },
    terminalOutcome: { type: String, enum: ["won", "lost", null], default: null },

    isActive: { type: Boolean, default: true },

    // Retired. Distinct from isActive, which only closes the step to new
    // arrivals: an archived step is hidden from the desk's builder as well, and
    // is refused entirely while any customer still stands on it.
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
  },
  { timestamps: true },
);

salesStageSchema.index({ pipelineKey: 1, key: 1 }, { unique: true });
salesStageSchema.index({ pipelineKey: 1, isActive: 1, order: 1 });

module.exports =
  mongoose.models.SalesStage ||
  mongoose.model("SalesStage", salesStageSchema, "sales_stages");
