"use strict";
// scripts/fixEmployeeUniqueIndexes.js
//
// Put the uniqueness back on the employee identities.
//
// WHY THIS IS NEEDED AT ALL
// -------------------------
// models/Employee.js declared each of these indexes TWICE — once on the path
// (`sparse: true`) and once with schema.index({...}, { unique: true, sparse:
// true }). MongoDB keeps the first definition it is handed for a given key and
// ignores the second, so what actually exists in every database built from that
// model is a NON-unique index. The model has been corrected, but a correction
// in the schema cannot change an index that already exists: Mongoose will not
// drop and rebuild one, and would log an options conflict if it tried.
//
// So this script does it, in the only order that is safe:
//
//   1. REPORT the duplicates first, and refuse to touch anything if there are
//      any. A unique build on a collection that already holds duplicates fails
//      halfway and tells you very little about which rows were at fault.
//   2. Drop the old index, create the correct one.
//
// Nothing is deleted, ever. Cleaning up a duplicate is a decision about two
// real people and belongs to HR, not to a script.
//
//   node scripts/fixEmployeeUniqueIndexes.js                 # report only
//   node scripts/fixEmployeeUniqueIndexes.js --apply         # rebuild indexes
//
// Reads MONGODB_URI from the environment like everything else. RUN THE REPORT
// AGAINST PRODUCTION FIRST — it only reads.

require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

// path → the index that should exist for it
const TARGETS = [
  { path: "email", name: "email_1", spec: { email: 1 }, options: { unique: true, sparse: true } },
  { path: "biometricId", name: "biometricId_1", spec: { biometricId: 1 }, options: { unique: true, sparse: true } },
  { path: "identityId", name: "identityId_1", spec: { identityId: 1 }, options: { unique: true, sparse: true } },
  {
    path: "phone",
    name: "phone_1",
    spec: { phone: 1 },
    options: { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } },
  },
];

async function duplicatesFor(col, path) {
  return col
    .aggregate([
      { $match: { [path]: { $type: "string", $gt: "" } } },
      { $group: { _id: `$${path}`, n: { $sum: 1 }, who: { $push: { _id: "$_id", name: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] } } } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("employees");
  console.log(`Connected to ${mongoose.connection.name}\n`);

  const existing = await col.indexes();
  console.log("Indexes as they stand:");
  for (const t of TARGETS) {
    const found = existing.find((i) => i.name === t.name);
    console.log(
      `  ${t.path.padEnd(12)} ${found ? `${found.unique ? "UNIQUE" : "NOT UNIQUE"}${found.sparse ? " sparse" : ""}${found.partialFilterExpression ? " partial" : ""}` : "no index"}`,
    );
  }

  console.log("\nDuplicates already in the data:");
  let blocked = false;
  for (const t of TARGETS) {
    const dupes = await duplicatesFor(col, t.path);
    if (!dupes.length) {
      console.log(`  ${t.path.padEnd(12)} none`);
      continue;
    }
    blocked = true;
    console.log(`  ${t.path.padEnd(12)} ${dupes.length} value(s) held by more than one employee:`);
    for (const d of dupes.slice(0, 20)) {
      console.log(`      "${d._id}" → ${d.who.map((w) => `${w.name.trim() || "(no name)"} [${w._id}]`).join(", ")}`);
    }
    if (dupes.length > 20) console.log(`      …and ${dupes.length - 20} more`);
  }

  if (blocked) {
    console.log(
      "\nRESOLVE THOSE FIRST. Each one is two records claiming one identity — decide\n" +
        "which employee keeps it (HR's call, not this script's), clear the other, then\n" +
        "run this again. Nothing has been changed.",
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  if (!APPLY) {
    console.log("\nNo duplicates. Re-run with --apply to rebuild the indexes.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("\nRebuilding:");
  for (const t of TARGETS) {
    const found = existing.find((i) => i.name === t.name);
    const alreadyRight =
      found &&
      Boolean(found.unique) === true &&
      Boolean(found.sparse) === Boolean(t.options.sparse) &&
      Boolean(found.partialFilterExpression) === Boolean(t.options.partialFilterExpression);

    if (alreadyRight) {
      console.log(`  ${t.path.padEnd(12)} already correct`);
      continue;
    }
    if (found) {
      await col.dropIndex(t.name);
      console.log(`  ${t.path.padEnd(12)} dropped ${t.name}`);
    }
    await col.createIndex(t.spec, { name: t.name, ...t.options });
    console.log(`  ${t.path.padEnd(12)} created ${t.name} (unique)`);
  }

  console.log("\nDone. Verify with: db.employees.getIndexes()");
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
