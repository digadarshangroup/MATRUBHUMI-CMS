"use strict";
// scripts/migrateSalesSchemes.js
//
// Give a database that predates schemes one, without moving anybody.
//
// WHAT IT DOES, AND WHAT IT REFUSES TO DO
// ---------------------------------------
// Every sales document already carries a `pipelineKey`, and on a database
// written before schemes existed that key is `"default"` on all of them. So the
// migration is not a data move at all: it creates ONE scheme row whose key is
// `"default"`, and points the existing stages, customers, tasks and submissions
// at it by id. Nobody changes step, nobody changes workflow, and no history is
// rewritten.
//
// It will NOT guess. If a customer is sitting on a step, they stay on it. If a
// deployment somehow has more than one pipelineKey, each one becomes its own
// scheme rather than being merged into a single guess about what the desk meant.
// Inventing a business relationship is worse than leaving one unstated.
//
// IT IS IDEMPOTENT
// ----------------
// Run it as many times as you like. Everything is an upsert or a filtered
// update that matches only rows still missing the field, so a second run
// reports zeros. That matters because the honest way to deploy this is to run
// it, read the summary, and run it again after the code is live.
//
// THE ONE BEHAVIOUR CHANGE IT MAKES
// ---------------------------------
// Existing steps gain `requiresApproval: true`, because that is the default the
// business asked for. On the day this ships, work that used to complete the
// moment an employee pressed Submit will instead wait for an approver. That is
// intended — but it is the kind of intended that strands a field team if nobody
// is told, so it is printed in full at the end and can be turned off per step
// from Sales → Configuration without another deploy.
//
//   MONGODB_URI=mongodb://127.0.0.1:27017/matrubhoomi_hrms node scripts/migrateSalesSchemes.js
//   MONGODB_URI=... node scripts/migrateSalesSchemes.js --dry-run
//
// --dry-run reports exactly what it would do and writes nothing.

const mongoose = require("mongoose");

const SalesScheme = require("../models/Sales_Models/SalesScheme");
const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesFormTemplate = require("../models/Sales_Models/SalesFormTemplate");
const SalesFormSubmission = require("../models/Sales_Models/SalesFormSubmission");
const SalesEvent = require("../models/Sales_Models/SalesEvent");

const DRY = process.argv.includes("--dry-run");
const log = (...a) => console.log(...a);

