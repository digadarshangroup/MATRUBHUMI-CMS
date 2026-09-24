// services/ensureSalesDefaults.js
//
// A pipeline and two starter forms, so the sales module is usable the first
// time somebody opens it.
//
// STRICTLY ADDITIVE, same contract as ensureAccessDepartments: it inserts what
// is missing and modifies nothing that exists. A desk that has renamed a stage,
// reordered the ladder, or deleted a form it did not want keeps its decisions
// across every restart.
//
// The stages below are this company's actual sequence — a farmer is reached,
// agrees, has their land measured, signs, pays, and is onboarded — and they are
// a STARTING POINT, not a schema. The whole reason stages are rows is that the
// desk will change them.

"use strict";

const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");

const STAGES = [
  { key: "contacted", name: "Contacted", order: 10, tone: "neutral",
    description: "Reached in person or by phone. Nothing agreed yet." },
  { key: "interested", name: "Interested", order: 20, tone: "water", requiresOtp: true,
    description: "Willing to hear the plan. Phone verified so the number is real." },
  { key: "details_captured", name: "Details captured", order: 30, tone: "water", requiresPhoto: true,
    description: "Basic particulars and identification collected." },
  { key: "field_survey", name: "Field survey", order: 40, tone: "harvest", requiresPhoto: true,
    description: "Land measured and photographed on site." },
  { key: "agreement", name: "Agreement", order: 50, tone: "harvest", requiresOtp: true, requiresPhoto: true,
    description: "Terms accepted and signed." },
  { key: "payment", name: "Payment", order: 60, tone: "brand", requiresOtp: true,
    description: "First instalment collected and receipted." },
  { key: "onboarded", name: "Onboarded", order: 70, tone: "brand", isTerminal: true, terminalOutcome: "won",
    description: "A paying customer. Service visits are raised from here." },
  { key: "lost", name: "Lost", order: 900, tone: "brick", isTerminal: true, terminalOutcome: "lost",
    description: "Not proceeding. The reason is on the lead." },
];

