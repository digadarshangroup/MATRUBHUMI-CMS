// models/Sales_Models/SalesFormTemplate.js
//
// The form the sales desk designs and the app renders.
//
// WHY THE FIELDS ARE DATA
// -----------------------
// What has to be collected from a farmer changes with the season, the scheme
// and whatever the district office asked for last week. Shipping an app build
// for a new field is not a workable answer for a team standing in a field with
// one bar of signal — so the desk composes the form here, and the Android app
// renders whatever it is handed. The app knows field TYPES; it knows nothing
// about this company's questions.
//
// WHY TEMPLATES ARE VERSIONED AND NEVER EDITED IN PLACE
// -----------------------------------------------------
// A submission stores `templateVersion` alongside its values. Editing a live
// template in place would silently re-interpret every answer already collected
// under the old shape — a renamed key turns last month's answers into orphans,
// and a removed field makes them invisible. So an edit BUMPS the version and
// keeps the field list that produced existing submissions readable. Old
// submissions still render against the version they were captured under.

const mongoose = require("mongoose");

/** Everything the Android renderer knows how to draw. */
const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "phone",
  "email",
  "date",
  "time",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "photo",
  "signature",
  "location",
  "rating",
  "area",       // land size with a unit — acre / bigha / hectare
  "heading",    // not an input: a section break the renderer draws as a title
];

const optionSchema = new mongoose.Schema(
  { label: { type: String, required: true, trim: true }, value: { type: String, required: true, trim: true } },
  { _id: false },
);

const fieldSchema = new mongoose.Schema(
  {
    // The key a submission stores its answer under. Immutable once the
    // template has submissions — the API refuses to rename rather than orphan
    // the answers, and offers "add a new field" instead.
    key: {
      type: String,
      required: true,
      trim: true,
      match: [/^[a-zA-Z0-9_]+$/, "A field key may contain only letters, digits and underscores"],
    },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: FIELD_TYPES, required: true, default: "text" },

    required: { type: Boolean, default: false },
    placeholder: { type: String, trim: true, default: "" },
    helpText: { type: String, trim: true, default: "" },

    options: { type: [optionSchema], default: [] },

    // Numeric and length bounds. Enforced on the server at submission — the
    // app validates too, but an app build is not a security boundary.
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    maxLength: { type: Number, default: null },
    pattern: { type: String, trim: true, default: "" },

    // photo only. `maxPhotos` caps what the app will let through and what the
    // API will store; every photo lands in Cloudinary and only its URL is kept.
    maxPhotos: { type: Number, default: 3 },
    // photo only: force the camera rather than the gallery. The point of a
    // field photo is that it was taken THERE, and a gallery pick is not that.
    cameraOnly: { type: Boolean, default: true },

    // area only.
    unit: { type: String, trim: true, default: "acre" },

    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },

    // Show this field only when another answer matches. Keeps a long form
    // short in the hand: "irrigation type" appears once "has irrigation" is yes.
    showWhen: {
      field: { type: String, trim: true, default: "" },
      equals: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const salesFormTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    // The stage this form belongs to. A template can be stage-less (used only
    // when a task names it explicitly), which is how one-off surveys work.
    stageKey: { type: String, lowercase: true, trim: true, default: "" },
    pipelineKey: { type: String, default: "default", lowercase: true, trim: true },

    // WHERE THIS FORM IS ATTACHED, which is the only thing that differs between
    // the two configuration surfaces the desk sees.
    //
    //   new_customer  the one registration form, asked of every new customer
    //                 whichever scheme they turn out to belong to. Exactly one
    //                 is active at a time.
    //   scheme_step   attached to a step of a scheme, via SalesStage.templateId
    //   standalone    named explicitly by a task; a one-off survey
    //
    // There is ONE form engine and one builder. This field decides where a
    // template hangs, never how it is designed or rendered — an app that can
    // draw a scheme step's form can draw the registration form, because they
    // are the same thing in two places.
    purpose: {
      type: String,
      enum: ["new_customer", "scheme_step", "standalone"],
      default: "standalone",
      index: true,
    },

    version: { type: Number, default: 1 },
    fields: { type: [fieldSchema], default: [] },

    // Mirrors of the stage gates, so a template can tighten (never loosen)
    // what its stage already demands.
    requiresOtp: { type: Boolean, default: false },
    requiresPhoto: { type: Boolean, default: false },
    requiresLocation: { type: Boolean, default: true },

    isActive: { type: Boolean, default: true },

    // Set the first time a submission is stored against this template. It is
    // what turns an edit into a version bump instead of an in-place change.
    submissionCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    createdByName: { type: String, trim: true, default: "" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
  },
  { timestamps: true },
);

salesFormTemplateSchema.index({ isActive: 1, stageKey: 1, name: 1 });

salesFormTemplateSchema.statics.FIELD_TYPES = FIELD_TYPES;

/** The shape the Android app renders. No audit columns, no counters. */
salesFormTemplateSchema.methods.toRenderable = function () {
  return {
    id: String(this._id),
    name: this.name,
    description: this.description || "",
    stageKey: this.stageKey || "",
    purpose: this.purpose || "standalone",
    version: this.version,
    requiresOtp: this.requiresOtp,
    requiresPhoto: this.requiresPhoto,
    requiresLocation: this.requiresLocation,
    fields: [...this.fields]
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        placeholder: f.placeholder || "",
        helpText: f.helpText || "",
        options: (f.options || []).map((o) => ({ label: o.label, value: o.value })),
        min: f.min,
        max: f.max,
        maxLength: f.maxLength,
        pattern: f.pattern || "",
        maxPhotos: f.maxPhotos,
        cameraOnly: f.cameraOnly,
        unit: f.unit || "",
        defaultValue: f.defaultValue,
        showWhen: f.showWhen?.field ? { field: f.showWhen.field, equals: f.showWhen.equals } : null,
      })),
  };
};

module.exports =
  mongoose.models.SalesFormTemplate ||
  mongoose.model("SalesFormTemplate", salesFormTemplateSchema, "sales_form_templates");