/** Every distinct pipelineKey anything has ever been written against. */
async function discoverPipelines() {
  const keys = new Set();
  for (const [model, field] of [
    [SalesStage, "pipelineKey"],
    [SalesLead, "pipelineKey"],
    [SalesTask, "pipelineKey"],
    [SalesFormTemplate, "pipelineKey"],
    [SalesFormSubmission, "pipelineKey"],
  ]) {
    const found = await model.distinct(field);
    for (const k of found) if (k) keys.add(String(k).toLowerCase());
  }
  // A database with sales data but no key at all still needs the default row,
  // because that is what every new document will be written against.
  if (keys.size === 0) keys.add("default");
  return [...keys].sort();
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  log(`\nConnected to ${mongoose.connection.name}${DRY ? "  (DRY RUN — nothing will be written)" : ""}\n`);

  const pipelines = await discoverPipelines();
  log(`Pipelines found: ${pipelines.join(", ")}\n`);

  const summary = [];

  for (const key of pipelines) {
    const isDefault = key === "default";
    const counts = {
      stages: await SalesStage.countDocuments({ pipelineKey: key }),
      leads: await SalesLead.countDocuments({ pipelineKey: key }),
      tasks: await SalesTask.countDocuments({ pipelineKey: key }),
      templates: await SalesFormTemplate.countDocuments({ pipelineKey: key }),
      submissions: await SalesFormSubmission.countDocuments({ pipelineKey: key }),
    };

    let scheme = await SalesScheme.findOne({ key }).lean();
    const existed = Boolean(scheme);

    if (!scheme) {
      const doc = {
        key,
        // Named after what it is, not after what anybody hopes it becomes. The
        // desk renames it from the Scheme Builder in one click; the KEY, which
        // is what every document stores, never changes.
        name: isDefault ? "Default pipeline" : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: isDefault
          ? "The pipeline this system started with, kept exactly as it was. Every customer who predates schemes is in it."
          : `Recovered from existing data written against "${key}".`,
        order: isDefault ? 10 : 100,
        isActive: true,
        isArchived: false,
        isLegacy: true,
        version: 1,
      };
      if (DRY) {
        log(`  would CREATE scheme "${doc.name}" (${key})`);
        scheme = { ...doc, _id: null };
      } else {
        scheme = (await SalesScheme.create(doc)).toObject();
        log(`  created scheme "${scheme.name}" (${key})`);
        await SalesEvent.record({
          kind: "scheme_created",
          schemeId: scheme._id,
          to: scheme.name,
          actorKind: "migration",
          actorName: "migrateSalesSchemes",
          message: `Scheme "${scheme.name}" created from existing pipelineKey "${key}"`,
          meta: counts,
        });
      }
    } else {
      log(`  scheme "${scheme.name}" (${key}) already exists`);
    }

    /* ── Point the existing documents at it ─────────────────────── */
    // Only rows that do not already have a schemeId are touched, which is what
    // makes a second run a no-op.

    const linkable = [
      [SalesStage, "stages"],
      [SalesLead, "customers"],
      [SalesTask, "tasks"],
      [SalesFormSubmission, "submissions"],
    ];

    const linked = {};
    for (const [model, label] of linkable) {
      const filter = { pipelineKey: key, $or: [{ schemeId: null }, { schemeId: { $exists: false } }] };
      const n = await model.countDocuments(filter);
      linked[label] = n;
      if (n && !DRY) await model.updateMany(filter, { $set: { schemeId: scheme._id } });
    }

    /* ── The one behaviour change ───────────────────────────────── */

    const needsFlag = await SalesStage.countDocuments({
      pipelineKey: key,
      requiresApproval: { $exists: false },
    });
    if (needsFlag && !DRY) {
      await SalesStage.updateMany(
        { pipelineKey: key, requiresApproval: { $exists: false } },
        { $set: { requiresApproval: true } },
      );
    }

    /* ── Fields added alongside the scheme work ─────────────────── */

    const noStageEntered = await SalesLead.countDocuments({
      pipelineKey: key,
      stageEnteredAt: { $exists: false },
    });
    if (noStageEntered && !DRY) {
      // Best available truth: when the record was last touched. Deliberately
      // NOT invented as "now" — that would claim every historical customer
      // arrived on their step today.
      await SalesLead.updateMany({ pipelineKey: key, stageEnteredAt: { $exists: false } }, [
        { $set: { stageEnteredAt: { $ifNull: ["$updatedAt", "$createdAt"] } } },
      ]);
    }

    // Submissions written before approvals existed were applied when they were
    // made. Calling them `auto` is the truthful label: nobody reviewed them,
    // and marking them `approved` would invent an approver who never existed.
    const noApproval = await SalesFormSubmission.countDocuments({
      pipelineKey: key,
      "approval.status": { $exists: false },
    });
    if (noApproval && !DRY) {
      await SalesFormSubmission.updateMany(
        { pipelineKey: key, "approval.status": { $exists: false } },
        { $set: { "approval.required": false, "approval.status": "auto" } },
      );
    }

    // A customer already in a scheme should say so in their history, so the
    // detail page's timeline does not begin mid-story.
    const noSchemeHistory = await SalesLead.countDocuments({
      pipelineKey: key,
      $or: [{ schemeHistory: { $exists: false } }, { schemeHistory: { $size: 0 } }],
    });
    if (noSchemeHistory && !DRY) {
      await SalesLead.updateMany(
        { pipelineKey: key, $or: [{ schemeHistory: { $exists: false } }, { schemeHistory: { $size: 0 } }] },
        [
          {
            $set: {
              schemeHistory: [
                {
                  schemeId: scheme._id,
                  schemeKey: key,
                  schemeName: scheme.name,
                  from: { $ifNull: ["$createdAt", new Date()] },
                  to: null,
                  lastStageKey: "",
                  reason: "Recorded by migration — this customer predates schemes",
                  by: null,
                  byName: "migrateSalesSchemes",
                },
              ],
            },
          },
        ],
      );
    }

    summary.push({ key, name: scheme.name, existed, counts, linked, needsFlag, noApproval, noStageEntered });
  }

  /* ── Report ───────────────────────────────────────────────────── */

  log("\n" + "=".repeat(68));
  log(DRY ? "WOULD CHANGE" : "CHANGED");
  log("=".repeat(68));

  let flagged = 0;
  for (const s of summary) {
    log(`\n${s.name}  (${s.key})${s.existed ? "  [scheme already existed]" : "  [scheme created]"}`);
    log(`  existing data : ${s.counts.stages} step(s), ${s.counts.leads} customer(s), ${s.counts.tasks} task(s), ${s.counts.submissions} submission(s)`);
    log(`  linked to it  : ${s.linked.stages} step(s), ${s.linked.customers} customer(s), ${s.linked.tasks} task(s), ${s.linked.submissions} submission(s)`);
    log(`  steps given an approval setting : ${s.needsFlag}`);
    log(`  old submissions marked "auto"   : ${s.noApproval}`);
    flagged += s.needsFlag;
  }

  if (flagged > 0) {
    log("\n" + "!".repeat(68));
    log(`READ THIS: ${flagged} existing step(s) now REQUIRE APPROVAL.`);
    log("");
    log("Until today a submission completed a step the moment the employee");
    log("pressed Submit. From now on it waits for somebody with the approver");
    log("role in the sales department to accept it, and the customer does not");
    log("move until they do.");
    log("");
    log("Make sure somebody actually holds that role before the team goes out,");
    log("or the first day's work will sit in a queue nobody can clear.");
    log("");
    log("Any step that should keep the old behaviour can be switched back");
    log("individually from Sales → Configuration → the scheme → the step →");
    log('"Needs approval". No deploy required.');
    log("!".repeat(68));
  }

  log(`\n${DRY ? "Dry run complete — nothing was written." : "Migration complete."}\n`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("\nMigration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