/** The first form: what a field employee captures on the doorstep. */
const FIRST_CONTACT_FORM = {
  name: "First contact",
  description: "What the employee captures on the first visit to a farmer.",
  stageKey: "contacted",
  requiresLocation: true,
  fields: [
    { key: "met_in_person", label: "Met in person", type: "checkbox", order: 10 },
    { key: "crop", label: "Main crop", type: "select", required: true, order: 20,
      options: [
        { label: "Paddy", value: "paddy" }, { label: "Wheat", value: "wheat" },
        { label: "Sugarcane", value: "sugarcane" }, { label: "Cotton", value: "cotton" },
        { label: "Vegetables", value: "vegetables" }, { label: "Other", value: "other" },
      ] },
    { key: "land_size", label: "Land holding", type: "area", unit: "acre", required: true, min: 0, order: 30 },
    { key: "irrigation", label: "Has irrigation", type: "radio", order: 40,
      options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
    { key: "irrigation_type", label: "Irrigation type", type: "select", order: 50,
      showWhen: { field: "irrigation", equals: "yes" },
      options: [
        { label: "Borewell", value: "borewell" }, { label: "Canal", value: "canal" },
        { label: "Drip", value: "drip" }, { label: "Rain-fed", value: "rainfed" },
      ] },
    { key: "interest", label: "Level of interest", type: "rating", min: 1, max: 5, required: true, order: 60 },
    { key: "site_photo", label: "Photo at the site", type: "photo", maxPhotos: 2, order: 70,
      helpText: "A photo of the farm or the meeting. Taken here, not from the gallery." },
    { key: "remarks", label: "Remarks", type: "textarea", maxLength: 500, order: 80 },
  ],
};

/** The second: the land measurements that only exist after a real visit. */
const FIELD_SURVEY_FORM = {
  name: "Field survey",
  description: "Land measurements and site photographs, captured on the plot.",
  stageKey: "field_survey",
  requiresPhoto: true,
  requiresLocation: true,
  fields: [
    { key: "survey_number", label: "Survey number", type: "text", required: true, order: 10 },
    { key: "measured_area", label: "Measured area", type: "area", unit: "acre", required: true, min: 0, order: 20 },
    { key: "soil_type", label: "Soil type", type: "select", order: 30,
      options: [
        { label: "Black", value: "black" }, { label: "Red", value: "red" },
        { label: "Alluvial", value: "alluvial" }, { label: "Sandy", value: "sandy" },
        { label: "Laterite", value: "laterite" },
      ] },
    { key: "water_source_distance", label: "Distance to water source (m)", type: "number", min: 0, order: 40 },
    { key: "road_access", label: "Road access", type: "radio", order: 50,
      options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
    { key: "boundary_photos", label: "Boundary photographs", type: "photo", required: true, maxPhotos: 4, order: 60 },
    { key: "surveyor_note", label: "Surveyor's note", type: "textarea", maxLength: 800, order: 70 },
  ],
};

async function ensureSalesDefaults() {
  try {
    // The scheme the seeded stages belong to. Its key is "default", which is
    // what every sales document's `pipelineKey` already says — so this row is
    // what turns the pipeline that has always existed into a scheme, on a fresh
    // database and on an old one alike. scripts/migrateSalesSchemes.js does the
    // same thing for a database written before schemes existed; both are
    // strictly additive and agree on the row they produce.
    let scheme = await SalesScheme.findOne({ key: "default" }).lean();
    if (!scheme) {
      scheme = (
        await SalesScheme.create({
          key: "default",
          name: "Default pipeline",
          description:
            "The pipeline this system starts with. Rename it, change its steps, or build another scheme beside it from Sales → Configuration.",
          order: 10,
          isActive: true,
          isLegacy: true,
        })
      ).toObject();
      console.log('[sales] Registered the "Default pipeline" scheme.');
    }

    const existing = await SalesStage.countDocuments({ pipelineKey: "default" });

    if (existing === 0) {
      await SalesStage.insertMany(
        STAGES.map((s) => ({
          pipelineKey: "default",
          schemeId: scheme._id,
          isActive: true,
          requiresLocation: true,
          ...s,
        })),
      );
      console.log(`[sales] Seeded ${STAGES.length} pipeline stages. Rename or reorder them from Sales → Configuration.`);
    } else {
      // Stages seeded before the scheme row existed. Additive, and matches only
      // the rows still missing the link, so it settles after one boot.
      await SalesStage.updateMany(
        { pipelineKey: "default", $or: [{ schemeId: null }, { schemeId: { $exists: false } }] },
        { $set: { schemeId: scheme._id } },
      );
    }

    // Forms are seeded by NAME, independently of the stages. A desk that
    // deleted "First contact" on purpose does not get it back — the check is
    // "has this name ever existed", not "does the stage have a template".
    for (const form of [FIRST_CONTACT_FORM, FIELD_SURVEY_FORM]) {
      const already = await SalesFormTemplate.findOne({ name: form.name }).select("_id stageKey").lean();
      if (already) {
        await attachToStage(already.stageKey || form.stageKey, already._id);
        continue;
      }
      const created = await SalesFormTemplate.create({ ...form, version: 1, isActive: true });
      await attachToStage(form.stageKey, created._id);
      console.log(`[sales] Seeded the "${form.name}" form template.`);
    }

    // Two forms for eight steps. The other six cannot be assigned until the
    // desk builds one, and the only place that used to be said was a 409 at the
    // moment somebody tried — by which point they are on the assignment screen
    // wondering what they did wrong. Said at boot, and again on the
    // configuration screen (GET /api/sales/stages returns `needsForm`).
    const unformed = await SalesStage.find({
      pipelineKey: "default",
      templateId: null,
      isTerminal: { $ne: true },
      isActive: true,
    })
      .select("name")
      .lean();

    if (unformed.length) {
      console.log(
        `[sales] ${unformed.length} step(s) have no form yet and cannot be assigned: ` +
          `${unformed.map((s) => s.name).join(", ")}. Build one for each from Sales → Configuration.`,
      );
    }
  } catch (err) {
    // Never take the server down over defaults. Every screen this feeds renders
    // an empty state that says what to create, so a failure here is visible and
    // recoverable from the UI rather than fatal at boot.
    console.error("[sales] Could not prepare the sales defaults:", err.message);
  }
}

/** Point a stage at a template, only if it does not already have one. */
async function attachToStage(stageKey, templateId) {
  if (!stageKey) return;
  await SalesStage.updateOne(
    { pipelineKey: "default", key: stageKey, templateId: null },
    { $set: { templateId } },
  );
}

module.exports = { ensureSalesDefaults, STAGES };
