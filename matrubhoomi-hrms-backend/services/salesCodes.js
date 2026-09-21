// services/salesCodes.js
//
// Human-quotable identifiers: LEAD-000431, TSK-001204, SR-000087.
//
// WHY NOT A COUNTER COLLECTION
// ----------------------------
// The obvious implementation — a `counters` document incremented with
// findOneAndUpdate — is correct and is what most projects reach for. It is not
// used here for one reason: this deployment runs a single API process against a
// single database, and adding a second collection whose loss silently restarts
// numbering at 1 (overwriting a live LEAD-000001) is a worse failure than the
// one it prevents.
//
// Instead the next number is read from the highest code that exists, inside a
// retry loop against the unique index. Two simultaneous creations race, one
// loses on the index, and it retries with the next number. That is slower under
// contention and completely safe under it — and a field team creates leads at
// human speed, not machine speed.

"use strict";

const PREFIXES = {
  lead: "LEAD",
  task: "TSK",
  service: "SR",
};

/** Highest numeric suffix currently stored for this prefix, or 0. */
async function highest(Model, prefix) {
  const row = await Model.findOne({ code: new RegExp(`^${prefix}-\\d+$`) })
    .sort({ code: -1 })
    .select("code")
    .lean();
  if (!row?.code) return 0;
  const n = parseInt(String(row.code).split("-")[1], 10);
  return Number.isFinite(n) ? n : 0;
}

function format(prefix, n) {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

/**
 * Create `doc` with the next code for its kind, retrying past collisions.
 *
 * Takes the whole creation rather than just handing back a string, because a
 * code allocated and then not used leaves a permanent gap — and a gap in a
 * sequence people read out loud is a question somebody has to answer.
 */
async function createWithCode(Model, kind, doc, { attempts = 5 } = {}) {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown code kind: ${kind}`);

  let next = (await highest(Model, prefix)) + 1;

  for (let i = 0; i < attempts; i++) {
    try {
      return await Model.create({ ...doc, code: format(prefix, next) });
    } catch (err) {
      // 11000 is the unique index rejecting a code somebody else just took.
      // Anything else is a real failure and belongs to the caller.
      if (err?.code !== 11000) throw err;
      next += 1;
    }
  }

  throw new Error(
    `Could not allocate a ${prefix} code after ${attempts} attempts — ` +
      "something is creating rows far faster than expected.",
  );
}

module.exports = { createWithCode, PREFIXES };
